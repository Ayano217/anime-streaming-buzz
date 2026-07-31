// ═══════════════════════════════════════════════════════════════
// AniTube Buzz — Multi-Platform Social Feed API
// Path: src/pages/api/social-feed.ts
//
// AGGRESSIVE FETCH from all platforms:
// - YouTube (official channels + search)
// - Dailymotion (public API)
// - Bilibili (public search — donghua king)
// - Rumble (RSS + search scraping)
// - Odysee (public API)
// ═══════════════════════════════════════════════════════════════

export const prerender = false;

import type { APIRoute } from 'astro';

const CACHE: Record<string, { data: any; time: number }> = {};
const CACHE_TTL = 10 * 60 * 1000; // 10 min

// ═══ OFFICIAL YOUTUBE CHANNELS ═══
const YOUTUBE_CHANNELS = {
  anime: [
    { name: 'Muse Asia', id: 'UCxxnxya_32jcKj4yN1_kD7A' },
    { name: 'Ani-One Asia', id: 'UC0wNSTMWIL3qaorLx0jie6A' },
    { name: 'Muse Communication', id: 'UCriMYznKZuGjhwhcJf2FyyA' },
    { name: 'Medialink', id: 'UCMj2mTVvC1u2yUUoRXvLDCg' },
  ],
  kdrama: [
    { name: 'KOCOWA TV', id: 'UCbfCJov7NKI9Xa2VBpQTLLA' },
    { name: 'Viki', id: 'UCXtvsWkoK-YbcgH14LDcxKw' },
  ],
  donghua: [
    { name: 'Bilibili Chinese Anime', id: 'UCoENhZmFbnAvXwABQYNiE7Q' },
    { name: 'Donghua World', id: 'UCXQOKGRyqBGSm3aPUXFPnRw' },
  ],
  movies: [
    { name: 'Well Go USA', id: 'UCXPzcmJhcgLCiVpg8xVpXKw' },
    { name: 'GKIDS Films', id: 'UCiEnzKuiT35OeaMLoi1FZLw' },
  ],
};

// ═══ SEARCH QUERIES ═══
const SEARCH_QUERIES = {
  anime: [
    'anime full episode english sub',
    'new anime 2026 full',
    'anime english dub full',
    'anime episode full',
  ],
  kdrama: [
    'korean drama full episode english',
    'kdrama new 2026 full',
    'k-drama english sub full',
    'korean series full episode',
  ],
  donghua: [
    'donghua full episode english',
    'chinese anime full 2026',
    'donghua english sub',
    'chinese animation full',
  ],
  movies: [
    'anime movie full english',
    'korean movie full english',
    'chinese movie english sub',
    'asian movie 2026 full',
  ],
};

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
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim().slice(0, 80);
}

function isFullContent(title: string): boolean {
  const t = title.toLowerCase();
  const badSignals = [
    'trailer', 'preview', 'reaction', 'review', 'analysis', 'explained',
    'top 10', 'ranked', ' amv ', ' edit ', 'compilation', 'moments',
    'best scene', 'shorts', 'tiktok', 'meme', 'funny moments',
    'recap', 'in 5 minutes', 'in 10 minutes',
    'behind the scenes', 'making of',
  ];
  const hasBad = badSignals.some(sig => t.includes(sig));
  if (hasBad) return false;
  return true; // Be permissive — reject only obvious junk
}

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

// ═══ YOUTUBE ═══
async function fetchYouTubeChannelUploads(channelId: string, channelName: string, contentType: string, apiKey: string): Promise<any[]> {
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
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || '',
        publishedAt,
        type: contentType,
        embedUrl: `https://www.youtube.com/embed/${item.id.videoId}?rel=0&modestbranding=1`,
        source: 'youtube',
        slug: slugify(title),
        episodeNumber: extractEpNumber(title),
        isNew: daysSincePublish <= 7,
        videoId: item.id.videoId,
        isOfficial: true,
      };
    }).filter((v: any) => isFullContent(v.title));
  } catch (e) {
    console.warn(`[YT ${channelName}]`, e);
    return [];
  }
}

async function searchYouTube(query: string, contentType: string, apiKey: string): Promise<any[]> {
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
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || '',
        publishedAt,
        type: contentType,
        embedUrl: `https://www.youtube.com/embed/${item.id.videoId}?rel=0&modestbranding=1`,
        source: 'youtube',
        slug: slugify(title),
        episodeNumber: extractEpNumber(title),
        isNew: daysSincePublish <= 7,
        videoId: item.id.videoId,
        isOfficial: false,
      };
    }).filter((v: any) => isFullContent(v.title));
  } catch (e) {
    console.warn(`[YT Search]`, e);
    return [];
  }
}

