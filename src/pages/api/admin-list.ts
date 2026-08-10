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

export async function GET({ request, locals }: any) {
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

    const indexRaw = await kv.get('index:all');
    let index: string[] = [];
    try {
      index = indexRaw ? JSON.parse(indexRaw) : [];
    } catch (e) {}

    // Fetch all records in parallel
    const records = await Promise.all(
      index.slice(0, 100).map(async (id) => {
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
      total: videos.length
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (e: any) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: e.message || 'Failed to fetch videos' 
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
