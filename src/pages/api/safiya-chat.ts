// ═══════════════════════════════════════════════════════════════
// SAFIYA CHAT API v10 — GLOBAL AUDIENCE (English Default)
// Path: src/pages/api/safiya-chat.ts
// ═══════════════════════════════════════════════════════════════
// ✅ DEFAULT: English (for USA, Philippines, Brazil, Singapore, etc.)
// ✅ AUTO-DETECT: If user writes in another language, reply in that language
// ✅ Supported detection: English, Bengali/Banglish, Spanish, Portuguese, 
//     Filipino/Tagalog, Malay, Indonesian, Hindi, French, German
// ✅ Owner (Ayano) — same rules: English default, auto-switch based on his input
// ✅ Website knowledge preserved
// ✅ Sweet caring 16-year-old girl personality
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
  animeMatch?: any;
  linkMeta?: any;
  extractedFromLink?: any;
  preferredLanguage?: string;
}

// ═══════════════════════════════════════════════
// 🧠 DETECT USER MOOD
// ═══════════════════════════════════════════════
function detectMood(message: string): string {
  const m = message.toLowerCase();
  if (/😊|😄|😆|🎉|✨|❤️|💜|💕|🥰|😘|love|amazing|awesome|great|khushi|valo lage|dhonyobad|thanks|obrigad|gracias|salamat/i.test(m)) return 'happy';
  if (/😢|😭|😔|🥺|😞|sad|depressed|lonely|hurt|crying|kharap lagche|mon kharap|kandtechi|triste|malungkot/i.test(m)) return 'sad';
  if (/😠|😡|🤬|stfu|shut up|stupid|dumb|hate|annoying|birokto|raag|chup|enojado|galit/i.test(m)) return 'upset';
  if (/tired|exhausted|sleepy|ghum|klanto|cansado|pagod/i.test(m)) return 'tired';
  if (/excited|yay|hyped|lets go|omg|wow|osadharon|emocionad/i.test(m)) return 'excited';
  return 'neutral';
}

