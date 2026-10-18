<template>
  <div v-if="run" class="genpanel" :class="{ out: fading }" aria-live="polite">
    <div class="gp-h">
      <span class="gp-logo"><img v-if="run.logo" :src="run.logo" alt="logo" /><template v-else>{{ initial }}</template></span>
      <span class="gp-t"><b>{{ run.shop.name }}</b><small>{{ sub }}</small></span>
      <span class="sp"></span>
      <span class="mono dim">{{ seconds }}s</span>
      <button v-if="run.finished || run.error" class="iconbtn sm" title="关闭" @click="dismissGeneration()"><Icon name="close" /></button>
    </div>
    <div v-for="(step, index) in STEPS" :key="step" class="gp-row" :class="run.steps[step].status">
      <span class="gp-dot"><Icon v-if="run.steps[step].status === 'done'" name="check" /><em v-else>{{ index + 1 }}</em></span>
      <b>{{ STEP_ZH[step] }}</b>
      <span v-if="run.steps[step].decision" class="src" :class="run.steps[step].decision!.source" :title="run.steps[step].decision!.note || run.steps[step].decision!.why || ''">{{ SOURCE[run.steps[step].decision!.source] }} {{ ((run.steps[step].ms ?? 0) / 1000).toFixed(1) }}s</span>
      <span v-else-if="run.steps[step].status === 'run'" class="typing"><i></i><i></i><i></i></span>
      <span v-else></span>
      <span class="gp-v"><span v-if="step === 'look' && lookTheme" class="swatch" :style="{ background: lookTheme }"></span>{{ summary(step) }}</span>
    </div>
    <div v-if="faces" class="gp-faces">
      <Face v-for="item in EXPRESSIONS" :key="item.id" :figure="faces" :expr="item.id" :size="24" :title="item.zh" />
      <small>{{ EXPRESSIONS.length }} 表情 · {{ POSES.length }} 姿势 · {{ ACTS.length - 1 }} 动作 · {{ VISEMES.length }} 口型 · {{ EFFECTS.length }} 特效</small>
    </div>
    <div v-if="run.error" class="gp-err">生成失败：{{ run.error }}</div>
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ACTS, EXPRESSIONS, GESTURES } from '@/agents/catalog/performance'
import type { GenerationStep } from '@/agents/generation/types'
import type { Figure, KitLook } from '@/agents/rig'
import { mascot } from '@/agents/rig/mascots.js'
import { BODIES, HAIRS, HATS, OUTFITS } from '@/agents/rig/rigkit.js'
import { EFFECTS, POSES, VISEMES } from '../assets/vocabulary.ts'
import { dismissGeneration, generation } from '../core/generation.ts'
import { AGE_ZH, STEP_ZH } from '../core/labels.ts'
import Face from '../ui/Face.vue'
import Icon from '../ui/Icon.vue'

// A shop becoming an agent, step by step: where each choice came from (Jev, the brand, or the keyword
// rules), how long it took and what it decided; then the new face in every expression.
const STEPS: GenerationStep[] = ['look', 'accent', 'assets']
const SOURCE: Record<string, string> = { jev: 'Jev', brand: '品牌', rules: '规则' }
const PARTS = Object.fromEntries([...HAIRS.female, ...HAIRS.male, ...OUTFITS, ...HATS].map(([id, zh]) => [id, zh.split(' + ')[0]!]))
const ACCESSORIES: Record<string, string> = { glasses: '眼镜', mustache: '小胡子', earrings: '耳环' }
const zhOf = (list: readonly { id: string; zh: string }[], id: unknown) => list.find((item) => item.id === id)?.zh ?? String(id ?? '')

const run = computed(() => generation.run)
const initial = computed(() => Array.from(run.value?.shop.name || '?')[0])
const look = computed(() => run.value?.steps.look.data?.rig as KitLook | undefined)
const lookTheme = computed(() => look.value?.theme)
const faces = computed<Figure | null>(() => (look.value && run.value?.steps.assets.status === 'done' ? { kind: 'kit', look: { ...look.value, logo: run.value.logo } } : null))
const sub = computed(() => {
  const value = run.value
  if (!value) return ''
  if (value.error) return '没有生成出来'
  if (value.agent) return `${value.agent.name} 已收进资产库`
  return value.brand ? `品牌形象 · ${value.brand.mascot}` : '生成 agent'
})

function summary(step: GenerationStep) {
  const state = run.value?.steps[step]
  if (!state?.data) return ''
  const data = state.data
  if (step === 'look') {
    const rig = data.rig as KitLook
    const brand = mascot(rig.body)
    if (brand) return `品牌形象 · ${brand.zh.split(' · ')[0]} · 不套用人形模板`
    const accessories = (rig.accessories ?? []).map((id) => ACCESSORIES[id]).filter(Boolean).join('、')
    return [BODIES.find((body) => body.id === rig.body)?.zh, AGE_ZH[rig.age ?? ''], PARTS[rig.hair ?? ''], PARTS[rig.outfit ?? ''], rig.hat && rig.hat !== 'none' ? PARTS[rig.hat] : '', accessories].filter(Boolean).join(' · ')
  }
  if (step === 'accent') {
    const p = state.decision?.answers.accent?.probabilities?.[String(data.language)]
    return `${data.zh}${p != null ? ` · ${Math.round(p * 100)}%` : ''}`
  }
  const defaults = data.defaults as Record<string, string>
  return `${zhOf(EXPRESSIONS, defaults.expr)} · ${zhOf(GESTURES, defaults.gesture)} · ${zhOf(ACTS, defaults.act)} · 能量 ${data.energy}`
}

const clock = ref(performance.now())
let ticker: ReturnType<typeof setInterval> | undefined
const seconds = computed(() => {
  const value = run.value
  if (!value) return '0.0'
  return (((value.finished ?? clock.value) - value.started) / 1000).toFixed(1)
})
// Fades out eight seconds after it finished, as in agent-studio.
const fading = ref(false)
let fadeTimer: ReturnType<typeof setTimeout> | undefined
watch(() => [run.value, run.value?.finished, run.value?.error] as const, ([value, finished, error]) => {
  clearInterval(ticker)
  clearTimeout(fadeTimer)
  fading.value = false
  if (!value) return
  if (!finished && !error) ticker = setInterval(() => { clock.value = performance.now() }, 100)
  if (finished) fadeTimer = setTimeout(() => { fading.value = true; fadeTimer = setTimeout(dismissGeneration, 900) }, 8000)
}, { immediate: true })
onBeforeUnmount(() => { clearInterval(ticker); clearTimeout(fadeTimer) })
</script>
