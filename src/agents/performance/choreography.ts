import type { ActId, PoseId, ReactionId } from '../catalog/performance.ts'
import type { CastMember } from '../catalog/personas.ts'
import type { Quote } from '../jev/types.ts'
import { CAM, HOST, dirRight, lookVec, quotesOf, resolvePose, type LookTarget, type PerformancePlan, type StageLayout } from './plan.ts'
import { BEATS } from './timing.ts'

// Port of agent-studio/web/js/plan.js prepare → intent → perform (+ reactions, interrupted,
// settle, cancelFuture): timed beats written onto each actor's schedule. Times are seconds on
// the actors' clock (the stage passes performance.now() / 1000). Speech is not scheduled: there
// is no lip-sync track, so each avatar opens its own mouth while its line is typed.

// The part of the rig's Actor (src/lib/characterRig.js) the choreography drives.
export interface ActorLike {
  e(t: number, expression: string): unknown
  p(t: number, pose: string, duration?: number): unknown
  act(t: number, name: string, duration?: number, amplitude?: number): unknown
  look(t: number, x: number, y: number): unknown
}

export interface StageScene {
  layout: StageLayout
  cast: readonly CastMember[]
  actors: Readonly<Record<string, ActorLike | undefined>> // by cast id; owners without one are skipped
}

export interface StageTurn { speaker: string; quotes?: readonly Quote[] }

// A listener's body follows its face (how the film pairs them).
const REACT_BODY: Partial<Record<ReactionId, { act?: [ActId, number]; pose?: PoseId }>> = {
  shock: { act: ['hop', 0.32], pose: 'rest' },
  sweat: { act: ['shiver', 1.2] },
  nervous: { act: ['shiver', 1.0] },
  angry: { act: ['puff', 0.8], pose: 'hip' },
  laugh: { act: ['bounce', 1.2], pose: 'belly' },
  squeal: { act: ['bounce', 1.4], pose: 'belly' },
  smug: { pose: 'hip' },
  star: { act: ['hop', 0.35], pose: 'clasp' },
  pout: { pose: 'hip' },
}
const ACT_DUR: Partial<Record<ActId, number>> = { hop: 0.35, jump: 0.55, shake: 0.5, nod: 0.4, bow: 0.8, puff: 0.6 }

// The host is looked up to, the customer is in the audience; owners are looked at where they stand.
function targetOf(scene: StageScene, id: string): LookTarget {
  const kind = scene.cast.find((c) => c.id === id)?.kind
  return kind === 'host' ? HOST : kind === 'user' ? CAM : id
}

function lookAt(scene: StageScene, a: ActorLike | undefined, who: string, target: LookTarget | null, t: number) {
  if (!a || !scene.layout.order.includes(who)) return
  const [x, y] = lookVec(scene.layout, who, target)
  a.look(t, x, y)
}

// The rig keeps its schedule in these row arrays; actors without them are left alone.
type Row = readonly [number, ...unknown[]]
interface Schedule { expr?: Row[]; pose?: Row[]; looks?: Row[]; acts?: Row[]; fxs?: Row[] }

// Drop every beat an actor has scheduled after t (a new line takes the stage). The first row of
// each track is the actor's base state and always stays.
export function cancelFuture(actor: ActorLike & Schedule, t: number) {
  for (const list of [actor.expr, actor.pose, actor.looks]) {
    if (list) for (let i = list.length - 1; i > 0; i--) if ((list[i]?.[0] ?? 0) > t) list.splice(i, 1)
  }
  if (actor.acts) actor.acts = actor.acts.filter((r) => r[0] <= t)
  if (actor.fxs) actor.fxs = actor.fxs.filter((r) => r[0] <= t)
}

// The instant a line arrives: the speaker turns to whoever it answers and draws breath, the
// other owners turn to the speaker (up to the host, out to the audience for the customer).
export function prepare(scene: StageScene, turn: StageTurn, t: number) {
  const { actors, layout } = scene
  const sp = actors[turn.speaker]
  const q = quotesOf(turn).find((x) => x.who !== turn.speaker)?.who
  if (sp) {
    lookAt(scene, sp, turn.speaker, q ? targetOf(scene, q) : CAM, t)
    sp.act(t, 'stepIn', 0.6, 0.35)
  }
  const facing = targetOf(scene, turn.speaker)
  layout.order.filter((w) => w !== turn.speaker && actors[w]).forEach((w, i) => {
    lookAt(scene, actors[w], w, facing, t + 0.06 * i)
    actors[w]?.e(t + 0.08 * i, 'listen')
  })
}

