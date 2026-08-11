// ═══════════════════════════════════════════════════════════════
// FB EXTRACT API — Multi-layer Facebook caption extractor
// Path: src/pages/api/fb-extract.ts
// ═══════════════════════════════════════════════════════════════
// ✅ No API keys required
// ✅ No third-party dependencies  
// ✅ Cloudflare Workers native
// ✅ Multi-layer fallback (oEmbed → crawler UA → mbasic → normal)
// ✅ Auto-extracts: caption, title, thumbnail, video ID
// ═══════════════════════════════════════════════════════════════

export const prerender = false;

interface FbMetadata {
  success: boolean;
  url: string;
  canonicalUrl: string | null;
  videoId: string | null;
  caption: string | null;
  title: string | null;
  thumbnail: string | null;
  source: string;
  confidence: number;
}

const CRAWLER_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const TIMEOUT_MS = 4500;
const GLOBAL_TIMEOUT_MS = 12000;

// ═══════════════════════════════════════════════════
// 🎯 URL VALIDATION & NORMALIZATION
// ═══════════════════════════════════════════════════
function isFacebookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.watch';
  } catch {
    return false;
  }
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    // Remove tracking params
    const removeParams = ['fbclid', 'mibextid', 'ref', 'refsrc', '__cft__', '__tn__'];
    for (const p of removeParams) u.searchParams.delete(p);
    return u.toString();
  } catch {
    return url.trim();
  }
}

function extractVideoId(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /\/reel\/(\d+)/i,
    /\/videos\/(\d+)/i,
    /[?&]v=(\d+)/i,
    /video_id=(\d+)/i,
    /\/video\.php\?v=(\d+)/i,
    /story_fbid=(\d+)/i
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m && m[1]) return m[1];
  }
  return null;
}

// ═══════════════════════════════════════════════════
// 🎯 UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════
function decodeHtml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function cleanText(str: string | null | undefined): string | null {
  if (!str) return null;
  const cleaned = decodeHtml(String(str))
    .replace(/\s+/g, ' ')
    .replace(/^\s*[\d.,]+[KM]?\s*(views?|reactions?)\s*(·|\||-)\s*/i, '')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

function extractMeta(html: string, prop: string): string | null {
  const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["']`, 'i')
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) return cleanText(m[1]);
  }
  return null;
}

function extractInlineText(html: string): string | null {
  // Try to extract post text from inline JSON in Facebook pages
  const patterns = [
    /"message"\s*:\s*\{\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"/i,
    /"message"\s*:\s*"((?:\\.|[^"\\])*)"/i,
    /"story_message"\s*:\s*"((?:\\.|[^"\\])*)"/i,
    /"description"\s*:\s*"((?:\\.|[^"\\])*)"/i,
    /"post_message"\s*:\s*"((?:\\.|[^"\\])*)"/i
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1] && m[1].length > 5) {
      const decoded = m[1]
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .replace(/\\n/g, ' ')
        .replace(/\\r/g, ' ')
        .replace(/\\t/g, ' ')
        .replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
      if (!/log into facebook|see more/i.test(decoded)) {
        return cleanText(decoded);
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════
// 🎯 SAFE FETCH WITH TIMEOUT
// ═══════════════════════════════════════════════════
async function safeFetch(url: string, headers: Record<string, string>, timeout = TIMEOUT_MS): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: headers,
      signal: controller.signal
    });
    return res;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ═══════════════════════════════════════════════════
// 🎯 METHOD 1: Meta Tokenless oEmbed (v25.0)
// ═══════════════════════════════════════════════════
async function tryOembed(url: string): Promise<Partial<FbMetadata> | null> {
  const endpoints = [
    'https://graph.facebook.com/v25.0/oembed_video',
    'https://graph.facebook.com/v25.0/oembed_post'
  ];
  
  for (const endpoint of endpoints) {
    try {
      const fullUrl = `${endpoint}?url=${encodeURIComponent(url)}`;
      const res = await safeFetch(fullUrl, { 'Accept': 'application/json' }, 3500);
      if (!res || !res.ok) continue;
      
      const data: any = await res.json();
      if (!data) continue;
      
      // Extract caption from HTML embed (contains post text)
      let caption: string | null = null;
      if (data.html && typeof data.html === 'string') {
        const stripped = data.html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ');
        caption = cleanText(stripped);
      }
      
      const title = cleanText(data.title);
      const thumb = cleanText(data.thumbnail_url);
      
      if (title || caption || thumb) {
        return {
          caption: caption || title,
          title: title,
          thumbnail: thumb,
          source: 'oembed'
        };
      }
    } catch {}
  }
  return null;
}

// ═══════════════════════════════════════════════════
// 🎯 METHOD 2: facebookexternalhit UA (crawler)
// ═══════════════════════════════════════════════════
async function tryCrawlerUA(url: string): Promise<Partial<FbMetadata> | null> {
  const headers = {
    'User-Agent': CRAWLER_UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
    'Accept-Language': 'en-US,en;q=0.9'
  };
  
  const res = await safeFetch(url, headers, TIMEOUT_MS);
  if (!res || !res.ok) return null;
  
  try {
    const html = await res.text();
    const limited = html.slice(0, 500000);
    
    // Check for login wall
    if (/log into facebook/i.test(limited) && !/og:image/i.test(limited)) {
      return null;
    }
    
    const caption = extractMeta(limited, 'og:description') || 
                   extractInlineText(limited);
    const title = extractMeta(limited, 'og:title');
    const thumb = extractMeta(limited, 'og:image');
    
    if (caption || title || thumb) {
      return {
        caption: caption,
        title: title,
        thumbnail: thumb,
        source: 'crawler-ua'
      };
    }
  } catch {}
  return null;
}

