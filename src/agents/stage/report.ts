// What the test console sees: the decision behind each performance, in Chinese with Jev's detail,
// and each generated host's contract for its asset library.
import { ACTS, DELIVERIES, EXPRESSIONS, GESTURES, STANCES } from '../catalog/performance.ts'
import type { AgentContract } from '../generation/types.ts'
import type { JevAnswer, LineDecision } from '../jev/types.ts'
import type { PerformancePlan, PlanChoice } from '../performance/plan.ts'
import type { AgentMessage, AnswerDetail, ChoiceLabel, DecisionDetail, DecisionMessage, SlotDetail, SpeakerDecision } from '../feed/protocol.ts'

const ZH: Record<string, Record<string, string>> = {
  expr: { ...Object.fromEntries(EXPRESSIONS.map((item) => [item.id, item.zh])), same: '保持不变' },
  gesture: Object.fromEntries(GESTURES.map((item) => [item.id, item.zh])),
  act: Object.fromEntries(ACTS.map((item) => [item.id, item.zh])),
  stance: Object.fromEntries(STANCES.map((item) => [item.id, item.zh])),
  delivery: Object.fromEntries(DELIVERIES.map((item) => [item.id, item.zh])),
  gaze: { quoted: '看向被回应的人', other: '看向另一位', audience: '看向观众' },
  bubble: { normal: '普通气泡', shout: '大喊气泡', shaky: '发抖气泡' },
}
const INTENSITY = ['平静', '温和', '鲜明', '爆发']
// Plan slots and the Jev questions behind them; listener_<id> slots share their question's key.
const SLOT_QUESTIONS = { expr: 'speaker_expr', punch: 'speaker_punch', gesture: 'speaker_gesture', act: 'speaker_act', gaze: 'speaker_gaze', delivery: 'delivery', stance: 'stance', bubble: 'bubble' } as const

function label(kind: keyof typeof ZH, choice: PlanChoice<string>): ChoiceLabel {
  return { id: choice.id, zh: ZH[kind]![choice.id] || choice.id, ...(choice.gated ? { gated: true } : {}) }
}

const round3 = (value: number) => Math.round(value * 1000) / 1000

// Three decimals and nothing under 0.001 keep a line's whole decision within a few kilobytes.
function probabilities(map: Record<string, number> | undefined | null) {
  const kept = Object.entries(map || {}).filter(([, value]) => typeof value === 'number' && value >= .001).map(([key, value]) => [key, round3(value)])
  return kept.length ? Object.fromEntries(kept) as Record<string, number> : undefined
}

function compact(answer: JevAnswer): AnswerDetail {
  const out: AnswerDetail = { type: answer.type }
  if (answer.type === 'choice') out.choice = answer.choice
  if (answer.type === 'score') { out.score = round3(answer.score); if (answer.legend) out.legend = answer.legend }
  if (answer.type === 'noul') out.noul = round3(answer.noul)
  if ('confidence' in answer && typeof answer.confidence === 'number') out.confidence = round3(answer.confidence)
  const p = 'probabilities' in answer ? probabilities(answer.probabilities) : undefined
  if (p) out.probabilities = p
  return out
}

function slot(choice: PlanChoice<string>): SlotDetail {
  return {
    id: choice.id, conf: choice.conf == null ? null : round3(choice.conf), gated: choice.gated,
    ...(choice.top ? { top: choice.top } : {}), ...(choice.manual ? { manual: true } : {}), ...(choice.missing ? { missing: true } : {}),
  }
}

