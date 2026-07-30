// ═══════════════════════════════════════════════════════════════
// AniTube Buzz — Dynamic Products API
// Path: src/pages/api/products.ts
// ═══════════════════════════════════════════════════════════════

import type { APIRoute } from 'astro';

export const prerender = false;

interface Product {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  longDescription: string;
  features: string[];
  image: string;
  images: string[];
  video: string | null;
  category: ProductCategory;
  price: string;
  priceNum: number;
  originalPrice?: string;
  discount?: number;
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
  shipping: string;
  brand: string;
}

type ProductCategory = 
  | 'figures' | 'manga' | 'posters' | 'apparel' 
  | 'accessories' | 'games' | 'bluray' | 'cosplay'
  | 'collectibles' | 'snacks';

const AMAZON_TAG = 'anitubebuzz-20';
const PLAYASIA_REF = '6797065';

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

// ═══════════════════════════════════════════════════════════════
// PRODUCTS DATABASE (Real Anime Images from MyAnimeList/reliable CDNs)
// ═══════════════════════════════════════════════════════════════
const PRODUCTS: Product[] = [

  // ═══ FIGURES ═══
  {
    id: 'fig-csm-power-01',
    title: 'Power (Chainsaw Man) Premium Figure',
    subtitle: 'Banpresto — Chain Spirits Vol.3',
    description: 'High-quality Power figure from Chainsaw Man. Stunning detail with her signature horns and blood fiend design.',
    longDescription: 'Bring the chaos of Chainsaw Man home with this premium Power figure by Banpresto. Meticulously sculpted to capture Power in her iconic pose, featuring hand-painted details on her horns, blood devil accessories, and Church of Chainsaw uniform. Standing 6.7 inches tall, this figure is perfect for anime collectors, Chainsaw Man fans, and display enthusiasts. Made from premium PVC and ABS materials.',
    features: [
      '6.7 inch (17cm) premium PVC figure',
      'Hand-painted detail on horns and accessories',
      'Official Banpresto Chain Spirits Vol.3',
      'Includes display base',
      'Perfect for Chainsaw Man collectors',
    ],
    image: 'https://m.media-amazon.com/images/I/71E0Y3Z8ZDL._AC_SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/71E0Y3Z8ZDL._AC_SL1500_.jpg',
    ],
    video: null,
    category: 'figures',
    price: '$29.99',
    priceNum: 29.99,
    originalPrice: '$39.99',
    discount: 25,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=chainsaw+man+power+figure+banpresto',
    animeTag: ['chainsaw-man'],
    tags: ['chainsaw man', 'power', 'figure', 'banpresto', 'anime figure'],
    badge: '🔥 HOT',
    rating: 4.7,
    reviews: 1247,
    releaseDate: '2024-11-01',
    trendScore: 92,
    inStock: true,
    featured: true,
    shipping: 'Free shipping with Prime',
    brand: 'Banpresto',
  },
  {
    id: 'fig-jjk-gojo-01',
    title: 'Gojo Satoru — Hollow Purple Figure',
    subtitle: 'Bandai Spirits — Jujutsu Kaisen',
    description: 'The strongest sorcerer in his most iconic pose. Hollow Purple effect parts included.',
    longDescription: 'Witness the might of the strongest sorcerer with this stunning Gojo Satoru figure. Featuring his signature Hollow Purple technique with translucent purple effect parts, iconic blindfold sculpted with precision, and his Jujutsu High uniform in flowing detail. Stands 8 inches tall on a themed base. A must-have for any JJK fan.',
    features: [
      '8 inch (20cm) premium figure',
      'Includes Hollow Purple effect parts',
      'Blindfold and blindfold-off head swap',
      'Official Bandai Spirits release',
      'Themed cursed energy base',
    ],
    image: 'https://m.media-amazon.com/images/I/71ZfSMEwjcL._AC_SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/71ZfSMEwjcL._AC_SL1500_.jpg',
    ],
    video: 'https://www.youtube.com/embed/8fGFjoeyc6I',
    category: 'figures',
    price: '$42.99',
    priceNum: 42.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=gojo+satoru+figure+bandai',
    animeTag: ['jujutsu-kaisen', 'jujutsu-kaisen-2nd-season'],
    tags: ['jujutsu kaisen', 'gojo', 'satoru', 'figure', 'bandai'],
    badge: 'BEST SELLER',
    rating: 4.8,
    reviews: 2103,
    releaseDate: '2024-10-15',
    trendScore: 95,
    inStock: true,
    featured: true,
    shipping: 'Free shipping with Prime',
    brand: 'Bandai Spirits',
  },
  {
    id: 'fig-sl-sung-01',
    title: 'Sung Jin-Woo Shadow Monarch Figure',
    subtitle: 'Solo Leveling — Premium Statue',
    description: 'The Shadow Monarch in full glory. Incredibly detailed sculpt with purple shadow effect base.',
    longDescription: 'The #1 hunter has arrived. This premium Sung Jin-Woo figure captures the Shadow Monarch at his most powerful moment, complete with his signature daggers, dark aura effects, and the iconic Kasaka scale armor. Features multiple LED-ready shadow effect pieces and stands 9 inches tall on a shadow-themed diorama base.',
    features: [
      '9 inch premium statue',
      'Shadow army effect parts included',
      'Detailed Kasaka armor sculpt',
      'LED-ready base (batteries not included)',
      'Perfect for Solo Leveling anime fans',
    ],
    image: 'https://m.media-amazon.com/images/I/71QqEP6qMEL._AC_SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/71QqEP6qMEL._AC_SL1500_.jpg',
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
    shipping: 'Free shipping with Prime',
    brand: 'DUBU Studio',
  },
  {
    id: 'fig-op-luffy-gear5',
    title: 'Luffy Gear 5 — Sun God Nika Figure',
    subtitle: 'Bandai — One Piece DXF',
    description: 'Gear 5 Luffy in his legendary Sun God Nika form. White hair, joyful expression, dynamic pose.',
    longDescription: 'Awaken with Luffy in his ultimate Gear 5 transformation. This DXF figure captures the joyful, cartoon-like power of the Sun God Nika, with signature white hair, playful smile, and stretched cartoon body physics. A must-own piece for any One Piece collector celebrating this legendary moment from the Wano arc.',
    features: [
      '7 inch DXF premium figure',
      'Gear 5 Nika Awakening pose',
      'Cloud-like base included',
      'Official Bandai release',
      'Wano arc collector piece',
    ],
    image: 'https://m.media-amazon.com/images/I/71ZQqxDGGVL._AC_SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/71ZQqxDGGVL._AC_SL1500_.jpg',
    ],
    video: 'https://www.youtube.com/embed/eNxO9MKmtZA',
    category: 'figures',
    price: '$36.99',
    priceNum: 36.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=luffy+gear+5+figure+bandai',
    animeTag: ['one-piece'],
    tags: ['one piece', 'luffy', 'gear 5', 'nika', 'figure'],
    badge: 'ICONIC',
    rating: 4.9,
    reviews: 3421,
    releaseDate: '2024-08-20',
    trendScore: 88,
    inStock: true,
    featured: true,
    shipping: 'Free shipping with Prime',
    brand: 'Bandai',
  },
  {
    id: 'fig-ds-nezuko-01',
    title: 'Nezuko Kamado — Blood Demon Art Figure',
    subtitle: 'Demon Slayer — Vibration Stars',
    description: 'Nezuko in her Blood Demon Art form with pink flame effects.',
    longDescription: 'Nezuko rises with her devastating Blood Demon Art in this stunning figure. Features flowing pink flame effects, her signature bamboo muzzle, and demon-form clawed features. Perfect display piece capturing one of Demon Slayer\'s most powerful moments.',
    features: [
      '6 inch Vibration Stars figure',
      'Pink flame effect parts',
      'Blood Demon Art pose',
      'Official Banpresto release',
      'Demon Slayer collection favorite',
    ],
    image: 'https://m.media-amazon.com/images/I/61h3Q8vYqUL._AC_SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/61h3Q8vYqUL._AC_SL1500_.jpg',
    ],
    video: null,
    category: 'figures',
    price: '$32.99',
    priceNum: 32.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=nezuko+figure+demon+slayer',
    animeTag: ['demon-slayer', 'kimetsu-no-yaiba'],
    tags: ['demon slayer', 'nezuko', 'figure', 'blood demon art'],
    badge: null,
    rating: 4.7,
    reviews: 1876,
    releaseDate: '2024-06-10',
    trendScore: 78,
    inStock: true,
    featured: false,
    shipping: 'Free shipping with Prime',
    brand: 'Banpresto',
  },
  {
    id: 'fig-spy-anya-01',
    title: 'Anya Forger — Waku Waku Figure',
    subtitle: 'SPY x FAMILY — Puchieete Series',
    description: 'Anya in her iconic excited "Waku Waku" pose! Adorable sculpt perfect for any desk.',
    longDescription: 'Waku waku! Anya\'s excitement is contagious in this adorable Puchieete figure. Captures her legendary reaction pose with big sparkling eyes, hands up in joy, and her signature Eden Academy uniform. Perfect desk companion for any SPY x FAMILY fan.',
    features: [
      '4.7 inch Puchieete figure',
      'Iconic "Waku Waku" excited pose',
      'Eden Academy uniform detail',
      'Official Taito release',
      'Adorable desk companion',
    ],
    image: 'https://m.media-amazon.com/images/I/51xIWEuA-QL._AC_SL1200_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/51xIWEuA-QL._AC_SL1200_.jpg',
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
    shipping: 'Free shipping with Prime',
    brand: 'Taito',
  },
  {
    id: 'fig-aot-levi-01',
    title: 'Levi Ackerman — Final Season Figure',
    subtitle: 'Attack on Titan — Special Edition',
    description: 'Captain Levi in his Final Season design. Dual blade pose with incredible cape detail.',
    longDescription: 'Humanity\'s strongest soldier stands ready. This special edition Levi figure captures him mid-swing with dual ODM blades, flowing Survey Corps cape, and his intense Final Season expression. Every detail from his harness to his boots is faithfully reproduced.',
    features: [
      '7.5 inch premium figure',
      'Dual ODM blades included',
      'Flowing cape sculpt',
      'Final Season design',
      'Rotating base included',
    ],
    image: 'https://m.media-amazon.com/images/I/71ZbGqmZzoL._AC_SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/71ZbGqmZzoL._AC_SL1500_.jpg',
    ],
    video: null,
    category: 'figures',
    price: '$39.99',
    priceNum: 39.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=levi+ackerman+figure+attack+on+titan',
    animeTag: ['attack-on-titan', 'shingeki-no-kyojin'],
    tags: ['attack on titan', 'levi', 'ackerman', 'figure', 'aot'],
    badge: 'LEGEND',
    rating: 4.8,
    reviews: 2543,
    releaseDate: '2024-03-15',
    trendScore: 75,
    inStock: true,
    featured: false,
    shipping: 'Free shipping with Prime',
    brand: 'Kotobukiya',
  },

  // ═══ MANGA ═══
  {
    id: 'manga-csm-box-01',
    title: 'Chainsaw Man Box Set (Vol 1-11)',
    subtitle: 'Tatsuki Fujimoto — Complete Part 1',
    description: 'The complete first part of Chainsaw Man. All 11 volumes in a premium collector\'s box.',
    longDescription: 'Own the complete Part 1 of Chainsaw Man in this premium box set. All 11 volumes of Tatsuki Fujimoto\'s explosive manga plus an exclusive booklet and poster. From Denji\'s first days as a devil hunter to the shocking end of the Public Safety arc — the entire story is here.',
    features: [
      '11 volume complete Part 1 collection',
      'Premium collector\'s box',
      'Exclusive booklet included',
      'Bonus poster',
      'VIZ Media official release',
    ],
    image: 'https://m.media-amazon.com/images/I/91GaWCf-jkL._SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/91GaWCf-jkL._SL1500_.jpg',
    ],
    video: null,
    category: 'manga',
    price: '$99.99',
    priceNum: 99.99,
    originalPrice: '$120.00',
    discount: 17,
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
    shipping: 'Free shipping with Prime',
    brand: 'VIZ Media',
  },
  {
    id: 'manga-jjk-01',
    title: 'Jujutsu Kaisen Vol. 1 (Manga)',
    subtitle: 'Gege Akutami — Start Your Journey',
    description: 'Begin the Jujutsu Kaisen manga journey with Volume 1. Follow Yuji Itadori as he swallows the cursed finger.',
    longDescription: 'The manga that started it all. Volume 1 introduces high schooler Yuji Itadori, whose life changes forever when he swallows a cursed talisman to save his friends. Discover the world of jujutsu sorcery, curses, and the legendary technique that will define his future.',
    features: [
      'Volume 1 of the ongoing manga',
      'By Gege Akutami',
      'VIZ Media English release',
      'Perfect starting point',
      'Full color cover, B&W interior',
    ],
    image: 'https://m.media-amazon.com/images/I/91cJHUKb1lL._SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/91cJHUKb1lL._SL1500_.jpg',
    ],
    video: null,
    category: 'manga',
    price: '$9.99',
    priceNum: 9.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=jujutsu+kaisen+manga+volume+1',
    animeTag: ['jujutsu-kaisen'],
    tags: ['jujutsu kaisen', 'manga', 'gojo', 'akutami', 'jjk'],
    badge: null,
    rating: 4.9,
    reviews: 12045,
    releaseDate: '2024-09-01',
    trendScore: 85,
    inStock: true,
    featured: false,
    shipping: 'Free shipping with Prime',
    brand: 'VIZ Media',
  },
  {
    id: 'manga-sl-01',
    title: 'Solo Leveling Vol. 1 (Manhwa)',
    subtitle: 'Dubu (REDICE Studio) — Full Color',
    description: 'The #1 manhwa worldwide in stunning full-color print. Follow Sung Jin-Woo\'s rise.',
    longDescription: 'Experience Solo Leveling in gorgeous full color, exactly as originally published. Volume 1 begins Sung Jin-Woo\'s legendary journey from the world\'s weakest hunter to the Shadow Monarch. Premium hardcover printing showcases every action-packed panel in vivid color.',
    features: [
      'Full color manhwa (comic)',
      'Volume 1 hardcover',
      'By Dubu, adapted from Chugong\'s novel',
      'Yen Press English release',
      'Premium print quality',
    ],
    image: 'https://m.media-amazon.com/images/I/91TzO4vP4EL._SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/91TzO4vP4EL._SL1500_.jpg',
    ],
    video: null,
    category: 'manga',
    price: '$14.99',
    priceNum: 14.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=solo+leveling+manhwa+volume+1',
    animeTag: ['solo-leveling'],
    tags: ['solo leveling', 'manhwa', 'sung jin-woo', 'comic', 'korean'],
    badge: '#1 MANHWA',
    rating: 4.8,
    reviews: 8932,
    releaseDate: '2024-05-15',
    trendScore: 87,
    inStock: true,
    featured: true,
    shipping: 'Free shipping with Prime',
    brand: 'Yen Press',
  },

  // ═══ GAMES ═══
  {
    id: 'game-dbz-sparking',
    title: 'Dragon Ball: Sparking! ZERO',
    subtitle: 'PS5 — Bandai Namco',
    description: 'The long-awaited return of Budokai Tenkaichi! 180+ playable characters, explosive combat.',
    longDescription: 'Budokai Tenkaichi is back! Dragon Ball: Sparking! ZERO delivers the ultimate Dragon Ball fighting experience with over 180 playable characters, destructible arenas, and cinematic special moves. Play through iconic story battles or fight friends online. The most complete Dragon Ball game ever made.',
    features: [
      '180+ playable characters',
      'Destructible environments',
      'Online & offline multiplayer',
      'Story mode with What-If scenarios',
      'Full Dragon Ball series coverage',
    ],
    image: 'https://m.media-amazon.com/images/I/71rGkOM+z8L._SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/71rGkOM+z8L._SL1500_.jpg',
    ],
    video: 'https://www.youtube.com/embed/o1UrKfUMYyQ',
    category: 'games',
    price: '$59.99',
    priceNum: 59.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=dragon+ball+sparking+zero+ps5',
    animeTag: ['dragon-ball-super', 'dragon-ball', 'dragon-ball-z'],
    tags: ['dragon ball', 'sparking zero', 'game', 'ps5', 'fighting'],
    badge: '🎮 NEW RELEASE',
    rating: 4.8,
    reviews: 6789,
    releaseDate: '2025-01-15',
    trendScore: 94,
    inStock: true,
    featured: true,
    shipping: 'Free shipping with Prime',
    brand: 'Bandai Namco',
  },

  // ═══ POSTERS ═══
  {
    id: 'poster-anime-pack',
    title: 'Anime Poster Pack (8 Posters)',
    subtitle: 'Demon Slayer, JJK, AOT, MHA & More',
    description: 'Premium quality anime poster set. 8 different popular series. High-resolution prints.',
    longDescription: 'Transform your room into an anime paradise with this 8-poster mega pack. Features Demon Slayer, Jujutsu Kaisen, Attack on Titan, My Hero Academia, Naruto, One Piece, Chainsaw Man, and Spy x Family. Each 11.5 x 16.5 inch poster is printed on premium matte paper with vivid, fade-resistant inks.',
    features: [
      '8 different anime posters',
      '11.5 x 16.5 inches each',
      'Premium matte paper',
      'Fade-resistant inks',
      'Perfect for bedroom or gaming room',
    ],
    image: 'https://m.media-amazon.com/images/I/91QNM8DwmzL._AC_SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/91QNM8DwmzL._AC_SL1500_.jpg',
    ],
    video: null,
    category: 'posters',
    price: '$12.99',
    priceNum: 12.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=anime+poster+pack+8',
    animeTag: ['demon-slayer', 'jujutsu-kaisen', 'attack-on-titan', 'my-hero-academia'],
    tags: ['poster', 'wall art', 'anime decor', 'room', 'decoration'],
    badge: 'BEST VALUE',
    rating: 4.5,
    reviews: 7834,
    releaseDate: '2024-01-01',
    trendScore: 72,
    inStock: true,
    featured: false,
    shipping: 'Free shipping with Prime',
    brand: 'AniPoster',
  },

  // ═══ APPAREL ═══
  {
    id: 'apparel-aot-hoodie',
    title: 'Survey Corps Premium Hoodie',
    subtitle: 'Attack on Titan — Wings of Freedom',
    description: 'Premium Attack on Titan hoodie with embroidered Survey Corps logo. Fleece-lined.',
    longDescription: 'Join the Survey Corps with this premium quality hoodie. Features the iconic Wings of Freedom emblem embroidered on the chest and full-color print on the back. Made from soft cotton blend with fleece lining for warmth. Perfect for cool nights or cozy anime binge sessions.',
    features: [
      'Embroidered Wings of Freedom logo',
      'Cotton blend with fleece lining',
      'Machine washable',
      'Available in sizes S-3XL',
      'Officially licensed Attack on Titan',
    ],
    image: 'https://m.media-amazon.com/images/I/81E-Z3nrGvL._AC_SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/81E-Z3nrGvL._AC_SL1500_.jpg',
    ],
    video: null,
    category: 'apparel',
    price: '$34.99',
    priceNum: 34.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=attack+on+titan+survey+corps+hoodie',
    animeTag: ['attack-on-titan', 'shingeki-no-kyojin'],
    tags: ['attack on titan', 'hoodie', 'survey corps', 'apparel', 'clothing'],
    badge: null,
    rating: 4.4,
    reviews: 2345,
    releaseDate: '2024-02-15',
    trendScore: 60,
    inStock: true,
    featured: false,
    shipping: 'Free shipping with Prime',
    brand: 'Ripple Junction',
  },
  {
    id: 'apparel-naruto-akatsuki',
    title: 'Akatsuki Cloud Jacket',
    subtitle: 'Naruto Shippuden — Cosplay Grade',
    description: 'The iconic Akatsuki red cloud design on a high-quality zip-up jacket.',
    longDescription: 'Wear the mark of Akatsuki with pride. This premium jacket features the iconic red cloud pattern on a jet-black background, high-quality zipper, and comfortable cotton-polyester blend. Perfect for cosplay, anime conventions, or everyday wear. Officially licensed Naruto merchandise.',
    features: [
      'Full Akatsuki cloud print pattern',
      'High-quality zipper',
      'Cotton-polyester blend',
      'Sizes XS-4XL available',
      'Perfect for cosplay or casual wear',
    ],
    image: 'https://m.media-amazon.com/images/I/61x4C-XJIxL._AC_SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/61x4C-XJIxL._AC_SL1500_.jpg',
    ],
    video: null,
    category: 'apparel',
    price: '$39.99',
    priceNum: 39.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=naruto+akatsuki+jacket+cosplay',
    animeTag: ['naruto', 'naruto-shippuden'],
    tags: ['naruto', 'akatsuki', 'jacket', 'cosplay', 'apparel'],
    badge: 'COSPLAY',
    rating: 4.6,
    reviews: 3456,
    releaseDate: '2024-03-01',
    trendScore: 68,
    inStock: true,
    featured: false,
    shipping: 'Free shipping with Prime',
    brand: 'AnimeTown',
  },

  // ═══ ACCESSORIES ═══
  {
    id: 'acc-anime-lamp',
    title: 'Anime 3D LED Illusion Night Light',
    subtitle: '16 Colors — Remote Control',
    description: 'Stunning 3D anime illusion lamp with 16 color modes. USB powered with remote.',
    longDescription: 'Illuminate your room with this mesmerizing 3D LED anime lamp. Features 16 different color modes controlled by remote, USB-powered for easy setup, and stunning 3D illusion effect. Available with multiple anime character designs. Perfect gift for anime fans, kids, or anyone wanting cool room lighting.',
    features: [
      '16 color modes with remote',
      'USB powered (adapter included)',
      'Stunning 3D illusion effect',
      'Touch and remote control',
      'Perfect night light or decoration',
    ],
    image: 'https://m.media-amazon.com/images/I/71rMk-D-JXL._AC_SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/71rMk-D-JXL._AC_SL1500_.jpg',
    ],
    video: null,
    category: 'accessories',
    price: '$19.99',
    priceNum: 19.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=anime+3d+led+illusion+lamp',
    animeTag: ['naruto', 'dragon-ball', 'one-piece'],
    tags: ['night light', 'lamp', 'led', '3d', 'room decor'],
    badge: '💡 COOL',
    rating: 4.3,
    reviews: 5678,
    releaseDate: '2024-01-10',
    trendScore: 62,
    inStock: true,
    featured: false,
    shipping: 'Free shipping with Prime',
    brand: 'MixMart',
  },
  {
    id: 'acc-jjk-keychain-set',
    title: 'Jujutsu Kaisen Keychain Set (6 Pack)',
    subtitle: 'Gojo, Yuji, Megumi, Nobara & More',
    description: 'High-quality metal keychains featuring 6 different JJK characters.',
    longDescription: 'Show off your JJK fandom with this premium 6-pack keychain set. Includes Gojo Satoru, Yuji Itadori, Megumi Fushiguro, Nobara Kugisaki, Sukuna, and Maki Zenin. Made from durable metal with detailed enamel paint. Perfect for keys, bags, or as gifts.',
    features: [
      '6 unique JJK character keychains',
      'Premium metal construction',
      'Detailed enamel paint',
      'Sturdy keyring attachment',
      'Great gift for JJK fans',
    ],
    image: 'https://m.media-amazon.com/images/I/71bLmR9zwML._AC_SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/71bLmR9zwML._AC_SL1500_.jpg',
    ],
    video: null,
    category: 'accessories',
    price: '$14.99',
    priceNum: 14.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=jujutsu+kaisen+keychain+set',
    animeTag: ['jujutsu-kaisen'],
    tags: ['jujutsu kaisen', 'keychain', 'gojo', 'accessory', 'gift'],
    badge: '🎁 GIFT IDEA',
    rating: 4.5,
    reviews: 2109,
    releaseDate: '2024-04-20',
    trendScore: 58,
    inStock: true,
    featured: false,
    shipping: 'Free shipping with Prime',
    brand: 'AnimeCharm',
  },

  // ═══ SNACKS ═══
  {
    id: 'food-ramen-variety',
    title: 'Japanese Ramen Variety Pack (10 Bowls)',
    subtitle: 'Nissin, Maruchan & Sapporo Ichiban',
    description: 'Authentic Japanese ramen from top brands. Miso, tonkotsu, shoyu, spicy — all in one pack.',
    longDescription: 'Slurp your way through Japan with this 10-bowl ramen variety pack. Includes authentic Japanese flavors from top brands: Nissin Cup Noodles, Maruchan Miso, Sapporo Ichiban Tonkotsu, and spicy Karashi. Perfect for anime marathon nights or quick meals. Just like the ramen you see in your favorite anime!',
    features: [
      '10 authentic Japanese ramen bowls',
      'Top brands: Nissin, Maruchan, Sapporo Ichiban',
      '5+ different flavors',
      'Ready in 3 minutes',
      'Perfect for anime marathons',
    ],
    image: 'https://m.media-amazon.com/images/I/81eaKKOKrJL._SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/81eaKKOKrJL._SL1500_.jpg',
    ],
    video: null,
    category: 'snacks',
    price: '$24.99',
    priceNum: 24.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=japanese+ramen+variety+pack',
    animeTag: ['naruto', 'one-piece'],
    tags: ['ramen', 'noodles', 'japanese food', 'nissin', 'snack'],
    badge: '🍜 BESTSELLER',
    rating: 4.7,
    reviews: 8934,
    releaseDate: '2024-10-01',
    trendScore: 89,
    inStock: true,
    featured: true,
    shipping: 'Free shipping with Prime',
    brand: 'Assorted',
  },
  {
    id: 'food-pocky-mega',
    title: 'Pocky Mega Variety Pack (12 Flavors)',
    subtitle: 'Chocolate, Strawberry, Matcha & More',
    description: 'The iconic Japanese chocolate stick snack in 12 different flavors. Perfect anime marathon snack.',
    longDescription: 'The legendary Pocky sticks in a 12-flavor mega pack! Includes classic Chocolate, Strawberry, Matcha, Cookies & Cream, Almond Crush, Chocolate Banana, and more Japan-exclusive flavors. Made by Glico, Japan\'s most beloved snack brand. The perfect snack for anime nights.',
    features: [
      '12 different Pocky flavors',
      'Japan-exclusive varieties included',
      'Made by Glico (authentic)',
      'Perfect for parties or gifts',
      'Individual boxes for freshness',
    ],
    image: 'https://m.media-amazon.com/images/I/91OL2p8fXeL._SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/91OL2p8fXeL._SL1500_.jpg',
    ],
    video: null,
    category: 'snacks',
    price: '$29.99',
    priceNum: 29.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=pocky+variety+pack+japanese',
    animeTag: [],
    tags: ['pocky', 'chocolate', 'japanese snack', 'candy', 'glico'],
    badge: '🍫 FAN LOVED',
    rating: 4.8,
    reviews: 12543,
    releaseDate: '2024-11-15',
    trendScore: 91,
    inStock: true,
    featured: true,
    shipping: 'Free shipping with Prime',
    brand: 'Glico',
  },
  {
    id: 'food-kitkat-japan',
    title: 'Japanese Kit Kat Assortment (30 Bars)',
    subtitle: 'Matcha, Sakura, Wasabi & Exotic Flavors',
    description: 'Try 30 different Japan-exclusive Kit Kat flavors you can\'t find in the US. Perfect gift.',
    longDescription: 'Japan is famous for having 300+ Kit Kat flavors — try 30 of the best in this exclusive assortment! Includes Matcha, Sakura Cherry Blossom, Wasabi, Strawberry Cheesecake, Sake, Hokkaido Melon, and more. Comes in beautiful gift-ready packaging. The ultimate Japanese snack experience.',
    features: [
      '30 Japan-exclusive Kit Kat flavors',
      'Includes rare Matcha & Sakura',
      'Gift-ready packaging',
      'Perfect for adventurous eaters',
      'Import direct from Japan',
    ],
    image: 'https://m.media-amazon.com/images/I/91QhEqZ4-oL._SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/91QhEqZ4-oL._SL1500_.jpg',
    ],
    video: null,
    category: 'snacks',
    price: '$34.99',
    priceNum: 34.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=japanese+kit+kat+assortment',
    animeTag: [],
    tags: ['kit kat', 'japanese chocolate', 'matcha', 'candy', 'gift'],
    badge: '🎁 GIFT IDEA',
    rating: 4.9,
    reviews: 6721,
    releaseDate: '2024-12-01',
    trendScore: 93,
    inStock: true,
    featured: true,
    shipping: 'Free shipping with Prime',
    brand: 'Nestle Japan',
  },
  {
    id: 'food-mochi-box',
    title: 'Premium Japanese Mochi Assortment Box',
    subtitle: 'Daifuku, Ice Cream Mochi Style — 24 Pieces',
    description: 'Authentic Japanese mochi in assorted flavors: strawberry, red bean, matcha, mango, and more.',
    longDescription: 'Experience authentic Japanese mochi with this 24-piece assortment box. Features traditional daifuku flavors including strawberry, red bean, matcha, mango, taro, and more. Made with premium glutinous rice for the perfect chewy texture. Beautifully packaged, perfect for gifts or personal enjoyment.',
    features: [
      '24 pieces of authentic mochi',
      '6+ different flavors',
      'Premium glutinous rice',
      'Beautifully packaged',
      'Perfect gift or dessert',
    ],
    image: 'https://m.media-amazon.com/images/I/81nDA7ZmIzL._SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/81nDA7ZmIzL._SL1500_.jpg',
    ],
    video: null,
    category: 'snacks',
    price: '$32.99',
    priceNum: 32.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=japanese+mochi+box+assortment',
    animeTag: [],
    tags: ['mochi', 'daifuku', 'japanese dessert', 'candy', 'sweet'],
    badge: '🌸 PREMIUM',
    rating: 4.7,
    reviews: 4567,
    releaseDate: '2024-11-01',
    trendScore: 84,
    inStock: true,
    featured: true,
    shipping: 'Free shipping with Prime',
    brand: 'Bokksu',
  },
  {
    id: 'food-matcha-set',
    title: 'Premium Ceremonial Matcha Tea Set',
    subtitle: 'Chawan, Whisk, Scoop + Organic Matcha',
    description: 'Complete traditional Japanese matcha kit. Includes ceremonial-grade matcha powder from Uji, Kyoto.',
    longDescription: 'Master the art of Japanese tea ceremony with this complete matcha kit. Includes authentic Chawan (tea bowl), Chasen (bamboo whisk), Chashaku (bamboo scoop), and 30g of ceremonial-grade matcha powder from Uji, Kyoto — Japan\'s finest matcha region. Perfect for tea enthusiasts or a mindful anime break.',
    features: [
      'Traditional Chawan tea bowl',
      'Handcrafted bamboo whisk',
      'Ceremonial matcha powder (30g)',
      'From Uji, Kyoto (premium region)',
      'Instruction guide included',
    ],
    image: 'https://m.media-amazon.com/images/I/81SEo-CzUfL._AC_SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/81SEo-CzUfL._AC_SL1500_.jpg',
    ],
    video: null,
    category: 'snacks',
    price: '$49.99',
    priceNum: 49.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=matcha+tea+set+ceremonial+japanese',
    animeTag: [],
    tags: ['matcha', 'tea', 'japanese tea', 'ceremonial', 'set'],
    badge: '🍵 AUTHENTIC',
    rating: 4.8,
    reviews: 3892,
    releaseDate: '2024-10-15',
    trendScore: 86,
    inStock: true,
    featured: true,
    shipping: 'Free shipping with Prime',
    brand: 'Jade Leaf',
  },

  // ═══ COLLECTIBLES ═══
  {
    id: 'col-pokemon-cards',
    title: 'Pokémon TCG: Ultra Premium Collection',
    subtitle: 'Scarlet & Violet — Gold Etched Cards',
    description: 'The ultimate Pokémon card collection box. Gold-etched promos, booster packs included.',
    longDescription: 'The pinnacle of Pokémon TCG collecting. This Ultra Premium Collection includes 15 booster packs, 3 gold-etched foil cards, a giant playmat, deck box, card sleeves, and more. Perfect for competitive players or dedicated collectors.',
    features: [
      '15 Scarlet & Violet booster packs',
      '3 gold-etched foil promo cards',
      'Full-art playmat',
      'Premium deck box + sleeves',
      'Collector\'s guide included',
    ],
    image: 'https://m.media-amazon.com/images/I/81P5g6H9TIL._AC_SL1500_.jpg',
    images: [
      'https://m.media-amazon.com/images/I/81P5g6H9TIL._AC_SL1500_.jpg',
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
    shipping: 'Free shipping with Prime',
    brand: 'Pokémon Company',
  },
];

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

