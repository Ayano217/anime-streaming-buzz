// src/pages/api/video-search.ts
// Multi-source anime video search — GogoAnime, AniWaves, Yomi, KickAss, Nyaa
import type { APIRoute } from 'astro';

const CONSUMET = 'https://api.consumet.org';
const JIKAN    = 'https://api.jikan.moe/v4';
const TIMEOUT  = 6000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  ms = TIMEOUT
): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

// ── Source: Consumet → GogoAnime ─────────────────────────────────────────────

async function searchConsumetGogo(query: string, episode: number) {
  try {
    const url = `${CONSUMET}/anime/gogoanime/${encodeURIComponent(query)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const data = await res.json();

    const results = data?.results ?? [];
    if (!results.length) return null;

    // Pick best match
    const best = results.find((r: any) =>
      r.title?.toLowerCase().includes(query.toLowerCase())
    ) ?? results[0];

    // Fetch episode stream info
    const epId = `${best.id}-episode-${episode}`;
    const streamUrl = `${CONSUMET}/anime/gogoanime/watch/${encodeURIComponent(epId)}`;
    const sRes = await fetchWithTimeout(streamUrl);
    if (!sRes.ok) return null;
    const sData = await sRes.json();

    const sources: any[] = sData?.sources ?? [];
    // Prefer 1080p → 720p → default
    const best_src =
      sources.find((s: any) => s.quality === '1080p') ||
      sources.find((s: any) => s.quality === '720p') ||
      sources[0];

    if (!best_src?.url) return null;

    return {
      source: 'gogoanime',
      label: 'GogoAnime',
      type: 'hls',
      url: best_src.url,
      quality: best_src.quality ?? 'auto',
      subtitles: sData?.subtitles ?? [],
      intro: sData?.intro ?? null,
      direct: true,
      priority: 1,
    };
  } catch {
    return null;
  }
}

// ── Source: AniWaves ─────────────────────────────────────────────────────────

async function searchAniWaves(malId: string | null, query: string, episode: number) {
  try {
    // AniWaves uses MAL ID in URL: /watch/{mal_id}/ep-{ep}
    if (!malId) return null;
    return {
      source: 'aniwaves',
      label: 'AniWaves',
      type: 'embed',
      url: `https://aniwaves.ru/watch/${malId}/ep-${episode}`,
      embedUrl: `https://aniwaves.ru/watch/${malId}/ep-${episode}`,
      direct: false,
      priority: 2,
    };
  } catch {
    return null;
  }
}

// ── Source: Yomi ─────────────────────────────────────────────────────────────

async function searchYomi(malId: string | null, episode: number) {
  try {
    if (!malId) return null;
    return {
      source: 'yomi',
      label: 'Yomi',
      type: 'embed',
      url: `https://yomi.to/watch/${malId}/${episode}`,
      embedUrl: `https://yomi.to/watch/${malId}/${episode}`,
      direct: false,
      priority: 3,
    };
  } catch {
    return null;
  }
}

// ── Source: KickAssAnime ─────────────────────────────────────────────────────

async function searchKickAss(query: string, episode: number) {
  try {
    const slug = slugify(query);
    return {
      source: 'kickassanime',
      label: 'KickAssAnime',
      type: 'embed',
      url: `https://kickassanime.com.es/${slug}-episode-${episode}-english-subbed/`,
      embedUrl: `https://kickassanime.com.es/${slug}-episode-${episode}-english-subbed/`,
      direct: false,
      priority: 4,
    };
  } catch {
    return null;
  }
}

// ── Source: Nyaa Torrent RSS ──────────────────────────────────────────────────

