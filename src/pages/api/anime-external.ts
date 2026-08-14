// src/pages/api/anime-external.ts
// External anime metadata + stream URL resolver
import type { APIRoute } from 'astro';

const CONSUMET = 'https://api.consumet.org';
const JIKAN    = 'https://api.jikan.moe/v4';
const TIMEOUT  = 7000;

async function withTimeout(p: Promise<any>, ms = TIMEOUT): Promise<any> {
  return Promise.race([
    p,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error('timeout')), ms)
    ),
  ]);
}

// ── Anime Info: Jikan (MAL) ───────────────────────────────────────────────────

async function getAnimeInfo(malId: string) {
  try {
    const [infoRes, epsRes] = await Promise.all([
      fetch(`${JIKAN}/anime/${malId}`),
      fetch(`${JIKAN}/anime/${malId}/episodes`),
    ]);
    const info = infoRes.ok ? await infoRes.json() : null;
    const eps  = epsRes.ok  ? await epsRes.json()  : null;
    return {
      info:     info?.data ?? null,
      episodes: eps?.data  ?? [],
    };
  } catch {
    return { info: null, episodes: [] };
  }
}

// ── Consumet: GogoAnime Episode Sources ──────────────────────────────────────

async function getGogoSources(animeId: string, episode: number) {
  try {
    const epId  = `${animeId}-episode-${episode}`;
    const res   = await fetch(
      `${CONSUMET}/anime/gogoanime/watch/${encodeURIComponent(epId)}`
    );
    if (!res.ok) return null;
    const data  = await res.json();
    return data?.sources ?? null;
  } catch {
    return null;
  }
}

// ── Consumet: Zoro (backup) ───────────────────────────────────────────────────

async function getZoroSources(query: string, episode: number) {
  try {
    const searchRes = await fetch(
      `${CONSUMET}/anime/zoro/${encodeURIComponent(query)}`
    );
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const first = searchData?.results?.[0];
    if (!first?.id) return null;

    const infoRes = await fetch(
      `${CONSUMET}/anime/zoro/info?id=${encodeURIComponent(first.id)}`
    );
    if (!infoRes.ok) return null;
    const infoData = await infoRes.json();

    const ep = infoData?.episodes?.find((e: any) => e.number === episode)
             ?? infoData?.episodes?.[episode - 1];
    if (!ep?.id) return null;

    const srcRes = await fetch(
      `${CONSUMET}/anime/zoro/watch?episodeId=${encodeURIComponent(ep.id)}`
    );
    if (!srcRes.ok) return null;
    const srcData = await srcRes.json();
    return srcData?.sources ?? null;
  } catch {
    return null;
  }
}

// ── Main Handler ──────────────────────────────────────────────────────────────

export const GET: APIRoute = async ({ url }) => {
  const params  = url.searchParams;
  const action  = params.get('action') ?? 'info';
  const malId   = params.get('mal_id') ?? '';
  const gogoId  = params.get('gogo_id') ?? '';
  const query   = params.get('q') ?? '';
  const episode = parseInt(params.get('ep') ?? '1', 10);

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=180, stale-while-revalidate=60',
    'Access-Control-Allow-Origin': '*',
  };

  // action=info → Jikan metadata
  if (action === 'info' && malId) {
    const { info, episodes } = await getAnimeInfo(malId);
    return new Response(
      JSON.stringify({ mal_id: malId, info, episodes }),
      { status: 200, headers }
    );
  }

  // action=sources → GogoAnime + Zoro sources
  if (action === 'sources') {
    const [gogoSrcs, zoroSrcs] = await Promise.allSettled([
      gogoId ? getGogoSources(gogoId, episode) : Promise.resolve(null),
      query  ? getZoroSources(query, episode)  : Promise.resolve(null),
    ]);

    const gogo = gogoSrcs.status === 'fulfilled' ? gogoSrcs.value : null;
    const zoro = zoroSrcs.status === 'fulfilled' ? zoroSrcs.value : null;

    // Merge & dedupe
    const allSources = [
      ...(gogo ?? []).map((s: any) => ({ ...s, provider: 'gogoanime' })),
      ...(zoro ?? []).map((s: any) => ({ ...s, provider: 'zoro' })),
    ];

    // Best quality selector
    const best =
      allSources.find(s => s.quality === '1080p') ??
      allSources.find(s => s.quality === '720p')  ??
      allSources[0] ?? null;

    return new Response(
      JSON.stringify({
        episode,
        sources: allSources,
        recommended: best,
        providers: {
          gogoanime: !!gogo,
          zoro:      !!zoro,
        },
      }),
      { status: 200, headers }
    );
  }

  // action=search → Consumet search
  if (action === 'search' && query) {
    try {
      const res  = await fetch(
        `${CONSUMET}/anime/gogoanime/${encodeURIComponent(query)}`
      );
      const data = res.ok ? await res.json() : { results: [] };
      return new Response(
        JSON.stringify({ query, results: data?.results ?? [] }),
        { status: 200, headers }
      );
    } catch {
      return new Response(
        JSON.stringify({ query, results: [] }),
        { status: 200, headers }
      );
    }
  }

  return new Response(
    JSON.stringify({
      error: 'Invalid action. Use: info, sources, search',
      usage: {
        info:    '?action=info&mal_id=21',
        sources: '?action=sources&gogo_id=one-piece&ep=1',
        search:  '?action=search&q=one+piece',
      },
    }),
    { status: 400, headers }
  );
};
