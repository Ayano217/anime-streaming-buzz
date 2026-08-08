// ═══════════════════════════════════════════════════════════════
// AniTube Buzz — Multi-Platform Social Feed API v4
// Path: src/pages/api/social-feed.ts
//
// v4 CHANGES (from v3):
// - ✅ NEW: ?mode=episodes&anime=xxx → smart episode search (multi-platform, sorted)
// - ✅ Strict title matching (word overlap % based)
// - ✅ Season + Episode number extraction
// - ✅ Sorted: Season 1 Ep 1-N → Season 2 Ep 1-N
// - ✅ Dedupe by (season, episode) — keep best quality
// - ✅ All v3 features preserved
// ═══════════════════════════════════════════════════════════════

export const prerender = false;

import type { APIRoute } from 'astro';

const CACHE: Record<string, { data: any; time: number }> = {};
const CACHE_TTL = 10 * 60 * 1000;

// ═══ OFFICIAL YOUTUBE CHANNELS ═══
const YOUTUBE_CHANNELS = {
  anime: [
    { name: 'Muse Asia', id: 'UCxxnxya_32jcKj4yN1_kD7A', priority: 100 },
    { name: 'Ani-One Asia', id: 'UC0wNSTMWIL3qaorLx0jie6A', priority: 95 },
    { name: 'Muse Communication', id: 'UCriMYznKZuGjhwhcJf2FyyA', priority: 90 },
    { name: 'Medialink', id: 'UCMj2mTVvC1u2yUUoRXvLDCg', priority: 85 },
  ],
  kdrama: [
    { name: 'KOCOWA TV', id: 'UCbfCJov7NKI9Xa2VBpQTLLA', priority: 100 },
    { name: 'Viki', id: 'UCXtvsWkoK-YbcgH14LDcxKw', priority: 95 },
  ],
  donghua: [
    { name: 'Bilibili Chinese Anime', id: 'UCoENhZmFbnAvXwABQYNiE7Q', priority: 100 },
    { name: 'Donghua World', id: 'UCXQOKGRyqBGSm3aPUXFPnRw', priority: 90 },
  ],
  movies: [
    { name: 'Well Go USA', id: 'UCXPzcmJhcgLCiVpg8xVpXKw', priority: 100 },
    { name: 'GKIDS Films', id: 'UCiEnzKuiT35OeaMLoi1FZLw', priority: 95 },
  ],
};

const SEARCH_QUERIES = {
  anime: [
    'anime full episode english sub',
    'anime english dub full episode',
    'new anime 2026 english sub',
    'anime episode 1 english sub HD',
    'popular anime english dubbed full',
    'trending anime english sub 2026',
  ],
  kdrama: [
    'korean drama full episode english sub',
    'kdrama new 2026 english sub',
    'k-drama english subtitles full',
    'korean series full episode english',
    'popular kdrama english sub 2026',
    'romantic kdrama english sub full',
  ],
  donghua: [
    'donghua full episode english sub',
    'chinese anime english sub 2026',
    'donghua english subtitles HD',
    'chinese animation english dub',
    'popular donghua english sub',
    'cultivation donghua english sub',
  ],
  movies: [
    'anime movie full english dub',
    'korean movie full english sub',
    'chinese movie english sub HD',
    'asian movie 2026 english',
    'popular anime movie english',
    'action asian movie english sub',
  ],
};

const ENGLISH_KEYWORDS = [
  'english sub', 'eng sub', 'english subtitles', 'english subbed',
  'english dub', 'eng dub', 'english dubbed', 'dubbed',
  'sub eng', 'subs english', '[eng]', '(eng)', 'english',
];

const SPAM_CHANNEL_PATTERNS = [
  /ranma\d+/i,
  /ep\d+anime/i,
  /kids\s*channel/i,
  /nursery\s*rhymes/i,
];

// ═══ HELPERS ═══
function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=600, stale-while-revalidate=1200',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function cached(key: string): any | null {
  const c = CACHE[key];
  if (c && Date.now() - c.time < CACHE_TTL) return c.data;
  return null;
}

