// Messages between the mobile stage ("app") and whatever directs it ("console": the test console today,
// a multi-agent backend later). Shared by src/, server/ and director/, so it has no imports at all.

export type FeedRole = 'app' | 'console'

/** Speakers besides restaurant ids: the host Orb and the customer holding the phone. */
export const HOST_SPEAKER = 'host'
export const USER_SPEAKER = 'user'

export const LINE_TEXT_MAX = 600
/** Performers on the phone's stage at once: the invited hosts still on stage plus guests. */
export const STAGE_MAX = 6

// What a generated character looks like, as src/agents/rig/types.ts KitLook draws it. Copied because this
// file imports nothing; scripts/stage-relay.test.mjs checks the lists against the rig's own.
export const LOOK_BODIES = ['f_petite', 'f_regular', 'f_tall', 'm_round', 'm_regular', 'm_tall', 'snowking', 'panda', 'opera', 'lady', 'siren'] as const
export const LOOK_HAIRS = ['bun', 'bob', 'long', 'ponytail', 'side', 'crew', 'curly', 'bald', 'clown'] as const
export const LOOK_OUTFITS = ['jacket', 'tang', 'chef', 'shirt', 'suit', 'jumpsuit', 'polo'] as const
export const LOOK_HATS = ['none', 'toque', 'cap', 'bandana', 'straw', 'visor', 'cowboy', 'beret'] as const
export const LOOK_ACCESSORIES = ['glasses', 'mustache', 'earrings', 'goatee', 'bowtie', 'clownface'] as const
export const LOOK_PROPS = ['bucket', 'fries', 'hen', 'sub', 'drumstick', 'burger', 'taco', 'pizza', 'bowl'] as const
export const LOOK_AGES = ['young', 'middle', 'old'] as const
export const LOOK_GENDERS = ['female', 'male'] as const

export interface LookPayload {
  body: (typeof LOOK_BODIES)[number]
  gender: (typeof LOOK_GENDERS)[number]
  theme: string
  age?: (typeof LOOK_AGES)[number]
  hair?: (typeof LOOK_HAIRS)[number]
  hairColor?: string
  outfit?: (typeof LOOK_OUTFITS)[number]
  hat?: (typeof LOOK_HATS)[number]
  skin?: string
  badgeText?: string
  accessories?: (typeof LOOK_ACCESSORIES)[number][]
  prop?: (typeof LOOK_PROPS)[number]
  top?: string
  trim?: string
  pants?: string
  shoes?: string
  /** A PNG/JPEG/WebP data URL for the chest badge; never part of a snapshot. */
  logo?: string | null
  brand?: string
}

/** A persona's fallbacks, as catalog ids (the stage checks them against its catalog). */
export interface PersonaDefaultsPayload { expr: string; gesture: string; act: string; reaction: string }

/** A character the console invites onto the stage without a restaurant behind it. */
export interface GuestProfile {
  name: string
  restaurant: string
  plate: string
  cuisine?: string
  persona: string
  keywords?: string[]
  defaults: PersonaDefaultsPayload
  color: string
  look: LookPayload
  greeting?: string
}

// Console → app.
export interface LineMessage {
  kind: 'line'
  /** Stable application id; the app dedupes and replies by it. */
  id: string
  /** A restaurant id, a guest id, HOST_SPEAKER or USER_SPEAKER. */
  speaker: string
  text: string
  /** Earlier lines this one answers, user lines included. */
  replyTo?: string[]
  topic?: string
  evidenceIds?: string[]
  /** Cut in: the line in progress stops and this one goes first. */
  interrupt?: boolean
  /** Performance slots set by hand (expr, gesture, …, listener_<id>); Jev is still asked. */
  override?: Record<string, string>
  /** A replay or an edit of an earlier line: the history keeps that line's id with this content. */
  replaces?: string
  /** The line said in a regional host's dialect: the Mandarin it was rewritten from, shown under the caption. */
  gloss?: string
  /** Already performed by the phone that sent it (its multi-agent backend's turn, its host's interlude): consoles
   *  show it, other phones leave it alone instead of saying it a second time over their own lines. */
  mirror?: boolean
}
export interface ClearMessage { kind: 'clear' }
export const CAST_ACTS = ['enter', 'exit', 'remove', 'reset'] as const
export type CastAct = (typeof CAST_ACTS)[number]
/** A stage direction, queued with the lines: who enters or leaves, or the line-up resets to the invited hosts. */
export interface CastMessage {
  kind: 'cast'
  id: string
  act: CastAct
  /** A restaurant id or a guest id; absent only for reset. */
  who?: string
  /** Needed when a guest enters for the first time. */
  guest?: GuestProfile
}
/** Withdraws a line still queued, or stops it mid-performance. */
export interface DropMessage { kind: 'drop'; id: string }
export type ConsoleMessage = LineMessage | ClearMessage | CastMessage | DropMessage

