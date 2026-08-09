import type { APIRoute } from 'astro';

/* ═══════════════════════════════════════════════════════
   🎯 ANIME LINK RESOLVER v4.0
   
   Goal: User pastes ANY video link → identify anime name + episode
        → redirect to /reels/anime_{slug}_ep{n} for FULL episode play
   
   Supports: Facebook (direct + share links), YouTube, Dailymotion,
             Bilibili — all identify anime from title/caption
═══════════════════════════════════════════════════════ */

const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 30 * 60 * 1000;

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

function slugify(s: string): string {
  return String(s || '').toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

/* ═══ FACEBOOK: SCRAPE PAGE for title/description ═══ */

async function scrapeFacebookPage(url: string): Promise<{ title: string; description: string; ogUrl?: string }> {
  const result = { title: '', description: '', ogUrl: '' };
  
  try {
    // Use mobile Facebook — returns simpler HTML, less blocking
    let scrapeUrl = url;
    if (url.includes('www.facebook.com')) {
      scrapeUrl = url.replace('www.facebook.com', 'mbasic.facebook.com');
    } else if (url.includes('facebook.com')) {
      scrapeUrl = url.replace('facebook.com', 'mbasic.facebook.com');
    }
    
    const res = await fetch(scrapeUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Bot/1.0; +http://example.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    if (!res.ok) return result;
    
    const html = await res.text();
    
    // Extract og:title
    let m = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
    if (m) result.title = m[1].trim();
    
    // Extract og:description
    m = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
    if (m) result.description = m[1].trim();
    
    // Extract og:url (real permalink)
    m = html.match(/<meta\s+property=["']og:url["']\s+content=["']([^"']+)["']/i);
    if (m) result.ogUrl = m[1].trim();
    
    // Fallback: <title> tag
    if (!result.title) {
      m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (m) result.title = m[1].replace(/\s*[\|\-]\s*Facebook\s*$/i, '').trim();
    }
    
    // Fallback: extract from mbasic HTML directly
    if (!result.description) {
      // mbasic FB shows description in various divs
      m = html.match(/<div[^>]*data-ft="[^"]*"[^>]*>([^<]{20,500})<\/div>/i);
      if (m) result.description = m[1].trim();
    }
    
    // Decode HTML entities
    const decode = (s: string) => s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&nbsp;/g, ' ');
    
    result.title = decode(result.title);
    result.description = decode(result.description);
    
  } catch (e) {
    // ignore
  }
  
  return result;
}

/* ═══ FALLBACK: Try public FB oEmbed proxy ═══ */

async function tryFacebookOEmbed(url: string): Promise<{ title: string; description: string }> {
  try {
    // Try FB's public oEmbed endpoint (works without auth for public videos)
    const oembedUrl = `https://www.facebook.com/plugins/video/oembed.json/?url=${encodeURIComponent(url)}`;
    const res = await fetch(oembedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0'
      }
    });
    if (res.ok) {
      const data = await res.json() as any;
      return {
        title: data.title || data.author_name || '',
        description: data.title || ''
      };
    }
  } catch (e) {}
  return { title: '', description: '' };
}

/* ═══ GROQ AI ANIME IDENTIFICATION ═══ */

async function identifyAnimeWithGroq(
  title: string, 
  description: string, 
  apiKey: string
): Promise<{ anime: string; episode: number; confidence: number } | null> {
  if (!apiKey) return null;
  
  const combined = `${title}\n\n${description}`.trim();
  if (!combined || combined.length < 5) return null;
  
  const prompt = `You are an expert anime identifier. Analyze this social media post about an anime and identify it.

Post Content:
"""
${combined.substring(0, 800)}
"""

Instructions:
1. Identify the anime/show name (use English or Romaji, NOT Japanese characters)
2. Identify the episode number if mentioned (0 if none)
3. Give confidence 0.0 to 1.0

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{"anime": "Name Here", "episode": 0, "confidence": 0.9}

Rules:
- If clearly identifiable (character names, series name mentioned): confidence 0.8-1.0
- If educated guess: confidence 0.5-0.7
- If unknown or not anime: {"anime": "Unknown", "episode": 0, "confidence": 0.0}
- Common examples: Kirito → Sword Art Online, Tanjiro → Demon Slayer, Naruto → Naruto`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 150,
        response_format: { type: 'json_object' }
      })
    });
    
    if (!res.ok) return null;
    const data = await res.json() as any;
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    
    try {
      const parsed = JSON.parse(content);
      return {
        anime: String(parsed.anime || 'Unknown'),
        episode: Number(parsed.episode || 0),
        confidence: Number(parsed.confidence || 0)
      };
    } catch (e) {
      const m = content.match(/\{[^}]+\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        return {
          anime: String(parsed.anime || 'Unknown'),
          episode: Number(parsed.episode || 0),
          confidence: Number(parsed.confidence || 0)
        };
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

/* ═══ LOOKUP IN OUR DATASET ═══ */

async function lookupInDataset(videoId: string, origin: string): Promise<any | null> {
  try {
    const res = await fetch(`${origin}/facebook-videos.json`);
    if (!res.ok) return null;
    const data = await res.json() as any;
    if (!data.videos) return null;
    return data.videos.find((v: any) => String(v.id) === String(videoId)) || null;
  } catch (e) {
    return null;
  }
}

/* ═══ ID EXTRACTORS ═══ */

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

function extractFacebookDirectId(url: string): string | null {
  // Try to find 15-20 digit numeric ID
  let m = url.match(/\/(?:reel|watch|video|videos)\/(\d{10,20})/);
  if (m) return m[1];
  m = url.match(/[?&]v=(\d{10,20})/);
  if (m) return m[1];
  m = url.match(/\/(\d{15,20})\/?(?:\?|$)/);
  if (m) return m[1];
  return null;
}

/* ═══ MAIN HANDLER ═══ */

export const GET: APIRoute = async ({ request, url, locals }) => {
  const env = (locals as any)?.runtime?.env || {};
  const params = url.searchParams;
  const targetUrl = params.get('url')?.trim();
  const debug = params.get('debug') === '1';
  const refresh = params.get('refresh') === '1';
  
  if (!targetUrl) {
    return json({ success: false, error: 'Missing url parameter' }, 400);
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
  const groqKey = env.GROQ_API_KEY;
  
  // ═══ INTERNAL ═══
  if (targetUrl.startsWith(origin) || targetUrl.startsWith('/')) {
    const result = {
      success: true,
      platform: 'internal',
      redirectUrl: targetUrl.replace(origin, ''),
      title: 'Internal link'
    };
    return json(debug ? { ...result, debug: debugLog } : result);
  }
  
  // ═══ YOUTUBE (direct embed) ═══
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
  
  // ═══ FACEBOOK — ANIME IDENTIFICATION FLOW ═══
  if (platform === 'facebook') {
    log('Starting Facebook resolution...');
    
    let title = '';
    let description = '';
    let fbVideoId = extractFacebookDirectId(targetUrl);
    log('Direct FB ID', fbVideoId);
    
    // Step 1: Check dataset if direct ID
    if (fbVideoId) {
      const fbVideo = await lookupInDataset(fbVideoId, origin);
      log('Dataset lookup', fbVideo ? 'FOUND' : 'NOT FOUND');
      if (fbVideo) {
        title = fbVideo.title || '';
        description = fbVideo.description || '';
      }
    }
    
    // Step 2: If no title/desc yet, SCRAPE Facebook page
    if (!title && !description) {
      log('Scraping FB page...');
      const scraped = await scrapeFacebookPage(targetUrl);
      log('Scraped', scraped);
      title = scraped.title;
      description = scraped.description;
      
      // If scraped ogUrl has a direct ID, use it
      if (scraped.ogUrl && !fbVideoId) {
        const extractedFromOg = extractFacebookDirectId(scraped.ogUrl);
        if (extractedFromOg) {
          fbVideoId = extractedFromOg;
          // Try dataset lookup with extracted ID
          const fbVideo = await lookupInDataset(fbVideoId, origin);
          if (fbVideo) {
            if (!title) title = fbVideo.title || '';
            if (!description) description = fbVideo.description || '';
          }
        }
      }
    }
    
    // Step 3: Try oEmbed as backup
    if (!title && !description) {
      log('Trying oEmbed...');
      const oembed = await tryFacebookOEmbed(targetUrl);
      log('oEmbed result', oembed);
      title = oembed.title;
      description = oembed.description;
    }
    
    log('Final title/desc', { title, description });
    
    // Step 4: Send to Groq for anime identification
    if ((title || description) && groqKey) {
      log('Calling Groq...');
      const animeInfo = await identifyAnimeWithGroq(title, description, groqKey);
      log('Groq response', animeInfo);
      
      if (animeInfo && animeInfo.anime && animeInfo.anime !== 'Unknown' && animeInfo.confidence >= 0.5) {
        const slug = slugify(animeInfo.anime);
        const episode = animeInfo.episode > 0 ? animeInfo.episode : 1;
        
        const result = {
          success: true,
          platform: 'facebook',
          title: animeInfo.anime,
          anime: animeInfo.anime,
          episode: episode,
          confidence: animeInfo.confidence,
          slug: slug,
          redirectUrl: `/reels/anime_${slug}_ep${episode}`,
          source: 'facebook',
          detectedFrom: title || description
        };
        cache.set(cacheKey, { data: result, expires: Date.now() + CACHE_TTL });
        return json(debug ? { ...result, debug: debugLog } : result);
      }
      
      // Groq returned but low confidence
      if (animeInfo) {
        return json({
          success: false,
          platform: 'facebook',
          error: 'Could not identify anime with sufficient confidence',
          hint: `Best guess: "${animeInfo.anime}" (confidence: ${animeInfo.confidence})`,
          title: title,
          description: description ? description.substring(0, 150) : '',
          debug: debug ? debugLog : undefined
        }, 200);
      }
    }
    
    // Nothing worked
    return json({
      success: false,
      platform: 'facebook',
      error: 'Could not detect anime from this Facebook video',
      hint: title || description 
        ? 'AI could not identify the anime from the caption. Try a link with clearer title.'
        : 'Could not extract video info. This might be a private post or the link format is not supported.',
      title: title || null,
      description: description ? description.substring(0, 150) : null,
      videoId: fbVideoId,
      debug: debug ? debugLog : undefined
    }, 200);
  }
  
  return json({
    success: false,
    error: 'Unsupported platform',
    platform: platform,
    debug: debug ? debugLog : undefined
  }, 400);
};

export const POST: APIRoute = async (ctx) => {
  const body = await ctx.request.json().catch(() => ({})) as any;
  const url = new URL(ctx.request.url);
  url.searchParams.set('url', body.url || '');
  if (body.debug) url.searchParams.set('debug', '1');
  if (body.refresh) url.searchParams.set('refresh', '1');
  return GET({ ...ctx, url } as any);
};

export const OPTIONS: APIRoute = () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
};
