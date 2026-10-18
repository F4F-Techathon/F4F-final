import { HOST_SPEAKER, USER_SPEAKER, type CastAct, type DecisionMessage, type LinePhase, type SnapshotMessage, type StageMessage } from '../../../src/agents/feed/protocol.ts'
import type { FeedMeta } from '../../../src/agents/feed/stageFeed.ts'

/** When each phase of a performance was reported (relay time, ms). */
export interface PhaseTimes { sent?: number; queued?: number; deciding?: number; speaking?: number; done?: number; dropped?: number }

export interface LineItem {
  type: 'line'
  key: string
  /** Running number shown as #n. */
  no: number
  id: string
  /** "console" for lines sent to the stage, "app" for what the customer said on the phone. */
  origin: 'console' | 'app'
  speaker: string
  text: string
  replyTo: string[]
  topic?: string
  evidenceIds: string[]
  at: number
  phase?: LinePhase
  phaseNote?: string
  decision?: DecisionMessage
  /** False while only its state or decision is known, e.g. the line predates this console. */
  seen: boolean
  interrupt?: boolean
  /** Performance slots set by hand in the inspector; every replay carries them. */
  override?: Record<string, string>
  edited?: boolean
  /** The id performing for this card now: a replay or an edit goes out under a new id and reports here. */
  live?: string
  /** The current performance is a replay (or an edit) of this card. */
  replaying?: boolean
  times: PhaseTimes
}
/** A stage direction: someone walks on or off, or the line-up resets. */
export interface StageItem {
  type: 'stage'
  key: string
  no: number
  id: string
  act: CastAct
  who: string
  at: number
  phase?: LinePhase
  phaseNote?: string
  live?: string
  times: PhaseTimes
}
export interface ClearItem { type: 'clear'; key: string; at: number }
export type TimelineItem = LineItem | StageItem | ClearItem
export interface RosterEntry { name: string; restaurant: string; color: string }

export interface DirectorState {
  snapshot: SnapshotMessage | null
  snapshotAt: number
  /** Every cast member seen in any snapshot, so older lines keep their names after the cast changes. */
  roster: Record<string, RosterEntry>
  timeline: TimelineItem[]
  counter: number
  /** Replays, edits and replayed stage directions go out under new ids; their reports land on the original item. */
  aliases: Record<string, string>
  /** Items deleted here: later reports about them are ignored. */
  removed: string[]
  /** Play-all's own setup (resetting the line-up, bringing the opening guests back on): never shown as rows. */
  quiet: string[]
  quietClears: number
  /** Guests on stage when the thread's first line went out: play-all starts from this line-up. */
  lineup0: string[] | null
}

export const TIMELINE_LIMIT = 300
/** Lines that keep Jev's full detail when the console saves its view; older ones keep the summary. */
export const DETAIL_KEEP = 40
const HOST: RosterEntry = { name: '主持人 Orb', restaurant: '', color: '#c9b3f2' }
const USER: RosterEntry = { name: '顾客', restaurant: '', color: '#d9b77f' }

export function createDirectorState(): DirectorState {
  return { snapshot: null, snapshotAt: 0, roster: {}, timeline: [], counter: 0, aliases: {}, removed: [], quiet: [], quietClears: 0, lineup0: null }
}

export function speakerOf(state: DirectorState, id: string): RosterEntry {
  if (id === HOST_SPEAKER) return HOST
  if (id === USER_SPEAKER) return USER
  return state.roster[id] ?? { name: id || '未知', restaurant: '', color: '#8b7a83' }
}

export const isLine = (item: TimelineItem): item is LineItem => item.type === 'line'
export const isStage = (item: TimelineItem): item is StageItem => item.type === 'stage'

function push(state: DirectorState, item: TimelineItem) {
  state.timeline.push(item)
  if (state.timeline.length > TIMELINE_LIMIT) state.timeline.splice(0, state.timeline.length - TIMELINE_LIMIT)
}