// App → console.
export const APP_PHASES = ['home', 'input', 'pick', 'opening', 'debate', 'result', 'detail'] as const
export type AppPhase = (typeof APP_PHASES)[number]
export const CAST_STATUSES = ['idle', 'generating', 'ready', 'error'] as const
export type CastStatus = (typeof CAST_STATUSES)[number]
export const CAST_KINDS = ['host', 'guest'] as const
export type CastKindLabel = (typeof CAST_KINDS)[number]

export interface CastEntry {
  /** Restaurant id or guest id, also used as the line speaker. */
  id: string
  /** Generated host name. */
  name: string
  restaurant: string
  color: string
  status: CastStatus
  /** An invited restaurant's host (the default) or a guest the console brought on. */
  kind?: CastKindLabel
  /** On the debate stage now; false while waiting in the wings. */
  onStage?: boolean
  /** Current generation step while generating. */
  step?: string
  greeting?: string
  evidenceIds?: string[]
  /** The figure without its logo, so a console can draw a portrait. */
  look?: LookPayload
}
export interface SnapshotMessage { kind: 'snapshot'; phase: AppPhase; cast: CastEntry[] }
export interface UserLineMessage { kind: 'user-line'; id: string; text: string }

// "dropped" is an optional extension: a line the app will never perform (unknown speaker, cleared stage).
// Stage directions report through the same message, with the direction's id.
export const LINE_PHASES = ['queued', 'deciding', 'speaking', 'done', 'dropped'] as const
export type LinePhase = (typeof LINE_PHASES)[number]
export interface LineStateMessage { kind: 'line-state'; id: string; phase: LinePhase; note?: string }

/** A performance choice with its Chinese name, so readers never need the performance catalog. */
export interface ChoiceLabel {
  id: string
  zh: string
  /** Jev's pick fell below the confidence gate, so this is the persona default. */
  gated?: boolean
}
/** Jev's intensity score: 0 平静, 1 温和, 2 鲜明, 3 爆发. */
export interface IntensityLabel { score: number; zh: string }

// Every speaker field is optional: customer lines carry no face or gesture, and stance is an extension.
export interface SpeakerDecision {
  expr?: ChoiceLabel
  punch?: ChoiceLabel
  gesture?: ChoiceLabel
  act?: ChoiceLabel
  gaze?: ChoiceLabel
  bubble?: ChoiceLabel
  stance?: ChoiceLabel
  delivery?: ChoiceLabel
  intensity?: IntensityLabel
}
export const SPEAKER_CHOICES = ['expr', 'punch', 'gesture', 'act', 'gaze', 'bubble', 'stance', 'delivery'] as const satisfies readonly (keyof SpeakerDecision)[]
export type SpeakerChoice = (typeof SPEAKER_CHOICES)[number]
/** Confidence is Jev's for its top choice, 0–1; null when Jev gave no usable answer. */
export interface ListenerDecision { reaction: ChoiceLabel; confidence: number | null }

