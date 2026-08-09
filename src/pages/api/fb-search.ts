import type { APIRoute } from 'astro';

/* ═══════════════════════════════════════════════════════
   🔍 FB ANIME SEARCH — Searches fb-anime.json
   
   Handles:
   - FB video link (any format)
   - Caption/keyword search (fuzzy)
   - Anime title search
   
   Returns matched anime + episode info
═══════════════════════════════════════════════════════ */

// Cache the JSON in memory (30 min)
let cachedData: any = null;
let cacheExpiry = 0;
const CACHE_TTL = 30 * 60 * 1000;

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

/* Extract FB video ID from any FB URL format */
function extractFbId(input: string): string | null {
  const s = input.trim();
  
  // Direct numeric ID
  if (/^\d{10,20}$/.test(s)) return s;
  
  // Direct alphanumeric code (share links)
  if (/^[a-zA-Z0-9_-]{6,20}$/.test(s) && !s.includes(' ')) return s;
  
  // Various FB URL patterns
  const patterns = [
    /(?:facebook|fb)\.com\/(?:reel|watch|video|videos)\/(\d{10,20})/i,
    /facebook\.com\/share\/[a-z]+\/([a-zA-Z0-9_-]+)/i,
    /fb\.watch\/([a-zA-Z0-9_-]+)/i,
    /[?&]v=(\d{10,20})/i,
    /\/(\d{15,20})\/?(?:\?|$)/i,
    /videos\/(\d{10,20})/i
  ];
  
  for (const p of patterns) {
    const m = s.match(p);
    if (m) return m[1];
  }
  
  return null;
}

/* Normalize text for search */
function normalize(s: string): string {
  return String(s || '').toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Fuzzy score — how well does query match text? */
function fuzzyScore(text: string, query: string): number {
  const t = normalize(text);
  const q = normalize(query);
  
  if (!t || !q) return 0;
  if (t === q) return 100;
  if (t.includes(q)) return 90;
  
  // Word-level matching
  const qWords = q.split(' ').filter(w => w.length >= 2);
  const tWords = t.split(' ');
  
  let matchCount = 0;
  let totalWords = qWords.length;
  
  for (const qw of qWords) {
    for (const tw of tWords) {
      if (tw === qw) { matchCount += 1; break; }
      if (tw.startsWith(qw) || qw.startsWith(tw)) { matchCount += 0.7; break; }
      if (qw.length >= 4 && tw.includes(qw)) { matchCount += 0.5; break; }
    }
  }
  
  if (totalWords === 0) return 0;
  const ratio = matchCount / totalWords;
  return Math.round(ratio * 80);
}

/* Load JSON data with cache */
async function loadData(origin: string): Promise<any> {
  if (cachedData && cacheExpiry > Date.now()) return cachedData;
  
  try {
    const res = await fetch(`${origin}/fb-anime.json`);
    if (!res.ok) return { videos: [] };
    const data = await res.json();
    cachedData = data;
    cacheExpiry = Date.now() + CACHE_TTL;
    return data;
  } catch (e) {
    return { videos: [] };
  }
}

/* Search videos by query (link or text) */
function searchVideos(videos: any[], query: string): any[] {
  const q = query.trim();
  if (!q) return [];
  
  // Try as FB link/ID first
  const fbId = extractFbId(q);
  if (fbId) {
    const matched = videos.filter(v => 
      Array.isArray(v.fbLinks) && v.fbLinks.some((id: string) => 
        String(id).toLowerCase() === String(fbId).toLowerCase()
      )
    );
    if (matched.length > 0) {
      return matched.map(v => ({ ...v, _score: 100, _matchType: 'link' }));
    }
  }
  
  // Text search — score every video
  const scored = videos.map(v => {
    const captionScore = fuzzyScore(v.caption || '', q);
    const titleScore = fuzzyScore(v.title || '', q) * 1.2;
    const animeScore = fuzzyScore(v.anime || '', q);
    const keywordScore = Array.isArray(v.keywords) 
      ? Math.max(...v.keywords.map((k: string) => fuzzyScore(k, q)), 0)
      : 0;
    
    const score = Math.max(captionScore, titleScore, animeScore, keywordScore);
    return { ...v, _score: score, _matchType: 'text' };
  });
  
  // Filter and sort
  return scored
    .filter(v => v._score >= 40)
    .sort((a, b) => b._score - a._score);
}

/* ═══ MAIN HANDLER ═══ */

export const GET: APIRoute = async ({ request, url }) => {
  const params = url.searchParams;
  const query = params.get('q')?.trim() || '';
  const limit = parseInt(params.get('limit') || '10', 10);
  
  if (!query) {
    return json({ success: false, error: 'Missing q parameter', results: [] });
  }
  
  const origin = new URL(request.url).origin;
  const data = await loadData(origin);
  
  if (!data.videos || data.videos.length === 0) {
    return json({ success: false, error: 'No videos in database', results: [] });
  }
  
  const results = searchVideos(data.videos, query).slice(0, limit);
  
  return json({
    success: results.length > 0,
    query: query,
    count: results.length,
    results: results.map(v => ({
      anime: v.anime,
      title: v.title,
      episode: v.episode,
      caption: v.caption,
      thumbnail: v.thumbnail || '',
      matchType: v._matchType,
      confidence: v._score,
      watchUrl: `/reels/anime_${v.anime}_ep${v.episode}`
    }))
  });
};

export const OPTIONS: APIRoute = () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS'
    }
  });
};
