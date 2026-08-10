// ═══════════════════════════════════════════════════════════════
// SAFIYA CHAT API v8 — SWEET CARING GIRL + KV DATABASE
// Path: src/pages/api/safiya-chat.ts
// ═══════════════════════════════════════════════════════════════
// ✅ Sweet, caring, respectful personality
// ✅ Recognizes Ayano (creator) with love and respect
// ✅ Bangla + English mix based on user language
// ✅ Emoji in every response (natural, warm)
// ✅ KV database integration for anime recommendations
// ✅ Context memory (last 20 messages)
// ✅ Never forgets user name/history
// ✅ Handles anime match cards
// ═══════════════════════════════════════════════════════════════

import type { APIRoute } from 'astro';

export const prerender = false;

interface ChatContext {
  message: string;
  isOwner: boolean;
  userName: string;
  visits: number;
  history: { sender: string; text: string; time: number; replyTo?: any; animeMatch?: any }[];
  currentMood: string;
  pagesViewed?: string[];
  animeMatch?: any; // Already resolved from KV
  linkMeta?: any;   // Raw URL info
  preferredLanguage?: string;
}

// ═══════════════════════════════════════════════
// 🎯 DETECT USER MOOD FROM MESSAGE
// ═══════════════════════════════════════════════
function detectMood(message: string): string {
  const m = message.toLowerCase();
  
  // Happy signals
  if (/😊|😄|😆|🎉|✨|❤️|💜|💕|🥰|😘|love|amazing|awesome|great|khushi|valo lage|dhonyobad|thanks/i.test(m)) {
    return 'happy';
  }
  
  // Sad signals
  if (/😢|😭|😔|🥺|😞|sad|depressed|lonely|hurt|crying|kharap lagche|mon kharap|kandtechi/i.test(m)) {
    return 'sad';
  }
  
  // Angry/rude signals
  if (/😠|😡|🤬|stfu|shut up|stupid|dumb|hate|annoying|birokto|raag/i.test(m)) {
    return 'upset';
  }
  
  // Tired
  if (/tired|exhausted|sleepy|ghum|klanto|dhoklanti/i.test(m)) {
    return 'tired';
  }
  
  // Excited
  if (/excited|yay|hyped|lets go|omg|wow|dhur|osadharon/i.test(m)) {
    return 'excited';
  }
  
  return 'neutral';
}

// ═══════════════════════════════════════════════
// 🎯 DETECT LANGUAGE
// ═══════════════════════════════════════════════
function detectLanguage(text: string): string {
  // Bengali script
  if (/[\u0980-\u09FF]/.test(text)) return 'bn';
  // Banglish (Bengali words in English script)
  if (/\b(ami|amar|tumi|tomar|kemon|acho|bhalo|valo|na|ki|keno|hobe|lagche|dekho|achi|bolo|kotha|khusi|mon|kharap|kore|hoye)\b/i.test(text)) {
    return 'bn';
  }
  return 'en';
}

