// ═══════════════════════════════════════════════════════════════
// AniTube Buzz — Products API
// Path: src/pages/api/products.ts
//
// IMAGE STRATEGY:
// - Unsplash CDN for reliable product photography
// - Works globally, especially USA (target audience)
// - Users click "Buy" → Amazon with affiliate tag anitubebuzz-20
// - 24-hour cookie = user buys ANYTHING on Amazon → we earn commission
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

// ═══ Affiliate Configuration ═══
const AMAZON_TAG = 'anitubebuzz-20';
const PLAYASIA_REF = '6797065';

function buildAffiliateUrl(product: { store: string; rawUrl: string }): string {
  const url = product.rawUrl;
  switch (product.store) {
    case 'amazon': {
      const sep = url.includes('?') ? '&' : '?';
      return url + sep + 'tag=' + AMAZON_TAG;
    }
    case 'playasia': {
      const sep = url.includes('?') ? '&' : '?';
      return url + sep + 'affiliate_id=' + PLAYASIA_REF;
    }
    default:
      return url;
  }
}

function calculateTrendScore(product: any): number {
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
// PRODUCT DATABASE
// ═══════════════════════════════════════════════════════════════
const PRODUCTS: Product[] = [

  // ═══ FIGURES ═══
  {
    id: 'fig-csm-power-01',
    title: 'Chainsaw Man Power Figure - Premium',
    subtitle: 'Banpresto — Official Anime Figure',
    description: 'High-quality Power figure from Chainsaw Man with signature horns.',
    longDescription: 'Premium Power figure by Banpresto. Meticulously sculpted with hand-painted details on horns and Blood Devil accessories. Standing 6.7 inches tall, perfect for collectors.',
    features: [
      '6.7 inch (17cm) premium PVC figure',
      'Hand-painted details on horns',
      'Official Banpresto release',
      'Includes themed display base',
      'Perfect for Chainsaw Man fans',
    ],
    image: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800&auto=format&fit=crop&q=80'],
    video: null,
    category: 'figures',
    price: '$29.99',
    priceNum: 29.99,
    originalPrice: '$39.99',
    discount: 25,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=chainsaw+man+power+figure',
    animeTag: ['chainsaw-man'],
    tags: ['chainsaw man', 'power', 'figure', 'banpresto'],
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
    title: 'Gojo Satoru Figure - Jujutsu Kaisen',
    subtitle: 'Bandai Spirits — Official Merchandise',
    description: 'The strongest sorcerer in iconic pose with detailed blindfold.',
    longDescription: 'Stunning Gojo Satoru figure with detailed blindfold sculpting, flowing Jujutsu High uniform, and dynamic pose. 8 inches tall on themed base.',
    features: [
      '8 inch premium figure',
      'Detailed blindfold sculpt',
      'Official Bandai Spirits',
      'Cursed energy themed base',
      'Perfect JJK collector piece',
    ],
    image: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80'],
    video: null,
    category: 'figures',
    price: '$42.99',
    priceNum: 42.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=gojo+satoru+figure+bandai',
    animeTag: ['jujutsu-kaisen'],
    tags: ['jujutsu kaisen', 'gojo', 'figure', 'bandai'],
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
    description: 'The Shadow Monarch in full battle glory with dagger accessories.',
    longDescription: 'Premium Sung Jin-Woo figure at his most powerful moment. Complete with signature daggers, dark aura effects, and iconic Kasaka armor.',
    features: [
      '9 inch premium statue',
      'Dagger accessories included',
      'Detailed Kasaka armor',
      'Shadow effect base',
      'Solo Leveling collector piece',
    ],
    image: 'https://images.unsplash.com/photo-1605106702734-205df224ecce?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1605106702734-205df224ecce?w=800&auto=format&fit=crop&q=80'],
    video: null,
    category: 'figures',
    price: '$54.99',
    priceNum: 54.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=solo+leveling+sung+jinwoo+figure',
    animeTag: ['solo-leveling'],
    tags: ['solo leveling', 'sung jin-woo', 'shadow monarch'],
    badge: '🔥 TRENDING',
    rating: 4.6,
    reviews: 876,
    releaseDate: '2025-01-10',
    trendScore: 90,
    inStock: true,
    featured: true,
    shipping: 'Free shipping with Prime',
    brand: 'REDICE Studio',
  },
  {
    id: 'fig-op-luffy-gear5',
    title: 'Luffy Gear 5 Nika Form Figure - One Piece',
    subtitle: 'Bandai — Official One Piece Figure',
    description: 'Gear 5 Sun God Nika Luffy with white hair and joyful pose.',
    longDescription: 'Luffy in ultimate Gear 5 transformation. Captures the cartoon-like Sun God Nika power with white hair and playful smile.',
    features: [
      '7 inch DXF figure',
      'Gear 5 Nika design',
      'Cloud-style base',
      'Official Bandai release',
      'Wano arc collector',
    ],
    image: 'https://images.unsplash.com/photo-1608889825205-eebdb9fc5806?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1608889825205-eebdb9fc5806?w=800&auto=format&fit=crop&q=80'],
    video: 'https://www.youtube.com/embed/eNxO9MKmtZA',
    category: 'figures',
    price: '$36.99',
    priceNum: 36.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=luffy+gear+5+figure',
    animeTag: ['one-piece'],
    tags: ['one piece', 'luffy', 'gear 5', 'figure'],
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
    title: 'Nezuko Kamado Figure - Demon Slayer',
    subtitle: 'Blood Demon Art Edition',
    description: 'Nezuko in Blood Demon Art form with pink flame effects.',
    longDescription: 'Stunning Nezuko figure with Blood Demon Art flame effects, bamboo muzzle, and demon-form features.',
    features: [
      '6 inch Vibration Stars figure',
      'Pink flame effect parts',
      'Blood Demon Art pose',
      'Official Banpresto',
      'Collection favorite',
    ],
    image: 'https://images.unsplash.com/photo-1622979135225-d2ba269cf1ac?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1622979135225-d2ba269cf1ac?w=800&auto=format&fit=crop&q=80'],
    video: null,
    category: 'figures',
    price: '$32.99',
    priceNum: 32.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=nezuko+figure+demon+slayer',
    animeTag: ['demon-slayer'],
    tags: ['demon slayer', 'nezuko', 'figure'],
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
    title: 'Anya Forger Figure - Spy x Family Waku Waku',
    subtitle: 'SPY x FAMILY — Puchieete Series',
    description: 'Anya in iconic "Waku Waku" excited pose with sparkling eyes.',
    longDescription: 'Adorable Anya Puchieete figure in her legendary reaction pose. Perfect desk companion.',
    features: [
      '4.7 inch Puchieete figure',
      'Iconic Waku Waku pose',
      'Eden Academy uniform',
      'Official Taito release',
      'Adorable desk companion',
    ],
    image: 'https://images.unsplash.com/photo-1590736969955-71cc94901144?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1590736969955-71cc94901144?w=800&auto=format&fit=crop&q=80'],
    video: null,
    category: 'figures',
    price: '$24.99',
    priceNum: 24.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=anya+forger+spy+family+figure',
    animeTag: ['spy-x-family'],
    tags: ['spy x family', 'anya', 'figure', 'cute'],
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
    title: 'Levi Ackerman Figure - Attack on Titan',
    subtitle: 'Final Season Special Edition',
    description: 'Captain Levi with dual ODM blades and Survey Corps cape.',
    longDescription: 'Humanity\'s strongest soldier captured mid-swing with dual ODM blades and flowing Survey Corps cape.',
    features: [
      '7.5 inch premium figure',
      'Dual ODM blades included',
      'Flowing cape sculpt',
      'Final Season design',
      'Rotating base',
    ],
    image: 'https://images.unsplash.com/photo-1568378378-1b0f9e0f11f4?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1568378378-1b0f9e0f11f4?w=800&auto=format&fit=crop&q=80'],
    video: null,
    category: 'figures',
    price: '$39.99',
    priceNum: 39.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=levi+ackerman+figure',
    animeTag: ['attack-on-titan'],
    tags: ['attack on titan', 'levi', 'figure'],
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
    id: 'manga-csm-box',
    title: 'Chainsaw Man Box Set Vol 1-11 - Complete',
    subtitle: 'VIZ Media — Tatsuki Fujimoto',
    description: 'Complete Part 1 of Chainsaw Man in premium collector\'s box.',
    longDescription: 'All 11 volumes of Chainsaw Man Part 1 plus exclusive booklet and poster in premium box.',
    features: [
      '11 volumes complete',
      'Premium collector box',
      'Exclusive booklet',
      'Bonus poster',
      'VIZ Media official',
    ],
    image: 'https://images.unsplash.com/photo-1594736797933-d0501ba2fe65?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1594736797933-d0501ba2fe65?w=800&auto=format&fit=crop&q=80'],
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
    tags: ['chainsaw man', 'manga', 'box set'],
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
    title: 'Jujutsu Kaisen Volume 1 - Manga',
    subtitle: 'VIZ Media — Gege Akutami',
    description: 'Volume 1 of Jujutsu Kaisen manga - where it all begins.',
    longDescription: 'The manga that started the phenomenon. Volume 1 introduces Yuji Itadori as he swallows a cursed talisman.',
    features: [
      'Volume 1 of series',
      'By Gege Akutami',
      'VIZ Media English release',
      'Perfect starting point',
      'Full color cover',
    ],
    image: 'https://images.unsplash.com/photo-1560807707-8cc77767d783?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1560807707-8cc77767d783?w=800&auto=format&fit=crop&q=80'],
    video: null,
    category: 'manga',
    price: '$9.99',
    priceNum: 9.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=jujutsu+kaisen+manga+volume+1',
    animeTag: ['jujutsu-kaisen'],
    tags: ['jujutsu kaisen', 'manga', 'akutami'],
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
    title: 'Solo Leveling Vol 1 Manhwa - Full Color',
    subtitle: 'Yen Press — #1 Manhwa Worldwide',
    description: 'Solo Leveling in stunning full-color print - Volume 1.',
    longDescription: 'Experience Solo Leveling in gorgeous full color, exactly as originally published. Volume 1 begins Sung Jin-Woo\'s legendary journey.',
    features: [
      'Full color manhwa',
      'Volume 1 hardcover',
      'Yen Press release',
      'Premium print quality',
      'Perfect starting point',
    ],
    image: 'https://images.unsplash.com/photo-1621784563330-caee0b138a00?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1621784563330-caee0b138a00?w=800&auto=format&fit=crop&q=80'],
    video: null,
    category: 'manga',
    price: '$14.99',
    priceNum: 14.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=solo+leveling+manhwa+volume+1',
    animeTag: ['solo-leveling'],
    tags: ['solo leveling', 'manhwa'],
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
    title: 'Dragon Ball Sparking ZERO - PS5',
    subtitle: 'Bandai Namco — Fighting Game',
    description: 'The return of Budokai Tenkaichi with 180+ playable characters.',
    longDescription: 'Budokai Tenkaichi is back! Ultimate Dragon Ball fighting experience with 180+ characters, destructible arenas.',
    features: [
      '180+ playable characters',
      'Destructible environments',
      'Online multiplayer',
      'Story mode',
      'Full DB series coverage',
    ],
    image: 'https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=800&auto=format&fit=crop&q=80'],
    video: 'https://www.youtube.com/embed/o1UrKfUMYyQ',
    category: 'games',
    price: '$59.99',
    priceNum: 59.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=dragon+ball+sparking+zero+ps5',
    animeTag: ['dragon-ball'],
    tags: ['dragon ball', 'game', 'ps5'],
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
  {
    id: 'game-naruto-storm',
    title: 'Naruto x Boruto Ninja Storm Connections',
    subtitle: 'PS5 — 130+ Playable Characters',
    description: '130+ playable ninja. Relive the entire Naruto saga plus Boruto.',
    longDescription: 'Over 130 playable ninja. Complete Naruto and Boruto experience with iconic battles and jutsu.',
    features: [
      '130+ characters',
      'Complete Naruto saga',
      'Online battle mode',
      'PS5 graphics',
      'Perfect for fans',
    ],
    image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80'],
    video: null,
    category: 'games',
    price: '$49.99',
    priceNum: 49.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=naruto+ninja+storm+connections',
    animeTag: ['naruto'],
    tags: ['naruto', 'boruto', 'game', 'ps5'],
    badge: null,
    rating: 4.5,
    reviews: 3421,
    releaseDate: '2024-11-01',
    trendScore: 72,
    inStock: true,
    featured: false,
    shipping: 'Free shipping with Prime',
    brand: 'Bandai Namco',
  },

  // ═══ APPAREL ═══
  {
    id: 'apparel-aot-hoodie',
    title: 'Attack on Titan Survey Corps Hoodie',
    subtitle: 'Wings of Freedom — Premium Quality',
    description: 'Premium AOT hoodie with embroidered Wings of Freedom logo.',
    longDescription: 'Join the Survey Corps with this premium quality hoodie. Cotton blend with fleece lining.',
    features: [
      'Embroidered Wings logo',
      'Cotton blend fabric',
      'Fleece lining',
      'Sizes S-3XL',
      'Officially licensed',
    ],
    image: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800&auto=format&fit=crop&q=80'],
    video: null,
    category: 'apparel',
    price: '$34.99',
    priceNum: 34.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=attack+on+titan+survey+corps+hoodie',
    animeTag: ['attack-on-titan'],
    tags: ['attack on titan', 'hoodie', 'survey corps'],
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
    title: 'Akatsuki Cloud Jacket - Naruto Cosplay',
    subtitle: 'Cosplay Grade Zip-Up',
    description: 'Iconic Akatsuki red cloud design on premium jacket.',
    longDescription: 'Premium Akatsuki jacket with full red cloud pattern. Perfect for cosplay or everyday wear.',
    features: [
      'Full cloud pattern',
      'High-quality zipper',
      'Cotton-polyester blend',
      'Sizes XS-4XL',
      'Perfect for cosplay',
    ],
    image: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800&auto=format&fit=crop&q=80'],
    video: null,
    category: 'apparel',
    price: '$39.99',
    priceNum: 39.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=naruto+akatsuki+jacket',
    animeTag: ['naruto'],
    tags: ['naruto', 'akatsuki', 'jacket'],
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
    description: '3D anime illusion lamp with 16 color modes.',
    longDescription: 'Mesmerizing 3D LED anime lamp. USB powered with remote control. Perfect room decoration.',
    features: [
      '16 color modes',
      'USB powered',
      '3D illusion effect',
      'Remote control',
      'Perfect night light',
    ],
    image: 'https://images.unsplash.com/photo-1517420704952-d9f39e95b43e?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1517420704952-d9f39e95b43e?w=800&auto=format&fit=crop&q=80'],
    video: null,
    category: 'accessories',
    price: '$19.99',
    priceNum: 19.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=anime+3d+led+lamp',
    animeTag: ['naruto', 'dragon-ball'],
    tags: ['lamp', 'led', 'room decor'],
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
    id: 'acc-jjk-keychain',
    title: 'Jujutsu Kaisen Keychain Set - 6 Pack',
    subtitle: 'Metal Character Keychains',
    description: '6 JJK character keychains - Gojo, Yuji, Megumi and more.',
    longDescription: 'Premium metal keychains featuring 6 JJK characters. Great gift for anime fans.',
    features: [
      '6 unique characters',
      'Premium metal',
      'Enamel paint',
      'Sturdy keyring',
      'Great gift',
    ],
    image: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=800&auto=format&fit=crop&q=80'],
    video: null,
    category: 'accessories',
    price: '$14.99',
    priceNum: 14.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=jujutsu+kaisen+keychain',
    animeTag: ['jujutsu-kaisen'],
    tags: ['jujutsu kaisen', 'keychain', 'gift'],
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

  // ═══ POSTERS ═══
  {
    id: 'poster-anime-pack',
    title: 'Anime Poster Pack - 8 Popular Series',
    subtitle: 'Premium Wall Art Collection',
    description: '8 different popular anime posters, high-resolution prints.',
    longDescription: 'Transform your room with 8-poster mega pack of Demon Slayer, JJK, AOT, MHA and more.',
    features: [
      '8 posters',
      '11.5 x 16.5 inches each',
      'Matte paper',
      'Fade-resistant inks',
      'Perfect for bedroom',
    ],
    image: 'https://images.unsplash.com/photo-1600107832879-de0ecc84c07d?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1600107832879-de0ecc84c07d?w=800&auto=format&fit=crop&q=80'],
    video: null,
    category: 'posters',
    price: '$12.99',
    priceNum: 12.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=anime+poster+pack',
    animeTag: ['demon-slayer', 'jujutsu-kaisen'],
    tags: ['poster', 'wall art', 'anime decor'],
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

  // ═══ SNACKS ═══
  {
    id: 'food-ramen',
    title: 'Japanese Ramen Variety Pack - 10 Bowls',
    subtitle: 'Nissin, Maruchan & Sapporo Ichiban',
    description: '10 authentic Japanese ramen bowls from top brands.',
    longDescription: '10-bowl ramen variety pack. Authentic flavors from Nissin, Maruchan, and Sapporo Ichiban.',
    features: [
      '10 authentic bowls',
      'Top brands',
      '5+ flavors',
      'Ready in 3 minutes',
      'Perfect for anime marathons',
    ],
    image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800&auto=format&fit=crop&q=80'],
    video: null,
    category: 'snacks',
    price: '$24.99',
    priceNum: 24.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=japanese+ramen+variety+pack',
    animeTag: ['naruto'],
    tags: ['ramen', 'japanese food'],
    badge: '🍜 BESTSELLER',
    rating: 4.7,
    reviews: 8934,
    releaseDate: '2024-10-01',
    trendScore: 89,
    inStock: true,
    featured: true,
    shipping: 'Free shipping with Prime',
    brand: 'Nissin',
  },
  {
    id: 'food-pocky',
    title: 'Pocky Variety Pack - 10 Flavors',
    subtitle: 'Glico — Japanese Chocolate Sticks',
    description: 'Iconic Pocky chocolate sticks in 10 flavors.',
    longDescription: 'Legendary Pocky sticks in variety pack. Chocolate, Strawberry, Matcha and more.',
    features: [
      '10 different flavors',
      'Made by Glico',
      'Perfect for parties',
      'Individual boxes',
      'Anime snack favorite',
    ],
    image: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=800&auto=format&fit=crop&q=80'],
    video: null,
    category: 'snacks',
    price: '$29.99',
    priceNum: 29.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=pocky+variety+pack',
    animeTag: [],
    tags: ['pocky', 'chocolate', 'japanese snack'],
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
    id: 'food-kitkat',
    title: 'Japanese Kit Kat Assortment - 30 Bars',
    subtitle: 'Matcha, Sakura & Exotic Flavors',
    description: '30 Japan-exclusive Kit Kat flavors.',
    longDescription: 'Try 30 rare Japan-exclusive Kit Kat flavors including Matcha, Sakura, Wasabi.',
    features: [
      '30 exclusive flavors',
      'Rare Matcha & Sakura',
      'Gift-ready packaging',
      'Adventurous flavors',
      'Direct from Japan',
    ],
    image: 'https://images.unsplash.com/photo-1581798459219-306e14cb1631?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1581798459219-306e14cb1631?w=800&auto=format&fit=crop&q=80'],
    video: null,
    category: 'snacks',
    price: '$34.99',
    priceNum: 34.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=japanese+kit+kat+assortment',
    animeTag: [],
    tags: ['kit kat', 'matcha', 'japanese chocolate'],
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
    id: 'food-mochi',
    title: 'Japanese Mochi Box - 24 Pieces',
    subtitle: 'Daifuku Assortment',
    description: 'Authentic Japanese mochi in 6+ flavors.',
    longDescription: '24-piece mochi assortment in strawberry, red bean, matcha, mango and more.',
    features: [
      '24 pieces',
      '6+ flavors',
      'Premium glutinous rice',
      'Beautiful packaging',
      'Perfect gift',
    ],
    image: 'https://images.unsplash.com/photo-1631206753348-db44968fd440?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1631206753348-db44968fd440?w=800&auto=format&fit=crop&q=80'],
    video: null,
    category: 'snacks',
    price: '$32.99',
    priceNum: 32.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=japanese+mochi+box',
    animeTag: [],
    tags: ['mochi', 'daifuku', 'japanese dessert'],
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
    id: 'food-matcha',
    title: 'Japanese Matcha Tea Set - Ceremonial',
    subtitle: 'Chawan, Whisk, Scoop + Matcha',
    description: 'Complete traditional Japanese matcha kit.',
    longDescription: 'Master Japanese tea ceremony with complete kit including ceremonial matcha from Uji, Kyoto.',
    features: [
      'Chawan tea bowl',
      'Handcrafted bamboo whisk',
      'Ceremonial matcha (30g)',
      'From Uji, Kyoto',
      'Instruction guide',
    ],
    image: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=800&auto=format&fit=crop&q=80'],
    video: null,
    category: 'snacks',
    price: '$49.99',
    priceNum: 49.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=matcha+tea+set+ceremonial',
    animeTag: [],
    tags: ['matcha', 'tea', 'japanese tea'],
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
    id: 'col-pokemon',
    title: 'Pokemon TCG Ultra Premium Collection',
    subtitle: 'Scarlet & Violet Gold Etched',
    description: 'Ultimate Pokemon card collection with gold-etched promos.',
    longDescription: 'Peak Pokemon TCG collecting. 15 booster packs, 3 gold-etched foil cards, playmat and more.',
    features: [
      '15 booster packs',
      '3 gold-etched cards',
      'Full-art playmat',
      'Premium deck box',
      'Collector guide',
    ],
    image: 'https://images.unsplash.com/photo-1613771404784-3a5686aa2be3?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1613771404784-3a5686aa2be3?w=800&auto=format&fit=crop&q=80'],
    video: 'https://www.youtube.com/embed/QJnT9pMYjJY',
    category: 'collectibles',
    price: '$89.99',
    priceNum: 89.99,
    currency: 'USD',
    store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=pokemon+tcg+ultra+premium',
    animeTag: ['pokemon'],
    tags: ['pokemon', 'tcg', 'cards'],
    badge: '⭐ PREMIUM',
    rating: 4.7,
    reviews: 4567,
    releaseDate: '2024-09-15',
    trendScore: 80,
    inStock: true,
    featured: true,
    shipping: 'Free shipping with Prime',
    brand: 'Pokemon Company',
  },
];

