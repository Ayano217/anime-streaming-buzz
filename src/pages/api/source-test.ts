// ═══════════════════════════════════════════════════════════════
// Multi-Source Test API — v1
// Path: src/pages/api/source-test.ts
//
// Tests: AllAnime, Aniwatch/Zoro, Miruro, Marin
// These have BETTER libraries than AnimoTV/GogoAnime
// ═══════════════════════════════════════════════════════════════

export const prerender = false;

import type { APIRoute } from 'astro';

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ═══ 1. ALLANIME (GraphQL API — reliable) ═══
async function testAllAnime(query: string) {
  try {
    const searchQuery = `
      query($search: SearchInput) {
        shows(search: $search, limit: 10, page: 1, translationType: "sub") {
          edges {
            _id
            name
            englishName
            availableEpisodes
            thumbnail
            slugTime
          }
        }
      }
    `;
    
    const variables = {
      search: {
        allowAdult: false,
        allowUnknown: false,
        query,
      },
    };
    
    const url = `https://api.allanime.day/api?variables=${encodeURIComponent(JSON.stringify(variables))}&query=${encodeURIComponent(searchQuery)}`;
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Referer': 'https://allmanga.to/',
        'Origin': 'https://allmanga.to',
      },
    });
    
    if (!res.ok) return { name: 'AllAnime', success: false, error: `HTTP ${res.status}` };
    
    const data: any = await res.json();
    const shows = data?.data?.shows?.edges || [];
    
    return {
      name: 'AllAnime',
      success: true,
      resultsCount: shows.length,
      sample: shows.slice(0, 3).map((s: any) => ({
        id: s._id,
        title: s.name || s.englishName,
        episodes: s.availableEpisodes,
        watchUrl: `https://allmanga.to/anime/${s._id}/episodes`,
      })),
    };
  } catch (e: any) {
    return { name: 'AllAnime', success: false, error: e.message };
  }
}

// ═══ 2. ANIWATCH (formerly Zoro) — via aniwatch-api ═══
async function testAniwatch(query: string) {
  try {
    // Public aniwatch-api instance
    const url = `https://aniwatch-api-net.vercel.app/api/v2/hianime/search?q=${encodeURIComponent(query)}`;
    
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
    });
    
    if (!res.ok) return { name: 'Aniwatch', success: false, error: `HTTP ${res.status}` };
    
    const data: any = await res.json();
    const animes = data?.data?.animes || [];
    
    return {
      name: 'Aniwatch',
      success: true,
      resultsCount: animes.length,
      sample: animes.slice(0, 3).map((a: any) => ({
        id: a.id,
        title: a.name,
        episodes: a.episodes,
        watchUrl: `https://hianime.to/watch/${a.id}`,
      })),
    };
  } catch (e: any) {
    return { name: 'Aniwatch', success: false, error: e.message };
  }
}

// ═══ 3. CONSUMET API (aggregator — multiple sources) ═══
async function testConsumet(query: string) {
  try {
    // Consumet has multiple providers
    const url = `https://api.consumet.org/anime/gogoanime/${encodeURIComponent(query)}`;
    
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
    });
    
    if (!res.ok) return { name: 'Consumet', success: false, error: `HTTP ${res.status}` };
    
    const data: any = await res.json();
    const results = data?.results || [];
    
    return {
      name: 'Consumet',
      success: true,
      resultsCount: results.length,
      sample: results.slice(0, 3).map((r: any) => ({
        id: r.id,
        title: r.title,
        episodes: r.subOrDub,
        image: r.image,
      })),
    };
  } catch (e: any) {
    return { name: 'Consumet', success: false, error: e.message };
  }
}

// ═══ 4. MIRURO (new, popular) ═══
async function testMiruro(query: string) {
  try {
    // Miruro uses consumet backend
    const url = `https://api.miruro.to/anime/search?query=${encodeURIComponent(query)}`;
    
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
    });
    
    if (!res.ok) return { name: 'Miruro', success: false, error: `HTTP ${res.status}` };
    
    const data: any = await res.json();
    
    return {
      name: 'Miruro',
      success: true,
      dataPreview: JSON.stringify(data).slice(0, 300),
    };
  } catch (e: any) {
    return { name: 'Miruro', success: false, error: e.message };
  }
}

// ═══ 5. ANIMEKAI (backup) ═══
async function testAnimeKai(query: string) {
  try {
    const url = `https://animekai.to/browser?keyword=${encodeURIComponent(query)}`;
    
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
    });
    
    if (!res.ok) return { name: 'AnimeKai', success: false, error: `HTTP ${res.status}` };
    
    const text = await res.text();
    const hasResults = text.includes('film-poster') || text.includes('search-content');
    
    return {
      name: 'AnimeKai',
      success: hasResults,
      pageSize: text.length,
      note: hasResults ? 'Page loaded with results' : 'Page loaded but no results found',
    };
  } catch (e: any) {
    return { name: 'AnimeKai', success: false, error: e.message };
  }
}

// ═══ MAIN HANDLER ═══
export const GET: APIRoute = async ({ url }) => {
  const params = url.searchParams;
  const query = params.get('q') || 'jujutsu kaisen';
  
  // Run all tests in parallel
  const results = await Promise.all([
    testAllAnime(query),
    testAniwatch(query),
    testConsumet(query),
    testMiruro(query),
    testAnimeKai(query),
  ]);
  
  const working = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  return jsonRes({
    query,
    summary: {
      total: results.length,
      working: working.length,
      failed: failed.length,
      workingNames: working.map(r => r.name),
      failedNames: failed.map(r => r.name),
    },
    results,
  });
};
