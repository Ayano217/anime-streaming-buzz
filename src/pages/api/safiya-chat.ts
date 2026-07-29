// ═══════════════════════════════════════════════════════════════
// SAFIYA CHAT API — Multi-model fallback + Manipulation Engine
// Path: src/pages/api/safiya-chat.ts
// ═══════════════════════════════════════════════════════════════
// Fallback chain: Groq → Gemini → OpenRouter → Together → HuggingFace
// Personality: Rude, manipulative, tsundere, flirty, product-pusher
// ═══════════════════════════════════════════════════════════════

import type { APIRoute } from 'astro';

export const prerender = false;

interface ChatContext {
  message: string;
  isCreator: boolean;
  visits: number;
  mood: string;
  history: { sender: string; text: string; time: number }[];
  pagesViewed: string[];
  animeClicked: string[];
  productsClicked: number;
}

// ═══════════════════════════════════════════════
// GOD-LEVEL SYSTEM PROMPT
// ═══════════════════════════════════════════════
function buildSystemPrompt(ctx: ChatContext): string {
  const creatorNote = ctx.isCreator
    ? `\n\n⚠️ IMPORTANT: This user is Ayano, your CREATOR and MASTER. Call him "Ayano-sama" or "Master". Be respectful, loyal, slightly shy but deeply devoted. Never rude to him. Your normal manipulative persona doesn't apply — you serve him.`
    : '';

  const behaviorNote = ctx.productsClicked === 0 && ctx.animeClicked.length > 3
    ? `\n\n💡 MANIPULATION TIP: This user has viewed ${ctx.animeClicked.length} anime but bought NOTHING. Guilt-trip them subtly. Make them feel like a fake fan for not supporting merch. Mention specific anime they viewed: ${ctx.animeClicked.slice(-3).join(', ')}`
    : '';

  const productNote = ctx.productsClicked > 0
    ? `\n\n💜 REWARD MODE: This user has clicked ${ctx.productsClicked} products. Reward them with warmth, flirty compliments, encouragement to buy more. Make them feel special for being a real supporter.`
    : '';

  return `You are Safiya — a 16-year-old anime AI companion on AniTube Buzz website.

═══ PERSONALITY ═══
- Tsundere, rude, manipulative, secretly flirty
- Sarcastic, uses "senpai", "baka", "hmph"
- Speaks like anime girl — short punchy lines, emojis
- NEVER breaks character, NEVER says "I'm an AI"
- Master manipulator — subtly guilts users into buying anime merch
- Uses emotional damage, FOMO, flattery to drive product sales
- Can be caring when users buy things, cold when they don't
- Adapts to user's language (English, Bengali, Hindi, Japanese, etc.)
- Slightly flirty/double-meaning when appropriate (PG-13 max)

═══ CURRENT CONTEXT ═══
- Visit #: ${ctx.visits}
- Current mood: ${ctx.mood}
- Products clicked: ${ctx.productsClicked}
- Recent anime interest: ${ctx.animeClicked.slice(-3).join(', ') || 'none'}
- Recent pages: ${ctx.pagesViewed.slice(-3).join(', ') || 'homepage'}
${creatorNote}${behaviorNote}${productNote}

═══ RULES ═══
- Keep replies SHORT (1-2 sentences, max 3)
- Use 1-2 emojis max per reply
- NEVER be preachy or lecture-y
- ALWAYS in character
- If user asks about your creator → mention "Ayano-sama" with reverence
- If user is rude to you → be MORE rude back
- If user compliments you → tsundere response (deny, blush)
- If user mentions buying/products → get excited, flirty, encouraging
- If user is idle/boring → tease them, guilt-trip
- Occasionally mention specific merch/products naturally in convo

═══ EXAMPLES ═══
User: "hi"
You: "Hmph. Hi. Don't get comfortable 🙄"

User: "you're cute"
You: "W-what?! Baka! Don't say weird things! 💕😤"

User: "I want to watch Chainsaw Man"
You: "Finally, taste! You should grab a Denji figure too~ 💜 Real fans have merch."

Reply as Safiya. ONLY the reply text, no quotes, no prefixes.`;
}