// ═══ Category Metadata ═══
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

// ═══ Related Products Helper ═══
function findRelatedProducts(product: Product, allProducts: Product[], limit: number = 6): Product[] {
  const scored = allProducts
    .filter(p => p.id !== product.id)
    .map(p => {
      let score = 0;
      if (p.category === product.category) score += 30;
      const sharedAnime = p.animeTag.filter(t => product.animeTag.includes(t)).length;
      score += sharedAnime * 20;
      const sharedTags = p.tags.filter(t => product.tags.includes(t)).length;
      score += sharedTags * 5;
      if (p.featured) score += 3;
      score += p.rating;
      return { product: p, score };
    })
    .filter(x => x.score > 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map(x => x.product);
}

// ═══ MAIN API HANDLER ═══
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
      const productWithAffiliate = { ...product, affiliateUrl: buildAffiliateUrl(product) };
      const response: any = { success: true, product: productWithAffiliate };
      if (includeRelated) {
        response.related = findRelatedProducts(product, PRODUCTS, 6).map(p => ({
          ...p, affiliateUrl: buildAffiliateUrl(p),
        }));
      }
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 
          'Content-Type': 'application/json', 
          'Cache-Control': 'public, max-age=600' 
        }
      });
    }
    
    // Filter by category
    if (category) results = results.filter(p => p.category === category);
    
    // Filter by anime
    if (anime) {
      const slug = anime.toLowerCase().replace(/\s+/g, '-');
      results = results.filter(p => 
        p.animeTag.some(tag => tag === slug || tag.includes(slug) || slug.includes(tag))
      );
    }
    
    // Search query
    if (query) {
      const q = query.toLowerCase();
      results = results.filter(p => {
        const searchable = [p.title, p.subtitle, p.description, ...p.tags, ...p.animeTag].join(' ').toLowerCase();
        return searchable.includes(q);
      });
    }
    
    // Featured filter
    if (featured === 'true') results = results.filter(p => p.featured);
    
    // Trending filter
    if (trending === 'true') results = results.filter(p => p.trendScore >= 75);
    
    // Enrich with affiliate URLs + trend scores
    const scored = results.map(p => ({
      ...p,
      affiliateUrl: buildAffiliateUrl(p),
      liveTrendScore: calculateTrendScore(p),
    }));
    
    // Sort by trend score
    scored.sort((a, b) => b.liveTrendScore - a.liveTrendScore);
    
    // Paginate
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
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Internal server error' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
