// ═══════════════════════════════════════════════════════════════
// AnimePahe Test API — v1
// Path: src/pages/api/pahe-test.ts
//
// Purpose: Test if AnimePahe session ID method works from
//          Cloudflare Workers (before adding to main race)
// ═══════════════════════════════════════════════════════════════

export const prerender = false;

import type { APIRoute } from 'astro';

const BASE = 'https://animepahe.ru';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://animepahe.ru/',
  'Cookie': '__ddg1_=; __ddg2_=;',  // AnimePahe uses DDoS-Guard
};

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ═══ STEP 1: Search anime → get session ID ═══
async function searchAnime(query: string): Promise<any> {
  try {
    const url = `${BASE}/api?m=search&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: HEADERS });
    
    if (!res.ok) {
      return { success: false, error: `Search failed: ${res.status}`, statusText: res.statusText };
    }
    
    const data: any = await res.json();
    return { success: true, results: data.data || [], total: data.total || 0 };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ═══ STEP 2: Get episodes for anime session ═══
async function getEpisodes(animeSession: string): Promise<any> {
  try {
    const url = `${BASE}/api?m=release&id=${animeSession}&sort=episode_asc&page=1`;
    const res = await fetch(url, { headers: HEADERS });
    
    if (!res.ok) {
      return { success: false, error: `Episodes fetch failed: ${res.status}` };
    }
    
    const data: any = await res.json();
    return { 
      success: true, 
      episodes: data.data || [], 
      total: data.total || 0,
      lastPage: data.last_page || 1,
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ═══ MAIN HANDLER ═══
export const GET: APIRoute = async ({ url }) => {
  const params = url.searchParams;
  const query = params.get('q') || '';
  const animeSession = params.get('session') || '';
  const step = params.get('step') || 'full';
  
  // ═══ STEP TEST 1: Just search ═══
  if (step === 'search' && query) {
    const result = await searchAnime(query);
    return jsonRes({ step: 'search', query, ...result });
  }
  
  // ═══ STEP TEST 2: Get episodes (need session ID) ═══
  if (step === 'episodes' && animeSession) {
    const result = await getEpisodes(animeSession);
    return jsonRes({ step: 'episodes', session: animeSession, ...result });
  }
  
  // ═══ FULL FLOW: Search → get first result → get episodes ═══
  if (step === 'full' && query) {
    const searchResult = await searchAnime(query);
    
    if (!searchResult.success) {
      return jsonRes({ 
        step: 'full', 
        query, 
        searchResult,
        conclusion: '❌ Search failed — AnimePahe blocking?',
      });
    }
    
    if (!searchResult.results || searchResult.results.length === 0) {
      return jsonRes({ 
        step: 'full', 
        query, 
        searchResult,
        conclusion: '⚠️ No results for this query',
      });
    }
    
    const firstAnime = searchResult.results[0];
    const episodesResult = await getEpisodes(firstAnime.session);
    
    // Build sample watch URLs
    const sampleUrls = (episodesResult.episodes || []).slice(0, 3).map((ep: any) => ({
      episode: ep.episode,
      watchUrl: `${BASE}/play/${firstAnime.session}/${ep.session}`,
      snapshot: ep.snapshot,
    }));
    
    return jsonRes({
      step: 'full',
      query,
      anime: {
        title: firstAnime.title,
        session: firstAnime.session,
        year: firstAnime.year,
        episodes: firstAnime.episodes,
        poster: firstAnime.poster,
        type: firstAnime.type,
      },
      episodesResult,
      sampleUrls,
      conclusion: episodesResult.success && sampleUrls.length > 0
        ? '✅ AnimePahe WORKS from Cloudflare Workers!'
        : '❌ Episodes fetch blocked',
    });
  }
  
  return jsonRes({ 
    error: 'Missing parameters',
    usage: [
      '/api/pahe-test?q=jujutsu+kaisen (full flow)',
      '/api/pahe-test?step=search&q=one+piece',
      '/api/pahe-test?step=episodes&session=SESSION_ID',
    ],
  }, 400);
};