/** One Jev answer as the stage received it, probabilities trimmed to three decimals. */
export interface AnswerDetail {
  type: 'choice' | 'score' | 'noul'
  choice?: string
  score?: number
  noul?: number
  confidence?: number
  probabilities?: Record<string, number>
  legend?: Record<string, string>
}
/** How the plan used one slot: Jev's top pick, whether the gate or a hand override replaced it. */
export interface SlotDetail { id: string; conf: number | null; gated: boolean; top?: string; manual?: boolean; missing?: boolean }
export interface DecisionDetail {
  model?: string
  /** The dialogue state Jev read. */
  state: Record<string, unknown>
  /** The question keys asked; their wording is fixed by the catalog. */
  questions: string[]
  answers: Record<string, AnswerDetail>
  /** Keyed like LineMessage.override: expr, punch, gesture, act, gaze, delivery, stance, bubble, listener_<id>. */
  plan: Record<string, SlotDetail>
  target?: string
  target2?: string | null
  /** The line started on persona defaults before Jev answered. */
  provisional?: boolean
}
export interface DecisionMessage {
  kind: 'decision'
  lineId: string
  /** "baseline" is the keyword fallback and must never be presented as Jev. */
  source: 'jev' | 'baseline'
  note?: string
  latencyMs?: number
  speaker: SpeakerDecision
  /** Keyed by listener id (restaurant or guest id). */
  listeners: Record<string, ListenerDecision>
  detail?: DecisionDetail
}

/** A generated host as the console's asset library shows it (src/agents/generation AgentContract). */
export interface AgentProfile {
  id: string
  name: string
  fullName?: string
  restaurant: string
  plate: string
  cuisine: string
  price?: number | null
  edge?: string
  language: string
  persona: string
  look: string
  signature: string
  palette: string[]
  defaults: PersonaDefaultsPayload
  punch: string
  personality: string
  energy?: number
  keywords: string[]
  logo: string | null
  rig: LookPayload
  greeting: string
  /** The shop facts it was generated from. */
  shop: Record<string, unknown>
  /** Per generation step: source, model, ms, answers, questions, note, why. */
  decisions: Record<string, unknown>
  brand?: { id: string; name: string; mascot: string }
  generator?: number
  created: string
}
/** One per generated host; the relay keeps the latest per id, so a console that opens late still gets it. */
export interface AgentMessage { kind: 'agent'; contract: AgentProfile }
export type AppMessage = SnapshotMessage | UserLineMessage | LineStateMessage | DecisionMessage | AgentMessage
export type StageMessage = ConsoleMessage | AppMessage

// Relay wire format. The event id is the relay's sequence ("<epoch>-<seq>"), unrelated to message ids.
export interface SendRequest { from: FeedRole; message: StageMessage }
export interface StageEnvelope { id: string; at: number; from: FeedRole; message: StageMessage }
export interface RelayPresence { app: number; console: number }
export interface EventId { epoch: string; seq: number }

const ID = /^[A-Za-z0-9_.:-]{1,80}$/
const EVENT_ID = /^([a-z0-9]{1,16})-([1-9][0-9]{0,15})$/
const COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const IMAGE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/
const SLOT = /^(?:expr|punch|gesture|act|gaze|delivery|stance|bubble|listener_[A-Za-z0-9_.:-]{1,80})$/
const LOGO_MAX = 48 * 1024
const ROLES = ['app', 'console'] as const

function fail(path: string, problem: string): never { throw new Error(`${path} ${problem}`) }

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object')
  return value as Record<string, unknown>
}

function text(value: unknown, path: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(path, `must be text of 1–${max} characters`)
  return value.trim()
}

// Text that may be empty (a shop without dishes, a look without a signature line).
function prose(value: unknown, path: string, max: number): string {
  if (typeof value !== 'string' || value.length > max) fail(path, `must be text of at most ${max} characters`)
  return value.trim()
}

// Absent and null both mean "not given", so producers in other languages can send null.
function optional<T>(value: unknown, parse: (value: unknown) => T): T | undefined {
  return value === undefined || value === null ? undefined : parse(value)
}

function id(value: unknown, path: string): string {
  if (typeof value !== 'string' || !ID.test(value)) fail(path, 'must be an id of 1–80 characters [A-Za-z0-9_.:-]')
  return value
}

function ids(value: unknown, path: string, max: number): string[] {
  if (!Array.isArray(value) || value.length > max) fail(path, `must be a list of at most ${max} ids`)
  return [...new Set(value.map((item, index) => id(item, `${path}[${index}]`)))]
}

function texts(value: unknown, path: string, max: number, length: number): string[] {
  if (!Array.isArray(value) || value.length > max) fail(path, `must be a list of at most ${max} texts`)
  return [...new Set(value.map((item, index) => text(item, `${path}[${index}]`, length)))]
}

function oneOf<T extends string>(value: unknown, options: readonly T[], path: string): T {
  if (typeof value !== 'string' || !options.includes(value as T)) fail(path, `must be one of ${options.join(', ')}`)
  return value as T
}

