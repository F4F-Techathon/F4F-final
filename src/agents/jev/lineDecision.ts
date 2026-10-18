import { ACTS, DELIVERIES, EXPRESSIONS, GESTURES, REACTION_CRITERIA, REACTIONS, STANCES, type CatalogEntry } from '../catalog/performance.ts'
import type { CastMember } from '../catalog/personas.ts'
import type { ChoiceQuestion, JevQuestions, LineInput, LineState } from './types.ts'

// Port of agent-studio/server/jev.py build_state / build_questions. Every string here is Jev
// prompt text: keep it word for word with the Python (scripts/jev.test.mjs checks it).

export const DEFAULT_HOST_NAME = '小选'
export const DEFAULT_LANGUAGE = '普通话'
// The customer is never on the floor, so these are not asked when the customer speaks.
export const SPEAKER_QUESTIONS = ['speaker_expr', 'speaker_punch', 'speaker_gesture', 'speaker_act', 'speaker_gaze'] as const
export const INTENSITY_LEVELS = ['平静：语气平淡，几乎没有情绪起伏', '温和：有一点情绪，轻松自然', '鲜明：情绪明显，带感叹或反问', '爆发：非常激动，大喊、炸毛或狂喜']

const ref = (path: string) => `\`${path}\`` // a reference into the state, as the questions write it
const WHO = ref('speaker.name')
const LINE = ref('line.text')

function crit(item: CatalogEntry) {
  return `${item.zh}：${item.desc}${item.use ? ` 适用：${item.use}` : ''}`
}

function member(cast: readonly CastMember[], id: string) {
  const found = cast.find((c) => c.id === id)
  if (!found) throw new Error(`未知的说话人：${id}`)
  return found
}

// The restaurant owners on stage, in stage order (not the host, not the customer).
function performers(cast: readonly CastMember[], stage: readonly string[] | undefined) {
  const ids = stage?.length ? stage : cast.filter((c) => c.kind === 'owner').map((c) => c.id)
  return ids.flatMap((id) => {
    const c = cast.find((x) => x.id === id)
    return c?.kind === 'owner' ? [c] : []
  })
}

// Words that show a line is about this owner: keywords, name, restaurant and each cuisine.
export function mentions(c: CastMember): string[] {
  const cuisines = (c.cuisine ?? '').replaceAll('/', '、').split('、').map((x) => x.trim())
  return [...(c.keywords ?? []), c.name, c.restaurant, ...cuisines].filter((k) => k && k !== '—')
}

// The state for one line. `listeners` are the owners who hear it, in stage order; they match
// the state's `listeners[i]` and the `listener_<id>` questions one to one.
export function buildLineState(input: LineInput, { hostName = DEFAULT_HOST_NAME }: { hostName?: string } = {}) {
  const { cast, speaker, text, quotes = [], history = [] } = input
  const sp = member(cast, speaker)
  const user = sp.kind === 'user'
  const owners = performers(cast, input.stage)
  const hearing = owners.filter((c) => c.id !== speaker)
  const quotedIds = new Set(quotes.flatMap((q) => (q.who ? [q.who] : [])))
  const listeners = hearing.map((c) => {
    const quoted = quotedIds.has(c.id)
    const named = mentions(c).some((k) => text.includes(k))
    const relation = user
      ? quoted ? '顾客在直接回应他/她' : named ? '顾客点名问到了他/她的店' : '顾客在说话，他/她在旁边听'
      : quoted ? '这句话在回应或针对他/她' : named ? '这句话提到了他/她的店' : '旁观者'
    return { name: c.name, restaurant: `${c.restaurant}（${c.plate}）`, persona: c.persona, is_quoted: quoted, targeted: quoted || named, relation }
  })
  const whoList = owners.map((c) => `${c.name}·${c.cuisine || c.restaurant}`).join('、')
  const nameOf = (id: string) => cast.find((c) => c.id === id)?.name
  const state: LineState = {
    scene: `美食路演直播：${owners.length} 家餐馆的主理人（${whoList}）同台轮流推销、互相拆台；台下的顾客（「我」）边吃瓜边选今晚去哪吃，`
      + `会直接提问、提要求，也会一次回应好几家。主持智能体「${hostName}」负责收集需求和总结。`,
    style: '夸张外放的喜剧表演：每个反应都要一眼可读。被点名、被揭短的人立刻有强烈反应；旁观者看热闹会笑、会幸灾乐祸；听到对手吹牛会翻白眼；'
      + '顾客提问时被问到的店主会两眼放光、抢着表现；平淡的倾听只在这句话和自己无关时使用。',
    speaker: {
      name: user ? `${sp.name}（台下顾客）` : sp.name,
      restaurant: user ? '—' : `${sp.restaurant}（${sp.plate}）`,
      persona: sp.persona,
    },
    line: { text, language: input.language ?? DEFAULT_LANGUAGE },
    quoted: null,
    listeners,
    // the last four lines first, then drop speakers nobody knows (as the Python does)
    recent_turns: history.slice(-4).flatMap((h) => {
      const name = nameOf(h.who)
      return name === undefined ? [] : [{ speaker: name, text: h.text }]
    }),
  }
  const withText = quotes.filter((q) => q.text)
  if (withText.length) state.quoted = withText.map((q) => ({ speaker: (q.who ? nameOf(q.who) : undefined) ?? (q.who || '某人'), text: q.text }))
  return { state, listeners: hearing.map((c) => c.id) }
}

