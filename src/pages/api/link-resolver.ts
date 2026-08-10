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

function extractYouTube(url: string): string | null {
  try {
    const u = url.trim();
    let m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    return null;
  } catch (e) { return null; }
}

function extractDailymotion(url: string): string | null {
  try {
    const u = url.trim();
    let m = u.match(/dailymotion\.com\/(?:video|embed\/video)\/([a-zA-Z0-9]+)/);
    if (m) return m[1];
    m = u.match(/dai\.ly\/([a-zA-Z0-9]+)/);
    if (m) return m[1];
    return null;
  } catch (e) { return null; }
}

function extractBilibili(url: string): string | null {
  try {
    const u = url.trim();
    let m = u.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/);
    if (m) return m[1];
    return null;
  } catch (e) { return null; }
}

export async function GET({ url, locals }: any) {
  try {
    const env = (locals as any)?.runtime?.env || {};
    const kv = env.ANIME_DB;
    const inputUrl = (url.searchParams.get('url') || '').trim();

    if (!inputUrl) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'URL required' 
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // ═══ PRIORITY 1: Facebook link → KV lookup ═══
    if (/facebook\.com|fb\.watch/i.test(inputUrl)) {
      const fbId = extractFbId(inputUrl);
      if (fbId && kv) {
        const recordId = await kv.get(`fbid:${fbId}`);
        if (recordId) {
          const raw = await kv.get(`video:${recordId}`);
          if (raw) {
            const record = JSON.parse(raw);
            return new Response(JSON.stringify({ 
              success: true, 
              source: 'kv-database',
              title: record.animeTitle,
              redirectUrl: '/reels/anime_' + encodeURIComponent(record.animeSlug) + '_ep' + record.episode
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
        }
      }
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'This Facebook video is not in our database yet' 
      }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    // ═══ PRIORITY 2: YouTube ═══
    const ytId = extractYouTube(inputUrl);
    if (ytId) {
      const isShort = /shorts/i.test(inputUrl);
      return new Response(JSON.stringify({ 
        success: true, 
        source: 'youtube',
        title: 'YouTube Video',
        redirectUrl: '/reels/' + (isShort ? 'yts_' : 'yt_') + ytId
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // ═══ PRIORITY 3: Dailymotion ═══
    const dmId = extractDailymotion(inputUrl);
    if (dmId) {
      return new Response(JSON.stringify({ 
        success: true, 
        source: 'dailymotion',
        title: 'Dailymotion Video',
        redirectUrl: '/reels/dm_' + dmId
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // ═══ PRIORITY 4: Bilibili ═══
    const biliId = extractBilibili(inputUrl);
    if (biliId) {
      return new Response(JSON.stringify({ 
        success: true, 
        source: 'bilibili',
        title: 'Bilibili Video',
        redirectUrl: '/reels/bili_' + biliId
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Unsupported URL format' 
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  } catch (e: any) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: e.message || 'Resolution failed' 
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
