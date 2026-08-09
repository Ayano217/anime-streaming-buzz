export const prerender = false;
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ url, locals }) => {
  const env: any = (locals as any)?.runtime?.env || {};
  const key = env.TMDB_API_KEY || '';
  const query = url.searchParams.get('q') || 'demon slayer';
  
  const result: any = {
    hasKey: !!key,
    keyLength: key.length,
    keyPreview: key ? key.substring(0, 8) + '...' : 'MISSING',
    envKeys: Object.keys(env),
    query,
  };

  if (!key) {
    result.error = 'TMDB_API_KEY not found in env';
    return new Response(JSON.stringify(result, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const tmdbUrl = `https://api.themoviedb.org/3/search/tv?api_key=${key}&query=${encodeURIComponent(query)}`;
    const res = await fetch(tmdbUrl);
    result.tmdbStatus = res.status;
    result.tmdbOk = res.ok;
    
    if (res.ok) {
      const data: any = await res.json();
      result.totalResults = data.total_results || 0;
      result.firstResult = data.results?.[0] ? {
        id: data.results[0].id,
        name: data.results[0].name,
        origin: data.results[0].origin_country,
        genres: data.results[0].genre_ids,
      } : null;
      
      // Try to fetch season 1 of first result
      if (data.results?.[0]?.id) {
        const seasonUrl = `https://api.themoviedb.org/3/tv/${data.results[0].id}/season/1?api_key=${key}`;
        const sRes = await fetch(seasonUrl);
        if (sRes.ok) {
          const sData: any = await sRes.json();
          result.season1EpisodeCount = sData.episodes?.length || 0;
          result.firstEpisodeStill = sData.episodes?.[0]?.still_path 
            ? `https://image.tmdb.org/t/p/w400${sData.episodes[0].still_path}`
            : 'NO STILL';
        }
      }
    } else {
      result.tmdbError = await res.text();
    }
  } catch (e: any) {
    result.fetchError = e.message;
  }

  return new Response(JSON.stringify(result, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
};