function setCache(key: string, data: any) {
  CACHE[key] = { data, time: Date.now() };
  const keys = Object.keys(CACHE);
  if (keys.length > 50) {
    const sorted = Object.entries(CACHE).sort((a, b) => a[1].time - b[1].time);
    sorted.slice(0, 20).forEach(([k]) => delete CACHE[k]);
  }
}

function slugify(text: string): string {
  return text.toLowerCase()
    .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')
    .replace(/-+/g, '-').trim().slice(0, 80);
}

function isFullContent(title: string, allowShorts = false): boolean {
  const t = title.toLowerCase();
  if (allowShorts && /shorts?|#shorts?/i.test(t)) return true;
  const badSignals = [
    'trailer', 'preview', 'reaction', 'review', 'analysis', 'explained',
    'top 10', 'ranked', ' amv ', ' edit ', 'compilation',
    'best scene', 'shorts', 'tiktok', 'meme',
    'recap', 'in 5 minutes', 'in 10 minutes',
    'behind the scenes', 'making of',
  ];
  return !badSignals.some(sig => t.includes(sig));
}

function isSpamChannel(channelName: string): boolean {
  return SPAM_CHANNEL_PATTERNS.some(p => p.test(channelName || ''));
}

// ═══ Extract episode number ═══
function extractEpNumber(title: string): number | null {
  const patterns = [
    /episode[\s._-]*(\d+)/i,
    /\bep[\s._-]*(\d+)\b/i,
    /\bE(\d{1,3})\b/,
    /\s-\s*(\d+)\s*(?:\[|\(|$)/,
    /第\s*(\d+)\s*[话集話]/,
  ];
  for (const p of patterns) {
    const m = title.match(p);
    if (m) {
      const n = parseInt(m[1]);
      if (n > 0 && n < 2000) return n;
    }
  }
  return null;
}

// ═══ Extract season number ═══
function extractSeasonNumber(title: string): number {
  const patterns = [
    /season[\s._-]*(\d+)/i,
    /\bS(\d+)E\d+/i,
    /\bS(\d+)\b/i,
    /第\s*(\d+)\s*季/,
  ];
  for (const p of patterns) {
    const m = title.match(p);
    if (m) {
      const n = parseInt(m[1]);
      if (n > 0 && n < 20) return n;
    }
  }
  return 1;
}

function extractSeriesName(title: string): string {
  let t = title.toLowerCase();
  t = t.replace(/\bep(?:isode)?\s*\d+.*/i, '');
  t = t.replace(/\bseason\s*\d+.*/i, '');
  t = t.replace(/\bs\d+e\d+.*/i, '');
  t = t.replace(/\b\d+\s*(?:sub|dub|eng|hd|full).*/i, '');
  t = t.replace(/\[[^\]]*\]/g, '');
  t = t.replace(/\([^)]*\)/g, '');
  t = t.replace(/[^\w\s]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t.slice(0, 40);
}

// ═══ Normalize anime name for matching ═══
function normalizeAnimeName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 2 && !['the', 'and', 'season', 'episode', 'part', 'anime'].includes(w));
}

// ═══ Match score: how well does title match anime name (0-1) ═══
function matchScore(title: string, animeWords: string[]): number {
  if (animeWords.length === 0) return 0;
  const titleLower = title.toLowerCase();
  let matched = 0;
  for (const word of animeWords) {
    if (titleLower.includes(word)) matched++;
  }
  return matched / animeWords.length;
}

