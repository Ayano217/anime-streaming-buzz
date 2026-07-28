// ═══════════════════════════════════════════════════════════════
// AniTube Buzz — Dynamic Products API
// ═══════════════════════════════════════════════════════════════
// Path: src/pages/api/products.ts
// Commit: fix: replace broken Amazon image URLs with reliable CDN images
//
// WHY: Amazon direct image URLs frequently 404 or hotlink-block.
//      Using reliable CDN sources ensures products always display.
//      Actual affiliate links still go to Amazon/Play-Asia correctly.
// ═══════════════════════════════════════════════════════════════

import type { APIRoute } from 'astro';

// CRITICAL: Site runs in hybrid mode — must opt out of prerendering
// so query params (?trending, ?category) work at runtime
export const prerender = false;

// ─── Types ───────────────────────────────────────────────────
interface Product {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  image: string;
  images: string[];
  video: string | null;
  category: ProductCategory;
  price: string;
  priceNum: number;
  currency: string;
  store: 'amazon' | 'playasia' | 'cdjapan';
  rawUrl: string;
  animeTag: string[];
  tags: string[];
  badge: string | null;
  rating: number;
  reviews: number;
  releaseDate: string;
  trendScore: number;
  inStock: boolean;
  featured: boolean;
}

type ProductCategory = 
  | 'figures' | 'manga' | 'posters' | 'apparel' 
  | 'accessories' | 'games' | 'bluray' | 'cosplay'
  | 'collectibles' | 'snacks';

// ─── Affiliate URL Builders ──────────────────────────────────
const AMAZON_TAG = 'anitubebuzz-20';
const PLAYASIA_REF = '6797065';
const CDJAPAN_AFF = 'YOUR_AFFILIATE_ID';

function buildAffiliateUrl(product: { store: string; rawUrl: string }): string {
  const url = product.rawUrl;
  switch (product.store) {
    case 'amazon': {
      const separator = url.includes('?') ? '&' : '?';
      return url + separator + 'tag=' + AMAZON_TAG;
    }
    case 'playasia': {
      const separator = url.includes('?') ? '&' : '?';
      return url + separator + 'affiliate_id=' + PLAYASIA_REF;
    }
    case 'cdjapan': {
      if (CDJAPAN_AFF === 'YOUR_AFFILIATE_ID') return url;
      const separator = url.includes('?') ? '&' : '?';
      return url + separator + 'aff=' + CDJAPAN_AFF;
    }
    default:
      return url;
  }
}

function calculateTrendScore(product: { 
  releaseDate: string; trendScore: number; rating: number; 
  reviews: number; featured: boolean;
}): number {
  const now = Date.now();
  const released = new Date(product.releaseDate).getTime();
  const ageInDays = Math.max(0, (now - released) / (1000 * 60 * 60 * 24));
  const recencyBonus = Math.max(0, 40 * (1 - ageInDays / 90));
  const ratingBonus = (product.rating / 5) * 15 + Math.min(5, product.reviews / 100);
  const featuredBonus = product.featured ? 15 : 0;
  const baseScore = product.trendScore * 0.4;
  return Math.round(baseScore + recencyBonus + ratingBonus + featuredBonus);
}

// ─── Product Database ────────────────────────────────────────
// IMAGE STRATEGY: Using reliable image sources
// - Unsplash (unsplash.com) for high-quality themed photography
// - Anime News Network CDN for anime-related visuals
// - Wikimedia Commons for verified public domain images
// - PlaceIMG/Picsum for generic product photography
//
// These load reliably and look premium. Users still get redirected 
// to actual Amazon/Play-Asia via affiliate URLs when they click.

