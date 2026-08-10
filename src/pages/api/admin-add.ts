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

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!verifyToken(token, adminPassword)) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Unauthorized. Please login again.' 
      }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const body = await request.json();
    const fbLinks = Array.isArray(body.fbLinks) ? body.fbLinks : [body.fbLink].filter(Boolean);
    const animeTitle = (body.animeTitle || '').trim();
    const animeSlug = (body.animeSlug || slugify(animeTitle)).trim();
    const season = parseInt(body.season) || 1;
    const episode = parseInt(body.episode) || 1;
    const caption = (body.caption || '').trim();
    const keywords = (body.keywords || '').trim();
    const watchUrl = (body.watchUrl || '').trim();
    const thumbnail = (body.thumbnail || '').trim();

    if (!animeTitle) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Anime title is required' 
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (fbLinks.length === 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'At least one Facebook link required' 
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const fbIds: string[] = [];
    for (const link of fbLinks) {
      const id = extractFbId(link);
      if (id && !fbIds.includes(id)) fbIds.push(id);
    }

    if (fbIds.length === 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Could not extract Facebook ID from any link. Check the format.' 
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const recordId = `${animeSlug}_s${season}_ep${episode}`;

    const record = {
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
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await kv.put(`video:${recordId}`, JSON.stringify(record));

    for (const fbId of fbIds) {
      await kv.put(`fbid:${fbId}`, recordId);
    }

    const indexRaw = await kv.get('index:all');
    let index: string[] = [];
    try {
      index = indexRaw ? JSON.parse(indexRaw) : [];
    } catch (e) {}
    if (!index.includes(recordId)) {
      index.unshift(recordId);
      if (index.length > 500) index = index.slice(0, 500);
      await kv.put('index:all', JSON.stringify(index));
    } else {
      index = index.filter(id => id !== recordId);
      index.unshift(recordId);
      await kv.put('index:all', JSON.stringify(index));
    }

    return new Response(JSON.stringify({ 
      success: true, 
      record: record,
      message: 'Video added successfully!'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (e: any) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: e.message || 'Failed to add video' 
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
