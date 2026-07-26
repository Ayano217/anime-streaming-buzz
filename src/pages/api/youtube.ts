export const prerender = false;

import type { APIRoute } from 'astro';

const CACHE: Record<string, { data: any; time: number }> = {};
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

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
  const query = url.searchParams.get('q') || '';
  const type = url.searchParams.get('type') || 'trailer'; // trailer | episode | opening

  if (!query) {
    return jsonRes({ success: false, error: 'Query required' }, 400);
  }

  // Get API key from Cloudflare env
  const env = (locals as any)?.runtime?.env || {};
  const API_KEY = env.YOUTUBE_API_KEY || (globalThis as any).YOUTUBE_API_KEY || '';

  if (!API_KEY) {
    return jsonRes({ 
      success: false, 
      error: 'YouTube API key not configured',
      fallback: `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(query)}`
    }, 500);
  }

  const cacheKey = `${type}:${query}`;
  const hit = CACHE[cacheKey];
  if (hit && Date.now() - hit.time < CACHE_TTL) {
    return jsonRes({ success: true, source: 'cache', ...hit.data });
  }

  try {
    // Build query with type modifier
    let searchQuery = query;
    if (type === 'trailer') searchQuery = `${query} anime official trailer`;
    else if (type === 'opening') searchQuery = `${query} anime opening full`;
    else if (type === 'episode') searchQuery = `${query} anime episode english`;

    const ytUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&maxResults=8&videoEmbeddable=true&videoSyndicated=true&safeSearch=moderate&key=${API_KEY}`;

    const res = await fetch(ytUrl);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`YouTube API ${res.status}: ${errText.slice(0, 100)}`);
    }

    const json: any = await res.json();
    const items = (json.items || []).map((item: any) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || '',
      publishedAt: item.snippet.publishedAt,
      description: item.snippet.description
    }));

    if (items.length === 0) {
      return jsonRes({ success: false, error: 'No videos found' }, 404);
    }

    const result = {
      videos: items,
      primary: items[0]
    };

    CACHE[cacheKey] = { data: result, time: Date.now() };

    return jsonRes({ success: true, source: 'youtube', ...result });

  } catch (err: any) {
    console.error('YouTube API error:', err);
    return jsonRes({ 
      success: false, 
      error: err.message,
      fallback: `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(query)}`
    }, 500);
  }
};
