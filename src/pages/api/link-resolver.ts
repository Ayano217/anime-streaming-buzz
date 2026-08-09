import type { APIRoute } from 'astro';

export const prerender = false;

// ═══════════════════════════════════════════════════════════════════
// 🧠 ATBIE v1.3 — Confidence fix + Multi-provider fallback
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
  const geminiKey = env.GEMINI_API_KEY || '';
  const groqKey = env.GROQ_API_KEY || '';
  const openrouterKey = env.OPENROUTER_API_KEY || '';
  const togetherKey = env.TOGETHER_API_KEY || '';

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

    const fbMeta = await getFacebookMetadata(fbId, url.origin);
    debug.fbMeta = fbMeta;

    if (!fbMeta) {
      return json({
        success: false,
        platform,
        reason: 'Facebook video not found in dataset.',
        ...(debugMode ? { debug } : {}),
      });
    }

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

    const layerPromises: Promise<LayerResult>[] = [];

    layerPromises.push(layerFbDataset(fbMeta));

    if (fbMeta.thumbnail) {
      layerPromises.push(layerTraceMoe(fbMeta.thumbnail));
    }

    // Gemini Text ONLY (removed Vision — waste of quota)
    if ((fbMeta.title || fbMeta.description) && geminiKey) {
      layerPromises.push(layerGeminiText(fbMeta.title, fbMeta.description, geminiKey));
    }

    if ((fbMeta.title || fbMeta.description) && groqKey) {
      layerPromises.push(layerGroqText(fbMeta.title, fbMeta.description, groqKey));
    }

    if ((fbMeta.title || fbMeta.description) && openrouterKey) {
      layerPromises.push(layerOpenRouterText(fbMeta.title, fbMeta.description, openrouterKey));
    }

    if ((fbMeta.title || fbMeta.description) && togetherKey) {
      layerPromises.push(layerTogetherText(fbMeta.title, fbMeta.description, togetherKey));
    }

    if (fbMeta.title || fbMeta.description) {
      layerPromises.push(layerJikanSearch(fbMeta.title, fbMeta.description));
    }

    const results = await Promise.race([
      Promise.allSettled(layerPromises),
      new Promise<PromiseSettledResult<LayerResult>[]>((resolve) =>
        setTimeout(() => resolve([]), 9000)
      ),
    ]);

    const layerResults: LayerResult[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') layerResults.push(r.value);
    }

    debug.layerResults = layerResults;

    const consensus = runVotingConsensus(layerResults);
    debug.consensus = consensus;

    if (!consensus || consensus.finalScore < 0.35) {
      return json({
        success: false,
        platform,
        reason: 'Could not confidently identify anime',
        candidates: consensus?.allCandidates || [],
        timeMs: Date.now() - startTime,
        ...(debugMode ? { debug } : {}),
      });
    }

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
// LAYER 1: FB Dataset
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
    error: 'No pre-resolved match',
  };
}

