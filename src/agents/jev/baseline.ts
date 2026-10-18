import { ACTS, DELIVERIES, EXPRESSIONS, GESTURES, REACTIONS, STANCES } from '../catalog/performance.ts'
import type { CastMember } from '../catalog/personas.ts'
import { INTENSITY_LEVELS, SPEAKER_QUESTIONS, mentions } from './lineDecision.ts'
import type { ChoiceAnswer, JevAnswers, JevQuestions, JevResponse, Quote, ScoreAnswer } from './types.ts'

// Port of agent-studio/server/jev.py baseline: transparent keyword rules, NOT Jev. Used only
// when Jev has no key or fails, so the stage stays demonstrable; its answers say so by model.

export const BASELINE_MODEL = 'baseline-keywords'

// Python's \d also matches full-width digits (８５); \p{Nd} is the same set in JS.
export const KEYWORDS = {
  price: /人均|块|元|¥|百|千|便宜|套餐|划算|实惠|\p{Nd}/gu,
  angry: /你不懂|凭什么|胡说|闭嘴|气死|太吵|什么鬼|艺术|！！|!{2,}/gu,
  mock: /哈|笑|喊妈妈|晕|肿|泡面|公仔面|饿|还在|切开|吵/gu,
  question: /？|\?|吗|呢|咩|點|点解|仲点/gu,
  concede: /算了|好吧|抢先|认输|祝|恭喜|服了|Bon appétit|行吧|啧/gu,
  nervous: /那、那|其、其|只要|其实|不过|周末|呃|嗯/gu,
  romance: /浪漫|约会|烛光|红酒|拍拖|情侣|露台/gu,
  pitch: /来|正宗|新鲜|保证|巴适|好吃|招牌|最|包你|欢迎|嚟/gu,
  greet: /你好|晚上好|bonjour|Bonjour|欢迎/gu,
}

type Scores<K extends string = string> = Record<K, number> // key order matters: ties go to the first

function hits(text: string) {
  const entries = Object.entries(KEYWORDS).map(([k, re]) => [k, text.match(re)?.length ?? 0] as const)
  return Object.fromEntries(entries) as Record<keyof typeof KEYWORDS, number>
}

function zeros<K extends string>(ids: readonly K[]): Scores<K> {
  return Object.fromEntries(ids.map((id) => [id, 0])) as Scores<K>
}

// Persona defaults come from generated contracts: an id outside the catalog is skipped
// instead of poisoning the softmax (the Python would raise).
function bump(scores: Scores, id: string, delta: number) {
  if (id in scores) scores[id] = (scores[id] ?? 0) + delta
}

// Python's round(x, digits): toFixed rounds the exact binary value but sends exact halves up;
// Python sends them to even (0.03125 → 0.0312). Values here are never negative.
function pyRound(x: number, digits: number) {
  const scaled = x * 10 ** digits
  if (scaled % 1 === 0.5) return (Math.floor(scaled) + (Math.floor(scaled) % 2)) / 10 ** digits
  return Number(x.toFixed(digits))
}

function roundAll(p: Scores, digits: number) {
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, pyRound(v, digits)]))
}

function softmax(scores: Scores, temp = 1): Scores {
  const m = Math.max(...Object.values(scores))
  const ex = Object.entries(scores).map(([k, v]) => [k, Math.exp((v - m) / temp)] as const)
  const s = ex.reduce((sum, [, v]) => sum + v, 0)
  return Object.fromEntries(ex.map(([k, v]) => [k, v / s]))
}

// The first key with the highest probability, as Python's max(p, key=p.get).
function argmax(p: Scores) {
  let best = ''
  let top = -Infinity
  for (const [k, v] of Object.entries(p)) if (v > top) [best, top] = [k, v]
  return best
}

function choice(scores: Scores): ChoiceAnswer {
  const p = softmax(scores)
  const best = argmax(p)
  const n = Object.keys(p).length
  const conf = n > 1 ? Math.max(0, Math.min(1, (n * (p[best] ?? 0) - 1) / (n - 1))) : 1
  return { type: 'choice', choice: best, probabilities: roundAll(p, 4), confidence: pyRound(conf, 3) }
}

function score(levels: readonly string[], weights: number[]): ScoreAnswer {
  const p = softmax(Object.fromEntries(weights.map((w, i) => [String(i), w])))
  const sc = Object.entries(p).reduce((sum, [k, v]) => sum + Number(k) * v, 0)
  const peak = Number(argmax(p))
  const spread = Object.entries(p).reduce((sum, [k, v]) => sum + v * Math.abs(Number(k) - peak), 0)
  const n = levels.length
  const even = levels.reduce((sum, _, i) => sum + Math.abs(i - (n - 1) / 2), 0) / n
  return {
    type: 'score', score: pyRound(sc, 3), legend: Object.fromEntries(levels.map((l, i) => [String(i), l])),
    probabilities: roundAll(p, 4), confidence: pyRound(Math.max(0, 1 - spread / even), 3),
  }
}