function findLine(state: DirectorState, id: string) {
  return state.timeline.find((item): item is LineItem => item.type === 'line' && item.id === id)
}

/** The card a message id reports on: the item itself, or the one a replay of it stands for. */
export function itemFor(state: DirectorState, id: string): LineItem | StageItem | undefined {
  const own = state.aliases[id] ?? id
  return state.timeline.find((item): item is LineItem | StageItem => item.type !== 'clear' && item.id === own)
}

// A line this console never saw gets a row once the stage actually performs it (it speaks, or a decision
// comes back), so no decision is silently lost; a phone merely queueing old lines it is catching up on does not.
function lineFor(state: DirectorState, id: string, at: number, performing: boolean): LineItem | StageItem | undefined {
  const own = state.aliases[id] ?? id
  if (state.removed.includes(own)) return undefined
  const found = itemFor(state, id)
  if (found || !performing) return found
  push(state, { type: 'line', key: `line:${id}`, no: ++state.counter, id, origin: 'console', speaker: '', text: '', replyTo: [], evidenceIds: [], at, seen: false, times: {} })
  return findLine(state, id)
}

// A performance only moves forward. With several phones open, a slower one reporting 「排队中」 after another
// already finished the line must not pull the card back.
const PHASE_ORDER: Record<LinePhase, number> = { queued: 1, deciding: 2, speaking: 3, done: 4, dropped: 4 }

type LineFields = Pick<LineItem, 'origin' | 'speaker' | 'text' | 'replyTo' | 'topic' | 'evidenceIds' | 'interrupt' | 'override'>
function addLine(state: DirectorState, id: string, at: number, fields: LineFields) {
  if (state.removed.includes(id)) return
  const found = findLine(state, id)
  if (found?.seen) return
  if (found) Object.assign(found, fields, { seen: true }, { times: { ...found.times, sent: found.times.sent ?? at } })
  else push(state, { type: 'line', key: `line:${id}`, no: ++state.counter, id, at, seen: true, times: { sent: at }, ...fields })
}

// A replay or an edit: the card keeps its place and number, shows the new text, and follows the new id.
function resend(state: DirectorState, card: LineItem, id: string, text: string, override: Record<string, string> | undefined, at: number) {
  state.aliases[id] = card.id
  if (card.live === id) return
  if (text !== card.text) { card.text = text; card.edited = true }
  card.override = override
  card.live = id
  card.replaying = true
  card.phase = undefined
  card.phaseNote = undefined
  card.times = { sent: at }
}