// ═══ Score calc ═══
function calculateScore(video: any, channelPriority = 0): number {
  let score = 0;
  const title = (video.title || '').toLowerCase();
  const hasEnglish = ENGLISH_KEYWORDS.some(kw => title.includes(kw));
  if (hasEnglish) score += 40;
  if (video.isOfficial) score += 30;
  score += channelPriority;
  if (video.isNew) score += 20;
  if (video.publishedAt) {
    const days = (Date.now() - new Date(video.publishedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (days < 7) score += 15;
    else if (days < 30) score += 8;
  }
  if (isSpamChannel(video.channel)) score -= 50;
  score += Math.random() * 5;
  return score;
}

// ═══════════════════════════════════════════════
// 🎬 YOUTUBE
// ═══════════════════════════════════════════════
async function fetchYouTubeChannelUploads(channelId: string, channelName: string, contentType: string, apiKey: string, priority = 0): Promise<any[]> {
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&maxResults=10&type=video&videoEmbeddable=true&videoDuration=long&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json: any = await res.json();
    if (!json.items) return [];
    return json.items.map((item: any) => {
      const title = item.snippet.title || '';
      const publishedAt = item.snippet.publishedAt || '';
      const daysSincePublish = (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24);
      const video = {
        id: `yt_${item.id.videoId}`,
        title,
        channel: channelName,
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || '',
        publishedAt,
        type: contentType,
        embedUrl: `https://www.youtube.com/embed/${item.id.videoId}?rel=0&modestbranding=1`,
        source: 'youtube',
        slug: slugify(title),
        episodeNumber: extractEpNumber(title),
        seasonNumber: extractSeasonNumber(title),
        isNew: daysSincePublish <= 7,
        videoId: item.id.videoId,
        isOfficial: true,
        aspect: 'landscape',
        description: (item.snippet.description || '').slice(0, 300),
        seriesName: extractSeriesName(title),
      };
      (video as any).__score = calculateScore(video, priority);
      return video;
    }).filter((v: any) => isFullContent(v.title));
  } catch (e) {
    return [];
  }
}

async function searchYouTube(query: string, contentType: string, apiKey: string): Promise<any[]> {
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&order=relevance&maxResults=20&type=video&videoEmbeddable=true&videoSyndicated=true&videoDuration=medium&safeSearch=moderate&relevanceLanguage=en&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json: any = await res.json();
    if (!json.items) return [];
    return json.items.map((item: any) => {
      const title = item.snippet.title || '';
      const publishedAt = item.snippet.publishedAt || '';
      const daysSincePublish = (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24);
      const video = {
        id: `yt_${item.id.videoId}`,
        title,
        channel: item.snippet.channelTitle || 'Unknown',
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || '',
        publishedAt,
        type: contentType,
        embedUrl: `https://www.youtube.com/embed/${item.id.videoId}?rel=0&modestbranding=1`,
        source: 'youtube',
        slug: slugify(title),
        episodeNumber: extractEpNumber(title),
        seasonNumber: extractSeasonNumber(title),
        isNew: daysSincePublish <= 7,
        videoId: item.id.videoId,
        isOfficial: false,
        aspect: 'landscape',
        description: (item.snippet.description || '').slice(0, 300),
        seriesName: extractSeriesName(title),
      };
      (video as any).__score = calculateScore(video, 0);
      return video;
    }).filter((v: any) => isFullContent(v.title));
  } catch (e) {
    return [];
  }
}

async function searchYouTubeSeries(seriesName: string, apiKey: string): Promise<any[]> {
  try {
    const query = seriesName + ' episode english sub';
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&order=date&maxResults=20&type=video&videoEmbeddable=true&videoDuration=medium&relevanceLanguage=en&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json: any = await res.json();
    if (!json.items) return [];
    return json.items.map((item: any) => {
      const title = item.snippet.title || '';
      const publishedAt = item.snippet.publishedAt || '';
      const daysSincePublish = (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24);
      return {
        id: `yt_${item.id.videoId}`,
        title,
        channel: item.snippet.channelTitle || 'Unknown',
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || '',
        publishedAt,
        type: 'anime',
        embedUrl: `https://www.youtube.com/embed/${item.id.videoId}?rel=0&modestbranding=1`,
        source: 'youtube',
        slug: slugify(title),
        episodeNumber: extractEpNumber(title),
        seasonNumber: extractSeasonNumber(title),
        isNew: daysSincePublish <= 7,
        videoId: item.id.videoId,
        aspect: 'landscape',
        seriesName: extractSeriesName(title),
        isRelated: true,
      };
    });
  } catch (e) {
    return [];
  }
}

