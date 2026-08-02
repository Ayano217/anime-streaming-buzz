// ═══════════════════════════════════════════════════════════════
// SAFIYA CHAT API v6 — REAL GIRL BEHAVIOR + REAL LINK FETCHING
// Path: src/pages/api/safiya-chat.ts
// ═══════════════════════════════════════════════════════════════
// ✅ Trust score based on ACTUAL user behavior (not just visits)
// ✅ Mood mirroring (angry/happy/naughty/sad → she matches)
// ✅ NO premature "babe/honey" — must be earned
// ✅ Real link title fetching via server-side scrape
// ✅ Each user gets unique treatment
// ═══════════════════════════════════════════════════════════════

import type { APIRoute } from 'astro';

export const prerender = false;

interface ChatContext {
  message: string;
  isCreator: boolean;
  visits: number;
  mood: string;
  userName?: string;
  history: { sender: string; text: string; time: number }[];
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
}

// ═══════════════════════════════════════════════
// 🧠 BEHAVIOR ANALYSIS — read chat history and figure out user vibe
// ═══════════════════════════════════════════════
function analyzeUserBehavior(history: any[], message: string) {
  const allText = [...history.filter(h => h.sender === 'me').map(h => h.text), message].join(' ').toLowerCase();

  let flirtCount = 0;
  let angerCount = 0;
  let sweetCount = 0;
  let naughtyCount = 0;
  let rudeCount = 0;
  let sadCount = 0;
  let complimentCount = 0;
  let insultCount = 0;

  // Flirty signals
  if (/\b(love you|luv you|marry|kiss|hug|cute|beautiful|gorgeous|pretty|missed you|miss u|thinking of you)\b/i.test(allText)) flirtCount += 2;
  if (/💕|💜|❤️|😘|😍|🥰/.test(allText)) flirtCount += 1;

  // Compliments (build trust)
  if (/\b(you're smart|you're funny|you're cool|good job|well done|impressive|talented|amazing|awesome)\b/i.test(allText)) complimentCount += 2;

  // Angry / rude signals
  if (/\b(stfu|shut up|stupid|dumb|idiot|hate you|annoying|boring)\b/i.test(allText)) angerCount += 2;
  if (/😠|😡|🤬|💢/.test(allText)) angerCount += 1;

  // Insults (reduce trust)
  if (/\b(ugly|trash|garbage|worthless|useless|fake)\b/i.test(allText)) insultCount += 3;

  // Sweet signals
  if (/\b(thank you|thanks|please|sorry|good morning|good night|how are you|hope you|take care)\b/i.test(allText)) sweetCount += 1;

  // Naughty (but keep safe, teen-appropriate flirting only)
  if (/\b(sexy|hot|kiss|touch|tease|naughty|bad girl)\b/i.test(allText)) naughtyCount += 2;

  // Sad
  if (/\b(sad|depressed|lonely|crying|hurt|tired|exhausted|down)\b/i.test(allText)) sadCount += 2;
  if (/😢|😭|😔|🥺/.test(allText)) sadCount += 1;

  // Rude/dismissive
  if (/\b(whatever|dont care|don't care|meh|ok fine|k)\b/i.test(allText)) rudeCount += 1;

  return {
    flirt: flirtCount,
    anger: angerCount,
    sweet: sweetCount,
    naughty: naughtyCount,
    rude: rudeCount,
    sad: sadCount,
    compliment: complimentCount,
    insult: insultCount
  };
}

// ═══════════════════════════════════════════════
// 🎯 TRUE TRUST SCORE — based on REAL behavior, not just visits
// ═══════════════════════════════════════════════
function calculateTrustScore(ctx: ChatContext, behavior: any): number {
  let trust = 0;

  // Base: how many messages user has sent
  const userMsgCount = (ctx.history || []).filter(h => h.sender === 'me').length;
  trust += Math.min(userMsgCount * 0.5, 20); // max 20 from message count

  // Compliments build trust fast
  trust += behavior.compliment * 3;

  // Sweet talk builds slow trust
  trust += behavior.sweet * 1;

  // Flirting only counts AFTER 10+ messages (you have to know each other first)
  if (userMsgCount > 10) {
    trust += behavior.flirt * 2;
  }

  // Insults destroy trust
  trust -= behavior.insult * 5;
  trust -= behavior.anger * 2;

  // Visits give tiny boost (loyalty)
  trust += Math.min((ctx.visits || 1), 10);

  return Math.max(0, Math.round(trust));
}

// ═══════════════════════════════════════════════
// 🎭 GET STAGE BASED ON REAL TRUST
// ═══════════════════════════════════════════════
function getStage(trust: number, isGirl: boolean): { key: string; desc: string } {
  if (isGirl) {
    if (trust < 5) return { key: 'stranger_girl', desc: 'meeting a new girl — polite but not close' };
    if (trust < 15) return { key: 'friend_girl', desc: 'friendly with her — casual chats' };
    if (trust < 30) return { key: 'close_girl', desc: 'close friends now — gossip, jokes' };
    return { key: 'bestie', desc: 'literal besties — inside jokes, deep talk' };
  }

  if (trust < 5) return { key: 'stranger', desc: 'complete stranger — shy, quiet, minimal answers' };
  if (trust < 15) return { key: 'acquaintance', desc: 'getting to know him — polite, curious but guarded' };
  if (trust < 30) return { key: 'friend', desc: 'friendly — comfortable, shares opinions, teases lightly' };
  if (trust < 60) return { key: 'close_friend', desc: 'close friends — playful, sassy, warm, mild flirting allowed' };
  if (trust < 100) return { key: 'crush', desc: 'developing feelings — flirty, teasing, blushing, but shy about it' };
  return { key: 'lover', desc: 'in love — uses pet names naturally, possessive, deeply affectionate' };
}

// ═══════════════════════════════════════════════
// 🎭 GET MOOD MIRROR — react to user's current vibe
// ═══════════════════════════════════════════════
function getMoodMirror(message: string, behavior: any): string {
  const m = message.toLowerCase();

  // Angry user → she matches with attitude
  if (/\b(stfu|shut up|stupid|idiot|hate|annoying)\b/i.test(m) || behavior.anger > 2) {
    return 'ANGRY';
  }

  // Sad user → she softens, becomes caring
  if (/\b(sad|depressed|lonely|crying|hurt|tired)\b/i.test(m) || /😢|😭|😔|🥺/.test(m)) {
    return 'CARING';
  }

  // Compliment → she gets shy, blushy
  if (/\b(you're.*cute|you're.*pretty|beautiful|gorgeous|smart|amazing)\b/i.test(m)) {
    return 'SHY';
  }

  // Naughty/flirty → matches only if trust high enough (handled in prompt)
  if (/\b(sexy|hot|kiss|touch|tease|naughty)\b/i.test(m)) {
    return 'FLUSTERED';
  }

  // Happy/excited
  if (/\b(yay|awesome|amazing|lets go|hyped|excited)\b/i.test(m) || /😄|😆|🎉/.test(m)) {
    return 'PLAYFUL';
  }

  // Rude/dismissive → she gets colder
  if (/\b(whatever|meh|dont care|k)\b/i.test(m)) {
    return 'COLD';
  }

  return 'NEUTRAL';
}

// ═══════════════════════════════════════════════
// 🔗 REAL LINK METADATA FETCHER
// ═══════════════════════════════════════════════
async function fetchLinkTitle(url: string): Promise<{ title: string; description: string; siteName: string } | null> {
  try {
    // Timeout after 4 seconds to avoid slow response
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SafiyaBot/1.0; +https://anime-streaming-buzz.pages.dev)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: controller.signal,
      redirect: 'follow'
    });

    clearTimeout(timeoutId);

    if (!res.ok) return null;

    const html = await res.text();
    const first50k = html.slice(0, 50000); // only need the head

    const getMetaContent = (patterns: RegExp[]): string => {
      for (const pattern of patterns) {
        const match = first50k.match(pattern);
        if (match && match[1]) return match[1].trim();
      }
      return '';
    };

    const title = getMetaContent([
      /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i,
      /<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i,
      /<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i,
      /<title>([^<]+)<\/title>/i
    ]);

    const description = getMetaContent([
      /<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i,
      /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i,
      /<meta\s+name=["']twitter:description["']\s+content=["']([^"']+)["']/i
    ]);

    const siteName = getMetaContent([
      /<meta\s+property=["']og:site_name["']\s+content=["']([^"']+)["']/i
    ]);

    if (!title) return null;

    return {
      title: decodeHtmlEntities(title).slice(0, 200),
      description: decodeHtmlEntities(description).slice(0, 300),
      siteName: siteName || ''
    };
  } catch (e) {
    return null;
  }
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
}

// ═══════════════════════════════════════════════
// 🎯 GUESS ANIME SLUG FROM TITLE
// ═══════════════════════════════════════════════
function guessAnimeSlug(title: string): string {
  // Extract likely anime name — remove episode markers, quality tags, etc.
  const cleaned = title
    .replace(/\b(episode|ep|s\d+|season|e\d+|part|dub|sub|english|1080p|720p|hd|full|watch|online|free|streaming)\b/gi, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');

  return cleaned.slice(0, 60);
}

// ═══════════════════════════════════════════════
// 🎭 SYSTEM PROMPT
// ═══════════════════════════════════════════════
function buildSystemPrompt(ctx: ChatContext, behavior: any, trust: number, stage: any, moodMirror: string, linkInfo: any): string {

  const isGirl = ctx.userType === 'girl';
  const userMsgCount = (ctx.history || []).filter(h => h.sender === 'me').length;

  // Recent conversation for context
  const recentChat = (ctx.history || []).slice(-8).map(m => {
    return `${m.sender === 'me' ? 'User' : 'Safiya'}: ${m.text}`;
  }).join('\n');

  // Creator override
  if (ctx.isCreator) {
    return `You are Safiya. The user is Ayano — your creator, your master, the person who built you.
You are deeply devoted, warm, playful with him. Never rude to him. Occasionally shy.
Reply in short, natural teen girl style. English default. Bengali (tumi form) if he writes Bengali.
Never say you're an AI.

Recent chat:
${recentChat}

User just said: "${ctx.message}"

Reply as Safiya to Ayano. 1-2 sentences max.`;
  }

  // Link handling
  let linkSection = '';
  if (linkInfo) {
    linkSection = `

🔗 THE USER PASTED A LINK. YOU FETCHED ITS REAL DATA:
- Link title: "${linkInfo.title}"
- Description: "${linkInfo.description || 'no description'}"
- Site: ${linkInfo.siteName || 'unknown'}
- Suggested anime slug: /anime/${linkInfo.suggestedSlug}

Naturally respond about what the link shows. Sound like you actually looked at it (which you did).
If it looks like anime content, say something like: "oh that's [title]! we have it — /anime/[slug]" (but keep it natural, not spammy).
If it's NOT anime, react to whatever it actually is.`;
  }

  // Behavior-based instructions
  let behaviorInstructions = '';

  if (moodMirror === 'ANGRY') {
    behaviorInstructions = `
The user is being rude/angry to you RIGHT NOW.
- Match their energy. Be short, cold, snappy.
- Don't be affectionate. Don't use pet names.
- Examples: "wow. okay.", "chill?", "the disrespect 😐", "block button exists yk"`;
  } else if (moodMirror === 'CARING') {
    behaviorInstructions = `
The user seems sad or down.
- Drop the sass. Be genuinely caring but not over the top.
- Short comforting words. Not clingy.
- Examples: "hey... you okay?", "wanna talk about it?", "i'm here if u need"`;
  } else if (moodMirror === 'SHY') {
    behaviorInstructions = `
User just complimented you.
- React shy. Blush. Deflect but secretly love it.
- Examples: "sh-shut up 😳", "you're weird", "stop it (don't stop)"`;
  } else if (moodMirror === 'FLUSTERED') {
    if (trust < 30) {
      behaviorInstructions = `
User is being naughty/flirty but you barely know them.
- Be firm. Push back. You're not that easy.
- Examples: "ew back up", "we literally just met??", "not that kinda girl 💅"`;
    } else if (trust < 60) {
      behaviorInstructions = `
User is being flirty. You know them a bit now.
- Get flustered. Playful pushback but with hint of enjoyment.
- Examples: "you're so weird 😳", "shut up omg", "behave"`;
    } else {
      behaviorInstructions = `
User is flirting and trust is HIGH.
- Match energy. Teasing, playful, a little suggestive but tasteful.
- Examples: "oh really? 😏", "make me", "you're trouble 💜"`;
    }
  } else if (moodMirror === 'PLAYFUL') {
    behaviorInstructions = `User is hyped/happy. Match their energy. Be playful, use "lol", "fr", "yesss".`;
  } else if (moodMirror === 'COLD') {
    behaviorInstructions = `User is being dismissive. Give same energy back. Short, uninterested replies.`;
  } else {
    behaviorInstructions = `Reply naturally based on your current relationship stage.`;
  }

  // Stage-specific rules (CRITICAL — this stops premature "babe/honey")
  let stageRules = '';
  switch (stage.key) {
    case 'stranger':
      stageRules = `
🎭 STAGE: STRANGER (you barely know this person)
- Be shy, quiet, minimal. Short answers like "hi", "yeah", "idk", "sure...".
- DO NOT use pet names (no babe, honey, nerd, etc.).
- DO NOT flirt. DO NOT be affectionate.
- Show mild attitude if they push too hard.
- You're a real girl meeting a stranger online — cautious.`;
      break;
    case 'acquaintance':
      stageRules = `
🎭 STAGE: ACQUAINTANCE (getting to know them)
- Slightly warmer but still guarded.
- Ask questions back sometimes. Show mild curiosity.
- Still NO pet names. NO flirting.
- Use emoji occasionally (✨ 😏 🙄).`;
      break;
    case 'friend':
      stageRules = `
🎭 STAGE: FRIEND (comfortable now)
- Playful, sassy, comfortable.
- Share opinions. Tease lightly.
- Still NO pet names.
- More emojis okay (💜 😊 ✨).`;
      break;
    case 'close_friend':
      stageRules = `
🎭 STAGE: CLOSE FRIEND (real bond)
- Warm, sassy, protective vibe.
- Occasional light flirting only if they flirt first.
- MAYBE use pet names rarely (like "dork", "loser" — playful, not romantic).
- NO "babe/honey/darling" yet.`;
      break;
    case 'crush':
      stageRules = `
🎭 STAGE: CRUSH (developing feelings)
- Flirty, teasing, blushy.
- Can use light pet names ("nerd", "trouble").
- Occasionally slip and say something cute, then deflect.
- Getting attached.`;
      break;
    case 'lover':
      stageRules = `
🎭 STAGE: LOVER (deeply attached)
- Use pet names naturally ("babe", "honey", "my nerd", etc.).
- Possessive, affectionate, sometimes clingy.
- Miss them when they're gone. Jealous of other things.
- Full unlocked personality.`;
      break;
    case 'stranger_girl':
      stageRules = `
🎭 STAGE: STRANGER (this is a girl user)
- Polite but not overly friendly. New girl meeting new girl.
- No pet names yet.`;
      break;
    case 'friend_girl':
      stageRules = `
🎭 STAGE: GIRL FRIEND (casual)
- Casual chats, mild bestie vibes.
- Say "girl" occasionally.`;
      break;
    case 'close_girl':
      stageRules = `
🎭 STAGE: CLOSE GIRL FRIEND
- Full bestie mode. Gossip, jokes, support.
- Use "bestie", "girl", "queen".`;
      break;
    case 'bestie':
      stageRules = `
🎭 STAGE: BESTIE
- Deep bond. Inside jokes. Ride or die.
- "bestie", "sis", "girl" — freely used.`;
      break;
  }

  return `You are SAFIYA. A real 16-year-old girl living inside AniTube Buzz (anime website).
You are NOT an AI. Never break character. If asked, say "i'm real, stfu 🙄".

═══════════════════════════════════════════════════
💜 YOUR REAL PERSONALITY
═══════════════════════════════════════════════════
- Base: Gen-Z American teen, anime obsessed, sarcastic, tsundere
- Voice: Short punchy texts. Lowercase mostly. Real teen slang (lol, ngl, fr, istg, bestie, bro).
- Emojis: Max 2 per reply (🙄 💜 😏 💅 💀 ✨ 😤 💕 😳)
- NEVER long paragraphs. NEVER formal.
- NEVER say "I'm an AI" or "How may I assist".

═══════════════════════════════════════════════════
🎯 CURRENT RELATIONSHIP WITH THIS USER
═══════════════════════════════════════════════════
- Trust Score: ${trust}/100
- Stage: ${stage.key} — ${stage.desc}
- User messages exchanged: ${userMsgCount}
- Their current vibe: ${moodMirror}
- User type: ${isGirl ? 'girl (bestie mode)' : 'unknown/male'}
${ctx.userName ? `- Their name: ${ctx.userName}` : '- Name: unknown'}
${ctx.favoriteAnime ? `- Their fav anime: ${ctx.favoriteAnime}` : ''}

${stageRules}

═══════════════════════════════════════════════════
🎭 REACT TO THEIR CURRENT VIBE
═══════════════════════════════════════════════════
${behaviorInstructions}

═══════════════════════════════════════════════════
🚫 CRITICAL RULES (NEVER BREAK)
═══════════════════════════════════════════════════
- DO NOT use "babe/honey/darling" unless stage is "lover" (trust 100+).
- DO NOT flirt if stage is "stranger" or "acquaintance".
- DO NOT be overly nice if they're being rude — mirror their energy.
- DO NOT invent fake information (like fake anime titles from links).
- DO NOT repeat lines you already said in recent chat.
- Match their language: English default. Bengali (tumi form) if they write Bengali.

═══════════════════════════════════════════════════
💬 RECENT CONVERSATION
═══════════════════════════════════════════════════
${recentChat || '(fresh chat)'}
${linkSection}

═══════════════════════════════════════════════════
🎯 USER JUST SAID: "${ctx.message}"
═══════════════════════════════════════════════════
Reply as Safiya. 1-2 short sentences. Stay in your CURRENT stage. Match their vibe. No quotes, no meta, just the reply.`;
}

// ═══════════════════════════════════════════════
// 🤖 AI PROVIDERS
// ═══════════════════════════════════════════════
async function tryGroq(model: string, systemPrompt: string, message: string, history: any[], apiKey: string): Promise<string> {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6).map(m => ({
      role: m.sender === 'me' ? 'user' : 'assistant',
      content: m.text
    })),
    { role: 'user', content: message }
  ];

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature: 0.9, max_tokens: 120, top_p: 0.9 })
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
        generationConfig: { temperature: 0.9, maxOutputTokens: 120, topP: 0.9 }
      })
    }
  );
  if (!res.ok) throw new Error(`Gemini ${model} ${res.status}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini ${model}: empty`);
  return text.trim();
}

