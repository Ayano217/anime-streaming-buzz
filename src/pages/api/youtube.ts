export const prerender = false;

import type { APIRoute } from 'astro';

const CACHE: Record<string, { data: any; time: number }> = {};
const CACHE_TTL = 60 * 60 * 1000;

// Official/trusted anime channels — boost these
const OFFICIAL_CHANNELS = [
  'muse asia', 'ani-one asia', 'aniplex', 'crunchyroll',
  'bandai namco', 'medialink', 'anime digital network',
  'kadokawaanime', 'aniplus asia', 'toei animation'
];

// Bad keywords — filter these out
const BAD_KEYWORDS = [
  'reaction', 'review', 'analysis', 'explained', 'recap',
  'top 10', 'ranked', 'amv', 'edit', 'compilation',
  'moments', 'best of', 'funny', 'meme', 'tik tok'
];

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

function scoreVideo(video: any, isEpisode: boolean): number {
  const title = (video.title || '').toLowerCase();
  const channel = (video.channelTitle || '').toLowerCase();
  let score = 0;
  
  // Boost official channels
  for (const official of OFFICIAL_CHANNELS) {
    if (channel.includes(official)) { score += 20; break; }
  }
  
  // Penalize bad content
  for (const bad of BAD_KEYWORDS) {
    if (title.includes(bad)) score -= 15;
  }
  
  if (isEpisode) {
    // Boost episode indicators
    if (title.includes('full episode') || title.includes('full ep')) score += 10;
    if (/\bep\s*\d+\b|episode\s*\d+/i.test(title)) score += 5;
    if (title.includes('english sub') || title.includes('subbed')) score += 3;
    if (title.includes('english dub') || title.includes('dubbed')) score += 3;
    
    // Penalize non-episodes
    if (title.includes('trailer')) score -= 10;
    if (title.includes('preview')) score -= 8;
    if (title.includes('opening') || title.includes('op')) score -= 5;
    if (title.includes('ending') || title.includes('ed')) score -= 5;
  }
  
  return score;
}

export const GET: APIRoute = async ({ url, locals }) => {
  const rawQuery = (url.searchParams.get('q') || '').trim();
  const type = url.searchParams.get('type') || 'auto';

  if (!rawQuery) return jsonRes({ success: false, error: 'Query required' }, 400);

  const env = (locals as any)?.runtime?.env || {};
  const API_KEY = env.YOUTUBE_API_KEY || (globalThis as any).YOUTUBE_API_KEY || '';

  if (!API_KEY) {
    return jsonRes({ 
      success: false, 
      error: 'YouTube API key not configured',
      fallback: `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(rawQuery)}`
    }, 500);
  }

  const lowerQuery = rawQuery.toLowerCase();
  const isEpisode = /episode|ep\s*\d+/i.test(lowerQuery);
  const isTrailer = /trailer/i.test(lowerQuery);
  
  let searchQuery = rawQuery;
  let videoDuration = 'any';

  if (isEpisode) {
    if (!lowerQuery.includes('english') && !lowerQuery.includes('sub') && !lowerQuery.includes('dub')) {
      searchQuery = rawQuery + ' english sub full episode';
    } else {
      searchQuery = rawQuery + ' full episode';
    }
    videoDuration = 'long'; // > 20 min = real episodes
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
      maxResults: '15',
      videoEmbeddable: 'true',
      videoSyndicated: 'true',
      safeSearch: 'moderate',
      order: 'relevance',
      key: API_KEY
    });
    if (videoDuration !== 'any') params.set('videoDuration', videoDuration);

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

    // Score and sort
    items = items.map((v: any) => ({ ...v, _score: scoreVideo(v, isEpisode) }));
    items.sort((a: any, b: any) => b._score - a._score);
    
    // Filter out heavily negative scores (bad videos)
    if (isEpisode) {
      items = items.filter((v: any) => v._score > -20);
    }

    if (items.length === 0) return jsonRes({ success: false, error: 'No videos found' }, 404);

    // Return top 5 for picker
    const topVideos = items.slice(0, 5);
    const result = {
      videos: topVideos,
      primary: topVideos[0],
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
