import type { APIRoute } from 'astro';

export const prerender = false;

type Platform =
  | 'facebook'
  | 'youtube'
  | 'dailymotion'
  | 'bilibili'
  | 'instagram'
  | 'tiktok'
  | 'internal'
  | 'unknown';

type MetaPayload = {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  htmlTitle: string;
  finalUrl: string;
  source: string;
  slug?: string;
  episode?: number | null;
  directRedirectUrl?: string;
};

type AnimeMatch = {
  slug: string;
  title: string;
  altTitle: string;
  url: string;
  score: number;
};

type CacheEntry = {
  expires: number;
  data: unknown;
};

const MEMORY_CACHE = new Map<string, CacheEntry>();

const GENERIC_TITLE_BLACKLIST = new Set([
  'facebook',
  'watch',
  'reel',
  'video',
  'videos',
  'fb.watch',
  'instagram',
  'tiktok',
  'youtube',
  'shorts',
  'dailymotion',
  'bilibili',
]);

const TITLE_NOISE_PATTERNS = [
  /\bfull\s*episode\b/gi,
  /\bepisode\s*\d+\b/gi,
  /\bep\s*\.?\s*\d+\b/gi,
  /\be\s*\.?\s*\d+\b/gi,
  /\bpart\s*\d+\b/gi,
  /\bclip\b/gi,
  /\bshort\b/gi,
  /\bshorts\b/gi,
  /\breel\b/gi,
  /\bviral\b/gi,
  /\bwatch\s+till\s+end\b/gi,
  /\bmust\s+watch\b/gi,
  /\beng(?:lish)?\s*sub\b/gi,
  /\bsubbed\b/gi,
  /\bdubbed\b/gi,
  /\bhindi\s*dub(?:bed)?\b/gi,
  /\bbangla\s*dub(?:bed)?\b/gi,
  /\burdu\s*dub(?:bed)?\b/gi,
  /\bindo(?:nesian)?\s*sub\b/gi,
  /\btagalog\s*sub\b/gi,
  /\bofficial\b/gi,
  /\bhd\b/gi,
  /\b4k\b/gi,
  /\b1080p\b/gi,
  /\b720p\b/gi,
  /\b60fps\b/gi,
  /\banime\s*edit\b/gi,
  /\bstatus\b/gi,
  /\bscene\b/gi,
  /\bmoment\b/gi,
  /\breaction\b/gi,
  /\btrailer\b/gi,
  /\bteaser\b/gi,
  /\bpromo\b/gi,
  /\bwatch\s+now\b/gi,
  /\bfacebook\b/gi,
  /\bmeta\b/gi,
];

const TOKEN_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'from',
  'with',
  'anime',
  'episode',
  'ep',
  'part',
  'clip',
  'short',
  'shorts',
  'reel',
  'video',
  'watch',
  'official',
  'sub',
  'subbed',
  'dub',
  'dubbed',
  'eng',
  'english',
  'hindi',
  'bangla',
  'urdu',
  'indo',
  'indonesian',
  'tagalog',
  'hd',
  'scene',
  'moment',
  'reaction',
  'viral',
  'status',
  'trailer',
  'teaser',
  'promo',
  'full',
  'facebook',
  'meta',
]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  });
}

export const GET: APIRoute = async ({ request }) => {
  return handleResolver(request);
};

export const POST: APIRoute = async ({ request }) => {
  return handleResolver(request);
};

