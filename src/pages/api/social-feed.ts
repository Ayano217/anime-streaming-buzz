// ═══════════════════════════════════════════════════════════════
// AniTube Buzz — Social Media Feed API
// Path: src/pages/api/social-feed.ts
// 
// Fetches LATEST full anime, K-drama, donghua, movies from:
// - YouTube (official channels: Muse Asia, Ani-One, KOCOWA, etc.)
// - Dailymotion (public search)
// - Bilibili (donghua public API)
// 
// New uploads = automatic in feed
// Never deletes old — always adds new at top
// ═══════════════════════════════════════════════════════════════

export const prerender = false;

import type { APIRoute } from 'astro';

// ═══ CACHE (in-memory, 15 min) ═══
const CACHE: Record<string, { data: any; time: number }> = {};
const CACHE_TTL = 15 * 60 * 1000;

// ═══ OFFICIAL CHANNELS THAT UPLOAD FULL CONTENT ═══
// These are LEGAL sources — they upload full episodes/movies
const CHANNELS = {
  // ═══ ANIME (Official English-subbed) ═══
  anime: [
    { name: 'Muse Asia', id: 'UCxxnxya_32jcKj4yN1_kD7A', type: 'anime' },      // Official anime SEA
    { name: 'Ani-One Asia', id: 'UC0wNSTMWIL3qaorLx0jie6A', type: 'anime' },  // Official anime
    { name: 'Anime-One', id: 'UCVvR8p6JcO5R__RgKG7CNjw', type: 'anime' },
    { name: 'Aniplex Channel', id: 'UCF0iH-Yb15R-9C-JgTZlBUw', type: 'anime' },
    { name: 'Muse Communication', id: 'UCriMYznKZuGjhwhcJf2FyyA', type: 'anime' },
    { name: 'Medialink', id: 'UCMj2mTVvC1u2yUUoRXvLDCg', type: 'anime' },
  ],
  
  // ═══ K-DRAMA (Official) ═══
  kdrama: [
    { name: 'KOCOWA TV', id: 'UCbfCJov7NKI9Xa2VBpQTLLA', type: 'kdrama' },
    { name: 'Viki', id: 'UCXtvsWkoK-YbcgH14LDcxKw', type: 'kdrama' },
    { name: 'K-Content by CJ ENM', id: 'UCPmqkGtqxN5Yss2Vk_5ZDpg', type: 'kdrama' },
  ],
  
  // ═══ DONGHUA (Chinese animation) ═══
  donghua: [
    { name: 'Bilibili Chinese Anime', id: 'UCoENhZmFbnAvXwABQYNiE7Q', type: 'donghua' },
    { name: 'Donghua World', id: 'UCXQOKGRyqBGSm3aPUXFPnRw', type: 'donghua' },
    { name: 'Chinese Anime Fans', id: 'UCEjrxzZjJp7lFxrJ2Y0gnLg', type: 'donghua' },
  ],
  
  // ═══ MOVIES (Anime films, Asian cinema) ═══
  movies: [
    { name: 'Sony Pictures Movies', id: 'UCz97F7dMxBNOfGYu3rx8aCw', type: 'movie' },
    { name: 'Well Go USA', id: 'UCXPzcmJhcgLCiVpg8xVpXKw', type: 'movie' },
    { name: 'GKIDS Films', id: 'UCiEnzKuiT35OeaMLoi1FZLw', type: 'movie' },
  ],
};

// ═══ SEARCH QUERIES FOR EACH TYPE ═══
const SEARCH_QUERIES = {
  anime: [
    'full anime episode english sub 2026',
    'anime full episode',
    'new anime 2026',
    'anime english dub full',
  ],
  kdrama: [
    'korean drama full episode english sub 2026',
    'k-drama full episode',
    'kdrama new 2026',
  ],
  donghua: [
    'donghua full episode english sub 2026',
    'chinese anime full episode',
    'donghua new',
  ],
  movies: [
    'anime movie full english sub 2026',
    'korean movie full english sub 2026',
    'asian movie 2026',
  ],
};

// ═══ HELPERS ═══

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=900, stale-while-revalidate=1800',
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
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim().slice(0, 80);
}

