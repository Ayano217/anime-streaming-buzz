// ═══════════════════════════════════════════════════════════════
// AniTube Buzz — External Anime API v4 (AnimoTVSlash + TMDB)
// Path: src/pages/api/anime-external.ts
//
// v4 CHANGES from v3:
//   ✅ Added tmdb_id + season_number in response (for Vidsrc/2embed streaming)
//   ✅ All original v3 functionality preserved:
//      - AnimoTVSlash search + detail + find actions
//      - TMDB real episode thumbnails (Netflix-style)
//      - Poster, description, episodes list
//      - Cache system
//      - Match scoring
//
// USED BY:
//   - src/pages/reels/[id].astro (for external anime pages)
//   - Any admin panels that need anime metadata
// ═══════════════════════════════════════════════════════════════

export const prerender = false;

import type { APIRoute } from 'astro';

const CACHE: Record<string, { data: any; time: number }> = {};
const CACHE_TTL = 30 * 60 * 1000;

const BASE = 'https://animotvslash.org';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w400';

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function cached(key: string): any | null {
  const c = CACHE[key];
  if (c && Date.now() - c.time < CACHE_TTL) return c.data;
  return null;
}

function setCache(key: string, data: any) {
  CACHE[key] = { data, time: Date.now() };
  const keys = Object.keys(CACHE);
  if (keys.length > 60) {
    const sorted = Object.entries(CACHE).sort((a, b) => a[1].time - b[1].time);
    sorted.slice(0, 20).forEach(([k]) => delete CACHE[k]);
  }
}

