<template>
  <aside class="drawer inspector" :class="{ open: !!card }" aria-label="检视决策">
    <div class="drawer-h">
      <h2>{{ card ? character(card.speaker).name : '' }}</h2>
      <span class="sp"></span>
      <button v-if="card" class="iconbtn sm" type="button" title="重播（带上手动设定）" @click="replay(card)"><Icon name="replay" /></button>
      <button class="iconbtn sm" type="button" title="关闭" @click="live.inspecting = null"><Icon name="close" /></button>
    </div>
    <div v-if="card" class="drawer-b">
      <div class="ihead">
        <div v-for="quote in quotes" :key="quote.id" class="quote" :style="{ '--q': quote.color }">↩ {{ quote.name }}：{{ quote.text }}</div>
        <div>{{ card.text }}</div>
        <div v-if="decision" class="m">
          <span class="srcbadge" :class="decision.source">{{ decision.source === 'jev' ? 'TypeSafe Jev' : '关键词基线' }}</span>
          <span v-if="detail?.model">{{ detail.model }}</span>
          <span v-if="decision.latencyMs != null">{{ decision.latencyMs }} ms</span>
          <span v-if="detail">{{ detail.questions.length }} 问</span>
        </div>
        <div v-if="pipeline" class="m">{{ pipeline }}</div>
      </div>
      <div v-if="decision?.note" class="note">{{ decision.note }}</div>
      <div v-if="detail?.provisional" class="note">Jev 晚于开演回来：这句先按人设默认开演，回答到了再中途换上表情、补上各人的反应。</div>
      <div v-if="!decision && card.phase === 'queued'" class="note">还没轮到这句：手机开演时才问 Jev。{{ card.phaseNote ? `现在${card.phaseNote}。` : '' }}</div>
      <div v-else-if="!decision && card.phase === 'dropped'" class="note">这句没有上演{{ card.phaseNote ? `：${card.phaseNote}` : '' }}，所以没有 Jev 决策。</div>
      <div v-else-if="!decision && !card.phase" class="note">手机还没回报这句（手机页面没打开，或没连上舞台中继）。</div>
      <div v-else-if="!decision" class="muted"><span class="typing"><i></i><i></i><i></i></span> 等 Jev 的决策回来…</div>
      <template v-else>
        <div v-if="!detail" class="note">这句只保留了决策摘要（较早的台词或载入的会话不带 Jev 的全部细节）。</div>
        <section v-for="group in groups" :key="group.title" class="isec">
          <h4>{{ group.title }}</h4>
          <div v-for="row in group.rows" :key="row.slot" class="q">
            <div class="qh">
              <span class="lab">{{ row.label }}</span>
              <span class="val">
                <Face v-if="row.faceOf && row.id" :who="row.faceOf" :expr="row.id === 'same' ? 'idle' : row.id" :size="22" />
                {{ row.zh }}
              </span>
              <span v-if="row.gated" class="gated" :title="`Jev 选的是「${row.topZh}」，置信度低于 0.12，按人设默认`">门控</span>
              <span v-if="card.override?.[row.slot]" class="manualtag">手动</span>
              <span class="sp"></span>
              <svg v-if="row.conf != null" class="cring" viewBox="0 0 26 26" :aria-label="`置信度 ${Math.round(row.conf * 100)}%`">
                <circle class="bg" cx="13" cy="13" r="10.5" /><circle class="fg" cx="13" cy="13" r="10.5" :stroke-dasharray="`${66 * row.conf} 66`" transform="rotate(-90 13 13)" />
                <text x="13" y="16" text-anchor="middle">{{ Math.round(row.conf * 100) }}</text>
              </svg>
              <select :value="card.override?.[row.slot] ?? ''" :title="`手动指定${row.label}`" @change="override(row.slot, ($event.target as HTMLSelectElement).value)">
                <option value="">自动</option>
                <option v-for="option in row.options" :key="option.id" :value="option.id">{{ option.zh }}</option>
              </select>
            </div>
            <template v-if="row.dist.length">
              <div class="dist"><i v-for="part in row.dist" :key="part.id" :class="{ top: part.id === row.top }" :style="{ width: `${part.p * 100}%` }" :title="`${part.zh} ${pct(part.p)}`"></i></div>
              <div class="distlab"><span v-for="part in row.dist.slice(0, 3)" :key="part.id"><b>{{ part.zh }}</b> {{ pct(part.p) }}</span></div>
            </template>
          </div>
        </section>
        <section v-if="intensity" class="isec">
          <h4>评分</h4>
          <div class="q">
            <div class="qh"><span class="lab">情绪强度</span><span class="val">{{ intensity.score.toFixed(2) }} · {{ intensity.zh }}</span></div>
            <div class="scale4"><i v-for="n in 4" :key="n"><b :style="{ transform: `scaleX(${Math.max(0, Math.min(1, intensity.score - (n - 1) + 0.5))})` }"></b></i></div>
            <div v-if="intensity.legend" class="scalelab"><span>{{ intensity.legend[0] }}</span><span>{{ intensity.legend[1] }}</span></div>
          </div>
        </section>
        <details v-if="detail" class="json"><summary>请求 JSON</summary><pre>{{ requestJson }}</pre></details>
        <details v-if="detail" class="json"><summary>响应 JSON</summary><pre>{{ responseJson }}</pre></details>
      </template>
    </div>
  </aside>