// ═══ DAILYMOTION ═══
async function searchDailymotion(query: string, contentType: string): Promise<any[]> {
  try {
    const url = `https://api.dailymotion.com/videos?search=${encodeURIComponent(query)}&sort=recent&limit=25&fields=id,title,thumbnail_720_url,thumbnail_480_url,duration,owner.screenname,created_time,allow_embed`;
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
        return {
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
          isNew: daysSincePublish <= 7,
          videoId: v.id,
          duration: v.duration,
          isOfficial: false,
        };
      }).filter((v: any) => isFullContent(v.title));
  } catch (e) {
    console.warn(`[DM]`, e);
    return [];
  }
}

// ═══ BILIBILI (Donghua/Chinese anime king) ═══
async function searchBilibili(query: string, contentType: string): Promise<any[]> {
  try {
    // Bilibili public search API
    const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(query)}&order=pubdate&page=1&pagesize=20`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.bilibili.com/',
      }
    });
    if (!res.ok) {
      console.warn(`[Bilibili] Status ${res.status}`);
      return [];
    }
    const json: any = await res.json();
    if (!json.data || !json.data.result) return [];
    
    return json.data.result.slice(0, 15).map((v: any) => {
      const title = (v.title || '').replace(/<[^>]+>/g, ''); // Strip HTML tags
      const publishedAt = v.pubdate ? new Date(v.pubdate * 1000).toISOString() : '';
      const daysSincePublish = publishedAt ? (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24) : 999;
      const bvid = v.bvid || '';
      const pic = v.pic ? (v.pic.startsWith('//') ? 'https:' + v.pic : v.pic) : '';
      
      return {
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
        isNew: daysSincePublish <= 7,
        videoId: bvid,
        isOfficial: false,
      };
    }).filter((v: any) => v.videoId);
  } catch (e) {
    console.warn(`[Bilibili]`, e);
    return [];
  }
}

// ═══ ODYSEE ═══
async function searchOdysee(query: string, contentType: string): Promise<any[]> {
  try {
    const url = `https://lighthouse.odysee.com/search?s=${encodeURIComponent(query)}&size=20&from=0&mediaType=video&sort_by=release_time`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const results: any = await res.json();
    if (!Array.isArray(results)) return [];
    
    return results.map((v: any) => {
      const title = v.title || v.name || '';
      const publishedAt = v.release_time ? new Date(v.release_time * 1000).toISOString() : '';
      const daysSincePublish = publishedAt ? (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24) : 999;
      const claimId = v.claimId || v.claim_id;
      const name = v.name;
      if (!claimId || !name) return null;
      
      return {
        id: `ody_${claimId}`,
        title,
        channel: v.channel || 'Odysee',
        thumbnail: v.thumbnail_url || '',
        publishedAt,
        type: contentType,
        embedUrl: `https://odysee.com/$/embed/${name}/${claimId}?autoplay=0`,
        source: 'odysee',
        slug: slugify(title),
        episodeNumber: extractEpNumber(title),
        isNew: daysSincePublish <= 7,
        videoId: claimId,
        isOfficial: false,
      };
    }).filter((v: any) => v && isFullContent(v.title));
  } catch (e) {
    console.warn(`[Odysee]`, e);
    return [];
  }
}

// ═══ RUMBLE (via RSS/scraping) ═══
async function searchRumble(query: string, contentType: string): Promise<any[]> {
  try {
    // Rumble doesn't have a public search API, but we can use their public search HTML
    // We scrape the search page and extract video IDs
    const url = `https://rumble.com/search/video?q=${encodeURIComponent(query)}&sort=recent`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      }
    });
    if (!res.ok) {
      console.warn(`[Rumble] Status ${res.status}`);
      return [];
    }
    const html = await res.text();
    
    // Extract video data from Rumble's HTML
    // Pattern: <a class="videostream__link" href="/v-xxxxx.html">
    const videoPattern = /href="\/(v[a-z0-9]+)-([^"]+)\.html"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*alt="([^"]+)"/gi;
    const results: any[] = [];
    let match;
    let count = 0;
    
    while ((match = videoPattern.exec(html)) !== null && count < 10) {
      const videoId = match[1];
      const slug = match[2];
      const thumbnail = match[3];
      const title = match[4].replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
      
      results.push({
        id: `rmb_${videoId}`,
        title,
        channel: 'Rumble',
        thumbnail: thumbnail.startsWith('//') ? 'https:' + thumbnail : thumbnail,
        publishedAt: '',
        type: contentType,
        embedUrl: `https://rumble.com/embed/${videoId}/?pub=anon`,
        source: 'rumble',
        slug: slugify(title),
        episodeNumber: extractEpNumber(title),
        isNew: false,
        videoId,
        isOfficial: false,
      });
      count++;
    }
    
    return results.filter(v => isFullContent(v.title));
  } catch (e) {
    console.warn(`[Rumble]`, e);
    return [];
  }
}

