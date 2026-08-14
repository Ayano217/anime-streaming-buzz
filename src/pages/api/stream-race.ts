// ═══════════════════════════════════════════════════════════════
// AniTube Buzz — Multi-Source Stream Race API v2
// Path: src/pages/api/stream-race.ts
//
// v2 UPGRADE:
//   - Added GogoAnime.by, AniWaves, Yomi, KickAssAnime
//   - Kept original: GogoAnime.or.at, Anix, AnimoTV, AnimeSuge
//   - Total 8 servers — race all, fastest wins
//   - No source branding leaked to user
//   - Phone-optimized: max 4 concurrent checks
//   - Nyaa torrent fallback for downloads
//
// UNCHANGED:
//   - Same API interface (?slug=...&ep=...)
//   - Same crop system for iframe hiding
//   - Same cache (30 min)
//   - Same User-Agent rotation
// ═══════════════════════════════════════════════════════════════

export const prerender = false;

import type { APIRoute } from 'astro';

// ═══ CACHE (30 min TTL) ═══
const CACHE: Record<string, { data: any; time: number }> = {};
const CACHE_TTL = 30 * 60 * 1000;

// ═══ USER AGENTS ═══
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ═══ ALL 8 SOURCE CONFIGURATIONS ═══
// name is generic ("Server X") — user never sees source branding
const SOURCES = {
  // ─── NEW SOURCES (v2) ───
  gogoanime_by: {
    name: 'Server 1',
    priority: 1,
    buildUrl: (slug: string, ep: number) =>
      `https://gogoanime.by/${slug}-episode-${ep}`,
    checkUrl: (slug: string, ep: number) =>
      `https://gogoanime.by/${slug}-episode-${ep}`,
    crop: {
      viewportW: 1200, videoW: 900, videoH: 506,
      videoLeft: 150, videoTop: 250, pageHeight: 1800,
    },
  },

  aniwaves: {
    name: 'Server 2',
    priority: 2,
    // AniWaves uses MAL ID — we pass slug, it works as search slug too
    buildUrl: (slug: string, ep: number) =>
      `https://aniwaves.ru/watch/${slug}/ep-${ep}`,
    checkUrl: (slug: string, ep: number) =>
      `https://aniwaves.ru/watch/${slug}/ep-${ep}`,
    crop: {
      viewportW: 1200, videoW: 950, videoH: 534,
      videoLeft: 125, videoTop: 200, pageHeight: 1900,
    },
  },

  yomi: {
    name: 'Server 3',
    priority: 3,
    buildUrl: (slug: string, ep: number) =>
      `https://yomi.to/watch/${slug}/${ep}`,
    checkUrl: (slug: string, ep: number) =>
      `https://yomi.to/watch/${slug}/${ep}`,
    crop: {
      viewportW: 1200, videoW: 940, videoH: 529,
      videoLeft: 130, videoTop: 220, pageHeight: 1850,
    },
  },

  kickassanime: {
    name: 'Server 4',
    priority: 4,
    buildUrl: (slug: string, ep: number) =>
      `https://kickassanime.com.es/${slug}-episode-${ep}-english-subbed/`,
    checkUrl: (slug: string, ep: number) =>
      `https://kickassanime.com.es/${slug}-episode-${ep}-english-subbed/`,
    crop: {
      viewportW: 1200, videoW: 930, videoH: 523,
      videoLeft: 135, videoTop: 230, pageHeight: 1800,
    },
  },

  // ─── ORIGINAL SOURCES (v1 — unchanged) ───
  gogoanime_alt: {
    name: 'Server 5',
    priority: 5,
    buildUrl: (slug: string, ep: number) =>
      `https://gogoanime.or.at/${slug}-episode-${ep}/`,
    checkUrl: (slug: string, ep: number) =>
      `https://gogoanime.or.at/${slug}-episode-${ep}/`,
    crop: {
      viewportW: 1200, videoW: 900, videoH: 506,
      videoLeft: 150, videoTop: 250, pageHeight: 1800,
    },
  },

  anix: {
    name: 'Server 6',
    priority: 6,
    buildUrl: (slug: string, ep: number) =>
      `https://anix.to/watch/${slug}/ep-${ep}`,
    checkUrl: (slug: string, ep: number) =>
      `https://anix.to/watch/${slug}/ep-${ep}`,
    crop: {
      viewportW: 1200, videoW: 950, videoH: 534,
      videoLeft: 125, videoTop: 200, pageHeight: 1900,
    },
  },

  animotv: {
    name: 'Server 7',
    priority: 7,
    buildUrl: (slug: string, ep: number) =>
      `https://animotvslash.org/${slug}-episode-${ep}/`,
    checkUrl: (slug: string, ep: number) =>
      `https://animotvslash.org/${slug}-episode-${ep}/`,
    crop: {
      viewportW: 1121, videoW: 950, videoH: 513,
      videoLeft: 86, videoTop: 320, pageHeight: 2000,
    },
  },

  animesuge: {
    name: 'Server 8',
    priority: 8,
    buildUrl: (slug: string, ep: number) =>
      `https://animesuge.cz/watch/${slug}/ep-${ep}`,
    checkUrl: (slug: string, ep: number) =>
      `https://animesuge.cz/watch/${slug}/ep-${ep}`,
    crop: {
      viewportW: 1200, videoW: 940, videoH: 529,
      videoLeft: 130, videoTop: 220, pageHeight: 1850,
    },
  },
};

