export const prerender = false;

import type { APIRoute } from 'astro';

const CACHE: Record<string, { data: any; time: number }> = {};
const CACHE_TTL = 60 * 60 * 1000;

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export const GET: APIRoute = async ({ url, locals }) => {
  const rawQuery = (url.searchParams.get('q') || '').trim();
  const type = url.searchParams.get('type') || 'auto';

  if (!rawQuery) {
    return jsonRes({ success: false, error: 'Query required' }, 400);
  }

  const env = (locals as any)?.runtime?.env || {};
  const API_KEY = env.YOUTUBE_API_KEY || (globalThis as any).YOUTUBE_API_KEY || '';

  if (!API_KEY) {
    return jsonRes({ 
      success: false, 
      error: 'YouTube API key not configured',
      fallback: `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(rawQuery)}`
    }, 500);
  }

  // Detect intent from query
  const lowerQuery = rawQuery.toLowerCase();
  const isEpisode = /episode|ep\s*\d+/i.test(lowerQuery);
  const isTrailer = /trailer/i.test(lowerQuery);

  let searchQuery = rawQuery;
  let videoDuration = 'any';

  if (isEpisode) {
    // For episodes: prefer longer videos + english sub
    if (!lowerQuery.includes('english') && !lowerQuery.includes('sub') && !lowerQuery.includes('dub')) {
      searchQuery = rawQuery + ' english sub';
    }
    videoDuration = 'medium'; // 4-20 min preferred for episodes
  } else if (isTrailer) {
    searchQuery = rawQuery.includes('official') ? rawQuery : rawQuery + ' official';
    videoDuration = 'short';
  } else if (type === 'trailer') {
    searchQuery = rawQuery + ' anime official trailer';
    videoDuration = 'short';
  }

  const cacheKey = `${type}:${searchQuery}`;
  const hit = CACHE[cacheKey];
  if (hit && Date.now() - hit.time < CACHE_TTL) {
    return jsonRes({ success: true, source: 'cache', ...hit.data });
  }

  try {
    const params = new URLSearchParams({
      part: 'snippet',
      q: searchQuery,
      type: 'video',
      maxResults: '10',
      videoEmbeddable: 'true',
      videoSyndicated: 'true',
      safeSearch: 'moderate',
      key: API_KEY
    });

    if (videoDuration !== 'any') {
      params.set('videoDuration', videoDuration);
    }

    const ytUrl = `https://www.googleapis.com/youtube/v3/search?${params.toString()}`;
    const res = await fetch(ytUrl);
    
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`YouTube API ${res.status}: ${errText.slice(0, 100)}`);
    }

    const json: any = await res.json();
    let items = (json.items || []).map((item: any) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || '',
      publishedAt: item.snippet.publishedAt,
      description: item.snippet.description
    }));

    // For episode searches, prefer videos with "full" or "ep" in title, deprioritize "trailer"
    if (isEpisode) {
      items.sort((a: any, b: any) => {
        const aTitle = a.title.toLowerCase();
        const bTitle = b.title.toLowerCase();
        const aScore = 
          (aTitle.includes('full') ? 3 : 0) +
          (aTitle.includes('episode') || aTitle.includes(' ep ') ? 2 : 0) +
          (aTitle.includes('english') || aTitle.includes('sub') || aTitle.includes('dub') ? 1 : 0) -
          (aTitle.includes('trailer') ? 5 : 0) -
          (aTitle.includes('reaction') ? 3 : 0) -
          (aTitle.includes('review') ? 2 : 0);
        const bScore = 
          (bTitle.includes('full') ? 3 : 0) +
          (bTitle.includes('episode') || bTitle.includes(' ep ') ? 2 : 0) +
          (bTitle.includes('english') || bTitle.includes('sub') || bTitle.includes('dub') ? 1 : 0) -
          (bTitle.includes('trailer') ? 5 : 0) -
          (bTitle.includes('reaction') ? 3 : 0) -
          (bTitle.includes('review') ? 2 : 0);
        return bScore - aScore;
      });
    }

    if (items.length === 0) {
      return jsonRes({ success: false, error: 'No videos found' }, 404);
    }

    const result = {
      videos: items,
      primary: items[0],
      query: searchQuery
    };

    CACHE[cacheKey] = { data: result, time: Date.now() };
    return jsonRes({ success: true, source: 'youtube', ...result });

  } catch (err: any) {
    console.error('YouTube API error:', err);
    return jsonRes({ 
      success: false, 
      error: err.message,
      fallback: `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(rawQuery)}`
    }, 500);
  }
};
