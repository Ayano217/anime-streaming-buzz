// ═══════════════════════════════════════════════════════════════
// ADMIN LIST v2 — INFINITE + Pagination + Search
// Path: src/pages/api/admin-list.ts
// ═══════════════════════════════════════════════════════════════
// ✅ No 100 limit — supports UNLIMITED videos
// ✅ Pagination (50 per page, unlimited pages)
// ✅ Search by anime title, slug, caption, keywords
// ✅ Filter by season
// ✅ Sort options (recent, alphabetical, episode count)
// ✅ Fast batch fetch (parallel)
// ═══════════════════════════════════════════════════════════════

export const prerender = false;

function verifyToken(token: string, adminPassword: string): boolean {
  try {
    if (!token || !adminPassword) return false;
    const decoded = atob(token);
    const [timestamp, pwd] = decoded.split(':');
    if (pwd !== adminPassword) return false;
    const age = Date.now() - parseInt(timestamp);
    if (age > 24 * 60 * 60 * 1000) return false;
    return true;
  } catch (e) {
    return false;
  }
}

export async function GET({ request, locals, url }: any) {
  try {
    const env = (locals as any)?.runtime?.env || {};
    const kv = env.ANIME_DB;
    const adminPassword = env.ADMIN_PASSWORD;

    if (!kv) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'KV database not configured' 
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // Verify auth
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!verifyToken(token, adminPassword)) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Unauthorized' 
      }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    // Parse query params
    const params = url.searchParams;
    const page = Math.max(1, parseInt(params.get('page') || '1'));
    const limit = Math.min(200, Math.max(10, parseInt(params.get('limit') || '50')));
    const search = (params.get('search') || '').trim().toLowerCase();
    const sortBy = params.get('sort') || 'recent'; // recent | title | episode
    const filterSeason = params.get('season') || '';

    // Fetch full index (no limit)
    const indexRaw = await kv.get('index:all');
    let index: string[] = [];
    try {
      index = indexRaw ? JSON.parse(indexRaw) : [];
    } catch (e) {}

    const totalIndexed = index.length;

    // If searching or filtering — fetch ALL records first, then filter
    // (KV doesn't support server-side query, so we fetch and filter in memory)
    let recordsToFetch: string[] = [];
    
    if (search || filterSeason || sortBy !== 'recent') {
      // Need to fetch all to search/sort accurately
      // Fetch in batches of 100 for efficiency
      const allIds = index;
      const batchSize = 100;
      const allRecords: any[] = [];
      
      for (let i = 0; i < allIds.length; i += batchSize) {
        const batch = allIds.slice(i, i + batchSize);
        const batchRecords = await Promise.all(
          batch.map(async (id) => {
            try {
              const raw = await kv.get(`video:${id}`);
              return raw ? JSON.parse(raw) : null;
            } catch { return null; }
          })
        );
        allRecords.push(...batchRecords.filter(r => r !== null));
      }
      
      // Apply filters
      let filtered = allRecords;
      
      // Search filter
      if (search) {
        filtered = filtered.filter(r => {
          const searchable = [
            r.animeTitle || '',
            r.animeSlug || '',
            r.caption || '',
            r.keywords || '',
            `s${r.season}`,
            `ep${r.episode}`,
            `episode ${r.episode}`,
            `season ${r.season}`
          ].join(' ').toLowerCase();
          return searchable.includes(search);
        });
      }
      
      // Season filter
      if (filterSeason) {
        const seasonNum = parseInt(filterSeason);
        if (!isNaN(seasonNum)) {
          filtered = filtered.filter(r => r.season === seasonNum);
        }
      }
      
      // Sort
      if (sortBy === 'title') {
        filtered.sort((a, b) => (a.animeTitle || '').localeCompare(b.animeTitle || ''));
      } else if (sortBy === 'episode') {
        filtered.sort((a, b) => {
          const at = (a.animeTitle || '').localeCompare(b.animeTitle || '');
          if (at !== 0) return at;
          if (a.season !== b.season) return a.season - b.season;
          return a.episode - b.episode;
        });
      }
      // recent = default (already sorted by index order = most recent first)
      
      const totalFiltered = filtered.length;
      
      // Paginate filtered results
      const offset = (page - 1) * limit;
      const pageResults = filtered.slice(offset, offset + limit);
      
      return new Response(JSON.stringify({ 
        success: true, 
        videos: pageResults,
        pagination: {
          page: page,
          limit: limit,
          total: totalFiltered,
          totalIndexed: totalIndexed,
          totalPages: Math.ceil(totalFiltered / limit),
          hasMore: offset + limit < totalFiltered
        },
        filters: {
          search: search,
          season: filterSeason,
          sort: sortBy
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    
    // No search — fast pagination on index (recent order)
    const offset = (page - 1) * limit;
    const pageIds = index.slice(offset, offset + limit);
    
    // Batch fetch (parallel)
    const records = await Promise.all(
      pageIds.map(async (id) => {
        try {
          const raw = await kv.get(`video:${id}`);
          return raw ? JSON.parse(raw) : null;
        } catch (e) {
          return null;
        }
      })
    );

    const videos = records.filter(r => r !== null);

    return new Response(JSON.stringify({ 
      success: true, 
      videos: videos,
      pagination: {
        page: page,
        limit: limit,
        total: totalIndexed,
        totalIndexed: totalIndexed,
        totalPages: Math.ceil(totalIndexed / limit),
        hasMore: offset + limit < totalIndexed
      },
      filters: {
        search: '',
        season: '',
        sort: 'recent'
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (e: any) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: e.message || 'Failed to fetch videos' 
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