function cleanQuery(q: string): string {
  return q.replace(/[:\|]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchMediaUrl(mediaId: number): Promise<string> {
  try {
    const url = `${BASE}/wp-json/wp/v2/media/${mediaId}`;
    const res = await fetch(url);
    if (!res.ok) return '';
    const data: any = await res.json();
    return data.source_url || data.guid?.rendered || '';
  } catch (e) {
    return '';
  }
}

function matchScore(title: string, query: string): number {
  const t = title.toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return 0;
  let matched = 0;
  for (const w of words) if (t.includes(w)) matched++;
  return matched / words.length;
}

// ═══════════════════════════════════════════════════════════════
// TMDB HELPERS — Real episode thumbnails + TV ID for streaming
// ═══════════════════════════════════════════════════════════════

function cleanAnimeTitle(title: string): string {
  return title
    .replace(/\s*\(?\d{4}\)?\s*$/, '')
    .replace(/\s+season\s+\d+.*/i, '')
    .replace(/\s+s\d+.*/i, '')
    .replace(/\s+part\s+\d+.*/i, '')
    .replace(/\s+cour\s+\d+.*/i, '')
    .replace(/\s+\d+(?:st|nd|rd|th)\s+season.*/i, '')
    .replace(/[:\-–—].*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectSeasonNumber(title: string): number {
  const s1 = title.match(/season\s+(\d+)/i);
  if (s1) return parseInt(s1[1]);
  const s2 = title.match(/\bs(\d+)\b/i);
  if (s2) return parseInt(s2[1]);
  const ordinals: Record<string, number> = {
    'second': 2, '2nd': 2, 'third': 3, '3rd': 3, 'fourth': 4, '4th': 4,
    'fifth': 5, '5th': 5, 'sixth': 6, '6th': 6
  };
  const t = title.toLowerCase();
  for (const key of Object.keys(ordinals)) {
    if (t.includes(key + ' season')) return ordinals[key];
  }
  return 1;
}

async function tmdbSearchTv(title: string, apiKey: string): Promise<number | null> {
  try {
    const clean = cleanAnimeTitle(title);
    const isBearer = apiKey.length > 40;
    const url = isBearer
      ? `${TMDB_BASE}/search/tv?query=${encodeURIComponent(clean)}&language=en-US&include_adult=false`
      : `${TMDB_BASE}/search/tv?api_key=${apiKey}&query=${encodeURIComponent(clean)}&language=en-US&include_adult=false`;
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (isBearer) headers['Authorization'] = `Bearer ${apiKey}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (!data.results || data.results.length === 0) return null;
    const animeMatch = data.results.find((r: any) =>
      r.genre_ids && r.genre_ids.includes(16) && r.origin_country && r.origin_country.includes('JP')
    );
    if (animeMatch) return animeMatch.id;
    const animeAny = data.results.find((r: any) => r.genre_ids && r.genre_ids.includes(16));
    if (animeAny) return animeAny.id;
    return data.results[0].id;
  } catch (e) {
    return null;
  }
}

async function tmdbFetchSeasonEpisodes(tvId: number, seasonNum: number, apiKey: string): Promise<Record<number, string>> {
  const map: Record<number, string> = {};
  try {
    const isBearer = apiKey.length > 40;
    const url = isBearer
      ? `${TMDB_BASE}/tv/${tvId}/season/${seasonNum}?language=en-US`
      : `${TMDB_BASE}/tv/${tvId}/season/${seasonNum}?api_key=${apiKey}&language=en-US`;
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (isBearer) headers['Authorization'] = `Bearer ${apiKey}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return map;
    const data: any = await res.json();
    if (!data.episodes || !Array.isArray(data.episodes)) return map;
    for (const ep of data.episodes) {
      if (ep.episode_number && ep.still_path) {
        map[ep.episode_number] = `${TMDB_IMG}${ep.still_path}`;
      }
    }
  } catch (e) {}
  return map;
}

async function tmdbFetchTvDetails(tvId: number, apiKey: string): Promise<any> {
  try {
    const isBearer = apiKey.length > 40;
    const url = isBearer
      ? `${TMDB_BASE}/tv/${tvId}?language=en-US`
      : `${TMDB_BASE}/tv/${tvId}?api_key=${apiKey}&language=en-US`;
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (isBearer) headers['Authorization'] = `Bearer ${apiKey}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

// Build episode list — TMDB thumbnails with poster fallback
async function buildEpisodes(
  slug: string,
  poster: string,
  title: string,
  apiKey: string,
  maxEp = 26
): Promise<{ episodes: any[], tmdbId: number | null, seasonNum: number }> {
  let tmdbThumbnails: Record<number, string> = {};
  let realEpisodeCount = maxEp;
  let tmdbId: number | null = null;
  let seasonNum = 1;

  if (apiKey) {
    try {
      tmdbId = await tmdbSearchTv(title, apiKey);
      if (tmdbId) {
        seasonNum = detectSeasonNumber(title);
        tmdbThumbnails = await tmdbFetchSeasonEpisodes(tmdbId, seasonNum, apiKey);
        const details = await tmdbFetchTvDetails(tmdbId, apiKey);
        if (details && details.seasons) {
          const seasonInfo = details.seasons.find((s: any) => s.season_number === seasonNum);
          if (seasonInfo && seasonInfo.episode_count > 0) {
            realEpisodeCount = Math.max(seasonInfo.episode_count, Object.keys(tmdbThumbnails).length);
          }
        }
      }
    } catch (e) {}
  }

  const totalEps = Math.min(Math.max(realEpisodeCount, Object.keys(tmdbThumbnails).length, 12), 50);

  const episodes = [];
  for (let i = 1; i <= totalEps; i++) {
    episodes.push({
      number: i,
      url: `${BASE}/${slug}-episode-${i}/`,
      embedId: `anime_${slug}_ep${i}`,
      thumbnail: tmdbThumbnails[i] || poster,
      hasRealThumb: !!tmdbThumbnails[i],
      title: `Episode ${i}`,
    });
  }
  return { episodes, tmdbId, seasonNum };
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

export const GET: APIRoute = async ({ url, locals }) => {
  const params = url.searchParams;
  const action = params.get('action') || 'search';
  const query = params.get('q') || '';
  const slug = params.get('slug') || '';
  const noCache = params.get('nocache') === '1';

  // Get TMDB key from Cloudflare env
  const env: any = (locals as any)?.runtime?.env || {};
  const tmdbKey = env.TMDB_API_KEY || '';

  // ═══ ACTION: SEARCH ═══
  if (action === 'search' && query) {
    const cacheKey = `ext_search_v4:${query.toLowerCase()}`;
    if (!noCache) {
      const hit = cached(cacheKey);
      if (hit) return jsonRes({ success: true, source: 'cache', ...hit });
    }
    try {
      const cleanQ = cleanQuery(query);
      const searchUrl = `${BASE}/wp-json/wp/v2/anime?search=${encodeURIComponent(cleanQ)}&per_page=10`;
      const res = await fetch(searchUrl);
      if (!res.ok) return jsonRes({ success: false, error: 'Search failed', results: [] }, 200);
      const raw: any = await res.json();
      if (!Array.isArray(raw) || raw.length === 0) {
        return jsonRes({ success: true, results: [], message: 'No matches' });
      }
      const scored = raw.map((item: any) => ({
        id: item.id,
        slug: item.slug,
        title: (item.title?.rendered || '').replace(/&#\d+;/g, ''),
        link: item.link,
        featured_media: item.featured_media,
        matchScore: matchScore(item.title?.rendered || '', cleanQ),
      }));
      scored.sort((a: any, b: any) => b.matchScore - a.matchScore);
      const result = {
        query: cleanQ,
        results: scored,
        bestMatch: scored[0]?.matchScore >= 0.5 ? scored[0] : null,
      };
      setCache(cacheKey, result);
      return jsonRes({ success: true, ...result });
    } catch (err: any) {
      return jsonRes({ success: false, error: err.message, results: [] }, 500);
    }
  }

  // ═══ ACTION: DETAIL (full info with episodes) ═══
  if (action === 'detail' && slug) {
    const cacheKey = `ext_detail_v4:${slug}`;
    if (!noCache) {
      const hit = cached(cacheKey);
      if (hit) return jsonRes({ success: true, source: 'cache', ...hit });
    }
    try {
      const detailUrl = `${BASE}/wp-json/wp/v2/anime?slug=${encodeURIComponent(slug)}`;
      const res = await fetch(detailUrl);
      if (!res.ok) return jsonRes({ success: false, error: 'Detail fetch failed' }, 200);
      const raw: any = await res.json();
      if (!Array.isArray(raw) || raw.length === 0) return jsonRes({ success: false, error: 'Anime not found' }, 200);
      const anime = raw[0];

      let poster = '';
      if (anime.featured_media) poster = await fetchMediaUrl(anime.featured_media);

      const title = (anime.title?.rendered || '').replace(/&#\d+;/g, '');
      const { episodes, tmdbId, seasonNum } = await buildEpisodes(anime.slug, poster, title, tmdbKey, 26);

      const result = {
        id: anime.id,
        slug: anime.slug,
        title,
        link: anime.link,
        poster,
        description: (anime.content?.rendered || '').replace(/<[^>]+>/g, '').trim(),
        classList: anime.class_list || [],
        episodes,
        episodeUrlPattern: `${BASE}/{slug}-episode-{n}/`,
        baseSlug: anime.slug,
        hasTmdbThumbs: episodes.some((e: any) => e.hasRealThumb),
        // ═══ NEW v4: TMDB streaming info ═══
        tmdb_id: tmdbId,
        season_number: seasonNum,
      };
      setCache(cacheKey, result);
      return jsonRes({ success: true, ...result });
    } catch (err: any) {
      return jsonRes({ success: false, error: err.message }, 500);
    }
  }

  // ═══ ACTION: FIND (search + auto-pick best match with full details) ═══
  if (action === 'find' && query) {
    const cacheKey = `ext_find_v4:${query.toLowerCase()}`;
    if (!noCache) {
      const hit = cached(cacheKey);
      if (hit) return jsonRes({ success: true, source: 'cache', ...hit });
    }
    try {
      const cleanQ = cleanQuery(query);
      const searchUrl = `${BASE}/wp-json/wp/v2/anime?search=${encodeURIComponent(cleanQ)}&per_page=10`;
      const res = await fetch(searchUrl);
      if (!res.ok) return jsonRes({ success: false, error: 'Search failed' }, 200);
      const raw: any = await res.json();
      if (!Array.isArray(raw) || raw.length === 0) return jsonRes({ success: false, message: 'No matches found' });

      const scored = raw.map((item: any) => ({
        id: item.id,
        slug: item.slug,
        title: (item.title?.rendered || '').replace(/&#\d+;/g, ''),
        link: item.link,
        featured_media: item.featured_media,
        matchScore: matchScore(item.title?.rendered || '', cleanQ),
      }));
      scored.sort((a: any, b: any) => b.matchScore - a.matchScore);
      const best = scored[0];
      if (!best || best.matchScore < 0.3) {
        return jsonRes({ success: false, message: 'No good match', allResults: scored });
      }

      let poster = '';
      if (best.featured_media) poster = await fetchMediaUrl(best.featured_media);

      const { episodes, tmdbId, seasonNum } = await buildEpisodes(best.slug, poster, best.title, tmdbKey, 26);

      const result = {
        found: true,
        anime: {
          id: best.id,
          slug: best.slug,
          title: best.title,
          link: best.link,
          poster,
          matchScore: best.matchScore,
          tmdb_id: tmdbId,
          season_number: seasonNum,
        },
        episodes,
        firstEpisodeUrl: `${BASE}/${best.slug}-episode-1/`,
        firstEpisodeId: `anime_${best.slug}_ep1`,
        // ═══ NEW v4 ═══
        tmdb_id: tmdbId,
        season_number: seasonNum,
      };
      setCache(cacheKey, result);
      return jsonRes({ success: true, ...result });
    } catch (err: any) {
      return jsonRes({ success: false, error: err.message }, 500);
    }
  }

  return jsonRes({ success: false, error: 'Invalid action. Use: search, detail, find' }, 400);
};
