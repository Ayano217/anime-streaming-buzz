export const prerender = false;

import type { APIRoute } from 'astro';

const CACHE: Record<string, { data: any; time: number }> = {};
const CACHE_TTL = 30 * 60 * 1000;
const SLUG_INDEX: Record<string, any> = {}; // slug -> basic anime

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
    id: item.id,
    title,
    image: a.posterImage?.large || a.posterImage?.medium || '',
    score: a.averageRating ? (parseFloat(a.averageRating) / 10).toFixed(1) : null,
    episodes: a.episodeCount || 0,
    status: a.status || 'unknown',
    synopsis: a.synopsis || '',
    genres: [],
    year: a.startDate ? parseInt(a.startDate.substring(0, 4)) : null,
    slug: slugify(title),
    subtype: a.subtype || 'TV'
  };
}

// ─── KITSU: List anime with pagination ───
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

  const res = await fetch(url, {
    headers: { 'Accept': 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json' }
  });
  if (!res.ok) throw new Error(`Kitsu ${res.status}`);
  const json: any = await res.json();
  
  const anime = json.data.map(normalizeAnime);
  
  // Index by slug for later lookup
  anime.forEach((a: any) => { SLUG_INDEX[a.slug] = a; });

  const totalCount = json.meta?.count || 10000;
  const hasNext = offset + limit < totalCount;

  return { anime, hasNext, total: totalCount };
}

// ─── KITSU: Search anime ───
async function kitsuSearch(query: string) {
  const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=20&fields[anime]=canonicalTitle,titles,posterImage,averageRating,episodeCount,status,synopsis,startDate,subtype`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/vnd.api+json' }
  });
  if (!res.ok) throw new Error(`Kitsu search ${res.status}`);
  const json: any = await res.json();
  const results = json.data.map(normalizeAnime);
  results.forEach((a: any) => { SLUG_INDEX[a.slug] = a; });
  return results;
}

// ─── KITSU: Get full anime detail by ID ───
async function kitsuDetail(kitsuId: string) {
  const url = `https://kitsu.io/api/edge/anime/${kitsuId}?include=genres&fields[genres]=name`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/vnd.api+json' }
  });
  if (!res.ok) throw new Error(`Kitsu detail ${res.status}`);
  const json: any = await res.json();
  const a = json.data.attributes;
  const title = a.canonicalTitle || a.titles?.en || a.titles?.en_jp || 'Unknown';
  
  const genres = (json.included || [])
    .filter((i: any) => i.type === 'genres')
    .map((i: any) => i.attributes.name);

  return {
    id: json.data.id,
    title,
    image: a.posterImage?.large || a.posterImage?.original || '',
    coverImage: a.coverImage?.large || a.coverImage?.original || a.posterImage?.large || '',
    score: a.averageRating ? (parseFloat(a.averageRating) / 10).toFixed(1) : null,
    episodes: a.episodeCount || 0,
    status: a.status || 'unknown',
    synopsis: a.synopsis || '',
    description: a.description || a.synopsis || '',
    genres,
    year: a.startDate ? parseInt(a.startDate.substring(0, 4)) : null,
    slug: slugify(title),
    subtype: a.subtype || 'TV',
    ageRating: a.ageRating || '',
    ageRatingGuide: a.ageRatingGuide || '',
    endDate: a.endDate || null,
    startDate: a.startDate || null
  };
}

// ─── KITSU: Episodes ───
async function kitsuEpisodes(kitsuId: string, page: number = 1) {
  const limit = 20;
  const offset = (page - 1) * limit;
  const url = `https://kitsu.io/api/edge/anime/${kitsuId}/episodes?page[limit]=${limit}&page[offset]=${offset}&sort=number`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/vnd.api+json' }
  });
  if (!res.ok) return { episodes: [], hasNext: false, total: 0 };
  const json: any = await res.json();
  
  const episodes = json.data.map((ep: any) => {
    const e = ep.attributes;
    return {
      id: ep.id,
      number: e.number || 0,
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

// ─── SMART DETAIL FINDER: Multi-strategy ───
async function findAnimeBySlug(slug: string) {
  // Strategy 1: Check in-memory slug index (from prior list/search calls)
  if (SLUG_INDEX[slug]) {
    const basic = SLUG_INDEX[slug];
    try {
      return await kitsuDetail(basic.id);
    } catch {
      return basic; // fallback: use basic info
    }
  }

  // Strategy 2: Direct search with slug converted to words
  const searchTerm = slug.replace(/-/g, ' ');
  try {
    const results = await kitsuSearch(searchTerm);
    // Try exact slug match
    let match = results.find((a: any) => a.slug === slug);
    // Fuzzy: first result
    if (!match && results.length > 0) match = results[0];
    if (match) {
      try {
        return await kitsuDetail(match.id);
      } catch {
        return match;
      }
    }
  } catch (e) {
    console.warn('Search strategy failed:', e);
  }

  // Strategy 3: Try progressively shorter search queries
  const words = slug.split('-').filter(w => w.length > 2);
  if (words.length > 1) {
    // Try first 3 words
    try {
      const shortQuery = words.slice(0, 3).join(' ');
      const results = await kitsuSearch(shortQuery);
      let match = results.find((a: any) => a.slug === slug);
      if (!match && results.length > 0) match = results[0];
      if (match) {
        try {
          return await kitsuDetail(match.id);
        } catch {
          return match;
        }
      }
    } catch {}
  }

  // Strategy 4: Try just the first word
  if (words.length > 0) {
    try {
      const results = await kitsuSearch(words[0]);
      const match = results.find((a: any) => a.slug === slug) || results[0];
      if (match) {
        try {
          return await kitsuDetail(match.id);
        } catch {
          return match;
        }
      }
    } catch {}
  }

  return null;
}

// ─── MAIN HANDLER ───
export const GET: APIRoute = async ({ url }) => {
  const action = url.searchParams.get('action') || 'list';
  const category = url.searchParams.get('category') || 'airing';
  const page = parseInt(url.searchParams.get('page') || '1') || 1;
  const query = url.searchParams.get('q') || '';
  const id = url.searchParams.get('id') || '';
  const slug = url.searchParams.get('slug') || '';

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
      const cacheKey = `eps:${id}:${page}`;
      const hit = cached(cacheKey);
      if (hit) return jsonRes({ success: true, source: 'cache', ...hit });

      const data = await kitsuEpisodes(id, page);
      setCache(cacheKey, data);
      return jsonRes({ success: true, source: 'kitsu', ...data });
    }

    const data = await kitsuList(category, page);
    return jsonRes({ success: true, source: 'kitsu', ...data });

  } catch (err: any) {
    console.error('API Error:', err);
    return jsonRes({ success: false, error: err.message || 'Unknown error' }, 500);
  }
};
