// ═══════════════════════════════════════════════════════════════
// AniTube Buzz — Stream Race API v3 (with proper Nyaa integration)
// Path: src/pages/api/stream-race.ts
//
// v3 CHANGES:
//   ✅ Better Nyaa RSS parsing (1080p priority, low MB)
//   ✅ Quality detection (1080p > 720p > 480p)
//   ✅ Seeders sort (higher = faster download)
//   ✅ File size filter (avoid huge 5GB+ files, prefer 300-800MB)
//   ✅ Returns magnet link + direct download link
//   ✅ Multiple options (5 best torrents)
// ═══════════════════════════════════════════════════════════════

export const prerender = false;

import type { APIRoute } from 'astro';

const CACHE: Record<string, { data: any; time: number }> = {};
const CACHE_TTL = 30 * 60 * 1000;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

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

// ═══════════════════════════════════════════════════════════════
// NYAA TORRENT SEARCH (v3 — proper implementation)
// ═══════════════════════════════════════════════════════════════

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
  category: string;
  uploader?: string;
}

// Convert size string to bytes for filtering
function parseSizeToBytes(sizeStr: string): number {
  if (!sizeStr) return 0;
  const match = sizeStr.match(/([\d.]+)\s*(GiB|MiB|KiB|GB|MB|KB)/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const multipliers: Record<string, number> = {
    'GIB': 1024 * 1024 * 1024,
    'GB': 1000 * 1000 * 1000,
    'MIB': 1024 * 1024,
    'MB': 1000 * 1000,
    'KIB': 1024,
    'KB': 1000,
  };
  return num * (multipliers[unit] || 1);
}

// Detect quality from torrent title
function detectQuality(title: string): { label: string; priority: number } {
  const t = title.toLowerCase();
  if (/2160p|4k|uhd/i.test(t)) return { label: '4K', priority: 1 }; // Too big usually
  if (/1080p/i.test(t)) return { label: '1080p', priority: 5 }; // BEST
  if (/720p/i.test(t)) return { label: '720p', priority: 4 };
  if (/480p/i.test(t)) return { label: '480p', priority: 3 };
  if (/360p/i.test(t)) return { label: '360p', priority: 2 };
  return { label: 'HD', priority: 3 };
}

// Convert magnet from Nyaa infohash
function buildMagnetFromHash(hash: string, title: string): string {
  const trackers = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.stealth.si:80/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://exodus.desync.com:6969/announce',
    'udp://tracker.moeking.me:6969/announce',
    'http://nyaa.tracker.wf:7777/announce',
  ];
  const trackerStr = trackers.map(t => `&tr=${encodeURIComponent(t)}`).join('');
  return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}${trackerStr}`;
}

async function searchNyaa(query: string, episode: number): Promise<TorrentResult[]> {
  try {
    // Build smart search query
    // Try multiple query patterns for best results
    const cleanQuery = query.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const epStr = String(episode).padStart(2, '0');
    
    // Try: "anime name 05" first (most common), then "anime name episode 5"
    const searchQueries = [
      `${cleanQuery} ${epStr}`,
      `${cleanQuery} - ${epStr}`,
      `${cleanQuery} episode ${episode}`,
    ];
    
    const allResults: TorrentResult[] = [];
    const seenTitles = new Set<string>();
    
    for (const searchQuery of searchQueries) {
      const rssUrl = `https://nyaa.si/?page=rss&q=${encodeURIComponent(searchQuery)}&c=1_2&f=0&s=seeders&o=desc`;
      // c=1_2 = English translated anime, s=seeders o=desc = sort by seeders
      
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        
        const res = await fetch(rssUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': randomUA(),
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          },
        });
        clearTimeout(timer);
        
        if (!res.ok) continue;
        const text = await res.text();
        
        // Parse RSS items
        const itemMatches = text.match(/<item>([\s\S]*?)<\/item>/g);
        if (!itemMatches) continue;
        
        for (const itemBlock of itemMatches.slice(0, 20)) {
          const titleMatch = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/.exec(itemBlock);
          const linkMatch = /<link>(.*?)<\/link>/.exec(itemBlock);
          const guidMatch = /<guid[^>]*>(.*?)<\/guid>/.exec(itemBlock);
          const sizeMatch = /<nyaa:size>(.*?)<\/nyaa:size>/.exec(itemBlock);
          const seedersMatch = /<nyaa:seeders>(\d+)<\/nyaa:seeders>/.exec(itemBlock);
          const leechersMatch = /<nyaa:leechers>(\d+)<\/nyaa:leechers>/.exec(itemBlock);
          const categoryMatch = /<nyaa:category>(.*?)<\/nyaa:category>/.exec(itemBlock);
          const infohashMatch = /<nyaa:infoHash>(.*?)<\/nyaa:infoHash>/.exec(itemBlock);
          
          if (!titleMatch) continue;
          const title = titleMatch[1].trim();
          
          // Dedupe
          if (seenTitles.has(title.toLowerCase())) continue;
          seenTitles.add(title.toLowerCase());
          
          const sizeStr = sizeMatch ? sizeMatch[1].trim() : 'Unknown';
          const sizeBytes = parseSizeToBytes(sizeStr);
          const seeders = seedersMatch ? parseInt(seedersMatch[1]) : 0;
          const leechers = leechersMatch ? parseInt(leechersMatch[1]) : 0;
          
          // Skip if no seeders (dead torrent)
          if (seeders === 0) continue;
          
          // Skip if too large (over 2GB usually 4K or full season)
          if (sizeBytes > 2 * 1024 * 1024 * 1024) continue;
          
          // Skip if too small (under 50MB probably fake or wrong)
          if (sizeBytes < 50 * 1024 * 1024) continue;
          
          const quality = detectQuality(title);
          const category = categoryMatch ? categoryMatch[1].trim() : 'Anime';
          const torrentUrl = linkMatch ? linkMatch[1].trim() : (guidMatch ? guidMatch[1].trim() : '');
          
          // Build magnet link
          let magnet = '';
          if (infohashMatch) {
            magnet = buildMagnetFromHash(infohashMatch[1].trim(), title);
          }
          
          allResults.push({
            title,
            magnet,
            torrentUrl,
            size: sizeStr,
            sizeBytes,
            seeders,
            leechers,
            quality: quality.label,
            quality_priority: quality.priority,
            category,
          });
        }
        
        // If we got good results, stop trying other queries
        if (allResults.length >= 5) break;
      } catch (e) {
        continue;
      }
    }
    
    // Sort: quality priority DESC → seeders DESC → smaller size preferred within same quality
    allResults.sort((a, b) => {
      // 1080p first
      if (a.quality_priority !== b.quality_priority) {
        return b.quality_priority - a.quality_priority;
      }
      // More seeders = faster download
      if (b.seeders !== a.seeders) {
        return b.seeders - a.seeders;
      }
      // Smaller size preferred (less data usage)
      return a.sizeBytes - b.sizeBytes;
    });
    
    return allResults.slice(0, 5); // Top 5 results
  } catch (e) {
    console.error('[Nyaa]', e);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

export const GET: APIRoute = async ({ url }) => {
  const params = url.searchParams;
  const slug = (params.get('slug') || '').trim().toLowerCase();
  const episode = parseInt(params.get('ep') || '1') || 1;
  const query = params.get('q') || slug.replace(/-/g, ' ');
  const noCache = params.get('nocache') === '1';
  const torrentOnly = params.get('torrent') === '1';
  
  if (!slug && !query) {
    return jsonRes({ success: false, error: 'Missing slug or query' }, 400);
  }
  
  const cacheKey = `race_v3:${slug || query}:${episode}:${torrentOnly ? 'torrent' : 'all'}`;
  
  if (!noCache) {
    const hit = cached(cacheKey);
    if (hit) {
      return jsonRes({ success: true, source: 'cache', ...hit });
    }
  }
  
  try {
    // Search Nyaa for torrents
    const torrents = await searchNyaa(query, episode);
    
    if (torrents.length === 0) {
      return jsonRes({
        success: true,
        found: false,
        message: 'No torrents available for this episode',
        torrents: [],
      });
    }
    
    // Best torrent (already sorted)
    const best = torrents[0];
    
    const result = {
      found: true,
      query,
      episode,
      totalTorrents: torrents.length,
      primary: {
        title: best.title,
        magnet: best.magnet,
        torrentUrl: best.torrentUrl,
        size: best.size,
        seeders: best.seeders,
        leechers: best.leechers,
        quality: best.quality,
      },
      torrents: torrents.map(t => ({
        title: t.title,
        magnet: t.magnet,
        torrentUrl: t.torrentUrl,
        size: t.size,
        seeders: t.seeders,
        leechers: t.leechers,
        quality: t.quality,
      })),
    };
    
    setCache(cacheKey, result);
    return jsonRes({ success: true, ...result });
    
  } catch (err: any) {
    console.error('[stream-race-v3]', err);
    return jsonRes({
      success: false,
      error: err.message || 'Search failed',
      torrents: [],
    }, 500);
  }
};