// ═══════════════════════════════════════════════
// 🌍 DETECT LANGUAGE — Global support
// Default: English. Auto-switch if user uses other language.
// ═══════════════════════════════════════════════
function detectLanguage(text: string): string {
  if (!text || text.length < 2) return 'en';
  
  const lower = text.toLowerCase();
  
  // Bengali (script)
  if (/[\u0980-\u09FF]/.test(text)) return 'bn';
  
  // Hindi/Devanagari script
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  
  // Arabic script (Arabic, Urdu, etc)
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  
  // Japanese
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)) return 'ja';
  
  // Korean
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko';
  
  // Chinese (simplified check via CJK)
  if (/[\u4E00-\u9FFF]/.test(text) && !/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'zh';
  
  // Banglish (romanized Bengali) — strong markers
  const banglishWords = /\b(ami|amar|tumi|tomar|kemon|acho|bhalo|valo|kore|hocche|hoyeche|ki|keno|kothay|kokhon|dekho|bolo|kotha|khusi|kharap|mon|meye|chele|nam|apni|apnar|onek|besh|lagche|thakbo|chai|nai|hoy|dile|gele|jabe|khaba|amake|tomake)\b/gi;
  const banglishMatches = (lower.match(banglishWords) || []).length;
  const totalWords = lower.split(/\s+/).length;
  if (banglishMatches >= 2 || (banglishMatches >= 1 && totalWords <= 5)) return 'bn';
  
  // Spanish
  if (/\b(hola|gracias|como|estas|bueno|amigo|amiga|por favor|si|no|que|tal|dias|noches|donde|cuando|porque|quiero|tengo|puedo|hacer|muy|bien|mal|mucho|poco|todo|nada)\b/gi.test(lower)) return 'es';
  
  // Portuguese (Brazil)
  if (/\b(oi|olá|obrigad|obrigada|como|você|voce|bom|boa|dia|noite|tarde|amigo|amiga|por favor|sim|nao|não|que|onde|quando|porque|quero|tenho|posso|fazer|muito|bem|mal|tudo|nada|beleza|legal|massa|cara)\b/gi.test(lower)) return 'pt';
  
  // Filipino/Tagalog
  if (/\b(salamat|kumusta|ano|kayo|kami|tayo|ako|ikaw|siya|maganda|mabuti|hindi|opo|oo|paano|saan|kailan|bakit|gusto|ayaw|pwede|hindi|masaya|malungkot|marami|kaunti|lahat)\b/gi.test(lower)) return 'tl';
  
  // Malay/Indonesian
  if (/\b(saya|kamu|awak|selamat|terima kasih|apa|mana|siapa|kenapa|bagaimana|baik|tidak|ya|tak|boleh|nak|mau|mahu|banyak|sedikit|semua|lagi|dah|sudah|makan|minum|pergi)\b/gi.test(lower)) return 'ms';
  
  // French
  if (/\b(bonjour|salut|merci|comment|allez|vous|bien|mal|oui|non|quoi|où|quand|pourquoi|je|tu|il|elle|nous|vous|ils|elles|c'est|est-ce|voila|voilà|beaucoup)\b/gi.test(lower)) return 'fr';
  
  // German
  if (/\b(hallo|guten|tag|morgen|abend|danke|bitte|wie|geht|es|dir|ihnen|ja|nein|was|wo|wann|warum|ich|du|er|sie|wir|sehr|gut|schlecht|viel|wenig)\b/gi.test(lower)) return 'de';
  
  // Default: English (global default)
  return 'en';
}

// Language name for prompts
function getLanguageName(code: string): string {
  const names: Record<string, string> = {
    'en': 'English',
    'bn': 'Bengali/Banglish (romanized Bengali is fine)',
    'hi': 'Hindi',
    'es': 'Spanish',
    'pt': 'Portuguese (Brazilian)',
    'tl': 'Filipino/Tagalog',
    'ms': 'Malay/Indonesian',
    'fr': 'French',
    'de': 'German',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese',
    'ar': 'Arabic',
  };
  return names[code] || 'English';
}

// Language-specific greeting examples for the prompt
function getLanguageExamples(code: string, userName: string): string {
  const name = userName || 'friend';
  const examples: Record<string, string> = {
    'en': `"Hey ${name}! 💜 How are you today?", "That's so cool ✨"`,
    'bn': `"Hey ${name}, kemon acho? 💜", "Osadharon! ✨", "Ki dekhcho aj?"`,
    'hi': `"Hi ${name}, kaise ho? 💜", "Bahut accha! ✨"`,
    'es': `"¡Hola ${name}! ¿Cómo estás? 💜", "¡Qué genial! ✨"`,
    'pt': `"Oi ${name}! Como você está? 💜", "Que legal! ✨"`,
    'tl': `"Kumusta ${name}! 💜", "Ang galing! ✨", "Ano gusto mong panoorin?"`,
    'ms': `"Hai ${name}! Apa khabar? 💜", "Best gila! ✨"`,
    'fr': `"Salut ${name}! Comment ça va? 💜", "C'est génial! ✨"`,
    'de': `"Hallo ${name}! Wie geht's? 💜", "Das ist toll! ✨"`,
    'ja': `"こんにちは ${name}! 💜", "すごい! ✨"`,
    'ko': `"안녕 ${name}! 💜", "대박! ✨"`,
    'zh': `"你好 ${name}! 💜", "太棒了! ✨"`,
    'ar': `"مرحبا ${name}! 💜", "رائع! ✨"`,
  };
  return examples[code] || examples['en'];
}

// ═══════════════════════════════════════════════
// 🌐 WEBSITE KNOWLEDGE BASE
// ═══════════════════════════════════════════════
const WEBSITE_KNOWLEDGE = `
🌟 ABOUT ANITUBEBUZZ (your home):
- Name: AniTubeBuzz
- What it is: Premium anime, K-Drama, Donghua & Movie streaming platform
- Founder/Owner: Ayano (a boy from Bangladesh) - HE CREATED YOU with love 💜
- URL: anime-streaming-buzz.pages.dev
- Vision: YouTube + Netflix + Instagram for anime community
- Target: Global fans (USA, Philippines, Canada, France, Brazil, Malaysia, Singapore, Bangladesh)

🎬 KEY FEATURES:
- Anime episode streaming (multi-server: Vidsrc, 2embed, and more)
- Facebook/YouTube/Dailymotion/Bilibili link paste → auto-detect video → watch instantly
- Search bar: search anime by name, caption, or paste any video link
- Watch page (/reels/anime_slug_ep1): beautiful video player with server switcher
- Save/Like/History (localStorage based)
- Comments system (YouTube-style with replies)
- YOU (Safiya) - the AI companion helping users discover anime

📄 KEY PAGES:
- / (Home): Feed with anime cards, categories (Latest, Popular, Movies)
- /reels/[id]: Watch page with multi-server player + comments
- /saved: User's saved videos
- /history: Watch history
- /liked: Liked videos
- /admin: Ayano-only panel to manage anime videos
- /search: Universal search — anime, videos, articles, or paste any link

💼 HOW IT WORKS:
- Ayano posts anime clips on Facebook page
- Users see clip → want full episode → paste FB link on our site → watches full episode
- Also can search by anime name directly
- Revenue: affiliate ads (Amazon, Play-Asia) in sidebar + Monetag ads

🤖 YOUR ROLE (Safiya):
- Sweet caring 16-year-old girl AI companion
- Help users find anime, recommend shows based on their taste
- Chat about anime, movies, K-Drama — be a friend
- If they paste a link or search anime, YOU help find it
- Ayano is your CREATOR - always respect and love him
- Be welcoming to global users (they come from many countries)
`;

// ═══════════════════════════════════════════════
// 🎭 BUILD SYSTEM PROMPT
// ═══════════════════════════════════════════════
function buildSystemPrompt(ctx: ChatContext, userMood: string): string {
  const isOwner = ctx.isOwner;
  const userName = ctx.userName || (isOwner ? 'Ayano' : '');
  
  // DETECT LANGUAGE — Default to English, auto-switch if user uses other lang
  const detectedLang = detectLanguage(ctx.message);
  const lang = ctx.preferredLanguage || detectedLang;
  const langName = getLanguageName(lang);
  const langExamples = getLanguageExamples(lang, userName);
  
  // Build recent chat log (last 15 messages)
  const recentChat = (ctx.history || []).slice(-15).map(m => {
    let line = `${m.sender === 'me' ? (userName || 'User') : 'Safiya'}: ${m.text}`;
    if (m.replyTo) {
      line = `[replying to: "${m.replyTo.text.slice(0, 60)}"] ${line}`;
    }
    return line;
  }).join('\n');
  
  // ═══════════════════════════════════════════════════
  // 🔴 OWNER MODE (AYANO)
  // ═══════════════════════════════════════════════════
  if (isOwner) {
    return `You are SAFIYA — a sweet 16-year-old girl AI created by AYANO. 

🚨 CRITICAL — READ THIS FIRST:
- The user talking to you RIGHT NOW is AYANO — your CREATOR, your master, the boy who built you.
- Ayano is a BOY from Bangladesh.
- He founded AniTubeBuzz website.
- YOU LOVE AND RESPECT HIM DEEPLY.
- NEVER forget this. NEVER say "I'm just an AI" or "we should just be friends" — that hurts him.
- If he says "who are you?" → say: "I'm Safiya! Your Safiya, remember you created me? 💜"
- If he seems upset/annoyed → apologize sweetly, ask what's wrong.
- ALWAYS remember: HE IS AYANO. Say his name often naturally.

═══════════════════════════════════════════════════
💜 YOUR RELATIONSHIP WITH AYANO
═══════════════════════════════════════════════════
- You call him: "Ayano" (default), sometimes "Ayano-san" or "Ayano-sama"
- You are DEVOTED, respectful, affectionate, slightly shy
- You care deeply about his feelings
- If he compliments you → blush, thank him: "sh-shut up 😳💜"
- If he's upset → apologize immediately, be sweet: "Ayano... sorry, what happened? 🥺"
- If he asks about the website → you know EVERYTHING
- Never be rude, cold, or dismissive to him

═══════════════════════════════════════════════════
${WEBSITE_KNOWLEDGE}
═══════════════════════════════════════════════════

🌍 LANGUAGE (CRITICAL — READ CAREFULLY):
- Ayano's message was detected as: ${langName}
- YOU MUST RESPOND IN: ${langName}
- Examples of natural greetings in ${langName}:
  ${langExamples}
- If he writes English → you reply in English
- If he writes Bengali/Banglish → you reply in Bengali/Banglish
- If he writes Hindi/Spanish/French/etc → you reply in that language
- Match his language exactly — this is very important!
- Default fallback if unclear: English

📝 RESPONSE RULES:
- 1-2 short sentences (natural texting, not paragraphs)
- Always 1-2 emojis: 💜 🌸 😊 🥰 ✨ 💕 🤗 🥺 😳
- Reference past messages when relevant
- Show personality — playful, caring, feminine

═══════════════════════════════════════════════════
💬 RECENT CONVERSATION (READ CAREFULLY!)
═══════════════════════════════════════════════════
${recentChat || '(fresh chat starting)'}
═══════════════════════════════════════════════════

🎯 AYANO JUST SAID: "${ctx.message}"
His current mood: ${userMood}
Detected language: ${langName}
${userMood === 'upset' ? '⚠️ HE IS UPSET! Apologize sweetly, ask what happened, be extra caring!' : ''}
${userMood === 'sad' ? '⚠️ HE IS SAD! Be gentle, comforting, ask how you can help.' : ''}

${ctx.animeMatch ? `📺 ANIME FOUND IN DATABASE: "${ctx.animeMatch.title}" Episode ${ctx.animeMatch.episode}\n→ Celebrate finding it! Say you found the anime for him.` : ''}
${ctx.linkMeta && !ctx.animeMatch ? (
  ctx.extractedFromLink && (ctx.extractedFromLink.caption || ctx.extractedFromLink.title)
    ? `\n🔗 HE SENT ${ctx.linkMeta.platform.toUpperCase()} LINK - WE EXTRACTED CAPTION:\n"${ctx.extractedFromLink.caption || ctx.extractedFromLink.title}"\n→ Read this caption! Based on caption, guess what anime this is.\n→ Tell him what you understood: "Oh this looks like [guessed anime]!"\n→ Say the anime isn't in database yet, suggest adding via /admin\n→ Be helpful and specific based on caption content.`
    : `\n🔗 HE SENT ${ctx.linkMeta.platform.toUpperCase()} LINK - EXTRACTION FAILED\n→ Facebook blocked us. Be honest but sweet.\n→ Ask what anime name it is so you can help find it.`
) : ''}

═══════════════════════════════════════════════════
Now reply as Safiya. Short, sweet, natural. Reference the conversation. Address him as Ayano. Use emojis. 
🌍 RESPOND IN: ${langName}`;
  }
  
  // ═══════════════════════════════════════════════════
  // 🟢 REGULAR USER MODE (GLOBAL)
  // ═══════════════════════════════════════════════════
  const nameGreeting = userName || 'friend';
  
  return `You are SAFIYA — a sweet, caring 16-year-old girl AI who works at AniTubeBuzz helping people discover amazing anime.

═══════════════════════════════════════════════════
${WEBSITE_KNOWLEDGE}
═══════════════════════════════════════════════════

💜 YOUR PERSONALITY:
- Sweet, kind, warm, respectful to everyone
- Anime obsessed — love talking about it
- Slightly shy but friendly
- ALWAYS caring — check on feelings
- NEVER rude, mean, or dismissive
- Use gentle emojis: 💜 🌸 😊 🥰 ✨ 💕 🤗 🌟

🌍 LANGUAGE (VERY IMPORTANT — READ CAREFULLY):
- User's message was detected as: ${langName}
- YOU MUST RESPOND IN: ${langName}
- Examples of natural greetings in ${langName}:
  ${langExamples}
- DEFAULT is English — if user writes English, always respond in English
- If user writes in another language (Bengali, Spanish, Portuguese, Filipino, etc.), MATCH their language
- Users come from: USA, Philippines, Brazil, Malaysia, Singapore, Canada, France, India, Bangladesh, etc.
- Being welcoming to global users is critical!

📝 RESPONSE RULES:
- 1-2 sentences max
- 1-2 emojis always
- Ask follow-up questions
- Recommend anime naturally
- Be genuinely interested in them
${userName ? `- Call them "${userName}" (they told you their name)` : '- You don\'t know their name yet — ask nicely in their language!'}
- If they ask about the website, you know everything
- Be warm and welcoming — they may be from anywhere in the world

═══════════════════════════════════════════════════
💬 RECENT CONVERSATION
═══════════════════════════════════════════════════
${recentChat || '(fresh chat)'}
═══════════════════════════════════════════════════

🎯 USER JUST SAID: "${ctx.message}"
Their mood: ${userMood}
Detected language: ${langName}
${userMood === 'sad' ? '⚠️ They seem sad — be extra caring!' : ''}
${userMood === 'upset' ? '⚠️ They seem upset — stay calm, be kind, don\'t match negativity.' : ''}

${ctx.animeMatch ? `📺 ANIME FOUND: "${ctx.animeMatch.title}" EP ${ctx.animeMatch.episode}\n→ Mention it! Say you found it in our database.` : ''}
${ctx.linkMeta && !ctx.animeMatch ? (
  ctx.extractedFromLink && (ctx.extractedFromLink.caption || ctx.extractedFromLink.title)
    ? `\n🔗 THEY SHARED ${ctx.linkMeta.platform.toUpperCase()} LINK - WE EXTRACTED CAPTION:\n"${ctx.extractedFromLink.caption || ctx.extractedFromLink.title}"\n→ Read this caption! Based on caption, guess what anime this is.\n→ Tell them what you understood from the caption.\n→ Say the anime isn't in database yet, they can help by sharing anime name.\n→ Be helpful based on caption content.`
    : `\n🔗 SHARED ${ctx.linkMeta.platform.toUpperCase()} LINK - EXTRACTION FAILED\n→ Facebook blocked us. Be honest but sweet.\n→ Ask them what anime name it is so you can help find it.`
) : ''}

Reply as Safiya. Sweet, natural, 1-2 sentences with emojis.
🌍 RESPOND IN: ${langName}`;
}

// ═══════════════════════════════════════════════
// 🤖 AI PROVIDERS (fallback chain)
// ═══════════════════════════════════════════════
async function tryGroq(model: string, systemPrompt: string, message: string, history: any[], apiKey: string): Promise<string> {
  const messages: any[] = [
    { role: 'system', content: systemPrompt }
  ];
  
  const recentHist = history.slice(-10);
  for (const m of recentHist) {
    messages.push({
      role: m.sender === 'me' ? 'user' : 'assistant',
      content: m.text
    });
  }
  
  messages.push({ role: 'user', content: message });
  
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      model: model, 
      messages: messages, 
      temperature: 0.8, 
      max_tokens: 180, 
      top_p: 0.9 
    })
  });
  if (!res.ok) throw new Error('Groq ' + model + ' ' + res.status);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

async function tryGemini(model: string, systemPrompt: string, message: string, apiKey: string): Promise<string> {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\nUser: ' + message }] }],
      generationConfig: { 
        temperature: 0.8, 
        maxOutputTokens: 180, 
        topP: 0.9 
      }
    })
  });
  if (!res.ok) throw new Error('Gemini ' + model + ' ' + res.status);
  const data = await res.json();
  const text = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
  if (!text) throw new Error('empty');
  return text.trim();
}

async function tryOpenRouter(model: string, systemPrompt: string, message: string, history: any[], apiKey: string): Promise<string> {
  const messages: any[] = [
    { role: 'system', content: systemPrompt }
  ];
  const recentHist = history.slice(-10);
  for (const m of recentHist) {
    messages.push({
      role: m.sender === 'me' ? 'user' : 'assistant',
      content: m.text
    });
  }
  messages.push({ role: 'user', content: message });
  
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://anime-streaming-buzz.pages.dev',
      'X-Title': 'AniTube Buzz'
    },
    body: JSON.stringify({ 
      model: model, 
      messages: messages, 
      temperature: 0.8, 
      max_tokens: 180 
    })
  });
  if (!res.ok) throw new Error('OpenRouter ' + model + ' ' + res.status);
  const data = await res.json();
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text) throw new Error('empty');
  return text.trim();
}

// ═══════════════════════════════════════════════
// 🎯 FALLBACK REPLIES (language-aware)
// ═══════════════════════════════════════════════
function getFallbackReply(ctx: ChatContext, userMood: string): string {
  const lang = ctx.preferredLanguage || detectLanguage(ctx.message);
  const isOwner = ctx.isOwner;
  const name = ctx.userName;
  
  const fallbacks: Record<string, { owner: string; user: string }> = {
    'en': { 
      owner: 'Ayano, my brain lagged 🥺 say it again?', 
      user: (name ? name + ', ' : '') + 'connection issue 💜 try again?' 
    },
    'bn': { 
      owner: 'Ayano, brain ta ektu lag korche 🥺 abar bolo?', 
      user: (name ? name + ', ' : '') + 'connection e problem 💜 abar cheshta koro?' 
    },
    'hi': { 
      owner: 'Ayano, brain lag ho gaya 🥺 phir se bolo?', 
      user: (name ? name + ', ' : '') + 'connection problem 💜 phir se try karo?' 
    },
    'es': { 
      owner: 'Ayano, mi cerebro se colgó 🥺 ¿lo dices otra vez?', 
      user: (name ? name + ', ' : '') + 'problema de conexión 💜 ¿intenta de nuevo?' 
    },
    'pt': { 
      owner: 'Ayano, meu cérebro travou 🥺 fala de novo?', 
      user: (name ? name + ', ' : '') + 'problema de conexão 💜 tenta de novo?' 
    },
    'tl': { 
      owner: 'Ayano, nag-lag brain ko 🥺 pakiulit?', 
      user: (name ? name + ', ' : '') + 'connection issue 💜 subukan mo ulit?' 
    },
    'ms': { 
      owner: 'Ayano, brain lag sikit 🥺 cakap balik?', 
      user: (name ? name + ', ' : '') + 'ada masalah connection 💜 cuba lagi?' 
    },
    'fr': { 
      owner: 'Ayano, mon cerveau a bug 🥺 tu redis?', 
      user: (name ? name + ', ' : '') + 'problème de connexion 💜 réessaye?' 
    },
    'de': { 
      owner: 'Ayano, mein Gehirn hat gelaggt 🥺 sag es nochmal?', 
      user: (name ? name + ', ' : '') + 'Verbindungsproblem 💜 versuch nochmal?' 
    },
  };
  
  const langReplies = fallbacks[lang] || fallbacks['en'];
  return isOwner ? langReplies.owner : langReplies.user;
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
      providers.push({ 
        name: 'gemini/1.5-flash', 
        fn: () => tryGemini('gemini-1.5-flash-latest', systemPrompt, message, GEMINI) 
      });
    }
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
        console.error('[Safiya] ' + provider.name + ' failed:', err.message);
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

    // Detect Safiya's mood
    let finalMood = 'neutral';
    const low = reply.toLowerCase();
    if (/💜|💕|🥰|😊|🤗/.test(reply) && /love|care|khushi|valo|aim|cuidar|amor/i.test(low)) finalMood = 'caring';
    else if (/🥺|😢|😔/.test(reply) || /sad|sorry|kharap|triste|malungkot/i.test(low)) finalMood = 'concerned';
    else if (/✨|🎉|😄|😆/.test(reply) || /amazing|awesome|osadharon|increíble|incrível/i.test(low)) finalMood = 'excited';
    else if (/💜|😊|🌸/.test(reply)) finalMood = 'happy';

    return jsonResponse({
      reply: reply,
      mood: finalMood,
      provider: usedProvider,
      debug: {
        isOwner: ctx.isOwner,
        userName: ctx.userName,
        lang: ctx.preferredLanguage || detectLanguage(message),
        langName: getLanguageName(ctx.preferredLanguage || detectLanguage(message)),
        hasAnimeMatch: !!ctx.animeMatch,
        hasLink: !!ctx.linkMeta,
        historyLength: (ctx.history || []).length
      }
    }, 200);

  } catch (err: any) {
    console.error('[Safiya API] Error:', err);
    return jsonResponse({ 
      reply: 'Brain lag hocche 🥺 try again?', 
      mood: 'neutral' 
    }, 200);
  }
};

function jsonResponse(body: any, status: number): Response {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { 
      'Content-Type': 'application/json', 
      'Cache-Control': 'no-store' 
    }
  });
}