</template>
<script setup lang="ts">
import { computed, watch } from 'vue'
import { ACTS, BUBBLES, DELIVERIES, EXPRESSIONS, GAZES, GESTURES, REACTIONS, STANCES } from '@/agents/catalog/performance'
import { hostMember, userMember, type CastMember, type PersonaDefaults } from '@/agents/catalog/personas'
import { buildLineQuestions } from '@/agents/jev/lineDecision'
import { useDirector } from '../core/director.ts'
import { isLine, type LineItem } from '../core/timeline.ts'
import Face from '../ui/Face.vue'
import Icon from '../ui/Icon.vue'
import { replay, setOverride } from './actions.ts'
import { live, useLive } from './state.ts'

// Everything Jev decided for one line: each choice with its confidence and full distribution, whether the
// gate fell back to the persona default, and a selector to set it by hand (the line is then performed again).
interface Option { id: string; zh: string }
const director = useDirector()
const { character, colorOf, line } = useLive()

const zh = (list: readonly { id: string; zh: string }[]) => list.map((item) => ({ id: item.id, zh: item.zh }))
const EXPR: Option[] = zh(EXPRESSIONS)
const GAZE_ZH: Record<string, string> = { quoted: '看向被回应的人', other: '看向另一位', audience: '看向观众' }
const BUBBLE_ZH: Record<string, string> = { normal: '普通气泡', shout: '大喊气泡', shaky: '发抖气泡' }
const OPTIONS: Record<string, Option[]> = {
  expr: EXPR, punch: [...EXPR, { id: 'same', zh: '保持不变' }], gesture: zh(GESTURES), act: zh(ACTS),
  gaze: GAZES.map((id) => ({ id, zh: GAZE_ZH[id] ?? id })), delivery: zh(DELIVERIES), stance: zh(STANCES),
  bubble: BUBBLES.map((id) => ({ id, zh: BUBBLE_ZH[id] ?? id })),
  reaction: REACTIONS.map((id) => ({ id, zh: EXPRESSIONS.find((item) => item.id === id)?.zh ?? id })),
}
const SPEAKER = [['expr', 'speaker_expr', '表情'], ['punch', 'speaker_punch', '笑点'], ['gesture', 'speaker_gesture', '手势'], ['act', 'speaker_act', '动作'], ['gaze', 'speaker_gaze', '视线']] as const
const TONE = [['delivery', 'delivery', '语气'], ['stance', 'stance', '立场'], ['bubble', 'bubble', '气泡']] as const

const card = computed<LineItem | undefined>(() => (live.inspecting ? line(live.inspecting) : undefined))
watch(card, (value) => { if (live.inspecting && !value) live.inspecting = null })
const decision = computed(() => card.value?.decision)
const detail = computed(() => decision.value?.detail)
const pct = (p: number) => (p < 0.01 ? '<1%' : `${Math.round(p * 100)}%`)

const quotes = computed(() => (card.value?.replyTo ?? []).map((id) => {
  const quoted = director.state.timeline.find((item) => isLine(item) && item.id === id)
  const who = quoted && isLine(quoted) ? quoted.speaker : ''
  return { id, name: who ? character(who).name : '某人', text: quoted && isLine(quoted) ? quoted.text : '', color: who ? colorOf(who) : 'var(--tx-3)' }
}))