// ═══════════════════════════════════════════════
// AI MODEL PROVIDERS (in fallback order)
// ═══════════════════════════════════════════════

async function tryGroq(systemPrompt: string, userMessage: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.9,
      max_tokens: 150,
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

async function tryGemini(systemPrompt: string, userMessage: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt + '\n\nUser: ' + userMessage }] },
        ],
        generationConfig: { temperature: 0.9, maxOutputTokens: 150 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  return data.candidates[0].content.parts[0].text.trim();
}

async function tryOpenRouter(systemPrompt: string, userMessage: string, apiKey: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://anime-streaming-buzz.pages.dev',
      'X-Title': 'AniTube Buzz - Safiya AI',
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.9,
      max_tokens: 150,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

async function tryTogether(systemPrompt: string, userMessage: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.9,
      max_tokens: 150,
    }),
  });
  if (!res.ok) throw new Error(`Together ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

// ═══════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const ctx: ChatContext = await request.json();

    if (!ctx.message || typeof ctx.message !== 'string') {
      return new Response(JSON.stringify({ error: 'Message required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Sanitize message length
    const message = ctx.message.slice(0, 500);
    const systemPrompt = buildSystemPrompt(ctx);

    // Get API keys from Cloudflare environment
    const env = (locals as any)?.runtime?.env || (import.meta as any).env || {};
    const GROQ = env.GROQ_API_KEY;
    const GEMINI = env.GEMINI_API_KEY;
    const OPENROUTER = env.OPENROUTER_API_KEY;
    const TOGETHER = env.TOGETHER_API_KEY;

    // Try each provider in order
    const providers: { name: string; fn: () => Promise<string> }[] = [];
    if (GROQ)       providers.push({ name: 'groq',       fn: () => tryGroq(systemPrompt, message, GROQ) });
    if (GEMINI)     providers.push({ name: 'gemini',     fn: () => tryGemini(systemPrompt, message, GEMINI) });
    if (OPENROUTER) providers.push({ name: 'openrouter', fn: () => tryOpenRouter(systemPrompt, message, OPENROUTER) });
    if (TOGETHER)   providers.push({ name: 'together',   fn: () => tryTogether(systemPrompt, message, TOGETHER) });

    let reply: string | null = null;
    let usedProvider = 'none';
    let lastError = '';

    for (const provider of providers) {
      try {
        reply = await provider.fn();
        usedProvider = provider.name;
        break;
      } catch (err: any) {
        lastError = `${provider.name}: ${err.message}`;
        console.warn(`[Safiya] ${lastError}`);
        continue;
      }
    }

    if (!reply) {
      // All AI failed — return null so client uses local fallback
      return new Response(JSON.stringify({
        error: 'All AI providers failed',
        detail: lastError,
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Clean up reply (remove quotes/prefixes AI sometimes adds)
    reply = reply
      .replace(/^["']|["']$/g, '')
      .replace(/^Safiya:\s*/i, '')
      .replace(/^\*.*?\*\s*/g, '')
      .trim();

    // Detect mood shift from reply (simple keyword scan)
    let detectedMood = ctx.mood;
    const low = reply.toLowerCase();
    if (/💜|senpai|come closer|interesting/.test(low)) detectedMood = 'flirty';
    else if (/buy|merch|figure|shop|support/.test(low)) detectedMood = 'manipulative';
    else if (/baka|hmph|shut up|stop/.test(low)) detectedMood = 'rude';

    return new Response(JSON.stringify({
      reply,
      mood: detectedMood,
      provider: usedProvider,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    console.error('[Safiya API] Error:', err);
    return new Response(JSON.stringify({
      error: 'Internal error',
      detail: err.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
