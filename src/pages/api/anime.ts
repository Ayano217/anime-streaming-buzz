export const prerender = false;

import type { APIRoute } from 'astro';

const CACHE: Record<string, { data: any; time: number }> = {};
const CACHE_TTL = 10 * 60 * 1000; // 10 min (was 30)
const CONSUMET_BASE = 'https://api.consumet.org';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/original';
const JIKAN_BASE = 'https://api.jikan.moe/v4';

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim().slice(0, 80);
}

function cached(key: string): any | null {
  const c = CACHE[key];
  if (c && Date.now() - c.time < CACHE_TTL) return c.data;
  return null;
}

function setCache(key: string, data: any) {
  CACHE[key] = { data, time: Date.now() };
  const keys = Object.keys(CACHE);
  if (keys.length > 100) delete CACHE[keys[0]];
}

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600', 'Access-Control-Allow-Origin': '*' }
  });
}

// ─── JIKAN: normalize ───
function normalizeJikan(item: any) {
  const title = item.title_english || item.title || item.title_japanese || 'Unknown';
  return {
    id: String(item.mal_id),
    title,
    image: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || item.images?.webp?.large_image_url || '',
    score: item.score ? item.score.toFixed(1) : null,
    episodes: item.episodes || 0,
    status: (item.status || '').toLowerCase().includes('airing') ? 'current' : 
            (item.status || '').toLowerCase().includes('finished') ? 'finished' :
            (item.status || '').toLowerCase().includes('not yet') ? 'upcoming' : 'unknown',
    synopsis: item.synopsis || '',
    genres: (item.genres || []).map((g: any) => g.name),
    year: item.year || (item.aired?.from ? new Date(item.aired.from).getFullYear() : null),
    slug: slugify(title),
    subtype: item.type || 'TV',
    startDate: item.aired?.from || null,
    endDate: item.aired?.to || null,
    members: item.members || 0,
    rank: item.rank || null
  };
}

// ─── JIKAN: Current season anime (TRULY NEW) ───
async function jikanCurrentSeason(page: number = 1) {
  try {
    const url = `${JIKAN_BASE}/seasons/now?page=${page}&limit=25&filter=tv&sfw=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Jikan ${res.status}`);
    const json: any = await res.json();
    if (!json.data) throw new Error('No Jikan data');
    
    let anime = json.data.map(normalizeJikan);
    
    // Filter: only anime that started in last 1 year (truly current)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    anime = anime.filter((a: any) => {
      if (!a.startDate) return true;
      return new Date(a.startDate) > oneYearAgo;
    });
    
    // Sort by most recent start date first
    anime.sort((a: any, b: any) => {
      const da = a.startDate ? new Date(a.startDate).getTime() : 0;
      const db = b.startDate ? new Date(b.startDate).getTime() : 0;
      return db - da;
    });
    
    return {
      anime,
      hasNext: json.pagination?.has_next_page !== false,
      total: json.pagination?.items?.total || 1000
    };
  } catch (e) {
    console.warn('Jikan seasonal failed:', e);
    throw e;
  }
}

// ─── JIKAN: Top anime by category ───
async function jikanTop(category: string, page: number = 1) {
  const filterMap: Record<string, string> = {
    top: 'bypopularity',
    upcoming: 'upcoming',
    popular: 'bypopularity',
    movies: 'movie'
  };
  const filter = filterMap[category] || 'bypopularity';
  const isMovie = category === 'movies';
  
  try {
    const url = `${JIKAN_BASE}/top/anime?filter=${filter}&page=${page}&limit=25${isMovie ? '&type=movie' : ''}&sfw=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Jikan ${res.status}`);
    const json: any = await res.json();
    if (!json.data) throw new Error('No Jikan data');
    return {
      anime: json.data.map(normalizeJikan),
      hasNext: json.pagination?.has_next_page !== false,
      total: json.pagination?.items?.total || 1000
    };
  } catch (e) {
    console.warn('Jikan top failed:', e);
    throw e;
  }
}

