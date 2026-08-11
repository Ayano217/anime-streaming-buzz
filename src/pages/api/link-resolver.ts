// ═══════════════════════════════════════════════════════════════
// LINK RESOLVER v8 — Smart FB Extraction + Auto-Learning
// Path: src/pages/api/link-resolver.ts
// ═══════════════════════════════════════════════════════════════
// ✅ Layer 1: KV database lookup (instant)
// ✅ Layer 2: FB caption extraction (fb-extract API)
// ✅ Layer 3: Fuzzy match with database captions
// ✅ Layer 4: Auto-save new link to matched anime
// ✅ Supports: Facebook, YouTube, Dailymotion, Bilibili
// ═══════════════════════════════════════════════════════════════

export const prerender = false;

// ═══════════════════════════════════════════════════
// 🎯 URL EXTRACTION HELPERS
// ═══════════════════════════════════════════════════
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

function extractYouTube(url: string): string | null {
  try {
    const u = url.trim();
    let m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    return null;
  } catch (e) { return null; }
}

function extractDailymotion(url: string): string | null {
  try {
    const u = url.trim();
    let m = u.match(/dailymotion\.com\/(?:video|embed\/video)\/([a-zA-Z0-9]+)/);
    if (m) return m[1];
    m = u.match(/dai\.ly\/([a-zA-Z0-9]+)/);
    if (m) return m[1];
    return null;
  } catch (e) { return null; }
}

function extractBilibili(url: string): string | null {
  try {
    const u = url.trim();
    let m = u.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/);
    if (m) return m[1];
    return null;
  } catch (e) { return null; }
}

// ═══════════════════════════════════════════════════
// 🎯 CAPTION NORMALIZATION & FUZZY MATCHING
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
    .filter(w => w.length >= 3); // Words 3+ chars only
}

// Jaccard similarity (0-1)
function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  
  const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);
  
  return intersection.size / union.size;
}

// Contains ratio - how much of A is in B
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

// Combined smart score
function smartMatchScore(query: string, record: any): number {
  const queryLower = normalizeText(query);
  const captionLower = normalizeText(record.caption || '');
  const titleLower = normalizeText(record.animeTitle || '');
  const keywordsLower = normalizeText(record.keywords || '');
  
  let score = 0;
  
  // Exact caption match (highest)
  if (captionLower && captionLower === queryLower) score += 100;
  
  // Caption contains query or vice versa
  if (captionLower && queryLower.length > 15) {
    if (captionLower.indexOf(queryLower) !== -1) score += 80;
    else if (queryLower.indexOf(captionLower) !== -1) score += 70;
  }
  
  // Fuzzy caption match
  if (captionLower && queryLower.length > 10) {
    const captionSim = jaccardSimilarity(queryLower, captionLower);
    if (captionSim >= 0.7) score += 60;
    else if (captionSim >= 0.5) score += 40;
    else if (captionSim >= 0.3) score += 20;
  }
  
  // Contains ratio (query words found in caption)
  if (captionLower && queryLower.length > 5) {
    const containRatio = containsRatio(queryLower, captionLower);
    if (containRatio >= 0.8) score += 50;
    else if (containRatio >= 0.6) score += 30;
    else if (containRatio >= 0.4) score += 15;
  }
  
  // Title match
  if (titleLower && queryLower.length > 3) {
    if (titleLower.indexOf(queryLower) !== -1) score += 40;
    else {
      const titleSim = containsRatio(queryLower, titleLower);
      if (titleSim >= 0.7) score += 30;
      else if (titleSim >= 0.5) score += 15;
    }
  }
  
  // Keywords match
  if (keywordsLower && queryLower.length > 3) {
    const keywordSim = containsRatio(queryLower, keywordsLower);
    if (keywordSim >= 0.6) score += 20;
    else if (keywordSim >= 0.4) score += 10;
  }
  
  return score;
}