// Detect if title indicates it's a FULL episode/movie (not clip/trailer/review)
function isFullContent(title: string): boolean {
  const t = title.toLowerCase();
  
  // Positive signals (full content)
  const goodSignals = [
    'full episode', 'full ep', 'episode 1', 'episode 2', 'episode 3',
    'full movie', 'full film', 'complete', 'english sub', 'eng sub',
    'english dub', 'sub indo', 'season', 'ep 1', 'ep 2', '\\bep\\d',
  ];
  
  // Negative signals (clip/junk)
  const badSignals = [
    'trailer', 'preview', 'reaction', 'review', 'analysis', 'explained',
    'top 10', 'ranked', 'amv', 'edit', 'compilation', 'moments',
    'best scene', 'shorts', 'tiktok', 'meme', 'funny moments',
    'recap', 'summary in', 'in 5 minutes', 'in 10 minutes',
  ];
  
  const hasBad = badSignals.some(sig => t.includes(sig));
  if (hasBad) return false;
  
  const hasGood = goodSignals.some(sig => t.includes(sig));
  return hasGood;
}

// Extract episode number if any
function extractEpNumber(title: string): number | null {
  const patterns = [
    /episode[\s.-]*(\d+)/i,
    /\bep[\s.-]*(\d+)\b/i,
    /\bE(\d+)\b/,
  ];
  for (const p of patterns) {
    const m = title.match(p);
    if (m) return parseInt(m[1]);
  }
  return null;
}

// ═══ YOUTUBE FETCH ═══

interface YouTubeVideo {
  id: string;
  title: string;
  channel: string;
  channelId: string;
  thumbnail: string;
  publishedAt: string;
  description: string;
  type: string;
  embedUrl: string;
  source: string;
  slug: string;
  episodeNumber: number | null;
  isNew: boolean;
}

async function fetchYouTubeChannelUploads(channelId: string, channelName: string, contentType: string, apiKey: string): Promise<YouTubeVideo[]> {
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&maxResults=10&type=video&videoEmbeddable=true&key=${apiKey}`;
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
        channel: channelName,
        channelId: item.snippet.channelId,
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || '',
        publishedAt,
        description: item.snippet.description || '',
        type: contentType,
        embedUrl: `https://www.youtube.com/embed/${item.id.videoId}?rel=0&modestbranding=1`,
        source: 'youtube',
        slug: slugify(title),
        episodeNumber: extractEpNumber(title),
        isNew: daysSincePublish <= 7,
        videoId: item.id.videoId,
      };
    }).filter((v: any) => isFullContent(v.title));
  } catch (e) {
    console.warn(`[YT ${channelName}] Error:`, e);
    return [];
  }
}

async function searchYouTube(query: string, contentType: string, apiKey: string): Promise<YouTubeVideo[]> {
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&order=date&maxResults=15&type=video&videoEmbeddable=true&videoSyndicated=true&safeSearch=moderate&key=${apiKey}`;
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
        channelId: item.snippet.channelId,
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || '',
        publishedAt,
        description: item.snippet.description || '',
        type: contentType,
        embedUrl: `https://www.youtube.com/embed/${item.id.videoId}?rel=0&modestbranding=1`,
        source: 'youtube',
        slug: slugify(title),
        episodeNumber: extractEpNumber(title),
        isNew: daysSincePublish <= 7,
        videoId: item.id.videoId,
      };
    }).filter((v: any) => isFullContent(v.title));
  } catch (e) {
    console.warn(`[YT Search] Error:`, e);
    return [];
  }
}

// ═══ DAILYMOTION FETCH (No API key needed!) ═══