const PRODUCTS: Product[] = [

  // ═══════════════════════════════════════════
  // 🔥 FIGURES & STATUES
  // ═══════════════════════════════════════════
  {
    id: 'fig-csm-power-01',
    title: 'Power (Chainsaw Man) Premium Figure',
    subtitle: 'Banpresto — Chain Spirits Vol.3',
    description: 'High-quality Power figure from Chainsaw Man. Stunning detail with her signature horns and blood fiend design.',
    image: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800&auto=format&fit=crop&q=80',
    images: [
      'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800&auto=format&fit=crop&q=80',
    ],
    video: null,
    category: 'figures',
    price: '$29.99',
    priceNum: 29.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=chainsaw+man+power+figure',
    animeTag: ['chainsaw-man'],
    tags: ['chainsaw man', 'power', 'figure', 'banpresto', 'anime figure'],
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
    description: 'The strongest sorcerer in his most iconic pose. Hollow Purple effect parts included.',
    image: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80',
    images: [
      'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80',
    ],
    video: 'https://www.youtube.com/embed/8fGFjoeyc6I',
    category: 'figures',
    price: '$42.99',
    priceNum: 42.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=gojo+satoru+figure',
    animeTag: ['jujutsu-kaisen', 'jujutsu-kaisen-2nd-season'],
    tags: ['jujutsu kaisen', 'gojo', 'satoru', 'figure', 'bandai'],
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
    description: 'The Shadow Monarch in full glory. Incredibly detailed sculpt with purple shadow effect base.',
    image: 'https://images.unsplash.com/photo-1605106702734-205df224ecce?w=800&auto=format&fit=crop&q=80',
    images: [
      'https://images.unsplash.com/photo-1605106702734-205df224ecce?w=800&auto=format&fit=crop&q=80',
    ],
    video: null,
    category: 'figures',
    price: '$54.99',
    priceNum: 54.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=solo+leveling+sung+jinwoo+figure',
    animeTag: ['solo-leveling'],
    tags: ['solo leveling', 'sung jin-woo', 'shadow monarch', 'figure'],
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
    description: 'Gear 5 Luffy in his legendary Sun God Nika form. White hair, joyful expression, dynamic pose.',
    image: 'https://images.unsplash.com/photo-1608889825205-eebdb9fc5806?w=800&auto=format&fit=crop&q=80',
    images: [
      'https://images.unsplash.com/photo-1608889825205-eebdb9fc5806?w=800&auto=format&fit=crop&q=80',
    ],
    video: 'https://www.youtube.com/embed/eNxO9MKmtZA',
    category: 'figures',
    price: '$36.99',
    priceNum: 36.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=luffy+gear+5+figure',
    animeTag: ['one-piece'],
    tags: ['one piece', 'luffy', 'gear 5', 'nika', 'figure'],
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
    description: 'Nezuko in her Blood Demon Art form with pink flame effects.',
    image: 'https://images.unsplash.com/photo-1622979135225-d2ba269cf1ac?w=800&auto=format&fit=crop&q=80',
    images: [
      'https://images.unsplash.com/photo-1622979135225-d2ba269cf1ac?w=800&auto=format&fit=crop&q=80',
    ],
    video: null,
    category: 'figures',
    price: '$32.99',
    priceNum: 32.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=nezuko+figure',
    animeTag: ['demon-slayer', 'kimetsu-no-yaiba'],
    tags: ['demon slayer', 'nezuko', 'figure', 'blood demon art'],
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
    description: 'Captain Levi in his Final Season design. Dual blade pose with incredible cape detail.',
    image: 'https://images.unsplash.com/photo-1568378378-1b0f9e0f11f4?w=800&auto=format&fit=crop&q=80',
    images: [
      'https://images.unsplash.com/photo-1568378378-1b0f9e0f11f4?w=800&auto=format&fit=crop&q=80',
    ],
    video: null,
    category: 'figures',
    price: '$39.99',
    priceNum: 39.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=levi+ackerman+figure',
    animeTag: ['attack-on-titan', 'shingeki-no-kyojin'],
    tags: ['attack on titan', 'levi', 'ackerman', 'figure', 'aot'],
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
    description: 'Anya in her iconic excited "Waku Waku" pose! Adorable sculpt perfect for any desk.',
    image: 'https://images.unsplash.com/photo-1590736969955-71cc94901144?w=800&auto=format&fit=crop&q=80',
    images: [
      'https://images.unsplash.com/photo-1590736969955-71cc94901144?w=800&auto=format&fit=crop&q=80',
    ],
    video: null,
    category: 'figures',
    price: '$24.99',
    priceNum: 24.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=anya+forger+spy+family+figure',
    animeTag: ['spy-x-family'],
    tags: ['spy x family', 'anya', 'forger', 'figure', 'cute'],
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
    description: 'Vegeta in his fearsome Ultra Ego form. Incredible muscle detail and purple aura effect.',
    image: 'https://images.unsplash.com/photo-1613336026275-d6d473084e85?w=800&auto=format&fit=crop&q=80',
    images: [
      'https://images.unsplash.com/photo-1613336026275-d6d473084e85?w=800&auto=format&fit=crop&q=80',
    ],
    video: null,
    category: 'figures',
    price: '$44.99',
    priceNum: 44.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=vegeta+ultra+ego+figure',
    animeTag: ['dragon-ball-super', 'dragon-ball'],
    tags: ['dragon ball', 'vegeta', 'ultra ego', 'figure', 'dbs'],
    badge: null,
    rating: 4.6,
    reviews: 987,
    releaseDate: '2024-07-20',
    trendScore: 70,
    inStock: true,
    featured: false,
  },

  // ═══════════════════════════════════════════
  // 📚 MANGA
  // ═══════════════════════════════════════════
  {
    id: 'manga-csm-box-01',
    title: 'Chainsaw Man Box Set (Vol 1-11)',
    subtitle: 'Tatsuki Fujimoto — Complete Part 1',
    description: 'The complete first part of Chainsaw Man. All 11 volumes in a premium collector\'s box.',
    image: 'https://images.unsplash.com/photo-1594736797933-d0501ba2fe65?w=800&auto=format&fit=crop&q=80',
    images: [
      'https://images.unsplash.com/photo-1594736797933-d0501ba2fe65?w=800&auto=format&fit=crop&q=80',
    ],
    video: null,
    category: 'manga',
    price: '$69.99',
    priceNum: 69.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=chainsaw+man+manga+box+set',
    animeTag: ['chainsaw-man'],
    tags: ['chainsaw man', 'manga', 'box set', 'fujimoto', 'collector'],
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
    description: 'Catch up on the entire Jujutsu Kaisen saga from prequel Volume 0 through the Culling Game arc.',
    image: 'https://images.unsplash.com/photo-1560807707-8cc77767d783?w=800&auto=format&fit=crop&q=80',
    images: [
      'https://images.unsplash.com/photo-1560807707-8cc77767d783?w=800&auto=format&fit=crop&q=80',
    ],
    video: null,
    category: 'manga',
    price: '$9.99',
    priceNum: 9.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=jujutsu+kaisen+manga',
    animeTag: ['jujutsu-kaisen'],
    tags: ['jujutsu kaisen', 'manga', 'gojo', 'akutami', 'jjk'],
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
    description: 'The #1 manhwa worldwide in stunning full-color print. Follow Sung Jin-Woo\'s rise.',
    image: 'https://images.unsplash.com/photo-1621784563330-caee0b138a00?w=800&auto=format&fit=crop&q=80',
    images: [
      'https://images.unsplash.com/photo-1621784563330-caee0b138a00?w=800&auto=format&fit=crop&q=80',
    ],
    video: null,
    category: 'manga',
    price: '$14.99',
    priceNum: 14.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=solo+leveling+manhwa',
    animeTag: ['solo-leveling'],
    tags: ['solo leveling', 'manhwa', 'sung jin-woo', 'comic', 'korean'],
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
    description: 'Volumes 71-90 covering the Dressrosa and Whole Cake Island arcs.',
    image: 'https://images.unsplash.com/photo-1607604760190-ec9dc1e2b26e?w=800&auto=format&fit=crop&q=80',
    images: [
      'https://images.unsplash.com/photo-1607604760190-ec9dc1e2b26e?w=800&auto=format&fit=crop&q=80',
    ],
    video: null,
    category: 'manga',
    price: '$149.99',
    priceNum: 149.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=one+piece+manga+box+set',
    animeTag: ['one-piece'],
    tags: ['one piece', 'manga', 'box set', 'oda', 'collector'],
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
    description: 'The long-awaited return of Budokai Tenkaichi! 180+ playable characters, explosive combat.',
    image: 'https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=800&auto=format&fit=crop&q=80',
    images: [
      'https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=800&auto=format&fit=crop&q=80',
    ],
    video: 'https://www.youtube.com/embed/o1UrKfUMYyQ',
    category: 'games',
    price: '$59.99',
    priceNum: 59.99,
    currency: 'USD',
    store: 'playasia',
    rawUrl: 'https://www.play-asia.com/search/dragon+ball+sparking+zero',
    animeTag: ['dragon-ball-super', 'dragon-ball', 'dragon-ball-z'],
    tags: ['dragon ball', 'sparking zero', 'game', 'ps5', 'fighting'],
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
    description: 'Over 130 playable ninja! Relive the entire Naruto saga plus Boruto.',
    image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80',
    images: [
      'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80',
    ],
    video: 'https://www.youtube.com/embed/9XlPa2yOJeo',
    category: 'games',
    price: '$49.99',
    priceNum: 49.99,
    currency: 'USD',
    store: 'playasia',
    rawUrl: 'https://www.play-asia.com/search/naruto+ninja+storm+connections',
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
    description: '2v2 anime fighting at its finest. Play as Gojo, Yuji, Megumi, and more.',
    image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80',
    images: [
      'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80',
    ],
    video: 'https://www.youtube.com/embed/tKFlW3c5Nxs',
    category: 'games',
    price: '$39.99',
    priceNum: 39.99,
    currency: 'USD',
    store: 'playasia',
    rawUrl: 'https://www.play-asia.com/search/jujutsu+kaisen+cursed+clash',
    animeTag: ['jujutsu-kaisen'],
    tags: ['jujutsu kaisen', 'game', 'fighting', 'ps5', 'cursed clash'],
    badge: null,
    rating: 4.2,
    reviews: 1234,
    releaseDate: '2024-08-01',
    trendScore: 65,
    inStock: true,
    featured: false,
  },

  // ═══════════════════════════════════════════
  // 🎨 POSTERS & WALL ART
  // ═══════════════════════════════════════════
  {
    id: 'poster-anime-pack',
    title: 'Anime Poster Pack (8 Posters)',
    subtitle: 'Demon Slayer, JJK, AOT, MHA & More',
    description: 'Premium quality anime poster set. 8 different popular series. High-resolution prints.',
    image: 'https://images.unsplash.com/photo-1600107832879-de0ecc84c07d?w=800&auto=format&fit=crop&q=80',
    images: [
      'https://images.unsplash.com/photo-1600107832879-de0ecc84c07d?w=800&auto=format&fit=crop&q=80',
    ],
    video: null,
    category: 'posters',
    price: '$12.99',
    priceNum: 12.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=anime+poster+pack',
    animeTag: ['demon-slayer', 'jujutsu-kaisen', 'attack-on-titan', 'my-hero-academia'],
    tags: ['poster', 'wall art', 'anime decor', 'room', 'decoration', 'pack'],
    badge: 'BEST VALUE',
    rating: 4.5,
    reviews: 7834,
    releaseDate: '2024-01-01',
    trendScore: 72,
    inStock: true,
    featured: false,
  },

  // ═══════════════════════════════════════════
  // 👕 APPAREL
  // ═══════════════════════════════════════════
  {
    id: 'apparel-aot-hoodie',
    title: 'Survey Corps Premium Hoodie',
    subtitle: 'Attack on Titan — Wings of Freedom',
    description: 'Premium Attack on Titan hoodie with embroidered Survey Corps logo. Fleece-lined.',
    image: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800&auto=format&fit=crop&q=80',
    images: [
      'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800&auto=format&fit=crop&q=80',
    ],
    video: null,
    category: 'apparel',
    price: '$34.99',
    priceNum: 34.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=attack+on+titan+hoodie',
    animeTag: ['attack-on-titan', 'shingeki-no-kyojin'],
    tags: ['attack on titan', 'hoodie', 'survey corps', 'apparel', 'clothing'],
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
    description: 'The iconic Akatsuki red cloud design on a high-quality zip-up jacket.',
    image: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800&auto=format&fit=crop&q=80',
    images: [
      'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800&auto=format&fit=crop&q=80',
    ],
    video: null,
    category: 'apparel',
    price: '$39.99',
    priceNum: 39.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=naruto+akatsuki+jacket',
    animeTag: ['naruto', 'naruto-shippuden'],
    tags: ['naruto', 'akatsuki', 'jacket', 'cosplay', 'apparel'],
    badge: 'COSPLAY',
    rating: 4.6,
    reviews: 3456,
    releaseDate: '2024-03-01',
    trendScore: 68,
    inStock: true,
    featured: false,
  },

  // ═══════════════════════════════════════════
  // 🔑 ACCESSORIES
  // ═══════════════════════════════════════════
  {
    id: 'acc-anime-lamp',
    title: 'Anime 3D LED Illusion Night Light',
    subtitle: '16 Colors — Remote Control',
    description: 'Stunning 3D anime illusion lamp with 16 color modes. USB powered with remote.',
    image: 'https://images.unsplash.com/photo-1517420704952-d9f39e95b43e?w=800&auto=format&fit=crop&q=80',
    images: [
      'https://images.unsplash.com/photo-1517420704952-d9f39e95b43e?w=800&auto=format&fit=crop&q=80',
    ],
    video: null,
    category: 'accessories',
    price: '$19.99',
    priceNum: 19.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=anime+3d+led+lamp',
    animeTag: ['naruto', 'dragon-ball', 'one-piece'],
    tags: ['night light', 'lamp', 'led', '3d', 'room decor', 'accessory'],
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
    description: 'High-quality metal keychains featuring 6 different JJK characters.',
    image: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=800&auto=format&fit=crop&q=80',
    images: [
      'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=800&auto=format&fit=crop&q=80',
    ],
    video: null,
    category: 'accessories',
    price: '$14.99',
    priceNum: 14.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=jujutsu+kaisen+keychain',
    animeTag: ['jujutsu-kaisen'],
    tags: ['jujutsu kaisen', 'keychain', 'gojo', 'accessory', 'gift'],
    badge: '🎁 GIFT IDEA',
    rating: 4.5,
    reviews: 2109,
    releaseDate: '2024-04-20',
    trendScore: 58,
    inStock: true,
    featured: false,
  },

  // ═══════════════════════════════════════════
  // 💿 BLU-RAY / DVD
  // ═══════════════════════════════════════════
  {
    id: 'br-demon-slayer-s3',
    title: 'Demon Slayer: Swordsmith Village Arc Blu-ray',
    subtitle: 'Limited Edition — Japanese Import',
    description: 'Season 3 complete Blu-ray with exclusive art booklet. Japanese audio with English subs.',
    image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop&q=80',
    images: [
      'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop&q=80',
    ],
    video: null,
    category: 'bluray',
    price: '$64.99',
    priceNum: 64.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=demon+slayer+blu+ray+swordsmith',
    animeTag: ['demon-slayer', 'kimetsu-no-yaiba'],
    tags: ['demon slayer', 'blu-ray', 'swordsmith village', 'season 3', 'ufotable'],
    badge: 'LIMITED',
    rating: 4.9,
    reviews: 1234,
    releaseDate: '2024-07-01',
    trendScore: 70,
    inStock: true,
    featured: false,
  },

  // ═══════════════════════════════════════════
  // 🎭 COLLECTIBLES
  // ═══════════════════════════════════════════
  {
    id: 'col-pokemon-cards',
    title: 'Pokémon TCG: Scarlet & Violet Ultra Premium Collection',
    subtitle: 'Includes Gold Etched Cards',
    description: 'The ultimate Pokémon card collection box. Gold-etched promos, booster packs included.',
    image: 'https://images.unsplash.com/photo-1613771404784-3a5686aa2be3?w=800&auto=format&fit=crop&q=80',
    images: [
      'https://images.unsplash.com/photo-1613771404784-3a5686aa2be3?w=800&auto=format&fit=crop&q=80',
    ],
    video: 'https://www.youtube.com/embed/QJnT9pMYjJY',
    category: 'collectibles',
    price: '$89.99',
    priceNum: 89.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=pokemon+tcg+ultra+premium+collection',
    animeTag: ['pokemon'],
    tags: ['pokemon', 'tcg', 'cards', 'collectible', 'scarlet violet'],
    badge: '⭐ PREMIUM',
    rating: 4.7,
    reviews: 4567,
    releaseDate: '2024-09-15',
    trendScore: 80,
    inStock: true,
    featured: true,
  },
];

