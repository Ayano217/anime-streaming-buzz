export const prerender = false;

import type { APIRoute } from 'astro';

const CACHE: Record<string, { data: any; time: number }> = {};
const CACHE_TTL = 30 * 60 * 1000;
const CONSUMET_BASE = 'https://api.consumet.org';

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
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800', 'Access-Control-Allow-Origin': '*' }
  });
}

function normalizeAnime(item: any) {
  const a = item.attributes;
  const title = a.canonicalTitle || a.titles?.en || a.titles?.en_jp || 'Unknown';
  return {
    id: item.id, title,
    image: a.posterImage?.large || a.posterImage?.medium || '',
    score: a.averageRating ? (parseFloat(a.averageRating) / 10).toFixed(1) : null,
    episodes: a.episodeCount || 0, status: a.status || 'unknown',
    synopsis: a.synopsis || '', genres: [],
    year: a.startDate ? parseInt(a.startDate.substring(0, 4)) : null,
    slug: slugify(title), subtype: a.subtype || 'TV'
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
  const url = `https://kitsu.io/api/edge/anime?${filter}&sort=${sort}&page[limit]=${limit}&page[offset]=${offset}&fields[anime]=canonicalTitle,titles,posterImage,averageRating,episodeCount,status,synopsis,startDate,subtype`;
  const res = await fetch(url, { headers: { 'Accept': 'application/vnd.api+json' } });
  if (!res.ok) throw new Error(`Kitsu ${res.status}`);
  const json: any = await res.json();
  const anime = json.data.map(normalizeAnime);
  const totalCount = json.meta?.count || 10000;
  const hasNext = offset + limit < totalCount;
  return { anime, hasNext, total: totalCount };
}

async function kitsuSearch(query: string) {
  const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=20&fields[anime]=canonicalTitle,titles,posterImage,averageRating,episodeCount,status,synopsis,startDate,subtype`;
  const res = await fetch(url, { headers: { 'Accept': 'application/vnd.api+json' } });
  if (!res.ok) throw new Error(`Kitsu search ${res.status}`);
  const json: any = await res.json();
  return json.data.map(normalizeAnime);
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

// ─── ANILIST: Episode data with streamingEpisodes ───
async function anilistEpisodes(animeTitle: string) {
  const query = `
    query ($search: String) {
      Media(search: $search, type: ANIME) {
        id
        title { romaji english }
        episodes
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

// ─── CONSUMET: Episode data with premium thumbnails ───
async function consumetEpisodes(animeTitle: string) {
  try {
    // Search on Consumet AniList provider
    const searchUrl = `${CONSUMET_BASE}/meta/anilist/${encodeURIComponent(animeTitle)}`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return null;
    const searchJson: any = await searchRes.json();
    if (!searchJson.results || searchJson.results.length === 0) return null;
    
    const animeId = searchJson.results[0].id;
    
    // Get detailed info with episodes
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
  } catch (e) {
    console.warn('Consumet fetch failed:', e);
    return null;
  }
}

// ─── MERGE: Best thumbnails from all sources ───
async function getEnrichedEpisodes(kitsuId: string, animeTitle: string, page: number) {
  // Get base episodes from Kitsu (has titles, dates)
  const kitsuData = await kitsuEpisodes(kitsuId, page);
  let episodes = kitsuData.episodes;
  
  // Try Consumet (best thumbnails)
  let consumetEps = null;
  if (page === 1 && animeTitle) {
    consumetEps = await consumetEpisodes(animeTitle);
  }
  
  // Try AniList as backup
  let anilistEps = null;
  if (page === 1 && animeTitle) {
    anilistEps = await anilistEpisodes(animeTitle);
  }
  
  // If we have consumet but no Kitsu episodes, use consumet directly
  if (episodes.length === 0 && consumetEps && consumetEps.length > 0) {
    return { episodes: consumetEps, hasNext: false, total: consumetEps.length };
  }
  
  if (episodes.length === 0 && anilistEps && anilistEps.length > 0) {
    return { episodes: anilistEps, hasNext: false, total: anilistEps.length };
  }
  
  // Enrich Kitsu episodes with thumbnails from Consumet/AniList
  if (episodes.length > 0 && (consumetEps || anilistEps)) {
    episodes = episodes.map((kEp: any) => {
      if (kEp.thumbnail) return kEp;
      
      // Try Consumet first
      if (consumetEps) {
        const cMatch = consumetEps.find((c: any) => c.number === kEp.number);
        if (cMatch && cMatch.thumbnail) {
          return { ...kEp, thumbnail: cMatch.thumbnail, synopsis: kEp.synopsis || cMatch.synopsis };
        }
      }
      
      // Try AniList
      if (anilistEps) {
        const aMatch = anilistEps.find((a: any) => a.number === kEp.number);
        if (aMatch && aMatch.thumbnail) {
          return { ...kEp, thumbnail: aMatch.thumbnail };
        }
      }
      
      return kEp;
    });
  }
  
  return { episodes, hasNext: kitsuData.hasNext, total: kitsuData.total };
}

async function findAnimeBySlug(slug: string) {
  const searchTerm = slug.replace(/-/g, ' ');
  try {
    const results = await kitsuSearch(searchTerm);
    let match = results.find((a: any) => a.slug === slug);
    if (!match && results.length > 0) match = results[0];
    if (match) {
      try { return await kitsuDetail(match.id); }
      catch { return match; }
    }
  } catch {}
  
  const words = slug.split('-').filter(w => w.length > 2);
  if (words.length > 1) {
    try {
      const shortQuery = words.slice(0, 3).join(' ');
      const results = await kitsuSearch(shortQuery);
      let match = results.find((a: any) => a.slug === slug);
      if (!match && results.length > 0) match = results[0];
      if (match) {
        try { return await kitsuDetail(match.id); }
        catch { return match; }
      }
    } catch {}
  }
  return null;
}

export const GET: APIRoute = async ({ url }) => {
  const action = url.searchParams.get('action') || 'list';
  const category = url.searchParams.get('category') || 'airing';
  const page = parseInt(url.searchParams.get('page') || '1') || 1;
  const query = url.searchParams.get('q') || '';
  const id = url.searchParams.get('id') || '';
  const slug = url.searchParams.get('slug') || '';
  const animeTitle = url.searchParams.get('title') || '';

  try {
    if (action === 'list') {
      const cacheKey = `list:${category}:${page}`;
      const hit = cached(cacheKey);
      if (hit) return jsonRes({ success: true, source: 'cache', ...hit });
      const data = await kitsuList(category, page);
      setCache(cacheKey, data);
      return jsonRes({ success: true, source: 'kitsu', ...data });
    }
    if (action === 'search' && query) {
      const cacheKey = `search:${query}`;
      const hit = cached(cacheKey);
      if (hit) return jsonRes({ success: true, source: 'cache', anime: hit });
      const results = await kitsuSearch(query);
      setCache(cacheKey, results);
      return jsonRes({ success: true, source: 'kitsu', anime: results });
    }
    if (action === 'detail') {
      if (id) {
        const cacheKey = `detail:${id}`;
        const hit = cached(cacheKey);
        if (hit) return jsonRes({ success: true, source: 'cache', anime: hit });
        const detail = await kitsuDetail(id);
        setCache(cacheKey, detail);
        return jsonRes({ success: true, source: 'kitsu', anime: detail });
      }
      if (slug) {
        const cacheKey = `slug:${slug}`;
        const hit = cached(cacheKey);
        if (hit) return jsonRes({ success: true, source: 'cache', anime: hit });
        const anime = await findAnimeBySlug(slug);
        if (anime) {
          setCache(cacheKey, anime);
          return jsonRes({ success: true, source: 'kitsu', anime });
        }
        return jsonRes({ success: false, error: 'Anime not found', slug }, 404);
      }
      return jsonRes({ success: false, error: 'ID or slug required' }, 400);
    }
    if (action === 'episodes' && id) {
      const cacheKey = `eps:${id}:${page}:${animeTitle}`;
      const hit = cached(cacheKey);
      if (hit) return jsonRes({ success: true, source: 'cache', ...hit });
      const data = await getEnrichedEpisodes(id, animeTitle, page);
      setCache(cacheKey, data);
      return jsonRes({ success: true, source: 'enriched', ...data });
    }
    const data = await kitsuList(category, page);
    return jsonRes({ success: true, source: 'kitsu', ...data });
  } catch (err: any) {
    console.error('API Error:', err);
    return jsonRes({ success: false, error: err.message || 'Unknown error' }, 500);
  }
};
