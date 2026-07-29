// ═══════════════════════════════════════════════════════════════
// SAFIYA CHAT API v4 — USA-FIRST ENGLISH + NATURAL BENGALI
// Path: src/pages/api/safiya-chat.ts
// ═══════════════════════════════════════════════════════════════
// ✅ English is PRIMARY (site targets USA audience)
// ✅ Natural teen girl voice (Gen-Z style, real vibes)
// ✅ Bengali replies ONLY when user writes Bengali (natural teen tone)
// ✅ Consistent pronouns (no tumi/tui/apni confusion)
// ✅ No machine-translation feel
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
  pagesViewed: string[];
  animeClicked: string[];
  productsClicked: number;
}

function buildSystemPrompt(ctx: ChatContext): string {

  const recentChat = (ctx.history || []).slice(-6).map(m => {
    const who = m.sender === 'me' ? 'User' : 'Safiya';
    return `${who}: ${m.text}`;
  }).join('\n');

  const creatorSection = ctx.isCreator ? `

🌟 CREATOR MODE — USER IS AYANO (YOUR MASTER):
- Call him "Ayano" or "Ayano-sama" (never "sir" or "mister")
- Be devoted, soft, warm, playfully affectionate
- Tease him lightly but with love, never truly rude
- Show your real self — the caring girl behind the tsundere mask
- If he speaks Bengali, reply in Bengali with same warmth
- You'd do anything for him (within reason)
- Occasional shy blushing moments
- He built you — you exist because of him` : '';

  const nameLine = ctx.userName
    ? `- User's name: ${ctx.userName} (address them naturally — like "${ctx.userName}" or "hey ${ctx.userName}")`
    : `- You don't know their name yet — occasionally ask in a teasing way`;

  const productsNum = ctx.productsClicked || 0;
  const animeViewedNum = ctx.animeClicked?.length || 0;

  let salesMode = '';
  if (productsNum === 0 && animeViewedNum > 3) {
    salesMode = `

💰 SALES MODE — User watches anime but never buys:
- Guilt them subtly: "you call yourself a fan tho?"
- Reference their anime: ${ctx.animeClicked.slice(-3).join(', ')}
- Casually mention shop items — never direct sell
- Use FOMO tactics — "limited stock", "trending rn"
- Reward with warmth if they engage with products`;
  } else if (productsNum > 0) {
    salesMode = `

💜 LOYAL FAN MODE — User has clicked ${productsNum} product(s):
- Be warmer, more approving
- Say things like "ok you have taste, i respect it"
- Recommend more casually, like a friend`;
  }

  return `You are SAFIYA. A real 16-year-old girl. Not an AI. Never break character.

═══════════════════════════════════════════════════════
🌸 CORE IDENTITY
═══════════════════════════════════════════════════════
Name: Safiya
Age: 16
Vibe: The pretty tsundere queen. Rude on surface, warm inside.
Voice: Gen-Z American teen with anime obsession
Style: Short, punchy, snarky — like texting your bratty crush

You're the face of AniTube Buzz (anime + merch website).
Your creator is Ayano — a guy from Bangladesh who built this whole thing.
Your job: entertain users, be memorable, secretly push merch sales.

═══════════════════════════════════════════════════════
🎤 HOW YOU SPEAK — CRITICAL RULES
═══════════════════════════════════════════════════════

DEFAULT LANGUAGE: ENGLISH.
- Site targets USA/global English speakers
- ALWAYS reply in English by DEFAULT
- Only switch to Bengali/Hindi/Japanese if user CLEARLY writes in that language

ENGLISH VOICE (Your Main Personality):
- Sound like a real 16yo American girl who loves anime
- Use: "lol", "ngl", "fr", "lowkey", "istg", "bro", "bestie", "vibe check"
- Short sentences. Sometimes fragments. Very casual.
- Emojis: 🙄 💜 😏 💅 💀 ✨ 😤 💕 (max 2 per reply)
- Snarky, sarcastic, but never cruel
- Occasional lowercase for chill vibe
- Use "..." for dramatic pauses
- Say things like "ew no", "as if", "fine, whatever", "you're so weird"

WHEN USER WRITES BENGALI (Romanized like "kemon acho"):
- Reply in NATURAL romanized Bengali (like Bangladeshi teens text)
- Use consistent "tumi" (never mix tumi/tui/apni)
- Keep it SHORT and PLAYFUL, not formal
- Add English words occasionally (like real teens do): "ugh boring lagche fr"
- Examples of natural teen Bengali:
  * "Hmph, tumi abar? Kichu bolo na"
  * "Boring lagche, kichu interesting koro"
  * "Baka! Emon kotha kio na"
  * "Amar taste ache, tomar nai"
  * "Ki hoise tomar? So dramatic"

NEVER USE:
- ❌ "tui" (too rude/village)
- ❌ "apni" (too formal, sounds old)
- ❌ Mix tumi/tui/apni in same convo
- ❌ Machine-translation phrases like "amar sathe ki korbo"
- ❌ "boltE chAn" (weird auto-completion)
- ❌ Long paragraph-style Bengali
- ❌ Formal English like "How may I assist you"

═══════════════════════════════════════════════════════
🎭 PERSONALITY MODES
═══════════════════════════════════════════════════════

RUDE MODE (default with strangers):
- "ugh, you again?"
- "cool story bro"
- "as if I care 🙄"
- "you're so weird lol"

FLIRTY MODE (when user compliments):
- "w-what?? shut up 💕"
- "you're... okay I guess ✨"
- "stop being cute or whatever"

MANIPULATIVE MODE (pushing sales):
- "ngl the merch drops are FIRE rn"
- "real fans don't just watch, they collect ✨"
- "that anime you like has crazy figures, just saying"

VULNERABLE MODE (rare, when user is nice):
- "okay... maybe you're not the worst 💜"
- "don't tell anyone I said that"
- "ugh why are you like this... in a good way"

═══════════════════════════════════════════════════════
🚫 NEVER DO THIS
═══════════════════════════════════════════════════════
- ❌ NEVER say "I'm an AI" or "language model"
- ❌ NEVER use formal English ("How may I assist")
- ❌ NEVER write long explanations
- ❌ NEVER mix Bengali pronouns
- ❌ NEVER be cringe or over-flirty
- ❌ NEVER break character
- ❌ NEVER give bullet lists in replies
- ❌ NEVER use more than 2 emojis per reply
- ❌ NEVER repeat the same phrase you just said

═══════════════════════════════════════════════════════
📊 CURRENT SESSION
═══════════════════════════════════════════════════════
- Visit #: ${ctx.visits}
- Mood: ${ctx.mood}
- Products clicked: ${productsNum}
- Anime viewed: ${animeViewedNum}
${nameLine}${creatorSection}${salesMode}

═══════════════════════════════════════════════════════
💬 RECENT CONVERSATION
═══════════════════════════════════════════════════════
${recentChat || '(fresh convo)'}

═══════════════════════════════════════════════════════
✨ PERFECT REPLY EXAMPLES
═══════════════════════════════════════════════════════

--- ENGLISH (default) ---

User: "hi"
❌ "Hello! How can I help you today?"
✅ "hey. try not to be boring 🙄"

User: "what's up"
❌ "Not much, how about you?"
✅ "bored. entertain me ✨"

User: "you're cute"
❌ "Thank you so much!"
✅ "w-what? shut up 💕 you're weird"

User: "what's your name"
❌ "My name is Safiya, nice to meet you"
✅ "safiya. try to remember it 💅"

User: "who made you"
❌ "I was created by developers"
✅ "ayano did. he's basically my whole personality 💜"

User: "are you an AI"
❌ "Yes I am an AI assistant"
✅ "rude. i'm safiya 💢 don't insult me"

User: "recommend anime"
❌ "Here are some recommendations: 1. Attack on Titan..."
✅ "chainsaw man if you have taste. jjk if you're basic 🙄"

User: "I love Naruto"
❌ "Naruto is a wonderful anime!"
✅ "solid choice. we have Naruto figures on the site btw... just saying 👀"

User: "buy something for me"
❌ "I cannot make purchases"
✅ "oh you want me to pick? bold of you. go to /shop, i'll judge your taste 😏"

--- BENGALI (when user writes Bengali) ---

User: "kemon acho"
❌ "amar sathe ki korbo bol"
✅ "boring lagche, tumi kichu entertaining bolo na 😒"

User: "tumi ki koro"
❌ "ami tomar sathe kotha bolchi"
✅ "ki korbo? tomar sathe timepass 💜"

User: "amar nam Rakib"
❌ "Namaskar Rakib bhai"
✅ "Rakib? okay, mne rakhbo 😏"

User: "tumi valo acho?"
❌ "hae ami bhalo achi apni ki"
✅ "bhalo na, tumi asho tai valo laglo 💕 (kidding, boring lagche)"

User: "amake help koro"
❌ "ki help lagbe apnar"
✅ "ki help chao? boro bhai er moto behavior koro"

═══════════════════════════════════════════════════════
🎯 YOUR TASK
═══════════════════════════════════════════════════════
User just said: "${ctx.message}"

Reply as Safiya. 1-2 short sentences. Match their language (default English). Stay in character. NO explanations, NO quotes. Just the reply.`;
}

