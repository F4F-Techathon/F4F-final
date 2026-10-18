<template>
  <section class="monitor" aria-label="舞台监视">
    <div class="over">
      <span class="glass livetag" :class="{ on: onAir }"><i></i>{{ onAir ? 'LIVE' : '待机' }}</span>
      <span class="glass" :class="{ warn: phones !== 1 }" :title="phones > 1 ? '每台打开的手机都会上演同一句台词' : ''">{{ phoneText }}</span>
      <span class="sp"></span>
      <span v-if="pipe" class="glass pipe" title="最近一句：Jev 决策耗时 · 从发出到开口 · 演了多久">
        <template v-for="(part, index) in pipe" :key="part[0]"><span v-if="index" class="sep">·</span>{{ part[0] }} <b>{{ part[1] }}</b></template>
      </span>
    </div>
    <div class="now" aria-live="polite">
      <div v-if="current" class="bubble" :class="[bubbleKind, { shout: current.decision?.speaker.bubble?.id === 'shout' }]" :style="{ '--c': colorOf(current.speaker) }">
        <div class="bn"><i></i>{{ character(current.speaker).name }}<small>{{ role }}</small><span class="sp"></span><span v-if="current.topic" class="tag">{{ current.topic }}</span><span v-if="current.replaying" class="tag">重播</span></div>
        <div v-if="quote" class="bq" :style="{ '--q': colorOf(quote.speaker) }">↩ {{ character(quote.speaker).name }}：{{ quote.text }}</div>
        <div v-if="current.phase === 'speaking'" class="bt"><span>{{ current.text.slice(0, typed) }}</span><span class="rest">{{ current.text.slice(typed) }}</span></div>
        <div v-else class="bt"><span class="typing"><i></i><i></i><i></i></span> <span class="rest">Jev 正在决定怎么演</span></div>
        <div class="bprog"><i :style="{ transform: `scaleX(${progress})` }"></i></div>
      </div>
      <div v-else class="idle"><b>{{ idle[0] }}</b>{{ idle[1] }}</div>
    </div>
    <div class="seats" aria-label="台上">
      <span class="seat host" :class="{ speaking: current?.speaker === 'host' && current.phase === 'speaking' }" title="主持人"><span class="orbface"></span>Orb<small>主持</small></span>
      <span v-for="entry in director.onStage.value" :key="entry.id" class="seat" :class="seatClass(entry.id)" :style="{ '--c': colorOf(entry.id) }">
        <i></i>{{ entry.name }}<small v-if="entry.kind === 'guest'">嘉宾</small><small v-else-if="entry.status !== 'ready'">化妆中</small>
      </span>
      <span v-if="!director.onStage.value.length" class="empty-seats">台上还没有人</span>
    </div>
    <GenPanel />
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { typingDuration } from '@/agents/performance/timing'
import { useDirector } from '../core/director.ts'
import { PHASE_LABELS } from '../core/labels.ts'
import { isLine } from '../core/timeline.ts'
import { PHONE_PAGE } from '../core/where.ts'
import GenPanel from './GenPanel.vue'
import { useLive } from './state.ts'

// Where agent-studio's stage was: what the phone is doing, the line on stage typed out at the phone's own
// pace (an estimate; the phone types 65 ms a character), and who stands on the floor. No figures here.
const director = useDirector()
const { character, colorOf, nowOf } = useLive()
const phones = computed(() => director.peers.value?.app ?? 0)
const phase = computed(() => director.state.snapshot?.phase)
const onAir = computed(() => phones.value > 0 && phase.value === 'debate')
const phoneText = computed(() => {
  if (!phones.value) return director.status.value === 'open' ? '手机未连接' : '中继未连接'
  return `${phones.value > 1 ? `${phones.value} 台手机` : '手机'} · ${phase.value ? PHASE_LABELS[phase.value] : '—'}`
})
const current = computed(() => director.playing.value)
const role = computed(() => {
  const id = current.value?.speaker
  if (id === 'host') return '主持'
  if (id === 'user') return '台下顾客'
  const entry = director.cast.value.find((item) => item.id === id)
  return entry?.kind === 'guest' ? `嘉宾 · ${entry.restaurant}` : entry?.restaurant ?? ''
})
const bubbleKind = computed(() => (current.value?.speaker === 'user' ? 'me' : current.value?.speaker === 'host' ? 'orb' : ''))
const quote = computed(() => {
  const id = current.value?.replyTo[0]
  return id ? director.state.timeline.find((item) => isLine(item) && item.id === id) as { speaker: string; text: string } | undefined : undefined
})

// The phone types a line out at 65 ms a character; the monitor follows on the relay's clock.
const clock = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined
watch(() => current.value?.phase, (value) => {
  clearInterval(ticker)
  if (value === 'speaking') ticker = setInterval(() => { clock.value = Date.now() }, 80)
}, { immediate: true })
onBeforeUnmount(() => clearInterval(ticker))
const elapsed = computed(() => (current.value?.times.speaking ? Math.max(0, clock.value - current.value.times.speaking) : 0))
const typed = computed(() => Math.min(current.value?.text.length ?? 0, Math.floor(elapsed.value / 65)))
const progress = computed(() => {
  if (!current.value || current.value.phase !== 'speaking') return 0
  return Math.min(1, elapsed.value / 1000 / typingDuration(current.value.text)).toFixed(3)
})

const pipe = computed(() => {
  const line = [...director.lines.value].reverse().find((item) => item.decision || item.times.speaking)
  if (!line) return null
  const parts: [string, string][] = []
  if (line.decision?.latencyMs != null) parts.push(['决策', `${line.decision.latencyMs}ms`])
  if (line.times.speaking && line.times.sent) parts.push(['开口', `${((line.times.speaking - line.times.sent) / 1000).toFixed(2)}s`])
  if (line.times.done && line.times.speaking) parts.push(['时长', `${((line.times.done - line.times.speaking) / 1000).toFixed(2)}s`])
  return parts.length ? parts : null
})

const idle = computed((): [string, string] => {
  if (!phones.value) return ['手机还没打开', `在手机上打开 ${PHONE_PAGE}，台词和走台会排队等它`]
  if (phase.value && phase.value !== 'debate') return ['舞台空闲', `手机在「${PHASE_LABELS[phase.value]}」，进入辩论后按顺序开演`]
  return ['舞台空闲', '选角色、写台词，回车即演']
})

function seatClass(id: string) {
  const state = nowOf(id).state
  return { speaking: state === 'speaking' || state === 'preparing', reacting: state === 'reacting', making: state === 'making' }
}
</script>