// ═══ Episode search: multi-query for max coverage ═══
async function searchYouTubeEpisodes(animeName: string, apiKey: string): Promise<any[]> {
  const queries = [
    `${animeName} episode 1 english sub`,
    `${animeName} full episode english`,
    `${animeName} all episodes english sub`,
    `${animeName} anime english dub`,
  ];
  const all: any[] = [];
  for (const q of queries) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&order=relevance&maxResults=25&type=video&videoEmbeddable=true&videoDuration=medium&relevanceLanguage=en&key=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const json: any = await res.json();
      if (!json.items) continue;
      for (const item of json.items) {
        const title = item.snippet.title || '';
        const publishedAt = item.snippet.publishedAt || '';
        all.push({
          id: `yt_${item.id.videoId}`,
          title,
          channel: item.snippet.channelTitle || 'Unknown',
          thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || '',
          publishedAt,
          type: 'anime',
          embedUrl: `https://www.youtube.com/embed/${item.id.videoId}?rel=0&modestbranding=1`,
          source: 'youtube',
          videoId: item.id.videoId,
          episodeNumber: extractEpNumber(title),
          seasonNumber: extractSeasonNumber(title),
          aspect: 'landscape',
          description: (item.snippet.description || '').slice(0, 200),
        });
      }
    } catch (e) {}
  }
  return all;
}

// ═══════════════════════════════════════════════
// 🎥 DAILYMOTION
// ═══════════════════════════════════════════════
async function searchDailymotion(query: string, contentType: string): Promise<any[]> {
  try {
    const url = `https://api.dailymotion.com/videos?search=${encodeURIComponent(query)}&sort=recent&limit=25&fields=id,title,thumbnail_720_url,thumbnail_480_url,duration,owner.screenname,created_time,allow_embed,aspect_ratio`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json: any = await res.json();
    if (!json.list) return [];
    return json.list
      .filter((v: any) => v.allow_embed !== false && v.duration > 300)
      .map((v: any) => {
        const title = v.title || '';
        const publishedAt = v.created_time ? new Date(v.created_time * 1000).toISOString() : '';
        const daysSincePublish = publishedAt ? (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24) : 999;
        const ratio = v.aspect_ratio || 1.777;
        const aspect = ratio < 1 ? 'portrait' : 'landscape';
        const video = {
          id: `dm_${v.id}`,
          title,
          channel: v['owner.screenname'] || 'Dailymotion',
          thumbnail: v.thumbnail_720_url || v.thumbnail_480_url || '',
          publishedAt,
          type: contentType,
          embedUrl: `https://www.dailymotion.com/embed/video/${v.id}?queue-enable=false`,
          source: 'dailymotion',
          slug: slugify(title),
          episodeNumber: extractEpNumber(title),
          seasonNumber: extractSeasonNumber(title),
          isNew: daysSincePublish <= 7,
          videoId: v.id,
          duration: v.duration,
          isOfficial: false,
          aspect,
          seriesName: extractSeriesName(title),
        };
        (video as any).__score = calculateScore(video, 0);
        return video;
      }).filter((v: any) => isFullContent(v.title));
  } catch (e) {
    return [];
  }
}

async function searchDailymotionSeries(seriesName: string): Promise<any[]> {
  try {
    const url = `https://api.dailymotion.com/videos?search=${encodeURIComponent(seriesName)}&sort=recent&limit=15&fields=id,title,thumbnail_720_url,duration,owner.screenname,created_time`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json: any = await res.json();
    if (!json.list) return [];
    return json.list.map((v: any) => {
      const publishedAt = v.created_time ? new Date(v.created_time * 1000).toISOString() : '';
      return {
        id: `dm_${v.id}`,
        title: v.title,
        channel: v['owner.screenname'] || 'Dailymotion',
        thumbnail: v.thumbnail_720_url || '',
        publishedAt,
        type: 'anime',
        embedUrl: `https://www.dailymotion.com/embed/video/${v.id}?queue-enable=false`,
        source: 'dailymotion',
        slug: slugify(v.title),
        episodeNumber: extractEpNumber(v.title),
        seasonNumber: extractSeasonNumber(v.title),
        videoId: v.id,
        aspect: 'landscape',
        seriesName: extractSeriesName(v.title),
        isRelated: true,
      };
    });
  } catch (e) {
    return [];
  }
}