function number(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(path, `must be a number from ${min} to ${max}`)
  return value
}

function count(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) fail(path, 'must be a non-negative integer')
  return value as number
}

function color(value: unknown, path: string): string {
  if (typeof value !== 'string' || !COLOR.test(value)) fail(path, 'must be a hex colour')
  return value
}

function image(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length > LOGO_MAX || !IMAGE.test(value)) fail(path, `must be a PNG, JPEG or WebP data URL of at most ${LOGO_MAX} characters`)
  return value
}

// A nested object forwarded as is (shop facts, Jev's state, generation decisions), bounded by its JSON size.
function json(value: unknown, path: string, max: number): Record<string, unknown> {
  const raw = JSON.stringify(record(value, path))
  if (raw.length > max) fail(path, `must be at most ${max} characters as JSON`)
  return JSON.parse(raw) as Record<string, unknown>
}

function entries<T>(value: unknown, path: string, max: number, key: RegExp, parse: (item: unknown, path: string) => T): Record<string, T> {
  const items = Object.entries(record(value, path))
  if (items.length > max) fail(path, `must have at most ${max} entries`)
  return Object.fromEntries(items.map(([name, item]): [string, T] => {
    if (!key.test(name)) fail(`${path} key ${name}`, 'is not allowed')
    return [name, parse(item, `${path}.${name}`)]
  }))
}

// Drops absent optional fields so parsed messages compare and serialize exactly.
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}

function flag(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'must be true or false')
  return value
}

function choice(value: unknown, path: string): ChoiceLabel {
  const c = record(value, path)
  return defined({ id: id(c.id, `${path}.id`), zh: text(c.zh, `${path}.zh`, 40), gated: optional(c.gated, (v) => flag(v, `${path}.gated`)) })
}

function look(value: unknown, path: string, { logo = true } = {}): LookPayload {
  const l = record(value, path)
  const accessories = optional(l.accessories, (v) => {
    if (!Array.isArray(v) || v.length > LOOK_ACCESSORIES.length) fail(`${path}.accessories`, `must be a list of at most ${LOOK_ACCESSORIES.length}`)
    return [...new Set(v.map((item, index) => oneOf(item, LOOK_ACCESSORIES, `${path}.accessories[${index}]`)))]
  })
  return defined({
    body: oneOf(l.body, LOOK_BODIES, `${path}.body`), gender: oneOf(l.gender, LOOK_GENDERS, `${path}.gender`), theme: color(l.theme, `${path}.theme`),
    age: optional(l.age, (v) => oneOf(v, LOOK_AGES, `${path}.age`)), hair: optional(l.hair, (v) => oneOf(v, LOOK_HAIRS, `${path}.hair`)),
    hairColor: optional(l.hairColor, (v) => color(v, `${path}.hairColor`)), outfit: optional(l.outfit, (v) => oneOf(v, LOOK_OUTFITS, `${path}.outfit`)),
    hat: optional(l.hat, (v) => oneOf(v, LOOK_HATS, `${path}.hat`)), skin: optional(l.skin, (v) => color(v, `${path}.skin`)),
    badgeText: optional(l.badgeText, (v) => text(v, `${path}.badgeText`, 4)), accessories,
    prop: optional(l.prop, (v) => oneOf(v, LOOK_PROPS, `${path}.prop`)), top: optional(l.top, (v) => color(v, `${path}.top`)),
    trim: optional(l.trim, (v) => color(v, `${path}.trim`)), pants: optional(l.pants, (v) => color(v, `${path}.pants`)), shoes: optional(l.shoes, (v) => color(v, `${path}.shoes`)),
    logo: logo ? optional(l.logo, (v) => image(v, `${path}.logo`)) : undefined, brand: optional(l.brand, (v) => id(v, `${path}.brand`)),
  })
}

function personaDefaults(value: unknown, path: string): PersonaDefaultsPayload {
  const d = record(value, path)
  return { expr: id(d.expr, `${path}.expr`), gesture: id(d.gesture, `${path}.gesture`), act: id(d.act, `${path}.act`), reaction: id(d.reaction, `${path}.reaction`) }
}