/** Folds one relay message into the console's view; a repeated line id is ignored. */
export function applyStageMessage(state: DirectorState, message: StageMessage, meta: FeedMeta) {
  switch (message.kind) {
    case 'snapshot':
      state.snapshot = message
      state.snapshotAt = meta.at
      for (const entry of message.cast) state.roster[entry.id] = { name: entry.name, restaurant: entry.restaurant, color: entry.color }
      return
    case 'clear':
      if (state.quietClears > 0) { state.quietClears--; return }
      push(state, { type: 'clear', key: `clear:${meta.id}`, at: meta.at })
      return
    case 'line': {
      const original = state.aliases[message.id] ?? message.replaces
      const card = original ? itemFor(state, original) : undefined
      if (card?.type === 'line') { resend(state, card, message.id, message.text, message.override, meta.at); return }
      addLine(state, message.id, meta.at, {
        origin: 'console', speaker: message.speaker, text: message.text, replyTo: message.replyTo ?? [], topic: message.topic,
        evidenceIds: message.evidenceIds ?? [], interrupt: message.interrupt, override: message.override,
      })
      return
    }
    case 'cast': {
      if (state.quiet.includes(message.id)) return
      const original = state.aliases[message.id]
      const item = original ? itemFor(state, original) : undefined
      if (item?.type === 'stage') { item.live = message.id; item.phase = undefined; item.phaseNote = undefined; item.times = { sent: meta.at }; return }
      if (state.removed.includes(message.id) || state.timeline.some((entry) => entry.type === 'stage' && entry.id === message.id)) return
      // A report may have arrived first and made a placeholder line; the direction takes its place.
      const placeholder = findLine(state, message.id)
      if (placeholder && !placeholder.seen) state.timeline.splice(state.timeline.indexOf(placeholder), 1)
      push(state, {
        type: 'stage', key: `stage:${message.id}`, no: ++state.counter, id: message.id, act: message.act, who: message.who ?? '', at: meta.at,
        ...(placeholder?.phase ? { phase: placeholder.phase, phaseNote: placeholder.phaseNote } : {}), times: { ...placeholder?.times, sent: meta.at },
      })
      return
    }
    case 'drop': return
    case 'user-line': addLine(state, message.id, meta.at, { origin: 'app', speaker: USER_SPEAKER, text: message.text, replyTo: [], evidenceIds: [] }); return
    case 'line-state': {
      if (state.quiet.includes(message.id)) return
      const item = lineFor(state, message.id, meta.at, message.phase === 'speaking')
      // A superseded performance (the card was replayed since) no longer speaks for it.
      if (!item || (item.live && item.live !== message.id)) return
      if (item.phase && PHASE_ORDER[message.phase] <= PHASE_ORDER[item.phase]) return
      item.phase = message.phase
      item.phaseNote = message.note
      item.times[message.phase] = meta.at
      if (item.type === 'line' && (message.phase === 'done' || message.phase === 'dropped')) item.replaying = false
      return
    }
    case 'decision': {
      const item = lineFor(state, message.lineId, meta.at, true)
      if (item?.type === 'line' && (!item.live || item.live === message.lineId)) item.decision = message
      return
    }
    case 'agent': return
  }
}

/** Remembers a direction this console sends for its own setup, so neither it nor its reports become rows. */
export function quietly(state: DirectorState, id: string) {
  state.quiet.push(id)
  if (state.quiet.length > 50) state.quiet.splice(0, state.quiet.length - 50)
}

/** Takes an item out of the view; reports about it, or about any replay of it, are ignored from now on. */
export function removeItem(state: DirectorState, id: string) {
  const index = state.timeline.findIndex((item) => item.type !== 'clear' && item.id === id)
  if (index >= 0) state.timeline.splice(index, 1)
  if (!state.removed.includes(id)) state.removed.push(id)
  if (state.removed.length > TIMELINE_LIMIT) state.removed.splice(0, state.removed.length - TIMELINE_LIMIT)
}

/** The latest spoken lines since the stage was last cleared, newest last; reply targets come from here. */
export function recentLines(state: DirectorState, count: number): LineItem[] {
  let start = state.timeline.length
  while (start > 0 && state.timeline[start - 1]!.type !== 'clear') start--
  return state.timeline.slice(start).filter((item): item is LineItem => item.type === 'line' && item.seen).slice(-count)
}

// Jev's full detail is several kilobytes a line; only the latest lines keep it, so the saved view stays
// well inside the browser's storage quota and the resume point is never silently lost.
export function persistable(state: DirectorState): DirectorState {
  const lines = state.timeline.filter(isLine)
  const keep = new Set(lines.slice(-DETAIL_KEEP).map((line) => line.id))
  return {
    ...state,
    timeline: state.timeline.map((item) => {
      if (item.type !== 'line' || keep.has(item.id) || !item.decision?.detail) return item
      const decision = { ...item.decision }
      delete decision.detail
      return { ...item, decision }
    }),
  }
}

/** A saved view, filled in where an older console left fields out. */
export function restoreState(saved: Partial<DirectorState>): DirectorState {
  const state = { ...createDirectorState(), ...saved }
  state.timeline = (state.timeline ?? []).map((item) => (item.type === 'clear' ? item : { ...item, times: item.times ?? {} })) as TimelineItem[]
  return state
}
