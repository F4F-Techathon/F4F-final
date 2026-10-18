<template>
  <div class="shared-guide-orb" :class="{ visible, suspended }" :style="orbStyle" aria-hidden="true">
    <GuideOrb :listening="arrival.listening && route.path === '/input'" :thinking="arrival.thinking && route.path === '/input'" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePickerArrivalStore } from '@/stores/pickerArrival'
import { orbAnchorFrame, PICKER_ARRIVAL_DURATION, PICKER_DEPART_DURATION } from '@/lib/pickerArrivalMotion'
import type { OrbAnchorBox } from '@/lib/pickerArrivalMotion'
import GuideOrb from './GuideOrb.vue'

defineProps<{ suspended?: boolean }>()
const route = useRoute(), router = useRouter(), arrival = usePickerArrivalStore()
const visible = ref(false)
const box = shallowRef<OrbAnchorBox>({ left: 0, top: 0, size: 150 })
const orbStyle = computed(() => ({ transform: `translate3d(${box.value.left}px, ${box.value.top}px, 0) scale(${box.value.size / 150})` }))
let anchor: HTMLElement | null = null
let source: OrbAnchorBox | undefined
let started = 0, generation = 0, anchorVersion = 0, followUntil = 0
let frame: number | undefined
let departTimer: ReturnType<typeof setTimeout> | undefined
let releaseNavigation: (() => void) | undefined

function findAnchor(path: string) {
  if (path !== '/input' && path !== '/pick') return null
  return document.querySelector<HTMLElement>(`[data-guide-orb-anchor="${path.slice(1)}"]`)
}

function measure(element: HTMLElement): OrbAnchorBox {
  const rect = element.getBoundingClientRect()
  return { left: rect.left, top: rect.top, size: rect.width }
}

function setBox(value: OrbAnchorBox) {
  if (box.value.left !== value.left || box.value.top !== value.top || box.value.size !== value.size) box.value = value
}

// Only transforms change: page layout and the orb's own face animation stay intact.
function tick(now: number) {
  frame = undefined
  if (anchor?.isConnected) {
    const destination = measure(anchor)
    if (arrival.phase === 'arriving' && source) {
      arrival.elapsed = Math.min(PICKER_ARRIVAL_DURATION, now - started)
      setBox(orbAnchorFrame(source, destination, arrival.progress.orb))
      if (arrival.elapsed >= PICKER_ARRIVAL_DURATION) { source = undefined; arrival.finish() }
    } else if (!arrival.active) setBox(destination)
  }
  if (arrival.active || (anchor?.isConnected && now < followUntil)) frame = requestAnimationFrame(tick)
}

function follow() { if (frame === undefined) frame = requestAnimationFrame(tick) }
const observer = new ResizeObserver(follow)
window.addEventListener('resize', follow)
window.addEventListener('scroll', follow, { passive: true })

// Resolve a pending guard on cancellation so browser back and failed navigation cannot leave it waiting.
function cancel() {
  generation++
  clearTimeout(departTimer)
  const release = releaseNavigation
  releaseNavigation = undefined
  release?.()
  source = undefined
  arrival.finish()
}

// The destination is measured after mounting, without guessing positions from a particular screen size.
async function syncAnchor(path: string) {
  const version = ++anchorVersion
  await nextTick()
  if (version !== anchorVersion || route.path !== path) return
  anchor = findAnchor(path)
  observer.disconnect()
  visible.value = !!anchor
  if (!anchor) { cancel(); return }
  if (path === '/pick' && arrival.phase === 'departing' && source) {
    started = performance.now()
    arrival.arrive()
  } else {
    if (arrival.active) cancel()
    setBox(measure(anchor))
  }
  observer.observe(anchor)
  if (anchor.parentElement) observer.observe(anchor.parentElement)
  observer.observe(document.body)
  // Follow the ordinary page transform too; idle positioning then uses resize/scroll events.
  followUntil = performance.now() + 450
  follow()
}

// Fade the old labels before mounting the target, while the shared orb remains visible.
const removeGuard = router.beforeEach(async (to, from) => {
  cancel()
  if (from.path !== '/input' || to.path !== '/pick' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const origin = findAnchor('/input')
  if (!origin) return
  source = measure(origin)
  setBox(source)
  visible.value = true
  arrival.begin()
  const ticket = generation
  await new Promise<void>((resolve) => {
    releaseNavigation = resolve
    departTimer = setTimeout(() => { releaseNavigation = undefined; resolve() }, PICKER_DEPART_DURATION)
  })
  if (generation !== ticket) return false
})

const removeAfter = router.afterEach((_to, _from, failure) => { if (failure) { cancel(); void syncAnchor(route.path) } })
const removeError = router.onError(() => { cancel(); void syncAnchor(route.path) })
watch(() => route.path, (path) => { void syncAnchor(path) }, { immediate: true, flush: 'post' })

onBeforeUnmount(() => {
  anchorVersion++
  cancel()
  if (frame !== undefined) cancelAnimationFrame(frame)
  observer.disconnect()
  window.removeEventListener('resize', follow)
  window.removeEventListener('scroll', follow)
  removeGuard(); removeAfter(); removeError()
})
</script>

<style lang="less" scoped>
.shared-guide-orb {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 40;
  width: 150px;
  height: 150px;
  transform-origin: 0 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity .2s ease;
  will-change: transform;

  &.visible { opacity: 1; }
  &.suspended { opacity: 0; }
  .guide-orb { width: 100%; height: 100%; margin: 0; }
}
</style>
