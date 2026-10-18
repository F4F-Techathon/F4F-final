<template>
  <img v-if="url" class="face" :src="url" :width="size" :height="size" :alt="label" :title="title" />
  <span v-else-if="kind === 'orb'" class="orbface" :style="box" :title="title" role="img" :aria-label="label"></span>
  <span v-else :class="kind === 'me' ? 'meface' : 'blankface'" :style="[box, { fontSize: `${Math.round(size * 0.46)}px`, '--c': color }]" :title="title" role="img" :aria-label="label">{{ initial }}</span>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import type { Figure } from '@/agents/rig'
import { faceUrl } from '../assets/faces.ts'
import { useRegistry } from '../core/registry.ts'

// A character's round face showing an expression, drawn from its rig; the host is a glowing orb, the
// customer a monogram, and someone not drawn yet (still being generated) a tinted initial.
const props = withDefaults(defineProps<{ who?: string; figure?: Figure | null; expr?: string; size?: number; title?: string }>(), { expr: 'idle', size: 36 })
const registry = useRegistry()
const character = computed(() => (props.who ? registry.get(props.who) : undefined))
const figure = computed(() => props.figure ?? character.value?.figure ?? null)
const url = computed(() => (figure.value ? faceUrl(figure.value, props.expr) : null))
const kind = computed(() => character.value?.kind ?? (props.who === 'host' ? 'orb' : props.who === 'user' ? 'me' : 'agent'))
const color = computed(() => character.value?.color)
const initial = computed(() => Array.from(character.value?.name ?? props.who ?? '?')[0] ?? '?')
const box = computed(() => ({ width: `${props.size}px`, height: `${props.size}px` }))
const label = computed(() => props.title ?? character.value?.name ?? '')
</script>