// ═══ MAIN HANDLER ═══
export const GET: APIRoute = async ({ url, locals }) => {
  const params = url.searchParams;
  const type = params.get('type') || 'all';
  const page = parseInt(params.get('page') || '1') || 1;
  const limit = parseInt(params.get('limit') || '20') || 20;
  const noCache = params.get('nocache') === '1';
  const platforms = (params.get('platforms') || 'all').split(',');
  
  const env = (locals as any)?.runtime?.env || {};
  const YT_KEY = env.YOUTUBE_API_KEY || (globalThis as any).YOUTUBE_API_KEY || '';
  
  const cacheKey = `feed:${type}:${page}:${platforms.join(',')}`;
  if (!noCache) {
    const hit = cached(cacheKey);
    if (hit) return jsonRes({ success: true, source: 'cache', ...hit });
  }
  
  try {
    const allVideos: any[] = [];
    const typesToFetch = type === 'all' 
      ? ['anime', 'kdrama', 'donghua', 'movies']
      : [type];
    
    const usePlatform = (p: string) => platforms.includes('all') || platforms.includes(p);
    
    const promises: Promise<any[]>[] = [];
    
    for (const contentType of typesToFetch) {
      const queries = SEARCH_QUERIES[contentType as keyof typeof SEARCH_QUERIES] || [];
      const query = queries[page % queries.length] || queries[0];
      
      // YouTube: official channels + search
      if (usePlatform('youtube') && YT_KEY) {
        const channels = YOUTUBE_CHANNELS[contentType as keyof typeof YOUTUBE_CHANNELS] || [];
        const chanIdx = (page - 1) % Math.max(1, channels.length);
        if (channels[chanIdx]) {
          promises.push(fetchYouTubeChannelUploads(channels[chanIdx].id, channels[chanIdx].name, contentType, YT_KEY));
        }
        if (query) promises.push(searchYouTube(query, contentType, YT_KEY));
      }
      
      // Dailymotion (always — no key needed)
      if (usePlatform('dailymotion') && query) {
        promises.push(searchDailymotion(query, contentType));
      }
      
      // Bilibili (best for donghua/anime)
      if (usePlatform('bilibili') && (contentType === 'donghua' || contentType === 'anime' || contentType === 'movies')) {
        if (query) promises.push(searchBilibili(query, contentType));
      }
      
      // Odysee
      if (usePlatform('odysee') && query) {
        promises.push(searchOdysee(query, contentType));
      }
      
      // Rumble
      if (usePlatform('rumble') && query) {
        promises.push(searchRumble(query, contentType));
      }
    }
    
    const results = await Promise.all(promises);
    results.forEach(vids => allVideos.push(...vids));
    
    // Deduplicate
    const seen = new Set<string>();
    const unique = allVideos.filter(v => {
      if (seen.has(v.id)) return false;
      const cleanTitle = v.title.toLowerCase().replace(/[^\w]/g, '').substring(0, 40);
      if (seen.has(cleanTitle)) return false;
      seen.add(v.id);
      seen.add(cleanTitle);
      return true;
    });
    
    // Sort: official first, then by date
    unique.sort((a, b) => {
      if (a.isOfficial !== b.isOfficial) return a.isOfficial ? -1 : 1;
      const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return db - da;
    });
    
    const offset = (page - 1) * limit;
    const paginated = unique.slice(offset, offset + limit);
    
    // Platform stats
    const platformStats: Record<string, number> = {};
    unique.forEach(v => {
      platformStats[v.source] = (platformStats[v.source] || 0) + 1;
    });
    
    const result = {
      videos: paginated,
      total: unique.length,
      hasNext: offset + limit < unique.length,
      page,
      type,
      platforms: platformStats,
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