async function handleResolver(request: Request) {
  const requestUrl = new URL(request.url);
  const debugMode = requestUrl.searchParams.get('debug') === '1';
  const debug: Record<string, unknown> = {};

  const rawInput = await readInput(request);
  if (!rawInput) {
    return json(
      {
        success: false,
        reason: 'Missing url parameter',
      },
      400
    );
  }

  let inputUrl: URL;
  try {
    inputUrl = new URL(rawInput);
  } catch {
    return json(
      {
        success: false,
        reason: 'Invalid URL',
        input: rawInput,
      },
      400
    );
  }

  const origin = requestUrl.origin;
  const platform = detectPlatform(inputUrl);

  debug.input = rawInput;
  debug.platform = platform;

  if (platform === 'internal') {
    const internalRedirect = resolveInternalRedirect(inputUrl);
    if (internalRedirect) {
      return json({
        success: true,
        platform,
        resolvedType: 'internal',
        redirectUrl: internalRedirect,
        confidence: 1,
        ...(debugMode ? { debug } : {}),
      });
    }
  }

  const directVideo = resolveDirectVideo(platform, inputUrl);
  if (directVideo) {
    return json({
      success: true,
      platform,
      resolvedType: 'video',
      redirectUrl: directVideo.redirectUrl,
      videoId: directVideo.videoId,
      confidence: 1,
      ...(debugMode ? { debug } : {}),
    });
  }

  let metadata: MetaPayload | null = null;

  if (platform === 'facebook') {
    const fbDatasetMatch = await findFacebookDatasetMatch(origin, inputUrl, debugMode ? debug : null);
    if (fbDatasetMatch) {
      metadata = fbDatasetMatch;

      if (fbDatasetMatch.directRedirectUrl) {
        return json({
          success: true,
          platform,
          resolvedType: 'anime',
          title: fbDatasetMatch.title || '',
          episode: fbDatasetMatch.episode || 1,
          redirectUrl: fbDatasetMatch.directRedirectUrl,
          confidence: 0.98,
          source: fbDatasetMatch.source,
          ...(debugMode ? { debug } : {}),
        });
      }

      if (fbDatasetMatch.slug) {
        const episode = fbDatasetMatch.episode || 1;
        return json({
          success: true,
          platform,
          resolvedType: 'anime',
          title: fbDatasetMatch.title || '',
          slug: fbDatasetMatch.slug,
          episode,
          redirectUrl: buildAnimeRedirect(fbDatasetMatch.slug, episode),
          confidence: 0.97,
          source: fbDatasetMatch.source,
          ...(debugMode ? { debug } : {}),
        });
      }
    }
  }

  if (!metadata) {
    metadata = await fetchPageMetadata(inputUrl.toString(), debugMode ? debug : null);
  }

  if (!metadata) {
    return json({
      success: false,
      platform,
      reason: 'Could not fetch link metadata',
      ...(debugMode ? { debug } : {}),
    });
  }

  const titleCandidates = buildTitleCandidates(metadata, inputUrl);
  const episode = metadata.episode || extractEpisodeNumber(titleCandidates.join(' | ')) || 1;
  const queries = buildSearchQueries(titleCandidates);

  debug.metadata = metadata;
  debug.titleCandidates = titleCandidates;
  debug.queries = queries;
  debug.episode = episode;

  if (!queries.length) {
    return json({
      success: false,
      platform,
      reason: 'Could not extract a usable anime title from the link',
      ...(debugMode ? { debug } : {}),
    });
  }

  const bestMatch = await findBestAnimeMatch(origin, queries, titleCandidates.join(' | '), debugMode ? debug : null);

  if (!bestMatch) {
    return json({
      success: false,
      platform,
      reason: 'Could not confidently identify the anime',
      extractedTitle: titleCandidates[0] || '',
      ...(debugMode ? { debug } : {}),
    });
  }

  return json({
    success: true,
    platform,
    resolvedType: 'anime',
    title: bestMatch.title,
    slug: bestMatch.slug,
    episode,
    redirectUrl: buildAnimeRedirect(bestMatch.slug, episode),
    confidence: Number(bestMatch.score.toFixed(3)),
    source: metadata.source,
    ...(debugMode ? { debug } : {}),
  });
}

async function readInput(request: Request): Promise<string> {
  const requestUrl = new URL(request.url);
  const fromQuery =
    requestUrl.searchParams.get('url') ||
    requestUrl.searchParams.get('link') ||
    requestUrl.searchParams.get('q') ||
    '';

  if (fromQuery.trim()) {
    return fromQuery.trim();
  }

  if (request.method !== 'POST') {
    return '';
  }

  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      const body = await request.json();
      if (body && typeof body.url === 'string') {
        return body.url.trim();
      }
      if (body && typeof body.link === 'string') {
        return body.link.trim();
      }
      if (body && typeof body.q === 'string') {
        return body.q.trim();
      }
    } catch {
      return '';
    }
  }

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    try {
      const formData = await request.formData();
      const fromForm =
        formData.get('url') ||
        formData.get('link') ||
        formData.get('q');

      if (typeof fromForm === 'string') {
        return fromForm.trim();
      }
    } catch {
      return '';
    }
  }

  return '';
}

