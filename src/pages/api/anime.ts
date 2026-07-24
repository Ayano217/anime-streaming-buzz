import type { APIRoute } from 'astro';

export const prerender = false;

const cache = new Map<string, { data: any; expires: number }>();
const CACHE_MS = 10 * 60 * 1000; // 10 minutes

async function anilistFetch(query: string, variables: any): Promise<any> {
  const cacheKey = JSON.stringify({ query, variables });
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expires) {
    return cached.data;
  }
  
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
    
    if (!res.ok) return null;
    
    const json = await res.json();
    if (json.errors) return null;
    
    cache.set(cacheKey, { data: json, expires: Date.now() + CACHE_MS });
    return json;
  } catch (e) {
    return null;
  }
}

// Map source to AniList sort/status
function getQueryConfig(source: string, page: number) {
  const configs: Record<string, any> = {
    airing: {
      sort: ['POPULARITY_DESC'],
      status: 'RELEASING',
      type: 'ANIME',
    },
    top: {
      sort: ['SCORE_DESC'],
      status: 'RELEASING',
      type: 'ANIME',
    },
    upcoming: {
      sort: ['POPULARITY_DESC'],
      status: 'NOT_YET_RELEASED',
      type: 'ANIME',
    },
    popular: {
      sort: ['POPULARITY_DESC'],
      type: 'ANIME',
    },
    movie: {
      sort: ['POPULARITY_DESC'],
      format: 'MOVIE',
      type: 'ANIME',
    },
  };
  
  return configs[source] || configs.airing;
}

export const GET: APIRoute = async ({ url }) => {
  const params = new URL(url).searchParams;
  const source = params.get('source') || 'airing';
  const page = parseInt(params.get('page') || '1');
  const perPage = 24;
  
  const config = getQueryConfig(source, page);
  
  // Build GraphQL query dynamically
  let filters = `type: ANIME`;
  if (config.status) filters += `, status: ${config.status}`;
  if (config.format) filters += `, format: ${config.format}`;
  
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          hasNextPage
          currentPage
          lastPage
        }
        media(${filters}, sort: [${config.sort.join(', ')}]) {
          id
          idMal
          title {
            english
            romaji
            native
          }
          coverImage {
            large
            extraLarge
          }
          bannerImage
          description(asHtml: false)
          averageScore
          meanScore
          seasonYear
          episodes
          duration
          format
          status
          genres
          studios(isMain: true) {
            nodes {
              name
            }
          }
        }
      }
    }
  `;
  
  const result = await anilistFetch(query, { page, perPage });
  
  if (!result || !result.data || !result.data.Page) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to fetch anime data',
      data: [],
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
  
  const pageData = result.data.Page;
  
  // Simplify response for UI
  const simplified = (pageData.media || []).map((a: any) => ({
    id:       a.idMal || a.id,
    anilistId: a.id,
    title:    a.title?.english || a.title?.romaji || a.title?.native || 'Unknown',
    image:    a.coverImage?.extraLarge || a.coverImage?.large || '',
    banner:   a.bannerImage || '',
    score:    a.averageScore ? (a.averageScore / 10).toFixed(1) : null,
    year:     a.seasonYear,
    episodes: a.episodes || '?',
    genre:    a.genres?.[0] || '',
    genres:   a.genres || [],
    status:   a.status === 'RELEASING' ? 'Currently Airing' : (a.status || ''),
    type:     a.format || 'TV',
    studio:   a.studios?.nodes?.[0]?.name || '',
    duration: a.duration,
    description: (a.description || '').replace(/<[^>]*>/g, '').substring(0, 200),
  }));
  
  return new Response(JSON.stringify({
    success: true,
    data: simplified,
    pagination: {
      has_next_page: pageData.pageInfo?.hasNextPage || false,
      current_page: pageData.pageInfo?.currentPage || page,
      last_page: pageData.pageInfo?.lastPage || page,
    },
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=600, s-maxage=600',
    },
  });
};