// ─── JIKAN: Search ───
async function jikanSearch(query: string) {
  try {
    const url = `${JIKAN_BASE}/anime?q=${encodeURIComponent(query)}&limit=20&sfw=true&order_by=score&sort=desc`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Jikan search ${res.status}`);
    const json: any = await res.json();
    return (json.data || []).map(normalizeJikan);
  } catch (e) {
    console.warn('Jikan search failed:', e);
    return [];
  }
}

// ─── JIKAN: Detail by MAL ID ───
async function jikanDetail(malId: string) {
  try {
    const url = `${JIKAN_BASE}/anime/${malId}/full`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Jikan detail ${res.status}`);
    const json: any = await res.json();
    if (!json.data) throw new Error('No Jikan data');
    const item = json.data;
    const base = normalizeJikan(item);
    return {
      ...base,
      description: item.synopsis || '',
      coverImage: item.images?.jpg?.large_image_url || base.image,
      ageRating: item.rating || '',
      ageRatingGuide: '',
      studios: (item.studios || []).map((s: any) => s.name)
    };
  } catch (e) {
    console.warn('Jikan detail failed:', e);
    return null;
  }
}

// ─── KITSU: Fallback normalize ───
function normalizeKitsu(item: any) {
  const a = item.attributes;
  const title = a.canonicalTitle || a.titles?.en || a.titles?.en_jp || 'Unknown';
  return {
    id: item.id, title,
    image: a.posterImage?.large || a.posterImage?.medium || '',
    score: a.averageRating ? (parseFloat(a.averageRating) / 10).toFixed(1) : null,
    episodes: a.episodeCount || 0, status: a.status || 'unknown',
    synopsis: a.synopsis || '', genres: [],
    year: a.startDate ? parseInt(a.startDate.substring(0, 4)) : null,
    slug: slugify(title), subtype: a.subtype || 'TV',
    startDate: a.startDate, endDate: a.endDate
  };
}

async function kitsuList(category: string, page: number) {
  const sortMap: Record<string, string> = {
    airing: '-startDate', top: '-averageRating', upcoming: 'startDate', popular: '-userCount', movies: '-userCount'
  };
  const filterMap: Record<string, string> = {
    airing: 'filter[status]=current', top: '', upcoming: 'filter[status]=upcoming', popular: '', movies: 'filter[subtype]=movie'
  };
  const limit = 20;
  const offset = (page - 1) * limit;
  const sort = sortMap[category] || '-userCount';
  const filter = filterMap[category] || '';
  const url = `https://kitsu.io/api/edge/anime?${filter}&sort=${sort}&page[limit]=${limit}&page[offset]=${offset}&fields[anime]=canonicalTitle,titles,posterImage,averageRating,episodeCount,status,synopsis,startDate,endDate,subtype`;
  const res = await fetch(url, { headers: { 'Accept': 'application/vnd.api+json' } });
  if (!res.ok) throw new Error(`Kitsu ${res.status}`);
  const json: any = await res.json();
  const anime = json.data.map(normalizeKitsu);
  const totalCount = json.meta?.count || 10000;
  const hasNext = offset + limit < totalCount;
  return { anime, hasNext, total: totalCount };
}

async function kitsuSearch(query: string) {
  const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=20&fields[anime]=canonicalTitle,titles,posterImage,averageRating,episodeCount,status,synopsis,startDate,endDate,subtype`;
  const res = await fetch(url, { headers: { 'Accept': 'application/vnd.api+json' } });
  if (!res.ok) throw new Error(`Kitsu search ${res.status}`);
  const json: any = await res.json();
  return json.data.map(normalizeKitsu);
}

async function kitsuDetail(kitsuId: string) {
  const url = `https://kitsu.io/api/edge/anime/${kitsuId}?include=genres&fields[genres]=name`;
  const res = await fetch(url, { headers: { 'Accept': 'application/vnd.api+json' } });
  if (!res.ok) throw new Error(`Kitsu detail ${res.status}`);
  const json: any = await res.json();
  const a = json.data.attributes;
  const title = a.canonicalTitle || a.titles?.en || a.titles?.en_jp || 'Unknown';
  const genres = (json.included || []).filter((i: any) => i.type === 'genres').map((i: any) => i.attributes.name);
  return {
    id: json.data.id, title,
    image: a.posterImage?.large || a.posterImage?.original || '',
    coverImage: a.coverImage?.large || a.coverImage?.original || a.posterImage?.large || '',
    score: a.averageRating ? (parseFloat(a.averageRating) / 10).toFixed(1) : null,
    episodes: a.episodeCount || 0, status: a.status || 'unknown',
    synopsis: a.synopsis || '', description: a.description || a.synopsis || '',
    genres, year: a.startDate ? parseInt(a.startDate.substring(0, 4)) : null,
    slug: slugify(title), subtype: a.subtype || 'TV',
    ageRating: a.ageRating || '', ageRatingGuide: a.ageRatingGuide || '',
    endDate: a.endDate || null, startDate: a.startDate || null
  };
}

