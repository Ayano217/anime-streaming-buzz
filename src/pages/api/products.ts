// ═══════════════════════════════════════════════════════════════
// AniTube Buzz — Dynamic Products API
// ═══════════════════════════════════════════════════════════════
// Path: src/pages/api/products.ts
// Commit: feat: add dynamic products API with Amazon + Play-Asia affiliate auto-tagging
//
// WHY: Powers the native shop experience. Products appear as site content,
//      not ads. Auto-injects affiliate tags. Trending products float to top.
//      Nothing is ever deleted — old products just rank lower.
//
// ENDPOINTS:
//   GET /api/products                     → all products (trending first)
//   GET /api/products?category=figures    → filter by category
//   GET /api/products?anime=chainsaw-man  → products related to an anime
//   GET /api/products?q=jujutsu           → search products
//   GET /api/products?trending=true       → top trending only
//   GET /api/products?limit=12&offset=0   → pagination
// ═══════════════════════════════════════════════════════════════

import type { APIRoute } from 'astro';


// Site runs in `output: 'hybrid'` mode — API routes must opt out of 
// prerendering to read query params at runtime. Without this, the route
// gets baked as static at build time and ignores ?trending=true etc.
export const prerender = false;

// ─── Types ───────────────────────────────────────────────────
interface Product {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  image: string;
  images: string[];           // multiple product images
  video: string | null;       // YouTube/DM embed URL (null if none)
  category: ProductCategory;
  price: string;              // display price like "$34.99"
  priceNum: number;           // numeric for sorting
  currency: string;
  store: 'amazon' | 'playasia' | 'cdjapan';
  rawUrl: string;             // base product URL (affiliate tag added automatically)
  animeTag: string[];         // related anime slugs for contextual display
  tags: string[];             // searchable tags
  badge: string | null;       // "🔥 HOT", "NEW", "LIMITED", "BEST SELLER" etc
  rating: number;             // 1-5 stars
  reviews: number;            // review count
  releaseDate: string;        // ISO date — newer = higher rank
  trendScore: number;         // 0-100, calculated from hype + recency
  inStock: boolean;
  featured: boolean;          // manually mark as featured
}

type ProductCategory = 
  | 'figures' 
  | 'manga' 
  | 'posters' 
  | 'apparel' 
  | 'accessories' 
  | 'games' 
  | 'bluray' 
  | 'cosplay'
  | 'collectibles'
  | 'snacks';

// ─── Affiliate URL Builders ──────────────────────────────────
// These functions auto-inject YOUR affiliate IDs into any product URL.
// Users click → goes to Amazon/Play-Asia with YOUR tracking → you earn commission.
// The URL looks clean and native — nobody suspects affiliate links.

const AMAZON_TAG = 'anitubebuzz-20';
const PLAYASIA_REF = '6797065';
const CDJAPAN_AFF = 'YOUR_AFFILIATE_ID'; // Replace when CDJapan approves

function buildAffiliateUrl(product: { store: string; rawUrl: string }): string {
  const url = product.rawUrl;
  
  switch (product.store) {
    case 'amazon': {
      // Amazon Associates: append tag parameter
      // Works with any amazon.com URL — product pages, search, category
      const separator = url.includes('?') ? '&' : '?';
      return url + separator + 'tag=' + AMAZON_TAG;
    }
    case 'playasia': {
      // Play-Asia: append affiliate_id parameter
      const separator = url.includes('?') ? '&' : '?';
      return url + separator + 'affiliate_id=' + PLAYASIA_REF;
    }
    case 'cdjapan': {
      // CDJapan: append aff parameter (when approved)
      if (CDJAPAN_AFF === 'YOUR_AFFILIATE_ID') return url; // skip if not set
      const separator = url.includes('?') ? '&' : '?';
      return url + separator + 'aff=' + CDJAPAN_AFF;
    }
    default:
      return url;
  }
}

// ─── Trend Score Calculator ──────────────────────────────────
// Products with higher trend scores appear first.
// Score = recency (how new) + hype (manual boost) + rating weight
// This ensures NEW trending anime products always float to the top,
// while older products naturally sink down (but never disappear).

