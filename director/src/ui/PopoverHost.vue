<template>
  <div v-if="popover.open" ref="menu" class="menu pop" :class="popover.className" :style="position" role="menu" @pointerdown.stop>
    <component :is="popover.component" v-if="popover.component" v-bind="popover.props" />
    <template v-for="(item, index) in popover.items" v-else :key="index">
      <div v-if="'sep' in item" class="pop-sep"></div>
      <div v-else-if="'head' in item" class="pop-h" :style="item.c ? { '--c': item.c } : undefined">{{ item.head }}</div>
      <button v-else type="button" role="menuitem" :class="{ on: item.on, danger: item.danger }" :disabled="item.disabled" :title="item.title" @click="choose(item)">
        <Face v-if="item.face" :who="item.face.who" :expr="item.face.expr" :size="22" />
        <Icon v-else-if="item.icon" :name="item.icon as IconName" />
        <span class="pl"><b>{{ item.label }}</b><small v-if="item.sub">{{ item.sub }}</small></span>
        <span v-if="item.kbd" class="kbd">{{ item.kbd }}</span>
      </button>
    </template>
  </div>
</template>
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Face from './Face.vue'
import Icon from './Icon.vue'
import type { IconName } from './icons.ts'
import { closePopover, popover, type PopItem } from './popover.ts'

// The one popover: below its anchor, left-aligned; right-aligned when it would run off the window,
// above when there is no room below. Outside clicks, Esc, resizing and scrolling elsewhere close it.
const menu = ref<HTMLElement>()
const position = ref<Record<string, string>>({ left: '0px', top: '0px', visibility: 'hidden' })
let observer: ResizeObserver | undefined

function place() {
  const anchor = popover.anchor?.getBoundingClientRect(), box = menu.value?.getBoundingClientRect()
  if (!anchor || !box) return
  const margin = 8, gap = 6
  let left = anchor.left
  if (left + box.width > innerWidth - margin) left = Math.max(margin, anchor.right - box.width)
  let top = anchor.bottom + gap
  if (top + box.height > innerHeight - margin && anchor.top - gap - box.height >= margin) top = anchor.top - gap - box.height
  position.value = { left: `${left}px`, top: `${Math.max(margin, Math.min(top, innerHeight - margin - box.height))}px`, visibility: 'visible' }
}

watch(() => [popover.open, popover.anchor, popover.items, popover.component, popover.props], async () => {
  observer?.disconnect()
  if (!popover.open) return
  position.value = { ...position.value, visibility: 'hidden' }
  await nextTick()
  place()
  if (menu.value) { observer = new ResizeObserver(place); observer.observe(menu.value) }
})

function choose(item: Extract<PopItem, { label: string }>) {
  if (item.disabled) return
  if (!item.keep) closePopover()
  item.onClick?.()
}

function outside(event: Event) {
  if (!popover.open) return
  const target = event.target as Node | null
  if (target && (menu.value?.contains(target) || popover.anchor?.contains(target))) return
  closePopover()
}
function key(event: KeyboardEvent) { if (event.key === 'Escape' && popover.open) closePopover() }
function scrolled(event: Event) { if (popover.open && !menu.value?.contains(event.target as Node)) closePopover() }
function resized() { if (popover.open) closePopover() }
onMounted(() => {
  document.addEventListener('pointerdown', outside, true)
  document.addEventListener('keydown', key)
  document.addEventListener('scroll', scrolled, true)
  window.addEventListener('resize', resized)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside, true)
  document.removeEventListener('keydown', key)
  document.removeEventListener('scroll', scrolled, true)
  window.removeEventListener('resize', resized)
  observer?.disconnect()
})
</script>