// Jev answered: the speaker shows the chosen face and gesture before a word is typed.
export function intent(scene: StageScene, turn: StageTurn, plan: PerformancePlan, t: number) {
  const sp = scene.actors[turn.speaker]
  if (!sp) return
  sp.e(t, plan.expr.id)
  sp.p(t, resolvePose(scene.layout, plan.gesture.id, turn.speaker, plan.target)[0], 0.3)
  lookAt(scene, sp, turn.speaker, plan.target, t)
}

// The line starts at T and lasts `est` seconds (typingDuration): the speaker's whole delivery,
// then the listeners' reactions.
export function perform(scene: StageScene, turn: StageTurn, plan: PerformancePlan, T: number, est: number) {
  const who = turn.speaker
  const at = (f: number) => T + f * est
  const amp = 0.65 + 0.22 * (plan.intensity || 0)
  const sp = scene.actors[who]
  if (sp) {
    sp.e(T - 0.05, plan.expr.id)
    const [pose, pose2] = resolvePose(scene.layout, plan.gesture.id, who, plan.target)
    sp.p(T - 0.05, pose, 0.3)
    if (pose2) sp.p(T + 0.45, pose2, 0.3)
    const act = plan.act.id
    if (act !== 'none') {
      let dur = ACT_DUR[act] ?? 0.6
      if (act === 'bounce') dur = Math.min(1.4, est * 0.9)
      if (act === 'shiver' || act === 'stepIn') dur = est
      if (act === 'lean') dur = est * 0.45
      const amplitude = act === 'lean' ? (dirRight(scene.layout, who, plan.target) ? 1 : -1) * 0.6 : amp
      sp.act(T, act, dur, amplitude)
    }
    lookAt(scene, sp, who, plan.target, T)
    if (plan.target2) lookAt(scene, sp, who, plan.target2, at(BEATS.secondTarget))
    const punch = plan.punch.id
    if (punch !== 'same' && punch !== plan.expr.id) {
      sp.e(at(BEATS.punch), punch)
      if (punch === 'wink' || punch === 'star') sp.p(at(BEATS.thumb), resolvePose(scene.layout, 'thumb', who, CAM)[0], 0.3)
      if (punch === 'kiss') {
        sp.p(at(BEATS.kiss), 'kissR', 0.25)
        sp.p(at(BEATS.kissOut), 'kissOut', 0.3)
      }
      if (punch === 'laugh') sp.act(at(BEATS.punch), 'bounce', Math.min(1.2, est * 0.5), 1)
    }
  }
  reactions(scene, turn, plan, T, est, T)
}

// Listeners: the one the line answers reacts early, a bystander a beat later; never before
// `notBefore` (a decision that arrives mid-line lands from now on).
export function reactions(scene: StageScene, turn: StageTurn, plan: PerformancePlan, T: number, est: number, notBefore: number) {
  const quoted = quotesOf(turn).map((x) => x.who)
  for (const [w, r] of Object.entries(plan.listeners)) {
    const a = scene.actors[w]
    if (!a) continue
    const tr = Math.max(notBefore + 0.1, T + (quoted.includes(w) ? BEATS.quoted : BEATS.bystander) * est)
    a.e(tr, r.id)
    const body = REACT_BODY[r.id]
    if (body?.pose) a.p(tr, body.pose, 0.3)
    if (body?.act) a.act(tr, body.act[0], body.act[1], 1)
  }
}

// Someone cut in: the interrupted speaker is startled, then sulks.
export function interrupted(scene: StageScene, who: string, t: number) {
  const a = scene.actors[who]
  if (!a) return
  a.e(t, 'shock')
  a.act(t, 'hop', 0.3, 0.8)
  a.p(t, 'rest', 0.25)
  a.e(t + 0.9, 'pout')
}

// After a line: everyone eases back to attentive idling, left to right.
export function settle(scene: StageScene, t: number) {
  scene.layout.order.forEach((w, i) => {
    const a = scene.actors[w]
    if (!a) return
    a.e(t + i * 0.15, 'idle')
    a.p(t + i * 0.15, 'rest', 0.4)
    lookAt(scene, a, w, CAM, t + i * 0.15)
  })
}