function guest(value: unknown, path: string): GuestProfile {
  const g = record(value, path)
  return defined({
    name: text(g.name, `${path}.name`, 40), restaurant: text(g.restaurant, `${path}.restaurant`, 60), plate: prose(g.plate, `${path}.plate`, 80),
    cuisine: optional(g.cuisine, (v) => prose(v, `${path}.cuisine`, 40)), persona: text(g.persona, `${path}.persona`, LINE_TEXT_MAX),
    keywords: optional(g.keywords, (v) => texts(v, `${path}.keywords`, 16, 24)), defaults: personaDefaults(g.defaults, `${path}.defaults`),
    color: color(g.color, `${path}.color`), look: look(g.look, `${path}.look`), greeting: optional(g.greeting, (v) => text(v, `${path}.greeting`, LINE_TEXT_MAX)),
  })
}

function castEntry(value: unknown, path: string): CastEntry {
  const c = record(value, path)
  return defined({
    id: id(c.id, `${path}.id`), name: text(c.name, `${path}.name`, 40), restaurant: text(c.restaurant, `${path}.restaurant`, 60), color: color(c.color, `${path}.color`),
    status: oneOf(c.status, CAST_STATUSES, `${path}.status`), kind: optional(c.kind, (v) => oneOf(v, CAST_KINDS, `${path}.kind`)),
    onStage: optional(c.onStage, (v) => flag(v, `${path}.onStage`)), step: optional(c.step, (v) => text(v, `${path}.step`, 40)),
    greeting: optional(c.greeting, (v) => text(v, `${path}.greeting`, LINE_TEXT_MAX)), evidenceIds: optional(c.evidenceIds, (v) => ids(v, `${path}.evidenceIds`, 20)),
    // Portraits never need the badge logo, and logos would push a full snapshot past the size limit.
    look: optional(c.look, (v) => look(v, `${path}.look`, { logo: false })),
  })
}

function speakerDecision(value: unknown, path: string): SpeakerDecision {
  const s = record(value, path), decision: SpeakerDecision = {}
  for (const key of SPEAKER_CHOICES) { const pick = optional(s[key], (v) => choice(v, `${path}.${key}`)); if (pick) decision[key] = pick }
  const intensity = optional(s.intensity, (v) => { const i = record(v, `${path}.intensity`); return { score: number(i.score, `${path}.intensity.score`, 0, 3), zh: text(i.zh, `${path}.intensity.zh`, 40) } })
  if (intensity) decision.intensity = intensity
  return decision
}

function listeners(value: unknown, path: string): Record<string, ListenerDecision> {
  const items = Object.entries(record(value, path))
  if (items.length > 20) fail(path, 'must have at most 20 listeners')
  return Object.fromEntries(items.map(([key, item]): [string, ListenerDecision] => {
    const l = record(item, `${path}.${key}`)
    const confidence = optional(l.confidence, (v) => number(v, `${path}.${key}.confidence`, 0, 1)) ?? null
    return [id(key, `${path} key`), { reaction: choice(l.reaction, `${path}.${key}.reaction`), confidence }]
  }))
}

function answer(value: unknown, path: string): AnswerDetail {
  const a = record(value, path)
  return defined({
    type: oneOf(a.type, ['choice', 'score', 'noul'] as const, `${path}.type`), choice: optional(a.choice, (v) => id(v, `${path}.choice`)),
    score: optional(a.score, (v) => number(v, `${path}.score`, -1000, 1000)), noul: optional(a.noul, (v) => number(v, `${path}.noul`, 0, 1)),
    confidence: optional(a.confidence, (v) => number(v, `${path}.confidence`, 0, 1)),
    probabilities: optional(a.probabilities, (v) => entries(v, `${path}.probabilities`, 60, ID, (p, at) => number(p, at, 0, 1))),
    legend: optional(a.legend, (v) => entries(v, `${path}.legend`, 8, /^\d{1,2}$/, (item, at) => text(item, at, 120))),
  })
}

function slot(value: unknown, path: string): SlotDetail {
  const s = record(value, path)
  return defined({
    id: id(s.id, `${path}.id`), conf: optional(s.conf, (v) => number(v, `${path}.conf`, 0, 1)) ?? null, gated: flag(s.gated, `${path}.gated`),
    top: optional(s.top, (v) => id(v, `${path}.top`)), manual: optional(s.manual, (v) => flag(v, `${path}.manual`)), missing: optional(s.missing, (v) => flag(v, `${path}.missing`)),
  })
}

