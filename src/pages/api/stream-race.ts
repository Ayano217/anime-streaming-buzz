// ═══════════════════════════════════════════════════════════════
// AniTube Buzz — Multi-Source Stream Race API v1
// Path: src/pages/api/stream-race.ts
//
// PURPOSE: Try multiple anime sources in parallel, return the fastest
//          working one. Silent aggregator — no branding leakage.
//
// SOURCES (priority order):
//   1. GogoAnime (simple URL, big library)
//   2. Anix (backup #1, similar to Gogo)
//   3. AnimoTV (current source, fallback)
//   4. AnimeSuge (backup #2, needs search)
//
// PROTECTION:
//   - User-Agent rotation (avoids bot detection)
//   - Timeout per source (3s max, no hanging)
//   - Cache results 30 min (reduces upstream load)
//   - Iframe-only (no content scraping = no DMCA)
// ═══════════════════════════════════════════════════════════════

export const prerender = false;

import type { APIRoute } from 'astro';

// ═══ CACHE (30 min TTL) ═══
const CACHE: Record<string, { data: any; time: number }> = {};
const CACHE_TTL = 30 * 60 * 1000;

// ═══ USER AGENTS (rotate to avoid detection) ═══
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ═══ SOURCE CONFIGURATIONS ═══
// Each source has its own crop settings (iframe positioning)
// so the actual anime page never shows — only the video player

const SOURCES = {
  gogoanime: {
    name: 'gogo',                                    // Silent name (no branding)
    priority: 1,
    buildUrl: (slug: string, ep: number) => 
      `https://gogoanime.or.at/${slug}-episode-${ep}/`,
    checkUrl: (slug: string, ep: number) => 
      `https://gogoanime.or.at/${slug}-episode-${ep}/`,
    // Crop config — hides everything except video player
    crop: {
      viewportW: 1200,
      videoW: 900,
      videoH: 506,
      videoLeft: 150,
      videoTop: 250,
      pageHeight: 1800,
    },
  },
  
  anix: {
    name: 'srv-2',
    priority: 2,
    buildUrl: (slug: string, ep: number) => 
      `https://anix.to/watch/${slug}/ep-${ep}`,
    checkUrl: (slug: string, ep: number) => 
      `https://anix.to/watch/${slug}/ep-${ep}`,
    crop: {
      viewportW: 1200,
      videoW: 950,
      videoH: 534,
      videoLeft: 125,
      videoTop: 200,
      pageHeight: 1900,
    },
  },
  
  animotv: {
    name: 'srv-3',
    priority: 3,
    buildUrl: (slug: string, ep: number) => 
      `https://animotvslash.org/${slug}-episode-${ep}/`,
    checkUrl: (slug: string, ep: number) => 
      `https://animotvslash.org/${slug}-episode-${ep}/`,
    crop: {
      viewportW: 1121,
      videoW: 950,
      videoH: 513,
      videoLeft: 86,
      videoTop: 320,
      pageHeight: 2000,
    },
  },
  
  animesuge: {
    name: 'srv-4',
    priority: 4,
    buildUrl: (slug: string, ep: number) => 
      `https://animesuge.cz/watch/${slug}/ep-${ep}`,
    checkUrl: (slug: string, ep: number) => 
      `https://animesuge.cz/watch/${slug}/ep-${ep}`,
    crop: {
      viewportW: 1200,
      videoW: 940,
      videoH: 529,
      videoLeft: 130,
      videoTop: 220,
      pageHeight: 1850,
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
  // Cleanup old entries (max 100)
  const keys = Object.keys(CACHE);
  if (keys.length > 100) {
    const sorted = Object.entries(CACHE).sort((a, b) => a[1].time - b[1].time);
    sorted.slice(0, 30).forEach(([k]) => delete CACHE[k]);
  }
}

// ═══ SOURCE CHECKER (with timeout) ═══
// Returns true if page exists (200 OK), false if 404/error
async function checkSource(url: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    
    const res = await fetch(url, {
      method: 'GET',                              // Some sites block HEAD
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
    
    // Extra check: page must have some minimum content
    // (some sites return 200 for "not found" pages)
    const text = await res.text();
    const lower = text.toLowerCase();
    
    // Common 404 indicators
    const notFoundSignals = [
      'page not found',
      '404 - not found',
      'oops! page not found',
      'not-found',
      'nothing found',
      'no results found',
      'error 404',
    ];
    
    for (const signal of notFoundSignals) {
      if (lower.includes(signal)) return false;
    }
    
    // Must contain video-related content
    const hasVideo = lower.includes('video') || 
                     lower.includes('player') || 
                     lower.includes('iframe') ||
                     lower.includes('episode');
    
    return hasVideo && text.length > 5000;    // Real pages are big
  } catch (e) {
    return false;                                // Timeout or network error
  }
}

// ═══ RACE ALL SOURCES ═══
// Try all sources in parallel, return array of available ones
async function raceSources(slug: string, episode: number) {
  const sourceKeys = Object.keys(SOURCES) as Array<keyof typeof SOURCES>;
  
  // Check all sources in parallel
  const checks = sourceKeys.map(async (key) => {
    const src = SOURCES[key];
    const url = src.checkUrl(slug, episode);
    const startTime = Date.now();
    const isAvailable = await checkSource(url, 3000);
    const responseTime = Date.now() - startTime;
    
    return {
      key,
      name: src.name,
      priority: src.priority,
      available: isAvailable,
      responseTime,
      embedUrl: src.buildUrl(slug, episode),
      crop: src.crop,
    };
  });
  
  const results = await Promise.all(checks);
  
  // Filter available sources
  const available = results.filter(r => r.available);
  
  // Sort by: priority first, then response time
  available.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.responseTime - b.responseTime;
  });
  
  return {
    available,
    all: results,           // For debugging
  };
}

// ═══ MAIN HANDLER ═══
export const GET: APIRoute = async ({ url }) => {
  const params = url.searchParams;
  const slug = (params.get('slug') || '').trim().toLowerCase();
  const episode = parseInt(params.get('ep') || '1') || 1;
  const noCache = params.get('nocache') === '1';
  const debug = params.get('debug') === '1';
  
  if (!slug) {
    return jsonRes({ success: false, error: 'Missing slug parameter' }, 400);
  }
  
  const cacheKey = `race:${slug}:${episode}`;
  
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
    // ═══ RACE ═══
    const race = await raceSources(slug, episode);
    
    // No source available
    if (race.available.length === 0) {
      const result = {
        found: false,
        message: 'No sources available for this episode',
        sources: [],
        primary: null,
        allChecks: debug ? race.all : undefined,
      };
      // Don't cache negative results (short TTL retry)
      return jsonRes({ success: true, ...result });
    }
    
    // ═══ BUILD RESPONSE ═══
    const primary = race.available[0];
    
    const result = {
      found: true,
      slug,
      episode,
      primary: {
        name: primary.name,
        embedUrl: primary.embedUrl,
        crop: primary.crop,
        responseTime: primary.responseTime,
      },
      sources: race.available.map(s => ({
        name: s.name,
        embedUrl: s.embedUrl,
        crop: s.crop,
        responseTime: s.responseTime,
      })),
      totalAvailable: race.available.length,
      allChecks: debug ? race.all : undefined,
    };
    
    setCache(cacheKey, result);
    return jsonRes({ success: true, ...result });
    
  } catch (err: any) {
    console.error('[stream-race]', err);
    return jsonRes({ 
      success: false, 
      error: err.message || 'Race failed',
      sources: [],
    }, 500);
  }
};