function calculateTrendScore(product: { 
  releaseDate: string; 
  trendScore: number; 
  rating: number; 
  reviews: number;
  featured: boolean;
}): number {
  const now = Date.now();
  const released = new Date(product.releaseDate).getTime();
  const ageInDays = Math.max(0, (now - released) / (1000 * 60 * 60 * 24));
  
  // Recency bonus: newer items get up to 40 points, decays over 90 days
  const recencyBonus = Math.max(0, 40 * (1 - ageInDays / 90));
  
  // Rating bonus: up to 20 points for 5-star items with many reviews
  const ratingBonus = (product.rating / 5) * 15 + Math.min(5, product.reviews / 100);
  
  // Featured boost: manually featured items get extra 15 points
  const featuredBonus = product.featured ? 15 : 0;
  
  // Base trend score (manually set, 0-100) weighted at 40%
  const baseScore = product.trendScore * 0.4;
  
  return Math.round(baseScore + recencyBonus + ratingBonus + featuredBonus);
}

// ─── Product Database ────────────────────────────────────────
// WHY curated list: Amazon Product API costs $$$ and has strict limits.
// Play-Asia has no public API. So we maintain a curated list that:
// 1. Gets updated by GitHub Actions (auto-publish workflow can add new items)
// 2. Can be manually updated by adding entries here
// 3. Always has affiliate URLs auto-injected at runtime
//
// TO ADD NEW PRODUCTS: Just add an entry to this array.
// The trend score system automatically ranks them.

