import type { CastMember } from '../catalog/personas.ts'

// TypeSafe Jev (System One) shapes, and the decision this app keeps for one line.

export interface ChoiceQuestion {
  type: 'choice'
  // A plain question, or named parts (each listener question points at its `listeners[i]`).
  instructions: string | Record<string, string>
  criteria: Record<string, string>
}
export interface ScoreQuestion { type: 'score'; instructions: string; criteria: string[] }
export interface NoulQuestion { type: 'noul'; instructions: string }
export type JevQuestion = ChoiceQuestion | ScoreQuestion | NoulQuestion
export type JevQuestions = Record<string, JevQuestion>

export interface ChoiceAnswer { type: 'choice'; choice: string; probabilities?: Record<string, number>; confidence?: number }
export interface ScoreAnswer {
  type: 'score'
  score: number
  legend?: Record<string, string>
  probabilities?: Record<string, number>
  confidence?: number
}
// A yes/no question: `noul` is the probability of yes.
export interface NoulAnswer { type: 'noul'; noul: number }
export type JevAnswer = ChoiceAnswer | ScoreAnswer | NoulAnswer
export type JevAnswers = Record<string, JevAnswer>

export interface JevResponse {
  model?: string
  answers: JevAnswers
  usage?: Record<string, unknown> | null
  latencyMs?: number // the round trip as the browser saw it
}

// /api/jev failures: `no_key` (HTTP 503) is the only one that means Jev is not configured.
export type JevErrorCode = 'no_key' | 'bad_request' | 'busy' | 'timeout' | 'upstream' | 'bad_response' | 'network' | 'http'
export interface JevErrorBody { error: string; code: JevErrorCode }

// A line this one answers; `who` is a cast id (unknown or missing: shown as itself or 某人).
export interface Quote { who?: string | null; text: string }
// An earlier line of the debate.
export interface Turn { who: string; text: string }

export interface LineInput {
  cast: readonly CastMember[] // everyone who may speak or be quoted
  speaker: string
  text: string
  quotes?: readonly Quote[]
  history?: readonly Turn[] // oldest first; the last 4 go to Jev
  stage?: readonly string[] // owners on the floor, left to right (default: every owner in `cast`)
  language?: string // how the line is spoken (default 普通话)
}

export interface ListenerState {
  name: string
  restaurant: string
  persona: string
  is_quoted: boolean
  targeted: boolean
  relation: string
}

// The dialogue state Jev reads. Keys stay snake_case: the questions refer to them by name.
export interface LineState {
  scene: string
  style: string
  speaker: { name: string; restaurant: string; persona: string }
  line: { text: string; language: string }
  quoted: { speaker: string; text: string }[] | null
  listeners: ListenerState[]
  recent_turns: { speaker: string; text: string }[]
}

export type DecisionSource = 'jev' | 'baseline'

// Every actor's choices for one line. `baseline` is the keyword fallback and is never Jev.
export interface LineDecision {
  source: DecisionSource
  note?: string
  request: { state: LineState; questions: JevQuestions }
  answers: JevAnswers
  model?: string
  latencyMs?: number
}
