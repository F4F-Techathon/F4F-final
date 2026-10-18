import {
  ACTS, BUBBLES, DELIVERIES, EXPRESSIONS, GAZES, GESTURES, REACTIONS, STANCES,
  type ActId, type BubbleId, type DeliveryId, type ExpressionId, type GazeId, type GestureId, type PoseId, type ReactionId, type StanceId,
} from '../catalog/performance.ts'
import type { CastMember } from '../catalog/personas.ts'
import type { JevAnswers, Quote } from '../jev/types.ts'

// Port of agent-studio/web/js/plan.js makePlan / pick / resolvePose: a line's Jev answers
// (or none) → one performance plan. The cast and the floor come from the caller.

export const GATE = 0.12 // below this Choice confidence the persona default wins

export interface StageLayout {
  order: readonly string[] // owners on the floor, left to right
  x(id: string): number | undefined // an owner's horizontal position; undefined for anyone off the floor
  center?: number // the middle of the floor (default: the mean of the owners' x)
}

// Where someone looks: CAM is the audience, HOST up to the host, anything else an owner id.
export type LookTarget = string
export const CAM = 'cam'
export const HOST = 'host'

export interface PlanChoice<T extends string> {
  id: T
  conf: number | null // Jev's confidence; null when it gave no usable answer
  gated: boolean // Jev chose `top` below GATE, so the default stands
  p: Record<string, number> | null
  top?: string
  missing?: boolean
  manual?: boolean
}

export interface PerformancePlan {
  expr: PlanChoice<ExpressionId>
  punch: PlanChoice<ExpressionId | 'same'>
  gesture: PlanChoice<GestureId>
  act: PlanChoice<ActId>
  gaze: PlanChoice<GazeId>
  delivery: PlanChoice<DeliveryId>
  stance: PlanChoice<StanceId>
  bubble: PlanChoice<BubbleId>
  intensity: number // 0 calm … 3 explosive
  listeners: Record<string, PlanChoice<ReactionId>>
  target: LookTarget
  target2: LookTarget | null // answering several people: who the speaker turns to mid-line
  provisional?: boolean // started before Jev answered (set by the caller)
}

export interface PlanTurn {
  speaker: string
  quotes?: readonly Quote[]
  answers?: JevAnswers | null
  override?: Readonly<Record<string, string>> // a slot or listener_<id> set by hand
}

const EXPRESSION_IDS = EXPRESSIONS.map((e) => e.id)
const PUNCH_IDS: (ExpressionId | 'same')[] = [...EXPRESSION_IDS, 'same']
const GESTURE_IDS = GESTURES.map((g) => g.id)
const ACT_IDS = ACTS.map((a) => a.id)
const DELIVERY_IDS = DELIVERIES.map((d) => d.id)
const STANCE_IDS = STANCES.map((s) => s.id)

const isOneOf = <T extends string>(allowed: readonly T[], value: unknown): value is T => allowed.includes(value as T)

// Every line this one answers that names who said it.
export function quotesOf(turn: { quotes?: readonly Quote[] }) {
  return (turn.quotes ?? []).filter((q): q is Quote & { who: string } => !!q.who)
}

export function centerOf(layout: StageLayout) {
  if (layout.center != null) return layout.center
  const xs = layout.order.flatMap((id) => layout.x(id) ?? [])
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0
}

// Where `who` turns its eyes to face `target` (the film's hand-set vectors, from positions).
export function lookVec(layout: StageLayout, who: string, target: LookTarget | null | undefined): [number, number] {
  const center = centerOf(layout)
  const from = layout.x(who) ?? center
  if (target === HOST) return [Math.sign(center - from) * 0.6, -1]
  const to = target && target !== CAM ? layout.x(target) : undefined
  if (to == null || target === who) return [0, 0.15]
  return [Math.sign(to - from) || 1, 0.1]
}

// Does `who` open to the right to face `target`? Without one, toward the middle of the floor.
export function dirRight(layout: StageLayout, who: string, target: LookTarget | null | undefined) {
  const to = target && target !== CAM && target !== HOST ? layout.x(target) : undefined
  const from = layout.x(who)
  if (to == null) return (from ?? centerOf(layout)) <= centerOf(layout)
  return from != null && to > from
}

