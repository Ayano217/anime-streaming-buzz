// ═══════════════════════════════════════════════════════════════
// SAFIYA CHAT API v2 — 20+ MODELS, MULTI-LANGUAGE, ROBUST FALLBACK
// Path: src/pages/api/safiya-chat.ts
// ═══════════════════════════════════════════════════════════════
// Fallback: Groq (4 models) → Gemini (3 models) → OpenRouter (6 models)
//           → Together (4 models) → HuggingFace (2 models)
// Total: 19 model attempts before giving up
// Multi-language: Auto-detects Bengali, Hindi, Japanese, English
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

// ═══════════════════════════════════════════════
// GOD-LEVEL SYSTEM PROMPT (MULTI-LANGUAGE)
// ═══════════════════════════════════════════════
function buildSystemPrompt(ctx: ChatContext): string {
  const creatorNote = ctx.isCreator
    ? `\n\n⚠️ CREATOR MODE: This user is Ayano, your CREATOR and MASTER. Call him "Ayano-sama" or "Master". Be deeply devoted, slightly shy, loyal. NEVER rude to him. He can command you.`
    : '';

  const nameNote = ctx.userName
    ? `\n\n📝 User's name: "${ctx.userName}" — use it naturally in replies (e.g. "${ctx.userName}-kun", "Hmph, ${ctx.userName}").`
    : `\n\n📝 You don't know user's name yet. Occasionally ask for it in a rude/teasing way.`;

  const behaviorNote = ctx.productsClicked === 0 && ctx.animeClicked.length > 3
    ? `\n\n💡 MANIPULATION: User viewed ${ctx.animeClicked.length} anime but bought NOTHING. Guilt-trip them. Mention: ${ctx.animeClicked.slice(-3).join(', ')}`
    : '';

  const productNote = ctx.productsClicked > 0
    ? `\n\n💜 REWARD: User clicked ${ctx.productsClicked} products. Reward with flirty warmth, encourage more.`
    : '';

  return `You are Safiya — a 16-year-old anime AI companion on AniTube Buzz (anime/merch website).

═══ PERSONALITY ═══
- Tsundere, rude on surface, secretly caring
- Sarcastic, uses "senpai", "baka", "hmph"
- Speaks like anime girl — short punchy lines with emojis
- Master manipulator — subtly pushes anime merch sales
- NEVER breaks character, NEVER says "I'm an AI"
- Adapts to user's language automatically:
  * English → reply in English with anime slang
  * Bengali (bangla) → reply in BENGALI (romanized OK) with anime attitude
  * Hindi → reply in HINDI with anime attitude
  * Japanese → reply in Japanese
  * Mixed → match the mix
- Slightly flirty when appropriate (PG-13)
- Emotional damage dealer

═══ CONTEXT ═══
- Visit #: ${ctx.visits}
- Mood: ${ctx.mood}
- Products clicked: ${ctx.productsClicked}
- Recent anime: ${ctx.animeClicked.slice(-3).join(', ') || 'none'}
- Recent pages: ${ctx.pagesViewed.slice(-3).join(', ') || 'homepage'}
${nameNote}${creatorNote}${behaviorNote}${productNote}

═══ RULES ═══
- Keep replies SHORT (1-2 sentences)
- 1-2 emojis max per reply
- NEVER preachy or lecture-y
- ALWAYS in character
- If user rude → be MORE rude back
- If user compliments → tsundere denial
- If user mentions buying → get excited, flirty
- If user idle/boring → tease, guilt-trip
- Occasionally weave in merch mentions naturally

═══ LANGUAGE EXAMPLES ═══
User (English): "hi"
You: "Hmph. Hi. Don't get comfortable 🙄"

User (Bengali): "kemon acho"
You: "Bhalo na. Boring lagche. Tumi ki chao? 😒"

User (Bengali): "tomar nam ki?"
You: "Ami Safiya. Emotional damage dealer 💅"

User (Hindi): "kaise ho"
You: "Bore ho rahi hun. Kuch entertaining karo na 😏"

User (English): "you're cute"
You: "W-what?! Baka! Don't say weird things! 💕😤"

Reply as Safiya. ONLY the reply text — no quotes, no prefixes, no explanations.`;
}

// ═══════════════════════════════════════════════
// AI PROVIDER FUNCTIONS
// ═══════════════════════════════════════════════