// ═══════════════════════════════════════════════════════════════════
// LAYER 2: trace.moe
// ═══════════════════════════════════════════════════════════════════
async function layerTraceMoe(thumbnailUrl: string): Promise<LayerResult> {
  const start = Date.now();
  try {
    const apiUrl = `https://api.trace.moe/search?anilistInfo&cutBorders&url=${encodeURIComponent(thumbnailUrl)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`trace.moe HTTP ${res.status}`);
    const data: any = await res.json();

    if (!data.result || !data.result.length) {
      return {
        layer: 'tracemoe',
        weight: 60,
        success: false,
        confidence: 0,
        timeMs: Date.now() - start,
        error: 'No matches',
      };
    }

    const top = data.result[0];
    const similarity = top.similarity || 0;

    if (similarity < 0.87) {
      return {
        layer: 'tracemoe',
        weight: 60,
        success: false,
        confidence: 0,
        timeMs: Date.now() - start,
        error: `Similarity too low: ${similarity.toFixed(2)}`,
      };
    }

    const anilist = top.anilist || {};
    const titleObj = anilist.title || {};
    const animeName =
      titleObj.english || titleObj.romaji || titleObj.native || top.filename || 'Unknown';

    const dynamicWeight = similarity >= 0.95 ? 85 : similarity >= 0.90 ? 65 : 50;

    return {
      layer: 'tracemoe',
      weight: dynamicWeight,
      success: true,
      animeName,
      episode: top.episode || null,
      confidence: Math.min(similarity, 0.99),
      raw: { anilistId: anilist.id, similarity },
      timeMs: Date.now() - start,
    };
  } catch (e: any) {
    return {
      layer: 'tracemoe',
      weight: 60,
      success: false,
      confidence: 0,
      timeMs: Date.now() - start,
      error: e.message || 'trace.moe failed',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// LAYER 3: Gemini Text (Text only — Vision removed for quota)
// ═══════════════════════════════════════════════════════════════════
async function layerGeminiText(title: string, description: string, apiKey: string): Promise<LayerResult> {
  const start = Date.now();
  try {
    const combined = `${title || ''} ${description || ''}`.trim();
    const prompt = `Identify the anime from this Facebook caption. Look for character names (Kirito, Kazuma, Kafka, Tanjiro etc), titles, hashtags, plot references.

CAPTION: "${combined}"

Respond ONLY in JSON:
{
  "animeName": "exact anime name or null",
  "episode": number or null,
  "confidence": 0.0-1.0
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 200 },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 80)}`);
    }
    const data: any = await res.json();

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = extractJsonFromText(text);

    if (!parsed || !parsed.animeName || parsed.animeName === 'null') {
      return {
        layer: 'gemini-text',
        weight: 75,
        success: false,
        confidence: 0,
        timeMs: Date.now() - start,
        error: 'No identification',
      };
    }

    return {
      layer: 'gemini-text',
      weight: 75,
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
      weight: 75,
      success: false,
      confidence: 0,
      timeMs: Date.now() - start,
      error: e.message || 'Gemini failed',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// LAYER 4: Groq (BEST performer)
// ═══════════════════════════════════════════════════════════════════
async function layerGroqText(title: string, description: string, apiKey: string): Promise<LayerResult> {
  const start = Date.now();
  try {
    const combined = `${title || ''} ${description || ''}`.trim();
    const prompt = `Identify the anime from this Facebook caption. Look for character names, hashtags, series references.

CAPTION: "${combined}"

Respond ONLY in JSON:
{
  "animeName": "exact anime name or null",
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
          { role: 'system', content: 'You are an expert anime identifier. Respond only with valid JSON.' },
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
      return {
        layer: 'groq-text',
        weight: 90,
        success: false,
        confidence: 0,
        timeMs: Date.now() - start,
        error: 'No identification',
      };
    }

    return {
      layer: 'groq-text',
      weight: 90,
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
      weight: 90,
      success: false,
      confidence: 0,
      timeMs: Date.now() - start,
      error: e.message || 'Groq failed',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// LAYER 5: OpenRouter (tries multiple free models)
// ═══════════════════════════════════════════════════════════════════
async function layerOpenRouterText(title: string, description: string, apiKey: string): Promise<LayerResult> {
  const start = Date.now();

  const models = [
    'google/gemini-2.0-flash-exp:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'qwen/qwen-2.5-72b-instruct:free',
    'mistralai/mistral-7b-instruct:free',
  ];

  const combined = `${title || ''} ${description || ''}`.trim();
  const prompt = `Identify the anime from this Facebook caption. Look for character names, series titles, hashtags.

CAPTION: "${combined}"

Respond ONLY in valid JSON:
{"animeName": "name or null", "episode": number or null, "confidence": 0.0-1.0}`;

  for (const model of models) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
          'http-referer': 'https://anime-streaming-buzz.pages.dev',
          'x-title': 'AniTubeBuzz',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'You are an anime identifier. Respond only with JSON.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
          max_tokens: 200,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) continue;
      const data: any = await res.json();
      const text = data?.choices?.[0]?.message?.content || '';
      const parsed = extractJsonFromText(text);

      if (parsed && parsed.animeName && parsed.animeName !== 'null') {
        return {
          layer: 'openrouter-text',
          weight: 60,
          success: true,
          animeName: parsed.animeName,
          episode: parsed.episode || null,
          confidence: Number(parsed.confidence) || 0.5,
          raw: { model, ...parsed },
          timeMs: Date.now() - start,
        };
      }
    } catch (e) {
      continue;
    }
  }

  return {
    layer: 'openrouter-text',
    weight: 60,
    success: false,
    confidence: 0,
    timeMs: Date.now() - start,
    error: 'All models failed',
  };
}