async function searchDailymotionEpisodes(animeName: string): Promise<any[]> {
  const queries = [
    `${animeName} episode english sub`,
    `${animeName} full english`,
  ];
  const all: any[] = [];
  for (const q of queries) {
    try {
      const url = `https://api.dailymotion.com/videos?search=${encodeURIComponent(q)}&sort=recent&limit=30&fields=id,title,thumbnail_720_url,duration,owner.screenname,created_time,allow_embed`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const json: any = await res.json();
      if (!json.list) continue;
      for (const v of json.list) {
        if (v.allow_embed === false || v.duration < 300) continue;
        const publishedAt = v.created_time ? new Date(v.created_time * 1000).toISOString() : '';
        all.push({
          id: `dm_${v.id}`,
          title: v.title || '',
          channel: v['owner.screenname'] || 'Dailymotion',
          thumbnail: v.thumbnail_720_url || '',
          publishedAt,
          type: 'anime',
          embedUrl: `https://www.dailymotion.com/embed/video/${v.id}?queue-enable=false`,
          source: 'dailymotion',
          videoId: v.id,
          episodeNumber: extractEpNumber(v.title || ''),
          seasonNumber: extractSeasonNumber(v.title || ''),
          duration: v.duration,
          aspect: 'landscape',
        });
      }
    } catch (e) {}
  }
  return all;
}

// ═══════════════════════════════════════════════
// 🎭 BILIBILI
// ═══════════════════════════════════════════════
async function searchBilibili(query: string, contentType: string): Promise<any[]> {
  try {
    const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(query)}&order=pubdate&page=1&pagesize=20`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/',
      }
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    if (!json.data || !json.data.result) return [];
    return json.data.result.slice(0, 15).map((v: any) => {
      const title = (v.title || '').replace(/<[^>]+>/g, '');
      const publishedAt = v.pubdate ? new Date(v.pubdate * 1000).toISOString() : '';
      const daysSincePublish = publishedAt ? (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24) : 999;
      const bvid = v.bvid || '';
      const pic = v.pic ? (v.pic.startsWith('//') ? 'https:' + v.pic : v.pic) : '';
      const video = {
        id: `bili_${bvid}`,
        title,
        channel: v.author || 'Bilibili',
        thumbnail: pic,
        publishedAt,
        type: contentType,
        embedUrl: `https://player.bilibili.com/player.html?bvid=${bvid}&high_quality=1&danmaku=0&autoplay=0`,
        source: 'bilibili',
        slug: slugify(title),
        episodeNumber: extractEpNumber(title),
        seasonNumber: extractSeasonNumber(title),
        isNew: daysSincePublish <= 7,
        videoId: bvid,
        isOfficial: false,
        aspect: 'landscape',
        description: (v.description || '').slice(0, 300),
        seriesName: extractSeriesName(title),
      };
      (video as any).__score = calculateScore(video, 0);
      return video;
    }).filter((v: any) => v.videoId);
  } catch (e) {
    return [];
  }
}

async function searchBilibiliEpisodes(animeName: string): Promise<any[]> {
  try {
    const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(animeName + ' episode')}&order=pubdate&page=1&pagesize=30`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/',
      }
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    if (!json.data || !json.data.result) return [];
    return json.data.result.map((v: any) => {
      const title = (v.title || '').replace(/<[^>]+>/g, '');
      const publishedAt = v.pubdate ? new Date(v.pubdate * 1000).toISOString() : '';
      const bvid = v.bvid || '';
      const pic = v.pic ? (v.pic.startsWith('//') ? 'https:' + v.pic : v.pic) : '';
      return {
        id: `bili_${bvid}`,
        title,
        channel: v.author || 'Bilibili',
        thumbnail: pic,
        publishedAt,
        type: 'anime',
        embedUrl: `https://player.bilibili.com/player.html?bvid=${bvid}&high_quality=1&danmaku=0&autoplay=0`,
        source: 'bilibili',
        videoId: bvid,
        episodeNumber: extractEpNumber(title),
        seasonNumber: extractSeasonNumber(title),
        aspect: 'landscape',
      };
    }).filter((v: any) => v.videoId);
  } catch (e) {
    return [];
  }
}

