export const prerender = false;

import type { APIRoute } from 'astro';

const CACHE: Record<string, { data: any; time: number }> = {};
const CACHE_TTL = 10 * 60 * 1000; // 10 min (increased since we have fresh static data)
const CACHE_VERSION = 'v4';
const JIKAN_BASE = 'https://api.jikan.moe/v4';

// ═══ Static data loaded once at cold start ═══
let STATIC_DATA: any = null;
let STATIC_LOAD_ATTEMPTED = false;

async function loadStaticData(): Promise<any> {
  if (STATIC_DATA) return STATIC_DATA;
  if (STATIC_LOAD_ATTEMPTED) return null;
  STATIC_LOAD_ATTEMPTED = true;
  
  try {
    // In Cloudflare Pages, static assets are served from the build output
    // We fetch from the public path
    const response = await fetch('https://anime-streaming-buzz.pages.dev/data/anime-static.json');
    if (response.ok) {
      STATIC_DATA = await response.json();
      console.log(`[anime] Static data loaded: ${STATIC_DATA?.total || 0} titles, updated: ${STATIC_DATA?.updated || 'unknown'}`);
      return STATIC_DATA;
    }
  } catch (e) {
    console.warn('[anime] Static data fetch failed:', e);
  }
  
  // Fallback: try import (works in build context)
  try {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(process.cwd(), 'public', 'data', 'anime-static.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    STATIC_DATA = JSON.parse(raw);
    console.log(`[anime] Static data loaded from file: ${STATIC_DATA?.total || 0} titles`);
    return STATIC_DATA;
  } catch (e2) {
    // This is expected to fail in Cloudflare Workers
  }
  
  return null;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim().slice(0, 80);
}

function cached(key: string): any | null {
  const k = `${CACHE_VERSION}:${key}`;
  const c = CACHE[k];
  if (c && Date.now() - c.time < CACHE_TTL) return c.data;
  return null;
}

function setCache(key: string, data: any) {
  const k = `${CACHE_VERSION}:${key}`;
  CACHE[k] = { data, time: Date.now() };
  const keys = Object.keys(CACHE);
  if (keys.length > 150) {
    // Remove oldest 50 entries
    const sorted = Object.entries(CACHE).sort((a, b) => a[1].time - b[1].time);
    sorted.slice(0, 50).forEach(([key]) => delete CACHE[key]);
  }
}

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=600, stale-while-revalidate=300',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// ═══ Static Data Query Functions ═══

function queryStaticList(staticData: any, category: string, page: number, limit: number = 25) {
  const allAnime = staticData?.anime || [];
  if (allAnime.length === 0) return null;
  
  let filtered: any[];
  
  switch (category) {
    case 'airing':
      // First: items with 'airing' category, sorted by start_date desc
      filtered = allAnime.filter((a: any) => 
        (a.categories && a.categories.includes('airing')) || a.status === 'current'
      );
      filtered.sort((a: any, b: any) => {
        const da = a.start_date ? new Date(a.start_date).getTime() : 0;
        const db = b.start_date ? new Date(b.start_date).getTime() : 0;
        return db - da;
      });
      break;
    
    case 'top':
      filtered = allAnime.filter((a: any) => 
        (a.categories && a.categories.includes('top')) || (a.score && a.score >= 7.5)
      );
      filtered.sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
      break;
    
    case 'popular':
      filtered = allAnime.filter((a: any) => 
        (a.categories && a.categories.includes('popular')) || (a.members && a.members > 50000)
      );
      filtered.sort((a: any, b: any) => (b.members || 0) - (a.members || 0));
      break;
    
    case 'upcoming':
      filtered = allAnime.filter((a: any) => 
        (a.categories && a.categories.includes('upcoming')) || a.status === 'upcoming'
      );
      filtered.sort((a: any, b: any) => {
        const da = a.start_date ? new Date(a.start_date).getTime() : 0;
        const db = b.start_date ? new Date(b.start_date).getTime() : 0;
        return da - db; // Earliest upcoming first
      });
      break;
    
    case 'movies':
      filtered = allAnime.filter((a: any) => 
        (a.categories && a.categories.includes('movies')) || 
        (a.type && a.type.toLowerCase() === 'movie')
      );
      filtered.sort((a: any, b: any) => (b.members || 0) - (a.members || 0));
      break;
    
    default:
      filtered = [...allAnime];
      filtered.sort((a: any, b: any) => (b.members || 0) - (a.members || 0));
  }
  
  const offset = (page - 1) * limit;
  const paged = filtered.slice(offset, offset + limit);
  
  if (paged.length === 0 && page === 1) return null; // No data for this category
  
  // Normalize to frontend format
  const anime = paged.map((a: any) => ({
    id: a.id,
    title: a.title,
    image: a.image || '',
    score: a.score ? String(a.score) : null,
    episodes: a.episodes || 0,
    status: a.status || 'unknown',
    synopsis: a.synopsis || '',
    genres: a.genres || [],
    year: a.year,
    slug: a.slug || slugify(a.title),
    subtype: a.type || 'TV',
    startDate: a.start_date || null,
    endDate: a.end_date || null,
    members: a.members || 0,
    rank: a.rank || null
  }));
  
  return {
    anime,
    hasNext: offset + limit < filtered.length,
    total: filtered.length,
    updated: staticData.updated || null
  };
}

function searchStatic(staticData: any, query: string) {
  const allAnime = staticData?.anime || [];
  if (allAnime.length === 0 || !query) return null;
  
  const q = query.toLowerCase().trim();
  
  const scored = allAnime.map((a: any) => {
    const title = (a.title || '').toLowerCase();
    const titleJa = (a.title_japanese || '').toLowerCase();
    let score = 0;
    
    if (title === q) score = 1000;
    else if (title.startsWith(q)) score = 500;
    else if (title.includes(q)) score = 300;
    else if (titleJa.includes(q)) score = 250;
    else {
      const words = title.split(/\s+/);
      for (const w of words) {
        if (w.startsWith(q)) { score = 200; break; }
      }
    }
    
    if (score === 0) {
      // Character match fallback
      let matches = 0;
      for (const ch of q) {
        if (title.includes(ch)) matches++;
      }
      if (matches >= q.length * 0.8) score = 50;
    }
    
    return { anime: a, score };
  })
  .filter(x => x.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 20);
  
  if (scored.length === 0) return null;
  
  return scored.map(x => ({
    id: x.anime.id,
    title: x.anime.title,
    image: x.anime.image || '',
    score: x.anime.score ? String(x.anime.score) : null,
    episodes: x.anime.episodes || 0,
    status: x.anime.status || 'unknown',
    synopsis: x.anime.synopsis || '',
    genres: x.anime.genres || [],
    year: x.anime.year,
    slug: x.anime.slug || slugify(x.anime.title),
    subtype: x.anime.type || 'TV',
    startDate: x.anime.start_date || null,
    members: x.anime.members || 0
  }));
}

function findStaticBySlug(staticData: any, slug: string) {
  const allAnime = staticData?.anime || [];
  const match = allAnime.find((a: any) => a.slug === slug);
  if (!match) return null;
  
  return {
    id: match.id,
    title: match.title,
    image: match.image || '',
    coverImage: match.image || '',
    score: match.score ? String(match.score) : null,
    episodes: match.episodes || 0,
    status: match.status || 'unknown',
    synopsis: match.synopsis || '',
    description: match.synopsis || '',
    genres: match.genres || [],
    year: match.year,
    slug: match.slug,
    subtype: match.type || 'TV',
    startDate: match.start_date || null,
    endDate: match.end_date || null,
    ageRating: match.rating || '',
    studios: match.studios || [],
    trailer_url: match.trailer_url || '',
    trailer_embed: match.trailer_embed || ''
  };
}

// ═══ Jikan API Functions (Fallback) ═══

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

async function jikanFetch(endpoint: string) {
  const url = `${JIKAN_BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(`Jikan ${res.status}`);
  return res.json();
}

async function jikanCurrentSeason(page: number = 1) {
  const json: any = await jikanFetch(`/seasons/now?page=${page}&limit=25&sfw=true`);
  if (!json.data || json.data.length === 0) throw new Error('Empty Jikan response');
  
  let anime = json.data.map(normalizeJikan);
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
}

async function jikanTop(category: string, page: number = 1) {
  const filterMap: Record<string, string> = {
    top: '', upcoming: 'upcoming', popular: 'bypopularity', movies: ''
  };
  const filter = filterMap[category] || 'bypopularity';
  const isMovie = category === 'movies';
  
  let url = `/top/anime?page=${page}&limit=25&sfw=true`;
  if (filter) url += `&filter=${filter}`;
  if (isMovie) url += '&type=movie';
  
  const json: any = await jikanFetch(url);
  if (!json.data || json.data.length === 0) throw new Error('Empty Jikan response');
  return {
    anime: json.data.map(normalizeJikan),
    hasNext: json.pagination?.has_next_page !== false,
    total: json.pagination?.items?.total || 1000
  };
}

async function jikanSearch(query: string) {
  const json: any = await jikanFetch(`/anime?q=${encodeURIComponent(query)}&limit=20&sfw=true&order_by=score&sort=desc`);
  return (json.data || []).map(normalizeJikan);
}

async function jikanDetail(malId: string) {
  const json: any = await jikanFetch(`/anime/${malId}/full`);
  if (!json.data) throw new Error('No Jikan data');
  const item = json.data;
  const base = normalizeJikan(item);
  return {
    ...base,
    description: item.synopsis || '',
    coverImage: item.images?.jpg?.large_image_url || base.image,
    ageRating: item.rating || '',
    ageRatingGuide: '',
    studios: (item.studios || []).map((s: any) => s.name),
    trailer_url: item.trailer?.url || '',
    trailer_embed: item.trailer?.embed_url || ''
  };
}

// ═══ Kitsu API Functions (Secondary Fallback) ═══

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
  const limit = 25;
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

// ═══ Episode Functions (unchanged logic, slightly cleaned up) ═══

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

// ═══ Find anime by slug (tries static → jikan → kitsu) ═══

async function findAnimeBySlug(slug: string, staticData: any) {
  // Try static first
  if (staticData) {
    const staticResult = findStaticBySlug(staticData, slug);
    if (staticResult) return { source: 'static', anime: staticResult };
  }
  
  const searchTerm = slug.replace(/-/g, ' ');
  
  // Try Jikan
  try {
    const json: any = await jikanFetch(`/anime?q=${encodeURIComponent(searchTerm)}&limit=10&sfw=true`);
    if (json.data && json.data.length > 0) {
      const results = json.data.map(normalizeJikan);
      const exact = results.find((a: any) => a.slug === slug);
      const pick = exact || results[0];
      
      try {
        const detail = await jikanDetail(pick.id);
        if (detail) return { source: 'jikan', anime: detail };
      } catch {}
      return { source: 'jikan', anime: pick };
    }
  } catch {}
  
  // Try Kitsu
  try {
    const results = await kitsuSearch(searchTerm);
    let match = results.find((a: any) => a.slug === slug);
    if (!match && results.length > 0) match = results[0];
    if (match) {
      try { return { source: 'kitsu', anime: await kitsuDetail(match.id) }; }
      catch { return { source: 'kitsu', anime: match }; }
    }
  } catch {}
  
  return null;
}

// ═══ MAIN HANDLER ═══

export const GET: APIRoute = async ({ url, locals }) => {
  const action = url.searchParams.get('action') || 'list';
  const category = url.searchParams.get('category') || 'airing';
  const page = parseInt(url.searchParams.get('page') || '1') || 1;
  const query = url.searchParams.get('q') || '';
  const id = url.searchParams.get('id') || '';
  const slug = url.searchParams.get('slug') || '';
  const animeTitle = url.searchParams.get('title') || '';
  const noCache = url.searchParams.get('nocache') === '1';

  // Load static data (cached after first load)
  const staticData = await loadStaticData();

  try {
    // ═══ LIST ═══
    if (action === 'list') {
      const cacheKey = `list:${category}:${page}`;
      if (!noCache) {
        const hit = cached(cacheKey);
        if (hit) return jsonRes({ success: true, source: 'cache', ...hit });
      }
      
      // Strategy: Static data first (instant) → Jikan fallback → Kitsu fallback
      let data: any = null;
      let source = 'static';
      
      // Try static data first (always available, updated every 3h)
      if (staticData) {
        data = queryStaticList(staticData, category, page);
        if (data) {
          data.source_updated = staticData.updated;
          source = 'static';
        }
      }
      
      // If static didn't have this category/page, try live API
      if (!data) {
        source = 'jikan';
        try {
          if (category === 'airing') {
            data = await jikanCurrentSeason(page);
          } else {
            data = await jikanTop(category, page);
          }
        } catch (jikanErr) {
          console.warn('[anime] Jikan failed, trying Kitsu:', jikanErr);
          source = 'kitsu';
          try {
            data = await kitsuList(category, page);
          } catch (kitsuErr) {
            console.warn('[anime] Kitsu also failed:', kitsuErr);
          }
        }
      }
      
      if (!data || !data.anime || data.anime.length === 0) {
        return jsonRes({ 
          success: false, 
          error: 'No anime data available. All sources failed.',
          source: 'none'
        }, 503);
      }
      
      setCache(cacheKey, { ...data, source });
      return jsonRes({ success: true, source, ...data });
    }
    
    // ═══ SEARCH ═══
    if (action === 'search' && query) {
      const cacheKey = `search:${query}`;
      const hit = cached(cacheKey);
      if (hit) return jsonRes({ success: true, source: 'cache', anime: hit });
      
      // Try static search first
      let results: any = null;
      let source = 'static';
      
      if (staticData) {
        results = searchStatic(staticData, query);
      }
      
      // Also try live API for potentially more results
      let liveResults: any[] = [];
      try {
        liveResults = await jikanSearch(query);
        source = results ? 'static+jikan' : 'jikan';
      } catch {
        try {
          liveResults = await kitsuSearch(query);
          source = results ? 'static+kitsu' : 'kitsu';
        } catch {}
      }
      
      // Merge results (static first, then live, deduped by ID)
      const seenIds = new Set<string>();
      const merged: any[] = [];
      
      if (results) {
        for (const r of results) {
          if (!seenIds.has(r.id)) {
            seenIds.add(r.id);
            merged.push(r);
          }
        }
      }
      
      for (const r of liveResults) {
        if (!seenIds.has(r.id)) {
          seenIds.add(r.id);
          merged.push(r);
        }
      }
      
      const finalResults = merged.slice(0, 20);
      setCache(cacheKey, finalResults);
      return jsonRes({ success: true, source, anime: finalResults });
    }
    
    // ═══ DETAIL ═══
    if (action === 'detail') {
      if (id) {
        const cacheKey = `detail:${id}`;
        const hit = cached(cacheKey);
        if (hit) return jsonRes({ success: true, source: 'cache', anime: hit });
        
        // Try static
        if (staticData) {
          const staticAnime = staticData.anime?.find((a: any) => a.id === id);
          if (staticAnime) {
            const detail = {
              id: staticAnime.id,
              title: staticAnime.title,
              image: staticAnime.image || '',
              coverImage: staticAnime.image || '',
              score: staticAnime.score ? String(staticAnime.score) : null,
              episodes: staticAnime.episodes || 0,
              status: staticAnime.status || 'unknown',
              synopsis: staticAnime.synopsis || '',
              description: staticAnime.synopsis || '',
              genres: staticAnime.genres || [],
              year: staticAnime.year,
              slug: staticAnime.slug || slugify(staticAnime.title),
              subtype: staticAnime.type || 'TV',
              ageRating: staticAnime.rating || '',
              studios: staticAnime.studios || [],
              trailer_url: staticAnime.trailer_url || '',
              trailer_embed: staticAnime.trailer_embed || ''
            };
            
            // Try to enrich with live Jikan data (more detail)
            if (/^\d+$/.test(id)) {
              try {
                const liveDetail = await jikanDetail(id);
                if (liveDetail) {
                  const enriched = { ...detail, ...liveDetail };
                  setCache(cacheKey, enriched);
                  return jsonRes({ success: true, source: 'static+jikan', anime: enriched });
                }
              } catch {} // Static data is fine
            }
            
            setCache(cacheKey, detail);
            return jsonRes({ success: true, source: 'static', anime: detail });
          }
        }
        
        // Try Jikan
        if (/^\d+$/.test(id)) {
          try {
            const detail = await jikanDetail(id);
            if (detail) { setCache(cacheKey, detail); return jsonRes({ success: true, source: 'jikan', anime: detail }); }
          } catch {}
        }
        
        // Try Kitsu
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
        
        const result = await findAnimeBySlug(slug, staticData);
        if (result) {
          setCache(cacheKey, result.anime);
          return jsonRes({ success: true, source: result.source, anime: result.anime });
        }
        return jsonRes({ success: false, error: 'Anime not found', slug }, 404);
      }
      
      return jsonRes({ success: false, error: 'ID or slug required' }, 400);
    }
    
    // ═══ EPISODES ═══
    if (action === 'episodes' && id) {
      const cacheKey = `eps:${id}:${page}:${animeTitle}`;
      const hit = cached(cacheKey);
      if (hit) return jsonRes({ success: true, source: 'cache', ...hit });
      
      let kitsuId = id;
      if (/^\d+$/.test(id) && animeTitle) {
        try {
          const kitsuResults = await kitsuSearch(animeTitle);
          if (kitsuResults.length > 0) kitsuId = kitsuResults[0].id;
        } catch {}
      }
      
      const data = await kitsuEpisodes(kitsuId, page);
      setCache(cacheKey, data);
      return jsonRes({ success: true, source: 'kitsu', ...data });
    }
    
    // ═══ DEFAULT ═══
    if (staticData) {
      const data = queryStaticList(staticData, 'airing', 1);
      if (data) return jsonRes({ success: true, source: 'static', ...data });
    }
    
    const data = await jikanCurrentSeason(page).catch(() => kitsuList('airing', page));
    return jsonRes({ success: true, source: 'fallback', ...data });
    
  } catch (err: any) {
    console.error('[anime] API Error:', err);
    return jsonRes({ success: false, error: err.message || 'Unknown error' }, 500);
  }
};