function detectPlatform(inputUrl: URL): Platform {
  const host = normalizeHost(inputUrl.hostname);
  const path = inputUrl.pathname.toLowerCase();

  if (host.includes('anime-streaming-buzz.pages.dev') || host.includes('anitubebuzz')) {
    return 'internal';
  }

  if (host === 'fb.watch' || host.endsWith('facebook.com')) {
    return 'facebook';
  }

  if (host === 'youtu.be' || host.endsWith('youtube.com')) {
    return 'youtube';
  }

  if (host === 'dai.ly' || host.endsWith('dailymotion.com')) {
    return 'dailymotion';
  }

  if (host === 'b23.tv' || host.endsWith('bilibili.com')) {
    return 'bilibili';
  }

  if (host.endsWith('instagram.com')) {
    return 'instagram';
  }

  if (host.endsWith('tiktok.com') || host === 'vm.tiktok.com') {
    return 'tiktok';
  }

  if (path.startsWith('/reels/') || path.startsWith('/watch/') || path.startsWith('/anime/')) {
    return 'internal';
  }

  return 'unknown';
}

function normalizeHost(hostname: string) {
  return hostname
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/^m\./, '')
    .replace(/^mbasic\./, '');
}

function resolveInternalRedirect(inputUrl: URL) {
  const path = `${inputUrl.pathname}${inputUrl.search}${inputUrl.hash}`;
  if (
    inputUrl.pathname.startsWith('/reels/') ||
    inputUrl.pathname.startsWith('/watch/') ||
    inputUrl.pathname.startsWith('/anime/') ||
    inputUrl.pathname.startsWith('/search')
  ) {
    return path;
  }
  return null;
}

function resolveDirectVideo(platform: Platform, inputUrl: URL) {
  if (platform === 'youtube') {
    const shortsId = extractYouTubeShortsId(inputUrl);
    if (shortsId) {
      return {
        videoId: `yts_${shortsId}`,
        redirectUrl: `/reels/yts_${shortsId}`,
      };
    }

    const videoId = extractYouTubeVideoId(inputUrl);
    if (videoId) {
      return {
        videoId: `yt_${videoId}`,
        redirectUrl: `/reels/yt_${videoId}`,
      };
    }
  }

  if (platform === 'dailymotion') {
    const videoId = extractDailymotionId(inputUrl);
    if (videoId) {
      return {
        videoId: `dm_${videoId}`,
        redirectUrl: `/reels/dm_${videoId}`,
      };
    }
  }

  if (platform === 'bilibili') {
    const videoId = extractBilibiliId(inputUrl);
    if (videoId) {
      return {
        videoId: `bili_${videoId}`,
        redirectUrl: `/reels/bili_${videoId}`,
      };
    }
  }

  return null;
}

function extractYouTubeVideoId(inputUrl: URL) {
  const host = normalizeHost(inputUrl.hostname);
  if (host === 'youtu.be') {
    const id = inputUrl.pathname.replace(/^\/+/, '').split('/')[0];
    return cleanId(id);
  }

  const id = inputUrl.searchParams.get('v') || '';
  return cleanId(id);
}

function extractYouTubeShortsId(inputUrl: URL) {
  const parts = inputUrl.pathname.split('/').filter(Boolean);
  if (parts[0] === 'shorts' && parts[1]) {
    return cleanId(parts[1]);
  }
  return '';
}

function extractDailymotionId(inputUrl: URL) {
  const host = normalizeHost(inputUrl.hostname);

  if (host === 'dai.ly') {
    const id = inputUrl.pathname.replace(/^\/+/, '').split('/')[0];
    return cleanId(id);
  }

  const parts = inputUrl.pathname.split('/').filter(Boolean);
  if (parts[0] === 'video' && parts[1]) {
    return cleanId(parts[1]);
  }

  return '';
}

function extractBilibiliId(inputUrl: URL) {
  const parts = inputUrl.pathname.split('/').filter(Boolean);
  if (!parts.length) {
    return '';
  }

  if (parts[0].toLowerCase() === 'video' && parts[1]) {
    return cleanId(parts[1]);
  }

  const first = parts[0];
  if (/^(BV|av)/i.test(first)) {
    return cleanId(first);
  }

  return '';
}