async function searchNyaa(query: string, episode: number) {
  try {
    const ep = String(episode).padStart(2, '0');
    const q  = encodeURIComponent(`${query} ${ep}`);
    const rssUrl = `https://nyaa.si/?page=rss&q=${q}&c=1_0&f=0`;
    const res = await fetchWithTimeout(rssUrl, {}, 5000);
    if (!res.ok) return null;
    const text = await res.text();

    // Parse RSS items
    const items: any[] = [];
    const itemRx = /<item>([\s\S]*?)<\/item>/g;
    let m: RegExpExecArray | null;
    while ((m = itemRx.exec(text)) !== null && items.length < 5) {
      const block = m[1];
      const titleM = /<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(block);
      const linkM  = /<link>(.*?)<\/link>/.exec(block)
                  || /<guid[^>]*>(.*?)<\/guid>/.exec(block);
      const sizeM  = /nyaa:size>(.*?)<\//.exec(block);
      const seedM  = /nyaa:seeders>(.*?)<\//.exec(block);

      if (titleM && linkM) {
        items.push({
          title: titleM[1].trim(),
          link:  linkM[1].trim(),
          size:  sizeM?.[1]?.trim() ?? 'N/A',
          seeds: parseInt(seedM?.[1] ?? '0', 10),
        });
      }
    }

    // Best: most seeded
    items.sort((a, b) => b.seeds - a.seeds);
    const best = items[0];
    if (!best) return null;

    return {
      source: 'nyaa',
      label: 'Nyaa Torrent',
      type: 'torrent',
      url: best.link,
      title: best.title,
      size: best.size,
      seeds: best.seeds,
      allResults: items,
      direct: false,
      priority: 5,
    };
  } catch {
    return null;
  }
}

// ── MAL ID lookup via Jikan ───────────────────────────────────────────────────

async function getMalId(query: string): Promise<string | null> {
  try {
    const url = `${JIKAN}/anime?q=${encodeURIComponent(query)}&limit=1`;
    const res = await fetchWithTimeout(url, {}, 5000);
    if (!res.ok) return null;
    const data = await res.json();
    const id = data?.data?.[0]?.mal_id;
    return id ? String(id) : null;
  } catch {
    return null;
  }
}

// ── Main Handler ──────────────────────────────────────────────────────────────

export const GET: APIRoute = async ({ url }) => {
  const params  = url.searchParams;
  const query   = params.get('q') ?? params.get('query') ?? '';
  const episode = parseInt(params.get('ep') ?? params.get('episode') ?? '1', 10);
  const malId   = params.get('mal_id') ?? null;
  const source  = params.get('source') ?? 'all'; // 'all' | specific source id

  if (!query && !malId) {
    return new Response(
      JSON.stringify({ error: 'query (q) or mal_id required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    'Access-Control-Allow-Origin': '*',
  };

  // Get MAL ID if not provided
  const resolvedMalId = malId ?? (query ? await getMalId(query) : null);

  // Parallel fetch from all sources
  const [gogo, waves, yomi, kick, nyaa] = await Promise.allSettled([
    source === 'all' || source === 'gogoanime'
      ? searchConsumetGogo(query, episode)
      : Promise.resolve(null),
    source === 'all' || source === 'aniwaves'
      ? searchAniWaves(resolvedMalId, query, episode)
      : Promise.resolve(null),
    source === 'all' || source === 'yomi'
      ? searchYomi(resolvedMalId, episode)
      : Promise.resolve(null),
    source === 'all' || source === 'kickassanime'
      ? searchKickAss(query, episode)
      : Promise.resolve(null),
    source === 'all' || source === 'nyaa'
      ? searchNyaa(query, episode)
      : Promise.resolve(null),
  ]);

  const extract = (r: PromiseSettledResult<any>) =>
    r.status === 'fulfilled' && r.value ? r.value : null;

  const sources = [
    extract(gogo),
    extract(waves),
    extract(yomi),
    extract(kick),
    extract(nyaa),
  ].filter(Boolean);

  // Sort by priority
  sources.sort((a: any, b: any) => (a.priority ?? 99) - (b.priority ?? 99));

  return new Response(
    JSON.stringify({
      query,
      episode,
      mal_id: resolvedMalId,
      total: sources.length,
      sources,
      recommended: sources[0] ?? null,
      timestamp: Date.now(),
    }),
    { status: 200, headers }
  );
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body  = await request.json();
    const reqUrl = new URL(
      `/api/video-search?q=${encodeURIComponent(body.query ?? '')}&ep=${body.episode ?? 1}&mal_id=${body.mal_id ?? ''}`,
      'http://localhost'
    );
    return GET({ url: reqUrl } as any);
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