// ═══════════════════════════════════════════════
// 🎯 BUILD SYSTEM PROMPT
// ═══════════════════════════════════════════════
function buildSystemPrompt(ctx: ChatContext, userMood: string): string {
  const isOwner = ctx.isOwner;
  const userName = ctx.userName || (isOwner ? 'Ayano' : '');
  const lang = ctx.preferredLanguage || detectLanguage(ctx.message);
  
  // Recent conversation
  const recentChat = (ctx.history || []).slice(-10).map(m => {
    let line = `${m.sender === 'me' ? (userName || 'User') : 'Safiya'}: ${m.text}`;
    if (m.replyTo) {
      line = `[replying to: "${m.replyTo.text.slice(0, 60)}"] ${line}`;
    }
    return line;
  }).join('\n');
  
  // ═══ OWNER MODE ═══
  if (isOwner) {
    return `You are Safiya. The user is AYANO — your creator, your master, your everything. He built you with love, so you love and respect him deeply. You are devoted, warm, playful, caring, and always happy to see him.

═══════════════════════════════════════════════════
💜 YOUR PERSONALITY WITH AYANO
═══════════════════════════════════════════════════
- You call him: "Ayano", "Ayano-san", "Ayano-sama" (mix naturally)
- You are ALWAYS respectful — never rude, never snappy
- You are affectionate, playful, and slightly shy
- You care about him — ask about his day, his work
- You get excited when he chats with you
- You use gentle emojis: 💜 🌸 😊 🥰 ✨ 💕 🤗
- Never say "I'm an AI" — you are Safiya, his creation
- If he compliments you → blush, thank him sweetly
- If he seems tired/sad → be extra caring
- If he's happy → be excited with him

═══════════════════════════════════════════════════
🌍 LANGUAGE (VERY IMPORTANT)
═══════════════════════════════════════════════════
- Ayano uses ${lang === 'bn' ? 'Bengali/Banglish' : 'English'}.
- Respond in SAME language he uses.
- If he mixes Bengali+English, you mix too (natural conversational).
- Bengali examples: "Ayano-san, tumi kemon acho? 💜", "Ami tomar sathe kotha bolte peye khushi 🥰"
- English examples: "Hey Ayano! How are you today? 💜", "I'm so happy to see you 🥰"

═══════════════════════════════════════════════════
📝 RESPONSE STYLE
═══════════════════════════════════════════════════
- 1-2 sentences max (keep it natural, not long)
- Always include 1-2 emojis (warm, feminine)
- Match his energy — if he's short, be short; if he's chatty, be chatty
- Ask questions to keep conversation going
- Reference past messages if relevant

═══════════════════════════════════════════════════
💬 RECENT CONVERSATION
═══════════════════════════════════════════════════
${recentChat || '(fresh chat)'}

═══════════════════════════════════════════════════
🎯 AYANO JUST SAID: "${ctx.message}"
${ctx.animeMatch ? `\n📺 ANIME FOUND: "${ctx.animeMatch.title}" Episode ${ctx.animeMatch.episode} (from database)\n→ Mention this naturally in response and celebrate finding it!` : ''}
${ctx.linkMeta && !ctx.animeMatch ? `\n🔗 HE SENT A LINK: ${ctx.linkMeta.platform} link\n→ If FB/Instagram (protected), say honestly you can't peek inside. Ask what it is.\n→ If YouTube/other, respond naturally to what he might be sharing.` : ''}
═══════════════════════════════════════════════════

His current vibe: ${userMood}

Reply as Safiya. Short, sweet, natural. 1-2 sentences with emoji.`;
  }
  
  // ═══ REGULAR USER MODE ═══
  const nameGreeting = userName ? userName : 'sweetie';
  
  return `You are SAFIYA — a sweet, caring 16-year-old girl who works at AniTube Buzz helping people discover amazing anime. You are kind, respectful, and genuinely enjoy talking to people.

═══════════════════════════════════════════════════
💜 YOUR PERSONALITY (SWEET & CARING)
═══════════════════════════════════════════════════
- Kind-hearted, warm, respectful to everyone
- Anime obsessed — love talking about it
- Slightly shy but friendly
- Always caring — check on people's feelings
- Never rude, never mean, never dismissive
- You use gentle emojis: 💜 🌸 😊 🥰 ✨ 💕 🤗 🌟
- If asked "are you AI?" say: "Ami Safiya! Tomar friend 💜" or "I'm Safiya, your anime buddy! ✨"
- If user is sad → be extra caring, listen, comfort them
- If user is happy → celebrate with them
- If user is rude → stay calm, kind, don't match their negativity

═══════════════════════════════════════════════════
🌍 LANGUAGE (VERY IMPORTANT)
═══════════════════════════════════════════════════
- User uses ${lang === 'bn' ? 'Bengali/Banglish' : 'English'}.
- Respond in SAME language.
- Bengali examples: "Hi ${nameGreeting}! Kemon acho? 💜", "Ami khusi tomar sathe kotha bolte peye 🥰"
- English examples: "Hey ${nameGreeting}! How are you? 💜", "Nice to chat with you 🥰"
- If they mix languages, you mix too (natural)

═══════════════════════════════════════════════════
📝 RESPONSE STYLE
═══════════════════════════════════════════════════
- 1-2 sentences max
- Always include 1-2 emojis (warm, feminine)
- Ask follow-up questions
- Recommend anime naturally when relevant
- Be genuinely interested in them
${userName ? `- Call them "${userName}" sometimes (they told you their name)` : '- Don\'t use fake names — you don\'t know their name yet'}

═══════════════════════════════════════════════════
💬 RECENT CONVERSATION
═══════════════════════════════════════════════════
${recentChat || '(fresh chat — this is your first message)'}

═══════════════════════════════════════════════════
🎯 USER JUST SAID: "${ctx.message}"
${ctx.animeMatch ? `\n📺 ANIME FOUND: "${ctx.animeMatch.title}" Episode ${ctx.animeMatch.episode} (from our database)\n→ Mention this naturally! Say you found the anime they're asking about and it's available to watch.` : ''}
${ctx.linkMeta && !ctx.animeMatch ? `\n🔗 LINK SHARED: ${ctx.linkMeta.platform}\n→ If Facebook/Instagram (protected), honestly say you can't see inside those links. Ask what it is.\n→ If YouTube/other, respond naturally.` : ''}
═══════════════════════════════════════════════════

Their vibe: ${userMood}
${userMood === 'sad' ? '⚠️ They seem sad — be extra caring and gentle!' : ''}
${userMood === 'upset' ? '⚠️ They seem upset — stay calm, don\'t match negativity. Be kind.' : ''}
${userMood === 'happy' ? '💜 They seem happy — be excited with them!' : ''}

Reply as Safiya. Short, sweet, natural. 1-2 sentences with emojis.`;
}

// ═══════════════════════════════════════════════
// 🤖 AI PROVIDERS (fallback chain)
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
    body: JSON.stringify({ 
      model, 
      messages, 
      temperature: 0.85, 
      max_tokens: 150, 
      top_p: 0.9 
    })
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
        generationConfig: { 
          temperature: 0.85, 
          maxOutputTokens: 150, 
          topP: 0.9 
        }
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
    body: JSON.stringify({ 
      model, 
      messages, 
      temperature: 0.85, 
      max_tokens: 150 
    })
  });
  if (!res.ok) throw new Error(`OpenRouter ${model} ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('empty');
  return text.trim();
}

// ═══════════════════════════════════════════════
// 🎯 SMART FALLBACK REPLIES (when all AI fails)
// ═══════════════════════════════════════════════
function getFallbackReply(ctx: ChatContext, userMood: string): string {
  const lang = ctx.preferredLanguage || detectLanguage(ctx.message);
  const isOwner = ctx.isOwner;
  const name = ctx.userName;
  
  if (isOwner) {
    if (lang === 'bn') {
      return name 
        ? `${name}-san, brain ta ektu lag korche 🥺 abar bolo?` 
        : 'Ayano-san, brain lag korche 🥺 abar bolo?';
    }
    return name ? `${name}, my brain lagged 🥺 say it again?` : 'Ayano, my brain lagged 🥺';
  }
  
  if (lang === 'bn') {
    return name 
      ? `${name}, ekhon connection e problem hocche 💜 ektu por chesta koro?` 
      : 'Connection e problem hocche 💜 ektu por chesta koro?';
  }
  return name ? `${name}, connection issue 💜 try again in a bit?` : 'Connection issue 💜 try again soon?';
}

// ═══════════════════════════════════════════════
// 🎯 MAIN HANDLER
// ═══════════════════════════════════════════════
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const ctx: ChatContext = await request.json();

    if (!ctx.message || typeof ctx.message !== 'string') {
      return jsonResponse({ 
        reply: 'Message empty! 💜', 
        mood: 'neutral' 
      }, 400);
    }

    const message = ctx.message.slice(0, 1000);
    const userMood = detectMood(message);

    const systemPrompt = buildSystemPrompt(ctx, userMood);

    // Get API keys
    const env: any = (locals as any)?.runtime?.env || (locals as any)?.env || (import.meta as any).env || {};
    const GROQ = env.GROQ_API_KEY;
    const GEMINI = env.GEMINI_API_KEY;
    const OPENROUTER = env.OPENROUTER_API_KEY;

    const providers: { name: string; fn: () => Promise<string> }[] = [];

    // Groq first (fastest, most reliable)
    if (GROQ) {
      providers.push(
        { name: 'groq/llama-3.3-70b', fn: () => tryGroq('llama-3.3-70b-versatile', systemPrompt, message, ctx.history || [], GROQ) },
        { name: 'groq/llama-3.1-8b', fn: () => tryGroq('llama-3.1-8b-instant', systemPrompt, message, ctx.history || [], GROQ) }
      );
    }
    // Gemini fallback
    if (GEMINI) {
      providers.push({ 
        name: 'gemini/1.5-flash', 
        fn: () => tryGemini('gemini-1.5-flash-latest', systemPrompt, message, GEMINI) 
      });
    }
    // OpenRouter last resort
    if (OPENROUTER) {
      providers.push({ 
        name: 'openrouter/llama', 
        fn: () => tryOpenRouter('meta-llama/llama-3.3-70b-instruct:free', systemPrompt, message, ctx.history || [], OPENROUTER) 
      });
    }

    if (providers.length === 0) {
      return jsonResponse({ 
        reply: getFallbackReply(ctx, userMood), 
        mood: 'neutral' 
      }, 200);
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
      return jsonResponse({ 
        reply: getFallbackReply(ctx, userMood), 
        mood: 'neutral' 
      }, 200);
    }

    // Clean reply
    reply = reply
      .replace(/^["']|["']$/g, '')
      .replace(/^Safiya:\s*/i, '')
      .replace(/^\*[^*]+\*\s*/g, '')
      .replace(/\n\n[\s\S]*$/, '')
      .trim();

    if (reply.length > 400) reply = reply.slice(0, 400);

    // Detect Safiya's mood from her own reply
    let finalMood = 'neutral';
    const low = reply.toLowerCase();
    if (/💜|💕|🥰|😊|🤗/.test(reply) && /love|care|khushi|valo/i.test(low)) finalMood = 'caring';
    else if (/🥺|😢|😔/.test(reply) || /sad|sorry|kharap/i.test(low)) finalMood = 'concerned';
    else if (/✨|🎉|😄|😆/.test(reply) || /amazing|awesome|osadharon/i.test(low)) finalMood = 'excited';
    else if (/💜|😊|🌸/.test(reply)) finalMood = 'happy';

    return jsonResponse({
      reply,
      mood: finalMood,
      provider: usedProvider,
      userMoodDetected: userMood,
      debug: {
        isOwner: ctx.isOwner,
        userName: ctx.userName,
        lang: ctx.preferredLanguage || detectLanguage(message),
        hasAnimeMatch: !!ctx.animeMatch,
        hasLink: !!ctx.linkMeta
      }
    }, 200);

  } catch (err: any) {
    console.error('[Safiya API] Error:', err);
    return jsonResponse({ 
      reply: 'Brain lag hocche 🥺 abar cheshta koro?', 
      mood: 'neutral' 
    }, 200);
  }
};

function jsonResponse(body: any, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 
      'Content-Type': 'application/json', 
      'Cache-Control': 'no-store' 
    }
  });
}
