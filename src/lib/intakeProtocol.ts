export interface DiningRequirements {
  people: number | null
  budget: { min: number | null; max: number | null } | 'any' | null
  location: string | null
  radiusKm: number | 'any' | null
  time: string | null
  scene: string | null
  cuisines: string[] | 'any' | null
  excludedCuisines: string[]
  preferences: string[]
  quiet: boolean | null
  mild: boolean | null
  noSpice: boolean | null
  allergies: string[]
  avoidedIngredients: string[]
}

export interface IntakeResult { requirements: DiningRequirements; reply: string; question: string | null }
export interface IntakeTurn { role: 'user' | 'assistant'; content: string }
export interface IntakeRequest { turns: IntakeTurn[]; previous: DiningRequirements | null; utterance: string }

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object')
  return value as Record<string, unknown>
}

function text(value: unknown, max = 120): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid text')
  return value.trim()
}

function nullableText(value: unknown) { return value === null ? null : text(value) }

function number(value: unknown, max: number, integer = false): number | null {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || (integer && (!Number.isInteger(value) || value < 1))) throw new Error('Invalid number')
  return value
}

function list(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error('Invalid list')
  return [...new Set(value.map((item) => text(item, 60)))]
}

// Treat incomplete or malformed model output as a failed turn, never as an empty set of preferences.
export function parseRequirementsDraft(value: unknown): DiningRequirements {
  const d = record(value)
  let budget: DiningRequirements['budget'] = null
  if (d.budget === 'any') budget = 'any'
  else if (d.budget !== null) {
    const b = record(d.budget), min = number(b.min, 100000), max = number(b.max, 100000)
    if ((min === null && max === null) || max === 0 || (min !== null && max !== null && min > max)) throw new Error('Invalid budget')
    budget = { min, max }
  }
  for (const key of ['noSpice', 'quiet', 'mild']) if (d[key] !== null && typeof d[key] !== 'boolean') throw new Error('Invalid preference')
  const cuisines = d.cuisines === null || d.cuisines === 'any' ? d.cuisines : list(d.cuisines)
  const excludedCuisines = list(d.excludedCuisines)
  if (Array.isArray(cuisines) && cuisines.some((item) => excludedCuisines.includes(item))) throw new Error('Conflicting cuisines')
  return {
    people: number(d.people, 100, true), budget, location: nullableText(d.location),
    radiusKm: d.radiusKm === 'any' ? 'any' : number(d.radiusKm, 1000), time: nullableText(d.time), scene: nullableText(d.scene),
    cuisines, excludedCuisines, preferences: list(d.preferences), noSpice: d.noSpice as boolean | null,
    quiet: d.quiet as boolean | null, mild: d.mild as boolean | null,
    allergies: list(d.allergies), avoidedIngredients: list(d.avoidedIngredients),
  }
}

export function parseIntakeResult(value: unknown): IntakeResult {
  const r = record(value)
  return { requirements: parseRequirementsDraft(r.requirements), reply: text(r.reply, 160), question: r.question === null ? null : text(r.question, 100) }
}

// Only bounded user/assistant context is accepted; clients cannot inject a system message.
export function parseIntakeRequest(value: unknown): IntakeRequest {
  const r = record(value)
  if (!Array.isArray(r.turns) || r.turns.length > 20) throw new Error('Invalid conversation')
  const turns = r.turns.map((value) => {
    const turn = record(value)
    if (turn.role !== 'user' && turn.role !== 'assistant') throw new Error('Invalid conversation role')
    return { role: turn.role, content: text(turn.content, 8000) } as IntakeTurn
  })
  return { turns, previous: r.previous === null ? null : parseRequirementsDraft(r.previous), utterance: text(r.utterance, 4000) }
}
