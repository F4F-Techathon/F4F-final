// Real shops crawled from Dianping (大众点评), imported by scripts/import-dianping.mjs: every shop with its
// best dishes, deals and reviews is bundled here; everything else about one shop loads with loadShopDetail().
// Photos load straight from Dianping's CDN; coordinates are GCJ-02, which AMap reads as they are.
import data from './dianping/shops.json'
import type { Coordinates, Evidence, Restaurant, ShopCounts, ShopDeal, ShopDish, ShopReview, ShopScores } from './types'
import bashiCover from '@/assets/images/restaurants/bashi.webp'
import huajiCover from '@/assets/images/restaurants/huaji.webp'
import pierreCover from '@/assets/images/restaurants/pierre.webp'
import noodleCover from '@/assets/images/restaurants/noodle.webp'
import jiangnanCover from '@/assets/images/restaurants/jiangnan.webp'
import hotpotCover from '@/assets/images/restaurants/hotpot.webp'
import coffeeCover from '@/assets/images/restaurants/coffee.webp'
import sushiCover from '@/assets/images/restaurants/sushi.webp'
import bbqCover from '@/assets/images/restaurants/bbq.webp'

export const DATA_SOURCE = '大众点评'

/** How many reviews mention each thing. */
export interface ShopSignals { quiet: number; noisy: number; date: number; family: number; friends: number; solo: number; business: number; spicy: number; mild: number }

export interface DianpingShop {
  id: string
  shopId: string
  /** Display name; branches of one chain carry their street: 麦当劳（中科路）. */
  name: string
  brand: string
  city: string
  district: string
  region: string
  category: string
  address: string
  scores: ShopScores
  avgPrice: number | null
  lng: number
  lat: number
  phone: string | null
  hours: string | null
  counts: ShopCounts
  dishes: ShopDish[]
  meals: ShopDeal[]
  vouchers: ShopDeal[]
  reviews: ShopReview[]
  complaints: ShopReview[]
}
export interface BundledShop extends DianpingShop {
  signals: ShopSignals
  /** Allergens and ingredients the dish and set-meal names mention (inferred, not confirmed by the shop). */
  allergens: string[]
  ingredients: string[]
}
/** Everything about one shop: all dishes and deals, and every review newest first. */
export type ShopDetail = DianpingShop

export const shops = data.shops as BundledShop[]
export const importedOn = data.imported

// A cuisine family: its card colour, the illustration used when the shop has no photo, how spicy it usually is
// (0 not, 1 can be, 2 spicy; null unknown) and where people usually eat it.
interface Family { match: RegExp; colors: string[]; cover: string; spice: number | null; scenes: string[] }
const FAMILIES: Family[] = [
  { match: /火锅|涮肉|铁锅炖|潮汕牛肉/, colors: ['#BA5D47', '#A8432F', '#C7744A'], cover: hotpotCover, spice: 1, scenes: ['朋友聚餐', '家庭聚会'] },
  { match: /湘|川|渝|麻辣|江西|贵州|浏阳|跷脚|鸡公煲|辣/, colors: ['#C9483E', '#B3313A', '#D2603A', '#A63D52'], cover: bashiCover, spice: 2, scenes: ['朋友聚餐'] },
  { match: /粤|茶餐厅|点心|港式|潮汕/, colors: ['#2F6E62', '#3E8068', '#2A5E6E'], cover: huajiCover, spice: 0, scenes: ['家庭聚会', '朋友聚餐'] },
  { match: /日本|日式|寿司|拉面|丼|韩|部队锅/, colors: ['#668B91', '#3F6E8C', '#7A6A96', '#4E7F78'], cover: sushiCover, spice: 0, scenes: ['一个人吃', '约会'] },
  { match: /西式快餐|汉堡|炸鸡|肯德基|麦当劳|德克士|赛百味|subway|popeyes|taco/i, colors: ['#AD7D3F', '#C2582E', '#B8862B', '#9A5A34', '#D07A2C'], cover: bbqCover, spice: 0, scenes: ['一个人吃', '朋友聚餐'] },
  { match: /西餐|意大利|意式|萨莉亚|法式|牛排|wagas|轻食|沙拉/i, colors: ['#7A5A9E', '#2D3E6B', '#8E4A6E', '#4F6E9E'], cover: pierreCover, spice: 0, scenes: ['约会', '朋友聚餐'] },
  { match: /咖啡|星巴克|茶饮|果汁|奶茶|蜜雪|茶百道/, colors: ['#9B7B9E', '#8B5A3C', '#6B8E3A', '#B06A80'], cover: coffeeCover, spice: 0, scenes: ['一个人吃', '约会'] },
  { match: /浙|本帮|上海|淮扬|苏扬|宁波|杭|海派|江南|新上海/, colors: ['#B37A54', '#9C5B3E', '#C08A3E', '#7E6A4E', '#A65E5E'], cover: jiangnanCover, spice: 0, scenes: ['家庭聚会', '朋友聚餐'] },
  { match: /面|米粉|粉|生煎|卤肉饭|快餐|简餐|老乡鸡|大米先生|自选/, colors: ['#78895E', '#5E7F4A', '#8C7A3A', '#4F7A6A', '#A0703A', '#6A6E8C'], cover: noodleCover, spice: null, scenes: ['一个人吃'] },
]
const OTHER: Family = { match: /$^/, colors: ['#8C6A4F', '#6E7F5A', '#8A5A6E'], cover: jiangnanCover, spice: null, scenes: ['朋友聚餐'] }

