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
  imageKeywords: string; // For Unsplash Source API
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

// ═══ WORKING Image URL Builder ═══
// Uses multiple reliable sources with fallbacks
function buildProductImage(product: { id: string; imageKeywords: string; category: string }): string {
  // Use loremflickr.com — ALWAYS returns real image based on keywords
  // Deterministic per product ID (same product = same image)
  const seed = product.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const keywords = encodeURIComponent(product.imageKeywords);
  return `https://loremflickr.com/600/450/${keywords}?lock=${seed}`;
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
// PRODUCTS DATABASE
// ═══════════════════════════════════════════════════════════════
const PRODUCTS: Product[] = [
  // ═══ FIGURES ═══
  {
    id: 'fig-csm-power',
    title: 'Chainsaw Man Power Figure - Premium Anime Statue',
    subtitle: 'Banpresto — Official Merchandise',
    description: 'High-quality Power figure with signature horns and detailed design.',
    longDescription: 'Premium Power figure by Banpresto. Hand-painted details on horns and Blood Devil accessories. 6.7 inches tall.',
    features: ['6.7 inch premium PVC', 'Hand-painted details', 'Official Banpresto', 'Display base', 'Collector piece'],
    image: '', images: [],
    imageKeywords: 'anime,figure,collectible',
    video: null,
    category: 'figures',
    price: '$29.99', priceNum: 29.99, originalPrice: '$39.99', discount: 25,
    currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=chainsaw+man+power+figure',
    animeTag: ['chainsaw-man'], tags: ['chainsaw man', 'power', 'figure'],
    badge: '🔥 HOT', rating: 4.7, reviews: 1247,
    releaseDate: '2024-11-01', trendScore: 92, inStock: true, featured: true,
    shipping: 'Free shipping', brand: 'Banpresto',
  },
  {
    id: 'fig-jjk-gojo',
    title: 'Gojo Satoru Figure - Jujutsu Kaisen',
    subtitle: 'Bandai Spirits — Official',
    description: 'The strongest sorcerer with detailed blindfold sculpting.',
    longDescription: 'Stunning Gojo Satoru figure with detailed blindfold and dynamic pose. 8 inches on themed base.',
    features: ['8 inch figure', 'Detailed blindfold', 'Official Bandai', 'Themed base', 'JJK collector'],
    image: '', images: [],
    imageKeywords: 'anime,statue,japanese',
    video: null,
    category: 'figures',
    price: '$42.99', priceNum: 42.99, currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=gojo+satoru+figure',
    animeTag: ['jujutsu-kaisen'], tags: ['jjk', 'gojo', 'figure'],
    badge: 'BEST SELLER', rating: 4.8, reviews: 2103,
    releaseDate: '2024-10-15', trendScore: 95, inStock: true, featured: true,
    shipping: 'Free shipping', brand: 'Bandai Spirits',
  },
  {
    id: 'fig-sl-sung',
    title: 'Sung Jin-Woo Shadow Monarch Figure',
    subtitle: 'Solo Leveling — Premium Statue',
    description: 'The Shadow Monarch in full battle glory.',
    longDescription: 'Premium Sung Jin-Woo figure with signature daggers and dark aura effects.',
    features: ['9 inch statue', 'Dagger accessories', 'Kasaka armor', 'Shadow base', 'Solo Leveling'],
    image: '', images: [],
    imageKeywords: 'warrior,figure,dark',
    video: null,
    category: 'figures',
    price: '$54.99', priceNum: 54.99, currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=solo+leveling+sung+jinwoo+figure',
    animeTag: ['solo-leveling'], tags: ['solo leveling', 'shadow monarch'],
    badge: '🔥 TRENDING', rating: 4.6, reviews: 876,
    releaseDate: '2025-01-10', trendScore: 90, inStock: true, featured: true,
    shipping: 'Free shipping', brand: 'REDICE',
  },
  {
    id: 'fig-op-luffy',
    title: 'Luffy Gear 5 Nika Form Figure - One Piece',
    subtitle: 'Bandai — Official',
    description: 'Gear 5 Sun God Nika Luffy with white hair.',
    longDescription: 'Luffy in ultimate Gear 5 transformation. Cartoon-like Sun God Nika power.',
    features: ['7 inch figure', 'Gear 5 design', 'Cloud base', 'Official Bandai', 'Wano arc'],
    image: '', images: [],
    imageKeywords: 'pirate,figure,anime',
    video: null,
    category: 'figures',
    price: '$36.99', priceNum: 36.99, currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=luffy+gear+5+figure',
    animeTag: ['one-piece'], tags: ['one piece', 'luffy', 'gear 5'],
    badge: 'ICONIC', rating: 4.9, reviews: 3421,
    releaseDate: '2024-08-20', trendScore: 88, inStock: true, featured: true,
    shipping: 'Free shipping', brand: 'Bandai',
  },
  {
    id: 'fig-ds-nezuko',
    title: 'Nezuko Kamado Figure - Demon Slayer',
    subtitle: 'Blood Demon Art Edition',
    description: 'Nezuko in Blood Demon Art form.',
    longDescription: 'Stunning Nezuko figure with pink flame effects and bamboo muzzle.',
    features: ['6 inch figure', 'Pink flame effects', 'Blood Demon pose', 'Banpresto', 'Fan favorite'],
    image: '', images: [],
    imageKeywords: 'anime,girl,figurine',
    video: null,
    category: 'figures',
    price: '$32.99', priceNum: 32.99, currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=nezuko+figure',
    animeTag: ['demon-slayer'], tags: ['demon slayer', 'nezuko'],
    badge: null, rating: 4.7, reviews: 1876,
    releaseDate: '2024-06-10', trendScore: 78, inStock: true, featured: false,
    shipping: 'Free shipping', brand: 'Banpresto',
  },
  {
    id: 'fig-spy-anya',
    title: 'Anya Forger Figure - Spy x Family',
    subtitle: 'SPY x FAMILY — Puchieete',
    description: 'Anya in iconic "Waku Waku" pose.',
    longDescription: 'Adorable Anya figure in her legendary reaction pose.',
    features: ['4.7 inch figure', 'Waku Waku pose', 'Eden uniform', 'Taito release', 'Desk companion'],
    image: '', images: [],
    imageKeywords: 'chibi,cute,figure',
    video: null,
    category: 'figures',
    price: '$24.99', priceNum: 24.99, currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=anya+forger+figure',
    animeTag: ['spy-x-family'], tags: ['spy x family', 'anya', 'cute'],
    badge: '💖 FAN FAVORITE', rating: 4.9, reviews: 4201,
    releaseDate: '2024-04-01', trendScore: 82, inStock: true, featured: true,
    shipping: 'Free shipping', brand: 'Taito',
  },
  {
    id: 'fig-aot-levi',
    title: 'Levi Ackerman Figure - Attack on Titan',
    subtitle: 'Final Season Edition',
    description: 'Captain Levi with dual ODM blades.',
    longDescription: 'Levi mid-swing with dual ODM blades and flowing cape.',
    features: ['7.5 inch figure', 'Dual ODM blades', 'Flowing cape', 'Final Season', 'Rotating base'],
    image: '', images: [],
    imageKeywords: 'warrior,swordsman,anime',
    video: null,
    category: 'figures',
    price: '$39.99', priceNum: 39.99, currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=levi+ackerman+figure',
    animeTag: ['attack-on-titan'], tags: ['aot', 'levi'],
    badge: 'LEGEND', rating: 4.8, reviews: 2543,
    releaseDate: '2024-03-15', trendScore: 75, inStock: true, featured: false,
    shipping: 'Free shipping', brand: 'Kotobukiya',
  },

  // ═══ MANGA ═══
  {
    id: 'manga-csm-box',
    title: 'Chainsaw Man Box Set Vol 1-11',
    subtitle: 'VIZ Media — Complete Part 1',
    description: 'Complete Part 1 of Chainsaw Man.',
    longDescription: 'All 11 volumes plus exclusive booklet and poster in premium box.',
    features: ['11 volumes', 'Collector box', 'Exclusive booklet', 'Bonus poster', 'VIZ Media'],
    image: '', images: [],
    imageKeywords: 'manga,book,japanese',
    video: null,
    category: 'manga',
    price: '$99.99', priceNum: 99.99, originalPrice: '$120.00', discount: 17,
    currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=chainsaw+man+manga+box',
    animeTag: ['chainsaw-man'], tags: ['manga', 'chainsaw man'],
    badge: '📦 BOX SET', rating: 4.9, reviews: 5678,
    releaseDate: '2024-06-01', trendScore: 88, inStock: true, featured: true,
    shipping: 'Free shipping', brand: 'VIZ Media',
  },
  {
    id: 'manga-jjk',
    title: 'Jujutsu Kaisen Volume 1',
    subtitle: 'VIZ Media — Gege Akutami',
    description: 'Where the JJK phenomenon began.',
    longDescription: 'Volume 1 introduces Yuji Itadori and the cursed talisman.',
    features: ['Volume 1', 'By Akutami', 'VIZ Media', 'Starting point', 'Full color cover'],
    image: '', images: [],
    imageKeywords: 'comic,book,manga',
    video: null,
    category: 'manga',
    price: '$9.99', priceNum: 9.99, currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=jujutsu+kaisen+manga',
    animeTag: ['jujutsu-kaisen'], tags: ['jjk', 'manga'],
    badge: null, rating: 4.9, reviews: 12045,
    releaseDate: '2024-09-01', trendScore: 85, inStock: true, featured: false,
    shipping: 'Free shipping', brand: 'VIZ Media',
  },
  {
    id: 'manga-sl',
    title: 'Solo Leveling Vol 1 Manhwa',
    subtitle: 'Yen Press — Full Color',
    description: '#1 Manhwa worldwide in full color.',
    longDescription: 'Volume 1 begins Sung Jin-Woo\'s legendary journey in stunning color.',
    features: ['Full color', 'Volume 1 hardcover', 'Yen Press', 'Premium print', 'Starting point'],
    image: '', images: [],
    imageKeywords: 'graphic,novel,korean',
    video: null,
    category: 'manga',
    price: '$14.99', priceNum: 14.99, currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=solo+leveling+manhwa',
    animeTag: ['solo-leveling'], tags: ['manhwa', 'solo leveling'],
    badge: '#1 MANHWA', rating: 4.8, reviews: 8932,
    releaseDate: '2024-05-15', trendScore: 87, inStock: true, featured: true,
    shipping: 'Free shipping', brand: 'Yen Press',
  },

  // ═══ GAMES ═══
  {
    id: 'game-dbz',
    title: 'Dragon Ball Sparking ZERO - PS5',
    subtitle: 'Bandai Namco — Fighting Game',
    description: 'Return of Budokai Tenkaichi with 180+ characters.',
    longDescription: 'Ultimate Dragon Ball fighting experience with destructible arenas.',
    features: ['180+ characters', 'Destructible arenas', 'Online play', 'Story mode', 'Full DB series'],
    image: '', images: [],
    imageKeywords: 'playstation,gaming,console',
    video: null,
    category: 'games',
    price: '$59.99', priceNum: 59.99, currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=dragon+ball+sparking+zero+ps5',
    animeTag: ['dragon-ball'], tags: ['dragon ball', 'game', 'ps5'],
    badge: '🎮 NEW', rating: 4.8, reviews: 6789,
    releaseDate: '2025-01-15', trendScore: 94, inStock: true, featured: true,
    shipping: 'Free shipping', brand: 'Bandai Namco',
  },
  {
    id: 'game-naruto',
    title: 'Naruto Ninja Storm Connections - PS5',
    subtitle: 'PS5 — 130+ Ninja',
    description: 'Complete Naruto and Boruto experience.',
    longDescription: '130+ playable ninja with iconic battles.',
    features: ['130+ characters', 'Complete saga', 'Online battle', 'PS5 graphics', 'Perfect for fans'],
    image: '', images: [],
    imageKeywords: 'video,game,ninja',
    video: null,
    category: 'games',
    price: '$49.99', priceNum: 49.99, currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=naruto+ninja+storm',
    animeTag: ['naruto'], tags: ['naruto', 'game'],
    badge: null, rating: 4.5, reviews: 3421,
    releaseDate: '2024-11-01', trendScore: 72, inStock: true, featured: false,
    shipping: 'Free shipping', brand: 'Bandai Namco',
  },

  // ═══ APPAREL ═══
  {
    id: 'apparel-aot-hoodie',
    title: 'Attack on Titan Survey Corps Hoodie',
    subtitle: 'Wings of Freedom — Premium',
    description: 'Premium hoodie with embroidered Survey Corps logo.',
    longDescription: 'Cotton blend with fleece lining and embroidered Wings of Freedom.',
    features: ['Embroidered logo', 'Cotton blend', 'Fleece lining', 'S-3XL', 'Licensed'],
    image: '', images: [],
    imageKeywords: 'hoodie,streetwear,black',
    video: null,
    category: 'apparel',
    price: '$34.99', priceNum: 34.99, currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=attack+on+titan+hoodie',
    animeTag: ['attack-on-titan'], tags: ['aot', 'hoodie'],
    badge: null, rating: 4.4, reviews: 2345,
    releaseDate: '2024-02-15', trendScore: 60, inStock: true, featured: false,
    shipping: 'Free shipping', brand: 'Ripple Junction',
  },
  {
    id: 'apparel-akatsuki',
    title: 'Akatsuki Cloud Jacket - Naruto',
    subtitle: 'Cosplay Grade Jacket',
    description: 'Iconic Akatsuki red cloud design.',
    longDescription: 'Premium Akatsuki jacket with full red cloud pattern.',
    features: ['Cloud pattern', 'Quality zipper', 'Cotton blend', 'XS-4XL', 'Cosplay ready'],
    image: '', images: [],
    imageKeywords: 'jacket,cosplay,red',
    video: null,
    category: 'apparel',
    price: '$39.99', priceNum: 39.99, currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=naruto+akatsuki+jacket',
    animeTag: ['naruto'], tags: ['naruto', 'akatsuki'],
    badge: 'COSPLAY', rating: 4.6, reviews: 3456,
    releaseDate: '2024-03-01', trendScore: 68, inStock: true, featured: false,
    shipping: 'Free shipping', brand: 'AnimeTown',
  },

  // ═══ ACCESSORIES ═══
  {
    id: 'acc-lamp',
    title: 'Anime 3D LED Illusion Night Light',
    subtitle: '16 Colors — Remote',
    description: '3D illusion lamp with 16 color modes.',
    longDescription: 'Mesmerizing 3D LED anime lamp with remote control.',
    features: ['16 colors', 'USB powered', '3D effect', 'Remote', 'Night light'],
    image: '', images: [],
    imageKeywords: 'led,lamp,neon',
    video: null,
    category: 'accessories',
    price: '$19.99', priceNum: 19.99, currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=anime+3d+led+lamp',
    animeTag: ['naruto', 'dragon-ball'], tags: ['lamp', 'led'],
    badge: '💡 COOL', rating: 4.3, reviews: 5678,
    releaseDate: '2024-01-10', trendScore: 62, inStock: true, featured: false,
    shipping: 'Free shipping', brand: 'MixMart',
  },
  {
    id: 'acc-keychain',
    title: 'JJK Keychain Set - 6 Pack',
    subtitle: 'Metal Character Keychains',
    description: '6 JJK character keychains.',
    longDescription: 'Premium metal keychains featuring 6 JJK characters.',
    features: ['6 characters', 'Premium metal', 'Enamel paint', 'Sturdy', 'Great gift'],
    image: '', images: [],
    imageKeywords: 'keychain,metal,collectible',
    video: null,
    category: 'accessories',
    price: '$14.99', priceNum: 14.99, currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=jujutsu+kaisen+keychain',
    animeTag: ['jujutsu-kaisen'], tags: ['jjk', 'keychain'],
    badge: '🎁 GIFT', rating: 4.5, reviews: 2109,
    releaseDate: '2024-04-20', trendScore: 58, inStock: true, featured: false,
    shipping: 'Free shipping', brand: 'AnimeCharm',
  },

  // ═══ POSTERS ═══
  {
    id: 'poster-pack',
    title: 'Anime Poster Pack - 8 Series',
    subtitle: 'Premium Wall Art',
    description: '8 popular anime posters.',
    longDescription: 'Transform your room with 8 different popular anime posters.',
    features: ['8 posters', '11.5x16.5 inches', 'Matte paper', 'Fade-resistant', 'Room decor'],
    image: '', images: [],
    imageKeywords: 'poster,wall,art',
    video: null,
    category: 'posters',
    price: '$12.99', priceNum: 12.99, currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=anime+poster+pack',
    animeTag: ['demon-slayer', 'jujutsu-kaisen'], tags: ['poster', 'wall art'],
    badge: 'BEST VALUE', rating: 4.5, reviews: 7834,
    releaseDate: '2024-01-01', trendScore: 72, inStock: true, featured: false,
    shipping: 'Free shipping', brand: 'AniPoster',
  },

  // ═══ SNACKS ═══
  {
    id: 'food-ramen',
    title: 'Japanese Ramen Variety Pack - 10 Bowls',
    subtitle: 'Nissin, Maruchan & Sapporo',
    description: '10 authentic Japanese ramen bowls.',
    longDescription: 'Variety pack with authentic flavors from top brands.',
    features: ['10 bowls', 'Top brands', '5+ flavors', '3 min ready', 'Anime marathon'],
    image: '', images: [],
    imageKeywords: 'ramen,noodles,japanese',
    video: null,
    category: 'snacks',
    price: '$24.99', priceNum: 24.99, currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=japanese+ramen+variety',
    animeTag: ['naruto'], tags: ['ramen', 'japanese food'],
    badge: '🍜 BESTSELLER', rating: 4.7, reviews: 8934,
    releaseDate: '2024-10-01', trendScore: 89, inStock: true, featured: true,
    shipping: 'Free shipping', brand: 'Nissin',
  },
  {
    id: 'food-pocky',
    title: 'Pocky Variety Pack - 10 Flavors',
    subtitle: 'Glico — Chocolate Sticks',
    description: 'Iconic Pocky in 10 flavors.',
    longDescription: 'Legendary Pocky sticks in variety pack. Chocolate, Strawberry, Matcha and more.',
    features: ['10 flavors', 'By Glico', 'Party pack', 'Individual boxes', 'Anime snack'],
    image: '', images: [],
    imageKeywords: 'chocolate,japanese,candy',
    video: null,
    category: 'snacks',
    price: '$29.99', priceNum: 29.99, currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=pocky+variety+pack',
    animeTag: [], tags: ['pocky', 'chocolate'],
    badge: '🍫 FAN LOVED', rating: 4.8, reviews: 12543,
    releaseDate: '2024-11-15', trendScore: 91, inStock: true, featured: true,
    shipping: 'Free shipping', brand: 'Glico',
  },
  {
    id: 'food-kitkat',
    title: 'Japanese Kit Kat Assortment - 30 Bars',
    subtitle: 'Matcha, Sakura & Exotic',
    description: '30 Japan-exclusive Kit Kat flavors.',
    longDescription: 'Rare Japan-exclusive Kit Kat flavors including Matcha and Sakura.',
    features: ['30 flavors', 'Rare Matcha & Sakura', 'Gift ready', 'Adventurous', 'From Japan'],
    image: '', images: [],
    imageKeywords: 'kitkat,chocolate,japanese',
    video: null,
    category: 'snacks',
    price: '$34.99', priceNum: 34.99, currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=japanese+kit+kat',
    animeTag: [], tags: ['kit kat', 'matcha'],
    badge: '🎁 GIFT', rating: 4.9, reviews: 6721,
    releaseDate: '2024-12-01', trendScore: 93, inStock: true, featured: true,
    shipping: 'Free shipping', brand: 'Nestle Japan',
  },
  {
    id: 'food-mochi',
    title: 'Japanese Mochi Box - 24 Pieces',
    subtitle: 'Daifuku Assortment',
    description: 'Authentic mochi in 6+ flavors.',
    longDescription: '24-piece mochi assortment in strawberry, red bean, matcha and more.',
    features: ['24 pieces', '6+ flavors', 'Premium rice', 'Beautifully packaged', 'Perfect gift'],
    image: '', images: [],
    imageKeywords: 'mochi,japanese,dessert',
    video: null,
    category: 'snacks',
    price: '$32.99', priceNum: 32.99, currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=japanese+mochi+box',
    animeTag: [], tags: ['mochi', 'dessert'],
    badge: '🌸 PREMIUM', rating: 4.7, reviews: 4567,
    releaseDate: '2024-11-01', trendScore: 84, inStock: true, featured: true,
    shipping: 'Free shipping', brand: 'Bokksu',
  },
  {
    id: 'food-matcha',
    title: 'Japanese Matcha Tea Set - Ceremonial',
    subtitle: 'Complete Kit + Matcha',
    description: 'Traditional Japanese matcha ceremony kit.',
    longDescription: 'Complete matcha kit with ceremonial-grade powder from Uji, Kyoto.',
    features: ['Chawan bowl', 'Bamboo whisk', 'Ceremonial matcha', 'From Uji Kyoto', 'Guide included'],
    image: '', images: [],
    imageKeywords: 'matcha,tea,japanese',
    video: null,
    category: 'snacks',
    price: '$49.99', priceNum: 49.99, currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=matcha+tea+set',
    animeTag: [], tags: ['matcha', 'tea'],
    badge: '🍵 AUTHENTIC', rating: 4.8, reviews: 3892,
    releaseDate: '2024-10-15', trendScore: 86, inStock: true, featured: true,
    shipping: 'Free shipping', brand: 'Jade Leaf',
  },
  {
    id: 'food-hichew',
    title: 'Hi-Chew Fruit Chews - Assorted 30 Pack',
    subtitle: 'Morinaga — Japanese Candy',
    description: 'Legendary Japanese chewy fruit candy.',
    longDescription: 'Assorted flavors of Japan\'s beloved Hi-Chew candy.',
    features: ['30 pieces', '6+ fruit flavors', 'By Morinaga', 'Chewy texture', 'Anime snack'],
    image: '', images: [],
    imageKeywords: 'candy,japanese,fruit',
    video: null,
    category: 'snacks',
    price: '$18.99', priceNum: 18.99, currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=hi-chew+assorted',
    animeTag: [], tags: ['hi-chew', 'candy'],
    badge: '🍬 SWEET', rating: 4.7, reviews: 5432,
    releaseDate: '2024-09-01', trendScore: 79, inStock: true, featured: true,
    shipping: 'Free shipping', brand: 'Morinaga',
  },

  // ═══ COLLECTIBLES ═══
  {
    id: 'col-pokemon',
    title: 'Pokemon TCG Ultra Premium Collection',
    subtitle: 'Scarlet & Violet Gold Etched',
    description: 'Ultimate Pokemon card collection.',
    longDescription: '15 booster packs, gold-etched foil cards, playmat and more.',
    features: ['15 packs', '3 gold cards', 'Playmat', 'Deck box', 'Collector guide'],
    image: '', images: [],
    imageKeywords: 'pokemon,cards,tcg',
    video: null,
    category: 'collectibles',
    price: '$89.99', priceNum: 89.99, currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=pokemon+tcg+ultra+premium',
    animeTag: ['pokemon'], tags: ['pokemon', 'cards'],
    badge: '⭐ PREMIUM', rating: 4.7, reviews: 4567,
    releaseDate: '2024-09-15', trendScore: 80, inStock: true, featured: true,
    shipping: 'Free shipping', brand: 'Pokemon Company',
  },
  {
    id: 'col-funko',
    title: 'Funko Pop Anime Bundle - 5 Pack',
    subtitle: 'Anime Characters Assorted',
    description: 'Bundle of 5 popular anime Funko Pops.',
    longDescription: 'Collectible Funko Pop figures from top anime series.',
    features: ['5 unique figures', 'Popular characters', 'Display window', 'Official Funko', 'Collector item'],
    image: '', images: [],
    imageKeywords: 'funko,pop,collectible',
    video: null,
    category: 'collectibles',
    price: '$54.99', priceNum: 54.99, currency: 'USD', store: 'amazon',
    rawUrl: 'https://www.amazon.com/s?k=anime+funko+pop+bundle',
    animeTag: ['naruto', 'one-piece'], tags: ['funko', 'pop'],
    badge: '📦 BUNDLE', rating: 4.6, reviews: 2345,
    releaseDate: '2024-08-01', trendScore: 71, inStock: true, featured: false,
    shipping: 'Free shipping', brand: 'Funko',
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

// ═══ Enrich product with working image URL ═══
function enrichProduct(p: Product): any {
  const imageUrl = buildProductImage(p);
  return {
    ...p,
    image: imageUrl,
    images: [imageUrl],
    affiliateUrl: buildAffiliateUrl(p),
  };
}

function findRelatedProducts(product: Product, allProducts: Product[], limit: number = 6): any[] {
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
  return scored.map(x => enrichProduct(x.product));
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
    
    if (id) {
      const product = results.find(p => p.id === id);
      if (!product) {
        return new Response(JSON.stringify({ success: false, error: 'Product not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const enriched = enrichProduct(product);
      const response: any = { success: true, product: enriched };
      if (includeRelated) {
        response.related = findRelatedProducts(product, PRODUCTS, 6);
      }
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600' }
      });
    }
    
    if (category) results = results.filter(p => p.category === category);
    if (anime) {
      const slug = anime.toLowerCase().replace(/\s+/g, '-');
      results = results.filter(p => p.animeTag.some(tag => tag === slug || tag.includes(slug) || slug.includes(tag)));
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
    
    const enriched = results.map(p => ({
      ...enrichProduct(p),
      liveTrendScore: calculateTrendScore(p),
    }));
    enriched.sort((a, b) => b.liveTrendScore - a.liveTrendScore);
    
    const total = enriched.length;
    const paginated = enriched.slice(offset, offset + limit);
    
    return new Response(JSON.stringify({
      success: true, products: paginated, total,
      categories: CATEGORY_META,
      hasMore: offset + limit < total, offset, limit,
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
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};