function extractFacebookVideoId(inputUrl: URL) {
  const host = normalizeHost(inputUrl.hostname);
  const path = inputUrl.pathname;

  const fromQuery =
    inputUrl.searchParams.get('v') ||
    inputUrl.searchParams.get('video_id') ||
    inputUrl.searchParams.get('story_fbid') ||
    '';

  if (fromQuery) {
    return cleanId(fromQuery);
  }

  if (host === 'fb.watch') {
    const first = path.split('/').filter(Boolean)[0] || '';
    return cleanId(first);
  }

  const reelMatch = path.match(/\/reel\/([^/?#]+)/i);
  if (reelMatch && reelMatch[1]) {
    return cleanId(reelMatch[1]);
  }

  const videosMatch = path.match(/\/videos\/([^/?#]+)/i);
  if (videosMatch && videosMatch[1]) {
    return cleanId(videosMatch[1]);
  }

  return '';
}

function cleanId(value: string) {
  return (value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
}

async function findFacebookDatasetMatch(
  origin: string,
  inputUrl: URL,
  debug: Record<string, unknown> | null
): Promise<MetaPayload | null> {
  const datasetUrl = new URL('/facebook-videos.json', origin).toString();
  const payload = await cachedJsonFetch(datasetUrl, 10 * 60 * 1000);

  if (!payload) {
    return null;
  }

  const entries = collectGenericRecords(payload);
  if (!entries.length) {
    return null;
  }

  const inputNormalized = normalizeComparableUrl(inputUrl.toString());
  const inputVideoId = extractFacebookVideoId(inputUrl);

  if (debug) {
    debug.facebookDatasetEntries = entries.length;
    debug.facebookInputVideoId = inputVideoId;
  }

  for (const entry of entries) {
    const candidateUrls = getPossibleUrlFields(entry);
    const directWatchUrl = getFirstString(entry, [
      'redirectUrl',
      'redirect_url',
      'watchUrl',
      'watch_url',
      'fullUrl',
      'full_url',
      'reelsUrl',
      'reels_url',
    ]);

    const slug = getFirstString(entry, [
      'slug',
      'animeSlug',
      'anime_slug',
      'seriesSlug',
      'series_slug',
    ]);

    const title = getFirstString(entry, [
      'title',
      'name',
      'animeTitle',
      'anime_title',
      'post_title',
      'caption',
      'text',
    ]);

    const description = getFirstString(entry, [
      'description',
      'caption',
      'text',
      'summary',
    ]);

    const episode = getFirstNumber(entry, [
      'episode',
      'episodeNumber',
      'episode_number',
      'ep',
    ]) || extractEpisodeNumber(`${title} ${description}`);

    let matched = false;

    for (const candidateUrl of candidateUrls) {
      const candidateNormalized = normalizeComparableUrl(candidateUrl);
      if (candidateNormalized && candidateNormalized === inputNormalized) {
        matched = true;
        break;
      }

      const candidateVideoId = safeExtractFacebookId(candidateUrl);
      if (inputVideoId && candidateVideoId && inputVideoId === candidateVideoId) {
        matched = true;
        break;
      }
    }

    if (!matched) {
      continue;
    }

    let directRedirectUrl = '';
    if (directWatchUrl) {
      try {
        const parsed = new URL(directWatchUrl, origin);
        if (
          parsed.pathname.startsWith('/reels/') ||
          parsed.pathname.startsWith('/watch/') ||
          parsed.pathname.startsWith('/anime/')
        ) {
          directRedirectUrl = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
      } catch {
        if (directWatchUrl.startsWith('/')) {
          directRedirectUrl = directWatchUrl;
        }
      }
    }

    return {
      title: title || '',
      description: description || '',
      ogTitle: '',
      ogDescription: '',
      htmlTitle: '',
      finalUrl: inputUrl.toString(),
      source: 'facebook-videos.json',
      slug: slug || undefined,
      episode: episode || null,
      directRedirectUrl: directRedirectUrl || undefined,
    };
  }

  return null;
}

function collectGenericRecords(input: unknown, depth = 0, acc: Record<string, unknown>[] = []) {
  if (!input || depth > 6) {
    return acc;
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      collectGenericRecords(item, depth + 1, acc);
    }
    return acc;
  }

  if (typeof input !== 'object') {
    return acc;
  }

  const obj = input as Record<string, unknown>;
  const keys = Object.keys(obj);

  const looksUseful = keys.some((key) =>
    [
      'url',
      'link',
      'video_url',
      'facebook_url',
      'facebookUrl',
      'permalink',
      'title',
      'name',
      'caption',
      'text',
      'slug',
      'anime_slug',
      'animeSlug',
      'watchUrl',
      'redirectUrl',
    ].includes(key)
  );

  if (looksUseful) {
    acc.push(obj);
  }

  for (const value of Object.values(obj)) {
    collectGenericRecords(value, depth + 1, acc);
  }

  return acc;
}

function getPossibleUrlFields(record: Record<string, unknown>) {
  const urls: string[] = [];

  const fields = [
    'url',
    'link',
    'video_url',
    'videoUrl',
    'facebook_url',
    'facebookUrl',
    'permalink',
    'source_url',
    'sourceUrl',
    'post_url',
    'postUrl',
  ];

  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value.trim()) {
      urls.push(value.trim());
    }
  }

  return dedupeStrings(urls);
}

function getFirstString(record: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function getFirstNumber(record: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const num = Number(value.trim());
      if (Number.isFinite(num)) {
        return num;
      }
    }
  }
  return 0;
}

function safeExtractFacebookId(rawUrl: string) {
  try {
    return extractFacebookVideoId(new URL(rawUrl));
  } catch {
    return '';
  }
}

function normalizeComparableUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    url.hash = '';

    const host = normalizeHost(url.hostname);
    url.hostname = host;

    const dropParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'utm_term',
      'fbclid',
      'mibextid',
      '__tn__',
      '_rdc',
      '_rdr',
      'locale',
      'refsrc',
      'rdid',
      'paipv',
      'sfnsn',
      'notif_id',
      'notif_t',
      'ref',
    ];

    for (const key of dropParams) {
      url.searchParams.delete(key);
    }

    if (host === 'fb.watch' || host.endsWith('facebook.com')) {
      const videoId = url.searchParams.get('v') || url.searchParams.get('video_id');
      url.search = '';
      if (videoId) {
        url.searchParams.set('v', videoId);
      }
    }

    if (host === 'youtu.be' || host.endsWith('youtube.com')) {
      const v = url.searchParams.get('v');
      const list = url.searchParams.get('list');
      const search = new URLSearchParams();
      if (v) {
        search.set('v', v);
      }
      if (list) {
        search.set('list', list);
      }
      const queryString = search.toString();
      url.search = queryString ? `?${queryString}` : '';
    }

    if (url.pathname !== '/') {
      url.pathname = url.pathname.replace(/\/+$/, '');
    }

    return url.toString();
  } catch {
    return rawUrl.trim();
  }
}

async function fetchPageMetadata(
  targetUrl: string,
  debug: Record<string, unknown> | null
): Promise<MetaPayload | null> {
  const html = await fetchText(targetUrl, 30 * 1000);
  if (!html) {
    return null;
  }

  const finalUrl = html.finalUrl || targetUrl;
  const body = html.text;

  const ogTitle = extractMetaContent(body, 'og:title');
  const ogDescription = extractMetaContent(body, 'og:description');
  const title = extractMetaContent(body, 'title');
  const description = extractMetaContent(body, 'description');
  const htmlTitle = extractTitleTag(body);

  if (debug) {
    debug.finalFetchedUrl = finalUrl;
    debug.ogTitle = ogTitle;
    debug.ogDescription = ogDescription;
    debug.metaTitle = title;
    debug.metaDescription = description;
    debug.htmlTitle = htmlTitle;
  }

  return {
    title: safeText(title),
    description: safeText(description),
    ogTitle: safeText(ogTitle),
    ogDescription: safeText(ogDescription),
    htmlTitle: safeText(htmlTitle),
    finalUrl,
    source: 'page-meta',
  };
}

async function fetchText(targetUrl: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36',
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
      },
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      clearTimeout(timer);
      return null;
    }

    const text = await response.text();
    clearTimeout(timer);

    return {
      text,
      finalUrl: response.url || targetUrl,
    };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

