<template>
  <div class="agent" :class="{ sel: selectable && speaker === who, wing, pending: now.state === 'making' }" :style="{ '--c': c.color }" :data-state="now.state"
    role="button" :tabindex="selectable ? 0 : -1" :title="tooltip" @click="pick" @keydown.enter.self="pick">
    <span class="av">
      <Face :who="who" :expr="now.expr" :size="42" />
      <span class="ring"></span>
      <img v-if="c.agent?.logo" class="badge-logo" :src="c.agent.logo" alt="" />
    </span>
    <span class="meta">
      <span class="nm">
        <b>{{ c.name }}</b>
        <span v-if="guest" class="tag">嘉宾</span>
        <span class="sp"></span>
        <button v-if="owner" ref="moreBtn" class="iconbtn sm more" type="button" title="更多" @click.stop="menu"><Icon name="more" /></button>
      </span>
      <span class="rs">{{ plate }}</span>
      <span class="now">
        <span class="state">{{ now.label }}</span>
        <template v-if="now.state === 'making'"><span class="steps"><i v-for="(step, index) in STEPS" :key="step" :class="stepClass(index)"></i></span></template>
        <span v-else class="ex">{{ now.ex }}</span>
        <button v-if="wing" class="go" type="button" :disabled="now.label === '排队登场'" @click.stop="stageAct('enter', who)"><Icon name="enter" />登场</button>
        <span v-else-if="now.state !== 'making'" class="meter" aria-hidden="true"><i v-for="n in 5" :key="n"></i></span>
      </span>
    </span>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDirector } from '../core/director.ts'
import { isStage } from '../core/timeline.ts'
import Face from '../ui/Face.vue'
import Icon from '../ui/Icon.vue'
import { openPopover, type PopItem } from '../ui/popover.ts'
import { deleteAgent, removeGuest, stageAct } from './actions.ts'
import { useLive } from './state.ts'

// One character in the dock: face (its expression right now), state, what it is showing, and its menu.
const props = withDefaults(defineProps<{ who: string; wing?: boolean; index?: number }>(), { wing: false, index: 0 })
const director = useDirector()
const { character, nowOf, setSpeaker, speaker } = useLive()
const STEPS = ['形象', '口音', '组件']
const moreBtn = ref<HTMLElement>()
const c = computed(() => character(props.who))
const now = computed(() => nowOf(props.who))
const entry = computed(() => director.cast.value.find((item) => item.id === props.who))
const guest = computed(() => entry.value?.kind === 'guest')
const owner = computed(() => !!entry.value)
const selectable = computed(() => !props.wing && now.value.state !== 'making')
const plate = computed(() => {
  if (props.who === 'user') return '台下顾客 · 不配音'
  if (props.who === 'host') return '主持 · 需求收集 · 洞察 · 预订'
  return guest.value ? `${c.value.restaurant} · ${c.value.plate}` : c.value.agent?.plate || entry.value?.restaurant || c.value.plate
})
const tooltip = computed(() => {
  const persona = c.value.agent?.persona ?? ''
  return selectable.value ? `${persona ? persona + '\n' : ''}点一下${props.index ? `或 Alt+${props.index}` : ''}：由${c.value.name}说下一句` : persona
})

function pick() { if (selectable.value) setSpeaker(props.who) }
function stepClass(index: number) {
  const step = STEPS.indexOf(entry.value?.step ?? '')
  return index < step ? 'done' : index === step ? 'run' : ''
}

function menu() {
  if (!moreBtn.value) return
  const onStage = entry.value?.onStage !== false
  const queued = director.state.timeline.some((item) => isStage(item) && item.who === props.who && (item.phase === 'queued' || (!item.phase && !!item.times.sent)))
  const items: PopItem[] = [
    { head: c.value.name, c: c.value.color },
    onStage
      ? { label: '下场', sub: queued ? '已在排队' : '记进会话 · 跑下台，去候场', icon: 'exit', disabled: queued, onClick: () => void stageAct('exit', props.who) }
      : { label: '登场', sub: queued ? '已在排队' : '记进会话 · 从侧台跑回原位', icon: 'enter', disabled: queued, onClick: () => void stageAct('enter', props.who) },
  ]
  if (guest.value) items.push({ label: '撤下嘉宾', sub: '离开舞台，也不留在候场', icon: 'close', onClick: () => void removeGuest(props.who) })
  items.push({ label: '在资产库查看', sub: '形象、表情、生成决策', icon: 'layers', onClick: () => { location.hash = `#library/${encodeURIComponent(props.who)}` } })
  if (c.value.source === 'created') items.push({ sep: true }, { label: '删除 agent', sub: '从资产库删除，并撤下', icon: 'trash', danger: true, onClick: () => void deleteAgent(c.value) })
  openPopover(moreBtn.value, { items })
}
</script>
