import type { CastAct, DecisionMessage } from '@/agents/feed/protocol'
import { createMessageId } from '@/agents/feed/protocol'
import type { DirectorState, LineItem, StageItem, TimelineItem } from './timeline.ts'

// Saved threads (会话). The browser keeps them; JSON export and import move them between machines.
// A session keeps each line's words, replies and hand-set slots and its decision summary (not Jev's
// full detail), each stage direction, and the guests on stage when it began.
export interface SessionLine {
  kind: 'line'
  ref: string
  origin: 'console' | 'app'
  speaker: string
  text: string
  replyTo: string[]
  topic?: string
  evidenceIds: string[]
  override?: Record<string, string>
  edited?: boolean
  decision?: DecisionMessage
}
export interface SessionStage { kind: 'stage'; ref: string; act: CastAct; who: string }
export interface Session {
  id: string
  name: string
  updated: string
  items: (SessionLine | SessionStage)[]
  /** Guests on stage when the session began. */
  lineup: string[]
}

const KEY = 'director-sessions-v1'
const AUTOSAVE_KEY = 'director-session-autosave'
const MAX = 30

function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true } catch { return false }
}

export function sessionFrom(state: DirectorState, name: string, id = `s${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`): Session {
  const items = state.timeline.flatMap((item): Session['items'] => {
    if (item.type === 'stage') return [{ kind: 'stage', ref: item.id, act: item.act, who: item.who }]
    if (item.type !== 'line' || !item.seen) return []
    let decision: DecisionMessage | undefined
    if (item.decision) { decision = { ...item.decision }; delete decision.detail }
    return [{
      kind: 'line', ref: item.id, origin: item.origin, speaker: item.speaker, text: item.text, replyTo: item.replyTo, evidenceIds: item.evidenceIds,
      ...(item.topic ? { topic: item.topic } : {}), ...(item.override ? { override: item.override } : {}), ...(item.edited ? { edited: true } : {}),
      ...(decision ? { decision } : {}),
    }]
  })
  return { id, name, updated: new Date().toISOString(), items, lineup: state.lineup0 ?? [] }
}

/** The thread a saved session shows: fresh ids (the phone never heard them), every line already performed. */
export function threadFrom(session: Session, counter: number): { timeline: TimelineItem[]; counter: number } {
  const ids = new Map(session.items.map((item) => [item.ref, createMessageId(item.kind === 'line' ? 'h' : 's')]))
  const at = Date.now()
  const timeline = session.items.map((item): LineItem | StageItem => {
    const id = ids.get(item.ref)!
    if (item.kind === 'stage') return { type: 'stage', key: `stage:${id}`, no: ++counter, id, act: item.act, who: item.who, at, phase: 'done', times: {} }
    return {
      type: 'line', key: `line:${id}`, no: ++counter, id, origin: item.origin, speaker: item.speaker, text: item.text,
      replyTo: item.replyTo.map((ref) => ids.get(ref)).filter((ref): ref is string => !!ref), evidenceIds: item.evidenceIds,
      ...(item.topic ? { topic: item.topic } : {}), ...(item.override ? { override: item.override } : {}), ...(item.edited ? { edited: true } : {}),
      ...(item.decision ? { decision: { ...item.decision, lineId: id } } : {}), at, phase: 'done', seen: true, times: {},
    }
  })
  return { timeline, counter }
}

export function listSessions(): Session[] { return read<Session[]>(KEY, []) }

export function saveSession(session: Session) {
  const list = listSessions().filter((item) => item.id !== session.id)
  list.unshift(session)
  return write(KEY, list.slice(0, MAX))
}

export function deleteSession(id: string) { write(KEY, listSessions().filter((item) => item.id !== id)) }

export function autosave(session: Session) { write(AUTOSAVE_KEY, session) }
export function lastAutosave(): Session | null {
  const session = read<Session | null>(AUTOSAVE_KEY, null)
  return session && Array.isArray(session.items) && session.items.length ? session : null
}

/** A session file exported from this console; throws when the file is not one. */
export function parseSessionFile(text: string): Session {
  const value = JSON.parse(text) as Partial<Session>
  if (!value || typeof value.name !== 'string' || !Array.isArray(value.items)) throw new Error('这不是导演台导出的会话文件')
  const items = value.items.filter((item) => item && (item.kind === 'line' ? typeof item.text === 'string' && typeof item.speaker === 'string' : item.kind === 'stage' && typeof item.act === 'string'))
  return { id: `s${Date.now()}`, name: value.name, updated: new Date().toISOString(), items, lineup: Array.isArray(value.lineup) ? value.lineup.filter((id) => typeof id === 'string') : [] }
}