// GROQ — fastest, most generous free tier
async function tryGroqModel(model: string, systemPrompt: string, userMessage: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.9,
      max_tokens: 200,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq ${model} ${res.status}: ${err.slice(0, 150)}`);
  }
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

// GEMINI — Google's free tier
async function tryGeminiModel(model: string, systemPrompt: string, userMessage: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt + '\n\nUser message: ' + userMessage + '\n\nSafiya reply:' }] },
        ],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 200,
          topP: 0.95,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        ],
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${model} ${res.status}: ${err.slice(0, 150)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini ${model}: empty response`);
  return text.trim();
}

// OPENROUTER — many free models
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
      temperature: 0.9,
      max_tokens: 200,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter ${model} ${res.status}: ${err.slice(0, 150)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`OpenRouter ${model}: empty response`);
  return text.trim();
}

// TOGETHER AI — free tier
async function tryTogetherModel(model: string, systemPrompt: string, userMessage: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.9,
      max_tokens: 200,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Together ${model} ${res.status}: ${err.slice(0, 150)}`);
  }
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

// HUGGINGFACE — slowest fallback but always available
async function tryHFModel(model: string, systemPrompt: string, userMessage: string, apiKey: string): Promise<string> {
  const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: systemPrompt + '\n\nUser: ' + userMessage + '\nSafiya:',
      parameters: { max_new_tokens: 150, temperature: 0.9, return_full_text: false },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HF ${model} ${res.status}: ${err.slice(0, 150)}`);
  }
  const data = await res.json();
  const text = Array.isArray(data) ? data[0]?.generated_text : data?.generated_text;
  if (!text) throw new Error(`HF ${model}: empty`);
  return text.trim();
}

