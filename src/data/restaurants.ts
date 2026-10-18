import type { Coordinates, Evidence, Filters, Restaurant } from './types'
import { demoEvidence, demoRestaurants } from './demo'
import { evidenceFrom, restaurantFrom, shops, shopsCenter } from './dianping'
import { cuisineGroup } from '@/lib/filtering'

// The shops the app runs on: real Dianping listings by default, or the nine hand-written demo shops with
// VITE_DATASET=demo (the unit tests use those).
export const DATASET: 'dianping' | 'demo' = import.meta.env.VITE_DATASET === 'demo' ? 'demo' : 'dianping'
const demo = DATASET === 'demo'

export const restaurants: Restaurant[] = demo ? demoRestaurants : shops.map(restaurantFrom)
export const evidence: Evidence[] = demo ? demoEvidence : shops.flatMap(evidenceFrom)
const evidenceById = new Map(evidence.map((item) => [item.id, item]))

// Where a search starts until the user sets a place: the middle of the shops.
export const START_PLACE: { name: string; center: Coordinates; note: string } = demo
  ? { name: '上海 · 静安寺', center: [121.4453, 31.2231], note: '演示餐厅集中在这个区域' }
  : { name: '上海 · 张江', center: shopsCenter(), note: `${shops.length} 家大众点评店铺集中在这个区域` }
const START = START_PLACE
/** How the maps label the shops. */
export const DATA_LABEL = demo ? '演示餐厅' : '大众点评'

// Resolves the sources in statement order for the stage, history and restaurant details.
export function getEvidence(ids: string[]): Evidence[] {
  return ids.map((id) => evidenceById.get(id)).filter((item) => !!item)
}

// Records the multi-agent backend cites arrive with its lines (its own ids, e.g. review:<shop>:<review>); once
// registered they show under the line like the app's own evidence.
export function registerEvidence(items: Evidence[]) {
  for (const item of items) if (!evidenceById.has(item.id)) evidenceById.set(item.id, item)
}

export const defaultFilters = (): Filters => ({ minBudget: 0, maxBudget: 0, radius: 3, cuisines: [], excludedCuisines: [], preferences: [], scene: '', people: 2, time: '今晚 19:30', quiet: false, mild: false, noSpice: false, allergies: [], avoidedIngredients: [], locationName: START.name, center: [...START.center] })
// Filter chips: the cuisine groups present, most common first; catch-all listing categories are left out.
const GENERIC = ['美食', '商场', '特色菜']
const groupCounts = restaurants.map((r) => cuisineGroup(r.cuisine)).filter((name) => !GENERIC.includes(name))
  .reduce((counts, name) => counts.set(name, (counts.get(name) ?? 0) + 1), new Map<string, number>())
export const cuisines = [...groupCounts].sort((a, b) => b[1] - a[1]).map(([name]) => name)
export const scenes = ['约会', '朋友聚餐', '家庭聚会', '一个人吃', '商务用餐']
export const budgetOptions = [{ label: '不限', min: 0, max: 0 }, { label: '¥50 以下', min: 0, max: 50 }, { label: '¥50–100', min: 50, max: 100 }, { label: '¥100–200', min: 100, max: 200 }, { label: '¥200 以上', min: 200, max: 0 }]