// ═══ HELPERS ═══
function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=1800',
      'Access-Control-Allow-Origin': '*',
    },
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
  if (keys.length > 100) {
    const sorted = Object.entries(CACHE).sort((a, b) => a[1].time - b[1].time);
    sorted.slice(0, 30).forEach(([k]) => delete CACHE[k]);
  }
}

// ═══ SOURCE CHECKER (with timeout) ═══
async function checkSource(url: string, timeoutMs = 3500): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
    });

    clearTimeout(timer);

    if (!res.ok) return false;

    const text = await res.text();
    const lower = text.toLowerCase();

    // 404 detection
    const notFoundSignals = [
      'page not found', '404 - not found', 'oops! page not found',
      'not-found', 'nothing found', 'no results found', 'error 404',
    ];
    for (const signal of notFoundSignals) {
      if (lower.includes(signal)) return false;
    }

    // Must contain video-related content
    const hasVideo = lower.includes('video') ||
      lower.includes('player') ||
      lower.includes('iframe') ||
      lower.includes('episode') ||
      lower.includes('embed');

    return hasVideo && text.length > 3000;
  } catch (e) {
    return false;
  }
}

// ═══ NYAA TORRENT SEARCH ═══
async function searchNyaa(query: string, ep: number): Promise<any | null> {
  try {
    const epStr = String(ep).padStart(2, '0');
    const q = encodeURIComponent(`${query} ${epStr}`);
    const rssUrl = `https://nyaa.si/?page=rss&q=${q}&c=1_0&f=0`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(rssUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': randomUA() },
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const text = await res.text();

    const items: any[] = [];
    const itemRx = /<item>([\s\S]*?)<\/item>/g;
    let m: RegExpExecArray | null;
    while ((m = itemRx.exec(text)) !== null && items.length < 5) {
      const block = m[1];
      const titleM = /<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(block)
        || /<title>(.*?)<\/title>/.exec(block);
      const linkM = /<link>(.*?)<\/link>/.exec(block)
        || /<guid[^>]*>(.*?)<\/guid>/.exec(block);
      const sizeM = /nyaa:size>(.*?)<\//.exec(block);
      const seedM = /nyaa:seeders>(.*?)<\//.exec(block);

      if (titleM && linkM) {
        items.push({
          title: titleM[1].trim(),
          link: linkM[1].trim(),
          size: sizeM?.[1]?.trim() ?? 'N/A',
          seeds: parseInt(seedM?.[1] ?? '0', 10),
        });
      }
    }

    items.sort((a, b) => b.seeds - a.seeds);
    return items[0] || null;
  } catch {
    return null;
  }
}

// ═══ RACE ALL SOURCES (batched for phone performance) ═══
// Instead of checking all 8 at once (kills phone battery),
// we check in batches of 4, stop when we find one that works
async function raceSources(slug: string, episode: number, malId?: string) {
  const sourceKeys = Object.keys(SOURCES) as Array<keyof typeof SOURCES>;

  // Sort by priority
  const sorted = sourceKeys
    .map(key => ({ key, ...SOURCES[key] }))
    .sort((a, b) => a.priority - b.priority);

  const allResults: any[] = [];
  const available: any[] = [];

  // Batch check — 4 at a time (phone-friendly)
  const batchSize = 4;

  for (let i = 0; i < sorted.length; i += batchSize) {
    const batch = sorted.slice(i, i + batchSize);

    const checks = batch.map(async (src) => {
      // For AniWaves/Yomi, use malId if available, otherwise slug
      const idForUrl = (src.key === 'aniwaves' || src.key === 'yomi') && malId
        ? malId : slug;

      const url = src.checkUrl(idForUrl, episode);
      const startTime = Date.now();
      const isAvailable = await checkSource(url, 3500);
      const responseTime = Date.now() - startTime;

      const embedUrl = src.buildUrl(idForUrl, episode);

      return {
        key: src.key,
        name: src.name,        // Generic "Server X"
        priority: src.priority,
        available: isAvailable,
        responseTime,
        embedUrl,
        crop: src.crop,
      };
    });

    const batchResults = await Promise.all(checks);
    allResults.push(...batchResults);

    // Add available sources
    const newAvailable = batchResults.filter(r => r.available);
    available.push(...newAvailable);

    // If we found at least 2 working sources in this batch, stop checking
    // (no need to overload more servers)
    if (available.length >= 2) break;
  }

  // Sort available by: priority first, then response time
  available.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.responseTime - b.responseTime;
  });

  return { available, all: allResults };
}

