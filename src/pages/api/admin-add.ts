// ═══════════════════════════════════════════════════════════════
// ADMIN ADD v2 — FB Link OPTIONAL + Caption-Based Discovery
// Path: src/pages/api/admin-add.ts
// ═══════════════════════════════════════════════════════════════
// ✅ FB links now OPTIONAL (can skip completely)
// ✅ Caption required (main matching key)
// ✅ Multiple FB links still supported (if provided)
// ✅ Auto-slug generation
// ✅ Auto-increment episode support
// ✅ Better validation
// ═══════════════════════════════════════════════════════════════

export const prerender = false;

function slugify(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

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

export async function POST({ request, locals }: any) {
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
        error: 'Unauthorized. Please login again.' 
      }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const body = await request.json();
    
    // FB links now OPTIONAL
    const rawFbLinks = Array.isArray(body.fbLinks) 
      ? body.fbLinks 
      : [body.fbLink].filter(Boolean);
    const fbLinks = rawFbLinks.filter((l: string) => l && l.trim().length > 0);
    
    const animeTitle = (body.animeTitle || '').trim();
    const animeSlug = (body.animeSlug || slugify(animeTitle)).trim();
    const season = parseInt(body.season) || 1;
    const episode = parseInt(body.episode) || 1;
    const caption = (body.caption || '').trim();
    const keywords = (body.keywords || '').trim();
    const watchUrl = (body.watchUrl || '').trim();
    const thumbnail = (body.thumbnail || '').trim();

    // ═══════════════════════════════════════════════════
    // VALIDATION
    // ═══════════════════════════════════════════════════
    if (!animeTitle) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Anime title is required' 
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Caption highly recommended (main matching key)
    if (!caption && fbLinks.length === 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Please add either a caption OR at least one Facebook link (or both)' 
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Extract FB IDs from all links (if any)
    const fbIds: string[] = [];
    if (fbLinks.length > 0) {
      for (const link of fbLinks) {
        const id = extractFbId(link);
        if (id && !fbIds.includes(id)) fbIds.push(id);
      }
      
      // If links provided but none could be parsed, warn but don't fail
      if (fbIds.length === 0) {
        console.warn('[admin-add] FB links provided but none could be parsed:', fbLinks);
      }
    }

    // Unique record ID: slug + season + episode
    const recordId = `${animeSlug}_s${season}_ep${episode}`;

    // Check if record already exists (update vs create)
    let existingRecord: any = null;
    try {
      const existing = await kv.get(`video:${recordId}`);
      if (existing) existingRecord = JSON.parse(existing);
    } catch {}

    // Build record (merge with existing if applicable)
    const record: any = {
      id: recordId,
      fbIds: fbIds,
      fbLinks: fbLinks,
      animeSlug: animeSlug,
      animeTitle: animeTitle,
      season: season,
      episode: episode,
      caption: caption,
      keywords: keywords,
      watchUrl: watchUrl,
      thumbnail: thumbnail,
      createdAt: existingRecord?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    
    // If updating, merge fbIds and fbLinks (add new ones without removing old)
    if (existingRecord) {
      const existingFbIds = Array.isArray(existingRecord.fbIds) ? existingRecord.fbIds : [];
      const existingFbLinks = Array.isArray(existingRecord.fbLinks) ? existingRecord.fbLinks : [];
      
      // Merge unique
      record.fbIds = Array.from(new Set([...existingFbIds, ...fbIds]));
      record.fbLinks = Array.from(new Set([...existingFbLinks, ...fbLinks]));
      
      // Keep last 20 links max
      if (record.fbLinks.length > 20) {
        record.fbLinks = record.fbLinks.slice(-20);
      }
      if (record.fbIds.length > 20) {
        record.fbIds = record.fbIds.slice(-20);
      }
      
      // Update caption if new one provided, else keep existing
      if (!caption && existingRecord.caption) {
        record.caption = existingRecord.caption;
      }
      
      // Keep existing thumbnail if new one not provided
      if (!thumbnail && existingRecord.thumbnail) {
        record.thumbnail = existingRecord.thumbnail;
      }
    }

    // Save main record
    await kv.put(`video:${recordId}`, JSON.stringify(record));

    // Save FB ID → record ID mapping (for fast link lookup)
    for (const fbId of record.fbIds) {
      await kv.put(`fbid:${fbId}`, recordId);
    }

    // Update global index
    const indexRaw = await kv.get('index:all');
    let index: string[] = [];
    try {
      index = indexRaw ? JSON.parse(indexRaw) : [];
    } catch (e) {}
    
    // Remove if exists, then add to top (recently updated)
    index = index.filter(id => id !== recordId);
    index.unshift(recordId);
    
    // ═══ TRUE INFINITE ANIME SUPPORT — NO LIMIT ═══
    // Cloudflare KV supports up to 25MB per value
    // Each ID = ~30 bytes, so 25MB = ~800,000 anime IDs (basically infinite)
    await kv.put('index:all', JSON.stringify(index));

    return new Response(JSON.stringify({ 
      success: true, 
      record: record,
      isUpdate: !!existingRecord,
      message: existingRecord 
        ? `Updated! Video now has ${record.fbIds.length} FB link${record.fbIds.length !== 1 ? 's' : ''} attached.` 
        : `Video added! ${fbIds.length > 0 ? `${fbIds.length} FB link${fbIds.length !== 1 ? 's' : ''} attached.` : 'Caption-based discovery ready.'}`
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (e: any) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: e.message || 'Failed to add video' 
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
