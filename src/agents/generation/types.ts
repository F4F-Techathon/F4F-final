import type { KitLook } from '../rig/types.ts'
import type { ShopInfo } from './shop.ts'
import type { Personality } from './vocabulary.ts'

// The parts of a Jev answer the generator reads: a choice with its probabilities, a score, or a noul.
export interface AnswerLike {
  type?: string
  choice?: string
  probabilities?: Record<string, number>
  confidence?: number
  score?: number | null
  noul?: number
}
export type Answers = Record<string, AnswerLike>

export interface GenerationQuestion {
  type: 'choice' | 'score' | 'noul'
  instructions: string
  criteria?: Record<string, string> | string[]
}
export type GenerationQuestions = Record<string, GenerationQuestion>

// How the generator reaches Jev; the app passes the /api/jev client, tests pass fakes or nothing.
export type JevAsk = (state: object, questions: GenerationQuestions, options?: { signal?: AbortSignal }) =>
  Promise<{ answers: Answers; model?: string; latencyMs?: number }>

// The performance catalog the assets step chooses from (src/agents/catalog in the app).
export interface CatalogItem { id: string; zh: string; desc: string; use?: string }
export interface PerformanceCatalogLike {
  expressions: readonly CatalogItem[]
  gestures: readonly CatalogItem[]
  acts: readonly CatalogItem[]
  reactions: readonly string[]
  reactionCriteria?: Readonly<Record<string, string>>
}

export type GenerationStep = 'look' | 'accent' | 'assets'
export const GENERATION_STEPS: GenerationStep[] = ['look', 'accent', 'assets']

export interface GenerationDecision {
  source: 'jev' | 'rules' | 'brand'
  model?: string
  ms: number
  answers: Answers
  questions: string[]
  note?: string | null
  why?: string
}

export interface BrandRef { id: string; name: string; mascot: string }

// A generated restaurant host, on the same fields as agent-studio's agent contracts.
export interface AgentContract {
  id: string
  kind: 'agent'
  name: string
  fullName: string
  restaurant: string
  plate: string
  cuisine: string
  price: number | null
  edge: string
  language: string
  persona: string
  look: string
  signature: string
  palette: string[]
  defaults: { expr: string; gesture: string; act: string; reaction: string }
  punch: string
  personality: Personality
  energy: number
  keywords: string[]
  logo: string | null
  rig: KitLook
  greeting: string
  shop: ShopInfo
  decisions: Record<GenerationStep, GenerationDecision>
  brand?: BrandRef
  // The voice step waits for the streaming multi-agent system; no timbre is chosen yet.
  voice: null
  generator: number
  created: string
}

export type GenerationEvent =
  | { type: 'start'; id: string; steps: GenerationStep[]; brand?: BrandRef }
  | { type: 'step'; step: GenerationStep; status: 'run' }
  | { type: 'step'; step: GenerationStep; status: 'done'; decision: GenerationDecision; data: Record<string, unknown> }
  | { type: 'done'; agent: AgentContract }