const PRODUCTS: Product[] = [

  // ═══════════════════════════════════════════
  // 🔥 FIGURES & STATUES (Amazon)
  // ═══════════════════════════════════════════
  {
    id: 'fig-csm-power-01',
    title: 'Power (Chainsaw Man) Premium Figure',
    subtitle: 'Banpresto — Chain Spirits Vol.3',
    description: 'High-quality Power figure from Chainsaw Man. Stunning detail with her signature horns and blood fiend design. Perfect for any anime shelf.',
    image: 'https://m.media-amazon.com/images/I/71dX7kR2WjL._AC_SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/71dX7kR2WjL._AC_SL1500_.jpg',
      'https://m.media-amazon.com/images/I/71YQd2NATRL._AC_SL1500_.jpg',
    ],
    video: null,
    category: 'figures',
    price: '$29.99',
    priceNum: 29.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/Banpresto-Chainsaw-Man-Chain-Spirits/dp/B0BKZV8VVG',
    animeTag: ['chainsaw-man'],
    tags: ['chainsaw man', 'power', 'figure', 'banpresto', 'anime figure', 'blood fiend'],
    badge: '🔥 HOT',
    rating: 4.7,
    reviews: 1247,
    releaseDate: '2024-11-01',
    trendScore: 92,
    inStock: true,
    featured: true,
  },
  {
    id: 'fig-jjk-gojo-01',
    title: 'Gojo Satoru — Hollow Purple Figure',
    subtitle: 'Bandai Spirits — Jujutsu Kaisen',
    description: 'The strongest sorcerer in his most iconic pose. Hollow Purple effect parts included. Limited edition with stunning paint detail.',
    image: 'https://m.media-amazon.com/images/I/61oQd5B6URL._AC_SL1000_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/61oQd5B6URL._AC_SL1000_.jpg',
    ],
    video: 'https://www.youtube.com/embed/8fGFjoeyc6I',
    category: 'figures',
    price: '$42.99',
    priceNum: 42.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/Banpresto-Jujutsu-Kaisen-Satoru-Figure/dp/B0C1J3KNRN',
    animeTag: ['jujutsu-kaisen', 'jujutsu-kaisen-2nd-season'],
    tags: ['jujutsu kaisen', 'gojo', 'satoru', 'figure', 'hollow purple', 'bandai'],
    badge: 'BEST SELLER',
    rating: 4.8,
    reviews: 2103,
    releaseDate: '2024-10-15',
    trendScore: 95,
    inStock: true,
    featured: true,
  },
  {
    id: 'fig-sl-sung-01',
    title: 'Sung Jin-Woo Shadow Monarch Figure',
    subtitle: 'Solo Leveling — Premium Statue',
    description: 'The Shadow Monarch in full glory. Incredibly detailed sculpt with purple shadow effect base. A must-have for Solo Leveling fans.',
    image: 'https://m.media-amazon.com/images/I/61QKkR-KXWL._AC_SL1000_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/61QKkR-KXWL._AC_SL1000_.jpg',
    ],
    video: null,
    category: 'figures',
    price: '$54.99',
    priceNum: 54.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/Solo-Leveling-Jin-Woo-Figure/dp/B0CQ5RVRXJ',
    animeTag: ['solo-leveling'],
    tags: ['solo leveling', 'sung jin-woo', 'shadow monarch', 'figure', 'manhwa'],
    badge: '🔥 TRENDING',
    rating: 4.6,
    reviews: 876,
    releaseDate: '2025-01-10',
    trendScore: 90,
    inStock: true,
    featured: true,
  },
  {
    id: 'fig-op-luffy-gear5',
    title: 'Luffy Gear 5 — Sun God Nika Figure',
    subtitle: 'Bandai — One Piece DXF',
    description: 'Gear 5 Luffy in his legendary Sun God Nika form. White hair, joyful expression, incredible dynamic pose with cloud effects.',
    image: 'https://m.media-amazon.com/images/I/61w7ONUTJXL._AC_SL1000_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/61w7ONUTJXL._AC_SL1000_.jpg',
    ],
    video: 'https://www.youtube.com/embed/eNxO9MKmtZA',
    category: 'figures',
    price: '$36.99',
    priceNum: 36.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/Banpresto-Piece-DXF-Warriors-Wano/dp/B0C5KSVPRM',
    animeTag: ['one-piece'],
    tags: ['one piece', 'luffy', 'gear 5', 'nika', 'sun god', 'figure', 'bandai'],
    badge: 'ICONIC',
    rating: 4.9,
    reviews: 3421,
    releaseDate: '2024-08-20',
    trendScore: 88,
    inStock: true,
    featured: true,
  },
  {
    id: 'fig-ds-nezuko-01',
    title: 'Nezuko Kamado — Blood Demon Art Figure',
    subtitle: 'Demon Slayer — Vibration Stars',
    description: 'Nezuko in her Blood Demon Art form with pink flame effects. Beautiful sculpt capturing her fierce protective nature.',
    image: 'https://m.media-amazon.com/images/I/61PxN-3A3bL._AC_SL1000_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/61PxN-3A3bL._AC_SL1000_.jpg',
    ],
    video: null,
    category: 'figures',
    price: '$32.99',
    priceNum: 32.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/Banpresto-Demon-Slayer-Nezuko-Kamado/dp/B0B6CX1HPP',
    animeTag: ['demon-slayer', 'kimetsu-no-yaiba'],
    tags: ['demon slayer', 'nezuko', 'kamado', 'figure', 'blood demon art'],
    badge: null,
    rating: 4.7,
    reviews: 1876,
    releaseDate: '2024-06-10',
    trendScore: 78,
    inStock: true,
    featured: false,
  },
  {
    id: 'fig-aot-levi-01',
    title: 'Levi Ackerman — Final Season Figure',
    subtitle: 'Attack on Titan — Special Edition',
    description: 'Captain Levi in his Final Season design. Dual blade pose with incredible cape detail. The perfect tribute to humanity\'s strongest soldier.',
    image: 'https://m.media-amazon.com/images/I/61G7PwDaBqL._AC_SL1000_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/61G7PwDaBqL._AC_SL1000_.jpg',
    ],
    video: null,
    category: 'figures',
    price: '$39.99',
    priceNum: 39.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/Attack-Titan-Ackerman-Special-Figure/dp/B0BN8R4TGJ',
    animeTag: ['attack-on-titan', 'shingeki-no-kyojin'],
    tags: ['attack on titan', 'levi', 'ackerman', 'figure', 'final season', 'aot'],
    badge: 'LEGEND',
    rating: 4.8,
    reviews: 2543,
    releaseDate: '2024-03-15',
    trendScore: 75,
    inStock: true,
    featured: false,
  },
  {
    id: 'fig-spy-anya-01',
    title: 'Anya Forger — Waku Waku Figure',
    subtitle: 'SPY x FAMILY — Puchieete Series',
    description: 'Anya in her iconic excited "Waku Waku" pose! Adorable sculpt perfect for any desk. One of the most popular anime figures of the year.',
    image: 'https://m.media-amazon.com/images/I/51lIXrCpUhL._AC_SL1000_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/51lIXrCpUhL._AC_SL1000_.jpg',
    ],
    video: null,
    category: 'figures',
    price: '$24.99',
    priceNum: 24.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/Banpresto-Family-Puchieete-Anya-Forger/dp/B0BLTK7KJP',
    animeTag: ['spy-x-family'],
    tags: ['spy x family', 'anya', 'forger', 'waku waku', 'figure', 'cute'],
    badge: '💖 FAN FAVORITE',
    rating: 4.9,
    reviews: 4201,
    releaseDate: '2024-04-01',
    trendScore: 82,
    inStock: true,
    featured: true,
  },
  {
    id: 'fig-dbs-vegeta-01',
    title: 'Vegeta Ultra Ego — Premium Figure',
    subtitle: 'Dragon Ball Super — Maximatic',
    description: 'Vegeta in his fearsome Ultra Ego form. Incredible muscle detail and purple aura effect base. A Dragon Ball collection centerpiece.',
    image: 'https://m.media-amazon.com/images/I/61M7nH5O3ML._AC_SL1000_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/61M7nH5O3ML._AC_SL1000_.jpg',
    ],
    video: null,
    category: 'figures',
    price: '$44.99',
    priceNum: 44.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/Banpresto-Dragon-Ball-Maximatic-Vegeta/dp/B0CJKZ5MMR',
    animeTag: ['dragon-ball-super', 'dragon-ball'],
    tags: ['dragon ball', 'vegeta', 'ultra ego', 'figure', 'dbs', 'bandai'],
    badge: null,
    rating: 4.6,
    reviews: 987,
    releaseDate: '2024-07-20',
    trendScore: 70,
    inStock: true,
    featured: false,
  },

  // ═══════════════════════════════════════════
  // 📚 MANGA (Amazon)
  // ═══════════════════════════════════════════
  {
    id: 'manga-csm-box-01',
    title: 'Chainsaw Man Box Set (Vol 1-11)',
    subtitle: 'Tatsuki Fujimoto — Complete Part 1',
    description: 'The complete first part of the viral sensation Chainsaw Man. Includes all 11 volumes in a premium collector\'s box with exclusive poster.',
    image: 'https://m.media-amazon.com/images/I/81nY4gRSD8L._SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/81nY4gRSD8L._SL1500_.jpg',
    ],
    video: null,
    category: 'manga',
    price: '$69.99',
    priceNum: 69.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/Chainsaw-Man-Box-Volumes-1-11/dp/1974741427',
    animeTag: ['chainsaw-man'],
    tags: ['chainsaw man', 'manga', 'box set', 'fujimoto', 'complete', 'collector'],
    badge: '📦 BOX SET',
    rating: 4.9,
    reviews: 5678,
    releaseDate: '2024-06-01',
    trendScore: 88,
    inStock: true,
    featured: true,
  },
  {
    id: 'manga-jjk-01',
    title: 'Jujutsu Kaisen Vol. 0-25 Collection',
    subtitle: 'Gege Akutami — Full Series',
    description: 'Catch up on the entire Jujutsu Kaisen saga. From the prequel Volume 0 through the Culling Game arc. The ultimate sorcery experience.',
    image: 'https://m.media-amazon.com/images/I/81TfMKVBY+L._SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/81TfMKVBY+L._SL1500_.jpg',
    ],
    video: null,
    category: 'manga',
    price: '$9.99',
    priceNum: 9.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/Jujutsu-Kaisen-Vol-Gege-Akutami/dp/1974710029',
    animeTag: ['jujutsu-kaisen'],
    tags: ['jujutsu kaisen', 'manga', 'gojo', 'akutami', 'sorcery', 'jjk'],
    badge: null,
    rating: 4.9,
    reviews: 12045,
    releaseDate: '2024-09-01',
    trendScore: 85,
    inStock: true,
    featured: false,
  },
  {
    id: 'manga-sl-01',
    title: 'Solo Leveling Vol. 1 (Comic/Manhwa)',
    subtitle: 'Dubu (REDICE Studio) — Full Color',
    description: 'The #1 manhwa worldwide in stunning full-color print. Follow Sung Jin-Woo from E-Rank hunter to Shadow Monarch. Absolutely gorgeous artwork.',
    image: 'https://m.media-amazon.com/images/I/81MiFk4dMrL._SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/81MiFk4dMrL._SL1500_.jpg',
    ],
    video: null,
    category: 'manga',
    price: '$14.99',
    priceNum: 14.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/Solo-Leveling-Vol-1-comic/dp/197531008X',
    animeTag: ['solo-leveling'],
    tags: ['solo leveling', 'manhwa', 'sung jin-woo', 'full color', 'comic', 'korean'],
    badge: '#1 MANHWA',
    rating: 4.8,
    reviews: 8932,
    releaseDate: '2024-05-15',
    trendScore: 87,
    inStock: true,
    featured: true,
  },
  {
    id: 'manga-op-box4',
    title: 'One Piece Box Set 4 (Vol 71-90)',
    subtitle: 'Eiichiro Oda — Dressrosa to Reverie',
    description: 'Volumes 71-90 covering the Dressrosa and Whole Cake Island arcs. Premium box with exclusive mini-comic and poster included.',
    image: 'https://m.media-amazon.com/images/I/A1GmFLDYJwL._SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/A1GmFLDYJwL._SL1500_.jpg',
    ],
    video: null,
    category: 'manga',
    price: '$149.99',
    priceNum: 149.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/One-Piece-Box-Set-Dressrosa/dp/1974725987',
    animeTag: ['one-piece'],
    tags: ['one piece', 'manga', 'box set', 'oda', 'dressrosa', 'collector'],
    badge: '📦 PREMIUM SET',
    rating: 4.9,
    reviews: 3456,
    releaseDate: '2024-02-01',
    trendScore: 76,
    inStock: true,
    featured: false,
  },

  // ═══════════════════════════════════════════
  // 🎮 GAMES (Play-Asia)
  // ═══════════════════════════════════════════
  {
    id: 'game-dbz-sparking',
    title: 'Dragon Ball: Sparking! ZERO',
    subtitle: 'PS5 — Bandai Namco',
    description: 'The long-awaited return of Budokai Tenkaichi! 180+ playable characters, stunning graphics, and explosive combat. The ultimate Dragon Ball game.',
    image: 'https://www.play-asia.com/dragon-ball-sparking-zero/13/70j9a7',
    images: [
      'https://www.play-asia.com/dragon-ball-sparking-zero/13/70j9a7',
    ],
    video: 'https://www.youtube.com/embed/o1UrKfUMYyQ',
    category: 'games',
    price: '$59.99',
    priceNum: 59.99,
    currency: 'USD',
    store: 'playasia',
    rawUrl: 'https://www.play-asia.com/dragon-ball-sparking-zero/13/70j9a7',
    animeTag: ['dragon-ball-super', 'dragon-ball', 'dragon-ball-z'],
    tags: ['dragon ball', 'sparking zero', 'game', 'ps5', 'fighting', 'bandai', 'budokai'],
    badge: '🎮 NEW RELEASE',
    rating: 4.8,
    reviews: 6789,
    releaseDate: '2025-01-15',
    trendScore: 94,
    inStock: true,
    featured: true,
  },
  {
    id: 'game-naruto-storm',
    title: 'Naruto x Boruto Ultimate Ninja Storm Connections',
    subtitle: 'PS5/PS4 — Bandai Namco',
    description: 'Over 130 playable ninja! Relive the entire Naruto saga from the original series through Boruto. New story mode and online battles.',
    image: 'https://www.play-asia.com/naruto-x-boruto-ultimate-ninja-storm-connections/13/70gx8v',
    images: [
      'https://www.play-asia.com/naruto-x-boruto-ultimate-ninja-storm-connections/13/70gx8v',
    ],
    video: 'https://www.youtube.com/embed/9XlPa2yOJeo',
    category: 'games',
    price: '$49.99',
    priceNum: 49.99,
    currency: 'USD',
    store: 'playasia',
    rawUrl: 'https://www.play-asia.com/naruto-x-boruto-ultimate-ninja-storm-connections/13/70gx8v',
    animeTag: ['naruto', 'boruto', 'naruto-shippuden'],
    tags: ['naruto', 'boruto', 'game', 'ninja storm', 'fighting', 'ps5'],
    badge: null,
    rating: 4.5,
    reviews: 3421,
    releaseDate: '2024-11-01',
    trendScore: 72,
    inStock: true,
    featured: false,
  },
  {
    id: 'game-jjk-cursed-clash',
    title: 'Jujutsu Kaisen: Cursed Clash',
    subtitle: 'PS5 — Bandai Namco',
    description: '2v2 anime fighting at its finest. Play as Gojo, Yuji, Megumi, and more. Unleash Domain Expansions in stunning 3D battles.',
    image: 'https://www.play-asia.com/jujutsu-kaisen-cursed-clash/13/70hw8y',
    images: [
      'https://www.play-asia.com/jujutsu-kaisen-cursed-clash/13/70hw8y',
    ],
    video: 'https://www.youtube.com/embed/tKFlW3c5Nxs',
    category: 'games',
    price: '$39.99',
    priceNum: 39.99,
    currency: 'USD',
    store: 'playasia',
    rawUrl: 'https://www.play-asia.com/jujutsu-kaisen-cursed-clash/13/70hw8y',
    animeTag: ['jujutsu-kaisen'],
    tags: ['jujutsu kaisen', 'game', 'fighting', 'ps5', 'cursed clash', 'bandai'],
    badge: null,
    rating: 4.2,
    reviews: 1234,
    releaseDate: '2024-08-01',
    trendScore: 65,
    inStock: true,
    featured: false,
  },

  // ═══════════════════════════════════════════
  // 🎨 POSTERS & WALL ART (Amazon)
  // ═══════════════════════════════════════════
  {
    id: 'poster-anime-pack',
    title: 'Anime Poster Pack (8 Posters)',
    subtitle: 'Demon Slayer, JJK, AOT, MHA & More',
    description: 'Premium quality anime poster set. 8 different popular anime series. High-resolution prints on thick card stock. Perfect for room decoration.',
    image: 'https://m.media-amazon.com/images/I/81J7THe-IYL._AC_SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/81J7THe-IYL._AC_SL1500_.jpg',
    ],
    video: null,
    category: 'posters',
    price: '$12.99',
    priceNum: 12.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/Anime-Poster-Pack-Wall-Decor/dp/B09YDFKZCP',
    animeTag: ['demon-slayer', 'jujutsu-kaisen', 'attack-on-titan', 'my-hero-academia'],
    tags: ['poster', 'wall art', 'anime decor', 'room', 'decoration', 'pack', 'multiple'],
    badge: 'BEST VALUE',
    rating: 4.5,
    reviews: 7834,
    releaseDate: '2024-01-01',
    trendScore: 72,
    inStock: true,
    featured: false,
  },

  // ═══════════════════════════════════════════
  // 👕 APPAREL (Amazon)
  // ═══════════════════════════════════════════
  {
    id: 'apparel-aot-hoodie',
    title: 'Survey Corps Premium Hoodie',
    subtitle: 'Attack on Titan — Wings of Freedom',
    description: 'Premium quality Attack on Titan hoodie with embroidered Survey Corps Wings of Freedom logo. Fleece-lined, perfect for any season.',
    image: 'https://m.media-amazon.com/images/I/61x2GzJ2-QL._AC_SL1000_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/61x2GzJ2-QL._AC_SL1000_.jpg',
    ],
    video: null,
    category: 'apparel',
    price: '$34.99',
    priceNum: 34.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/Attack-Titan-Survey-Corps-Hoodie/dp/B07XZ5XTMY',
    animeTag: ['attack-on-titan', 'shingeki-no-kyojin'],
    tags: ['attack on titan', 'hoodie', 'survey corps', 'apparel', 'clothing', 'wings of freedom'],
    badge: null,
    rating: 4.4,
    reviews: 2345,
    releaseDate: '2024-02-15',
    trendScore: 60,
    inStock: true,
    featured: false,
  },
  {
    id: 'apparel-naruto-akatsuki',
    title: 'Akatsuki Cloud Jacket',
    subtitle: 'Naruto Shippuden — Cosplay Grade',
    description: 'The iconic Akatsuki red cloud design on a high-quality zip-up jacket. Comfortable daily wear that doubles as cosplay. Sizes S-3XL.',
    image: 'https://m.media-amazon.com/images/I/61n7JF2BEOL._AC_SL1000_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/61n7JF2BEOL._AC_SL1000_.jpg',
    ],
    video: null,
    category: 'apparel',
    price: '$39.99',
    priceNum: 39.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/Naruto-Akatsuki-Cloud-Jacket/dp/B08CXFB9PN',
    animeTag: ['naruto', 'naruto-shippuden'],
    tags: ['naruto', 'akatsuki', 'jacket', 'cosplay', 'apparel', 'clothing', 'cloud'],
    badge: 'COSPLAY',
    rating: 4.6,
    reviews: 3456,
    releaseDate: '2024-03-01',
    trendScore: 68,
    inStock: true,
    featured: false,
  },

  // ═══════════════════════════════════════════
  // 🔑 ACCESSORIES (Amazon)
  // ═══════════════════════════════════════════
  {
    id: 'acc-anime-lamp',
    title: 'Anime 3D LED Illusion Night Light',
    subtitle: '16 Colors — Remote Control',
    description: 'Stunning 3D anime illusion lamp with 16 color modes. USB powered with remote control. Perfect desk accessory for any anime fan\'s room.',
    image: 'https://m.media-amazon.com/images/I/61qXKWx1G1L._AC_SL1000_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/61qXKWx1G1L._AC_SL1000_.jpg',
    ],
    video: null,
    category: 'accessories',
    price: '$19.99',
    priceNum: 19.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/Anime-Night-Light-Illusion-Lamp/dp/B0BN8QZBCM',
    animeTag: ['naruto', 'dragon-ball', 'one-piece'],
    tags: ['night light', 'lamp', 'led', '3d', 'room decor', 'accessory', 'anime light'],
    badge: '💡 COOL',
    rating: 4.3,
    reviews: 5678,
    releaseDate: '2024-01-10',
    trendScore: 62,
    inStock: true,
    featured: false,
  },
  {
    id: 'acc-jjk-keychain-set',
    title: 'Jujutsu Kaisen Keychain Set (6 Pack)',
    subtitle: 'Gojo, Yuji, Megumi, Nobara & More',
    description: 'High-quality metal keychains featuring 6 different JJK characters. Each with a unique design and Domain Expansion motif. Great gift set.',
    image: 'https://m.media-amazon.com/images/I/71Y4WfPmqfL._AC_SL1000_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/71Y4WfPmqfL._AC_SL1000_.jpg',
    ],
    video: null,
    category: 'accessories',
    price: '$14.99',
    priceNum: 14.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/Jujutsu-Kaisen-Keychain-Set-Pack/dp/B0BZQ1Y4PM',
    animeTag: ['jujutsu-kaisen'],
    tags: ['jujutsu kaisen', 'keychain', 'gojo', 'accessory', 'gift', 'set', 'metal'],
    badge: '🎁 GIFT IDEA',
    rating: 4.5,
    reviews: 2109,
    releaseDate: '2024-04-20',
    trendScore: 58,
    inStock: true,
    featured: false,
  },

  // ═══════════════════════════════════════════
  // 💿 BLU-RAY / DVD (Play-Asia + Amazon)
  // ═══════════════════════════════════════════
  {
    id: 'br-demon-slayer-s3',
    title: 'Demon Slayer: Swordsmith Village Arc Blu-ray',
    subtitle: 'Limited Edition — Japanese Import',
    description: 'Season 3 complete Blu-ray with exclusive art booklet and character cards. Japanese audio with English subtitles. Stunning Ufotable animation in 1080p.',
    image: 'https://m.media-amazon.com/images/I/81c3h4J7URL._SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/81c3h4J7URL._SL1500_.jpg',
    ],
    video: null,
    category: 'bluray',
    price: '$64.99',
    priceNum: 64.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/Demon-Slayer-Swordsmith-Village-Blu-ray/dp/B0CM5XTXJ2',
    animeTag: ['demon-slayer', 'kimetsu-no-yaiba'],
    tags: ['demon slayer', 'blu-ray', 'swordsmith village', 'season 3', 'limited edition', 'ufotable'],
    badge: 'LIMITED',
    rating: 4.9,
    reviews: 1234,
    releaseDate: '2024-07-01',
    trendScore: 70,
    inStock: true,
    featured: false,
  },

  // ═══════════════════════════════════════════
  // 🎭 COLLECTIBLES (Amazon)
  // ═══════════════════════════════════════════
  {
    id: 'col-pokemon-cards',
    title: 'Pokémon TCG: Scarlet & Violet Ultra Premium Collection',
    subtitle: 'Includes Gold Etched Cards',
    description: 'The ultimate Pokémon card collection box. Includes rare gold-etched promos, booster packs, and premium accessories. Perfect for collectors and players.',
    image: 'https://m.media-amazon.com/images/I/81xfN3GHNzL._AC_SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/81xfN3GHNzL._AC_SL1500_.jpg',
    ],
    video: 'https://www.youtube.com/embed/QJnT9pMYjJY',
    category: 'collectibles',
    price: '$89.99',
    priceNum: 89.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/Pokemon-TCG-Scarlet-Violet-Collection/dp/B0C1XXVHZR',
    animeTag: ['pokemon'],
    tags: ['pokemon', 'tcg', 'cards', 'collectible', 'scarlet violet', 'gold', 'ultra premium'],
    badge: '⭐ PREMIUM',
    rating: 4.7,
    reviews: 4567,
    releaseDate: '2024-09-15',
    trendScore: 80,
    inStock: true,
    featured: true,
  },
];

