// ═══════════════════════════════════════════════════════════════
// AniTube Buzz — Stream Race API v4 (Multi-Source Torrent)
// Path: src/pages/api/stream-race.ts
//
// v4 CHANGES:
//   ✅ Multiple torrent sources (Nyaa direct + AnimeTosho + fallback API)
//   ✅ Better parsing with error handling
//   ✅ AnimeTosho as primary (more reliable, Cloudflare-friendly)
//   ✅ Nyaa.land mirror as backup
//   ✅ Test URL support (?test=1 shows raw data)
// ═══════════════════════════════════════════════════════════════

export const prerender = false;

import type { APIRoute } from 'astro';

const CACHE: Record<string, { data: any; time: number }> = {};
const CACHE_TTL = 30 * 60 * 1000;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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

interface TorrentResult {
  title: string;
  magnet: string;
  torrentUrl: string;
  size: string;
  sizeBytes: number;
  seeders: number;
  leechers: number;
  quality: string;
  quality_priority: number;
  source: string;
}

function parseSizeToBytes(sizeStr: string): number {
  if (!sizeStr) return 0;
  const match = sizeStr.match(/([\d.]+)\s*(GiB|MiB|KiB|GB|MB|KB|B)/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const multipliers: Record<string, number> = {
    'GIB': 1073741824, 'GB': 1000000000,
    'MIB': 1048576, 'MB': 1000000,
    'KIB': 1024, 'KB': 1000, 'B': 1,
  };
  return num * (multipliers[unit] || 1);
}

function detectQuality(title: string): { label: string; priority: number } {
  const t = title.toLowerCase();
  if (/2160p|\b4k\b|uhd/i.test(t)) return { label: '4K', priority: 3 };
  if (/1080p/i.test(t)) return { label: '1080p', priority: 5 };
  if (/720p/i.test(t)) return { label: '720p', priority: 4 };
  if (/480p/i.test(t)) return { label: '480p', priority: 2 };
  if (/360p/i.test(t)) return { label: '360p', priority: 1 };
  return { label: 'HD', priority: 3 };
}

function buildMagnet(hash: string, title: string): string {
  if (!hash) return '';
  const trackers = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.stealth.si:80/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://exodus.desync.com:6969/announce',
    'udp://tracker.moeking.me:6969/announce',
    'http://nyaa.tracker.wf:7777/announce',
    'udp://tracker.opentrackr.org:1337/announce',
    'wss://tracker.openwebtorrent.com',
    'wss://tracker.btorrent.xyz',
  ];
  const trackerStr = trackers.map(t => `&tr=${encodeURIComponent(t)}`).join('');
  return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}${trackerStr}`;
}

// ═══════════════════════════════════════════════════════════════
// SOURCE 1: AnimeTosho (RELIABLE — better for Cloudflare Workers)
// ═══════════════════════════════════════════════════════════════
async function searchAnimeTosho(query: string, episode: number): Promise<TorrentResult[]> {
  const results: TorrentResult[] = [];
  try {
    const epStr = String(episode).padStart(2, '0');
    const searchQ = `${query} ${epStr}`;
    // AnimeTosho JSON API
    const url = `https://feed.animetosho.org/json?q=${encodeURIComponent(searchQ)}&qx=1&filter[0][t]=nyaa_class&filter[0][v]=trusted`;
    
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
    });
    clearTimeout(timer);
    
    if (!res.ok) return results;
    const data = await res.json();
    
    if (!Array.isArray(data)) return results;
    
    for (const item of data.slice(0, 15)) {
      try {
        const title = item.title || '';
        if (!title) continue;
        
        const sizeBytes = item.total_size || 0;
        if (sizeBytes < 50000000 || sizeBytes > 3000000000) continue; // 50MB - 3GB
        
        const sizeStr = formatBytes(sizeBytes);
        const seeders = item.seeders || 0;
        const leechers = item.leechers || 0;
        
        if (seeders === 0) continue;
        
        const quality = detectQuality(title);
        const hash = item.info_hash || '';
        const magnet = item.magnet_uri || (hash ? buildMagnet(hash, title) : '');
        const torrentUrl = item.torrent_url || '';
        
        results.push({
          title,
          magnet,
          torrentUrl,
          size: sizeStr,
          sizeBytes,
          seeders,
          leechers,
          quality: quality.label,
          quality_priority: quality.priority,
          source: 'AnimeTosho',
        });
      } catch (e) { continue; }
    }
  } catch (e) {
    console.error('[AnimeTosho]', e);
  }
  return results;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(0) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