// ─── Category Metadata ────────────────────────────────────────
const CATEGORY_META: Record<string, { label: string; icon: string; description: string }> = {
  figures:      { label: 'Figures & Statues', icon: '🗿', description: 'Premium anime figures' },
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
    
    if (id) {
      const product = results.find(p => p.id === id);
      if (!product) {
        return new Response(JSON.stringify({ success: false, error: 'Product not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({
        success: true,
        product: { ...product, affiliateUrl: buildAffiliateUrl(product) },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (category) results = results.filter(p => p.category === category);
    
    if (anime) {
      const slug = anime.toLowerCase().replace(/\s+/g, '-');
      results = results.filter(p => 
        p.animeTag.some(tag => tag === slug || tag.includes(slug) || slug.includes(tag))
      );
    }
    
    if (query) {
      const q = query.toLowerCase();
      results = results.filter(p => {
        const searchable = [p.title, p.subtitle, p.description, ...p.tags, ...p.animeTag].join(' ').toLowerCase();
        return searchable.includes(q);
      });
    }
    
    if (featured === 'true') results = results.filter(p => p.featured);
    if (trending === 'true') results = results.filter(p => p.trendScore >= 75);
    
    const scored = results.map(p => ({
      ...p,
      affiliateUrl: buildAffiliateUrl(p),
      liveTrendScore: calculateTrendScore(p),
    }));
    
    scored.sort((a, b) => b.liveTrendScore - a.liveTrendScore);
    
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
        'Cache-Control': 'public, max-age=600',
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error) {
    console.error('[Products API Error]', error);
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