async function kitsuEpisodes(kitsuId: string, page: number = 1) {
  const limit = 20;
  const offset = (page - 1) * limit;
  const url = `https://kitsu.io/api/edge/anime/${kitsuId}/episodes?page[limit]=${limit}&page[offset]=${offset}&sort=number`;
  const res = await fetch(url, { headers: { 'Accept': 'application/vnd.api+json' } });
  if (!res.ok) return { episodes: [], hasNext: false, total: 0 };
  const json: any = await res.json();
  const episodes = json.data.map((ep: any) => {
    const e = ep.attributes;
    return {
      id: ep.id, number: e.number || 0,
      title: e.canonicalTitle || e.titles?.en_us || e.titles?.en_jp || `Episode ${e.number || '?'}`,
      synopsis: e.synopsis || '',
      thumbnail: e.thumbnail?.original || e.thumbnail?.large || '',
      airdate: e.airdate || '',
      seasonNumber: e.seasonNumber || 1,
      length: e.length || null
    };
  });
  const totalCount = json.meta?.count || 0;
  const hasNext = offset + limit < totalCount;
  return { episodes, hasNext, total: totalCount };
}

// ─── TMDB, AniList, Consumet (unchanged from before) ───
async function tmdbSearchAnime(animeTitle: string, apiKey: string) {
  try {
    const url = `${TMDB_BASE}/search/tv?query=${encodeURIComponent(animeTitle)}&language=en-US&page=1&include_adult=false`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    if (!json.results || json.results.length === 0) return null;
    const scored = json.results.map((r: any) => {
      let score = r.popularity || 0;
      if (r.origin_country && r.origin_country.includes('JP')) score += 100;
      if (r.original_language === 'ja') score += 50;
      return { ...r, _score: score };
    });
    scored.sort((a: any, b: any) => b._score - a._score);
    return scored[0];
  } catch { return null; }
}

async function tmdbEpisodes(tvId: number, seasonNumber: number, apiKey: string) {
  try {
    const url = `${TMDB_BASE}/tv/${tvId}/season/${seasonNumber}?language=en-US`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    if (!json.episodes || json.episodes.length === 0) return null;
    return json.episodes.map((ep: any) => ({
      id: `tmdb_${ep.id}`,
      number: ep.episode_number,
      title: ep.name || `Episode ${ep.episode_number}`,
      synopsis: ep.overview || '',
      thumbnail: ep.still_path ? `${TMDB_IMG}${ep.still_path}` : '',
      airdate: ep.air_date || '',
      seasonNumber: ep.season_number || 1,
      length: ep.runtime || null,
      rating: ep.vote_average || null
    }));
  } catch { return null; }
}

async function anilistEpisodes(animeTitle: string) {
  const query = `
    query ($search: String) {
      Media(search: $search, type: ANIME) {
        id title { romaji english } episodes
        streamingEpisodes { title thumbnail url site }
      }
    }`;
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query, variables: { search: animeTitle } })
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const media = json.data?.Media;
    if (!media || !media.streamingEpisodes || media.streamingEpisodes.length === 0) return null;
    const episodes = media.streamingEpisodes.map((ep: any, idx: number) => {
      const titleMatch = (ep.title || '').match(/(?:episode|ep\.?)\s*(\d+)/i);
      const num = titleMatch ? parseInt(titleMatch[1]) : (idx + 1);
      const cleanTitle = (ep.title || '').replace(/^(?:episode|ep\.?)\s*\d+\s*[-:–]\s*/i, '').replace(/^(?:episode|ep\.?)\s*\d+$/i, '').trim() || `Episode ${num}`;
      return {
        id: `anilist_${num}`, number: num, title: cleanTitle,
        synopsis: '', thumbnail: ep.thumbnail || '',
        airdate: '', seasonNumber: 1, length: null
      };
    });
    episodes.sort((a: any, b: any) => a.number - b.number);
    return episodes;
  } catch { return null; }
}

async function consumetEpisodes(animeTitle: string) {
  try {
    const searchUrl = `${CONSUMET_BASE}/meta/anilist/${encodeURIComponent(animeTitle)}`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return null;
    const searchJson: any = await searchRes.json();
    if (!searchJson.results || searchJson.results.length === 0) return null;
    const animeId = searchJson.results[0].id;
    const infoUrl = `${CONSUMET_BASE}/meta/anilist/info/${animeId}`;
    const infoRes = await fetch(infoUrl);
    if (!infoRes.ok) return null;
    const info: any = await infoRes.json();
    if (!info.episodes || info.episodes.length === 0) return null;
    return info.episodes.map((ep: any, idx: number) => ({
      id: ep.id || `consumet_${idx}`,
      number: ep.number || (idx + 1),
      title: ep.title || `Episode ${ep.number || (idx + 1)}`,
      synopsis: ep.description || '',
      thumbnail: ep.image || '',
      airdate: ep.airDate || '',
      seasonNumber: 1,
      length: null
    }));
  } catch { return null; }
}

