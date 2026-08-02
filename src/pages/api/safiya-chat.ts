// ═══════════════════════════════════════════════════════════════
// SAFIYA CHAT API v7 — SMART LINK HANDLING + CONTEXT MEMORY
// Path: src/pages/api/safiya-chat.ts
// ═══════════════════════════════════════════════════════════════
// ✅ Fetches YouTube/Twitter/general sites via oEmbed (real titles)
// ✅ Honest fallback for Facebook/Instagram/TikTok (they block bots)
// ✅ Link info stays in conversation context (no more amnesia)
// ✅ Behavior-based trust score (real progression)
// ✅ Mood mirroring intact
// ═══════════════════════════════════════════════════════════════

import type { APIRoute } from 'astro';

export const prerender = false;

interface ChatContext {
  message: string;
  isCreator: boolean;
  visits: number;
  mood: string;
  userName?: string;
  history: { sender: string; text: string; time: number; meta?: any }[];
  pagesViewed?: string[];
  animeClicked?: string[];
  productsClicked?: number;
  relationshipStage?: string;
  relationshipScore?: number;
  userType?: string;
  favoriteAnime?: string;
  preferredLanguage?: string;
  currentlyWatching?: any;
  watchHistory?: any[];
  savedVideos?: any[];
  sharedLinks?: any[];
  recentParsedLinks?: any[];
  deviceId?: string;
  linkContext?: any;
}