// The rig pose(s) for a gesture: one-sided gestures use the hand on the target's side.
export function resolvePose(layout: StageLayout, gestureId: string, who: string, target: LookTarget | null | undefined): [PoseId] | [PoseId, PoseId] {
  const g = GESTURES.find((x) => x.id === gestureId)
  if (!g) return ['rest']
  if (gestureId === 'kiss') return ['kissR', 'kissOut']
  const poses: readonly PoseId[] = g.poses
  const [first = 'rest', second = first] = poses
  if (poses.length === 1) return [first]
  return [dirRight(layout, who, target) ? first : second]
}

function pick<T extends string>(answers: JevAnswers, key: string, allowed: readonly T[], fallback: T): PlanChoice<T> {
  const a = answers[key]
  const top = a && 'choice' in a ? a.choice : undefined
  if (!a || !isOneOf(allowed, top)) return { id: fallback, conf: null, gated: false, p: null, missing: true }
  const conf = 'confidence' in a && a.confidence != null ? a.confidence : null
  const gated = conf != null && conf < GATE
  return { id: gated ? fallback : top, conf, gated, p: ('probabilities' in a && a.probabilities) || null, top }
}

// The plan for one line from its answers (none yet: every persona default).
export function makePlan(cast: readonly CastMember[], layout: StageLayout, turn: PlanTurn): PerformancePlan {
  const kindOf = (id: string) => cast.find((c) => c.id === id)?.kind
  const sp = cast.find((c) => c.id === turn.speaker)
  if (!sp) throw new Error(`未知的说话人：${turn.speaker}`)
  const answers = turn.answers ?? {}
  const override = turn.override ?? {}
  const take = <T extends string>(slot: string, key: string, allowed: readonly T[], fallback: T): PlanChoice<T> => {
    const chosen = pick(answers, key, allowed, fallback)
    const manual = override[slot]
    return isOneOf(allowed, manual) ? { ...chosen, id: manual, manual: true } : chosen
  }
  const d = sp.defaults
  const qs = quotesOf(turn)
  const gaze = take('gaze', 'speaker_gaze', GAZES, qs.length ? 'quoted' : 'audience')
  const plan: PerformancePlan = {
    expr: take('expr', 'speaker_expr', EXPRESSION_IDS, d.expr),
    punch: take('punch', 'speaker_punch', PUNCH_IDS, 'same'),
    gesture: take('gesture', 'speaker_gesture', GESTURE_IDS, d.gesture),
    act: take('act', 'speaker_act', ACT_IDS, d.act),
    gaze,
    delivery: take('delivery', 'delivery', DELIVERY_IDS, 'neutral'),
    stance: take('stance', 'stance', STANCE_IDS, qs.length ? 'rebut' : 'pitch'),
    bubble: take('bubble', 'bubble', BUBBLES, 'normal'),
    intensity: 1.5,
    listeners: {},
    target: CAM,
    target2: null,
  }
  const intensity = answers.intensity
  if (intensity && 'score' in intensity && intensity.score != null) plan.intensity = intensity.score
  for (const w of layout.order) {
    const c = cast.find((x) => x.id === w)
    if (w !== turn.speaker && c) plan.listeners[w] = take(`listener_${w}`, `listener_${w}`, REACTIONS, c.defaults.reaction)
  }
  // answering several people: face the first, turn to the next mid-line
  const onStage = [...new Set(qs.map((q) => q.who))]
    .filter((w) => w !== turn.speaker && (layout.order.includes(w) || kindOf(w) === 'host'))
    .map((w) => (kindOf(w) === 'host' ? HOST : w))
  const [q, q2] = onStage
  const other = layout.order.find((w) => w !== turn.speaker && !onStage.includes(w))
  plan.target = gaze.id === 'quoted' && q ? q : gaze.id === 'other' && other ? other : q || CAM
  plan.target2 = gaze.id === 'quoted' && q2 ? q2 : null
  if (sp.kind !== 'owner') plan.target = CAM // the host and the customer have no body on the floor
  return plan
}