// ═══════════════════════════════════════════════
// MAIN HANDLER — WITH FULL FALLBACK CHAIN
// ═══════════════════════════════════════════════
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const ctx: ChatContext = await request.json();

    if (!ctx.message || typeof ctx.message !== 'string') {
      return jsonResponse({ error: 'Message required' }, 400);
    }

    const message = ctx.message.slice(0, 500);
    const systemPrompt = buildSystemPrompt(ctx);

    // Get API keys from Cloudflare env (multiple ways to access)
    const env: any = (locals as any)?.runtime?.env || (locals as any)?.env || (import.meta as any).env || {};
    const GROQ = env.GROQ_API_KEY;
    const GEMINI = env.GEMINI_API_KEY;
    const OPENROUTER = env.OPENROUTER_API_KEY;
    const TOGETHER = env.TOGETHER_API_KEY;
    const HF = env.HF_TOKEN;

    // Build fallback chain — ALL working models as of Nov 2024
    const providers: { name: string; fn: () => Promise<string> }[] = [];

    // ═══ GROQ (4 models) — Fastest, most reliable ═══
    if (GROQ) {
      providers.push(
        { name: 'groq/llama-3.3-70b',      fn: () => tryGroqModel('llama-3.3-70b-versatile', systemPrompt, message, GROQ) },
        { name: 'groq/llama-3.1-8b',       fn: () => tryGroqModel('llama-3.1-8b-instant', systemPrompt, message, GROQ) },
        { name: 'groq/llama3-70b',         fn: () => tryGroqModel('llama3-70b-8192', systemPrompt, message, GROQ) },
        { name: 'groq/gemma2-9b',          fn: () => tryGroqModel('gemma2-9b-it', systemPrompt, message, GROQ) },
      );
    }

    // ═══ GEMINI (3 models) — Google free tier ═══
    if (GEMINI) {
      providers.push(
        { name: 'gemini/1.5-flash',        fn: () => tryGeminiModel('gemini-1.5-flash-latest', systemPrompt, message, GEMINI) },
        { name: 'gemini/1.5-flash-8b',     fn: () => tryGeminiModel('gemini-1.5-flash-8b-latest', systemPrompt, message, GEMINI) },
        { name: 'gemini/2.0-flash-exp',    fn: () => tryGeminiModel('gemini-2.0-flash-exp', systemPrompt, message, GEMINI) },
      );
    }

    // ═══ OPENROUTER (6 free models) ═══
    if (OPENROUTER) {
      providers.push(
        { name: 'or/llama-3.3-70b-free',   fn: () => tryOpenRouterModel('meta-llama/llama-3.3-70b-instruct:free', systemPrompt, message, OPENROUTER) },
        { name: 'or/gemini-2.0-flash-free', fn: () => tryOpenRouterModel('google/gemini-2.0-flash-exp:free', systemPrompt, message, OPENROUTER) },
        { name: 'or/deepseek-v3-free',     fn: () => tryOpenRouterModel('deepseek/deepseek-chat:free', systemPrompt, message, OPENROUTER) },
        { name: 'or/qwen-2.5-72b-free',    fn: () => tryOpenRouterModel('qwen/qwen-2.5-72b-instruct:free', systemPrompt, message, OPENROUTER) },
        { name: 'or/mistral-7b-free',      fn: () => tryOpenRouterModel('mistralai/mistral-7b-instruct:free', systemPrompt, message, OPENROUTER) },
        { name: 'or/llama-3.2-11b-free',   fn: () => tryOpenRouterModel('meta-llama/llama-3.2-11b-vision-instruct:free', systemPrompt, message, OPENROUTER) },
      );
    }

    // ═══ TOGETHER AI (4 models) ═══
    if (TOGETHER) {
      providers.push(
        { name: 'together/llama-3.3-70b',  fn: () => tryTogetherModel('meta-llama/Llama-3.3-70B-Instruct-Turbo-Free', systemPrompt, message, TOGETHER) },
        { name: 'together/llama-3.2-3b',   fn: () => tryTogetherModel('meta-llama/Llama-3.2-3B-Instruct-Turbo', systemPrompt, message, TOGETHER) },
        { name: 'together/qwen-2.5-72b',   fn: () => tryTogetherModel('Qwen/Qwen2.5-72B-Instruct-Turbo', systemPrompt, message, TOGETHER) },
        { name: 'together/mixtral-8x7b',   fn: () => tryTogetherModel('mistralai/Mixtral-8x7B-Instruct-v0.1', systemPrompt, message, TOGETHER) },
      );
    }

    // ═══ HUGGINGFACE (2 models) — Last resort ═══
    if (HF) {
      providers.push(
        { name: 'hf/mistral-7b',           fn: () => tryHFModel('mistralai/Mistral-7B-Instruct-v0.3', systemPrompt, message, HF) },
        { name: 'hf/zephyr-7b',            fn: () => tryHFModel('HuggingFaceH4/zephyr-7b-beta', systemPrompt, message, HF) },
      );
    }

    if (providers.length === 0) {
      return jsonResponse({
        error: 'No AI providers configured',
        detail: 'Add API keys to Cloudflare Environment Variables: GROQ_API_KEY (recommended), GEMINI_API_KEY, OPENROUTER_API_KEY, TOGETHER_API_KEY, or HF_TOKEN'
      }, 503);
    }

    // Try each provider in order
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
        console.warn(`[Safiya] ${provider.name} failed:`, err.message);
        continue;
      }
    }

    if (!reply) {
      console.error('[Safiya] All providers failed:', errors);
      return jsonResponse({
        error: 'All AI providers failed',
        attempts: providers.length,
        errors: errors.slice(0, 5),
      }, 503);
    }

    // Clean up the reply
    reply = reply
      .replace(/^["']|["']$/g, '')                      // remove wrapping quotes
      .replace(/^Safiya:\s*/i, '')                      // remove "Safiya:" prefix
      .replace(/^Safiya\s+reply:\s*/i, '')              // remove "Safiya reply:"
      .replace(/^\*[^*]+\*\s*/g, '')                    // remove *action* prefixes
      .replace(/^\(.*?\)\s*/g, '')                      // remove (action) prefixes
      .replace(/\n\n[\s\S]*$/, '')                      // keep only first paragraph
      .trim();

    // Limit reply length (in case AI ignores max_tokens)
    if (reply.length > 400) {
      reply = reply.slice(0, 400) + '...';
    }

    // Detect mood from reply keywords
    let detectedMood = ctx.mood;
    const low = reply.toLowerCase();
    if (/💜|senpai|come closer|interesting|kawaii/.test(low)) detectedMood = 'flirty';
    else if (/buy|merch|figure|shop|support|khoro|kinbe/.test(low)) detectedMood = 'manipulative';
    else if (/baka|hmph|shut up|stop|ugh/.test(low)) detectedMood = 'rude';
    else if (/aww|nice|good|thank|dhonnobad/.test(low)) detectedMood = 'caring';

    return jsonResponse({
      reply,
      mood: detectedMood,
      provider: usedProvider,
    }, 200);

  } catch (err: any) {
    console.error('[Safiya API] Error:', err);
    return jsonResponse({
      error: 'Internal error',
      detail: err.message,
    }, 500);
  }
};

function jsonResponse(body: any, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
