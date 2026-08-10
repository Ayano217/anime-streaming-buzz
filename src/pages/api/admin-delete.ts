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
        error: 'Unauthorized' 
      }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const body = await request.json();
    const recordId = (body.id || '').trim();

    if (!recordId) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Record ID required' 
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Get record first to remove FB ID mappings
    const raw = await kv.get(`video:${recordId}`);
    if (raw) {
      try {
        const record = JSON.parse(raw);
        if (record.fbIds && Array.isArray(record.fbIds)) {
          for (const fbId of record.fbIds) {
            await kv.delete(`fbid:${fbId}`);
          }
        }
      } catch (e) {}
    }

    // Delete main record
    await kv.delete(`video:${recordId}`);

    // Update index
    const indexRaw = await kv.get('index:all');
    let index: string[] = [];
    try {
      index = indexRaw ? JSON.parse(indexRaw) : [];
    } catch (e) {}
    index = index.filter(id => id !== recordId);
    await kv.put('index:all', JSON.stringify(index));

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Video deleted successfully'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (e: any) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: e.message || 'Failed to delete video' 
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
