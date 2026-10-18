<template>
  <div class="stagelet"><div ref="box" class="rbox"></div><span v-if="caption" class="cap">{{ caption }}</span></div>
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createFigureRig, type Figure } from '@/agents/rig'
import { RIG, type Actor } from '@/lib/characterRig'

// A large live rig cycling a few faces and poses (agent-studio's stagelet); it rests while the page is hidden.
const props = withDefaults(defineProps<{ figure: Figure; seq: [string, string][]; active?: boolean; caption?: string }>(), { active: true })
const box = ref<HTMLElement>()
let actor: Actor | undefined, frame = 0, offset = 0, started = 0
const period = () => 0.6 + props.seq.length * 1.7
let serial = 0

function build() {
  if (!box.value) return
  box.value.innerHTML = ''
  const rig = createFigureRig(box.value, props.figure, `stg${Date.now().toString(36)}${++serial}`)
  actor = new RIG.Actor(rig, { seed: 1, expr: 'idle' })
  props.seq.forEach(([expr, pose], index) => actor!.e(0.6 + index * 1.7, expr).p(0.6 + index * 1.7, pose, 0.3))
  offset = 0
}
function loop(now: number) {
  if (!actor) return
  if (!started) started = now
  actor.render(((offset + now - started) / 1000) % period())
  frame = requestAnimationFrame(loop)
}
function play() { cancelAnimationFrame(frame); started = 0; frame = requestAnimationFrame(loop) }
function pause() { cancelAnimationFrame(frame); offset += started ? performance.now() - started : 0; started = 0 }

onMounted(() => { build(); if (props.active) play() })
onBeforeUnmount(() => cancelAnimationFrame(frame))
watch(() => props.active, (active) => (active ? play() : pause()))
watch(() => [props.figure, props.seq], () => { build(); if (props.active) play() })
</script>