const pipeline = computed(() => {
  const times = card.value?.times
  if (!times?.sent) return ''
  const parts = []
  if (times.deciding) parts.push(`排队 ${((times.deciding - times.sent) / 1000).toFixed(2)}s`)
  if (times.speaking) parts.push(`开口 ${((times.speaking - times.sent) / 1000).toFixed(2)}s`)
  if (times.speaking && times.done) parts.push(`时长 ${((times.done - times.speaking) / 1000).toFixed(2)}s`)
  return parts.join(' · ')
})

interface Row { slot: string; label: string; id?: string; zh: string; conf: number | null; gated: boolean; top?: string; topZh: string; options: Option[]; dist: { id: string; zh: string; p: number }[]; faceOf?: string }

function row(slot: string, key: string, label: string, options: Option[], faceOf?: string): Row | null {
  const summary = slot.startsWith('listener_') ? decision.value?.listeners[slot.slice(9)]?.reaction : decision.value?.speaker[slot as keyof NonNullable<typeof decision.value>['speaker']] as { id: string; zh: string; gated?: boolean } | undefined
  const plan = detail.value?.plan[slot]
  if (!summary && !plan) return null
  const id = plan?.id ?? summary?.id
  const nameOf = (value?: string) => options.find((option) => option.id === value)?.zh ?? value ?? ''
  const probabilities = detail.value?.answers[key]?.probabilities ?? {}
  const dist = Object.entries(probabilities).filter(([, p]) => p > 0.004).sort((a, b) => b[1] - a[1]).map(([option, p]) => ({ id: option, zh: nameOf(option), p }))
  return {
    slot, label, id, zh: nameOf(id), conf: plan?.conf ?? (slot.startsWith('listener_') ? decision.value?.listeners[slot.slice(9)]?.confidence ?? null : null),
    gated: plan?.gated ?? !!summary?.gated, top: plan?.top, topZh: nameOf(plan?.top), options, dist, faceOf,
  }
}

const groups = computed(() => {
  if (!decision.value || !card.value) return []
  const speaker = card.value.speaker
  const isUser = speaker === 'user'
  const out = []
  if (!isUser) out.push({ title: '说话人', rows: SPEAKER.map(([slot, key, label]) => row(slot, key, label, OPTIONS[slot]!, slot === 'expr' || slot === 'punch' ? speaker : undefined)).filter((item): item is Row => !!item) })
  out.push({ title: '语气', rows: TONE.map(([slot, key, label]) => row(slot, key, label, OPTIONS[slot]!)).filter((item): item is Row => !!item) })
  const listeners = Object.keys(decision.value.listeners).map((id) => row(`listener_${id}`, `listener_${id}`, character(id).name, OPTIONS.reaction!, id)).filter((item): item is Row => !!item)
  if (listeners.length) out.push({ title: '旁听', rows: listeners })
  return out.filter((group) => group.rows.length)
})

const intensity = computed(() => {
  const summary = decision.value?.speaker.intensity
  const answer = detail.value?.answers.intensity
  if (!summary && answer?.score == null) return null
  const legend = answer?.legend ? [answer.legend['0'] ?? '', answer.legend['3'] ?? answer.legend[String(Object.keys(answer.legend).length - 1)] ?? ''] : null
  return { score: answer?.score ?? summary!.score, zh: summary?.zh ?? '', legend }
})

// The question wording is fixed by the catalog and the cast, so it is rebuilt here with the phone's own builder.
function member(id: string): CastMember {
  if (id === 'host') return hostMember({ name: 'Orb' })
  if (id === 'user') return userMember({ name: '我' })
  const c = character(id)
  return { id, kind: 'owner', name: c.name, restaurant: c.restaurant, plate: c.agent?.plate ?? c.plate, persona: c.agent?.persona ?? '', cuisine: c.agent?.cuisine, keywords: c.agent?.keywords, defaults: c.defaults as PersonaDefaults }
}
const requestJson = computed(() => {
  if (!detail.value || !card.value) return ''
  const listeners = detail.value.questions.filter((key) => key.startsWith('listener_')).map((key) => key.slice(9))
  let questions: unknown = detail.value.questions
  try { questions = buildLineQuestions([member(card.value.speaker), ...listeners.map(member)], card.value.speaker, listeners) } catch { /* keys only */ }
  return JSON.stringify({ state: detail.value.state, model: detail.value.model, questions }, null, 2)
})
const responseJson = computed(() => JSON.stringify({ model: detail.value?.model, answers: detail.value?.answers, plan: detail.value?.plan }, null, 2))

function override(slot: string, value: string) {
  if (card.value) void setOverride(card.value, slot, value || null)
}
</script>