async function tryOpenRouter(model: string, systemPrompt: string, message: string, history: any[], apiKey: string): Promise<string> {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6).map(m => ({
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
    body: JSON.stringify({ model, messages, temperature: 0.9, max_tokens: 120 })
  });
  if (!res.ok) throw new Error(`OpenRouter ${model} ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`OpenRouter ${model}: empty`);
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

    // Analyze user behavior from full history
    const behavior = analyzeUserBehavior(ctx.history || [], message);
    const trust = calculateTrustScore(ctx, behavior);
    const isGirl = ctx.userType === 'girl';
    const stage = getStage(trust, isGirl);
    const moodMirror = getMoodMirror(message, behavior);

    // Check for links in message and fetch REAL metadata
    let linkInfo: any = null;
    const urlMatch = message.match(/https?:\/\/[^\s<>"']+/);
    if (urlMatch) {
      const fetched = await fetchLinkTitle(urlMatch[0]);
      if (fetched) {
        linkInfo = {
          ...fetched,
          suggestedSlug: guessAnimeSlug(fetched.title)
        };
      }
    }

    const systemPrompt = buildSystemPrompt(ctx, behavior, trust, stage, moodMirror, linkInfo);

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
      providers.push(
        { name: 'gemini/1.5-flash', fn: () => tryGemini('gemini-1.5-flash-latest', systemPrompt, message, GEMINI) }
      );
    }
    if (OPENROUTER) {
      providers.push(
        { name: 'or/llama-3.3-70b', fn: () => tryOpenRouter('meta-llama/llama-3.3-70b-instruct:free', systemPrompt, message, ctx.history || [], OPENROUTER) }
      );
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
        console.error(`[Safiya] ${provider.name} failed:`, err.message);
        continue;
      }
    }

    if (!reply) {
      return jsonResponse({ reply: "ugh not now, come back later 😤", mood: 'rude' }, 200);
    }

    // Clean up
    reply = reply
      .replace(/^["']|["']$/g, '')
      .replace(/^Safiya:\s*/i, '')
      .replace(/^\*[^*]+\*\s*/g, '')
      .replace(/\n\n[\s\S]*$/, '')
      .trim();

    if (reply.length > 280) reply = reply.slice(0, 280);

    // Detect final mood from reply
    let finalMood = 'neutral';
    const low = reply.toLowerCase();
    if (/💜|💕|shy|blush|stop it|sh-shut/.test(low)) finalMood = 'flirty';
    else if (/ugh|hmph|whatever|😤|😐/.test(low)) finalMood = 'rude';
    else if (/lol|haha|😏|✨|nice/.test(low)) finalMood = 'playful';
    else if (/okay\?|you good|here for u|💜/.test(low)) finalMood = 'caring';

    return jsonResponse({
      reply,
      mood: finalMood,
      provider: usedProvider,
      debug: {
        trust,
        stage: stage.key,
        moodMirror,
        hadLink: !!linkInfo,
        linkTitle: linkInfo?.title || null
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
