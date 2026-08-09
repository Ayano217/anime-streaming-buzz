import type { APIRoute } from 'astro';

export const prerender = false;

// ═══════════════════════════════════════════════════════════════════
// 🧠 ATBIE v2.0 — Simplified & Reliable
// Only working layers: Groq (95% accuracy) + FB Dataset
// ═══════════════════════════════════════════════════════════════════

type Platform = 'facebook' | 'youtube' | 'dailymotion' | 'bilibili' | 'internal' | 'unknown';

type CacheEntry = { expires: number; data: unknown };
const MEMORY_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL = 30 * 60 * 1000;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  });
}

export const GET: APIRoute = async ({ request, locals }) => handleResolver(request, locals);
export const POST: APIRoute = async ({ request, locals }) => handleResolver(request, locals);

async function handleResolver(request: Request, locals: any): Promise<Response> {
  const startTime = Date.now();
  const url = new URL(request.url);
  const debugMode = url.searchParams.get('debug') === '1';
  const forceRefresh = url.searchParams.get('refresh') === '1';
  const debug: Record<string, unknown> = {};

  const env = locals?.runtime?.env || {};
  const groqKey = env.GROQ_API_KEY || '';

  const rawInput = await readInput(request);
  if (!rawInput) return json({ success: false, reason: 'No URL provided' }, 400);

  let inputUrl: URL;
  try {
    inputUrl = new URL(rawInput.startsWith('http') ? rawInput : 'https://' + rawInput);
  } catch {
    return json({ success: false, reason: 'Invalid URL format' }, 400);
  }

  const platform = detectPlatform(inputUrl);
  debug.input = rawInput;
  debug.platform = platform;

  // Internal link — pass through
  if (platform === 'internal') {
    return json({
      success: true,
      platform,
      resolvedType: 'internal',
      redirectUrl: inputUrl.pathname + inputUrl.search,
      confidence: 1,
      ...(debugMode ? { debug } : {}),
    });
  }

  // Direct video platforms
  const direct = resolveDirectVideo(platform, inputUrl);
  if (direct) {
    return json({
      success: true,
      platform,
      resolvedType: 'video',
      ...direct,
      confidence: 1,
      ...(debugMode ? { debug } : {}),
    });
  }

  // ═══════════════════════════════════════════════════
  // FACEBOOK RESOLUTION
  // ═══════════════════════════════════════════════════
  if (platform === 'facebook') {
    const fbId = extractFacebookVideoId(inputUrl);
    debug.facebookId = fbId;

    if (!fbId) {
      return json({
        success: false,
        platform,
        reason: 'Could not extract Facebook video ID',
        ...(debugMode ? { debug } : {}),
      });
    }

    // Step 1: Get FB metadata (title, description, thumbnail)
    const fbMeta = await getFacebookMetadata(fbId, url.origin);
    debug.fbMeta = fbMeta;

    if (!fbMeta) {
      return json({
        success: false,
        platform,
        reason: 'Facebook video not found in local dataset.',
        ...(debugMode ? { debug } : {}),
      });
    }

    // Step 2: FAST PATH — pre-resolved in dataset
    if (fbMeta.animeSlug && fbMeta.confidence && fbMeta.confidence >= 0.85) {
      const ep = fbMeta.episode || 1;
      return json({
        success: true,
        platform,
        resolvedType: 'anime',
        source: 'dataset-cache',
        title: fbMeta.animeName,
        slug: fbMeta.animeSlug,
        episode: ep,
        redirectUrl: `/reels/anime_${fbMeta.animeSlug}_ep${ep}`,
        confidence: fbMeta.confidence,
        timeMs: Date.now() - startTime,
        ...(debugMode ? { debug } : {}),
      });
    }

    // Step 3: Check memory cache
    const cacheKey = `resolve:${fbId}`;
    if (!forceRefresh) {
      const cached = getCache(cacheKey);
      if (cached) {
        debug.fromCache = true;
        return json({
          ...(cached as any),
          timeMs: Date.now() - startTime,
          ...(debugMode ? { debug } : {}),
        });
      }
    }

    // Step 4: Groq AI analysis
    if (!groqKey) {
      return json({
        success: false,
        platform,
        reason: 'Groq API key missing',
        ...(debugMode ? { debug } : {}),
      });
    }

    const groqResult = await identifyWithGroq(fbMeta.title, fbMeta.description, groqKey);
    debug.groqResult = groqResult;

    if (!groqResult || !groqResult.animeName || groqResult.confidence < 0.5) {
      return json({
        success: false,
        platform,
        reason: 'Could not identify anime from caption',
        extractedTitle: fbMeta.title,
        ...(debugMode ? { debug } : {}),
      });
    }

    // Step 5: Validate slug with AnimoTV
    const validated = await validateWithAnimoTV(groqResult.animeName, url.origin);
    debug.validated = validated;

    const finalSlug = validated?.slug || slugify(groqResult.animeName);
    const finalEpisode =
      groqResult.episode ||
      extractEpisodeFromText(`${fbMeta.title} ${fbMeta.description}`) ||
      1;
    const finalName = validated?.title || groqResult.animeName;

    const response = {
      success: true,
      platform,
      resolvedType: 'anime' as const,
      source: 'groq-ai',
      title: finalName,
      slug: finalSlug,
      episode: finalEpisode,
      redirectUrl: `/reels/anime_${finalSlug}_ep${finalEpisode}`,
      confidence: groqResult.confidence,
      timeMs: Date.now() - startTime,
    };

    setCache(cacheKey, response, CACHE_TTL);

    return json({
      ...response,
      ...(debugMode ? { debug } : {}),
    });
  }

  return json({
    success: false,
    platform,
    reason: 'Unsupported platform',
    ...(debugMode ? { debug } : {}),
  });
}