// ═══════════════════════════════════════════════════════════════════
// LAYER 6: Together AI (NEW)
// ═══════════════════════════════════════════════════════════════════
async function layerTogetherText(title: string, description: string, apiKey: string): Promise<LayerResult> {
  const start = Date.now();
  try {
    const combined = `${title || ''} ${description || ''}`.trim();
    const prompt = `Identify the anime from this Facebook caption. Look for character names, series titles, hashtags.

CAPTION: "${combined}"

Respond ONLY in valid JSON:
{"animeName": "name or null", "episode": number or null, "confidence": 0.0-1.0}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const res = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
        messages: [
          { role: 'system', content: 'You are an anime identifier. Respond only with JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 200,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`Together HTTP ${res.status}`);
    const data: any = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    const parsed = extractJsonFromText(text);

    if (!parsed || !parsed.animeName || parsed.animeName === 'null') {
      return {
        layer: 'together-text',
        weight: 65,
        success: false,
        confidence: 0,
        timeMs: Date.now() - start,
        error: 'No identification',
      };
    }

    return {
      layer: 'together-text',
      weight: 65,
      success: true,
      animeName: parsed.animeName,
      episode: parsed.episode || null,
      confidence: Number(parsed.confidence) || 0.5,
      raw: parsed,
      timeMs: Date.now() - start,
    };
  } catch (e: any) {
    return {
      layer: 'together-text',
      weight: 65,
      success: false,
      confidence: 0,
      timeMs: Date.now() - start,
      error: e.message || 'Together failed',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// LAYER 7: Jikan
// ═══════════════════════════════════════════════════════════════════
async function layerJikanSearch(title: string, description: string): Promise<LayerResult> {
  const start = Date.now();
  try {
    const combined = `${title || ''} ${description || ''}`;
    const cleanedQuery = extractSearchableKeywords(combined);

    if (!cleanedQuery || cleanedQuery.length < 3) {
      return {
        layer: 'jikan',
        weight: 45,
        success: false,
        confidence: 0,
        timeMs: Date.now() - start,
        error: 'No usable keywords',
      };
    }

    const apiUrl = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(cleanedQuery)}&limit=3`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(apiUrl, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`Jikan HTTP ${res.status}`);
    const data: any = await res.json();

    const items = data?.data || [];
    if (!items.length) {
      return {
        layer: 'jikan',
        weight: 45,
        success: false,
        confidence: 0,
        timeMs: Date.now() - start,
        error: 'No results',
      };
    }

    const top = items[0];
    const name = top.title_english || top.title || top.title_japanese;

    return {
      layer: 'jikan',
      weight: 45,
      success: true,
      animeName: name,
      confidence: 0.5,
      raw: { malId: top.mal_id, query: cleanedQuery },
      timeMs: Date.now() - start,
    };
  } catch (e: any) {
    return {
      layer: 'jikan',
      weight: 45,
      success: false,
      confidence: 0,
      timeMs: Date.now() - start,
      error: e.message || 'Jikan failed',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// FIXED VOTING — Only count actual attempts
// ═══════════════════════════════════════════════════════════════════
function runVotingConsensus(results: LayerResult[]) {
  const successful = results.filter((r) => r.success && r.animeName);
  if (!successful.length) return null;

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

  // ✅ FIXED: Only count SUCCESSFUL layers for max score (not failed ones)
  const successfulWeightTotal = successful.reduce((sum, r) => sum + r.weight, 0);

  // Winner's score / max possible from successful layers
  let baseScore = successfulWeightTotal ? winner.score / successfulWeightTotal : 0;

  // If single high-confidence source, still trust it
  if (winner.votes === 1 && winner.confidence >= 0.85) {
    baseScore = Math.max(baseScore, winner.confidence * 0.9);
  }

  const agreementBoost =
    winner.votes >= 4 ? 0.25 : winner.votes >= 3 ? 0.18 : winner.votes >= 2 ? 0.12 : 0;

  return {
    animeName: winner.name,
    episode: winner.episode,
    finalScore: Math.min(baseScore + agreementBoost, 0.99),
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

function extractSearchableKeywords(text: string): string {
  let t = text.toLowerCase();
  t = t.replace(/https?:\/\/\S+/g, ' ');
  t = t.replace(/[^\w\s#]/g, ' ');
  const noise = [
    'bro', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'this', 'that', 'his', 'her', 'him',
    'she', 'he', 'they', 'them', 'their', 'when', 'what', 'who', 'why', 'how', 'anime',
    'episode', 'ep', 'clip', 'scene', 'moment', 'reaction', 'viral', 'watch', 'video', 'reel',
    'short', 'funny', 'lmao', 'lol', 'and', 'or', 'but', 'for', 'not', 'you', 'your',
  ];
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
