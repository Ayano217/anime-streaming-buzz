import type { APIRoute } from 'astro';

/* ═══════════════════════════════════════════════════════
   🔗 LINK RESOLVER v5.0
   
   FLOW:
   1. Check fb-anime.json database (100% accurate for your posts)
   2. YouTube/DM/Bili → direct embed
   3. Anything else → helpful error
═══════════════════════════════════════════════════════ */

const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 30 * 60 * 1000;

let jsonCache: any = null;
let jsonCacheExpiry = 0;

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=1800',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function detectPlatform(url: string): string {
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('dailymotion.com') || u.includes('dai.ly')) return 'dailymotion';
  if (u.includes('bilibili.com') || u.includes('b23.tv')) return 'bilibili';
  if (u.includes('facebook.com') || u.includes('fb.watch') || u.includes('fb.com')) return 'facebook';
  return 'unknown';
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function extractDailymotionId(url: string): string | null {
  const m = url.match(/(?:dailymotion\.com\/(?:video|embed\/video)|dai\.ly)\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

function extractBilibiliId(url: string): string | null {
  const m = url.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

/* Extract FB video ID from any FB URL format */
function extractFbId(url: string): string | null {
  const patterns = [
    /(?:facebook|fb)\.com\/(?:reel|watch|video|videos)\/(\d{10,20})/i,
    /facebook\.com\/share\/[a-z]+\/([a-zA-Z0-9_-]+)/i,
    /fb\.watch\/([a-zA-Z0-9_-]+)/i,
    /[?&]v=(\d{10,20})/i,
    /\/(\d{15,20})\/?(?:\?|$)/i,
    /videos\/(\d{10,20})/i
  ];
  
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/* Load fb-anime.json */
async function loadFbAnimeData(origin: string): Promise<any> {
  if (jsonCache && jsonCacheExpiry > Date.now()) return jsonCache;
  
  try {
    const res = await fetch(`${origin}/fb-anime.json`);
    if (!res.ok) return { videos: [] };
    const data = await res.json();
    jsonCache = data;
    jsonCacheExpiry = Date.now() + CACHE_TTL;
    return data;
  } catch (e) {
    return { videos: [] };
  }
}

/* Find FB video in database by ID */
function findByFbId(videos: any[], fbId: string): any | null {
  if (!fbId || !videos) return null;
  for (const v of videos) {
    if (Array.isArray(v.fbLinks)) {
      for (const id of v.fbLinks) {
        if (String(id).toLowerCase() === String(fbId).toLowerCase()) {
          return v;
        }
      }
    }
  }
  return null;
}

/* ═══ MAIN HANDLER ═══ */

export const GET: APIRoute = async ({ request, url }) => {
  const params = url.searchParams;
  const targetUrl = params.get('url')?.trim();
  const debug = params.get('debug') === '1';
  const refresh = params.get('refresh') === '1';
  
  if (!targetUrl) {
    return json({ success: false, error: 'Missing url parameter' }, 400);
  }
  
  // Cache check
  const cacheKey = targetUrl;
  if (!refresh) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return json({ ...cached.data, cached: true });
    }
  }
  
  const debugLog: any[] = [];
  const log = (msg: string, data?: any) => {
    if (debug) debugLog.push({ msg, data });
  };
  
  const platform = detectPlatform(targetUrl);
  log('Platform', platform);
  
  const origin = new URL(request.url).origin;
  
  // ═══ INTERNAL ═══
  if (targetUrl.startsWith(origin) || targetUrl.startsWith('/')) {
    return json({
      success: true,
      platform: 'internal',
      redirectUrl: targetUrl.replace(origin, ''),
      title: 'Internal link'
    });
  }
  
  // ═══ FACEBOOK — Check database FIRST ═══
  if (platform === 'facebook') {
    const fbId = extractFbId(targetUrl);
    log('FB ID extracted', fbId);
    
    if (fbId) {
      const data = await loadFbAnimeData(origin);
      log('DB loaded', { count: data.videos?.length || 0 });
      
      const match = findByFbId(data.videos || [], fbId);
      log('Match found', match ? `${match.anime} ep ${match.episode}` : 'NONE');
      
      if (match) {
        const result = {
          success: true,
          platform: 'facebook',
          title: match.title || match.anime,
          anime: match.anime,
          episode: match.episode,
          caption: match.caption,
          confidence: 1.0,
          source: 'database',
          redirectUrl: `/reels/anime_${match.anime}_ep${match.episode}`
        };
        cache.set(cacheKey, { data: result, expires: Date.now() + CACHE_TTL });
        return json(debug ? { ...result, debug: debugLog } : result);
      }
    }
    
    // Not found in database
    return json({
      success: false,
      platform: 'facebook',
      error: 'This FB video is not in our database yet',
      hint: 'Try pasting the video caption instead, or contact the admin',
      videoId: fbId,
      debug: debug ? debugLog : undefined
    }, 200);
  }
  
  // ═══ YOUTUBE ═══
  if (platform === 'youtube') {
    const id = extractYouTubeId(targetUrl);
    if (id) {
      const result = {
        success: true,
        platform: 'youtube',
        title: 'YouTube Video',
        redirectUrl: `/reels/yt_${id}`
      };
      cache.set(cacheKey, { data: result, expires: Date.now() + CACHE_TTL });
      return json(debug ? { ...result, debug: debugLog } : result);
    }
  }
  
  // ═══ DAILYMOTION ═══
  if (platform === 'dailymotion') {
    const id = extractDailymotionId(targetUrl);
    if (id) {
      const result = {
        success: true,
        platform: 'dailymotion',
        title: 'Dailymotion Video',
        redirectUrl: `/reels/dm_${id}`
      };
      cache.set(cacheKey, { data: result, expires: Date.now() + CACHE_TTL });
      return json(debug ? { ...result, debug: debugLog } : result);
    }
  }
  
  // ═══ BILIBILI ═══
  if (platform === 'bilibili') {
    const id = extractBilibiliId(targetUrl);
    if (id) {
      const result = {
        success: true,
        platform: 'bilibili',
        title: 'Bilibili Video',
        redirectUrl: `/reels/bili_${id}`
      };
      cache.set(cacheKey, { data: result, expires: Date.now() + CACHE_TTL });
      return json(debug ? { ...result, debug: debugLog } : result);
    }
  }
  
  return json({
    success: false,
    platform: platform,
    error: 'Unsupported link',
    debug: debug ? debugLog : undefined
  }, 400);
};

export const POST: APIRoute = async (ctx) => {
  const body = await ctx.request.json().catch(() => ({})) as any;
  const url = new URL(ctx.request.url);
  url.searchParams.set('url', body.url || '');
  if (body.debug) url.searchParams.set('debug', '1');
  return GET({ ...ctx, url } as any);
};

export const OPTIONS: APIRoute = () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    }
  });
};