function extractMetaContent(html: string, key: string) {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escapeRegex(key)}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      'i'
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escapeRegex(key)}["'][^>]*>`,
      'i'
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return decodeHtmlEntities(match[1]);
    }
  }

  return '';
}

function extractTitleTag(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match || !match[1]) {
    return '';
  }
  return decodeHtmlEntities(stripTags(match[1]));
}

function buildTitleCandidates(metadata: MetaPayload, inputUrl: URL) {
  const rawCandidates = [
    metadata.title,
    metadata.ogTitle,
    metadata.htmlTitle,
    metadata.description,
    metadata.ogDescription,
  ];

  try {
    const finalUrl = new URL(metadata.finalUrl || inputUrl.toString());
    const pathHints = finalUrl.pathname
      .split('/')
      .filter(Boolean)
      .map((part) => part.replace(/[-_]+/g, ' '));
    rawCandidates.push(...pathHints);
  } catch {
    // ignore
  }

  const cleaned = rawCandidates
    .map((value) => sanitizeCandidate(value))
    .filter(Boolean)
    .filter((value) => !isGenericTitle(value));

  return dedupeStrings(cleaned).slice(0, 10);
}

function sanitizeCandidate(value: string) {
  if (!value) {
    return '';
  }

  let text = safeText(value);

  text = text.replace(/https?:\/\/\S+/gi, ' ');
  text = text.replace(/[#@][\p{L}\p{N}_-]+/gu, ' ');
  text = text.replace(/[\u{1F300}-\u{1FAFF}]/gu, ' ');
  text = text.replace(/[\u2600-\u27BF]/g, ' ');
  text = text.replace(/\[[^\]]*]/g, ' ');
  text = text.replace(/\([^\)]*\b(?:eng|sub|dub|clip|reel|watch|hd|4k|720p|1080p)\b[^\)]*\)/gi, ' ');
  text = text.replace(/\{[^}]*}/g, ' ');
  text = text.replace(/[|•·]/g, ' ');
  text = text.replace(/[–—]/g, '-');

  for (const pattern of TITLE_NOISE_PATTERNS) {
    text = text.replace(pattern, ' ');
  }

  text = text.replace(/\bseason\s*\d+\b/gi, ' ');
  text = text.replace(/\s+-\s+/g, ' ');
  text = text.replace(/\s*:\s*/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();

  if (text.length > 140) {
    text = text.slice(0, 140).trim();
  }

  return text;
}

