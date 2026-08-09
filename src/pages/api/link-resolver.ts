import type { APIRoute } from 'astro';

/* ═══════════════════════════════════════════════════════
   🔗 LINK RESOLVER v6.0 — Google Sheets Powered
═══════════════════════════════════════════════════════ */

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR9WiDOa87KY6w5nV5557ikjd8i-dqXhpZpMFRjnZjPJZMEsDfJzQasfyYKqJ7XxtHwIQYAUpuhAuLo/pub?gid=0&single=true&output=csv';

const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 30 * 60 * 1000;

let cachedVideos: any[] | null = null;
let videosCacheExpiry = 0;
const VIDEOS_CACHE_TTL = 5 * 60 * 1000;

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

/* CSV parsing */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseCSV(text: string): any[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  const results: any[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;
    
    const row: any = {};
    headers.forEach((header, idx) => {
      row[header] = (values[idx] || '').trim();
    });
    
    if (!row.FB_ID && !row.Anime_Slug) continue;
    results.push(row);
  }
  
  return results;
}

/* Load videos from Google Sheets */
async function loadVideos(): Promise<any[]> {
  if (cachedVideos && videosCacheExpiry > Date.now()) return cachedVideos;
  
  try {
    const res = await fetch(SHEET_CSV_URL, {
      headers: { 'User-Agent': 'AniTubeBuzz/1.0' }
    });
    
    if (!res.ok) return cachedVideos || [];
    
    const csv = await res.text();
    const rows = parseCSV(csv);
    
    const videos = rows.map(row => {
      const fbLinks = row.FB_ID 
        ? String(row.FB_ID).split(',').map((k: string) => k.trim()).filter(Boolean)
        : [];
      return {
        anime: row.Anime_Slug || '',
        title: row.Anime_Title || row.Anime_Slug || '',
        season: parseInt(row.Season || '1', 10) || 1,
        episode: parseInt(row.Episode || '1', 10) || 1,
        caption: row.Caption || '',
        fbLinks: fbLinks
      };
    }).filter(v => v.anime);
    
    cachedVideos = videos;
    videosCacheExpiry = Date.now() + VIDEOS_CACHE_TTL;
    return videos;
  } catch (e) {
    return cachedVideos || [];
  }
}

/* Find FB video by ID */
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
  
  if (refresh) {
    cachedVideos = null;
    videosCacheExpiry = 0;
    cache.clear();
  }
  
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
  
  // Internal link
  if (targetUrl.startsWith(origin) || targetUrl.startsWith('/')) {
    return json({
      success: true,
      platform: 'internal',
      redirectUrl: targetUrl.replace(origin, ''),
      title: 'Internal link'
    });
  }
  
  // FACEBOOK — check Google Sheets database
  if (platform === 'facebook') {
    const fbId = extractFbId(targetUrl);
    log('FB ID extracted', fbId);
    
    if (fbId) {
      const videos = await loadVideos();
      log('DB loaded', { count: videos.length });
      
      const match = findByFbId(videos, fbId);
      log('Match found', match ? `${match.anime} S${match.season}E${match.episode}` : 'NONE');
      
      if (match) {
        const result = {
          success: true,
          platform: 'facebook',
          title: match.title || match.anime,
          anime: match.anime,
          season: match.season,
          episode: match.episode,
          caption: match.caption,
          confidence: 1.0,
          source: 'google-sheets',
          redirectUrl: `/reels/anime_${match.anime}_ep${match.episode}`
        };
        cache.set(cacheKey, { data: result, expires: Date.now() + CACHE_TTL });
        return json(debug ? { ...result, debug: debugLog } : result);
      }
    }
    
    return json({
      success: false,
      platform: 'facebook',
      error: 'This FB video is not in our database yet',
      hint: 'Ask the admin to add this video',
      videoId: fbId,
      debug: debug ? debugLog : undefined
    }, 200);
  }
  
  // YouTube
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
  
  // Dailymotion
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
  
  // Bilibili
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