function decisionDetail(value: unknown, path: string): DecisionDetail {
  const d = record(value, path)
  return defined({
    model: optional(d.model, (v) => text(v, `${path}.model`, 80)), state: json(d.state, `${path}.state`, 16000),
    questions: ids(d.questions, `${path}.questions`, 40), answers: entries(d.answers, `${path}.answers`, 40, ID, answer),
    plan: entries(d.plan, `${path}.plan`, 30, SLOT, slot), target: optional(d.target, (v) => id(v, `${path}.target`)),
    target2: d.target2 === null ? null : optional(d.target2, (v) => id(v, `${path}.target2`)), provisional: optional(d.provisional, (v) => flag(v, `${path}.provisional`)),
  })
}

function agentProfile(value: unknown, path: string): AgentProfile {
  const c = record(value, path)
  if (!Array.isArray(c.palette) || c.palette.length > 8) fail(`${path}.palette`, 'must be a list of at most 8 colours')
  const brand = optional(c.brand, (v) => { const b = record(v, `${path}.brand`); return { id: id(b.id, `${path}.brand.id`), name: text(b.name, `${path}.brand.name`, 40), mascot: text(b.mascot, `${path}.brand.mascot`, 40) } })
  return defined({
    id: id(c.id, `${path}.id`), name: text(c.name, `${path}.name`, 40), fullName: optional(c.fullName, (v) => prose(v, `${path}.fullName`, 80)),
    restaurant: text(c.restaurant, `${path}.restaurant`, 60), plate: prose(c.plate, `${path}.plate`, 80), cuisine: prose(c.cuisine, `${path}.cuisine`, 40),
    price: c.price === null ? null : optional(c.price, (v) => number(v, `${path}.price`, 0, 100000)), edge: optional(c.edge, (v) => color(v, `${path}.edge`)),
    language: id(c.language, `${path}.language`), persona: text(c.persona, `${path}.persona`, LINE_TEXT_MAX), look: prose(c.look, `${path}.look`, 400),
    signature: prose(c.signature, `${path}.signature`, 200), palette: c.palette.map((item, index) => color(item, `${path}.palette[${index}]`)),
    defaults: personaDefaults(c.defaults, `${path}.defaults`), punch: id(c.punch, `${path}.punch`), personality: id(c.personality, `${path}.personality`),
    energy: optional(c.energy, (v) => number(v, `${path}.energy`, 0, 3)), keywords: texts(c.keywords, `${path}.keywords`, 24, 24),
    logo: optional(c.logo, (v) => image(v, `${path}.logo`)) ?? null, rig: look(c.rig, `${path}.rig`, { logo: false }),
    greeting: text(c.greeting, `${path}.greeting`, LINE_TEXT_MAX), shop: json(c.shop, `${path}.shop`, 6000), decisions: json(c.decisions, `${path}.decisions`, 40000),
    brand, generator: optional(c.generator, (v) => count(v, `${path}.generator`)), created: text(c.created, `${path}.created`, 40),
  })
}

/** Validates what a console (or backend) may send to the stage. Throws with the failing field path. */
export function parseConsoleMessage(value: unknown): ConsoleMessage {
  const m = record(value, 'message')
  switch (m.kind) {
    case 'clear': return { kind: 'clear' }
    case 'drop': return { kind: 'drop', id: id(m.id, 'drop.id') }
    case 'cast': {
      const act = oneOf(m.act, CAST_ACTS, 'cast.act')
      const who = optional(m.who, (v) => id(v, 'cast.who'))
      if (act !== 'reset' && !who) fail('cast.who', `is needed to ${act}`)
      return defined({ kind: 'cast' as const, id: id(m.id, 'cast.id'), act, who: act === 'reset' ? undefined : who, guest: act === 'enter' ? optional(m.guest, (v) => guest(v, 'cast.guest')) : undefined })
    }
    case 'line': return defined({
      kind: 'line' as const, id: id(m.id, 'line.id'), speaker: id(m.speaker, 'line.speaker'), text: text(m.text, 'line.text', LINE_TEXT_MAX),
      replyTo: optional(m.replyTo, (v) => ids(v, 'line.replyTo', 12)), topic: optional(m.topic, (v) => text(v, 'line.topic', 40)),
      evidenceIds: optional(m.evidenceIds, (v) => ids(v, 'line.evidenceIds', 12)), interrupt: optional(m.interrupt, (v) => flag(v, 'line.interrupt')) || undefined,
      override: optional(m.override, (v) => entries(v, 'line.override', 24, SLOT, id)), replaces: optional(m.replaces, (v) => id(v, 'line.replaces')),
      gloss: optional(m.gloss, (v) => text(v, 'line.gloss', LINE_TEXT_MAX)), mirror: optional(m.mirror, (v) => flag(v, 'line.mirror')) || undefined,
    })
    default: fail('message.kind', 'must be line, clear, cast or drop')
  }
}