async function getEnrichedEpisodes(kitsuId: string, animeTitle: string, page: number, tmdbKey: string) {
  const kitsuData = await kitsuEpisodes(kitsuId, page);
  let episodes = kitsuData.episodes;
  
  let tmdbEps: any = null;
  if (page === 1 && animeTitle && tmdbKey) {
    const tvShow = await tmdbSearchAnime(animeTitle, tmdbKey);
    if (tvShow && tvShow.id) {
      tmdbEps = await tmdbEpisodes(tvShow.id, 1, tmdbKey);
      if (tmdbEps && kitsuData.total > tmdbEps.length && tvShow.number_of_seasons > 1) {
        const allSeasons: any[] = [...tmdbEps];
        for (let s = 2; s <= Math.min(tvShow.number_of_seasons, 5); s++) {
          const seasonEps = await tmdbEpisodes(tvShow.id, s, tmdbKey);
          if (seasonEps) allSeasons.push(...seasonEps);
        }
        tmdbEps = allSeasons;
      }
    }
  }
  
  if (tmdbEps && tmdbEps.length >= episodes.length && tmdbEps.length > 0) {
    return { episodes: tmdbEps, hasNext: false, total: tmdbEps.length };
  }
  
  let consumetEps: any = null;
  if (page === 1 && animeTitle && (!tmdbEps || tmdbEps.length === 0)) {
    consumetEps = await consumetEpisodes(animeTitle);
  }
  
  let anilistEps: any = null;
  if (page === 1 && animeTitle && !consumetEps) {
    anilistEps = await anilistEpisodes(animeTitle);
  }
  
  if (episodes.length === 0) {
    if (tmdbEps && tmdbEps.length > 0) return { episodes: tmdbEps, hasNext: false, total: tmdbEps.length };
    if (consumetEps && consumetEps.length > 0) return { episodes: consumetEps, hasNext: false, total: consumetEps.length };
    if (anilistEps && anilistEps.length > 0) return { episodes: anilistEps, hasNext: false, total: anilistEps.length };
  }
  
  if (episodes.length > 0) {
    episodes = episodes.map((kEp: any) => {
      if (kEp.thumbnail) return kEp;
      if (tmdbEps) {
        const tMatch = tmdbEps.find((t: any) => t.number === kEp.number);
        if (tMatch && tMatch.thumbnail) return { ...kEp, thumbnail: tMatch.thumbnail, synopsis: kEp.synopsis || tMatch.synopsis, title: kEp.title.startsWith('Episode ') && tMatch.title !== `Episode ${tMatch.number}` ? tMatch.title : kEp.title };
      }
      if (consumetEps) {
        const cMatch = consumetEps.find((c: any) => c.number === kEp.number);
        if (cMatch && cMatch.thumbnail) return { ...kEp, thumbnail: cMatch.thumbnail, synopsis: kEp.synopsis || cMatch.synopsis };
      }
      if (anilistEps) {
        const aMatch = anilistEps.find((a: any) => a.number === kEp.number);
        if (aMatch && aMatch.thumbnail) return { ...kEp, thumbnail: aMatch.thumbnail };
      }
      return kEp;
    });
  }
  
  return { episodes, hasNext: kitsuData.hasNext, total: kitsuData.total };
}

async function findAnimeBySlug(slug: string) {
  const searchTerm = slug.replace(/-/g, ' ');
  
  // Try Jikan first (better data)
  try {
    const jikanResults = await jikanSearch(searchTerm);
    if (jikanResults.length > 0) {
      const exact = jikanResults.find((a: any) => a.slug === slug);
      const pick = exact || jikanResults[0];
      const detail = await jikanDetail(pick.id);
      if (detail) return detail;
      return pick;
    }
  } catch {}
  
  // Fallback: Kitsu
  try {
    const results = await kitsuSearch(searchTerm);
    let match = results.find((a: any) => a.slug === slug);
    if (!match && results.length > 0) match = results[0];
    if (match) {
      try { return await kitsuDetail(match.id); }
      catch { return match; }
    }
  } catch {}
  
  return null;
}

