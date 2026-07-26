export const prerender = false;

import type { APIRoute } from 'astro';

// In-memory cache (Cloudflare Worker will keep this per instance)
let cache: { data: any; time: number; category: string } = {
  data: null,
  time: 0,
  category: ''
};
const CACHE_DURATION = 30 * 60 * 1000; // 30 min

interface AnimeItem {
  id: string;
  title: string;
  image: string;
  score: number;
  episodes: number;
  status: string;
  synopsis: string;
  genres: string[];
  year: number;
  slug: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// ─── Source 1: Kitsu API (most reliable) ──────────
async function fetchFromKitsu(category: string): Promise<AnimeItem[]> {
  const sortMap: Record<string, string> = {
    airing: '-startDate',
    top: '-averageRating',
    upcoming: 'startDate',
    popular: '-userCount',
    movies: '-userCount'
  };

  const filterMap: Record<string, string> = {
    airing: 'filter[status]=current',
    top: 'filter[status]=finished',
    upcoming: 'filter[status]=upcoming',
    popular: '',
    movies: 'filter[subtype]=movie'
  };

  const sort = sortMap[category] || '-userCount';
  const filter = filterMap[category] || '';
  const url = `https://kitsu.io/api/edge/anime?${filter}&sort=${sort}&page[limit]=20`;

  const res = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json'
    }
  });

  if (!res.ok) throw new Error(`Kitsu ${res.status}`);
  const json: any = await res.json();

  return json.data.map((item: any) => {
    const attr = item.attributes;
    const title = attr.canonicalTitle || attr.titles?.en || attr.titles?.en_jp || 'Unknown';
    return {
      id: item.id,
      title,
      image: attr.posterImage?.large || attr.posterImage?.medium || attr.posterImage?.original || '',
      score: attr.averageRating ? parseFloat(attr.averageRating) / 10 : 0,
      episodes: attr.episodeCount || 0,
      status: attr.status || 'unknown',
      synopsis: attr.synopsis || attr.description || '',
      genres: [],
      year: attr.startDate ? parseInt(attr.startDate.substring(0, 4)) : 2024,
      slug: slugify(title)
    };
  });
}

// ─── Source 2: AniList GraphQL (backup) ──────────
async function fetchFromAniList(category: string): Promise<AnimeItem[]> {
  const statusMap: Record<string, string> = {
    airing: 'RELEASING',
    top: 'FINISHED',
    upcoming: 'NOT_YET_RELEASED',
    popular: '',
    movies: ''
  };
  const sortMap: Record<string, string> = {
    airing: 'POPULARITY_DESC',
    top: 'SCORE_DESC',
    upcoming: 'POPULARITY_DESC',
    popular: 'POPULARITY_DESC',
    movies: 'POPULARITY_DESC'
  };

  const filter: string[] = [];
  if (statusMap[category]) filter.push(`status: ${statusMap[category]}`);
  if (category === 'movies') filter.push('format: MOVIE');
  const filterStr = filter.length ? filter.join(', ') + ', ' : '';

  const query = `
    query {
      Page(page: 1, perPage: 20) {
        media(${filterStr}type: ANIME, sort: ${sortMap[category]}) {
          id
          title { romaji english }
          coverImage { large extraLarge }
          averageScore
          episodes
          status
          description
          genres
          startDate { year }
        }
      }
    }
  `;

  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ query })
  });

  if (!res.ok) throw new Error(`AniList ${res.status}`);
  const json: any = await res.json();

  return json.data.Page.media.map((item: any) => {
    const title = item.title.english || item.title.romaji || 'Unknown';
    return {
      id: String(item.id),
      title,
      image: item.coverImage.extraLarge || item.coverImage.large || '',
      score: item.averageScore ? item.averageScore / 10 : 0,
      episodes: item.episodes || 0,
      status: (item.status || 'unknown').toLowerCase(),
      synopsis: (item.description || '').replace(/<[^>]+>/g, ''),
      genres: item.genres || [],
      year: item.startDate?.year || 2024,
      slug: slugify(title)
    };
  });
}