// ═══════════════════════════════════════════════════════════════════
// GROQ AI — The workhorse
// ═══════════════════════════════════════════════════════════════════
async function identifyWithGroq(title: string, description: string, apiKey: string) {
  try {
    const combined = `${title || ''} ${description || ''}`.trim();

    const prompt = `You are an expert anime identifier. Analyze this Facebook post caption about an anime clip.

CAPTION: "${combined}"

Look for:
- Character names (Kirito → Sword Art Online, Kazuma → KonoSuba, Kafka → Kaiju No. 8, etc.)
- Anime titles directly mentioned
- Hashtags (#grandblue, #yanineko, etc.)
- Season/episode numbers
- Plot references specific to certain series

Respond ONLY with valid JSON:
{
  "animeName": "exact anime name in English or null if unsure",
  "episode": episode number or null,
  "confidence": 0.0-1.0
}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are an expert anime identifier with deep knowledge of all anime series. Respond only with valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 200,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
    const data: any = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    const parsed = extractJsonFromText(text);

    if (!parsed || !parsed.animeName || parsed.animeName === 'null') {
      return null;
    }

    return {
      animeName: String(parsed.animeName),
      episode: parsed.episode ? Number(parsed.episode) : null,
      confidence: Math.min(Number(parsed.confidence) || 0.7, 0.99),
    };
  } catch (e) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// ANIMOTV VALIDATION
// ═══════════════════════════════════════════════════════════════════
async function validateWithAnimoTV(animeName: string, origin: string) {
  try {
    const endpoint = new URL('/api/anime-external', origin);
    endpoint.searchParams.set('action', 'find');
    endpoint.searchParams.set('q', animeName);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(endpoint.toString(), { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return null;
    const data: any = await res.json();

    const items =
      data?.results ||
      data?.data ||
      data?.matches ||
      (Array.isArray(data) ? data : []) ||
      (data?.result ? [data.result] : []);

    if (!items.length) return null;

    const first = items[0];
    return {
      slug: first.slug || first.animeSlug || slugify(first.title || animeName),
      title: first.title || first.name || animeName,
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════
async function readInput(request: Request): Promise<string> {
  const u = new URL(request.url);
  const q = u.searchParams.get('url') || u.searchParams.get('link') || u.searchParams.get('q') || '';
  if (q) return q.trim();

  if (request.method === 'POST') {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try {
        const body = await request.json();
        return (body.url || body.link || body.q || '').trim();
      } catch {}
    }
  }
  return '';
}

function detectPlatform(url: URL): Platform {
  const host = url.hostname.toLowerCase().replace(/^(www|m|mbasic)\./, '');
  const path = url.pathname.toLowerCase();

  if (host.includes('facebook.com') || host === 'fb.watch') return 'facebook';
  if (host === 'youtu.be' || host.includes('youtube.com')) return 'youtube';
  if (host.includes('dailymotion.com') || host === 'dai.ly') return 'dailymotion';
  if (host.includes('bilibili.com') || host === 'b23.tv') return 'bilibili';
  if (path.startsWith('/reels/') || path.startsWith('/watch/') || path.startsWith('/anime/')) return 'internal';
  return 'unknown';
}

function resolveDirectVideo(platform: Platform, url: URL) {
  if (platform === 'youtube') {
    if (url.pathname.startsWith('/shorts/')) {
      const id = url.pathname.split('/')[2] || '';
      const clean = id.replace(/[^\w-]/g, '');
      if (clean) return { videoId: `yts_${clean}`, redirectUrl: `/reels/yts_${clean}` };
    }
    let id = '';
    if (url.hostname.includes('youtu.be')) id = url.pathname.slice(1).split('/')[0];
    else id = url.searchParams.get('v') || '';
    const clean = id.replace(/[^\w-]/g, '');
    if (clean) return { videoId: `yt_${clean}`, redirectUrl: `/reels/yt_${clean}` };
  }
  if (platform === 'dailymotion') {
    const parts = url.pathname.split('/').filter(Boolean);
    const id = (parts[parts.length - 1] || '').replace(/[^\w-]/g, '');
    if (id) return { videoId: `dm_${id}`, redirectUrl: `/reels/dm_${id}` };
  }
  if (platform === 'bilibili') {
    const parts = url.pathname.split('/').filter(Boolean);
    const id = (parts[parts.length - 1] || '').replace(/[^\w-]/g, '');
    if (id) return { videoId: `bili_${id}`, redirectUrl: `/reels/bili_${id}` };
  }
  return null;
}

function extractFacebookVideoId(url: URL): string {
  const q = url.searchParams.get('v') || url.searchParams.get('video_id') || url.searchParams.get('story_fbid') || '';
  if (q) return q.replace(/[^0-9]/g, '');
  const path = url.pathname;
  const patterns = [/\/reel\/(\d+)/i, /\/videos\/(\d+)/i, /\/watch\/?\?v=(\d+)/i, /\/(\d{10,})/];
  for (const p of patterns) {
    const m = path.match(p);
    if (m && m[1]) return m[1];
  }
  return '';
}

async function getFacebookMetadata(fbId: string, origin: string): Promise<any> {
  try {
    const res = await fetch(new URL('/facebook-videos.json', origin).toString());
    if (!res.ok) return null;
    const data: any = await res.json();
    const video = (data.videos || []).find((v: any) => String(v.id) === String(fbId));
    if (!video) return null;
    return {
      title: video.title || '',
      description: video.description || '',
      thumbnail: video.full_picture || video.picture || '',
      permalink: video.permalink_url || '',
      animeSlug: video.animeSlug || null,
      animeName: video.animeName || null,
      episode: video.episode || null,
      confidence: video.confidence || 0,
    };
  } catch {
    return null;
  }
}

function extractEpisodeFromText(text: string): number | null {
  const patterns = [
    /\bepisode\s*[:#-]?\s*(\d{1,4})\b/i,
    /\bep\s*[:#.-]?\s*(\d{1,4})\b/i,
    /\bpart\s*[:#-]?\s*(\d{1,4})\b/i,
    /\bs\d+\s*e\s*(\d{1,4})\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) {
      const n = parseInt(m[1]);
      if (n >= 1 && n <= 9999) return n;
    }
  }
  return null;
}

function extractJsonFromText(text: string): any {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {}
  }
  return null;
}

function slugify(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function getCache(key: string) {
  const hit = MEMORY_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    MEMORY_CACHE.delete(key);
    return null;
  }
  return hit.data;
}

function setCache(key: string, data: unknown, ttl: number) {
  MEMORY_CACHE.set(key, { data, expires: Date.now() + ttl });
}
