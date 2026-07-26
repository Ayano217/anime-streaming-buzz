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
  const totalCount = json.meta?.count || 10000;
  const hasNext = offset + limit < totalCount;
  return { anime, hasNext, total: totalCount };
}

async function kitsuSearch(query: string) {
  const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=20&fields[anime]=canonicalTitle,titles,posterImage,averageRating,episodeCount,status,synopsis,startDate,subtype`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/vnd.api+json' }
  });
  if (!res.ok) throw new Error(`Kitsu search ${res.status}`);
  const json: any = await res.json();
  return json.data.map(normalizeAnime);
}

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

// ─── ANILIST: Get episodes with real thumbnails ───
async function anilistEpisodes(animeTitle: string) {
  const query = `
    query ($search: String) {
      Media(search: $search, type: ANIME) {
        id
        title { romaji english native }
        episodes
        streamingEpisodes {
          title
          thumbnail
          url
          site
        }
        coverImage { large extraLarge }
        bannerImage
      }
    }
  `;
  
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ query, variables: { search: animeTitle } })
    });
    
    if (!res.ok) return null;
    const json: any = await res.json();
    const media = json.data?.Media;
    if (!media) return null;
    
    const streamingEps = media.streamingEpisodes || [];
    if (streamingEps.length === 0) return null;
    
    // Parse episode number from title (e.g., "Episode 5 - The Beginning")
    const episodes = streamingEps.map((ep: any, idx: number) => {
      const titleMatch = (ep.title || '').match(/(?:episode|ep\.?)\s*(\d+)/i);
      const num = titleMatch ? parseInt(titleMatch[1]) : (idx + 1);
      const cleanTitle = (ep.title || '')
        .replace(/^(?:episode|ep\.?)\s*\d+\s*[-:–]\s*/i, '')
        .replace(/^(?:episode|ep\.?)\s*\d+$/i, '')
        .trim() || `Episode ${num}`;
      
      return {
        id: `anilist_${num}`,
        number: num,
        title: cleanTitle,
        synopsis: '',
        thumbnail: ep.thumbnail || '',
        airdate: '',
        seasonNumber: 1,
        length: null,
        streamUrl: ep.url || '',
        streamSite: ep.site || ''
      };
    });
    
    // Sort by episode number
    episodes.sort((a: any, b: any) => a.number - b.number);
    
    return episodes;
  } catch (e) {
    console.warn('AniList episodes fetch failed:', e);
    return null;
  }
}

async function findAnimeBySlug(slug: string) {
  const searchTerm = slug.replace(/-/g, ' ');
  try {
    const results = await kitsuSearch(searchTerm);
    let match = results.find((a: any) => a.slug === slug);
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
      
      // Try AniList first if title provided (better thumbnails)
      if (animeTitle && page === 1) {
        try {
          const anilistEps = await anilistEpisodes(animeTitle);
          if (anilistEps && anilistEps.length > 0) {
            const data = { episodes: anilistEps, hasNext: false, total: anilistEps.length };
            setCache(cacheKey, data);
            return jsonRes({ success: true, source: 'anilist', ...data });
          }
        } catch (e) {
          console.warn('AniList fallback to Kitsu:', e);
        }
      }
      
      // Fallback: Kitsu
      const data = await kitsuEpisodes(id, page);
      
      // Try to enrich Kitsu episodes with AniList thumbnails if any are missing
      if (animeTitle && data.episodes.length > 0 && data.episodes.some((e: any) => !e.thumbnail)) {
        try {
          const anilistEps = await anilistEpisodes(animeTitle);
          if (anilistEps) {
            data.episodes = data.episodes.map((kEp: any) => {
              if (kEp.thumbnail) return kEp;
              const match = anilistEps.find((aEp: any) => aEp.number === kEp.number);
              if (match && match.thumbnail) {
                return { ...kEp, thumbnail: match.thumbnail };
              }
              return kEp;
            });
          }
        } catch {}
      }
      
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
