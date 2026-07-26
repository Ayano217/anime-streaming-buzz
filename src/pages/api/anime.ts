export const prerender = false;

import type { APIRoute } from 'astro';

const CACHE: Record<string, { data: any; time: number }> = {};
const CACHE_TTL = 30 * 60 * 1000;

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
  
  const anime = json.data.map((item: any) => {
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
  });

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
  return json.data.map((item: any) => {
    const a = item.attributes;
    const title = a.canonicalTitle || a.titles?.en || a.titles?.en_jp || 'Unknown';
    return {
      id: item.id, title, image: a.posterImage?.large || a.posterImage?.medium || '',
      score: a.averageRating ? (parseFloat(a.averageRating) / 10).toFixed(1) : null,
      episodes: a.episodeCount || 0, status: a.status || 'unknown',
      synopsis: a.synopsis || '', genres: [], year: a.startDate ? parseInt(a.startDate.substring(0, 4)) : null,
      slug: slugify(title), subtype: a.subtype || 'TV'
    };
  });
}

// ─── KITSU: Get anime detail by ID ───
async function kitsuDetail(kitsuId: string) {
  const url = `https://kitsu.io/api/edge/anime/${kitsuId}?include=genres,episodes&fields[genres]=name`;
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
    id: json.data.id, title, image: a.posterImage?.large || a.posterImage?.original || '',
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

// ─── KITSU: Get episodes for anime ───
async function kitsuEpisodes(kitsuId: string, page: number = 1) {
  const limit = 20;
  const offset = (page - 1) * limit;
  const url = `https://kitsu.io/api/edge/anime/${kitsuId}/episodes?page[limit]=${limit}&page[offset]=${offset}&sort=number`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/vnd.api+json' }
  });
  if (!res.ok) throw new Error(`Kitsu episodes ${res.status}`);
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

// ─── MAIN HANDLER ───
export const GET: APIRoute = async ({ url }) => {
  const action = url.searchParams.get('action') || 'list';
  const category = url.searchParams.get('category') || 'airing';
  const page = parseInt(url.searchParams.get('page') || '1') || 1;
  const query = url.searchParams.get('q') || '';
  const id = url.searchParams.get('id') || '';
  const slug = url.searchParams.get('slug') || '';

  try {
    // ─── LIST (with pagination) ───
    if (action === 'list') {
      const cacheKey = `list:${category}:${page}`;
      const hit = cached(cacheKey);
      if (hit) return jsonRes({ success: true, source: 'cache', ...hit });

      const data = await kitsuList(category, page);
      setCache(cacheKey, data);
      return jsonRes({ success: true, source: 'kitsu', ...data });
    }

    // ─── SEARCH ───
    if (action === 'search' && query) {
      const cacheKey = `search:${query}`;
      const hit = cached(cacheKey);
      if (hit) return jsonRes({ success: true, source: 'cache', anime: hit });

      const results = await kitsuSearch(query);
      setCache(cacheKey, results);
      return jsonRes({ success: true, source: 'kitsu', anime: results });
    }

    // ─── DETAIL by slug (find from list then get full detail) ───
    if (action === 'detail' && (slug || id)) {
      if (id) {
        const cacheKey = `detail:${id}`;
        const hit = cached(cacheKey);
        if (hit) return jsonRes({ success: true, source: 'cache', anime: hit });

        const detail = await kitsuDetail(id);
        setCache(cacheKey, detail);
        return jsonRes({ success: true, source: 'kitsu', anime: detail });
      }
      // by slug — search for it
      if (slug) {
        const cacheKey = `slug:${slug}`;
        const hit = cached(cacheKey);
        if (hit) return jsonRes({ success: true, source: 'cache', anime: hit });

        const searchTerm = slug.replace(/-/g, ' ');
        const results = await kitsuSearch(searchTerm);
        const match = results.find((a: any) => a.slug === slug) || results[0];
        if (match) {
          const detail = await kitsuDetail(match.id);
          setCache(cacheKey, detail);
          return jsonRes({ success: true, source: 'kitsu', anime: detail });
        }
        return jsonRes({ success: false, error: 'Anime not found' }, 404);
      }
    }

    // ─── EPISODES ───
    if (action === 'episodes' && id) {
      const cacheKey = `eps:${id}:${page}`;
      const hit = cached(cacheKey);
      if (hit) return jsonRes({ success: true, source: 'cache', ...hit });

      const data = await kitsuEpisodes(id, page);
      setCache(cacheKey, data);
      return jsonRes({ success: true, source: 'kitsu', ...data });
    }

    // Default: list
    const data = await kitsuList(category, page);
    return jsonRes({ success: true, source: 'kitsu', ...data });

  } catch (err: any) {
    console.error('API Error:', err);
    return jsonRes({ success: false, error: err.message || 'Unknown error' }, 500);
  }
};
