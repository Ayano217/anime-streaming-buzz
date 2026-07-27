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

function extractEpNumber(title: string): number | null {
  const patterns = [
    /episode[\s.-]*(\d+)/i,
    /\bep[\s.-]*(\d+)\b/i,
    /\bE(\d+)\b/,
    /\bS\d+E(\d+)\b/i,
    /#(\d+)\b/,
    /\bpart[\s.-]*(\d+)/i
  ];
  for (const p of patterns) {
    const m = title.match(p);
    if (m) return parseInt(m[1]);
  }
  return null;
}

// ─── YOUTUBE SEARCH ───
async function searchYouTube(query: string, targetEp: number | null, apiKey: string): Promise<any[]> {
  if (!apiKey) return [];
  
  const searchQuery = targetEp 
    ? `"${query}" "episode ${targetEp}" english sub full`
    : `${query} anime`;
  
  try {
    const params = new URLSearchParams({
      part: 'snippet',
      q: searchQuery,
      type: 'video',
      maxResults: '10',
      videoEmbeddable: 'true',
      videoSyndicated: 'true',
      safeSearch: 'moderate',
      key: apiKey
    });
    if (targetEp) params.set('videoDuration', 'long');

    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
    if (!res.ok) return [];
    const json: any = await res.json();
    
    return (json.items || []).map((item: any) => {
      const title = item.snippet.title || '';
      const detectedEp = extractEpNumber(title);
      let score = 10;
      
      // Boost official channels
      const channel = (item.snippet.channelTitle || '').toLowerCase();
      if (/muse asia|ani-one|aniplex|crunchyroll|bandai namco|medialink/i.test(channel)) score += 20;
      
      // Episode match
      if (targetEp !== null) {
        if (detectedEp === targetEp) score += 30;
        else if (detectedEp !== null) score -= 20;
        
        if (/full episode|full ep/i.test(title)) score += 10;
        if (/english sub|subbed|dubbed/i.test(title)) score += 5;
      }
      
      // Penalize junk
      if (/reaction|review|analysis|amv|edit|compilation|shorts/i.test(title)) score -= 25;
      if (/trailer/i.test(title) && targetEp) score -= 10;
      
      return {
        source: 'youtube',
        sourceLabel: 'YouTube',
        videoId: item.id.videoId,
        embedUrl: `https://www.youtube.com/embed/${item.id.videoId}?autoplay=1&rel=0&modestbranding=1`,
        title,
        channel: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || '',
        publishedAt: item.snippet.publishedAt,
        detectedEp,
        score,
        isOfficial: /muse asia|ani-one|aniplex|crunchyroll|bandai namco|medialink|toei/i.test(channel)
      };
    }).filter((v: any) => v.score > 0);
  } catch (e) {
    console.warn('YouTube search failed:', e);
    return [];
  }
}

// ─── DAILYMOTION SEARCH ───
async function searchDailymotion(query: string, targetEp: number | null): Promise<any[]> {
  const searchQuery = targetEp 
    ? `${query} episode ${targetEp} english sub`
    : query;
  
  try {
    const url = `https://api.dailymotion.com/videos?search=${encodeURIComponent(searchQuery)}&fields=id,title,thumbnail_720_url,duration,owner.screenname,views_total,created_time,allow_embed&limit=10`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json: any = await res.json();
    
    return (json.list || []).filter((v: any) => v.allow_embed !== false).map((v: any) => {
      const title = v.title || '';
      const detectedEp = extractEpNumber(title);
      let score = 8; // slightly lower base than YouTube
      
      if (targetEp !== null) {
        if (detectedEp === targetEp) score += 30;
        else if (detectedEp !== null) score -= 20;
        if (/full episode|full ep/i.test(title)) score += 8;
        if (/english sub|subbed|dubbed|eng dub/i.test(title)) score += 5;
      }
      
      if (/reaction|review|amv|edit/i.test(title)) score -= 15;
      if (/trailer/i.test(title) && targetEp) score -= 8;
      
      // Duration check (long-form = real ep)
      if (targetEp && v.duration >= 900) score += 10; // 15+ min
      if (targetEp && v.duration < 300) score -= 15; // < 5 min = probably trailer
      
      return {
        source: 'dailymotion',
        sourceLabel: 'Dailymotion',
        videoId: v.id,
        embedUrl: `https://www.dailymotion.com/embed/video/${v.id}?autoplay=1`,
        title,
        channel: v['owner.screenname'] || 'Unknown',
        thumbnail: v.thumbnail_720_url || '',
        duration: v.duration,
        views: v.views_total,
        detectedEp,
        score,
        isOfficial: false
      };
    }).filter((v: any) => v.score > 0);
  } catch (e) {
    console.warn('Dailymotion search failed:', e);
    return [];
  }
}