// Same arguments as the Python: `quotes` already filtered (non-empty, at most 6) and
// `listeners` the ids buildLineState returned.
export function baseline(
  cast: readonly CastMember[], speaker: string, text: string, quotes: readonly Quote[], questions: JevQuestions, listeners: readonly string[],
): JevResponse & { model: string } {
  const memberOf = (id: string) => {
    const found = cast.find((c) => c.id === id)
    if (!found) throw new Error(`未知的说话人：${id}`)
    return found
  }
  const sp = memberOf(speaker)
  const h = hits(text)
  const quoted = quotes.length > 0
  const Q = quoted ? 1 : 0
  const qwho = new Set(quotes.map((q) => q.who))
  const excl = text.split('！').length - 1 + text.split('!').length - 1
  // The film's owners keep their signature bonuses (rong's star eyes, pierre's kiss and bow).
  // Generated owners carry other ids, so they never get them; "not pierre" does apply to them.
  const rong = speaker === 'rong' ? 1 : 0
  const pierre = speaker === 'pierre' ? 1 : 0
  const d = sp.defaults

  const base = zeros(EXPRESSIONS.map((e) => e.id))
  bump(base, d.expr, 1.2)
  base.pitch += 1.4 * h.price + 0.8 * h.pitch
  base.angry += 2.2 * h.angry + (quoted && excl >= 2 ? 0.8 : 0)
  base.sly += 1.2 * h.mock * (quoted ? 1.5 : 0.6) + 0.6 * h.question * Q
  base.laugh += 1.0 * h.mock
  base.pout += 2.0 * h.concede
  base.nervous += 1.8 * h.nervous
  base.proud += 1.4 * h.romance
  base.star += 1.0 * h.romance * rong
  base.listen += 0.3
  const expr = choice(base)
  const punch = { ...base, same: 1.0 }
  punch.wink += 0.9 * h.pitch + 0.6 * h.price
  punch.laugh += 0.8 * h.mock
  punch.kiss += 1.4 * h.romance * pierre

  const ges = zeros(GESTURES.map((g) => g.id))
  bump(ges, d.gesture, 1.2)
  ges.hip_point += 1.6 * h.angry + 0.8 * Q * h.question
  ges.point += 0.9 * h.mock * Q
  ges.wag += 0.8 * h.mock * Q
  ges.thumb += 0.9 * h.price + 0.5 * h.pitch
  ges.present += 0.8 * h.romance + 0.4 * h.pitch
  ges.wave += 0.9 * h.greet
  ges.handsUp += 1.6 * h.nervous
  ges.shrug += 0.7 * h.concede
  ges.bow += 0.8 * h.concede * pierre
  ges.hip += 0.9 * h.concede * (1 - pierre)

  const acts = zeros(ACTS.map((a) => a.id))
  acts.none += 0.8
  bump(acts, d.act, 0.6)
  acts.stepIn += 0.7 * h.pitch
  acts.shake += 1.6 * h.angry
  acts.bounce += 0.8 * h.mock
  acts.lean += 0.7 * Q * h.mock
  acts.shiver += 1.4 * h.nervous
  acts.bow += 0.9 * h.concede * pierre
  acts.puff += 0.5 * h.price

  const gaze = { quoted: quoted ? 1.6 : 0.0, other: 0.2, audience: 0.4 + 0.6 * h.pitch + 0.6 * h.price }
  const inten = [1.0, 1.0 + 0.2 * h.pitch, 0.6 + 0.6 * excl + 0.5 * h.question, 0.4 * excl + 1.4 * h.angry]

  const deliv = zeros(DELIVERIES.map((x) => x.id))
  deliv.neutral += 1.0
  deliv.excited += 0.7 * h.pitch + 0.5 * h.price + 0.4 * excl
  deliv.angry += 1.6 * h.angry
  deliv.mocking += 1.0 * h.mock * Q
  deliv.flustered += 1.5 * h.nervous
  deliv.sad += 1.4 * h.concede

  const stance = zeros(STANCES.map((s) => s.id))
  stance.pitch += 1.0 + (quoted ? 0 : 1.5) + 0.4 * h.price
  stance.rebut += Q * (1.0 + 0.8 * h.question + 0.8 * h.angry)
  stance.mock += Q * (0.6 + 1.0 * h.mock)
  stance.defend += 1.4 * h.nervous + 0.6 * h.angry * Q
  stance.concede += 1.6 * h.concede
  stance.agree += 0.2

  const bub = { normal: 1.2, shout: 1.8 * h.angry + 0.4 * Math.max(0, excl - 1), shaky: 1.8 * h.nervous }
  const levels = questions.intensity?.type === 'score' ? questions.intensity.criteria : INTENSITY_LEVELS
  const ans: JevAnswers = {
    speaker_expr: expr, speaker_punch: choice(punch), speaker_gesture: choice(ges), speaker_act: choice(acts),
    speaker_gaze: choice(gaze), delivery: choice(deliv), stance: choice(stance), bubble: choice(bub),
    intensity: score(levels, inten),
  }
  for (const k of SPEAKER_QUESTIONS) if (!(k in questions)) delete ans[k]

  const user = sp.kind === 'user'
  for (const w of listeners) {
    const c = memberOf(w)
    const isQ = qwho.has(w)
    const r = zeros(REACTIONS)
    bump(r, c.defaults.reaction, 0.8)
    r.listen += 0.6
    if (user) {
      const named = mentions(c).some((k) => text.includes(k))
      const asked = isQ || named ? 1 : 0
      r.star += 0.9 * asked + 0.5 * h.question
      r.think += 0.6 * h.question
      r.sweat += 0.8 * asked * h.price
      r.pout += 0.7 * h.concede
    } else if (isQ) {
      r.shock += 0.8 + 0.6 * h.mock
      r.angry += 0.4 * h.mock + 0.4 * h.question
      r.sweat += 0.6 * h.question + 0.5 * h.price
      r.eyeroll += 0.2
    } else {
      r.laugh += 0.7 * h.mock * Q
      r.smug += 0.6 * Q
      r.eyeroll += 0.5 * h.pitch
      r.think += 0.6 * h.romance
    }
    ans[`listener_${w}`] = choice(r)
  }
  return { model: BASELINE_MODEL, answers: ans, usage: null }
}