/** Validates what the stage reports back. Throws with the failing field path. */
export function parseAppMessage(value: unknown): AppMessage {
  const m = record(value, 'message')
  switch (m.kind) {
    case 'snapshot': {
      if (!Array.isArray(m.cast) || m.cast.length > 16) fail('snapshot.cast', 'must be a list of at most 16 entries')
      const cast = m.cast.map((entry, index) => castEntry(entry, `snapshot.cast[${index}]`))
      if (new Set(cast.map((entry) => entry.id)).size !== cast.length) fail('snapshot.cast', 'must not repeat an id')
      return { kind: 'snapshot', phase: oneOf(m.phase, APP_PHASES, 'snapshot.phase'), cast }
    }
    case 'user-line': return { kind: 'user-line', id: id(m.id, 'user-line.id'), text: text(m.text, 'user-line.text', LINE_TEXT_MAX) }
    case 'line-state': return defined({ kind: 'line-state' as const, id: id(m.id, 'line-state.id'), phase: oneOf(m.phase, LINE_PHASES, 'line-state.phase'), note: optional(m.note, (v) => text(v, 'line-state.note', 120)) })
    case 'decision': return defined({
      kind: 'decision' as const, lineId: id(m.lineId, 'decision.lineId'), source: oneOf(m.source, ['jev', 'baseline'] as const, 'decision.source'),
      note: optional(m.note, (v) => text(v, 'decision.note', 300)), latencyMs: optional(m.latencyMs, (v) => number(v, 'decision.latencyMs', 0, 600000)),
      speaker: speakerDecision(m.speaker, 'decision.speaker'), listeners: listeners(m.listeners, 'decision.listeners'),
      detail: optional(m.detail, (v) => decisionDetail(v, 'decision.detail')),
    })
    case 'agent': return { kind: 'agent', contract: agentProfile(m.contract, 'agent.contract') }
    default: fail('message.kind', 'must be snapshot, user-line, line-state, decision or agent')
  }
}

function parseFrom(role: FeedRole, value: unknown): StageMessage {
  return role === 'console' ? parseConsoleMessage(value) : parseAppMessage(value)
}

/** Body of POST /api/stage/send: the sender's role decides which messages it may send. */
export function parseSendRequest(value: unknown): SendRequest {
  const r = record(value, 'request'), from = oneOf(r.from, ROLES, 'from')
  return { from, message: parseFrom(from, r.message) }
}

/** Data of one SSE event from the relay. */
export function parseEnvelope(value: unknown): StageEnvelope {
  const e = record(value, 'envelope'), from = oneOf(e.from, ROLES, 'envelope.from')
  if (!parseEventId(e.id)) fail('envelope.id', 'must be an event id')
  return { id: e.id as string, at: number(e.at, 'envelope.at', 0, Number.MAX_SAFE_INTEGER), from, message: parseFrom(from, e.message) }
}

export function parsePresence(value: unknown): RelayPresence {
  const p = record(value, 'presence')
  return { app: count(p.app, 'presence.app'), console: count(p.console, 'presence.console') }
}

export function formatEventId(epoch: string, seq: number): string { return `${epoch}-${seq}` }

/** Returns null for anything that is not a relay event id, including ids from other formats. */
export function parseEventId(value: unknown): EventId | null {
  const match = typeof value === 'string' ? EVENT_ID.exec(value) : null
  return match ? { epoch: match[1]!, seq: Number(match[2]) } : null
}

/** Unique enough for lines from several consoles and backends at once. */
export function createMessageId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
