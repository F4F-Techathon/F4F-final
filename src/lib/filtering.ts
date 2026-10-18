import type { Coordinates, Filters, Restaurant } from '@/data/types'

// Computes straight-line distance from GCJ-02 positions used by the demo and AMap.
export function distanceKm(a: Coordinates, b: Coordinates) {
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLng = (b[0] - a[0]) * rad
  return 6371 * 2 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2))
}

// Listing sites name cuisines their own way (川菜馆, 日本料理, 快餐简餐); a request for 川菜, 日料 or 快餐 should
// still find them. Names match when one contains the other once 菜/馆/料理 are dropped, or when they share a group.
// The first name of each group is the one the filter chips show.
const CUISINE_GROUPS = [
  ['川菜', '川菜馆', '重庆', '渝'], ['湘菜', '湖南菜', '浏阳'], ['粤菜', '广东菜', '茶餐厅', '港式'], ['本帮菜', '上海菜', '海派'],
  ['浙菜', '宁波菜', '杭帮菜'], ['日料', '日本料理', '日式'], ['韩餐', '韩国料理', '韩式'], ['西餐', '意大利菜', '意式', '法餐', '牛排'],
  ['快餐', '西式快餐', '快餐简餐', '快餐自助'], ['面馆', '面条', '拉面', '米粉'], ['火锅', '涮肉'], ['咖啡茶饮', '咖啡', '茶饮', '饮品'],
]
/** The chip a listing's own category falls under (西式快餐 → 快餐, 日本料理 → 日料); other categories stand alone. */
export function cuisineGroup(cuisine: string) {
  return CUISINE_GROUPS.find((group) => group.some((name) => cuisine.includes(name)))?.[0] ?? cuisine
}
const core = (name: string) => name.replace(/(?:料理|菜馆|馆|菜)$/, '') || name
export function sameCuisine(wanted: string, cuisine: string) {
  if (wanted === cuisine) return true
  const a = core(wanted), b = core(cuisine)
  if (a.includes(b) || b.includes(a)) return true
  return CUISINE_GROUPS.some((group) => group.some((name) => wanted.includes(name)) && group.some((name) => cuisine.includes(name)))
}

// Apply explicit limits while keeping the restaurant order stable.
export function matchesFilters(r: Restaurant, f: Filters) {
  if ((f.maxBudget || f.minBudget) && r.price === null) return false
  if (f.maxBudget && r.price! > f.maxBudget) return false
  if (f.minBudget && r.price! < f.minBudget) return false
  if (f.radius && distanceKm(f.center, r.coordinates) > f.radius) return false
  if (f.cuisines.length && !f.cuisines.some((wanted) => sameCuisine(wanted, r.cuisine))) return false
  if (f.excludedCuisines.some((avoided) => sameCuisine(avoided, r.cuisine))) return false
  if (f.noSpice && r.spice !== 0) return false
  if (f.allergies.length && (!r.allergens || f.allergies.some((item) => r.allergens!.includes(item)))) return false
  if (f.avoidedIngredients.length && (!r.ingredients || f.avoidedIngredients.some((item) => r.ingredients!.includes(item)))) return false
  return true
}

// Extracts explicit requirements locally until a real agent service is connected.
export function parseRequirements(text: string, previous: Filters): Filters {
  const f = { ...previous, cuisines: [...previous.cuisines], allergies: [...previous.allergies], center: [...previous.center] as Coordinates }
  const budget = text.match(/(?:人均|预算|不超过|不能超过|最多|以内|不到)\s*[¥￥]?\s*(\d+)/) || text.match(/(\d+)\s*(?:元|块|以内)/)
  if (budget) f.maxBudget = Number(budget[1])
  const distance = text.match(/(\d+(?:\.\d+)?)\s*(?:公里|km)/i)
  if (distance) f.radius = Number(distance[1])
  const people = text.match(/(\d+)\s*(?:个人|人|位)/)
  if (people) f.people = Math.min(20, Math.max(1, Number(people[1])))
  if (/两个人|两人|约会/.test(text)) f.people = 2
  if (/一个人|独自/.test(text)) { f.people = 1; f.scene = '一个人吃' }
  if (/约会|浪漫|氛围/.test(text)) f.scene = '约会'
  if (/朋友|聚餐/.test(text)) f.scene = '朋友聚餐'
  if (/家人|家庭|父母/.test(text)) f.scene = '家庭聚会'
  if (/商务|客户/.test(text)) f.scene = '商务用餐'
  if (/安静/.test(text)) f.quiet = true
  if (/少辣|不太辣|清淡|不想吃太辣/.test(text)) f.mild = true
  if (/不能吃辣|不吃辣|不要辣/.test(text)) { f.noSpice = true; f.mild = true }
  if (/花生过敏/.test(text) && !f.allergies.includes('花生')) f.allergies.push('花生')
  if (/虾过敏|海鲜过敏/.test(text) && !f.allergies.includes('虾')) f.allergies.push('虾')
  return f
}