// Shops of one family share a colour range, not one colour: the shade follows the shop id, so neighbours differ.
function colorOf(shop: DianpingShop, family: Family) {
  let hash = 0
  for (const char of shop.id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0
  return family.colors[hash % family.colors.length]!
}

function familyOf(shop: DianpingShop) {
  const text = `${shop.category} ${shop.brand}`
  return FAMILIES.find((family) => family.match.test(text)) || OTHER
}

// Where the reviews say people eat here, on top of what the cuisine suggests.
function scenesOf(shop: BundledShop, family: Family) {
  const s = shop.signals, picked = new Set(family.scenes)
  if (s.business >= 3 || (shop.avgPrice ?? 0) >= 150) picked.add('商务用餐')
  if (s.family >= 3) picked.add('家庭聚会')
  if (s.friends >= 5) picked.add('朋友聚餐')
  if (s.solo >= 3 || (shop.avgPrice ?? 999) <= 35) picked.add('一个人吃')
  if (s.date >= 2) picked.add('约会')
  return ['约会', '朋友聚餐', '家庭聚会', '一个人吃', '商务用餐'].filter((scene) => picked.has(scene))
}

// Quiet only when the reviews clearly say so either way; otherwise unknown.
function quietOf(signals: ShopSignals) {
  if (signals.quiet >= 3 && signals.quiet >= signals.noisy * 2) return true
  if (signals.noisy >= 3 && signals.noisy >= signals.quiet * 2) return false
  return null
}

// Spicy cuisines are spicy; otherwise the reviews decide: often spicy, or hardly ever mentioned (not spicy).
function spiceOf(shop: BundledShop, family: Family) {
  const s = shop.signals
  if (family.spice === 2) return 2
  if (s.spicy >= 5 && s.spicy > s.mild * 2) return Math.max(1, family.spice ?? 1)
  if (family.spice != null) return family.spice
  return s.spicy <= 1 ? 0 : null
}

const score = (value: number | null) => (value == null ? '—' : value.toFixed(1))
function scoreText(scores: ShopScores) {
  return `口味 ${score(scores.taste)} · 环境 ${score(scores.env)} · 服务 ${score(scores.service)}`
}

// The first sentence worth quoting: long enough to say something, and not one Dianping censored with asterisks.
function firstSentence(text: string, max = 36) {
  const parts = text.split(/[。！？!?；;\n]/).map((part) => part.trim())
  const sentence = parts.find((part) => part.length >= 8 && !part.includes('*')) || parts.find((part) => part.length >= 6) || text
  return sentence.length > max ? `${sentence.slice(0, max - 1)}…` : sentence
}

function coverOf(shop: DianpingShop, family: Family): Restaurant['cover'] {
  const dish = shop.dishes.find((item) => item.image)
  if (dish?.image) return { src: dish.image, alt: `${shop.name}的推荐菜：${dish.name}`, position: '50% 50%', remote: true }
  const photo = shop.reviews.find((review) => review.images.length)?.images[0]
  if (photo) return { src: photo, alt: `${shop.name}的用户实拍`, position: '50% 50%', remote: true }
  return { src: family.cover, alt: `${shop.category}示意图（非店铺实拍）`, position: '50% 50%' }
}

// The vibe first: pages quote the first tag when a shop suits the occasion.
function tagsOf(shop: BundledShop, quiet: boolean | null) {
  const tags: string[] = []
  if (quiet === true) tags.push('环境安静')
  if (quiet === false) tags.push('热闹烟火气')
  if (shop.scores.taste != null) tags.push(`口味 ${score(shop.scores.taste)}`)
  if (shop.signals.mild >= 3) tags.push('可以不辣')
  if (shop.counts.meals) tags.push(`团购 ${shop.counts.meals} 款`)
  if (shop.counts.vouchers) tags.push('有代金券')
  return tags.slice(0, 4)
}

function introOf(shop: DianpingShop) {
  const dish = shop.dishes.find((item) => item.desc)
  return dish ? `${shop.region}的${shop.category}。${dish.desc}` : `${shop.region}的${shop.category}，${scoreText(shop.scores)}。`
}

function caveatOf(shop: DianpingShop) {
  const complaint = shop.complaints.find((review) => review.text)
  const notes = [complaint ? `差评提到：${firstSentence(complaint.text)}` : '暂无差评资料', '价格、营业时间以商家为准']
  return `${notes.join('；')}。`
}

// The same order as the demo shops, which the pages index into: [0] the shop's facts, [1] what diners say,
// [2] what to check before going; then the dishes, the other reviews, a complaint and the deals.
function evidenceIds(shop: DianpingShop) {
  const [first, ...others] = shop.reviews.slice(0, 3)
  const complaint = shop.complaints[0], dish = shop.dishes[0], deals = shop.counts.meals || shop.counts.vouchers
  const voice = first ? `${shop.id}-review-${first.id}` : complaint ? `${shop.id}-complaint-${complaint.id}`
    : dish ? `${shop.id}-dish-${dish.id}` : deals ? `${shop.id}-deals` : `${shop.id}-info`
  const head = [`${shop.id}-info`, voice, `${shop.id}-note`]
  const rest = [
    ...shop.dishes.slice(0, 2).map((item) => `${shop.id}-dish-${item.id}`),
    ...others.map((review) => `${shop.id}-review-${review.id}`),
    ...(complaint ? [`${shop.id}-complaint-${complaint.id}`] : []),
    ...(deals ? [`${shop.id}-deals`] : []),
  ]
  return [...head, ...new Set(rest.filter((id) => !head.includes(id)))]
}

export function restaurantFrom(shop: BundledShop): Restaurant {
  const family = familyOf(shop), quiet = quietOf(shop.signals)
  const coordinates: Coordinates = [shop.lng, shop.lat]
  return {
    // The listing names no owner: the generator names the host, and pages say 店主 until it has.
    id: shop.id, name: shop.name, cuisine: shop.category, host: '', color: colorOf(shop, family), cover: coverOf(shop, family),
    price: shop.avgPrice, coordinates, address: `${shop.district}${shop.address}`, hours: shop.hours,
    tags: tagsOf(shop, quiet), scenes: scenesOf(shop, family), quiet, spice: spiceOf(shop, family),
    // A shop that lists no dishes or set meals gives no evidence either way: unknown, so allergy requests skip it.
    allergens: shop.counts.dishes || shop.counts.meals ? shop.allergens : null,
    ingredients: shop.ingredients, specialty: shop.dishes.slice(0, 3).map((dish) => dish.name).join(' · ') || shop.category,
    intro: introOf(shop), caveat: caveatOf(shop), evidenceIds: evidenceIds(shop),
    listing: {
      source: DATA_SOURCE, shopId: shop.shopId, region: shop.region, district: shop.district, scores: shop.scores, phone: shop.phone,
      counts: shop.counts, dishes: shop.dishes, meals: shop.meals, vouchers: shop.vouchers,
    },
  }
}

const reviewEvidence = (shop: DianpingShop, review: ShopReview, complaint: boolean): Evidence => ({
  id: `${shop.id}-${complaint ? 'complaint' : 'review'}-${review.id}`, restaurantId: shop.id, kind: 'review',
  title: complaint ? `差评 · ${review.user}` : `${review.star != null ? `${review.star} 星` : '评价'} · ${review.user}`,
  text: review.text, images: review.images.map((src) => ({ src, alt: `${shop.name}的用户照片` })),
  source: `${DATA_SOURCE} · ${complaint ? '差评' : '最新评价'}`, date: review.time, mock: false,
})

export function evidenceFrom(shop: DianpingShop): Evidence[] {
  const deals = [...shop.meals.slice(0, 2), ...shop.vouchers.slice(0, 1)]
  return [
    {
      id: `${shop.id}-info`, restaurantId: shop.id, kind: 'business', title: '商家资料',
      text: `${shop.category} · ${shop.avgPrice ? `人均 ¥${shop.avgPrice}` : '人均暂无'} · ${scoreText(shop.scores)}。${shop.hours ? `营业时间 ${shop.hours}。` : ''}地址：${shop.district}${shop.address}。`,
      source: `${DATA_SOURCE} · 商户信息`, mock: false,
    },
    {
      id: `${shop.id}-note`, restaurantId: shop.id, kind: 'summary', title: '用餐前需要确认', text: caveatOf(shop),
      source: `基于${DATA_SOURCE}评价的整理`, mock: false,
    },
    ...shop.dishes.slice(0, 2).map((dish): Evidence => ({
      id: `${shop.id}-dish-${dish.id}`, restaurantId: shop.id, kind: 'business', title: `推荐菜 · ${dish.name}`,
      text: `${dish.desc || dish.name}${dish.recommended ? `（${dish.recommended} 人推荐）` : ''}`,
      images: dish.image ? [{ src: dish.image, alt: `${shop.name}的${dish.name}` }] : undefined, source: `${DATA_SOURCE} · 推荐菜`, mock: false,
    })),
    ...shop.reviews.slice(0, 3).map((review) => reviewEvidence(shop, review, false)),
    ...shop.complaints.slice(0, 1).map((review) => reviewEvidence(shop, review, true)),
    ...(deals.length ? [{
      id: `${shop.id}-deals`, restaurantId: shop.id, kind: 'summary' as const, title: '团购与代金券',
      text: deals.map((deal) => `${deal.name}${deal.price != null ? ` ¥${deal.price}` : ''}${deal.value ? `（原价 ¥${deal.value}）` : ''}`).join('；'),
      source: `${DATA_SOURCE} · 团购`, mock: false,
    }] : []),
  ]
}

const details = new Map<string, Promise<ShopDetail>>()
/** One shop's full listing: every dish, deal and review. Fetched once per page load. */
export function loadShopDetail(id: string): Promise<ShopDetail> {
  let pending = details.get(id)
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL}data/dianping/${encodeURIComponent(id)}.json`).then((response) => {
      if (!response.ok) throw new Error(`店铺资料读取失败（HTTP ${response.status}）`)
      return response.json() as Promise<ShopDetail>
    })
    pending.catch(() => details.delete(id))
    details.set(id, pending)
  }
  return pending
}

/** Where the shops are: the middle of their bounding box, the default spot to search from. */
export function shopsCenter(): Coordinates {
  const lngs = shops.map((shop) => shop.lng), lats = shops.map((shop) => shop.lat)
  return [+((Math.min(...lngs) + Math.max(...lngs)) / 2).toFixed(6), +((Math.min(...lats) + Math.max(...lats)) / 2).toFixed(6)]
}
