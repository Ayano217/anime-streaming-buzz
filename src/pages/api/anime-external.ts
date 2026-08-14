// ═══════════════════════════════════════════════════════════════
// AniTube Buzz — External Anime API v5 (AnimoTVSlash + TMDB + Fallback)
// Path: src/pages/api/anime-external.ts
//
// v5 CHANGES from v4:
//   ✅ NEW: TMDB-only lookup when AnimoTV doesn't have the anime
//   ✅ NEW: 'detail' action falls back to TMDB search if AnimoTV fails
//   ✅ NEW: 'find' action falls back to TMDB if AnimoTV has no match
//   ✅ Works for ANY anime that's on TMDB (huge library)
//   ✅ All v4 features preserved
//
// USED BY:
//   - src/pages/reels/[id].astro
//   - src/pages/api/link-resolver.ts (via 'find' action)
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

// Convert slug back to searchable title
function slugToSearchable(slug: string): string {
  return String(slug || '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
// TMDB HELPERS
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

async function tmdbSearchTv(title: string, apiKey: string): Promise<any | null> {
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
    // Prefer anime (animation genre + Japan origin)
    const animeMatch = data.results.find((r: any) =>
      r.genre_ids && r.genre_ids.includes(16) && r.origin_country && r.origin_country.includes('JP')
    );
    if (animeMatch) return animeMatch;
    const animeAny = data.results.find((r: any) => r.genre_ids && r.genre_ids.includes(16));
    if (animeAny) return animeAny;
    return data.results[0];
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

// ═══════════════════════════════════════════════════════════════
// NEW v5: TMDB-only lookup (works when AnimoTV doesn't have anime)
// ═══════════════════════════════════════════════════════════════

async function tmdbOnlyLookup(query: string, apiKey: string, keepSlug?: string): Promise<any | null> {
  if (!apiKey) return null;
  try {
    const tmdbShow = await tmdbSearchTv(query, apiKey);
    if (!tmdbShow) return null;

    const tvId = tmdbShow.id;
    const seasonNum = detectSeasonNumber(query);

    // Fetch episode thumbs
    const episodeThumbs = await tmdbFetchSeasonEpisodes(tvId, seasonNum, apiKey);
    const details = await tmdbFetchTvDetails(tvId, apiKey);

    let epCount = 12;
    if (details?.seasons) {
      const seasonInfo = details.seasons.find((s: any) => s.season_number === seasonNum);
      if (seasonInfo?.episode_count > 0) {
        epCount = Math.max(seasonInfo.episode_count, Object.keys(episodeThumbs).length);
      }
    }
    epCount = Math.min(Math.max(epCount, Object.keys(episodeThumbs).length, 12), 50);

    // Build slug from TMDB title (or use provided slug)
    const titleForSlug = tmdbShow.name || tmdbShow.original_name || query;
    const slug = keepSlug || String(titleForSlug)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 60);

    const poster = tmdbShow.poster_path ? `${TMDB_IMG}${tmdbShow.poster_path}` : '';

    const episodes = [];
    for (let i = 1; i <= epCount; i++) {
      episodes.push({
        number: i,
        url: '', // no AnimoTV URL
        embedId: `anime_${slug}_ep${i}`,
        thumbnail: episodeThumbs[i] || poster,
        hasRealThumb: !!episodeThumbs[i],
        title: `Episode ${i}`,
      });
    }

    return {
      id: tvId,
      slug: slug,
      title: tmdbShow.name || tmdbShow.original_name || query,
      link: '',
      poster: poster,
      description: tmdbShow.overview || '',
      classList: [],
      episodes,
      episodeUrlPattern: '',
      baseSlug: slug,
      hasTmdbThumbs: episodes.some(e => e.hasRealThumb),
      tmdb_id: tvId,
      season_number: seasonNum,
      source: 'tmdb-only',
    };
  } catch (e) {
    return null;
  }
}

// Build episode list — TMDB thumbnails with poster fallback (for AnimoTV results)
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
      const tmdbShow = await tmdbSearchTv(title, apiKey);
      if (tmdbShow) {
        tmdbId = tmdbShow.id;
        seasonNum = detectSeasonNumber(title);
        tmdbThumbnails = await tmdbFetchSeasonEpisodes(tmdbId!, seasonNum, apiKey);
        const details = await tmdbFetchTvDetails(tmdbId!, apiKey);
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

  const env: any = (locals as any)?.runtime?.env || {};
  const tmdbKey = env.TMDB_API_KEY || '';

  // ═══ ACTION: SEARCH ═══
  if (action === 'search' && query) {
    const cacheKey = `ext_search_v5:${query.toLowerCase()}`;
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
    const cacheKey = `ext_detail_v5:${slug}`;
    if (!noCache) {
      const hit = cached(cacheKey);
      if (hit) return jsonRes({ success: true, source: 'cache', ...hit });
    }
    try {
      // Step 1: Try AnimoTV
      const detailUrl = `${BASE}/wp-json/wp/v2/anime?slug=${encodeURIComponent(slug)}`;
      const res = await fetch(detailUrl);
      
      let anime: any = null;
      if (res.ok) {
        const raw: any = await res.json();
        if (Array.isArray(raw) && raw.length > 0) {
          anime = raw[0];
        }
      }

      // Step 2: If AnimoTV has it, use it (with TMDB thumbs)
      if (anime) {
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
          tmdb_id: tmdbId,
          season_number: seasonNum,
        };
        setCache(cacheKey, result);
        return jsonRes({ success: true, ...result });
      }

      // Step 3: FALLBACK — AnimoTV doesn't have it, try TMDB directly
      if (tmdbKey) {
        const searchable = slugToSearchable(slug);
        const tmdbResult = await tmdbOnlyLookup(searchable, tmdbKey, slug);
        if (tmdbResult) {
          setCache(cacheKey, tmdbResult);
          return jsonRes({ success: true, source: 'tmdb-fallback', ...tmdbResult });
        }
      }

      // Step 4: Nothing found anywhere
      return jsonRes({ success: false, error: 'Anime not found on any source' }, 200);
    } catch (err: any) {
      return jsonRes({ success: false, error: err.message }, 500);
    }
  }

  // ═══ ACTION: FIND (search + auto-pick best match with full details) ═══
  if (action === 'find' && query) {
    const cacheKey = `ext_find_v5:${query.toLowerCase()}`;
    if (!noCache) {
      const hit = cached(cacheKey);
      if (hit) return jsonRes({ success: true, source: 'cache', ...hit });
    }
    try {
      const cleanQ = cleanQuery(query);
      
      // Step 1: Try AnimoTV
      const searchUrl = `${BASE}/wp-json/wp/v2/anime?search=${encodeURIComponent(cleanQ)}&per_page=10`;
      const res = await fetch(searchUrl);
      
      let bestAnimoTv: any = null;
      if (res.ok) {
        const raw: any = await res.json();
        if (Array.isArray(raw) && raw.length > 0) {
          const scored = raw.map((item: any) => ({
            id: item.id,
            slug: item.slug,
            title: (item.title?.rendered || '').replace(/&#\d+;/g, ''),
            link: item.link,
            featured_media: item.featured_media,
            matchScore: matchScore(item.title?.rendered || '', cleanQ),
          }));
          scored.sort((a: any, b: any) => b.matchScore - a.matchScore);
          if (scored[0] && scored[0].matchScore >= 0.3) {
            bestAnimoTv = scored[0];
          }
        }
      }

      // Step 2: If AnimoTV found a good match, use it
      if (bestAnimoTv) {
        let poster = '';
        if (bestAnimoTv.featured_media) poster = await fetchMediaUrl(bestAnimoTv.featured_media);
        const { episodes, tmdbId, seasonNum } = await buildEpisodes(bestAnimoTv.slug, poster, bestAnimoTv.title, tmdbKey, 26);
        
        const result = {
          found: true,
          anime: {
            id: bestAnimoTv.id,
            slug: bestAnimoTv.slug,
            title: bestAnimoTv.title,
            link: bestAnimoTv.link,
            poster,
            matchScore: bestAnimoTv.matchScore,
            tmdb_id: tmdbId,
            season_number: seasonNum,
          },
          episodes,
          firstEpisodeUrl: `${BASE}/${bestAnimoTv.slug}-episode-1/`,
          firstEpisodeId: `anime_${bestAnimoTv.slug}_ep1`,
          tmdb_id: tmdbId,
          season_number: seasonNum,
        };
        setCache(cacheKey, result);
        return jsonRes({ success: true, ...result });
      }

      // Step 3: FALLBACK — Not on AnimoTV, search TMDB directly
      if (tmdbKey) {
        const tmdbResult = await tmdbOnlyLookup(cleanQ, tmdbKey);
        if (tmdbResult) {
          const result = {
            found: true,
            anime: {
              id: tmdbResult.tmdb_id,
              slug: tmdbResult.slug,
              title: tmdbResult.title,
              link: '',
              poster: tmdbResult.poster,
              matchScore: 1,
              tmdb_id: tmdbResult.tmdb_id,
              season_number: tmdbResult.season_number,
            },
            episodes: tmdbResult.episodes,
            firstEpisodeUrl: '',
            firstEpisodeId: `anime_${tmdbResult.slug}_ep1`,
            tmdb_id: tmdbResult.tmdb_id,
            season_number: tmdbResult.season_number,
            source: 'tmdb-fallback',
          };
          setCache(cacheKey, result);
          return jsonRes({ success: true, ...result });
        }
      }

      // Step 4: No match anywhere
      return jsonRes({ success: false, message: 'No good match found on any source' });
    } catch (err: any) {
      return jsonRes({ success: false, error: err.message }, 500);
    }
  }

  return jsonRes({ success: false, error: 'Invalid action. Use: search, detail, find' }, 400);
};
