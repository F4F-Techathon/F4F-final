<template>
  <div class="msg stage-ev" :class="{ acting: item.phase === 'speaking' }" :style="{ '--c': color }">
    <span class="av"><Face v-if="item.who" :who="item.who" :size="24" /><span v-else class="blankface" style="width: 24px; height: 24px; font-size: 11px">台</span></span>
    <div class="se">
      <Icon :name="item.act === 'enter' ? 'enter' : item.act === 'reset' ? 'replay' : 'exit'" />
      <b v-if="item.who">{{ name }}</b>{{ CAST_ACT_LABELS[item.act] }}
      <span :class="item.phase === 'dropped' ? 'warn' : 'dim'">{{ status }}</span>
      <span class="sp"></span>
      <button class="iconbtn sm" :class="{ armed }" type="button" :title="armed ? '再点一次删除' : '删除'" @click="del"><Icon name="trash" /></button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { CAST_ACT_LABELS, CAST_PHASE_LABELS } from '../core/labels.ts'
import type { StageItem } from '../core/timeline.ts'
import Face from '../ui/Face.vue'
import Icon from '../ui/Icon.vue'
import { removeCard } from './actions.ts'
import { useLive } from './state.ts'

// A stage direction in the thread: who walks on or off and how it went (舞台已满, 本就在台上…).
const props = defineProps<{ item: StageItem }>()
const { character, colorOf } = useLive()
const name = computed(() => character(props.item.who).name)
const color = computed(() => (props.item.who ? colorOf(props.item.who) : 'var(--tx-3)'))
const status = computed(() => {
  const label = props.item.phase ? CAST_PHASE_LABELS[props.item.act][props.item.phase] ?? '' : props.item.times.sent ? '已发出' : ''
  return props.item.phaseNote ? `${label} · ${props.item.phaseNote}` : label
})
// The first click arms the button, a second within 3 s deletes.
const armed = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
function del() {
  if (!armed.value) { armed.value = true; clearTimeout(timer); timer = setTimeout(() => { armed.value = false }, 3000); return }
  clearTimeout(timer)
  void removeCard(props.item)
}
</script>