/** Everything the console's inspector shows for one line: the state Jev read, its answers and how the plan used them. */
export function decisionDetail(decision: LineDecision, plan: PerformancePlan): DecisionDetail {
  const asked = Object.keys(decision.request.questions)
  const plans: Record<string, SlotDetail> = {}
  for (const [name, key] of Object.entries(SLOT_QUESTIONS)) if (asked.includes(key)) plans[name] = slot(plan[name as keyof typeof SLOT_QUESTIONS])
  for (const [id, choice] of Object.entries(plan.listeners)) plans[`listener_${id}`] = slot(choice)
  const answers = Object.fromEntries(Object.entries(decision.answers).filter(([key]) => /^[A-Za-z0-9_.:-]{1,80}$/.test(key)).map(([key, answer]) => [key, compact(answer)]))
  return {
    ...(decision.model ? { model: decision.model.slice(0, 80) } : {}),
    state: JSON.parse(JSON.stringify(decision.request.state)) as Record<string, unknown>,
    questions: asked, answers, plan: plans, target: plan.target, target2: plan.target2,
    ...(plan.provisional ? { provisional: true } : {}),
  }
}

// The customer has no figure on stage: only how the line reads (bubble, intensity, stance) is reported.
export function decisionReport(lineId: string, decision: LineDecision, plan: PerformancePlan, speakerIsUser: boolean): DecisionMessage {
  const speaker: SpeakerDecision = {
    bubble: label('bubble', plan.bubble), stance: label('stance', plan.stance),
    intensity: { score: plan.intensity, zh: INTENSITY[Math.max(0, Math.min(3, Math.round(plan.intensity)))]! },
  }
  if (!speakerIsUser) {
    Object.assign(speaker, {
      expr: label('expr', plan.expr), punch: label('expr', plan.punch), gesture: label('gesture', plan.gesture),
      act: label('act', plan.act), gaze: label('gaze', plan.gaze), delivery: label('delivery', plan.delivery),
    })
  }
  const listeners = Object.fromEntries(Object.entries(plan.listeners).map(([id, choice]) => [id, { reaction: label('expr', choice), confidence: choice.conf }]))
  return {
    kind: 'decision', lineId, source: decision.source, speaker, listeners,
    ...(decision.note ? { note: decision.note.slice(0, 300) } : {}),
    ...(decision.latencyMs != null ? { latencyMs: decision.latencyMs } : {}),
    detail: decisionDetail(decision, plan),
  }
}

const BODY_BUDGET = 60 * 1024

// A generated host for the console's asset library: answers trimmed like a line's, text cut to the protocol's
// limits, and the logo left out if it would push the message past the relay's size limit.
export function agentReport(contract: AgentContract): AgentMessage {
  const decisions = Object.fromEntries(Object.entries(contract.decisions).map(([step, decision]) => [step, {
    ...decision, answers: Object.fromEntries(Object.entries(decision.answers).map(([key, answer]) => [key, {
      ...answer, ...(answer.probabilities ? { probabilities: probabilities(answer.probabilities) } : {}),
    }])),
  }]))
  const shop = { ...contract.shop, logo: undefined } // the logo travels once, on the contract itself
  const message: AgentMessage = {
    kind: 'agent', contract: {
      id: contract.id, name: contract.name.slice(0, 40), fullName: contract.fullName.slice(0, 80), restaurant: contract.restaurant.slice(0, 60),
      plate: contract.plate.slice(0, 80), cuisine: contract.cuisine.slice(0, 40), price: contract.price, edge: contract.edge, language: contract.language,
      persona: contract.persona.slice(0, 600), look: contract.look.slice(0, 400), signature: contract.signature.slice(0, 200), palette: contract.palette.slice(0, 8),
      defaults: contract.defaults, punch: contract.punch, personality: contract.personality, energy: Math.max(0, Math.min(3, contract.energy)),
      keywords: [...new Set(contract.keywords.filter((word) => word.trim() && word.length <= 24))].slice(0, 24), logo: contract.logo,
      rig: { ...contract.rig, logo: undefined }, greeting: contract.greeting.slice(0, 600), shop, decisions,
      ...(contract.brand ? { brand: contract.brand } : {}), generator: contract.generator, created: contract.created,
    },
  }
  if (contract.logo && new TextEncoder().encode(JSON.stringify(message)).length > BODY_BUDGET) message.contract.logo = null
  return message
}
