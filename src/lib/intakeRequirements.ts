import type { DiningRequirements } from './intakeProtocol'
import type { Filters } from '@/data/types'
import { defaultFilters } from '@/data/restaurants'

// Summaries contain only known user facts, preserving the distinction between unknown and unrestricted.
export function requirementRows(d: DiningRequirements) {
  const budget = typeof d.budget === 'object' && d.budget ? d.budget : null
  const budgetText = d.budget === 'any' ? '预算不限' : budget
    ? budget.min !== null && budget.max !== null ? `人均 ¥${budget.min}–${budget.max}` : budget.max !== null ? `人均 ¥${budget.max} 内` : `人均 ¥${budget.min} 起` : ''
  return [
    { id: 'party', icon: 'heart', label: '这一餐', value: [d.people === null ? '' : `${d.people} 人`, d.scene, d.time].filter(Boolean).join(' · ') },
    { id: 'budget', icon: 'ticket', label: '预算', value: budgetText },
    { id: 'location', icon: 'pin', label: '位置', value: [d.location === 'any' ? '位置不限' : d.location === 'nearby' ? '我附近' : d.location, d.radiusKm === 'any' ? '距离不限' : d.radiusKm === null ? '' : `${d.radiusKm} km 内`].filter(Boolean).join(' · ') },
    { id: 'taste', icon: 'fork', label: '口味', value: [...(d.cuisines === 'any' ? ['菜系不限'] : d.cuisines || []), ...d.preferences, ...(d.quiet && !d.preferences.some((item) => /安静/.test(item)) ? ['安静一点'] : []), ...(d.mild && !d.preferences.some((item) => /清淡|少辣/.test(item)) ? ['清淡一点'] : [])].join(' · ') },
    { id: 'avoid', icon: 'leaf', label: '忌口', value: [...d.excludedCuisines.map((item) => `不吃${item}`), ...(d.noSpice ? ['不吃辣'] : []), ...d.allergies.map((item) => `${item}过敏`), ...d.avoidedIngredients.map((item) => `不吃${item}`)].join(' · ') },
  ].filter((row) => row.value)
}

// Commit model facts directly, never re-parse old utterances that may contain superseded requirements.
export function filtersFromRequirements(d: DiningRequirements, location?: { name: string; center: [number, number] }): Filters {
  const defaults = defaultFilters()
  return {
    ...defaults,
    people: d.people ?? defaults.people, scene: d.scene || '', time: d.time || '',
    minBudget: d.budget && d.budget !== 'any' ? d.budget.min ?? 0 : 0,
    maxBudget: d.budget && d.budget !== 'any' ? d.budget.max ?? 0 : 0,
    radius: typeof d.radiusKm === 'number' ? d.radiusKm : 0,
    locationName: location?.name || defaults.locationName, center: location?.center || defaults.center,
    cuisines: Array.isArray(d.cuisines) ? [...d.cuisines] : [], excludedCuisines: [...d.excludedCuisines],
    preferences: [...d.preferences], mild: d.mild === true,
    quiet: d.quiet === true, noSpice: d.noSpice === true,
    allergies: [...d.allergies], avoidedIngredients: [...d.avoidedIngredients],
  }
}