// ─── VIMEO SEARCH (No API needed for public search) ───
async function searchVimeo(query: string, targetEp: number | null): Promise<any[]> {
  // Vimeo public API requires auth token, skipping for now
  // Could add later with OAuth
  return [];
}

// ─── ODYSEE SEARCH ───
async function searchOdysee(query: string, targetEp: number | null): Promise<any[]> {
  const searchQuery = targetEp 
    ? `${query} episode ${targetEp}`
    : query;
  
  try {
    const url = `https://lighthouse.odysee.com/search?s=${encodeURIComponent(searchQuery)}&size=10&from=0&mediaType=video`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const results: any = await res.json();
    if (!Array.isArray(results)) return [];
    
    return results.map((v: any) => {
      const title = v.title || v.name || '';
      const detectedEp = extractEpNumber(title);
      let score = 6;
      
      if (targetEp !== null) {
        if (detectedEp === targetEp) score += 30;
        else if (detectedEp !== null) score -= 15;
      }
      
      if (/reaction|review|amv/i.test(title)) score -= 10;
      
      const claimId = v.claimId || v.claim_id;
      const name = v.name;
      if (!claimId || !name) return null;
      
      return {
        source: 'odysee',
        sourceLabel: 'Odysee',
        videoId: claimId,
        embedUrl: `https://odysee.com/$/embed/${name}/${claimId}?autoplay=1`,
        title,
        channel: v.channel || 'Odysee',
        thumbnail: v.thumbnail_url || '',
        detectedEp,
        score,
        isOfficial: false
      };
    }).filter((v: any) => v && v.score > 0);
  } catch (e) {
    console.warn('Odysee search failed:', e);
    return [];
  }
}

// ─── MAIN HANDLER ───
export const GET: APIRoute = async ({ url, locals }) => {
  const query = (url.searchParams.get('q') || '').trim();
  const epParam = url.searchParams.get('ep');
  const targetEp = epParam ? parseInt(epParam) : null;
  const sourcesParam = url.searchParams.get('sources') || 'all';

  if (!query) {
    return jsonRes({ success: false, error: 'Query required' }, 400);
  }

  const env = (locals as any)?.runtime?.env || {};
  const YT_KEY = env.YOUTUBE_API_KEY || (globalThis as any).YOUTUBE_API_KEY || '';

  const cacheKey = `multi:${query}:${targetEp}:${sourcesParam}`;
  const hit = CACHE[cacheKey];
  if (hit && Date.now() - hit.time < CACHE_TTL) {
    return jsonRes({ success: true, source: 'cache', ...hit.data });
  }

  const sources = sourcesParam === 'all' 
    ? ['youtube', 'dailymotion', 'odysee']
    : sourcesParam.split(',');

  try {
    // Parallel search all sources
    const promises: Promise<any[]>[] = [];
    if (sources.includes('youtube')) promises.push(searchYouTube(query, targetEp, YT_KEY));
    if (sources.includes('dailymotion')) promises.push(searchDailymotion(query, targetEp));
    if (sources.includes('odysee')) promises.push(searchOdysee(query, targetEp));

    const results = await Promise.all(promises);
    const allVideos = results.flat();

    // Sort by score descending
    allVideos.sort((a, b) => b.score - a.score);

    // Filter strict episode matches if targetEp provided
    let filtered = allVideos;
    if (targetEp !== null) {
      const strictMatches = allVideos.filter(v => 
        v.detectedEp === targetEp || (v.detectedEp === null && v.score > 15)
      );
      if (strictMatches.length > 0) filtered = strictMatches;
    }

    // Take top 10 across all sources
    const top = filtered.slice(0, 10);

    // Group by source for stats
    const bySource: Record<string, number> = {};
    top.forEach(v => { bySource[v.source] = (bySource[v.source] || 0) + 1; });

    const result = {
      videos: top,
      primary: top[0] || null,
      totalFound: allVideos.length,
      sources: bySource,
      query,
      targetEp
    };

    CACHE[cacheKey] = { data: result, time: Date.now() };
    return jsonRes({ success: true, source: 'multi', ...result });

  } catch (err: any) {
    console.error('Multi-search error:', err);
    return jsonRes({ 
      success: false, 
      error: err.message,
      fallback: `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(query)}`
    }, 500);
  }
};
