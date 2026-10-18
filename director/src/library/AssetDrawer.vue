<template>
  <aside class="drawer assets" :class="{ open: !!item }" aria-label="资产详情">
    <div class="drawer-h">
      <h2>{{ item?.zh }}</h2>
      <span class="sp"></span>
      <button class="iconbtn sm" type="button" title="关闭" @click="emit('close')"><Icon name="close" /></button>
    </div>
    <div v-if="item && figure" class="drawer-b adetail">
      <div class="player"><div ref="box" class="rbox"></div></div>
      <div class="ctl">
        <button class="iconbtn sm" type="button" :title="paused ? '播放' : '暂停'" @click="paused = !paused"><Icon :name="paused ? 'play' : 'pause'" /></button>
        <div class="seg"><button v-for="value in [0.5, 1]" :key="value" type="button" :class="{ on: speed === value }" @click="speed = value">{{ value }}×</button></div>
        <span class="sp"></span>
        <span class="dim mono">{{ item.id }}</span>
      </div>
      <div class="prog"><i :style="{ transform: `scaleX(${progress})` }"></i></div>
      <div v-if="item.src.desc" class="isec"><h4>设计</h4><div>{{ item.src.desc }}</div><div v-if="item.src.use" class="muted" style="margin-top: 4px">适用：{{ item.src.use }}</div></div>
      <div v-if="item.src.sound" class="isec"><h4>发音</h4><div>{{ item.src.sound }}</div></div>
      <div v-if="params" class="isec"><h4>参数</h4><div class="params"><span v-for="[key, value] in params" :key="key"><i>{{ key }}</i>{{ value }}</span></div></div>
      <div v-if="gesture" class="isec"><h4>手势语义</h4><div>{{ gesture.zh }} · {{ gesture.desc }}</div><div v-if="gesture.use" class="muted" style="margin-top: 4px">适用：{{ gesture.use }}</div></div>
      <div v-if="item.src.expr?.length" class="isec"><h4>用于表情</h4><div class="params"><span v-for="name in item.src.expr" :key="name">{{ name }}</span></div></div>
      <div v-if="film.length" class="isec"><h4>片中</h4><ul class="film"><li v-for="note in film" :key="note">{{ note }}</li></ul></div>
      <button class="btn sm ghost" type="button" style="align-self: flex-start" @click="sheet"><Icon name="download" />导出帧序列</button>
    </div>
  </aside>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { GESTURES } from '@/agents/catalog/performance'
import { createFigureRig, type Figure } from '@/agents/rig'
import { RIG, type Actor, type Rig, type VisualState } from '@/lib/characterRig'
import { frameSheet } from '../assets/export.ts'
import { viewBox } from '../assets/faces.ts'
import { FILM_NOTES } from '../assets/vocabulary.ts'
import Icon from '../ui/Icon.vue'
import type { AssetItem } from './catalog.ts'

// One asset large and live: the character's rig cropped to the asset, playing it in a loop (agent-studio's detail drawer).
const props = defineProps<{ item: AssetItem | null; figure: Figure | null; name: string; film?: boolean; active: boolean }>()
const emit = defineEmits<{ close: [] }>()
const box = ref<HTMLElement>()
const paused = ref(false), speed = ref(1), progress = ref(0)
let frame = 0, serial = 0

const params = computed(() => {
  const source = props.item?.type === 'expr' ? RIG.EXPR[props.item.id] : props.item?.type === 'pose' ? RIG.POSES[props.item.id] : null
  return source ? Object.entries(source).map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : String(value)]) : null
})
const gesture = computed(() => (props.item?.type === 'pose' && props.item.src.gesture ? GESTURES.find((item) => item.id === props.item!.src.gesture) : undefined))
const film = computed(() => {
  if (!props.film || !props.item) return []
  return props.item.src.film ?? (props.item.type === 'expr' ? FILM_NOTES.expr[props.item.id] : props.item.type === 'act' ? FILM_NOTES.act[props.item.id] : undefined) ?? []
})

// What plays, and for how long one cycle lasts.
function schedule(item: AssetItem, actor: Actor): { period: number; mutate?: (st: VisualState, t: number) => void } {
  switch (item.type) {
    case 'expr': actor.e(0.4, item.id).e(2.3, 'idle'); return { period: 3.2 }
    case 'pose':
      if (item.id === 'run') actor.run(0, 999, 3.2)
      else actor.p(0.4, item.id, 0.3).p(2.4, 'rest', 0.3)
      return { period: 3.2 }
    case 'act': actor.act(0.5, item.id, item.src.dur ?? 0.6, 1); return { period: (item.src.dur ?? 0.6) + 1.6 }
    case 'viseme': return { period: 3.2, mutate: (st, t) => { st.mouth = item.id; st.open = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.4) } }
    case 'mouth': return { period: 3.2, mutate: (st) => { st.mouth = item.id } }
    case 'eye':
      if (item.id === 'blink') { actor.blinkAt = RIG.Actor.prototype.blinkAt; return { period: 4 } }
      return { period: 3.2, mutate: (st) => { st.eye = [item.id, item.id] } }
    case 'hand': actor.p(0, 'present', 0.01); return { period: 3.2, mutate: (st) => { st.arms = [(st.arms as unknown[])[0], [50, 30, item.id, 0]] } }
    case 'fx':
      actor.fx(0, item.id, 9999)
      if (item.id === 'excl') { actor.e(0.3, 'idle'); return { period: 1.6 } }
      return { period: 3.2 }
  }
}

function stop() { cancelAnimationFrame(frame); frame = 0 }

async function start() {
  stop()
  await nextTick()
  if (!props.item || !props.figure || !box.value || !props.active) return
  box.value.innerHTML = ''
  const rig: Rig = createFigureRig(box.value, props.figure, `det${Date.now().toString(36)}${++serial}`)
  rig.svg.setAttribute('viewBox', viewBox(props.figure, props.item.crop))
  const actor = new RIG.Actor(rig, { seed: 1, expr: 'idle' })
  actor.blinkAt = () => 0
  const { period, mutate } = schedule(props.item, actor)
  let t = 0, last = performance.now()
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    if (!paused.value) t = (t + dt * speed.value) % period
    const st = actor.state(t)
    mutate?.(st, t)
    rig.render(st)
    progress.value = t / period
    frame = requestAnimationFrame(loop)
  }
  frame = requestAnimationFrame(loop)
}

// The loop stops whenever the drawer closes or the page is hidden (agent-studio kept it running).
watch(() => [props.item, props.figure, props.active], () => { paused.value = false; void start() })
onBeforeUnmount(stop)

async function sheet() {
  if (props.item && props.figure) await frameSheet(props.figure, props.item.recipe(), `${props.name.replace(/[:/\\]/g, '-')}_${props.item.type}-${props.item.id}`)
}
</script>