// ═══════════════════════════════════════════════
// 🎌 ANIME DATA
// ═══════════════════════════════════════════════
async function fetchAnimeData(page: number, siteOrigin: string): Promise<any[]> {
  try {
    const url = `${siteOrigin}/api/anime?action=list&category=popular&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data: any = await res.json();
    if (!data.success || !data.anime) return [];
    return data.anime.slice(0, 12).map((a: any) => {
      const video = {
        id: `anime_${a.slug || a.id}`,
        title: a.title || 'Anime',
        channel: 'AniTube Anime',
        thumbnail: a.image || a.poster || '',
        publishedAt: a.startDate || '',
        type: 'anime',
        embedUrl: `/anime/${a.slug || a.id}`,
        source: 'anitube_anime',
        slug: a.slug || slugify(a.title),
        episodeNumber: null,
        isNew: a.status === 'current',
        videoId: a.slug || a.id,
        isOfficial: true,
        aspect: 'landscape',
        isAnimeDetail: true,
        description: a.description || a.synopsis || '',
        score: a.score,
        year: a.year,
        genres: a.genres || [],
        seriesName: extractSeriesName(a.title || ''),
      };
      (video as any).__score = calculateScore(video, 80);
      return video;
    });
  } catch (e) {
    return [];
  }
}

function limitPerChannel(videos: any[], maxPerChannel = 3): any[] {
  const channelCount: Record<string, number> = {};
  return videos.filter(v => {
    const ch = v.channel || 'Unknown';
    channelCount[ch] = (channelCount[ch] || 0) + 1;
    return channelCount[ch] <= maxPerChannel;
  });
}

function balanceTypes(videos: any[]): any[] {
  const byType: Record<string, any[]> = {};
  videos.forEach(v => {
    const t = v.type || 'other';
    if (!byType[t]) byType[t] = [];
    byType[t].push(v);
  });
  Object.keys(byType).forEach(t => {
    byType[t].sort((a, b) => (b.__score || 0) - (a.__score || 0));
  });
  const result: any[] = [];
  const types = Object.keys(byType);
  const maxLen = Math.max(...types.map(t => byType[t].length));
  for (let i = 0; i < maxLen; i++) {
    for (const t of types) {
      if (byType[t][i]) result.push(byType[t][i]);
    }
  }
  return result;
}

// ═══════════════════════════════════════════════
// 🎯 MAIN HANDLER
// ═══════════════════════════════════════════════
export const GET: APIRoute = async ({ url, locals, request }) => {
  const params = url.searchParams;
  const type = params.get('type') || 'all';
  const page = parseInt(params.get('page') || '1') || 1;
  const limit = parseInt(params.get('limit') || '20') || 20;
  const noCache = params.get('nocache') === '1';
  const platforms = (params.get('platforms') || 'all').split(',');
  const format = params.get('format') || 'all';
  const mode = params.get('mode') || '';
  const animeParam = params.get('anime') || '';
  const relatedChannel = params.get('channel') || '';
  const seriesTitle = params.get('series') || '';
  const isRelatedMode = params.get('related') === 'true' || relatedChannel || seriesTitle;

  const env = (locals as any)?.runtime?.env || {};
  const YT_KEY = env.YOUTUBE_API_KEY || (globalThis as any).YOUTUBE_API_KEY || '';
  const siteOrigin = new URL(request.url).origin;

  // ═══ EPISODES MODE (NEW) ═══
  if (mode === 'episodes' && animeParam) {
    const cacheKey = `episodes_v1:${animeParam.toLowerCase()}`;
    if (!noCache) {
      const hit = cached(cacheKey);
      if (hit) return jsonRes({ success: true, source: 'cache', ...hit });
    }

    try {
      const animeWords = normalizeAnimeName(animeParam);
      const promises: Promise<any[]>[] = [];
      if (YT_KEY) promises.push(searchYouTubeEpisodes(animeParam, YT_KEY));
      promises.push(searchDailymotionEpisodes(animeParam));
      promises.push(searchBilibiliEpisodes(animeParam));

      const results = await Promise.all(promises);
      let all: any[] = [];
      results.forEach(vids => all.push(...vids));

      // Filter: must have episode number AND good match score
      const MATCH_THRESHOLD = 0.5;
      all = all.filter(v => {
        if (!isFullContent(v.title)) return false;
        if (isSpamChannel(v.channel)) return false;
        const score = matchScore(v.title, animeWords);
        v.__matchScore = score;
        return score >= MATCH_THRESHOLD;
      });

      // Dedupe by (season, episode) — keep highest match score
      const bestByKey: Record<string, any> = {};
      for (const v of all) {
        const season = v.seasonNumber || 1;
        const ep = v.episodeNumber;
        if (!ep) continue;
        const key = `s${season}_e${ep}`;
        const existing = bestByKey[key];
        if (!existing || (v.__matchScore > existing.__matchScore)) {
          bestByKey[key] = v;
        }
      }

      // Also include videos without episode number IF match is very high (movies, one-shot)
      const noEpVideos = all
        .filter(v => !v.episodeNumber && v.__matchScore >= 0.7)
        .slice(0, 3);

      let episodes = Object.values(bestByKey);
      // Sort by season → episode
      episodes.sort((a: any, b: any) => {
        const sa = a.seasonNumber || 1;
        const sb = b.seasonNumber || 1;
        if (sa !== sb) return sa - sb;
        return (a.episodeNumber || 0) - (b.episodeNumber || 0);
      });

      // Group by season
      const seasonGroups: Record<number, any[]> = {};
      for (const ep of episodes) {
        const s = ep.seasonNumber || 1;
        if (!seasonGroups[s]) seasonGroups[s] = [];
        seasonGroups[s].push(ep);
      }

      // Clean output
      const cleanEpisodes = episodes.map((v: any) => {
        const clean = { ...v };
        delete clean.__matchScore;
        delete clean.__score;
        return clean;
      });

      const seasons = Object.keys(seasonGroups).sort((a, b) => parseInt(a) - parseInt(b)).map(s => ({
        season: parseInt(s),
        count: seasonGroups[parseInt(s)].length,
      }));

      const result = {
        anime: animeParam,
        totalEpisodes: cleanEpisodes.length,
        seasons,
        episodes: cleanEpisodes,
        extras: noEpVideos.map((v: any) => {
          const c = { ...v };
          delete c.__matchScore;
          delete c.__score;
          return c;
        }),
        mode: 'episodes',
      };

      setCache(cacheKey, result);
      return jsonRes({ success: true, ...result });
    } catch (err: any) {
      console.error('[episodes-mode]', err);
      return jsonRes({ success: false, error: err.message, episodes: [] }, 500);
    }
  }

  // ═══ CACHE KEY ═══
  const cacheKey = `feed_v4:${type}:${page}:${platforms.join(',')}:${format}:${relatedChannel}:${seriesTitle}`;
  if (!noCache) {
    const hit = cached(cacheKey);
    if (hit) return jsonRes({ success: true, source: 'cache', ...hit });
  }

  try {
    // ═══ RELATED MODE ═══
    if (isRelatedMode) {
      const relatedVideos: any[] = [];
      const promises: Promise<any[]>[] = [];
      if (seriesTitle) {
        if (YT_KEY) promises.push(searchYouTubeSeries(seriesTitle, YT_KEY));
        promises.push(searchDailymotionSeries(seriesTitle));
      }
      if (relatedChannel && YT_KEY) {
        promises.push(searchYouTube(relatedChannel + ' latest', 'anime', YT_KEY));
      }
      const results = await Promise.all(promises);
      results.forEach(vids => relatedVideos.push(...vids));

      const seen = new Set<string>();
      const unique = relatedVideos.filter(v => {
        if (!v || !v.id || seen.has(v.id)) return false;
        seen.add(v.id);
        return true;
      });

      unique.sort((a, b) => {
        if (a.episodeNumber && b.episodeNumber) return a.episodeNumber - b.episodeNumber;
        const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return db - da;
      });

      const result = {
        videos: unique.slice(0, limit),
        total: unique.length,
        page,
        mode: 'related',
        series: seriesTitle,
        channel: relatedChannel,
      };
      setCache(cacheKey, result);
      return jsonRes({ success: true, ...result });
    }

    // ═══ NORMAL MODE ═══
    const allVideos: any[] = [];
    const typesToFetch = type === 'all'
      ? ['anime', 'kdrama', 'donghua', 'movies']
      : [type];

    const usePlatform = (p: string) => platforms.includes('all') || platforms.includes(p);
    const wantLandscape = format === 'all' || format === 'landscape';

    const promises: Promise<any[]>[] = [];

    if (wantLandscape && usePlatform('anitube_anime') && (type === 'all' || type === 'anime')) {
      promises.push(fetchAnimeData(page, siteOrigin));
    }

    for (const contentType of typesToFetch) {
      const queries = SEARCH_QUERIES[contentType as keyof typeof SEARCH_QUERIES] || [];
      const query = queries[(page - 1) % queries.length] || queries[0];

      if (usePlatform('youtube') && YT_KEY) {
        if (wantLandscape) {
          const channels = YOUTUBE_CHANNELS[contentType as keyof typeof YOUTUBE_CHANNELS] || [];
          for (const ch of channels.slice(0, 2)) {
            promises.push(fetchYouTubeChannelUploads(ch.id, ch.name, contentType, YT_KEY, ch.priority));
          }
          if (query) promises.push(searchYouTube(query, contentType, YT_KEY));
        }
      }

      if (usePlatform('dailymotion') && wantLandscape && query) {
        promises.push(searchDailymotion(query, contentType));
      }

      if (usePlatform('bilibili') && wantLandscape &&
          (contentType === 'donghua' || contentType === 'anime' || contentType === 'movies')) {
        if (query) promises.push(searchBilibili(query, contentType));
      }
    }

    const results = await Promise.all(promises);
    results.forEach(vids => allVideos.push(...vids));

    const seen = new Set<string>();
    let unique = allVideos.filter(v => {
      if (!v || !v.id) return false;
      if (seen.has(v.id)) return false;
      const cleanTitle = v.title.toLowerCase().replace(/[^\w]/g, '').substring(0, 40);
      if (seen.has(cleanTitle)) return false;
      seen.add(v.id);
      seen.add(cleanTitle);
      return true;
    });

    if (format === 'landscape') {
      unique = unique.filter(v => v.aspect === 'landscape');
    } else if (format === 'portrait') {
      unique = unique.filter(v => v.aspect === 'portrait');
    }

    unique = limitPerChannel(unique, 3);
    unique.sort((a: any, b: any) => (b.__score || 0) - (a.__score || 0));

    let filtered = unique;
    if (type === 'all') filtered = balanceTypes(unique);

    filtered = filtered.map((v: any) => {
      const clean = { ...v };
      delete clean.__score;
      return clean;
    });

    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    const platformStats: Record<string, number> = {};
    const aspectStats: Record<string, number> = { landscape: 0, portrait: 0 };
    filtered.forEach(v => {
      platformStats[v.source] = (platformStats[v.source] || 0) + 1;
      if (v.aspect) aspectStats[v.aspect] = (aspectStats[v.aspect] || 0) + 1;
    });

    const result = {
      videos: paginated,
      total: filtered.length,
      hasNext: offset + limit < filtered.length,
      page,
      type,
      format,
      platforms: platformStats,
      aspects: aspectStats,
      source: 'social',
    };

    setCache(cacheKey, result);
    return jsonRes({ success: true, ...result });

  } catch (err: any) {
    console.error('[social-feed]', err);
    return jsonRes({
      success: false,
      error: err.message || 'Unknown error',
      videos: [],
    }, 500);
  }
};