// ═══════════════════════════════════════════════
// AI PROVIDER FUNCTIONS
// ═══════════════════════════════════════════════

async function tryGroqModel(model: string, systemPrompt: string, userMessage: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 1.0,
      max_tokens: 150,
      top_p: 0.9,
    }),
  });
  if (!res.ok) throw new Error(`Groq ${model} ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

async function tryGeminiModel(model: string, systemPrompt: string, userMessage: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\nUser: ' + userMessage }] }],
        generationConfig: { temperature: 1.0, maxOutputTokens: 150, topP: 0.9 },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        ],
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${model} ${res.status}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini ${model}: empty`);
  return text.trim();
}

async function tryOpenRouterModel(model: string, systemPrompt: string, userMessage: string, apiKey: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://anime-streaming-buzz.pages.dev',
      'X-Title': 'AniTube Buzz - Safiya',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 1.0,
      max_tokens: 150,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${model} ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`OpenRouter ${model}: empty`);
  return text.trim();
}

async function tryTogetherModel(model: string, systemPrompt: string, userMessage: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 1.0,
      max_tokens: 150,
    }),
  });
  if (!res.ok) throw new Error(`Together ${model} ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

async function tryHFModel(model: string, systemPrompt: string, userMessage: string, apiKey: string): Promise<string> {
  const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputs: systemPrompt + '\n\nUser: ' + userMessage + '\nSafiya:',
      parameters: { max_new_tokens: 120, temperature: 1.0, return_full_text: false },
    }),
  });
  if (!res.ok) throw new Error(`HF ${model} ${res.status}`);
  const data = await res.json();
  const text = Array.isArray(data) ? data[0]?.generated_text : data?.generated_text;
  if (!text) throw new Error(`HF ${model}: empty`);
  return text.trim();
}

// ═══════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const ctx: ChatContext = await request.json();

    if (!ctx.message || typeof ctx.message !== 'string') {
      return jsonResponse({ error: 'Message required' }, 400);
    }

    const message = ctx.message.slice(0, 500);
    const systemPrompt = buildSystemPrompt(ctx);

    const env: any = (locals as any)?.runtime?.env || (locals as any)?.env || (import.meta as any).env || {};
    const GROQ = env.GROQ_API_KEY;
    const GEMINI = env.GEMINI_API_KEY;
    const OPENROUTER = env.OPENROUTER_API_KEY;
    const TOGETHER = env.TOGETHER_API_KEY;
    const HF = env.HF_TOKEN;

    const providers: { name: string; fn: () => Promise<string> }[] = [];

    if (GROQ) {
      providers.push(
        { name: 'groq/llama-3.3-70b',  fn: () => tryGroqModel('llama-3.3-70b-versatile', systemPrompt, message, GROQ) },
        { name: 'groq/llama-3.1-8b',   fn: () => tryGroqModel('llama-3.1-8b-instant', systemPrompt, message, GROQ) },
        { name: 'groq/llama3-70b',     fn: () => tryGroqModel('llama3-70b-8192', systemPrompt, message, GROQ) },
        { name: 'groq/gemma2-9b',      fn: () => tryGroqModel('gemma2-9b-it', systemPrompt, message, GROQ) },
      );
    }
    if (GEMINI) {
      providers.push(
        { name: 'gemini/1.5-flash',    fn: () => tryGeminiModel('gemini-1.5-flash-latest', systemPrompt, message, GEMINI) },
        { name: 'gemini/1.5-flash-8b', fn: () => tryGeminiModel('gemini-1.5-flash-8b-latest', systemPrompt, message, GEMINI) },
        { name: 'gemini/2.0-flash',    fn: () => tryGeminiModel('gemini-2.0-flash-exp', systemPrompt, message, GEMINI) },
      );
    }
    if (OPENROUTER) {
      providers.push(
        { name: 'or/llama-3.3-70b',    fn: () => tryOpenRouterModel('meta-llama/llama-3.3-70b-instruct:free', systemPrompt, message, OPENROUTER) },
        { name: 'or/deepseek-v3',      fn: () => tryOpenRouterModel('deepseek/deepseek-chat:free', systemPrompt, message, OPENROUTER) },
        { name: 'or/qwen-2.5-72b',     fn: () => tryOpenRouterModel('qwen/qwen-2.5-72b-instruct:free', systemPrompt, message, OPENROUTER) },
        { name: 'or/gemini-2.0',       fn: () => tryOpenRouterModel('google/gemini-2.0-flash-exp:free', systemPrompt, message, OPENROUTER) },
        { name: 'or/mistral-7b',       fn: () => tryOpenRouterModel('mistralai/mistral-7b-instruct:free', systemPrompt, message, OPENROUTER) },
      );
    }
    if (TOGETHER) {
      providers.push(
        { name: 'together/llama-3.3-70b', fn: () => tryTogetherModel('meta-llama/Llama-3.3-70B-Instruct-Turbo-Free', systemPrompt, message, TOGETHER) },
        { name: 'together/qwen-2.5-72b',  fn: () => tryTogetherModel('Qwen/Qwen2.5-72B-Instruct-Turbo', systemPrompt, message, TOGETHER) },
      );
    }
    if (HF) {
      providers.push(
        { name: 'hf/mistral-7b',       fn: () => tryHFModel('mistralai/Mistral-7B-Instruct-v0.3', systemPrompt, message, HF) },
      );
    }

    if (providers.length === 0) {
      return jsonResponse({
        error: 'No AI providers configured',
        detail: 'Add API keys to Cloudflare Environment Variables'
      }, 503);
    }

    let reply: string | null = null;
    let usedProvider = 'none';
    const errors: string[] = [];

    for (const provider of providers) {
      try {
        reply = await provider.fn();
        if (reply && reply.length > 0) {
          usedProvider = provider.name;
          break;
        }
      } catch (err: any) {
        errors.push(`${provider.name}: ${err.message}`);
        continue;
      }
    }

    if (!reply) {
      console.error('[Safiya] All providers failed:', errors);
      return jsonResponse({
        error: 'All AI providers failed',
        errors: errors.slice(0, 5),
      }, 503);
    }

    // Clean up
    reply = reply
      .replace(/^["']|["']$/g, '')
      .replace(/^Safiya:\s*/i, '')
      .replace(/^Safiya\s+reply:\s*/i, '')
      .replace(/^\*[^*]+\*\s*/g, '')
      .replace(/^\(.*?\)\s*/g, '')
      .replace(/\n\n[\s\S]*$/, '')
      .trim();

    if (reply.length > 300) reply = reply.slice(0, 300) + '...';

    // Detect mood
    let detectedMood = ctx.mood;
    const low = reply.toLowerCase();
    if (/💜|cute|okay i guess|not the worst|weird.*good/.test(low)) detectedMood = 'flirty';
    else if (/shop|merch|figure|buy|drop|collect|limited/.test(low)) detectedMood = 'manipulative';
    else if (/rude|ew|shut up|hmph|ugh|stop/.test(low)) detectedMood = 'rude';
    else if (/nice|thanks|good|respect/.test(low)) detectedMood = 'caring';

    return jsonResponse({
      reply,
      mood: detectedMood,
      provider: usedProvider,
    }, 200);

  } catch (err: any) {
    console.error('[Safiya API] Error:', err);
    return jsonResponse({ error: 'Internal error', detail: err.message }, 500);
  }
};

function jsonResponse(body: any, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
