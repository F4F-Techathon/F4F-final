<template>
  <div class="profile">
    <div>
      <Stagelet :figure="character.figure!" :seq="seq" :active="active" />
      <div v-if="agent.logo" class="logo-strip"><img :src="agent.logo" alt="logo" /><span>{{ agent.brand ? '店铺 logo' : '胸牌 logo' }}</span><i :style="{ background: agent.rig.theme }"></i></div>
    </div>
    <div class="facts">
      <div class="fact"><small>店铺</small><div>{{ [agent.restaurant, agent.plate].filter(Boolean).join(' · ') }}</div></div>
      <div v-if="agent.brand" class="fact"><small>品牌形象</small><div>{{ agent.brand.name }} · {{ agent.brand.mascot }}：用品牌自己的形象，不套用人形模板</div></div>
      <div class="fact"><small>来源</small><div>{{ SOURCE_ZH[agent.source] }} · {{ created }}</div></div>
      <div class="fact"><small>人设</small><div>{{ agent.persona }}</div></div>
      <div class="fact"><small>造型</small><div>{{ agent.look }}</div></div>
      <div class="fact"><small>招牌</small><div>{{ agent.signature }}</div></div>
      <div class="fact"><small>口音</small><div>{{ language ? `${language.zh} · ${language.region}` : agent.language }}</div></div>
      <div class="fact"><small>声音</small><div>{{ voice }}</div></div>
      <div class="fact"><small>默认表演</small><div>{{ defaults }}</div></div>
      <div class="fact wide"><small>开场白</small><div>{{ agent.greeting }}</div></div>
      <div v-if="shopText" class="fact wide"><small>店铺原文</small><div>{{ shopText }}</div></div>
      <div class="fact-actions">
        <span v-if="state" class="dim" style="align-self: center">{{ state }}</span>
        <button class="btn sm ghost" type="button" @click="exportJSON(character)"><Icon name="download" />导出 JSON</button>
        <button v-if="character.kind === 'agent' && state !== '在台上'" class="btn sm primary" type="button" @click="invite(character)"><Icon name="enter" />请上台</button>
        <button v-if="agent.source === 'created'" class="btn sm ghost danger" type="button" @click="deleteAgent(character)"><Icon name="trash" />删除 agent</button>
      </div>
    </div>
  </div>
  <section class="lib-sec">
    <h2>生成决策<small>每一步一次 Jev 请求，状态里带着前几步的结果；品牌店的形象和口音由品牌决定</small></h2>
    <div class="dec-grid">
      <div v-for="step in steps" :key="step.id" class="dec-card">
        <div class="dc-h"><b>{{ STEP_ZH[step.id] ?? step.id }}</b><span class="srcbadge" :class="step.badge[0]">{{ step.badge[1] }}</span><span class="dim mono">{{ step.meta }}</span></div>
        <div v-if="step.note" class="note">{{ step.note }}</div>
        <div v-if="step.why" class="note">{{ step.why }}</div>
        <div v-for="row in step.rows" :key="row.key" class="dc-q">
          <span class="lab" :title="row.key">{{ row.key }}</span>
          <span class="val"><span v-for="(part, index) in row.parts" :key="index" :class="{ alt: index > 0 }">{{ part }}</span></span>
        </div>
      </div>
      <div v-if="!steps.length" class="empty-card">没有生成决策记录</div>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { ACTS, EXPRESSIONS, GESTURES } from '@/agents/catalog/performance'
import { LANGUAGES } from '@/agents/generation/languages'
import { HAIRS, HATS, OUTFITS } from '@/agents/rig/rigkit.js'
import { useDirector } from '../core/director.ts'
import { SOURCE_ZH, STEP_ZH, TIMBRE_ZH } from '../core/labels.ts'
import type { Character } from '../core/registry.ts'
import { deleteAgent, invite } from '../live/actions.ts'
import Icon from '../ui/Icon.vue'
import { exportJSON } from './catalog.ts'
import Stagelet from './Stagelet.vue'