function isGenericTitle(value: string) {
  const normalized = normalizeCompareText(value);
  if (!normalized) {
    return true;
  }
  if (GENERIC_TITLE_BLACKLIST.has(normalized)) {
    return true;
  }
  if (normalized.length < 2) {
    return true;
  }
  return false;
}

function extractEpisodeNumber(text: string) {
  if (!text) {
    return null;
  }

  const patterns = [
    /\bepisode\s*[:#-]?\s*(\d{1,4})\b/i,
    /\bep\s*[:#.-]?\s*(\d{1,4})\b/i,
    /\be\s*[:#.-]?\s*(\d{1,4})\b/i,
    /\bpart\s*[:#-]?\s*(\d{1,4})\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const num = Number(match[1]);
      if (num >= 1 && num <= 9999) {
        return num;
      }
    }
  }

  return null;
}

function buildSearchQueries(titleCandidates: string[]) {
  const queries: string[] = [];

  for (const value of titleCandidates) {
    const base = normalizeAnimeSearchText(value, false);
    const aggressive = normalizeAnimeSearchText(value, true);
    const noEpisode = removeEpisodeInfo(base);
    const noEpisodeAggressive = removeEpisodeInfo(aggressive);

    addQuery(queries, base);
    addQuery(queries, noEpisode);
    addQuery(queries, aggressive);
    addQuery(queries, noEpisodeAggressive);

    const parts = value
      .split(/[-|:]/)
      .map((part) => normalizeAnimeSearchText(part, true))
      .filter(Boolean);

    for (const part of parts) {
      addQuery(queries, removeEpisodeInfo(part));
    }
  }

  return dedupeStrings(queries)
    .filter((item) => item.length >= 2)
    .sort((a, b) => b.length - a.length)
    .slice(0, 6);
}

function addQuery(list: string[], value: string) {
  const cleaned = (value || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return;
  }
  if (cleaned.length < 2) {
    return;
  }
  list.push(cleaned);
}

function normalizeAnimeSearchText(value: string, aggressive: boolean) {
  let text = safeText(value);

  text = text.replace(/[#@][\p{L}\p{N}_-]+/gu, ' ');
  text = text.replace(/https?:\/\/\S+/gi, ' ');
  text = text.replace(/["'`“”‘’]/g, ' ');
  text = text.replace(/[|•·]/g, ' ');
  text = text.replace(/[–—]/g, ' ');
  text = text.replace(/\s+/g, ' ');

  if (aggressive) {
    for (const pattern of TITLE_NOISE_PATTERNS) {
      text = text.replace(pattern, ' ');
    }
    text = text.replace(/\bseason\s*\d+\b/gi, ' ');
    text = text.replace(/\bcomplete\b/gi, ' ');
    text = text.replace(/\bnew\b/gi, ' ');
    text = text.replace(/\blatest\b/gi, ' ');
    text = text.replace(/\bepisode\b/gi, ' ');
    text = text.replace(/\bep\b/gi, ' ');
  }

  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

function removeEpisodeInfo(value: string) {
  let text = value;
  text = text.replace(/\bepisode\s*[:#-]?\s*\d{1,4}\b/gi, ' ');
  text = text.replace(/\bep\s*[:#.-]?\s*\d{1,4}\b/gi, ' ');
  text = text.replace(/\be\s*[:#.-]?\s*\d{1,4}\b/gi, ' ');
  text = text.replace(/\bpart\s*[:#-]?\s*\d{1,4}\b/gi, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

async function findBestAnimeMatch(
  origin: string,
  queries: string[],
  sourceText: string,
  debug: Record<string, unknown> | null
): Promise<AnimeMatch | null> {
  let best: AnimeMatch | null = null;
  const searchDebug: Record<string, unknown>[] = [];

  for (const query of queries) {
    const results = await searchAnimeCandidates(origin, query);
    const scored = results
      .map((item) => ({
        ...item,
        score: scoreAnimeCandidate(query, sourceText, item),
      }))
      .sort((a, b) => b.score - a.score);

    if (debug) {
      searchDebug.push({
        query,
        top: scored.slice(0, 3),
      });
    }

    if (!scored.length) {
      continue;
    }

    const first = scored[0];
    const second = scored[1];

    if (!best || first.score > best.score) {
      best = first;
    }

    if (first.score >= 0.9) {
      break;
    }

    if (first.score >= 0.64 && (!second || first.score - second.score >= 0.08)) {
      break;
    }
  }

  if (debug) {
    debug.searchAttempts = searchDebug;
  }

  if (!best) {
    return null;
  }

  if (best.score >= 0.5) {
    return best;
  }

  return null;
}

async function searchAnimeCandidates(origin: string, query: string) {
  const cachedKey = `anime-search:${query.toLowerCase()}`;
  const cached = getCache(cachedKey);
  if (cached && Array.isArray(cached)) {
    return cached as AnimeMatch[];
  }

  const actions = ['find', 'search'];
  const all: AnimeMatch[] = [];

  for (const action of actions) {
    const endpoint = new URL('/api/anime-external', origin);
    endpoint.searchParams.set('action', action);
    endpoint.searchParams.set('q', query);

    const payload = await cachedJsonFetch(endpoint.toString(), 5 * 60 * 1000);
    const items = normalizeAnimePayload(payload);
    if (items.length) {
      all.push(...items);
    }

    if (all.length >= 8) {
      break;
    }
  }

  const unique = dedupeAnimeMatches(all).slice(0, 12);
  setCache(cachedKey, unique, 5 * 60 * 1000);
  return unique;
}

function normalizeAnimePayload(payload: unknown) {
  const rawItems = collectAnimeItems(payload);
  const normalized: AnimeMatch[] = [];

  for (const item of rawItems) {
    const slug = extractAnimeSlug(item);
    const title = extractAnimeTitle(item);
    const altTitle = extractAnimeAltTitle(item);
    const url = extractAnimeUrl(item);

    if (!slug || !title) {
      continue;
    }

    normalized.push({
      slug,
      title,
      altTitle,
      url,
      score: 0,
    });
  }

  return dedupeAnimeMatches(normalized);
}

function collectAnimeItems(input: unknown, depth = 0, acc: Record<string, unknown>[] = []) {
  if (!input || depth > 6) {
    return acc;
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      collectAnimeItems(item, depth + 1, acc);
    }
    return acc;
  }

  if (typeof input !== 'object') {
    return acc;
  }

  const obj = input as Record<string, unknown>;
  const slug = extractAnimeSlug(obj);
  const title = extractAnimeTitle(obj);

  if (slug || title) {
    acc.push(obj);
  }

  const commonKeys = [
    'data',
    'results',
    'items',
    'anime',
    'animes',
    'list',
    'matches',
    'result',
  ];

  for (const key of commonKeys) {
    if (key in obj) {
      collectAnimeItems(obj[key], depth + 1, acc);
    }
  }

  return acc;
}

function extractAnimeSlug(record: Record<string, unknown>) {
  const direct = getFirstString(record, [
    'slug',
    'animeSlug',
    'anime_slug',
    'seriesSlug',
    'series_slug',
  ]);

  if (direct) {
    return direct;
  }

  const url = extractAnimeUrl(record);
  if (!url) {
    return '';
  }

  try {
    const parsed = new URL(url, 'https://dummy.local');
    const parts = parsed.pathname.split('/').filter(Boolean);

    if (!parts.length) {
      return '';
    }

    if (parts[0] === 'anime' && parts[1]) {
      return parts[1];
    }

    if (parts[0] === 'reels' && parts[1]) {
      const match = parts[1].match(/^anime_(.+?)_ep\d+$/i);
      if (match && match[1]) {
        return match[1];
      }
    }

    return parts[parts.length - 1] || '';
  } catch {
    return '';
  }
}

function extractAnimeTitle(record: Record<string, unknown>) {
  return getFirstString(record, [
    'title',
    'name',
    'animeTitle',
    'anime_title',
    'post_title',
    'label',
  ]);
}

function extractAnimeAltTitle(record: Record<string, unknown>) {
  return getFirstString(record, [
    'altTitle',
    'alt_title',
    'englishTitle',
    'english_title',
    'japaneseTitle',
    'japanese_title',
    'romaji',
  ]);
}

function extractAnimeUrl(record: Record<string, unknown>) {
  return getFirstString(record, [
    'url',
    'link',
    'permalink',
    'watchUrl',
    'watch_url',
    'redirectUrl',
    'redirect_url',
  ]);
}

function scoreAnimeCandidate(query: string, sourceText: string, item: AnimeMatch) {
  const queryNorm = normalizeCompareText(removeEpisodeInfo(query));
  const titleNorm = normalizeCompareText(item.title);
  const altNorm = normalizeCompareText(item.altTitle);
  const sourceNorm = normalizeCompareText(sourceText);

  const primaryScore = titleSimilarity(queryNorm, titleNorm);
  const altScore = altNorm ? titleSimilarity(queryNorm, altNorm) : 0;
  let score = Math.max(primaryScore, altScore);

  if (sourceNorm && titleNorm && sourceNorm.includes(titleNorm)) {
    score += 0.08;
  }

  if (sourceNorm && altNorm && sourceNorm.includes(altNorm)) {
    score += 0.05;
  }

  if (titleNorm && queryNorm && titleNorm.startsWith(queryNorm)) {
    score += 0.05;
  }

  return Math.min(1, score);
}

function titleSimilarity(a: string, b: string) {
  if (!a || !b) {
    return 0;
  }

  if (a === b) {
    return 1;
  }

  if (a.includes(b) || b.includes(a)) {
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    return 0.82 + ratio * 0.12;
  }

  const aTokens = tokenize(a);
  const bTokens = tokenize(b);

  if (!aTokens.length || !bTokens.length) {
    return 0;
  }

  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);

  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) {
      intersection += 1;
    }
  }

  const overlap = intersection / Math.max(1, aSet.size);
  const union = new Set([...aSet, ...bSet]).size;
  const jaccard = intersection / Math.max(1, union);

  return overlap * 0.7 + jaccard * 0.3;
}

function tokenize(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !TOKEN_STOPWORDS.has(part))
    .filter((part) => !/^\d+$/.test(part));
}

function normalizeCompareText(value: string) {
  return safeText(value)
    .toLowerCase()
    .replace(/['"`“”‘’]/g, '')
    .replace(/[^a-z0-9\u00C0-\u024F\u3040-\u30FF\u3400-\u9FFF\s-]/gi, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildAnimeRedirect(slug: string, episode: number) {
  const safeEpisode = Number.isFinite(episode) && episode > 0 ? Math.floor(episode) : 1;
  return `/reels/anime_${slug}_ep${safeEpisode}`;
}

async function cachedJsonFetch(url: string, ttlMs: number) {
  const cached = getCache(url);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    setCache(url, data, ttlMs);
    return data;
  } catch {
    return null;
  }
}

function getCache(key: string) {
  const hit = MEMORY_CACHE.get(key);
  if (!hit) {
    return null;
  }
  if (Date.now() > hit.expires) {
    MEMORY_CACHE.delete(key);
    return null;
  }
  return hit.data;
}

function setCache(key: string, data: unknown, ttlMs: number) {
  MEMORY_CACHE.set(key, {
    data,
    expires: Date.now() + ttlMs,
  });
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    out.push(normalized);
  }

  return out;
}

function dedupeAnimeMatches(values: AnimeMatch[]) {
  const map = new Map<string, AnimeMatch>();

  for (const value of values) {
    const key = value.slug || value.title.toLowerCase();
    const existing = map.get(key);

    if (!existing || value.score > existing.score) {
      map.set(key, value);
    }
  }

  return Array.from(map.values());
}

function safeText(value: string) {
  return decodeHtmlEntities(stripTags(value || '')).replace(/\s+/g, ' ').trim();
}

function stripTags(value: string) {
  return (value || '').replace(/<[^>]*>/g, ' ');
}

function decodeHtmlEntities(value: string) {
  if (!value) {
    return '';
  }

  const named: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
  };

  let text = value.replace(
    /&(amp|lt|gt|quot|#39|apos|nbsp);/g,
    (match) => named[match] || match
  );

  text = text.replace(/&#(\d+);/g, (_, num) => {
    const code = Number(num);
    if (!Number.isFinite(code)) {
      return _;
    }
    try {
      return String.fromCharCode(code);
    } catch {
      return _;
    }
  });

  text = text.replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
    const code = parseInt(hex, 16);
    if (!Number.isFinite(code)) {
      return _;
    }
    try {
      return String.fromCharCode(code);
    } catch {
      return _;
    }
  });

  return text;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
