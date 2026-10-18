<template>
  <button ref="root" class="spec-card" :class="{ showcase, on, inert }" type="button" :tabindex="inert ? -1 : 0" @click="!inert && emit('open', root!)">
    <div class="vis" :class="crop"><span v-if="badge" class="badge">{{ badge }}</span><img ref="img" :alt="zh" /></div>
    <div class="ft"><b><i v-if="group" class="dot" :style="{ background: GROUP_COLORS[group] ?? '#8A93A6' }"></i>{{ zh }}</b><code>{{ sub }}</code></div>
  </button>
</template>
<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Crop } from '../assets/faces.ts'
import type { SpecimenSpec } from '../assets/specimens.ts'
import { GROUP_COLORS } from '../assets/vocabulary.ts'
import { SPECIMENS } from './engine.ts'

// A card that plays its asset by itself once it comes near the viewport.
const props = withDefaults(defineProps<{ spec: SpecimenSpec; zh: string; sub?: string; group?: string; badge?: string; crop?: Crop; showcase?: boolean; on?: boolean; inert?: boolean }>(), { crop: 'head' })
const emit = defineEmits<{ open: [card: HTMLElement] }>()
const engine = inject(SPECIMENS)!
const root = ref<HTMLElement>(), img = ref<HTMLImageElement>()
let stop: (() => void) | undefined
onMounted(() => { stop = engine().observe(root.value!, img.value!, props.spec) })
onBeforeUnmount(() => stop?.())
</script>
