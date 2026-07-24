import type { APIRoute } from 'astro';

export const prerender = false;

// In-memory cache (per Cloudflare Worker instance)
const cache = new Map<string, { data: any; expires: number }>();
const CACHE_MS = 5 * 60 * 1000; // 5 minutes

// Rate limiter
let lastCall = 0;
const MIN_DELAY = 400;

async function jikanFetch(url: string, retries = 2): Promise<any> {
  // Check cache
  const cached = cache.get(url);
  if (cached && Date.now() < cached.expires) {
    return cached.data;
  }
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    const now = Date.now();
    const elapsed = now - lastCall;
    if (elapsed < MIN_DELAY) {
      await new Promise(r => setTimeout(r, MIN_DELAY - elapsed));
    }
    lastCall = Date.now();
    
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'AniTubeBuzz/1.0' },
      });
      
      if (res.status === 429) {
        const wait = 1500 * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      
      if (!res.ok) {
        if (attempt === retries) return null;
        continue;
      }
      
      const json = await res.json();
      
      // Cache successful response
      cache.set(url, { data: json, expires: Date.now() + CACHE_MS });
      
      return json;
    } catch (e) {
      if (attempt === retries) return null;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return null;
}

export const GET: APIRoute = async ({ url }) => {
  const params = new URL(url).searchParams;
  const source = params.get('source') || 'airing';
  const page = parseInt(params.get('page') || '1');
  
  const endpoints: Record<string, string> = {
    airing:   `https://api.jikan.moe/v4/seasons/now?filter=tv&limit=24&page=${page}`,
    top:      `https://api.jikan.moe/v4/top/anime?filter=airing&limit=24&page=${page}`,
    upcoming: `https://api.jikan.moe/v4/seasons/upcoming?filter=tv&limit=24&page=${page}`,
    popular:  `https://api.jikan.moe/v4/top/anime?limit=24&page=${page}`,
    movie:    `https://api.jikan.moe/v4/top/anime?type=movie&limit=24&page=${page}`,
  };
  
  const endpoint = endpoints[source] || endpoints.airing;
  const data = await jikanFetch(endpoint);
  
  if (!data) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to fetch anime data',
      data: [],
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=60',
      },
    });
  }
  
  const simplified = (data.data || []).map((a: any) => ({
    id:       a.mal_id,
    title:    a.title_english || a.title,
    image:    a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || '',
    score:    a.score,
    year:     a.year,
    episodes: a.episodes,
    genre:    a.genres?.[0]?.name || '',
    status:   a.status || '',
    type:     a.type || 'TV',
  }));
  
  return new Response(JSON.stringify({
    success: true,
    data: simplified,
    pagination: data.pagination || {},
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
};