export const GET: APIRoute = async ({ url, locals }) => {
  const action = url.searchParams.get('action') || 'list';
  const category = url.searchParams.get('category') || 'airing';
  const page = parseInt(url.searchParams.get('page') || '1') || 1;
  const query = url.searchParams.get('q') || '';
  const id = url.searchParams.get('id') || '';
  const slug = url.searchParams.get('slug') || '';
  const animeTitle = url.searchParams.get('title') || '';

  const env = (locals as any)?.runtime?.env || {};
  const TMDB_KEY = env.TMDB_API_KEY || (globalThis as any).TMDB_API_KEY || '';

  try {
    if (action === 'list') {
      const cacheKey = `list:${category}:${page}`;
      const hit = cached(cacheKey);
      if (hit) return jsonRes({ success: true, source: 'cache', ...hit });
      
      let data;
      // ═══ USE JIKAN FOR AIRING (truly new anime) ═══
      if (category === 'airing') {
        try {
          data = await jikanCurrentSeason(page);
        } catch {
          // Fallback to Kitsu if Jikan fails
          data = await kitsuList(category, page);
        }
      } else {
        // Try Jikan for other categories
        try {
          data = await jikanTop(category, page);
        } catch {
          data = await kitsuList(category, page);
        }
      }
      
      setCache(cacheKey, data);
      return jsonRes({ success: true, source: 'jikan-kitsu', ...data });
    }
    
    if (action === 'search' && query) {
      const cacheKey = `search:${query}`;
      const hit = cached(cacheKey);
      if (hit) return jsonRes({ success: true, source: 'cache', anime: hit });
      
      // Try Jikan first (better search)
      let results = await jikanSearch(query);
      if (results.length === 0) {
        results = await kitsuSearch(query);
      }
      
      setCache(cacheKey, results);
      return jsonRes({ success: true, source: 'jikan-kitsu', anime: results });
    }
    
    if (action === 'detail') {
      if (id) {
        const cacheKey = `detail:${id}`;
        const hit = cached(cacheKey);
        if (hit) return jsonRes({ success: true, source: 'cache', anime: hit });
        
        // Try Jikan detail if ID is numeric (MAL ID)
        if (/^\d+$/.test(id)) {
          const detail = await jikanDetail(id);
          if (detail) {
            setCache(cacheKey, detail);
            return jsonRes({ success: true, source: 'jikan', anime: detail });
          }
        }
        
        // Fallback: Kitsu
        try {
          const detail = await kitsuDetail(id);
          setCache(cacheKey, detail);
          return jsonRes({ success: true, source: 'kitsu', anime: detail });
        } catch {
          return jsonRes({ success: false, error: 'Anime not found' }, 404);
        }
      }
      if (slug) {
        const cacheKey = `slug:${slug}`;
        const hit = cached(cacheKey);
        if (hit) return jsonRes({ success: true, source: 'cache', anime: hit });
        const anime = await findAnimeBySlug(slug);
        if (anime) {
          setCache(cacheKey, anime);
          return jsonRes({ success: true, source: 'jikan-kitsu', anime });
        }
        return jsonRes({ success: false, error: 'Anime not found', slug }, 404);
      }
      return jsonRes({ success: false, error: 'ID or slug required' }, 400);
    }
    
    if (action === 'episodes' && id) {
      const cacheKey = `eps:${id}:${page}:${animeTitle}`;
      const hit = cached(cacheKey);
      if (hit) return jsonRes({ success: true, source: 'cache', ...hit });
      
      // For episodes, still use Kitsu (has episode data + TMDB enrichment)
      // If MAL ID, need to search Kitsu first
      let kitsuId = id;
      if (/^\d+$/.test(id) && animeTitle) {
        // MAL ID — search Kitsu by title for episodes
        try {
          const kitsuResults = await kitsuSearch(animeTitle);
          if (kitsuResults.length > 0) kitsuId = kitsuResults[0].id;
        } catch {}
      }
      
      const data = await getEnrichedEpisodes(kitsuId, animeTitle, page, TMDB_KEY);
      setCache(cacheKey, data);
      return jsonRes({ success: true, source: 'enriched', ...data });
    }
    
    // Default
    const data = await jikanCurrentSeason(page).catch(() => kitsuList(category, page));
    return jsonRes({ success: true, source: 'default', ...data });
    
  } catch (err: any) {
    console.error('API Error:', err);
    return jsonRes({ success: false, error: err.message || 'Unknown error' }, 500);
  }
};