// ═══ MAIN HANDLER ═══
export const GET: APIRoute = async ({ url }) => {
  const params = url.searchParams;
  const slug = (params.get('slug') || '').trim().toLowerCase();
  const episode = parseInt(params.get('ep') || '1') || 1;
  const malId = params.get('mal_id') || '';
  const noCache = params.get('nocache') === '1';
  const debug = params.get('debug') === '1';
  const includeTorrent = params.get('torrent') !== '0';

  if (!slug) {
    return jsonRes({ success: false, error: 'Missing slug parameter' }, 400);
  }

  const cacheKey = `race_v2:${slug}:${episode}:${malId}`;

  // ═══ CACHE CHECK ═══
  if (!noCache) {
    const hit = cached(cacheKey);
    if (hit) {
      return jsonRes({
        success: true,
        source: 'cache',
        ...hit,
        ...(debug ? { debug: 'from cache' } : {}),
      });
    }
  }

  try {
    // ═══ RACE (batched for performance) ═══
    const race = await raceSources(slug, episode, malId || undefined);

    // ═══ NYAA TORRENT (parallel, non-blocking) ═══
    let torrent: any = null;
    if (includeTorrent && race.available.length === 0) {
      // Only search torrent if no stream source found
      torrent = await searchNyaa(slug.replace(/-/g, ' '), episode);
    }

    // No source available
    if (race.available.length === 0) {
      const result: any = {
        found: false,
        message: 'No sources available for this episode',
        sources: [],
        primary: null,
      };
      if (torrent) {
        result.torrent = {
          title: torrent.title,
          link: torrent.link,
          size: torrent.size,
          seeds: torrent.seeds,
        };
      }
      if (debug) result.allChecks = race.all;
      return jsonRes({ success: true, ...result });
    }

    // ═══ BUILD RESPONSE ═══
    const primary = race.available[0];

    const result: any = {
      found: true,
      slug,
      episode,
      primary: {
        name: primary.name,    // "Server 1" — no real source name
        embedUrl: primary.embedUrl,
        crop: primary.crop,
        responseTime: primary.responseTime,
      },
      sources: race.available.map((s: any) => ({
        name: s.name,
        embedUrl: s.embedUrl,
        crop: s.crop,
        responseTime: s.responseTime,
      })),
      totalAvailable: race.available.length,
    };

    // Add torrent if found
    if (torrent) {
      result.torrent = {
        title: torrent.title,
        link: torrent.link,
        size: torrent.size,
        seeds: torrent.seeds,
      };
    }

    if (debug) result.allChecks = race.all;

    setCache(cacheKey, result);
    return jsonRes({ success: true, ...result });

  } catch (err: any) {
    console.error('[stream-race-v2]', err);
    return jsonRes({
      success: false,
      error: err.message || 'Race failed',
      sources: [],
    }, 500);
  }
};