// A generated agent: its rig, the shop it came from, and every decision behind it (agent-studio's dossier).
const props = defineProps<{ character: Character; active: boolean }>()
const director = useDirector()
const agent = computed(() => props.character.agent!)
const seq = computed((): [string, string][] => [[agent.value.defaults.expr || 'pitch', 'thumbR'], ['listen', 'rest'], [agent.value.punch || 'laugh', 'present'], [agent.value.defaults.reaction || 'smug', 'hip'], ['idle', 'rest']])
const language = computed(() => LANGUAGES.find((item) => item.id === agent.value.language))
const created = computed(() => {
  const time = new Date(agent.value.created)
  return Number.isNaN(time.getTime()) ? agent.value.created : time.toLocaleString('zh-CN', { hour12: false })
})
const voice = computed(() => {
  const studio = agent.value.studio
  if (studio?.voice) return `${studio.voiceDesc ?? ''} · 音色模板 ${TIMBRE_ZH[studio.voice.timbre] ?? studio.voice.timbre} · 语速 ${studio.voice.speed}×（agent-studio 的设定；语音暂未接入）`
  return '暂未接入：声音这一步留给之后的流式语音'
})
const zhOf = (list: readonly { id: string; zh: string }[], id: string) => list.find((item) => item.id === id)?.zh ?? id
const defaults = computed(() => {
  const d = agent.value.defaults
  return `${zhOf(EXPRESSIONS, d.expr)} · ${zhOf(GESTURES, d.gesture)} · ${zhOf(ACTS, d.act)} · 旁听 ${zhOf(EXPRESSIONS, d.reaction)} · 笑点 ${zhOf(EXPRESSIONS, agent.value.punch)}${agent.value.energy != null ? ` · 能量 ${agent.value.energy}` : ''}`
})
const shopText = computed(() => Object.entries(agent.value.shop ?? {}).filter(([key, value]) => value !== '' && value != null && key !== 'colors' && key !== 'logo').map(([key, value]) => `${key}: ${value}`).join('\n'))
const state = computed(() => {
  const entry = director.cast.value.find((item) => item.id === props.character.id)
  return !entry ? '' : entry.onStage === false ? '候场' : '在台上'
})

// Answer ids in Chinese where the library knows them: hair, outfit, hat, the performance catalog, accents.
const NAMES: Record<string, string> = Object.fromEntries([
  ...[...HAIRS.female, ...HAIRS.male, ...OUTFITS, ...HATS].map(([id, zh]) => [id, zh.split(' + ')[0]!.split('：')[0]!]),
  ...EXPRESSIONS.map((item) => [item.id, item.zh]), ...GESTURES.map((item) => [item.id, item.zh]), ...ACTS.map((item) => [item.id, item.zh]),
  ...LANGUAGES.map((item) => [item.id, item.zh]), ...Object.entries(TIMBRE_ZH),
])
type Answer = { type?: string; noul?: number; score?: number | null; probabilities?: Record<string, number>; choice?: string }
type Decision = { source?: string; ms?: number; model?: string; note?: string | null; why?: string; answers?: Record<string, Answer> }
const steps = computed(() => Object.entries(agent.value.decisions as Record<string, Decision>).map(([id, decision]) => ({
  id,
  badge: ({ jev: ['jev', 'Jev'], brand: ['brand', '品牌'] } as Record<string, [string, string]>)[decision.source ?? ''] ?? ['baseline', '规则'],
  meta: [decision.ms != null ? `${decision.ms} ms` : '', decision.model ?? ''].filter(Boolean).join(' · '),
  note: decision.note ?? '', why: decision.why ?? '',
  rows: Object.entries(decision.answers ?? {}).map(([key, answer]) => {
    if (answer.type === 'noul') return { key, parts: [`${(answer.noul ?? 0) >= 0.5 ? '是' : '否'} · ${Math.round((answer.noul ?? 0) * 100)}%`] }
    if (answer.type === 'score') return { key, parts: [answer.score != null ? answer.score.toFixed(2) : '—'] }
    const top = Object.entries(answer.probabilities ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3)
    return { key, parts: top.length ? top.map(([option, p]) => `${NAMES[option] ?? option} ${Math.round(p * 100)}%`) : [NAMES[answer.choice ?? ''] ?? answer.choice ?? '—'] }
  }),
})))
</script>