// The questions for one line: the speaker's face, punchline, gesture, act, gaze, intensity,
// delivery, stance and bubble, then one reaction per listener (ids from buildLineState).
export function buildLineQuestions(cast: readonly CastMember[], speaker: string, listeners: readonly string[]): JevQuestions {
  const user = member(cast, speaker).kind === 'user'
  const ex = Object.fromEntries(EXPRESSIONS.map((e) => [e.id, crit(e)]))
  const q: JevQuestions = {}
  if (!user) {
    q.speaker_expr = { type: 'choice', instructions: `按照 ${ref('style')}，${WHO} 开口说 ${LINE} 时，脸上最贴切的表情是哪一个？考虑人设 ${ref('speaker.persona')}、这句话的情绪，以及它是否在回应 ${ref('quoted')}。`, criteria: ex }
    q.speaker_punch = { type: 'choice', instructions: `${WHO} 说到 ${LINE} 的后半句（笑点或重点落下时），表情要切换成哪一个？没有明显转折就选 same。`, criteria: { ...ex, same: '保持开口时的表情，不需要变化。' } }
    q.speaker_gesture = { type: 'choice', instructions: `${WHO} 说 ${LINE} 时最合适的手势是哪一个？`, criteria: Object.fromEntries(GESTURES.map((g) => [g.id, crit(g)])) }
    q.speaker_act = { type: 'choice', instructions: `按照 ${ref('style')}，${WHO} 说 ${LINE} 时配合的身体动作是哪一个？只有平静陈述才选 none。`, criteria: Object.fromEntries(ACTS.map((a) => [a.id, crit(a)])) }
    q.speaker_gaze = { type: 'choice', instructions: `${WHO} 说 ${LINE} 时眼睛看向哪里？`, criteria: {
      quoted: `看向被引用/被回应的人（${ref('quoted')} 里的说话人）。`,
      other: '看向台上另一位没被引用的人。',
      audience: '看向台下观众/镜头，对用户说话。',
    } }
  }
  q.intensity = { type: 'score', instructions: `${WHO} 说 ${LINE} 时的情绪强度有多高？`, criteria: [...INTENSITY_LEVELS] }
  q.delivery = { type: 'choice', instructions: `给 ${WHO} 配音时，${LINE} 用哪种语气说最合适？`, criteria: Object.fromEntries(DELIVERIES.map((d) => [d.id, d.zh])) }
  q.stance = { type: 'choice', instructions: `${LINE} 和被引用的话 ${ref('quoted')}（可能有好几条）是什么关系？没有引用时通常是自我推销。`, criteria: Object.fromEntries(STANCES.map((s) => [s.id, `${s.zh}：${s.desc}`])) }
  q.bubble = { type: 'choice', instructions: '头顶对话气泡用哪种样式最能表现这句话？', criteria: {
    normal: '普通气泡：正常说话、推销、调侃。',
    shout: '大喊气泡：粗边框、微倾斜，用于生气、炸毛、激动反击。',
    shaky: '发抖气泡：气泡抖动，用于慌张、心虚、结巴找补。',
  } }
  const react = Object.fromEntries(REACTIONS.map((r) => [r, `${(ex[r] ?? '').split('：')[0]}：${REACTION_CRITERIA[r]}`]))
  listeners.forEach((w, i) => {
    const listener = ref(`listeners[${i}]`)
    const question: ChoiceQuestion = {
      type: 'choice',
      instructions: {
        listener,
        question: `按照 ${ref('style')}，${WHO} 说出 ${LINE} 时，台上的 ${listener}（${member(cast, w).name}）脸上会立刻露出什么反应？`
          + `先看 ${ref(`listeners[${i}].relation`)} 和 ${ref(`listeners[${i}].targeted`)}：被针对的人会震惊、心虚、生气或嘟嘴；旁观者看热闹会大笑、得意笑或翻白眼。`,
      },
      criteria: react,
    }
    q[`listener_${w}`] = question
  })
  return q
}