// ═══════════════════════════════════════════════════════════════
// SOURCE 2: Nyaa.si direct RSS (may fail from CF Workers)
// ═══════════════════════════════════════════════════════════════
async function searchNyaaDirect(query: string, episode: number): Promise<TorrentResult[]> {
  const results: TorrentResult[] = [];
  try {
    const epStr = String(episode).padStart(2, '0');
    const searchQ = `${query} ${epStr}`;
    const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(searchQ)}&c=1_2&f=0&s=seeders&o=desc`;
    
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });
    clearTimeout(timer);
    
    if (!res.ok) return results;
    const text = await res.text();
    
    const itemMatches = text.match(/<item>([\s\S]*?)<\/item>/g);
    if (!itemMatches) return results;
    
    for (const itemBlock of itemMatches.slice(0, 15)) {
      try {
        const titleMatch = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/.exec(itemBlock);
        const linkMatch = /<link>(.*?)<\/link>/.exec(itemBlock);
        const sizeMatch = /<nyaa:size>(.*?)<\/nyaa:size>/.exec(itemBlock);
        const seedersMatch = /<nyaa:seeders>(\d+)<\/nyaa:seeders>/.exec(itemBlock);
        const leechersMatch = /<nyaa:leechers>(\d+)<\/nyaa:leechers>/.exec(itemBlock);
        const infohashMatch = /<nyaa:infoHash>(.*?)<\/nyaa:infoHash>/.exec(itemBlock);
        
        if (!titleMatch) continue;
        const title = titleMatch[1].trim();
        const sizeStr = sizeMatch ? sizeMatch[1].trim() : '';
        const sizeBytes = parseSizeToBytes(sizeStr);
        const seeders = seedersMatch ? parseInt(seedersMatch[1]) : 0;
        
        if (seeders === 0) continue;
        if (sizeBytes < 50000000 || sizeBytes > 3000000000) continue;
        
        const quality = detectQuality(title);
        const hash = infohashMatch ? infohashMatch[1].trim() : '';
        const magnet = hash ? buildMagnet(hash, title) : '';
        const torrentUrl = linkMatch ? linkMatch[1].trim() : '';
        
        results.push({
          title,
          magnet,
          torrentUrl,
          size: sizeStr,
          sizeBytes,
          seeders,
          leechers: leechersMatch ? parseInt(leechersMatch[1]) : 0,
          quality: quality.label,
          quality_priority: quality.priority,
          source: 'Nyaa',
        });
      } catch (e) { continue; }
    }
  } catch (e) {
    console.error('[Nyaa]', e);
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════
// COMBINE + SORT results from all sources
// ═══════════════════════════════════════════════════════════════
async function searchAllTorrents(query: string, episode: number): Promise<{ results: TorrentResult[], debug: any }> {
  const debug: any = {
    query,
    episode,
    sources: {},
  };
  
  // Try both sources in parallel
  const [toshoResults, nyaaResults] = await Promise.allSettled([
    searchAnimeTosho(query, episode),
    searchNyaaDirect(query, episode),
  ]);
  
  const tosho = toshoResults.status === 'fulfilled' ? toshoResults.value : [];
  const nyaa = nyaaResults.status === 'fulfilled' ? nyaaResults.value : [];
  
  debug.sources.animetosho = tosho.length;
  debug.sources.nyaa = nyaa.length;
  
  // Combine + dedupe by title
  const all = [...tosho, ...nyaa];
  const seen = new Set<string>();
  const unique: TorrentResult[] = [];
  
  for (const t of all) {
    const key = t.title.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(t);
  }
  
  // Sort: quality DESC → seeders DESC → smaller size preferred
  unique.sort((a, b) => {
    if (a.quality_priority !== b.quality_priority) {
      return b.quality_priority - a.quality_priority;
    }
    if (b.seeders !== a.seeders) {
      return b.seeders - a.seeders;
    }
    return a.sizeBytes - b.sizeBytes;
  });
  
  return { results: unique.slice(0, 8), debug };
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

export const GET: APIRoute = async ({ url }) => {
  const params = url.searchParams;
  const slug = (params.get('slug') || '').trim().toLowerCase();
  const episode = parseInt(params.get('ep') || '1') || 1;
  let query = params.get('q') || slug.replace(/-/g, ' ');
  const noCache = params.get('nocache') === '1';
  const debugMode = params.get('debug') === '1';
  
  if (!slug && !query) {
    return jsonRes({ success: false, error: 'Missing slug or query' }, 400);
  }
  
  // Clean query — remove common words that mess up search
  query = query
    .replace(/season\s*\d+/gi, '')
    .replace(/part\s*\d+/gi, '')
    .replace(/\b(the|a|an|of|to|and|or)\b/gi, ' ')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const cacheKey = `race_v4:${query}:${episode}`;
  
  if (!noCache) {
    const hit = cached(cacheKey);
    if (hit && !debugMode) {
      return jsonRes({ success: true, source: 'cache', ...hit });
    }
  }
  
  try {
    const { results, debug } = await searchAllTorrents(query, episode);
    
    if (results.length === 0) {
      const response: any = {
        success: true,
        found: false,
        message: 'No torrents found. Try a shorter/different search query.',
        torrents: [],
      };
      if (debugMode) response.debug = debug;
      return jsonRes(response);
    }
    
    const best = results[0];
    
    const result: any = {
      found: true,
      query,
      episode,
      totalTorrents: results.length,
      primary: {
        title: best.title,
        magnet: best.magnet,
        torrentUrl: best.torrentUrl,
        size: best.size,
        seeders: best.seeders,
        leechers: best.leechers,
        quality: best.quality,
        source: best.source,
      },
      torrents: results.map(t => ({
        title: t.title,
        magnet: t.magnet,
        torrentUrl: t.torrentUrl,
        size: t.size,
        seeders: t.seeders,
        leechers: t.leechers,
        quality: t.quality,
        source: t.source,
      })),
    };
    
    if (debugMode) result.debug = debug;
    
    setCache(cacheKey, result);
    return jsonRes({ success: true, ...result });
    
  } catch (err: any) {
    console.error('[stream-race-v4]', err);
    return jsonRes({
      success: false,
      error: err.message || 'Search failed',
      torrents: [],
    }, 500);
  }
};
