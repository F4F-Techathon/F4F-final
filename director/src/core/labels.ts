import type { AppPhase, CastAct, CastEntry, LinePhase, SpeakerChoice } from '../../../src/agents/feed/protocol.ts'
import type { FeedStatus } from '../../../src/agents/feed/stageFeed.ts'

export const PHASE_LABELS: Record<AppPhase, string> = { home: '首页', input: '说需求', pick: '滑卡选店', opening: '集合开场', debate: '餐馆辩论', result: '已做决定', detail: '餐厅详情' }
export const FEED_LABELS: Record<FeedStatus, string> = { connecting: '连接中', open: '已连接', retrying: '重连中', closed: '已断开' }
export const LINE_PHASE_LABELS: Record<LinePhase, string> = { queued: '排队中', deciding: 'Jev 决策中', speaking: '发言中', done: '已说完', dropped: '未上演' }
export const CAST_ACT_LABELS: Record<CastAct, string> = { enter: '登场', exit: '下场', remove: '撤下', reset: '阵容复位' }
export const CAST_PHASE_LABELS: Record<CastAct, Partial<Record<LinePhase, string>>> = {
  enter: { queued: '排队中', speaking: '走上台…', done: '已登场', dropped: '没能上台' },
  exit: { queued: '排队中', speaking: '走下台…', done: '已下场', dropped: '没有下场' },
  remove: { queued: '排队中', speaking: '离开舞台…', done: '已撤下', dropped: '没有撤下' },
  reset: { queued: '排队中', speaking: '复位中…', done: '已复位', dropped: '没有复位' },
}
export const SPEAKER_CHOICE_LABELS: Record<SpeakerChoice, string> = { expr: '表情', punch: '笑点', gesture: '手势', act: '动作', gaze: '视线', bubble: '气泡', stance: '立场', delivery: '语气' }
export const STEP_ZH: Record<string, string> = { look: '形象', accent: '口音', assets: '组件', voice: '声音' }
export const AGE_ZH: Record<string, string> = { young: '青年', middle: '中年', old: '老年' }

export function castStatusLabel(entry: CastEntry): string {
  if (entry.status === 'generating') return entry.step ? `化妆中 · ${entry.step}` : '化妆中'
  return { idle: '待生成', ready: '就绪', error: '生成失败' }[entry.status]
}
/** agent-studio's voice templates (server/voices.py); shown for reference, voice is not connected here. */
export const TIMBRE_ZH: Record<string, string> = {
  f_young: '女 · 青年 · 明亮', f_girl: '女 · 少女 · 清甜', f_mid: '女 · 中年 · 爽朗', f_old: '女 · 老年 · 慈和',
  m_young: '男 · 青年 · 清朗', m_mid: '男 · 中年 · 浑厚', m_old: '男 · 老年 · 沙哑', m_fr: '男 · 青年 · 法式',
}
export const SOURCE_ZH: Record<string, string> = { phone: '手机生成', studio: 'agent-studio', created: '导演台新建' }