// ═══════════════════════════════════════════════════
// 🎯 FB CAPTION EXTRACTION (via internal API)
// ═══════════════════════════════════════════════════
async function fetchFbCaption(fbUrl: string, origin: string): Promise<any> {
  try {
    const extractUrl = new URL('/api/fb-extract', origin);
    extractUrl.searchParams.set('url', fbUrl);
    
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 13000);
    
    const res = await fetch(extractUrl.toString(), {
      signal: controller.signal
    });
    clearTimeout(timer);
    
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.success ? data : null;
  } catch (e) {
    return null;
  }
}

// ═══════════════════════════════════════════════════
// 🎯 FUZZY MATCH AGAINST DATABASE
// ═══════════════════════════════════════════════════
async function fuzzyMatchDatabase(kv: any, query: string, minScore = 40): Promise<any> {
  if (!query || query.length < 5) return null;
  
  try {
    const indexRaw = await kv.get('index:all');
    if (!indexRaw) return null;
    
    let index: string[] = [];
    try { index = JSON.parse(indexRaw); } catch {}
    if (index.length === 0) return null;
    
    // Fetch all records (limit 200 for performance)
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
    
    // Score all
    const scored = valid.map(r => ({
      record: r,
      score: smartMatchScore(query, r)
    })).filter(x => x.score >= minScore);
    
    scored.sort((a, b) => b.score - a.score);
    
    if (scored.length > 0) {
      return {
        record: scored[0].record,
        score: scored[0].score,
        alternatives: scored.slice(1, 4).map(x => x.record)
      };
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

// ═══════════════════════════════════════════════════
// 🎯 AUTO-SAVE NEW FB LINK TO MATCHED RECORD
// ═══════════════════════════════════════════════════
async function autoSaveFbLink(kv: any, recordId: string, fbId: string, fbUrl: string): Promise<boolean> {
  try {
    const raw = await kv.get(`video:${recordId}`);
    if (!raw) return false;
    
    const record = JSON.parse(raw);
    
    // Ensure arrays exist
    if (!Array.isArray(record.fbIds)) record.fbIds = [];
    if (!Array.isArray(record.fbLinks)) record.fbLinks = [];
    
    let modified = false;
    
    // Add fbId if new
    if (fbId && !record.fbIds.includes(fbId)) {
      record.fbIds.push(fbId);
      modified = true;
    }
    
    // Add fbUrl if new (limit to 10 aliases)
    if (fbUrl && !record.fbLinks.includes(fbUrl) && record.fbLinks.length < 10) {
      record.fbLinks.push(fbUrl);
      modified = true;
    }
    
    if (modified) {
      record.updatedAt = Date.now();
      await kv.put(`video:${recordId}`, JSON.stringify(record));
      
      // Also add FB ID → record ID mapping
      if (fbId) {
        await kv.put(`fbid:${fbId}`, recordId);
      }
    }
    
    return modified;
  } catch (e) {
    return false;
  }
}

// ═══════════════════════════════════════════════════
// 🎯 MAIN HANDLER
// ═══════════════════════════════════════════════════
export async function GET({ url, locals }: any) {
  try {
    const env = (locals as any)?.runtime?.env || {};
    const kv = env.ANIME_DB;
    const inputUrl = (url.searchParams.get('url') || '').trim();
    const origin = url.origin;

    if (!inputUrl) {
      return jsonResponse({
        success: false,
        error: 'URL required'
      }, 400);
    }

    // ═══════════════════════════════════════════════════
    // FACEBOOK LINK HANDLING (Multi-layer)
    // ═══════════════════════════════════════════════════
    if (/facebook\.com|fb\.watch/i.test(inputUrl)) {
      
      // ═══ LAYER 1: KV database FB ID lookup (instant) ═══
      const fbId = extractFbId(inputUrl);
      if (fbId && kv) {
        const recordId = await kv.get(`fbid:${fbId}`);
        if (recordId) {
          const raw = await kv.get(`video:${recordId}`);
          if (raw) {
            const record = JSON.parse(raw);
            return jsonResponse({
              success: true,
              source: 'kv-direct',
              title: record.animeTitle,
              redirectUrl: `/reels/anime_${encodeURIComponent(record.animeSlug)}_ep${record.episode}`,
              match: {
                anime: record.animeSlug,
                title: record.animeTitle,
                episode: record.episode,
                season: record.season
              }
            }, 200);
          }
        }
      }
      
      // ═══ LAYER 2: Extract caption from FB link ═══
      let extractedCaption: string | null = null;
      let extractedTitle: string | null = null;
      let extractedThumb: string | null = null;
      let extractionData: any = null;
      
      if (kv) {
        extractionData = await fetchFbCaption(inputUrl, origin);
        if (extractionData && extractionData.success) {
          extractedCaption = extractionData.caption;
          extractedTitle = extractionData.title;
          extractedThumb = extractionData.thumbnail;
        }
      }
      
      // ═══ LAYER 3: Fuzzy match with database ═══
      if (kv && (extractedCaption || extractedTitle)) {
        const searchQuery = extractedCaption || extractedTitle || '';
        const match = await fuzzyMatchDatabase(kv, searchQuery, 40);
        
        if (match && match.record) {
          const record = match.record;
          
          // ═══ LAYER 4: Auto-save this new FB link ═══
          if (fbId) {
            await autoSaveFbLink(kv, record.id, fbId, inputUrl);
          }
          
          return jsonResponse({
            success: true,
            source: 'caption-match',
            confidence: match.score,
            title: record.animeTitle,
            redirectUrl: `/reels/anime_${encodeURIComponent(record.animeSlug)}_ep${record.episode}`,
            match: {
              anime: record.animeSlug,
              title: record.animeTitle,
              episode: record.episode,
              season: record.season
            },
            extracted: {
              caption: extractedCaption,
              title: extractedTitle,
              thumbnail: extractedThumb
            }
          }, 200);
        }
      }
      
      // ═══ NOT FOUND - Return helpful info ═══
      return jsonResponse({
        success: false,
        needsManualHelp: true,
        error: 'Could not automatically detect this anime',
        extracted: extractionData ? {
          caption: extractedCaption,
          title: extractedTitle,
          thumbnail: extractedThumb,
          fbId: fbId,
          fbUrl: inputUrl
        } : {
          fbId: fbId,
          fbUrl: inputUrl
        }
      }, 404);
    }

    // ═══════════════════════════════════════════════════
    // YOUTUBE
    // ═══════════════════════════════════════════════════
    const ytId = extractYouTube(inputUrl);
    if (ytId) {
      const isShort = /shorts/i.test(inputUrl);
      return jsonResponse({
        success: true,
        source: 'youtube',
        title: 'YouTube Video',
        redirectUrl: '/reels/' + (isShort ? 'yts_' : 'yt_') + ytId
      }, 200);
    }

    // ═══════════════════════════════════════════════════
    // DAILYMOTION
    // ═══════════════════════════════════════════════════
    const dmId = extractDailymotion(inputUrl);
    if (dmId) {
      return jsonResponse({
        success: true,
        source: 'dailymotion',
        title: 'Dailymotion Video',
        redirectUrl: '/reels/dm_' + dmId
      }, 200);
    }

    // ═══════════════════════════════════════════════════
    // BILIBILI
    // ═══════════════════════════════════════════════════
    const biliId = extractBilibili(inputUrl);
    if (biliId) {
      return jsonResponse({
        success: true,
        source: 'bilibili',
        title: 'Bilibili Video',
        redirectUrl: '/reels/bili_' + biliId
      }, 200);
    }

    return jsonResponse({
      success: false,
      error: 'Unsupported URL format'
    }, 400);

  } catch (e: any) {
    return jsonResponse({
      success: false,
      error: e.message || 'Resolution failed'
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
