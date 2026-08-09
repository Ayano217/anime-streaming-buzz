import type { APIRoute } from 'astro';

export const prerender = false;

// ═══════════════════════════════════════════════════════════════════
// 🧠 ATBIE — AniTubeBuzz Intelligence Engine v1.0
// Multi-layer parallel anime detection with voting consensus
// ═══════════════════════════════════════════════════════════════════

type Platform = 'facebook' | 'youtube' | 'dailymotion' | 'bilibili' | 'internal' | 'unknown';

type LayerResult = {
  layer: string;
  weight: number;
  success: boolean;
  animeName?: string;
  animeSlug?: string;
  episode?: number | null;
  confidence: number;
  raw?: unknown;
  timeMs?: number;
  error?: string;
};

type CacheEntry = { expires: number; data: unknown };
const MEMORY_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL = 30 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════════
// 🎯 MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════

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
  const debug: Record<string, unknown> = {};

  const env = locals?.runtime?.env || {};
  const geminiKey = env.GEMINI_API_KEY || '';
  const groqKey = env.GROQ_API_KEY || '';

  const rawInput = await readInput(request);
  if (!rawInput) {
    return json({ success: false, reason: 'No URL provided' }, 400);
  }

  let inputUrl: URL;
  try {
    inputUrl = new URL(rawInput.startsWith('http') ? rawInput : 'https://' + rawInput);
  } catch {
    return json({ success: false, reason: 'Invalid URL format' }, 400);
  }

  const platform = detectPlatform(inputUrl);
  debug.input = rawInput;
  debug.platform = platform;

  // Internal — pass through
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

  // Direct video (YouTube/DM/Bili)
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

  // ═══════════════════════════════════════════════════════════════
  // FACEBOOK — RUN ALL LAYERS IN PARALLEL 🚀
  // ═══════════════════════════════════════════════════════════════

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

    // Step 1: Get metadata (thumbnail, title, description) from local dataset
    const fbMeta = await getFacebookMetadata(fbId, url.origin);
    debug.fbMeta = fbMeta;

    if (!fbMeta) {
      return json({
        success: false,
        platform,
        reason: 'Facebook video not found in dataset. Run the FB fetcher script first.',
        ...(debugMode ? { debug } : {}),
      });
    }

    // FAST PATH: If dataset already resolved this video, return immediately
    if (fbMeta.animeSlug && fbMeta.confidence && fbMeta.confidence >= 0.9) {
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

    // Cache check for full multi-layer result
    const cacheKey = `resolve:${fbId}`;
    const cached = getCache(cacheKey);
    if (cached) {
      debug.fromCache = true;
      return json({
        ...(cached as any),
        timeMs: Date.now() - startTime,
        ...(debugMode ? { debug } : {}),
      });
    }

    // ═══════════════════════════════════════════════════
    // 🚀 PARALLEL LAYER EXECUTION
    // ═══════════════════════════════════════════════════

    const layerPromises: Promise<LayerResult>[] = [];

    // LAYER 1: Local dataset (already checked above, but partial match possible)
    layerPromises.push(layerFbDataset(fbMeta));

    // LAYER 2: trace.moe (thumbnail image search)
    if (fbMeta.thumbnail) {
      layerPromises.push(layerTraceMoe(fbMeta.thumbnail));
    }

    // LAYER 3: Gemini Vision (thumbnail analysis)
    if (fbMeta.thumbnail && geminiKey) {
      layerPromises.push(layerGeminiVision(fbMeta.thumbnail, geminiKey));
    }

    // LAYER 4: Gemini Text (caption analysis)
    if ((fbMeta.title || fbMeta.description) && geminiKey) {
      layerPromises.push(layerGeminiText(fbMeta.title, fbMeta.description, geminiKey));
    }

    // LAYER 5: Groq Text (fast LLM backup for caption)
    if ((fbMeta.title || fbMeta.description) && groqKey) {
      layerPromises.push(layerGroqText(fbMeta.title, fbMeta.description, groqKey));
    }

    // LAYER 6: AniList character search (extract names from title)
    if (fbMeta.title || fbMeta.description) {
      layerPromises.push(layerAniListSearch(fbMeta.title, fbMeta.description));
    }

    // Execute all with 8s timeout
    const results = await Promise.race([
      Promise.allSettled(layerPromises),
      new Promise<PromiseSettledResult<LayerResult>[]>((resolve) =>
        setTimeout(() => resolve([]), 8000)
      ),
    ]);

    const layerResults: LayerResult[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') layerResults.push(r.value);
    }

    debug.layerResults = layerResults;

    // ═══════════════════════════════════════════════════
    // 🗳️ VOTING SYSTEM
    // ═══════════════════════════════════════════════════

    const consensus = runVotingConsensus(layerResults);
    debug.consensus = consensus;

    if (!consensus || consensus.finalScore < 0.4) {
      return json({
        success: false,
        platform,
        reason: 'Could not confidently identify anime from any layer',
        candidates: consensus?.allCandidates || [],
        timeMs: Date.now() - startTime,
        ...(debugMode ? { debug } : {}),
      });
    }

    // ═══════════════════════════════════════════════════
    // ✅ VALIDATE WITH ANIMOTV
    // ═══════════════════════════════════════════════════

    const validated = await validateWithAnimoTV(consensus.animeName, url.origin);
    debug.validated = validated;

    const finalSlug = validated?.slug || slugify(consensus.animeName);
    const finalEpisode = consensus.episode || extractEpisodeFromText(`${fbMeta.title} ${fbMeta.description}`) || 1;
    const finalName = validated?.title || consensus.animeName;

    const response = {
      success: true,
      platform,
      resolvedType: 'anime' as const,
      source: 'multi-layer-voting',
      title: finalName,
      slug: finalSlug,
      episode: finalEpisode,
      redirectUrl: `/reels/anime_${finalSlug}_ep${finalEpisode}`,
      confidence: Math.min(consensus.finalScore, 0.99),
      layersUsed: layerResults.filter((r) => r.success).length,
      totalLayers: layerResults.length,
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
// 🎯 LAYER 1: Local FB Dataset
// ═══════════════════════════════════════════════════════════════════

async function layerFbDataset(fbMeta: any): Promise<LayerResult> {
  const start = Date.now();
  if (fbMeta?.animeSlug && fbMeta?.animeName) {
    return {
      layer: 'fb-dataset',
      weight: 100,
      success: true,
      animeName: fbMeta.animeName,
      animeSlug: fbMeta.animeSlug,
      episode: fbMeta.episode || null,
      confidence: fbMeta.confidence || 0.85,
      timeMs: Date.now() - start,
    };
  }
  return {
    layer: 'fb-dataset',
    weight: 100,
    success: false,
    confidence: 0,
    timeMs: Date.now() - start,
    error: 'No pre-resolved match in dataset',
  };
}

// ═══════════════════════════════════════════════════════════════════
// 🎌 LAYER 2: trace.moe (Anime Scene Detection from Image)
// ═══════════════════════════════════════════════════════════════════

async function layerTraceMoe(thumbnailUrl: string): Promise<LayerResult> {
  const start = Date.now();
  try {
    const apiUrl = `https://api.trace.moe/search?anilistInfo&url=${encodeURIComponent(thumbnailUrl)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`trace.moe HTTP ${res.status}`);
    const data: any = await res.json();

    if (!data.result || !data.result.length) {
      return {
        layer: 'tracemoe',
        weight: 90,
        success: false,
        confidence: 0,
        timeMs: Date.now() - start,
        error: 'No trace.moe matches',
      };
    }

    const top = data.result[0];
    const anilist = top.anilist || {};
    const titleObj = anilist.title || {};
    const animeName =
      titleObj.english || titleObj.romaji || titleObj.native || top.filename || 'Unknown';

    return {
      layer: 'tracemoe',
      weight: 90,
      success: true,
      animeName,
      episode: top.episode || null,
      confidence: Math.min(top.similarity || 0.5, 0.99),
      raw: { anilistId: anilist.id, similarity: top.similarity },
      timeMs: Date.now() - start,
    };
  } catch (e: any) {
    return {
      layer: 'tracemoe',
      weight: 90,
      success: false,
      confidence: 0,
      timeMs: Date.now() - start,
      error: e.message || 'trace.moe failed',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 🤖 LAYER 3: Gemini Vision (Analyze Thumbnail)
// ═══════════════════════════════════════════════════════════════════

async function layerGeminiVision(thumbnailUrl: string, apiKey: string): Promise<LayerResult> {
  const start = Date.now();
  try {
    // First fetch image and convert to base64
    const imgRes = await fetch(thumbnailUrl);
    if (!imgRes.ok) throw new Error('Image fetch failed');
    const imgBuffer = await imgRes.arrayBuffer();
    const base64 = arrayBufferToBase64(imgBuffer);
    const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';

    const prompt = `You are an expert anime identifier. Look at this image and identify the anime. Respond ONLY in JSON format:
{
  "animeName": "exact anime name in English",
  "confidence": 0.0-1.0,
  "characters": ["character names visible"],
  "reasoning": "brief why"
}
If you cannot identify with confidence, set animeName to null.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;

    const body = {
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data: any = await res.json();

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = extractJsonFromText(text);

    if (!parsed || !parsed.animeName) {
      return {
        layer: 'gemini-vision',
        weight: 70,
        success: false,
        confidence: 0,
        timeMs: Date.now() - start,
        error: 'Gemini could not identify',
      };
    }

    return {
      layer: 'gemini-vision',
      weight: 70,
      success: true,
      animeName: parsed.animeName,
      confidence: Number(parsed.confidence) || 0.6,
      raw: parsed,
      timeMs: Date.now() - start,
    };
  } catch (e: any) {
    return {
      layer: 'gemini-vision',
      weight: 70,
      success: false,
      confidence: 0,
      timeMs: Date.now() - start,
      error: e.message || 'Gemini vision failed',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 🤖 LAYER 4: Gemini Text (Analyze Caption/Description)
// ═══════════════════════════════════════════════════════════════════

async function layerGeminiText(title: string, description: string, apiKey: string): Promise<LayerResult> {
  const start = Date.now();
  try {
    const combined = `${title || ''} ${description || ''}`.trim();
    const prompt = `You are an expert anime identifier. This is a Facebook post caption about an anime clip. Identify which anime it's from.

CAPTION: "${combined}"

Look for:
- Character names (e.g. Kirito, Kazuma, Kafka, Tanjiro)
- Anime titles or hashtags
- Plot references
- Series-specific terms

Respond ONLY in JSON:
{
  "animeName": "exact anime name",
  "episode": number or null,
  "confidence": 0.0-1.0,
  "reasoning": "why"
}
If unsure, set animeName to null.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 250 },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data: any = await res.json();

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = extractJsonFromText(text);

    if (!parsed || !parsed.animeName) {
      return {
        layer: 'gemini-text',
        weight: 50,
        success: false,
        confidence: 0,
        timeMs: Date.now() - start,
        error: 'No identification from caption',
      };
    }

    return {
      layer: 'gemini-text',
      weight: 50,
      success: true,
      animeName: parsed.animeName,
      episode: parsed.episode || null,
      confidence: Number(parsed.confidence) || 0.5,
      raw: parsed,
      timeMs: Date.now() - start,
    };
  } catch (e: any) {
    return {
      layer: 'gemini-text',
      weight: 50,
      success: false,
      confidence: 0,
      timeMs: Date.now() - start,
      error: e.message || 'Gemini text failed',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// ⚡ LAYER 5: Groq Text (Ultra-fast LLM backup)
// ═══════════════════════════════════════════════════════════════════

async function layerGroqText(title: string, description: string, apiKey: string): Promise<LayerResult> {
  const start = Date.now();
  try {
    const combined = `${title || ''} ${description || ''}`.trim();
    const prompt = `Identify the anime from this Facebook caption. Respond ONLY in JSON.

CAPTION: "${combined}"

{
  "animeName": "exact name or null",
  "episode": number or null,
  "confidence": 0.0-1.0
}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are an anime identification expert. Respond only with JSON.' },
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

    if (!parsed || !parsed.animeName) {
      return {
        layer: 'groq-text',
        weight: 45,
        success: false,
        confidence: 0,
        timeMs: Date.now() - start,
        error: 'No identification',
      };
    }

    return {
      layer: 'groq-text',
      weight: 45,
      success: true,
      animeName: parsed.animeName,
      episode: parsed.episode || null,
      confidence: Number(parsed.confidence) || 0.5,
      raw: parsed,
      timeMs: Date.now() - start,
    };
  } catch (e: any) {
    return {
      layer: 'groq-text',
      weight: 45,
      success: false,
      confidence: 0,
      timeMs: Date.now() - start,
      error: e.message || 'Groq failed',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 📚 LAYER 6: AniList GraphQL Search
// ═══════════════════════════════════════════════════════════════════

async function layerAniListSearch(title: string, description: string): Promise<LayerResult> {
  const start = Date.now();
  try {
    // Extract likely anime/character keywords
    const combined = `${title || ''} ${description || ''}`;
    const cleanedQuery = extractSearchableKeywords(combined);

    if (!cleanedQuery || cleanedQuery.length < 3) {
      return {
        layer: 'anilist',
        weight: 40,
        success: false,
        confidence: 0,
        timeMs: Date.now() - start,
        error: 'No usable keywords',
      };
    }

    const query = `
      query ($search: String) {
        Page(page: 1, perPage: 5) {
          media(search: $search, type: ANIME) {
            id
            title { english romaji native }
            popularity
          }
        }
      }
    `;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ query, variables: { search: cleanedQuery } }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
    const data: any = await res.json();

    const media = data?.data?.Page?.media || [];
    if (!media.length) {
      return {
        layer: 'anilist',
        weight: 40,
        success: false,
        confidence: 0,
        timeMs: Date.now() - start,
        error: 'No AniList results',
      };
    }

    // Take most popular
    media.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0));
    const top = media[0];
    const name = top.title.english || top.title.romaji || top.title.native;

    return {
      layer: 'anilist',
      weight: 40,
      success: true,
      animeName: name,
      confidence: 0.5,
      raw: { anilistId: top.id, query: cleanedQuery },
      timeMs: Date.now() - start,
    };
  } catch (e: any) {
    return {
      layer: 'anilist',
      weight: 40,
      success: false,
      confidence: 0,
      timeMs: Date.now() - start,
      error: e.message || 'AniList failed',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 🗳️ VOTING CONSENSUS ENGINE
// ═══════════════════════════════════════════════════════════════════

function runVotingConsensus(results: LayerResult[]) {
  const successful = results.filter((r) => r.success && r.animeName);
  if (!successful.length) return null;

  // Normalize anime names and group votes
  const voteMap = new Map<string, {
    displayName: string;
    totalScore: number;
    voteCount: number;
    layers: string[];
    episodes: number[];
    highestConfidence: number;
  }>();

  for (const r of successful) {
    const normalized = normalizeAnimeName(r.animeName!);
    if (!normalized) continue;

    const score = r.weight * r.confidence;
    const existing = voteMap.get(normalized);

    if (existing) {
      existing.totalScore += score;
      existing.voteCount += 1;
      existing.layers.push(r.layer);
      if (r.episode) existing.episodes.push(r.episode);
      if (r.confidence > existing.highestConfidence) {
        existing.highestConfidence = r.confidence;
        existing.displayName = r.animeName!;
      }
    } else {
      voteMap.set(normalized, {
        displayName: r.animeName!,
        totalScore: score,
        voteCount: 1,
        layers: [r.layer],
        episodes: r.episode ? [r.episode] : [],
        highestConfidence: r.confidence,
      });
    }
  }

  const candidates = Array.from(voteMap.entries())
    .map(([norm, v]) => ({
      normalized: norm,
      name: v.displayName,
      score: v.totalScore,
      votes: v.voteCount,
      layers: v.layers,
      episode: v.episodes.length ? mostCommon(v.episodes) : null,
      confidence: v.highestConfidence,
    }))
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) return null;

  const winner = candidates[0];
  const totalPossibleScore = successful.reduce((sum, r) => sum + r.weight, 0);
  const finalScore = totalPossibleScore ? winner.score / totalPossibleScore : 0;

  // Boost if multiple layers agree
  const agreementBoost = winner.votes >= 3 ? 0.15 : winner.votes >= 2 ? 0.08 : 0;

  return {
    animeName: winner.name,
    episode: winner.episode,
    finalScore: Math.min(finalScore + agreementBoost, 0.99),
    voteCount: winner.votes,
    supportingLayers: winner.layers,
    allCandidates: candidates.slice(0, 5),
  };
}

function mostCommon(arr: number[]): number {
  const counts = new Map<number, number>();
  for (const n of arr) counts.set(n, (counts.get(n) || 0) + 1);
  let best = arr[0];
  let bestCount = 0;
  for (const [k, v] of counts) {
    if (v > bestCount) {
      best = k;
      bestCount = v;
    }
  }
  return best;
}

function normalizeAnimeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(season|part|the|a|an|of|kimetsu no yaiba|s\d+)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ═══════════════════════════════════════════════════════════════════
// ✅ VALIDATE WITH ANIMOTV
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

    const items = data?.results || data?.data || data?.matches || (Array.isArray(data) ? data : []);
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
// 🛠️ HELPERS
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

function extractSearchableKeywords(text: string): string {
  let t = text.toLowerCase();
  t = t.replace(/https?:\/\/\S+/g, ' ');
  t = t.replace(/[^\w\s#]/g, ' ');
  const noise = ['bro', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'this', 'that', 'his', 'her', 'him', 'she',
    'he', 'they', 'them', 'their', 'when', 'what', 'who', 'why', 'how', 'anime', 'episode', 'ep', 'clip',
    'scene', 'moment', 'reaction', 'viral', 'watch', 'video', 'reel', 'short', 'funny', 'lmao', 'lol'];
  const words = t.split(/\s+/).filter((w) => w.length > 2 && !noise.includes(w));
  const hashtags = words.filter((w) => w.startsWith('#')).map((w) => w.slice(1));
  const proper = words.filter((w) => !w.startsWith('#')).slice(0, 5);
  return [...hashtags, ...proper].join(' ').trim();
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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.slice(i, i + chunkSize)));
  }
  return btoa(binary);
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
