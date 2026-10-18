// The shortlist agent (POST /api/shortlist): the confirmed request and the shops that pass its hard limits in, the
// shops the agent picks for the swipe deck out, best first, each with a one-line reason. Shared by the page and
// server/shortlist.ts; no dependencies.

export interface ShortlistBrief {
  text: string // what the user said, as confirmed on the input page
  people: number
  minBudget: number
  maxBudget: number
  scene: string
  time: string
  quiet: boolean
  mild: boolean
  noSpice: boolean
  cuisines: string[]
  excludedCuisines: string[]
  preferences: string[]
  allergies: string[]
  avoidedIngredients: string[]
  locationName: string
  center: [number, number]
}

export interface ShortlistRequest { brief: ShortlistBrief; candidateIds: string[] }
export interface ShortlistPick { id: string; reason: string }
export interface ShortlistResult { picks: ShortlistPick[]; summary: string; model: string }

export const SHORTLIST_MAX = 10
const MAX_CANDIDATES = 120
const ID = /^[A-Za-z0-9_-]{1,40}$/

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object')
  return value as Record<string, unknown>
}
const str = (value: unknown, max: number) => {
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid text')
  return value.trim()
}
const num = (value: unknown, max: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) throw new Error('Invalid number')
  return value
}
const bool = (value: unknown) => { if (typeof value !== 'boolean') throw new Error('Invalid flag'); return value }
const words = (value: unknown) => {
  if (!Array.isArray(value) || value.length > 20) throw new Error('Invalid list')
  return [...new Set(value.map((item) => str(item, 40)).filter(Boolean))]
}

export function parseShortlistRequest(value: unknown): ShortlistRequest {
  const r = record(value), b = record(r.brief)
  const center = b.center
  if (!Array.isArray(center) || center.length !== 2 || !center.every((v) => typeof v === 'number' && Number.isFinite(v))) throw new Error('Invalid center')
  if (!Array.isArray(r.candidateIds) || !r.candidateIds.length || r.candidateIds.length > MAX_CANDIDATES) throw new Error('Invalid candidates')
  const candidateIds = [...new Set(r.candidateIds.map((id) => { if (typeof id !== 'string' || !ID.test(id)) throw new Error('Invalid id'); return id }))]
  return {
    candidateIds,
    brief: {
      text: str(b.text, 4000), people: num(b.people, 200), minBudget: num(b.minBudget, 100000), maxBudget: num(b.maxBudget, 100000),
      scene: str(b.scene, 40), time: str(b.time, 60), quiet: bool(b.quiet), mild: bool(b.mild), noSpice: bool(b.noSpice),
      cuisines: words(b.cuisines), excludedCuisines: words(b.excludedCuisines), preferences: words(b.preferences),
      allergies: words(b.allergies), avoidedIngredients: words(b.avoidedIngredients), locationName: str(b.locationName, 80),
      center: [center[0] as number, center[1] as number],
    },
  }
}

// The model's reply, kept only where it names offered shops: unknown or repeated ids are dropped, reasons trimmed.
export function parseShortlistResult(value: unknown, candidateIds: readonly string[], model: string): ShortlistResult {
  const r = record(value)
  if (!Array.isArray(r.picks)) throw new Error('Missing picks')
  const offered = new Set(candidateIds), seen = new Set<string>()
  const picks: ShortlistPick[] = []
  for (const item of r.picks) {
    const pick = record(item)
    const id = typeof pick.id === 'string' ? pick.id.trim() : ''
    if (!offered.has(id) || seen.has(id)) continue
    seen.add(id)
    const reason = typeof pick.reason === 'string' ? pick.reason.trim().slice(0, 60) : ''
    picks.push({ id, reason })
    if (picks.length >= SHORTLIST_MAX) break
  }
  if (!picks.length) throw new Error('No usable picks')
  const summary = typeof r.summary === 'string' ? r.summary.trim().slice(0, 80) : ''
  return { picks, summary, model }
}
