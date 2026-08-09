import type { APIRoute } from 'astro';

export const prerender = false;

type Platform = 'facebook' | 'youtube' | 'dailymotion' | 'bilibili' | 'internal' | 'unknown';

type ResolverResponse = {
  success: boolean;
  platform?: Platform;
  resolvedType?: 'anime' | 'video' | 'internal' | 'search';
  redirectUrl?: string;
  videoId?: string;
  slug?: string;
  episode?: number;
  confidence?: number;
  reason?: string;
  debug?: Record<string, unknown>;
};

function json(data: ResolverResponse, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  });
}

// ====================== MAIN HANDLER ======================
export const GET: APIRoute = async ({ request }) => {
  return handleResolver(request);
};

export const POST: APIRoute = async ({ request }) => {
  return handleResolver(request);
};

async function handleResolver(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const debugMode = url.searchParams.get('debug') === '1';
  const debug: Record<string, unknown> = {};

  const input = await readInput(request);
  if (!input) {
    return json({ success: false, reason: 'No URL provided' }, 400);
  }

  let inputUrl: URL;
  try {
    inputUrl = new URL(input.startsWith('http') ? input : 'https://' + input);
  } catch {
    return json({ success: false, reason: 'Invalid URL format' }, 400);
  }

  const platform = detectPlatform(inputUrl);
  debug.input = input;
  debug.platform = platform;

  // Internal link already valid
  if (platform === 'internal') {
    return json({
      success: true,
      platform,
      resolvedType: 'internal',
      redirectUrl: inputUrl.pathname + inputUrl.search,
      confidence: 1,
      ...(debugMode ? { debug } : {})
    });
  }

  // Direct video platforms (YouTube, DM, Bili)
  const direct = resolveDirectVideo(platform, inputUrl);
  if (direct) {
    return json({
      success: true,
      platform,
      resolvedType: 'video',
      redirectUrl: direct.redirectUrl,
      videoId: direct.videoId,
      confidence: 1,
      ...(debugMode ? { debug } : {})
    });
  }

  // =============== FACEBOOK SPECIAL LOGIC ===============
  if (platform === 'facebook') {
    const fbId = extractFacebookVideoId(inputUrl);
    debug.facebookId = fbId;

    if (fbId) {
      const match = await findInFacebookDataset(fbId, url.origin);
      if (match) {
        debug.usedDataset = true;
        return json({
          success: true,
          platform: 'facebook',
          resolvedType: 'anime',
          redirectUrl: match.watchUrl || `/reels/anime_${match.animeSlug}_ep${match.episode || 1}`,
          slug: match.animeSlug,
          episode: match.episode,
          confidence: match.confidence || 0.9,
          ...(debugMode ? { debug } : {})
        });
      }
    }
  }

  // Fallback: Heavy matching (old logic) jodi upore kichu na pay
  return json({
    success: false,
    platform,
    reason: 'Could not resolve to any anime. Try adding this link in your Facebook dataset.',
    debug: debugMode ? debug : undefined
  });
}

// ====================== HELPER FUNCTIONS ======================

async function readInput(request: Request): Promise<string> {
  const u = new URL(request.url);
  let q = u.searchParams.get('url') || u.searchParams.get('link') || u.searchParams.get('q') || '';

  if (q) return q.trim();

  if (request.method === 'POST') {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const body = await request.json();
        return (body.url || body.link || body.q || '').trim();
      } catch {}
    }
  }
  return '';
}

function detectPlatform(url: URL): Platform {
  const host = url.hostname.toLowerCase().replace('www.', '').replace('m.', '');
  const path = url.pathname.toLowerCase();

  if (host.includes('facebook.com') || host === 'fb.watch') return 'facebook';
  if (host === 'youtu.be' || host.includes('youtube.com')) return 'youtube';
  if (host.includes('dailymotion.com') || host === 'dai.ly') return 'dailymotion';
  if (host.includes('bilibili.com') || host === 'b23.tv') return 'bilibili';
  if (path.startsWith('/reels/') || path.startsWith('/watch/') || path.startsWith('/anime/')) return 'internal';

  return 'unknown';
}

function resolveDirectVideo(platform: Platform, url: URL) {
  if (platform === 'youtube') {
    const v = extractYouTubeVideoId(url);
    if (v) {
      return {
        videoId: v.includes('shorts') ? `yts_${v}` : `yt_${v}`,
        redirectUrl: v.includes('shorts') ? `/reels/yts_${v}` : `/reels/yt_${v}`
      };
    }
  }
  if (platform === 'dailymotion') {
    const id = extractDailymotionId(url);
    if (id) return { videoId: `dm_${id}`, redirectUrl: `/reels/dm_${id}` };
  }
  if (platform === 'bilibili') {
    const id = extractBilibiliId(url);
    if (id) return { videoId: `bili_${id}`, redirectUrl: `/reels/bili_${id}` };
  }
  return null;
}

// Facebook ID extractor (multiple formats)
function extractFacebookVideoId(url: URL): string {
  const path = url.pathname;
  const query = url.searchParams;

  let id = query.get('v') || query.get('video_id') || query.get('story_fbid') || '';

  if (!id) {
    const reelMatch = path.match(/\/reel\/(\d+)/i);
    if (reelMatch) id = reelMatch[1];

    const videoMatch = path.match(/\/videos\/(\d+)/i);
    if (videoMatch) id = videoMatch[1];

    const fbWatchMatch = path.match(/\/(\d{15,})/);
    if (fbWatchMatch) id = fbWatchMatch[1];
  }

  return id.replace(/[^0-9]/g, '');
}

async function findInFacebookDataset(fbId: string, origin: string) {
  try {
    const res = await fetch(new URL('/facebook-videos.json', origin).toString());
    const data = await res.json();

    const video = data.videos?.find((v: any) => v.id === fbId || v.id === String(fbId));

    if (video && video.animeSlug) {
      return {
        animeSlug: video.animeSlug,
        episode: video.episode || 1,
        watchUrl: video.watchUrl,
        confidence: 0.95
      };
    }
  } catch (e) {
    console.error('Failed to load facebook-videos.json', e);
  }
  return null;
}

function extractYouTubeVideoId(url: URL): string {
  if (url.hostname.includes('youtu.be')) return url.pathname.slice(1);
  return url.searchParams.get('v') || '';
}

function extractDailymotionId(url: URL): string {
  const parts = url.pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function extractBilibiliId(url: URL): string {
  const parts = url.pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}
