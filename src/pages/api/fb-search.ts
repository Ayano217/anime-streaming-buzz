import type { APIRoute } from 'astro';

/* ═══════════════════════════════════════════════════════
   🔍 FB ANIME SEARCH — Reads from Google Sheets
   
   Sheet URL (CSV format):
   Automatically syncs when you edit the Google Sheet
═══════════════════════════════════════════════════════ */

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR9WiDOa87KY6w5nV5557ikjd8i-dqXhpZpMFRjnZjPJZMEsDfJzQasfyYKqJ7XxtHwIQYAUpuhAuLo/pub?gid=0&single=true&output=csv';

// Memory cache (5 minutes — sheet updates reflect fast)
let cachedVideos: any[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000;

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

/* Parse CSV to array of objects */
function parseCSV(text: string): any[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  
  // Parse header row
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  
  const results: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;
    
    const row: any = {};
    headers.forEach((header, idx) => {
      row[header] = (values[idx] || '').trim();
    });
    
    // Skip empty rows
    if (!row.FB_ID && !row.Anime_Slug) continue;
    
    results.push(row);
  }
  
  return results;
}

/* Parse a single CSV line (handles quoted values, commas inside quotes) */
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

/* Convert Google Sheets row to normalized video object */
function normalizeRow(row: any): any {
  const keywords = row.Keywords 
    ? String(row.Keywords).split(',').map((k: string) => k.trim()).filter(Boolean)
    : [];
  
  const fbLinks = row.FB_ID 
    ? String(row.FB_ID).split(',').map((k: string) => k.trim()).filter(Boolean)
    : [];
  
  return {
    anime: row.Anime_Slug || '',
    title: row.Anime_Title || row.Anime_Slug || '',
    season: parseInt(row.Season || '1', 10) || 1,
    episode: parseInt(row.Episode || '1', 10) || 1,
    caption: row.Caption || '',
    keywords: keywords,
    fbLinks: fbLinks,
    thumbnail: row.Thumbnail || ''
  };
}

/* Fetch and parse Google Sheets */
async function loadVideos(): Promise<any[]> {
  if (cachedVideos && cacheExpiry > Date.now()) return cachedVideos;
  
  try {
    const res = await fetch(SHEET_CSV_URL, {
      headers: { 'User-Agent': 'AniTubeBuzz/1.0' }
    });
    
    if (!res.ok) {
      console.error('Sheet fetch failed:', res.status);
      return cachedVideos || [];
    }
    
    const csv = await res.text();
    const rows = parseCSV(csv);
    const videos = rows.map(normalizeRow).filter(v => v.anime);
    
    cachedVideos = videos;
    cacheExpiry = Date.now() + CACHE_TTL;
    return videos;
  } catch (e) {
    console.error('Sheet load error:', e);
    return cachedVideos || [];
  }
}

/* Extract FB video ID from any FB URL format */
function extractFbId(input: string): string | null {
  const s = input.trim();
  
  // Direct numeric ID
  if (/^\d{10,20}$/.test(s)) return s;
  
  // Direct alphanumeric code
  if (/^[a-zA-Z0-9_-]{6,20}$/.test(s) && !s.includes(' ')) return s;
  
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

/* Fuzzy score */
function fuzzyScore(text: string, query: string): number {
  const t = normalize(text);
  const q = normalize(query);
  
  if (!t || !q) return 0;
  if (t === q) return 100;
  if (t.includes(q)) return 90;
  
  const qWords = q.split(' ').filter(w => w.length >= 2);
  const tWords = t.split(' ');
  
  let matchCount = 0;
  const totalWords = qWords.length;
  
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

/* Search videos */
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
  
  // Text search
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
  
  return scored
    .filter(v => v._score >= 40)
    .sort((a, b) => b._score - a._score);
}

/* ═══ MAIN HANDLER ═══ */

export const GET: APIRoute = async ({ url }) => {
  const params = url.searchParams;
  const query = params.get('q')?.trim() || '';
  const limit = parseInt(params.get('limit') || '10', 10);
  const debug = params.get('debug') === '1';
  const refresh = params.get('refresh') === '1';
  
  if (refresh) {
    cachedVideos = null;
    cacheExpiry = 0;
  }
  
  if (!query) {
    return json({ 
      success: false, 
      error: 'Missing q parameter', 
      results: [],
      hint: 'Use ?q=your-search-query'
    });
  }
  
  const videos = await loadVideos();
  
  if (videos.length === 0) {
    return json({ 
      success: false, 
      error: 'No videos found in Google Sheet', 
      results: [],
      hint: 'Check your sheet has data and is published to web as CSV'
    });
  }
  
  const results = searchVideos(videos, query).slice(0, limit);
  
  return json({
    success: results.length > 0,
    query: query,
    count: results.length,
    totalInDb: videos.length,
    results: results.map(v => ({
      anime: v.anime,
      title: v.title,
      season: v.season,
      episode: v.episode,
      caption: v.caption,
      thumbnail: v.thumbnail || '',
      matchType: v._matchType,
      confidence: v._score,
      watchUrl: `/reels/anime_${v.anime}_ep${v.episode}`
    })),
    debug: debug ? { videos: videos.slice(0, 3) } : undefined
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