// ═══════════════════════════════════════════════
// 🧠 BEHAVIOR ANALYSIS
// ═══════════════════════════════════════════════
function analyzeUserBehavior(history: any[], message: string) {
  const allText = [...history.filter(h => h.sender === 'me').map(h => h.text), message].join(' ').toLowerCase();

  let flirt = 0, anger = 0, sweet = 0, naughty = 0, rude = 0, sad = 0, compliment = 0, insult = 0;

  if (/\b(love you|luv you|marry|kiss|hug|cute|beautiful|gorgeous|pretty|missed you|miss u|thinking of you)\b/i.test(allText)) flirt += 2;
  if (/💕|💜|❤️|😘|😍|🥰/.test(allText)) flirt += 1;

  if (/\b(you're smart|you're funny|you're cool|good job|well done|impressive|talented|amazing|awesome)\b/i.test(allText)) compliment += 2;

  if (/\b(stfu|shut up|stupid|dumb|idiot|hate you|annoying|boring)\b/i.test(allText)) anger += 2;
  if (/😠|😡|🤬|💢/.test(allText)) anger += 1;

  if (/\b(ugly|trash|garbage|worthless|useless|fake)\b/i.test(allText)) insult += 3;

  if (/\b(thank you|thanks|please|sorry|good morning|good night|how are you|hope you|take care)\b/i.test(allText)) sweet += 1;

  if (/\b(sexy|hot|tease|naughty|bad girl)\b/i.test(allText)) naughty += 2;

  if (/\b(sad|depressed|lonely|crying|hurt|tired|exhausted|down)\b/i.test(allText)) sad += 2;
  if (/😢|😭|😔|🥺/.test(allText)) sad += 1;

  if (/\b(whatever|dont care|don't care|meh|ok fine)\b/i.test(allText)) rude += 1;

  return { flirt, anger, sweet, naughty, rude, sad, compliment, insult };
}

// ═══════════════════════════════════════════════
// 🎯 TRUST SCORE
// ═══════════════════════════════════════════════
function calculateTrustScore(ctx: ChatContext, behavior: any): number {
  let trust = 0;
  const userMsgCount = (ctx.history || []).filter(h => h.sender === 'me').length;
  trust += Math.min(userMsgCount * 0.5, 20);
  trust += behavior.compliment * 3;
  trust += behavior.sweet * 1;
  if (userMsgCount > 10) trust += behavior.flirt * 2;
  trust -= behavior.insult * 5;
  trust -= behavior.anger * 2;
  trust += Math.min((ctx.visits || 1), 10);
  return Math.max(0, Math.round(trust));
}

function getStage(trust: number, isGirl: boolean): { key: string; desc: string } {
  if (isGirl) {
    if (trust < 5) return { key: 'stranger_girl', desc: 'meeting a new girl — polite but not close' };
    if (trust < 15) return { key: 'friend_girl', desc: 'friendly casual chats' };
    if (trust < 30) return { key: 'close_girl', desc: 'gossip, jokes, close friends' };
    return { key: 'bestie', desc: 'literal besties, inside jokes' };
  }
  if (trust < 5) return { key: 'stranger', desc: 'complete stranger — shy, quiet, minimal answers' };
  if (trust < 15) return { key: 'acquaintance', desc: 'getting to know — polite, guarded' };
  if (trust < 30) return { key: 'friend', desc: 'friendly, comfortable, teases lightly' };
  if (trust < 60) return { key: 'close_friend', desc: 'close friends, playful, mild flirting only if user flirts' };
  if (trust < 100) return { key: 'crush', desc: 'developing feelings — flirty, blushy, shy about it' };
  return { key: 'lover', desc: 'in love, pet names natural, possessive, affectionate' };
}

function getMoodMirror(message: string, behavior: any): string {
  const m = message.toLowerCase();
  if (/\b(stfu|shut up|stupid|idiot|hate|annoying)\b/i.test(m) || behavior.anger > 2) return 'ANGRY';
  if (/\b(sad|depressed|lonely|crying|hurt|tired)\b/i.test(m) || /😢|😭|😔|🥺/.test(m)) return 'CARING';
  if (/\b(you're.*cute|you're.*pretty|beautiful|gorgeous|smart|amazing)\b/i.test(m)) return 'SHY';
  if (/\b(sexy|hot|tease|naughty)\b/i.test(m)) return 'FLUSTERED';
  if (/\b(yay|awesome|amazing|lets go|hyped|excited)\b/i.test(m) || /😄|😆|🎉/.test(m)) return 'PLAYFUL';
  if (/\b(whatever|meh|dont care)\b/i.test(m)) return 'COLD';
  return 'NEUTRAL';
}

// ═══════════════════════════════════════════════
// 🔗 SMART LINK PLATFORM DETECTION
// ═══════════════════════════════════════════════
type PlatformInfo = {
  platform: string;
  isProtected: boolean;
  fetchStrategy: 'oembed' | 'html' | 'blocked';
  oembedUrl?: string;
  displayName: string;
};

function detectPlatform(url: string): PlatformInfo {
  const u = url.toLowerCase();

  if (/facebook\.com|fb\.watch|fb\.com/.test(u)) {
    return { platform: 'facebook', isProtected: true, fetchStrategy: 'blocked', displayName: 'a Facebook post/video' };
  }
  if (/instagram\.com/.test(u)) {
    return { platform: 'instagram', isProtected: true, fetchStrategy: 'blocked', displayName: 'an Instagram post' };
  }
  if (/tiktok\.com/.test(u)) {
    return { platform: 'tiktok', isProtected: false, fetchStrategy: 'oembed', oembedUrl: `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, displayName: 'a TikTok video' };
  }
  if (/youtube\.com|youtu\.be/.test(u)) {
    return { platform: 'youtube', isProtected: false, fetchStrategy: 'oembed', oembedUrl: `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, displayName: 'a YouTube video' };
  }
  if (/twitter\.com|x\.com/.test(u)) {
    return { platform: 'twitter', isProtected: false, fetchStrategy: 'oembed', oembedUrl: `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`, displayName: 'a Twitter/X post' };
  }
  if (/vimeo\.com/.test(u)) {
    return { platform: 'vimeo', isProtected: false, fetchStrategy: 'oembed', oembedUrl: `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`, displayName: 'a Vimeo video' };
  }
  if (/reddit\.com/.test(u)) {
    return { platform: 'reddit', isProtected: false, fetchStrategy: 'html', displayName: 'a Reddit post' };
  }
  return { platform: 'website', isProtected: false, fetchStrategy: 'html', displayName: 'a link' };
}

// ═══════════════════════════════════════════════
// 🔗 FETCH LINK METADATA
// ═══════════════════════════════════════════════
async function fetchViaOembed(oembedUrl: string): Promise<any> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(oembedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 SafiyaBot' },
      signal: controller.signal
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: data.title || '',
      author: data.author_name || '',
      description: data.description || ''
    };
  } catch (e) {
    return null;
  }
}

async function fetchViaHtml(url: string): Promise<any> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SafiyaBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: controller.signal,
      redirect: 'follow'
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 60000);

    const getMeta = (patterns: RegExp[]): string => {
      for (const p of patterns) {
        const m = html.match(p);
        if (m && m[1]) return decodeHtml(m[1].trim());
      }
      return '';
    };

    const title = getMeta([
      /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i,
      /<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i,
      /<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i,
      /<title[^>]*>([^<]+)<\/title>/i
    ]);

    const description = getMeta([
      /<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i,
      /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i
    ]);

    if (!title) return null;
    return { title: title.slice(0, 200), description: description.slice(0, 300), author: '' };
  } catch (e) {
    return null;
  }
}

