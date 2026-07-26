export const prerender = false;

import type { APIRoute } from 'astro';

const CACHE: Record<string, { data: any; time: number }> = {};
const CACHE_TTL = 60 * 60 * 1000;

const OFFICIAL_CHANNELS = [
  'muse asia', 'ani-one asia', 'aniplex', 'crunchyroll',
  'bandai namco', 'medialink', 'anime digital network',
  'kadokawaanime', 'aniplus asia', 'toei animation'
];

const BAD_KEYWORDS = [
  'reaction', 'review', 'analysis', 'explained', 'recap',
  'top 10', 'ranked', 'amv', 'edit', 'compilation',
  'moments', 'best of', 'funny', 'meme', 'tik tok', 'shorts'
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

// Extract episode number from title
function extractEpNumber(title: string): number | null {
  const patterns = [
    /episode[\s.-]*(\d+)/i,
    /\bep[\s.-]*(\d+)\b/i,
    /\bE(\d+)\b/,
    /\bS\d+E(\d+)\b/i,
    /#(\d+)\b/
  ];
  for (const p of patterns) {
    const m = title.match(p);
    if (m) return parseInt(m[1]);
  }
  return null;
}

function scoreVideo(video: any, isEpisode: boolean, targetEp: number | null): number {
  const title = (video.title || '').toLowerCase();
  const channel = (video.channelTitle || '').toLowerCase();
  let score = 0;
  
  // Boost official channels
  for (const official of OFFICIAL_CHANNELS) {
    if (channel.includes(official)) { score += 25; break; }
  }
  
  // Penalize bad content
  for (const bad of BAD_KEYWORDS) {
    if (title.includes(bad)) score -= 20;
  }
  
  if (isEpisode && targetEp !== null) {
    // Extract episode number from video title
    const videoEp = extractEpNumber(video.title || '');
    
    if (videoEp !== null) {
      if (videoEp === targetEp) {
        score += 50; // HUGE boost for exact match
      } else {
        score -= 30; // Penalty for wrong episode number
      }
    } else {
      // No episode number in title — could be trailer/etc
      score -= 5;
    }
    
    // Boost episode indicators
    if (title.includes('full episode') || title.includes('full ep')) score += 15;
    if (title.includes('english sub') || title.includes('subbed')) score += 5;
    if (title.includes('english dub') || title.includes('dubbed')) score += 5;
    
    // Penalize non-episodes
    if (title.includes('trailer')) score -= 15;
    if (title.includes('preview')) score -= 10;
    if (title.match(/\bopening\b|\bop\b/)) score -= 8;
    if (title.match(/\bending\b|\bed\b/)) score -= 8;
    if (title.includes('pv')) score -= 10;
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
  const targetEp = isEpisode ? extractEpNumber(rawQuery) : null;
  
  let searchQuery = rawQuery;
  let videoDuration = 'any';

  if (isEpisode && targetEp !== null) {
    // Extract anime name (everything before "episode X")
    const animeName = rawQuery.replace(/\bepisode\s*\d+.*$/i, '').replace(/\bep\s*\d+.*$/i, '').trim();
    // Build strict query with quotes for exact match
    searchQuery = `"${animeName}" "episode ${targetEp}" english sub`;
    videoDuration = 'long';
  } else if (isTrailer) {
    searchQuery = rawQuery.includes('official') ? rawQuery : rawQuery + ' official';
    videoDuration = 'short';
  } else if (type === 'trailer') {
    searchQuery = rawQuery + ' anime official trailer';
    videoDuration = 'short';
  }

  const cacheKey = `${type}:${searchQuery}:${targetEp}`;
  const hit = CACHE[cacheKey];
  if (hit && Date.now() - hit.time < CACHE_TTL) {
    return jsonRes({ success: true, source: 'cache', ...hit.data });
  }

  try {
    const params = new URLSearchParams({
      part: 'snippet',
      q: searchQuery,
      type: 'video',
      maxResults: '20',
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

    // Score with target episode
    items = items.map((v: any) => ({ 
      ...v, 
      _score: scoreVideo(v, isEpisode, targetEp),
      _detectedEp: isEpisode ? extractEpNumber(v.title) : null
    }));
    items.sort((a: any, b: any) => b._score - a._score);
    
    // For episodes: filter out videos with clearly wrong episode numbers
    if (isEpisode && targetEp !== null) {
      const strictMatches = items.filter((v: any) => 
        v._detectedEp === targetEp || (v._detectedEp === null && v._score > 0)
      );
      if (strictMatches.length > 0) {
        items = strictMatches;
      }
    }
    
    // Filter heavily negative scores
    if (isEpisode) {
      items = items.filter((v: any) => v._score > -30);
    }

    if (items.length === 0) return jsonRes({ success: false, error: 'No videos found' }, 404);

    const topVideos = items.slice(0, 5);
    const result = {
      videos: topVideos,
      primary: topVideos[0],
      query: searchQuery,
      targetEp: targetEp
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
