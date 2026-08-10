export const prerender = false;

function extractFbId(url: string): string | null {
  try {
    const u = url.trim();
    let m = u.match(/\/reel\/(\d+)/);
    if (m) return m[1];
    m = u.match(/\/share\/v\/([A-Za-z0-9]+)/);
    if (m) return m[1];
    m = u.match(/\/share\/r\/([A-Za-z0-9]+)/);
    if (m) return m[1];
    m = u.match(/\/videos\/(\d+)/);
    if (m) return m[1];
    m = u.match(/[?&]v=(\d+)/);
    if (m) return m[1];
    m = u.match(/fb\.watch\/([A-Za-z0-9_-]+)/);
    if (m) return m[1];
    return null;
  } catch (e) {
    return null;
  }
}

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s) || /facebook\.com|fb\.watch/i.test(s);
}

function scoreMatch(query: string, record: any): number {
  const q = query.toLowerCase();
  let score = 0;
  const title = (record.animeTitle || '').toLowerCase();
  const slug = (record.animeSlug || '').toLowerCase();
  const caption = (record.caption || '').toLowerCase();
  const keywords = (record.keywords || '').toLowerCase();

  // Exact title match
  if (title === q) score += 100;
  // Title starts with query
  if (title.startsWith(q)) score += 50;
  // Title contains query
  if (title.indexOf(q) !== -1) score += 30;
  // Slug match
  if (slug.indexOf(q) !== -1) score += 25;
  // Caption match
  if (caption.indexOf(q) !== -1) score += 20;
  // Keywords match
  if (keywords.indexOf(q) !== -1) score += 15;

  // Word-by-word bonus
  const words = q.split(/\s+/).filter(w => w.length > 2);
  words.forEach(w => {
    if (title.indexOf(w) !== -1) score += 5;
    if (caption.indexOf(w) !== -1) score += 3;
    if (keywords.indexOf(w) !== -1) score += 2;
  });

  return score;
}

export async function GET({ url, locals }: any) {
  try {
    const env = (locals as any)?.runtime?.env || {};
    const kv = env.ANIME_DB;
    const query = (url.searchParams.get('q') || '').trim();
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '8'), 20);

    if (!kv) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Database not configured',
        results: []
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ 
        success: true, 
        results: [],
        totalInDb: 0
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // If URL, do direct FB ID lookup
    if (isUrl(query)) {
      const fbId = extractFbId(query);
      if (fbId) {
        const recordId = await kv.get(`fbid:${fbId}`);
        if (recordId) {
          const raw = await kv.get(`video:${recordId}`);
          if (raw) {
            const record = JSON.parse(raw);
            return new Response(JSON.stringify({ 
              success: true, 
              results: [formatResult(record, 'link')],
              totalInDb: 1
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
        }
      }
      return new Response(JSON.stringify({ 
        success: true, 
        results: [],
        totalInDb: 0
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Text search — fetch all videos from index, then score
    const indexRaw = await kv.get('index:all');
    let index: string[] = [];
    try {
      index = indexRaw ? JSON.parse(indexRaw) : [];
    } catch (e) {}

    if (index.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        results: [],
        totalInDb: 0
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Fetch all records in parallel (max 200)
    const toFetch = index.slice(0, 200);
    const records = await Promise.all(
      toFetch.map(async (id) => {
        try {
          const raw = await kv.get(`video:${id}`);
          return raw ? JSON.parse(raw) : null;
        } catch (e) {
          return null;
        }
      })
    );

    const valid = records.filter(r => r !== null);

    // Score all
    const scored = valid.map(r => ({
      record: r,
      score: scoreMatch(query, r)
    })).filter(x => x.score > 0);

    scored.sort((a, b) => b.score - a.score);

    const results = scored.slice(0, limit).map(x => formatResult(x.record, 'text'));

    return new Response(JSON.stringify({ 
      success: true, 
      results: results,
      totalInDb: valid.length
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (e: any) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: e.message || 'Search failed',
      results: []
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

function formatResult(record: any, matchType: string): any {
  return {
    anime: record.animeSlug,
    title: record.animeTitle,
    episode: record.episode,
    season: record.season,
    caption: record.caption || '',
    thumbnail: record.thumbnail || '',
    watchUrl: '/reels/anime_' + encodeURIComponent(record.animeSlug) + '_ep' + record.episode,
    matchType: matchType,
    confidence: matchType === 'link' ? 1.0 : 0.85
  };
}