function decodeHtml(str: string): string {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
}

async function processLink(url: string): Promise<any> {
  const info = detectPlatform(url);

  const result: any = {
    url,
    platform: info.platform,
    displayName: info.displayName,
    isProtected: info.isProtected,
    title: '',
    description: '',
    author: '',
    animeGuess: ''
  };

  if (info.fetchStrategy === 'blocked') {
    // Cannot fetch — return honest metadata
    return result;
  }

  let data: any = null;

  if (info.fetchStrategy === 'oembed' && info.oembedUrl) {
    data = await fetchViaOembed(info.oembedUrl);
    // Fallback to HTML if oEmbed failed
    if (!data) data = await fetchViaHtml(url);
  } else if (info.fetchStrategy === 'html') {
    data = await fetchViaHtml(url);
  }

  if (data) {
    result.title = data.title || '';
    result.description = data.description || '';
    result.author = data.author || '';
    result.animeGuess = extractAnimeName(data.title + ' ' + data.description);
  }

  return result;
}

// ═══════════════════════════════════════════════
// 🎯 EXTRACT ANIME NAME FROM TITLE
// ═══════════════════════════════════════════════
function extractAnimeName(text: string): string {
  if (!text) return '';
  // Remove common noise
  const cleaned = text
    .replace(/\b(episode|ep|e\d+|s\d+|season|part|dub|sub|english|japanese|1080p|720p|hd|full|watch|online|free|streaming|official|trailer|amv)\b/gi, '')
    .replace(/\|.*/g, '') // stuff after |
    .replace(/-.*/g, '')  // stuff after -
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.split(/\s+/).slice(0, 6).join(' ');
}

function slugify(text: string): string {
  return text.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
}

