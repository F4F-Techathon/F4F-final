import type { Restaurant } from '../../data/types.ts'
import { sha1Hex } from './sha1.ts'

export interface ShopColor { hex: string; share: number }

// What a host is generated from. Real shop data plugs in here: anything that can fill these
// fields drives the same generator, independent of the demo Restaurant shape.
export interface ShopInfo {
  name: string
  cuisine: string
  price: number | null
  distance: number | null
  dishes: string
  selling: string
  owner: string
  address: string
  desc: string
  logo?: string | null
  colors?: ShopColor[]
}

// The order agent-studio's parser stores fields in; the keyword rules read them as one blob.
const FIELD_ORDER = ['name', 'cuisine', 'price', 'distance', 'dishes', 'selling', 'owner', 'address', 'desc'] as const

export function shopBlob(shop: ShopInfo) {
  return FIELD_ORDER.map((key) => shop[key]).filter((value) => value !== null && value !== '' && value !== 0).map(String).join(' ')
}

// The shop as Jev reads it: only the facts that are known.
export function shopState(shop: ShopInfo) {
  const fields: Record<string, string | number | null> = {
    name: shop.name, cuisine: shop.cuisine, price_per_person: shop.price, distance_km: shop.distance, signature_dishes: shop.dishes,
    selling_points: shop.selling, owner: shop.owner, address: shop.address, description: shop.desc,
  }
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== '' && value !== null))
}

// A generated host is reused until its shop facts change.
export function shopHash(shop: ShopInfo) {
  return sha1Hex(JSON.stringify(shop)).slice(0, 12)
}

// Demo data → generator input. The 「招牌」 prefix is dropped from dishes so a greeting does not
// say it twice, and the street address is left out: every demo address reads 上海, which would
// otherwise give every host a Shanghai accent regardless of cuisine.
// What a real shop has going for it, in words a host can pitch: its vibe, its rating, its cheapest deal.
function listingHighlights(restaurant: Restaurant) {
  const listing = restaurant.listing!
  const vibe = restaurant.tags.filter((tag) => !/^口味 |^团购 |^有代金券$/.test(tag))
  const taste = listing.scores.taste != null && listing.scores.taste >= 4 ? [`口味评分 ${listing.scores.taste.toFixed(1)}`] : []
  const cheapest = Math.min(...listing.meals.map((meal) => meal.price ?? Infinity))
  return [...vibe, ...taste, ...(Number.isFinite(cheapest) ? [`团购低至 ¥${cheapest}`] : [])]
}

// Listings append dishes and branches to a shop's name (「甬悦柒鲜园林餐厅·新浙菜·东海大带鱼」, 「麦当劳（中科路）」);
// the host says the plain name.
function spokenName(restaurant: Restaurant) {
  if (!restaurant.listing) return restaurant.name
  return restaurant.name.split('·')[0]!.replace(/\s*[（(][^（）()]*[)）]\s*$/, '').trim() || restaurant.name
}

export function shopFromRestaurant(restaurant: Restaurant): ShopInfo {
  return {
    name: spokenName(restaurant),
    cuisine: restaurant.cuisine,
    price: restaurant.price,
    distance: null,
    dishes: restaurant.specialty.split(/\s*[·、，,]\s*/).map((dish) => dish.replace(/^招牌/, '')).filter(Boolean).join('、'),
    selling: restaurant.listing ? listingHighlights(restaurant).join('、') : restaurant.tags.join('、'),
    owner: restaurant.host,
    address: '',
    desc: restaurant.intro,
    logo: null,
    colors: [{ hex: restaurant.color, share: 1 }],
  }
}
