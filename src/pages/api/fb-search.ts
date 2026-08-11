// ═══════════════════════════════════════════════════════════════
// FB SEARCH v3 — Smart caption + link + text matching
// Path: src/pages/api/fb-search.ts
// ═══════════════════════════════════════════════════════════════
// ✅ URL detection (auto-resolve via link-resolver)
// ✅ Text search with fuzzy matching
// ✅ Caption similarity scoring
// ✅ Anime title matching
// ✅ Keywords matching
// ═══════════════════════════════════════════════════════════════

export const prerender = false;

// ═══════════════════════════════════════════════════
// 🎯 URL DETECTION
// ═══════════════════════════════════════════════════
function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s) || /facebook\.com|fb\.watch|youtu|dailymotion|bilibili/i.test(s);
}

function extractFbId(url: string): string | null {
  try {
    const u = url.trim();
    let m = u.match(/\/reel\/(\d+)/);
    if (m) return m[1];
    m = u.match(/\/share\/v\/([A-Za-z0-9]+)/);
    if (m) return m[1];
    m = u.match(/\/share\/r\/([A-Za-z0-9]+)/);
    if (m) return m[1];
    m = u.match(/\/videos\/(\d+)/);
    if (m) return m[1];
    m = u.match(/[?&]v=(\d+)/);
    if (m) return m[1];
    m = u.match(/fb\.watch\/([A-Za-z0-9_-]+)/);
    if (m) return m[1];
    return null;
  } catch (e) {
    return null;
  }
}

// ═══════════════════════════════════════════════════
// 🎯 TEXT NORMALIZATION & MATCHING
// ═══════════════════════════════════════════════════
function normalizeText(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .filter(w => w.length >= 3);
}

function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);
  return intersection.size / union.size;
}

function containsRatio(needle: string, haystack: string): number {
  const needleTokens = tokenize(needle);
  const haystackTokens = new Set(tokenize(haystack));
  if (needleTokens.length === 0) return 0;
  let matches = 0;
  for (const t of needleTokens) {
    if (haystackTokens.has(t)) matches++;
  }
  return matches / needleTokens.length;
}

function scoreRecord(query: string, record: any): number {
  const q = normalizeText(query);
  let score = 0;
  
  const title = normalizeText(record.animeTitle || '');
  const slug = normalizeText(record.animeSlug || '');
  const caption = normalizeText(record.caption || '');
  const keywords = normalizeText(record.keywords || '');
  
  // Exact title match
  if (title && title === q) score += 100;
  // Title starts with query
  if (title && title.startsWith(q)) score += 60;
  // Title contains query
  if (title && title.indexOf(q) !== -1) score += 40;
  
  // Slug match
  if (slug && slug.indexOf(q) !== -1) score += 30;
  
  // Caption exact
  if (caption && caption === q) score += 80;
  // Caption contains query
  if (caption && q.length > 10 && caption.indexOf(q) !== -1) score += 60;
  // Query contains caption (shortened caption)
  if (caption && q.length > 15 && q.indexOf(caption) !== -1) score += 50;
  
  // Fuzzy caption match
  if (caption && q.length > 8) {
    const sim = jaccardSimilarity(q, caption);
    if (sim >= 0.7) score += 45;
    else if (sim >= 0.5) score += 30;
    else if (sim >= 0.3) score += 15;
  }
  
  // Contains ratio for caption
  if (caption && q.length > 5) {
    const ratio = containsRatio(q, caption);
    if (ratio >= 0.8) score += 40;
    else if (ratio >= 0.6) score += 25;
    else if (ratio >= 0.4) score += 12;
  }
  
  // Keywords
  if (keywords && q.length > 3) {
    const ratio = containsRatio(q, keywords);
    if (ratio >= 0.6) score += 20;
    else if (ratio >= 0.4) score += 10;
  }
  
  // Word-by-word bonus for shorter queries
  if (q.length < 30) {
    const words = q.split(/\s+/).filter(w => w.length > 2);
    words.forEach(w => {
      if (title && title.indexOf(w) !== -1) score += 4;
      if (caption && caption.indexOf(w) !== -1) score += 2;
      if (keywords && keywords.indexOf(w) !== -1) score += 1;
    });
  }
  
  return score;
}

// ═══════════════════════════════════════════════════
// 🎯 FORMAT RESULT
// ═══════════════════════════════════════════════════
function formatResult(record: any, matchType: string, confidence: number): any {
  return {
    anime: record.animeSlug,
    title: record.animeTitle,
    episode: record.episode,
    season: record.season,
    caption: record.caption || '',
    thumbnail: record.thumbnail || '',
    watchUrl: '/reels/anime_' + encodeURIComponent(record.animeSlug) + '_ep' + record.episode,
    matchType: matchType,
    confidence: confidence
  };
}

// ═══════════════════════════════════════════════════
// 🎯 MAIN HANDLER
// ═══════════════════════════════════════════════════
export async function GET({ url, locals }: any) {
  try {
    const env = (locals as any)?.runtime?.env || {};
    const kv = env.ANIME_DB;
    const query = (url.searchParams.get('q') || '').trim();
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '8'), 20);
    
    if (!kv) {
      return jsonResponse({
        success: false,
        error: 'Database not configured',
        results: []
      }, 200);
    }
    
    if (!query || query.length < 2) {
      return jsonResponse({
        success: true,
        results: [],
        totalInDb: 0
      }, 200);
    }
    
    // ═══════════════════════════════════════════════════
    // URL DETECTION - Direct FB ID lookup
    // ═══════════════════════════════════════════════════
    if (isUrl(query)) {
      const fbId = extractFbId(query);
      if (fbId) {
        const recordId = await kv.get(`fbid:${fbId}`);
        if (recordId) {
          const raw = await kv.get(`video:${recordId}`);
          if (raw) {
            const record = JSON.parse(raw);
            return jsonResponse({
              success: true,
              results: [formatResult(record, 'link', 1.0)],
              totalInDb: 1
            }, 200);
          }
        }
      }
      // URL not found in DB - return empty (will trigger link-resolver in UI)
      return jsonResponse({
        success: true,
        results: [],
        totalInDb: 0,
        isUrl: true
      }, 200);
    }
    
    // ═══════════════════════════════════════════════════
    // TEXT SEARCH - Fuzzy match
    // ═══════════════════════════════════════════════════
    const indexRaw = await kv.get('index:all');
    let index: string[] = [];
    try {
      index = indexRaw ? JSON.parse(indexRaw) : [];
    } catch {}
    
    if (index.length === 0) {
      return jsonResponse({
        success: true,
        results: [],
        totalInDb: 0
      }, 200);
    }
    
    // Fetch records in parallel (max 200)
    const toFetch = index.slice(0, 200);
    const records = await Promise.all(
      toFetch.map(async (id) => {
        try {
          const raw = await kv.get(`video:${id}`);
          return raw ? JSON.parse(raw) : null;
        } catch { return null; }
      })
    );
    
    const valid = records.filter(r => r !== null);
    
    // Score all records
    const scored = valid.map(r => ({
      record: r,
      score: scoreRecord(query, r)
    })).filter(x => x.score > 0);
    
    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    
    // Format top results
    const results = scored.slice(0, limit).map(x => 
      formatResult(x.record, 'text', Math.min(x.score / 100, 1.0))
    );
    
    return jsonResponse({
      success: true,
      results: results,
      totalInDb: valid.length
    }, 200);
    
  } catch (e: any) {
    return jsonResponse({
      success: false,
      error: e.message || 'Search failed',
      results: []
    }, 500);
  }
}

function jsonResponse(data: any, status: number): Response {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}