async function searchDailymotion(query: string, contentType: string): Promise<any[]> {
  try {
    const url = `https://api.dailymotion.com/videos?search=${encodeURIComponent(query)}&sort=recent&limit=15&fields=id,title,thumbnail_720_url,thumbnail_480_url,duration,owner.screenname,views_total,created_time,allow_embed`;
    const res = await fetch(url);
    if (!res.ok) return [];
    
    const json: any = await res.json();
    if (!json.list) return [];
    
    return json.list
      .filter((v: any) => v.allow_embed !== false && v.duration > 600) // Min 10 min = full content
      .map((v: any) => {
        const title = v.title || '';
        const publishedAt = v.created_time ? new Date(v.created_time * 1000).toISOString() : '';
        const daysSincePublish = publishedAt ? (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24) : 999;
        
        return {
          id: `dm_${v.id}`,
          title,
          channel: v['owner.screenname'] || 'Dailymotion',
          channelId: '',
          thumbnail: v.thumbnail_720_url || v.thumbnail_480_url || '',
          publishedAt,
          description: '',
          type: contentType,
          embedUrl: `https://www.dailymotion.com/embed/video/${v.id}?queue-enable=false`,
          source: 'dailymotion',
          slug: slugify(title),
          episodeNumber: extractEpNumber(title),
          isNew: daysSincePublish <= 7,
          videoId: v.id,
          duration: v.duration,
        };
      }).filter((v: any) => isFullContent(v.title));
  } catch (e) {
    console.warn(`[DM Search] Error:`, e);
    return [];
  }
}

// ═══ MAIN HANDLER ═══

export const GET: APIRoute = async ({ url, locals }) => {
  const params = url.searchParams;
  const type = params.get('type') || 'all'; // 'anime', 'kdrama', 'donghua', 'movies', 'all'
  const page = parseInt(params.get('page') || '1') || 1;
  const limit = parseInt(params.get('limit') || '20') || 20;
  const noCache = params.get('nocache') === '1';
  
  const env = (locals as any)?.runtime?.env || {};
  const YT_KEY = env.YOUTUBE_API_KEY || (globalThis as any).YOUTUBE_API_KEY || '';
  
  const cacheKey = `feed:${type}:${page}`;
  if (!noCache) {
    const hit = cached(cacheKey);
    if (hit) return jsonRes({ success: true, source: 'cache', ...hit });
  }
  
  try {
    const allVideos: any[] = [];
    
    // Determine which types to fetch
    const typesToFetch = type === 'all' 
      ? ['anime', 'kdrama', 'donghua', 'movies']
      : [type];
    
    // Parallel fetch from YouTube channels + search
    const promises: Promise<any[]>[] = [];
    
    for (const contentType of typesToFetch) {
      // YouTube: fetch from official channels
      if (YT_KEY && CHANNELS[contentType as keyof typeof CHANNELS]) {
        const channels = CHANNELS[contentType as keyof typeof CHANNELS];
        // Only fetch 2 channels per type per request to save quota
        const channelsToFetch = channels.slice(0, 2);
        for (const ch of channelsToFetch) {
          promises.push(fetchYouTubeChannelUploads(ch.id, ch.name, contentType, YT_KEY));
        }
      }
      
      // YouTube: also search for latest
      if (YT_KEY && SEARCH_QUERIES[contentType as keyof typeof SEARCH_QUERIES]) {
        const queries = SEARCH_QUERIES[contentType as keyof typeof SEARCH_QUERIES];
        const query = queries[page % queries.length]; // Rotate queries per page
        promises.push(searchYouTube(query, contentType, YT_KEY));
      }
      
      // Dailymotion: always fetch (no API key needed)
      if (SEARCH_QUERIES[contentType as keyof typeof SEARCH_QUERIES]) {
        const queries = SEARCH_QUERIES[contentType as keyof typeof SEARCH_QUERIES];
        const query = queries[page % queries.length];
        promises.push(searchDailymotion(query, contentType));
      }
    }
    
    const results = await Promise.all(promises);
    results.forEach(vids => allVideos.push(...vids));
    
    // Deduplicate by video ID
    const seen = new Set<string>();
    const unique = allVideos.filter(v => {
      if (seen.has(v.id)) return false;
      seen.add(v.id);
      return true;
    });
    
    // Sort by publish date (newest first)
    unique.sort((a, b) => {
      const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return db - da;
    });
    
    // Paginate
    const offset = (page - 1) * limit;
    const paginated = unique.slice(offset, offset + limit);
    
    const result = {
      videos: paginated,
      total: unique.length,
      hasNext: offset + limit < unique.length,
      page,
      type,
      source: 'social',
    };
    
    setCache(cacheKey, result);
    return jsonRes({ success: true, ...result });
    
  } catch (err: any) {
    console.error('[social-feed] Error:', err);
    return jsonRes({ 
      success: false, 
      error: err.message || 'Unknown error',
      videos: [],
    }, 500);
  }
};