// ─── Source 3: Static fallback ──────────
async function fetchFromStatic(): Promise<AnimeItem[]> {
  try {
    const res = await fetch('https://anime-streaming-buzz.pages.dev/data/anime-static.json');
    if (!res.ok) throw new Error('static failed');
    const data: any = await res.json();
    return data.anime || [];
  } catch {
    // Ultimate hard-coded fallback
    return [
      {
        id: '1',
        title: 'Attack on Titan',
        image: 'https://media.kitsu.io/anime/poster_images/7442/large.jpg',
        score: 8.5, episodes: 75, status: 'finished',
        synopsis: 'Humanity fights for survival against giant humanoid creatures.',
        genres: ['Action', 'Drama'], year: 2013, slug: 'attack-on-titan'
      },
      {
        id: '2',
        title: 'Demon Slayer',
        image: 'https://media.kitsu.io/anime/poster_images/41370/large.jpg',
        score: 8.7, episodes: 44, status: 'current',
        synopsis: 'A young boy becomes a demon slayer to save his sister.',
        genres: ['Action', 'Supernatural'], year: 2019, slug: 'demon-slayer'
      },
      {
        id: '3',
        title: 'Jujutsu Kaisen',
        image: 'https://media.kitsu.io/anime/poster_images/42765/large.jpg',
        score: 8.6, episodes: 47, status: 'current',
        synopsis: 'A boy swallows a cursed talisman and enters the world of jujutsu sorcerers.',
        genres: ['Action', 'Supernatural'], year: 2020, slug: 'jujutsu-kaisen'
      },
      {
        id: '4',
        title: 'One Piece',
        image: 'https://media.kitsu.io/anime/poster_images/12/large.jpg',
        score: 8.7, episodes: 1000, status: 'current',
        synopsis: 'A pirate crew searches for the ultimate treasure, One Piece.',
        genres: ['Adventure', 'Comedy'], year: 1999, slug: 'one-piece'
      },
      {
        id: '5',
        title: 'My Hero Academia',
        image: 'https://media.kitsu.io/anime/poster_images/11469/large.jpg',
        score: 8.0, episodes: 138, status: 'current',
        synopsis: 'A boy without powers dreams of becoming a hero.',
        genres: ['Action', 'Superhero'], year: 2016, slug: 'my-hero-academia'
      },
      {
        id: '6',
        title: 'Chainsaw Man',
        image: 'https://media.kitsu.io/anime/poster_images/44081/large.jpg',
        score: 8.4, episodes: 12, status: 'finished',
        synopsis: 'A young man merges with a chainsaw devil to fight other devils.',
        genres: ['Action', 'Horror'], year: 2022, slug: 'chainsaw-man'
      }
    ];
  }
}

export const GET: APIRoute = async ({ url }) => {
  const category = url.searchParams.get('category') || 'airing';
  const now = Date.now();

  // Cache hit
  if (cache.data && cache.category === category && now - cache.time < CACHE_DURATION) {
    return new Response(JSON.stringify({
      success: true,
      source: 'cache',
      count: cache.data.length,
      anime: cache.data
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800'
      }
    });
  }

  // Try sources in order
  const sources = [
    { name: 'kitsu', fn: () => fetchFromKitsu(category) },
    { name: 'anilist', fn: () => fetchFromAniList(category) },
    { name: 'static', fn: () => fetchFromStatic() }
  ];

  for (const src of sources) {
    try {
      const data = await src.fn();
      if (data && data.length > 0) {
        cache = { data, time: now, category };
        return new Response(JSON.stringify({
          success: true,
          source: src.name,
          count: data.length,
          anime: data
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=1800'
          }
        });
      }
    } catch (err) {
      console.error(`${src.name} failed:`, err);
      continue;
    }
  }

  return new Response(JSON.stringify({
    success: false,
    error: 'All sources failed',
    anime: []
  }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
};