// ─── Category Metadata (for UI display) ───────────────────────
const CATEGORY_META: Record<string, { label: string; icon: string; description: string }> = {
  figures:      { label: 'Figures & Statues', icon: '🗿', description: 'Premium anime figures for your collection' },
  manga:        { label: 'Manga & Manhwa',    icon: '📚', description: 'Read the source material' },
  posters:      { label: 'Wall Art & Posters', icon: '🎨', description: 'Decorate your space' },
  apparel:      { label: 'Apparel & Clothing', icon: '👕', description: 'Wear your fandom' },
  accessories:  { label: 'Accessories',        icon: '🔑', description: 'Keychains, lamps & more' },
  games:        { label: 'Games',              icon: '🎮', description: 'Play your favorite anime' },
  bluray:       { label: 'Blu-ray & DVD',      icon: '💿', description: 'Own it in HD quality' },
  cosplay:      { label: 'Cosplay',            icon: '🎭', description: 'Become the character' },
  collectibles: { label: 'Collectibles',       icon: '⭐', description: 'Rare & limited items' },
  snacks:       { label: 'Japanese Snacks',    icon: '🍜', description: 'Taste Japan at home' },
};

// ─── API Handler ─────────────────────────────────────────────
export const GET: APIRoute = async ({ url }) => {
  try {
    const params = url.searchParams;
    const category = params.get('category');
    const anime = params.get('anime');
    const query = params.get('q');
    const trending = params.get('trending');
    const featured = params.get('featured');
    const limit = parseInt(params.get('limit') || '24');
    const offset = parseInt(params.get('offset') || '0');
    const id = params.get('id');
    
    let results = [...PRODUCTS];
    
    // ── Single product lookup ──
    if (id) {
      const product = results.find(p => p.id === id);
      if (!product) {
        return new Response(JSON.stringify({ success: false, error: 'Product not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }
        });
      }
      return new Response(JSON.stringify({
        success: true,
        product: { ...product, affiliateUrl: buildAffiliateUrl(product) },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }
      });
    }
    
    // ── Filter by category ──
    if (category) {
      results = results.filter(p => p.category === category);
    }
    
    // ── Filter by related anime ──
    if (anime) {
      const slug = anime.toLowerCase().replace(/\s+/g, '-');
      results = results.filter(p => 
        p.animeTag.some(tag => tag === slug || tag.includes(slug) || slug.includes(tag))
      );
    }
    
    // ── Search by query ──
    if (query) {
      const q = query.toLowerCase();
      results = results.filter(p => {
        const searchable = [p.title, p.subtitle, p.description, ...p.tags, ...p.animeTag].join(' ').toLowerCase();
        return searchable.includes(q) || 
               p.tags.some(t => t.includes(q)) ||
               p.animeTag.some(t => t.includes(q));
      });
    }
    
    // ── Featured only ──
    if (featured === 'true') {
      results = results.filter(p => p.featured);
    }
    
    // ── Trending only ──
    if (trending === 'true') {
      results = results.filter(p => p.trendScore >= 75);
    }
    
    // ── Calculate live trend scores & sort ──
    // Newest + highest trend score = appears first
    // This is how new products automatically float to top
    const scored = results.map(p => ({
      ...p,
      affiliateUrl: buildAffiliateUrl(p),
      liveTrendScore: calculateTrendScore(p),
    }));
    
    scored.sort((a, b) => b.liveTrendScore - a.liveTrendScore);
    
    // ── Pagination ──
    const total = scored.length;
    const paginated = scored.slice(offset, offset + limit);
    
    return new Response(JSON.stringify({
      success: true,
      products: paginated,
      total,
      categories: CATEGORY_META,
      hasMore: offset + limit < total,
      offset,
      limit,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=600', // 10 min cache
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error) {
    console.error('[Products API Error]', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
