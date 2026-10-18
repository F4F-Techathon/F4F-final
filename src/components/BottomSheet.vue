<template>
  <Teleport to="body"><Transition name="sheet"><div v-if="open" class="sheet-layer" @keydown="handleKey"><button class="scrim" tabindex="-1" aria-label="关闭弹窗" @click="$emit('close')"></button><section ref="panel" class="panel" :class="size" role="dialog" aria-modal="true" :aria-labelledby="titleId"><div class="drag-area" @touchstart.passive="startY = $event.touches[0]?.clientY || 0" @touchend="endDrag"><i></i></div><header><h2 :id="titleId">{{ title }}</h2><button ref="closeButton" class="icon-btn" aria-label="关闭" @click="$emit('close')"><AppIcon name="close" /></button></header><div class="sheet-content"><slot /></div><footer v-if="$slots.footer"><slot name="footer" /></footer></section></div></Transition></Teleport>
</template>
<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import AppIcon from './AppIcon.vue'
const props = withDefaults(defineProps<{ open: boolean; title: string; size?: 'small' | 'medium' | 'large' }>(), { size: 'medium' })
const emit = defineEmits<{ close: [] }>()
const panel = ref<HTMLElement>(), closeButton = ref<HTMLButtonElement>()
const titleId = useId()
let startY = 0
let previousFocus: HTMLElement | null = null
let oldOverflow = ''
watch(() => props.open, async (open) => {
  if (open) { previousFocus = document.activeElement as HTMLElement; oldOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; await nextTick(); closeButton.value?.focus() }
  else { document.body.style.overflow = oldOverflow; previousFocus?.focus() }
})
// Keeps keyboard navigation inside the modal and restores focus when it closes.
function handleKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
  if (e.key !== 'Tab') return
  const items = [...(panel.value?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, textarea, select, [tabindex="0"]') || [])]
  const first = items[0], last = items.at(-1)
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
}
function endDrag(e: TouchEvent) { if ((e.changedTouches[0]?.clientY || 0) - startY > 70) emit('close') }
onBeforeUnmount(() => { if (props.open) document.body.style.overflow = oldOverflow })
</script>
<style lang="less" scoped>
.sheet-layer { position: fixed; inset: 0; z-index: 100; display: flex; align-items: flex-end; justify-content: center; .scrim { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #170d1c9c; backdrop-filter: blur(4px); } .panel { position: relative; width: min(100%, var(--content-width)); max-height: min(90dvh, calc(100dvh - env(safe-area-inset-top) - 12px)); min-width: 0; display: flex; flex-direction: column; border-radius: 28px 28px 0 0; background: var(--paper); color: var(--ink); box-shadow: 0 -16px 70px #120a1730; padding-bottom: env(safe-area-inset-bottom); &.small { max-height: 42dvh; } &.large { height: 85dvh; } .drag-area { height: 22px; display: grid; place-items: center; flex: none; touch-action: none; i { width: 36px; height: 4px; border-radius: 4px; background: #d7cdbf; } } header { flex-shrink: 0; gap: 16px; padding: 0 var(--inset-right) 12px var(--inset-left); display: flex; justify-content: space-between; align-items: center; h2 { font-size: var(--section-size); margin: 0; overflow-wrap: anywhere; } .icon-btn { background: var(--cream); flex-shrink: 0; width: 44px; height: 44px; } } .sheet-content { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 4px var(--inset-right) 28px var(--inset-left); } footer { flex-shrink: 0; border-top: 1px solid var(--line); padding: 14px var(--inset-right) 14px var(--inset-left); } } }
</style>
