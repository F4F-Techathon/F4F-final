import type { Filters, Restaurant } from '@/data/types'
import { distanceKm } from './filtering'
export interface RestaurantHighlight { icon: string; title: string; description: string; evidenceIds: string[] }

// Merchant highlights describe known facts and carry their source IDs.
export function restaurantHighlights(r: Restaurant, f: Filters): RestaurantHighlight[] {
  const reasons: RestaurantHighlight[] = []
  if (r.price !== null) reasons.push({ icon: 'ticket', title: f.maxBudget ? '符合预算' : '价格参考', description: `参考人均 ¥${r.price}${f.maxBudget ? `，在 ¥${f.maxBudget} 的预算内` : '，以实际点单为准'}。`, evidenceIds: [r.evidenceIds[0]!] })
  if (f.quiet && r.quiet === true) reasons.push({ icon: 'leaf', title: '环境更适合慢聊', description: '评价中提到环境适合聊天。', evidenceIds: [r.evidenceIds[1]!] })
  else if (f.scene && r.scenes.includes(f.scene)) reasons.push({ icon: 'heart', title: `适合${f.scene}`, description: `${r.tags[0]}，符合这次用餐的氛围。`, evidenceIds: [r.evidenceIds[0]!, r.evidenceIds[1]!] })
  if (f.mild && r.spice === 0) reasons.push({ icon: 'leaf', title: '符合清淡口味', description: '口味不辣，符合你补充的偏好。', evidenceIds: [r.evidenceIds[0]!] })
  if (reasons.length < 3) reasons.push({ icon: 'pin', title: '距离合适', description: `距搜索中心直线约 ${distanceKm(f.center, r.coordinates).toFixed(1)} km，实际路线以地图为准。`, evidenceIds: [r.evidenceIds[0]!] })
  if (reasons.length < 3) reasons.push({ icon: 'fork', title: '招牌菜', description: r.specialty, evidenceIds: [r.evidenceIds[0]!] })
  return reasons.slice(0, 3)
}