// ═══════════════════════════════════════════════════
// 🎯 METHOD 3: mbasic.facebook.com (simple HTML)
// ═══════════════════════════════════════════════════
async function tryMbasic(url: string): Promise<Partial<FbMetadata> | null> {
  try {
    const u = new URL(url);
    if (u.hostname.includes('facebook.com')) {
      u.hostname = 'mbasic.facebook.com';
    }
    const mbasicUrl = u.toString();
    
    const headers = {
      'User-Agent': MOBILE_UA,
      'Accept': 'text/html',
      'Accept-Language': 'en-US,en;q=0.9'
    };
    
    const res = await safeFetch(mbasicUrl, headers, TIMEOUT_MS);
    if (!res || !res.ok) return null;
    
    const html = await res.text();
    const limited = html.slice(0, 300000);
    
    const caption = extractMeta(limited, 'og:description') ||
                   extractInlineText(limited);
    const title = extractMeta(limited, 'og:title');
    const thumb = extractMeta(limited, 'og:image');
    
    if (caption || title || thumb) {
      return {
        caption: caption,
        title: title,
        thumbnail: thumb,
        source: 'mbasic'
      };
    }
  } catch {}
  return null;
}

// ═══════════════════════════════════════════════════
// 🎯 METHOD 4: Normal browser UA
// ═══════════════════════════════════════════════════
async function tryDesktop(url: string): Promise<Partial<FbMetadata> | null> {
  const headers = {
    'User-Agent': DESKTOP_UA,
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.facebook.com/'
  };
  
  const res = await safeFetch(url, headers, TIMEOUT_MS);
  if (!res || !res.ok) return null;
  
  try {
    const html = await res.text();
    const limited = html.slice(0, 500000);
    
    if (/log into facebook/i.test(limited) && !/og:image/i.test(limited)) {
      return null;
    }
    
    const caption = extractMeta(limited, 'og:description') ||
                   extractInlineText(limited);
    const title = extractMeta(limited, 'og:title');
    const thumb = extractMeta(limited, 'og:image');
    
    if (caption || title || thumb) {
      return {
        caption: caption,
        title: title,
        thumbnail: thumb,
        source: 'desktop'
      };
    }
  } catch {}
  return null;
}

// ═══════════════════════════════════════════════════
// 🎯 CALCULATE CONFIDENCE SCORE
// ═══════════════════════════════════════════════════
function calculateConfidence(meta: Partial<FbMetadata>): number {
  let score = 0;
  if (meta.caption && meta.caption.length > 10) score += 60;
  else if (meta.caption) score += 30;
  if (meta.title) score += 15;
  if (meta.thumbnail) score += 15;
  if (meta.videoId) score += 10;
  return Math.min(score, 100);
}

// ═══════════════════════════════════════════════════
// 🎯 MAIN EXTRACTION FUNCTION
// ═══════════════════════════════════════════════════
export async function extractFacebookMetadata(inputUrl: string): Promise<FbMetadata> {
  const result: FbMetadata = {
    success: false,
    url: inputUrl,
    canonicalUrl: null,
    videoId: null,
    caption: null,
    title: null,
    thumbnail: null,
    source: 'none',
    confidence: 0
  };
  
  if (!isFacebookUrl(inputUrl)) {
    return result;
  }
  
  const cleanUrl = normalizeUrl(inputUrl);
  result.url = cleanUrl;
  result.videoId = extractVideoId(cleanUrl);
  
  // Global timeout wrapper
  const globalController = new AbortController();
  const globalTimer = setTimeout(() => globalController.abort(), GLOBAL_TIMEOUT_MS);
  
  try {
    // Try methods in order until one succeeds
    const methods = [
      { name: 'oembed', fn: () => tryOembed(cleanUrl) },
      { name: 'crawler', fn: () => tryCrawlerUA(cleanUrl) },
      { name: 'mbasic', fn: () => tryMbasic(cleanUrl) },
      { name: 'desktop', fn: () => tryDesktop(cleanUrl) }
    ];
    
    for (const method of methods) {
      if (globalController.signal.aborted) break;
      try {
        const data = await method.fn();
        if (data && (data.caption || data.title)) {
          result.success = true;
          result.canonicalUrl = cleanUrl;
          result.caption = data.caption || null;
          result.title = data.title || null;
          result.thumbnail = data.thumbnail || null;
          result.source = data.source || method.name;
          result.videoId = result.videoId || extractVideoId(cleanUrl);
          result.confidence = calculateConfidence(result);
          
          // If good quality result, stop trying
          if (result.confidence >= 70) break;
        }
      } catch {}
    }
  } finally {
    clearTimeout(globalTimer);
  }
  
  return result;
}

// ═══════════════════════════════════════════════════
// 🎯 HTTP API ENDPOINT
// ═══════════════════════════════════════════════════
export async function GET({ url }: any) {
  try {
    const params = new URL(url).searchParams;
    const fbUrl = (params.get('url') || '').trim();
    
    if (!fbUrl) {
      return jsonResponse({
        success: false,
        error: 'URL parameter required'
      }, 400);
    }
    
    if (!isFacebookUrl(fbUrl)) {
      return jsonResponse({
        success: false,
        error: 'Not a Facebook URL'
      }, 400);
    }
    
    const result = await extractFacebookMetadata(fbUrl);
    
    return jsonResponse(result, 200);
    
  } catch (e: any) {
    return jsonResponse({
      success: false,
      error: e.message || 'Extraction failed'
    }, 500);
  }
}

function jsonResponse(data: any, status: number): Response {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600' // Cache 1 hour
    }
  });
}