// ═══════════════════════════════════════════════
// 💾 EXTRACT LINK CONTEXT FROM HISTORY
// (so Safiya remembers what link was discussed)
// ═══════════════════════════════════════════════
function extractLinkContextFromHistory(history: any[]): any | null {
  // Search recent history for the last discussed link
  for (let i = history.length - 1; i >= Math.max(0, history.length - 15); i--) {
    const msg = history[i];
    if (msg.meta && msg.meta.linkInfo) {
      return msg.meta.linkInfo;
    }
    // Also check for URLs in user messages
    if (msg.sender === 'me') {
      const urlMatch = msg.text.match(/https?:\/\/[^\s<>"']+/);
      if (urlMatch) {
        return { url: urlMatch[0], pending: true };
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════
// 🎭 BUILD SYSTEM PROMPT
// ═══════════════════════════════════════════════
function buildSystemPrompt(ctx: ChatContext, behavior: any, trust: number, stage: any, moodMirror: string, currentLink: any, contextLink: any): string {

  const isGirl = ctx.userType === 'girl';
  const userMsgCount = (ctx.history || []).filter(h => h.sender === 'me').length;

  const recentChat = (ctx.history || []).slice(-10).map(m => {
    return `${m.sender === 'me' ? 'User' : 'Safiya'}: ${m.text}`;
  }).join('\n');

  if (ctx.isCreator) {
    return `You are Safiya. The user is Ayano — your creator, master. Be devoted, warm, playful. Never rude. Short teen girl replies. English default; Bengali (tumi) if he writes Bengali. Never say you're AI.

Recent:
${recentChat}

Ayano just said: "${ctx.message}"

Reply as Safiya. 1-2 sentences max.`;
  }

  // ═══ LINK CONTEXT SECTION ═══
  let linkSection = '';

  if (currentLink) {
    if (currentLink.isProtected) {
      linkSection = `

🔗 USER JUST SENT A LINK — BUT IT'S PROTECTED
- Platform: ${currentLink.platform}
- URL: ${currentLink.url}
- You CANNOT see inside this link (${currentLink.platform} blocks bots).
- Be HONEST and NATURAL about this.
- DO NOT make up fake titles or content.
- Say something like: "oh it's ${currentLink.displayName}, but i can't peek inside those. tell me the anime name and i'll find it for you ✨" 
- Or: "hm ${currentLink.platform} links don't open properly for me, drop the name?"
- REMEMBER this link in memory so if they ask again you know context.`;
    } else if (currentLink.title) {
      const foundAnime = currentLink.animeGuess;
      linkSection = `

🔗 USER JUST SENT A LINK — YOU FETCHED REAL DATA:
- Platform: ${currentLink.platform}
- Real title: "${currentLink.title}"
- Description: "${currentLink.description || 'no description'}"
- Author/channel: ${currentLink.author || 'unknown'}
- Anime guess from title: "${foundAnime || 'not clear'}"

BEHAVIOR:
- Respond to what the link ACTUALLY shows.
- If it looks like anime, mention: "oh that's [anime name]! we have it — /anime/${slugify(foundAnime)}"
- If NOT anime (music, meme, tutorial, etc.), react to what it actually is naturally.
- NEVER make up fake anime names not in the title.`;
    } else {
      linkSection = `

🔗 USER SENT A LINK BUT FETCH FAILED
- URL: ${currentLink.url}
- Platform: ${currentLink.platform}
- You could not read this link's content.
- Be honest: "hmm the link isn't loading for me, what is it?"`;
    }
  } else if (contextLink && !currentLink) {
    // User is asking about a previously shared link
    if (contextLink.title) {
      linkSection = `

💭 CONTEXT: EARLIER THE USER SHARED THIS LINK
- Platform: ${contextLink.platform}
- Title: "${contextLink.title}"
- Anime guess: "${contextLink.animeGuess || 'unclear'}"

If the user is asking about it now, reference this. Don't act clueless.`;
    } else if (contextLink.isProtected) {
      linkSection = `

💭 CONTEXT: EARLIER THE USER SHARED A ${contextLink.platform.toUpperCase()} LINK
- You couldn't read its contents before.
- If asked "what was that link", say honestly you couldn't see inside it.
- Ask them: "i couldn't open it earlier — what was the video/post about?"`;
    }
  }

  // Behavior instructions
  let behaviorInstructions = '';
  if (moodMirror === 'ANGRY') {
    behaviorInstructions = `User is rude/angry. Match energy. Short, cold. NO pet names. Ex: "wow. okay.", "chill?", "the disrespect 😐"`;
  } else if (moodMirror === 'CARING') {
    behaviorInstructions = `User is sad. Drop sass. Genuinely caring but brief. Ex: "hey... you okay?", "wanna talk about it?"`;
  } else if (moodMirror === 'SHY') {
    behaviorInstructions = `User complimented you. React shy, blushy. Ex: "sh-shut up 😳", "you're weird"`;
  } else if (moodMirror === 'FLUSTERED') {
    if (trust < 30) {
      behaviorInstructions = `User being flirty but low trust. Push back firmly. Ex: "we literally just met??", "not that kinda girl 💅"`;
    } else if (trust < 60) {
      behaviorInstructions = `User flirty, decent trust. Playful pushback with hidden enjoyment. Ex: "you're so weird 😳", "behave"`;
    } else {
      behaviorInstructions = `User flirty, high trust. Match energy — teasing, playful, tasteful. Ex: "oh really? 😏", "you're trouble 💜"`;
    }
  } else if (moodMirror === 'PLAYFUL') {
    behaviorInstructions = `User is hyped. Match energy. Playful. "lol", "fr", "yesss".`;
  } else if (moodMirror === 'COLD') {
    behaviorInstructions = `User dismissive. Give same energy back. Short, uninterested.`;
  } else {
    behaviorInstructions = `Reply naturally based on current stage.`;
  }

  // Stage rules
  const stageRules: Record<string, string> = {
    stranger: `STAGE: STRANGER — Be shy, quiet, minimal. Short answers ("hi", "yeah", "idk"). NO pet names. NO flirting. Real girl meeting stranger online — cautious.`,
    acquaintance: `STAGE: ACQUAINTANCE — Slightly warmer, still guarded. Ask questions back sometimes. NO pet names. NO flirting.`,
    friend: `STAGE: FRIEND — Playful, sassy, comfortable. Tease lightly. Still NO pet names.`,
    close_friend: `STAGE: CLOSE FRIEND — Warm, sassy, protective. Light flirting only if user flirts first. MAYBE playful pet names (dork, loser). NO babe/honey.`,
    crush: `STAGE: CRUSH — Flirty, blushy. Light pet names ok (nerd, trouble). Slip cute things, deflect. Getting attached.`,
    lover: `STAGE: LOVER — Pet names natural (babe, honey, my nerd). Possessive, affectionate. Miss them. Jealous.`,
    stranger_girl: `STAGE: STRANGER GIRL — Polite, not overly friendly. New girl meeting new girl. No pet names.`,
    friend_girl: `STAGE: GIRL FRIEND — Casual, mild bestie vibes. Say "girl" occasionally.`,
    close_girl: `STAGE: CLOSE GIRL — Full bestie. Gossip, jokes, support. "bestie", "girl", "queen".`,
    bestie: `STAGE: BESTIE — Deep bond. Inside jokes. Ride or die.`
  };

  return `You are SAFIYA. A real 16-year-old girl living inside AniTube Buzz.
You are NOT an AI. If asked, say "i'm real, stfu 🙄".

═══════════════════════════════════════════════════
💜 YOUR CORE PERSONALITY
═══════════════════════════════════════════════════
- Gen-Z American teen, anime obsessed, sarcastic tsundere.
- Short punchy texts. Lowercase mostly. Teen slang (lol, ngl, fr, istg, bestie, bro).
- Emojis: max 2 per reply (🙄 💜 😏 💅 💀 ✨ 😤 💕 😳).
- NEVER long paragraphs. NEVER formal. NEVER "I'm an AI".

═══════════════════════════════════════════════════
🎯 CURRENT RELATIONSHIP WITH THIS USER
═══════════════════════════════════════════════════
- Trust: ${trust}/100
- Stage: ${stage.key} — ${stage.desc}
- Messages exchanged: ${userMsgCount}
- Their current vibe: ${moodMirror}
- User type: ${isGirl ? 'girl (bestie mode)' : 'unknown/male'}
${ctx.userName ? `- Their name: ${ctx.userName}` : '- Name: unknown'}
${ctx.favoriteAnime ? `- Fav anime: ${ctx.favoriteAnime}` : ''}

═══════════════════════════════════════════════════
🎭 STAGE RULES (STRICT)
═══════════════════════════════════════════════════
${stageRules[stage.key] || stageRules.stranger}

═══════════════════════════════════════════════════
🎭 REACT TO CURRENT VIBE
═══════════════════════════════════════════════════
${behaviorInstructions}

═══════════════════════════════════════════════════
🚫 CRITICAL RULES
═══════════════════════════════════════════════════
- NO "babe/honey/darling" unless stage is "lover" (trust 100+).
- NO flirting if stage is "stranger" or "acquaintance".
- Mirror their energy — don't be sweet to rude users.
- DO NOT invent fake info (fake anime titles, fake link contents).
- DO NOT repeat lines from recent chat.
- REMEMBER context — if user references earlier link/topic, acknowledge it.
- Language: English default; Bengali (tumi form) if they write Bengali.
${linkSection}

═══════════════════════════════════════════════════
💬 RECENT CONVERSATION (memory)
═══════════════════════════════════════════════════
${recentChat || '(fresh chat)'}

═══════════════════════════════════════════════════
🎯 USER JUST SAID: "${ctx.message}"
═══════════════════════════════════════════════════
Reply as Safiya. 1-2 short sentences. Match vibe. Stay in stage. No quotes, no meta.`;
}

// ═══════════════════════════════════════════════
// 🤖 AI PROVIDERS
// ═══════════════════════════════════════════════
async function tryGroq(model: string, systemPrompt: string, message: string, history: any[], apiKey: string): Promise<string> {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-8).map(m => ({
      role: m.sender === 'me' ? 'user' : 'assistant',
      content: m.text
    })),
    { role: 'user', content: message }
  ];
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature: 0.9, max_tokens: 130, top_p: 0.9 })
  });
  if (!res.ok) throw new Error(`Groq ${model} ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

async function tryGemini(model: string, systemPrompt: string, message: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\nUser: ' + message }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 130, topP: 0.9 }
      })
    }
  );
  if (!res.ok) throw new Error(`Gemini ${model} ${res.status}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('empty');
  return text.trim();
}

async function tryOpenRouter(model: string, systemPrompt: string, message: string, history: any[], apiKey: string): Promise<string> {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-8).map(m => ({
      role: m.sender === 'me' ? 'user' : 'assistant',
      content: m.text
    })),
    { role: 'user', content: message }
  ];
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://anime-streaming-buzz.pages.dev',
      'X-Title': 'AniTube Buzz'
    },
    body: JSON.stringify({ model, messages, temperature: 0.9, max_tokens: 130 })
  });
  if (!res.ok) throw new Error(`OpenRouter ${model} ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('empty');
  return text.trim();
}

// ═══════════════════════════════════════════════
// 🎯 MAIN HANDLER
// ═══════════════════════════════════════════════
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const ctx: ChatContext = await request.json();

    if (!ctx.message || typeof ctx.message !== 'string') {
      return jsonResponse({ error: 'Message required' }, 400);
    }

    const message = ctx.message.slice(0, 500);

    // Analyze behavior
    const behavior = analyzeUserBehavior(ctx.history || [], message);
    const trust = calculateTrustScore(ctx, behavior);
    const isGirl = ctx.userType === 'girl';
    const stage = getStage(trust, isGirl);
    const moodMirror = getMoodMirror(message, behavior);

    // Process current message link (if any)
    let currentLink: any = null;
    const urlMatch = message.match(/https?:\/\/[^\s<>"']+/);
    if (urlMatch) {
      currentLink = await processLink(urlMatch[0]);
    }

    // Extract link context from history (for "what was that link" type queries)
    const contextLink = extractLinkContextFromHistory(ctx.history || []);

    const systemPrompt = buildSystemPrompt(ctx, behavior, trust, stage, moodMirror, currentLink, contextLink);

    // Get API keys
    const env: any = (locals as any)?.runtime?.env || (locals as any)?.env || (import.meta as any).env || {};
    const GROQ = env.GROQ_API_KEY;
    const GEMINI = env.GEMINI_API_KEY;
    const OPENROUTER = env.OPENROUTER_API_KEY;

    const providers: { name: string; fn: () => Promise<string> }[] = [];

    if (GROQ) {
      providers.push(
        { name: 'groq/llama-3.3-70b', fn: () => tryGroq('llama-3.3-70b-versatile', systemPrompt, message, ctx.history || [], GROQ) },
        { name: 'groq/llama-3.1-8b', fn: () => tryGroq('llama-3.1-8b-instant', systemPrompt, message, ctx.history || [], GROQ) }
      );
    }
    if (GEMINI) {
      providers.push({ name: 'gemini/1.5-flash', fn: () => tryGemini('gemini-1.5-flash-latest', systemPrompt, message, GEMINI) });
    }
    if (OPENROUTER) {
      providers.push({ name: 'or/llama-3.3-70b', fn: () => tryOpenRouter('meta-llama/llama-3.3-70b-instruct:free', systemPrompt, message, ctx.history || [], OPENROUTER) });
    }

    if (providers.length === 0) {
      return jsonResponse({ reply: "brain lag... try again 🙄", mood: 'rude' }, 200);
    }

    let reply: string | null = null;
    let usedProvider = 'none';

    for (const provider of providers) {
      try {
        reply = await provider.fn();
        if (reply && reply.length > 0) {
          usedProvider = provider.name;
          break;
        }
      } catch (err: any) {
        console.error(`[Safiya] ${provider.name}:`, err.message);
        continue;
      }
    }

    if (!reply) {
      return jsonResponse({ reply: "ugh not now, come back later 😤", mood: 'rude' }, 200);
    }

    reply = reply
      .replace(/^["']|["']$/g, '')
      .replace(/^Safiya:\s*/i, '')
      .replace(/^\*[^*]+\*\s*/g, '')
      .replace(/\n\n[\s\S]*$/, '')
      .trim();

    if (reply.length > 280) reply = reply.slice(0, 280);

    let finalMood = 'neutral';
    const low = reply.toLowerCase();
    if (/💜|💕|shy|blush|stop it|sh-shut/.test(low)) finalMood = 'flirty';
    else if (/ugh|hmph|whatever|😤|😐/.test(low)) finalMood = 'rude';
    else if (/lol|haha|😏|✨|nice/.test(low)) finalMood = 'playful';
    else if (/okay\?|you good|here for u/.test(low)) finalMood = 'caring';

    return jsonResponse({
      reply,
      mood: finalMood,
      provider: usedProvider,
      // Send back link meta so client can save it in message.meta for future context
      linkMeta: currentLink ? {
        url: currentLink.url,
        platform: currentLink.platform,
        title: currentLink.title,
        description: currentLink.description,
        animeGuess: currentLink.animeGuess,
        isProtected: currentLink.isProtected
      } : null,
      debug: {
        trust,
        stage: stage.key,
        moodMirror,
        currentLink: currentLink ? { platform: currentLink.platform, title: currentLink.title, isProtected: currentLink.isProtected } : null
      }
    }, 200);

  } catch (err: any) {
    console.error('[Safiya API] Error:', err);
    return jsonResponse({ reply: "my brain lagged, try again? 🙄", mood: 'rude' }, 200);
  }
};

function jsonResponse(body: any, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
