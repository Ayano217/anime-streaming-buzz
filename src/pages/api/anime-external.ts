// ═══════════════════════════════════════════════════════════════
// AniTube Buzz — External Anime API (AnimoTVSlash Wrapper)
// Path: src/pages/api/anime-external.ts
//
// Wraps AnimoTVSlash WordPress API for anime search + episode URLs
// ═══════════════════════════════════════════════════════════════

export const prerender = false;

import type { APIRoute } from 'astro';

const CACHE: Record<string, { data: any; time: number }> = {};
const CACHE_TTL = 30 * 60 * 1000; // 30 min

const BASE = 'https://animotvslash.org';

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function cached(key: string): any | null {
  const c = CACHE[key];
  if (c && Date.now() - c.time < CACHE_TTL) return c.data;
  return null;
}

function setCache(key: string, data: any) {
  CACHE[key] = { data, time: Date.now() };
  const keys = Object.keys(CACHE);
  if (keys.length > 60) {
    const sorted = Object.entries(CACHE).sort((a, b) => a[1].time - b[1].time);
    sorted.slice(0, 20).forEach(([k]) => delete CACHE[k]);
  }
}

// Normalize name for better search
function cleanQuery(q: string): string {
  return q
    .replace(/[:\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fetch featured image URL from media endpoint
async function fetchMediaUrl(mediaId: number): Promise<string> {
  try {
    const url = `${BASE}/wp-json/wp/v2/media/${mediaId}`;
    const res = await fetch(url);
    if (!res.ok) return '';
    const data: any = await res.json();
    return data.source_url || data.guid?.rendered || '';
  } catch (e) {
    return '';
  }
}

// Score match: how well does result match query
function matchScore(title: string, query: string): number {
  const t = title.toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return 0;
  let matched = 0;
  for (const w of words) {
    if (t.includes(w)) matched++;
  }
  return matched / words.length;
}

// Verify episode URL exists (HEAD request)
async function episodeExists(slug: string, ep: number): Promise<boolean> {
  try {
    const url = `${BASE}/${slug}-episode-${ep}/`;
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok || res.status === 200;
  } catch (e) {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════
export const GET: APIRoute = async ({ url }) => {
  const params = url.searchParams;
  const action = params.get('action') || 'search';
  const query = params.get('q') || '';
  const slug = params.get('slug') || '';
  const noCache = params.get('nocache') === '1';

  // ═══ ACTION: search ═══
  if (action === 'search' && query) {
    const cacheKey = `ext_search:${query.toLowerCase()}`;
    if (!noCache) {
      const hit = cached(cacheKey);
      if (hit) return jsonRes({ success: true, source: 'cache', ...hit });
    }

    try {
      const cleanQ = cleanQuery(query);
      const searchUrl = `${BASE}/wp-json/wp/v2/anime?search=${encodeURIComponent(cleanQ)}&per_page=10`;
      const res = await fetch(searchUrl);
      if (!res.ok) {
        return jsonRes({ success: false, error: 'Search failed', results: [] }, 200);
      }
      const raw: any = await res.json();
      if (!Array.isArray(raw) || raw.length === 0) {
        return jsonRes({ success: true, results: [], message: 'No matches' });
      }

      // Rank results by match score
      const scored = raw.map((item: any) => ({
        id: item.id,
        slug: item.slug,
        title: (item.title?.rendered || '').replace(/&#\d+;/g, ''),
        link: item.link,
        matchScore: matchScore(item.title?.rendered || '', cleanQ),
      }));
      scored.sort((a: any, b: any) => b.matchScore - a.matchScore);

      const result = {
        query: cleanQ,
        results: scored,
        bestMatch: scored[0]?.matchScore >= 0.5 ? scored[0] : null,
      };

      setCache(cacheKey, result);
      return jsonRes({ success: true, ...result });
    } catch (err: any) {
      return jsonRes({ success: false, error: err.message, results: [] }, 500);
    }
  }

  // ═══ ACTION: detail (get anime info + episodes list) ═══
  if (action === 'detail' && slug) {
    const cacheKey = `ext_detail:${slug}`;
    if (!noCache) {
      const hit = cached(cacheKey);
      if (hit) return jsonRes({ success: true, source: 'cache', ...hit });
    }

    try {
      // Fetch anime by slug
      const detailUrl = `${BASE}/wp-json/wp/v2/anime?slug=${encodeURIComponent(slug)}`;
      const res = await fetch(detailUrl);
      if (!res.ok) {
        return jsonRes({ success: false, error: 'Detail fetch failed' }, 200);
      }
      const raw: any = await res.json();
      if (!Array.isArray(raw) || raw.length === 0) {
        return jsonRes({ success: false, error: 'Anime not found' }, 200);
      }
      const anime = raw[0];

      // Get poster from featured media
      let poster = '';
      if (anime.featured_media) {
        poster = await fetchMediaUrl(anime.featured_media);
      }

      // Build episode URLs (we'll trust that episodes exist up to 24 for now)
      // Client can verify or just try iframe load
      const maxEpisodes = 26; // reasonable upper bound
      const episodes = [];
      for (let i = 1; i <= maxEpisodes; i++) {
        episodes.push({
          number: i,
          url: `${BASE}/${anime.slug}-episode-${i}/`,
          embedId: `anime_${anime.slug}_ep${i}`,
        });
      }

      const result = {
        id: anime.id,
        slug: anime.slug,
        title: (anime.title?.rendered || '').replace(/&#\d+;/g, ''),
        link: anime.link,
        poster,
        description: (anime.content?.rendered || '').replace(/<[^>]+>/g, '').trim(),
        classList: anime.class_list || [],
        episodes,
        episodeUrlPattern: `${BASE}/{slug}-episode-{n}/`,
        baseSlug: anime.slug,
      };

      setCache(cacheKey, result);
      return jsonRes({ success: true, ...result });
    } catch (err: any) {
      return jsonRes({ success: false, error: err.message }, 500);
    }
  }

  // ═══ ACTION: find (combined: search + get best match detail) ═══
  if (action === 'find' && query) {
    const cacheKey = `ext_find:${query.toLowerCase()}`;
    if (!noCache) {
      const hit = cached(cacheKey);
      if (hit) return jsonRes({ success: true, source: 'cache', ...hit });
    }

    try {
      const cleanQ = cleanQuery(query);
      const searchUrl = `${BASE}/wp-json/wp/v2/anime?search=${encodeURIComponent(cleanQ)}&per_page=10`;
      const res = await fetch(searchUrl);
      if (!res.ok) {
        return jsonRes({ success: false, error: 'Search failed' }, 200);
      }
      const raw: any = await res.json();
      if (!Array.isArray(raw) || raw.length === 0) {
        return jsonRes({ success: false, message: 'No matches found' });
      }

      // Find best match
      const scored = raw.map((item: any) => ({
        id: item.id,
        slug: item.slug,
        title: (item.title?.rendered || '').replace(/&#\d+;/g, ''),
        link: item.link,
        featured_media: item.featured_media,
        matchScore: matchScore(item.title?.rendered || '', cleanQ),
      }));
      scored.sort((a: any, b: any) => b.matchScore - a.matchScore);
      const best = scored[0];

      if (!best || best.matchScore < 0.3) {
        return jsonRes({ 
          success: false, 
          message: 'No good match', 
          allResults: scored 
        });
      }

      // Get poster
      let poster = '';
      if (best.featured_media) {
        poster = await fetchMediaUrl(best.featured_media);
      }

      // Build episodes
      const maxEpisodes = 26;
      const episodes = [];
      for (let i = 1; i <= maxEpisodes; i++) {
        episodes.push({
          number: i,
          url: `${BASE}/${best.slug}-episode-${i}/`,
          embedId: `anime_${best.slug}_ep${i}`,
        });
      }

      const result = {
        found: true,
        anime: {
          id: best.id,
          slug: best.slug,
          title: best.title,
          link: best.link,
          poster,
          matchScore: best.matchScore,
        },
        episodes,
        firstEpisodeUrl: `${BASE}/${best.slug}-episode-1/`,
        firstEpisodeId: `anime_${best.slug}_ep1`,
      };

      setCache(cacheKey, result);
      return jsonRes({ success: true, ...result });
    } catch (err: any) {
      return jsonRes({ success: false, error: err.message }, 500);
    }
  }

  return jsonRes({ 
    success: false, 
    error: 'Invalid action. Use action=search, action=detail&slug=xxx, or action=find&q=xxx' 
  }, 400);
};
