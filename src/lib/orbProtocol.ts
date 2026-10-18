// The host Orb as an agent in the debate (POST /api/orb): the customer's words, who is on stage, who waits in the
// wings and which shops pass the request's hard limits in; Orb's own line, the line-up changes it makes, and whether
// the words also go to the restaurants out. Shared by the page and server/shortlist.ts; no dependencies.
import { parseShortlistRequest, type ShortlistBrief } from './shortlistProtocol.ts'

export interface OrbMember { id: string; host: string }
export interface OrbRequest {
  utterance: string
  brief: ShortlistBrief
  /** Restaurants standing on stage, with their hosts' names. */
  stage: OrbMember[]
  /** Guests on stage (not restaurants); they count toward the stage's places. */
  guests: number
  /** Invited restaurants sent off earlier, who can come back. */
  wings: OrbMember[]
  /** Every other shop within the request's hard limits, which Orb may bring on. */
  candidateIds: string[]
}
export interface OrbAction { act: 'exit' | 'enter'; id: string }
export interface OrbDecision { reply: string; actions: OrbAction[]; forward: boolean; model: string }

export const ORB_STAGE_MAX = 6
export const ORB_MIN_SHOPS = 2
const ID = /^[A-Za-z0-9_-]{1,40}$/

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object')
  return value as Record<string, unknown>
}
function members(value: unknown): OrbMember[] {
  if (!Array.isArray(value) || value.length > 12) throw new Error('Invalid members')
  return value.map((item) => {
    const member = record(item)
    if (typeof member.id !== 'string' || !ID.test(member.id) || typeof member.host !== 'string' || member.host.length > 20) throw new Error('Invalid member')
    return { id: member.id, host: member.host.trim() }
  })
}

export function parseOrbRequest(value: unknown): OrbRequest {
  const r = record(value)
  if (typeof r.utterance !== 'string' || !r.utterance.trim() || r.utterance.length > 600) throw new Error('Invalid utterance')
  const guests = r.guests
  if (typeof guests !== 'number' || !Number.isInteger(guests) || guests < 0 || guests > ORB_STAGE_MAX) throw new Error('Invalid guests')
  const ids = Array.isArray(r.candidateIds) ? r.candidateIds : []
  // The brief and candidates share the shortlist's checks (a request with no candidates is still a valid Orb turn).
  const { brief, candidateIds } = parseShortlistRequest({ brief: r.brief, candidateIds: ids.length ? ids : ['none'] })
  return { utterance: r.utterance.trim(), brief, stage: members(r.stage), guests, wings: members(r.wings), candidateIds: ids.length ? candidateIds : [] }
}

// Only possible changes survive: exits of shops on stage (never below two shops), entries of shops in the wings or
// among the candidates while places are free.
export function parseOrbDecision(value: unknown, request: OrbRequest, model: string): OrbDecision {
  const r = record(value)
  const reply = typeof r.reply === 'string' ? r.reply.trim().slice(0, 80) : ''
  const onStage = new Set(request.stage.map((member) => member.id))
  const enterable = new Set([...request.wings.map((member) => member.id), ...request.candidateIds])
  const actions: OrbAction[] = []
  let shops = onStage.size
  for (const item of Array.isArray(r.actions) ? r.actions : []) {
    const action = record(item)
    const id = typeof action.id === 'string' ? action.id.trim() : ''
    if (actions.some((done) => done.id === id)) continue
    if (action.act === 'exit' && onStage.has(id) && shops > ORB_MIN_SHOPS) { actions.push({ act: 'exit', id }); shops-- }
    else if (action.act === 'enter' && enterable.has(id) && shops + request.guests < ORB_STAGE_MAX) { actions.push({ act: 'enter', id }); shops++ }
  }
  return { reply, actions, forward: r.forward !== false || (!reply && !actions.length), model }
}