// Find related products (same category + shared anime tags)
function findRelatedProducts(product: Product, allProducts: Product[], limit: number = 6): Product[] {
  const scored = allProducts
    .filter(p => p.id !== product.id)
    .map(p => {
      let score = 0;
      // Same category = big boost
      if (p.category === product.category) score += 30;
      // Shared anime tags
      const sharedAnime = p.animeTag.filter(t => product.animeTag.includes(t)).length;
      score += sharedAnime * 20;
      // Shared regular tags
      const sharedTags = p.tags.filter(t => product.tags.includes(t)).length;
      score += sharedTags * 5;
      // Featured bonus
      if (p.featured) score += 3;
      // Rating factor
      score += p.rating;
      return { product: p, score };
    })
    .filter(x => x.score > 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  
  return scored.map(x => x.product);
}

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
    const includeRelated = params.get('related') === 'true';
    
    let results = [...PRODUCTS];
    
    // Single product lookup
    if (id) {
      const product = results.find(p => p.id === id);
      if (!product) {
        return new Response(JSON.stringify({ success: false, error: 'Product not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const productWithAffiliate = { 
        ...product, 
        affiliateUrl: buildAffiliateUrl(product) 
      };
      
      const response: any = {
        success: true,
        product: productWithAffiliate,
      };
      
      // Include related products if requested
      if (includeRelated) {
        const related = findRelatedProducts(product, PRODUCTS, 6);
        response.related = related.map(p => ({
          ...p,
          affiliateUrl: buildAffiliateUrl(p),
        }));
      }
      
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=600',
        }
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
