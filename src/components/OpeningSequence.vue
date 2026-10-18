<template>
  <div
    ref="container"
    class="opening-sequence"
    :class="{ 'without-map': !entrance.scene?.mapAvailable, 'on-stage': entrance.phase === 'stage' }"
    aria-label="选手正在集合入场"
  >
    <template v-if="entrance.phase === 'map'">
      <div class="map-shade"></div>
      <div ref="meeting" class="meeting-point" aria-hidden="true">
        <div class="arrival-ring"></div>
        <svg ref="tent" viewBox="0 0 100 110" fill="none">
          <ellipse cx="50" cy="91" rx="44" ry="9" fill="#2b1b3022" />
          <path d="M15 53h70v37H15Z" fill="#fff4e2" />
          <path d="M15 53h10v37H15Zm20 0h10v37H35Zm20 0h10v37H55Zm20 0h10v37H75Z" fill="#7a5a9e" />
          <path d="M5 55 50 13l45 42Z" fill="#fff4e2" />
          <path d="M5 55 50 13 28 55Zm45 0V13l23 42Z" fill="#c9483e" />
          <path d="M40 90V73a10 10 0 0 1 20 0v17Z" fill="#211229" />
          <path d="M50 13V2l25 6-25 6" fill="#e3b04b" stroke="#73516d" stroke-width="2" />
          <path d="M6 55h88" stroke="#e3b04b" stroke-width="4" />
        </svg>
        <span>你</span>
      </div>
      <div v-for="(restaurant, index) in entrance.scene?.actors" :key="restaurant.id" class="runner" :ref="(el) => setRunner(el, index)">
        <div class="runner-shadow"></div>
        <HostAvatar
          :restaurant="restaurant"
          :state="motions[index] === 'run' ? 'idle' : 'happy'"
          :motion="motions[index] || 'idle'"
          :direction="directions[index] || 1"
        />
      </div>
      <i v-for="particle in particles" :key="particle.key" :ref="(el) => setDust(el, particle.key)" class="dust"></i>
    </template>
    <div ref="veil" class="scene-veil"></div>
    <button class="skip-button" :disabled="entrance.phase === 'covered'" @click="skip">跳过</button>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import HostAvatar from './HostAvatar.vue'
import { useEntranceStore } from '@/stores/entrance'
import { GATHER_DURATION, STAGE_DURATION, STAGE_HANDOFF_START, OPENING_PLAYBACK_RATE, clamp, easeInOut, runnerPose, segment, venuePose } from '@/lib/entranceMotion'

const emit = defineEmits<{ covered: [] }>()
const entrance = useEntranceStore()
const container = ref<HTMLElement>(), meeting = ref<HTMLElement>(), tent = ref<SVGSVGElement>(), veil = ref<HTMLElement>()
const motions = ref<('idle' | 'run' | 'hop')[]>([])
const directions = ref<(1 | -1)[]>([])
const runners: HTMLElement[] = []
const dust = new Map<number, HTMLElement>()
const particles = (entrance.scene?.actors || []).flatMap((_, actor) => Array.from({ length: 10 }, (_, n) => ({ actor, n, key: actor * 10 + n })))
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
let frame = 0
let previousTime: number | undefined
let focused = false
let quick = false

function setRunner(el: unknown, index: number) { if (el instanceof HTMLElement) runners[index] = el }
function setDust(el: unknown, index: number) { if (el instanceof HTMLElement) dust.set(index, el) }

// The original opaque iris hides route replacement and lazy loading.
function coverMap() {
  if (entrance.phase !== 'map') return
  if (veil.value) { veil.value.style.clipPath = 'none'; veil.value.style.opacity = '1' }
  entrance.cover()
  emit('covered')
}

// Each pose uses current AMap screen projections, keeping feet attached during camera movement.
function renderGathering(time: number) {
  const scene = entrance.scene
  if (!scene || !container.value) return
  const rect = container.value.getBoundingClientRect()
  const size = clamp(rect.width / 480, 1, 1.4)
  container.value.style.setProperty('--runner-scale', String(size))
  const anchors = scene.anchors()
  const target = { x: anchors.target.x - rect.left, y: anchors.target.y - rect.top }
  const count = scene.actors.length

  scene.actors.forEach((_, index) => {
    const anchor = anchors.starts[index] || anchors.target
    const start = { x: anchor.x - rect.left, y: anchor.y - rect.top }
    const pose = runnerPose(time, index, count, start, target, size)
    const runner = runners[index]
    if (runner) {
      runner.style.transform = `translate(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px) translate(-50%, -95%) scale(${pose.scale.toFixed(4)})`
      runner.style.opacity = String(pose.opacity)
      runner.style.zIndex = String(10 + Math.round(pose.y))
    }
    const motion = pose.running ? 'run' : pose.arrived ? 'hop' : 'idle'
    if (motions.value[index] !== motion) motions.value[index] = motion
    if (directions.value[index] !== pose.direction) directions.value[index] = pose.direction
  })

  for (const particle of particles) {
    const el = dust.get(particle.key)
    if (!el) continue
    const emitted = 1690 + particle.actor * 110 + particle.n * 135
    const age = (time - emitted) / 500
    if (age < 0 || age > 1) { el.style.opacity = '0'; continue }
    const anchor = anchors.starts[particle.actor] || anchors.target
    const pose = runnerPose(emitted, particle.actor, count, { x: anchor.x - rect.left, y: anchor.y - rect.top }, target, size)
    el.style.transform = `translate(${pose.x}px, ${pose.y - age * 12}px) scale(${.4 + age})`
    el.style.opacity = String((1 - age) * .5)
  }

  const venue = venuePose(time)
  if (meeting.value) meeting.value.style.transform = `translate(${target.x}px, ${target.y}px)`
  if (tent.value) {
    tent.value.style.transform = `translate(-50%, -85%) scale(${venue.scale})`
    tent.value.style.opacity = String(venue.opacity)
  }
  if (time >= 3300 && !focused) { focused = true; scene.focusTarget() }

  if (veil.value) {
    const handoff = easeInOut(segment(time, STAGE_HANDOFF_START, GATHER_DURATION))
    const radius = Math.hypot(rect.width, rect.height) * 1.15 * handoff
    veil.value.style.opacity = handoff > 0 ? '1' : '0'
    veil.value.style.clipPath = `circle(${radius}px at ${target.x}px ${target.y}px)`
  }
}

// One clock drives the map performance, route handoff, cloth folds and stage entrance.
function tick(now: number) {
  const dt = previousTime === undefined ? 0 : now - previousTime
  previousTime = now
  if (!document.hidden && entrance.phase !== 'covered') entrance.elapsed += dt * OPENING_PLAYBACK_RATE
  if (entrance.phase === 'map') {
    renderGathering(entrance.elapsed)
    if (entrance.elapsed >= GATHER_DURATION || reducedMotion.matches) coverMap()
  } else if (entrance.phase === 'stage') {
    if (veil.value) {
      veil.value.style.opacity = String(1 - segment(entrance.elapsed, 0, 360))
    }
    if (entrance.elapsed >= STAGE_DURATION || quick || reducedMotion.matches) { entrance.finish(); return }
  }
  frame = requestAnimationFrame(tick)
}

function skip() {
  quick = true
  if (entrance.phase === 'map') coverMap()
  else if (entrance.phase === 'stage') entrance.finish()
}
function resetClock() { previousTime = undefined }
watch(() => entrance.phase, (phase) => {
  resetClock()
  // A skipped opening finishes as soon as the destination mounts, even if RAF is paused.
  if (phase === 'stage' && quick) entrance.finish()
})
onMounted(() => {
  frame = requestAnimationFrame(tick)
  document.addEventListener('visibilitychange', resetClock)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  document.removeEventListener('visibilitychange', resetClock)
})
</script>

<style lang="less" scoped>
.opening-sequence {
  position: fixed;
  z-index: 80;
  top: 0;
  bottom: 0;
  left: 50%;
  width: min(100%, var(--app-max-width));
  transform: translateX(-50%);
  overflow: hidden;
  isolation: isolate;

  &.without-map { background: radial-gradient(ellipse at center, #e3e8d8, #f5eee3); }
  &.on-stage { background: transparent; pointer-events: none; .skip-button { pointer-events: auto; } }

  .map-shade {
    position: absolute;
    inset: 0;
    background: #f5eee314;
    backdrop-filter: saturate(.85);
  }

  .runner {
    position: absolute;
    top: 0;
    left: 0;
    width: calc(69px * var(--runner-scale, 1));
    height: calc(105px * var(--runner-scale, 1));
    opacity: 0;
    transform-origin: 50% 95%;
    will-change: transform, opacity;

    .runner-shadow {
      position: absolute;
      left: 18%;
      bottom: 2px;
      width: 64%;
      height: 8px;
      border-radius: 50%;
      background: #2b1b3020;
      filter: blur(2px);
    }
  }

  .meeting-point {
    position: absolute;
    left: 0;
    top: 0;
    z-index: 5;

    .arrival-ring {
      position: absolute;
      width: calc(108px * var(--runner-scale, 1));
      height: calc(38px * var(--runner-scale, 1));
      left: calc(-54px * var(--runner-scale, 1));
      top: -5px;
      border: 1px solid #b58b47;
      border-radius: 50%;
      background: #e3b04b20;
      box-shadow: 0 0 0 9px #e3b04b12, 0 0 28px #e3b04b35;
      animation: invitation-pulse 1.4s ease-in-out infinite alternate;
    }

    svg {
      position: absolute;
      top: 0;
      left: 0;
      width: calc(90px * var(--runner-scale, 1));
      height: calc(99px * var(--runner-scale, 1));
      opacity: 0;
      transform-origin: 50% 85%;
      will-change: transform, opacity;
    }

    >span {
      position: absolute;
      top: 24px;
      left: -12px;
      width: 24px;
      height: 24px;
      display: grid;
      place-items: center;
      background: var(--green);
      border: 2px solid var(--paper);
      border-radius: 50%;
      color: var(--paper);
      font-size: var(--small-size);
    }
  }

  .dust {
    position: absolute;
    top: 0;
    left: 0;
    width: 12px;
    height: 8px;
    border-radius: 50%;
    background: #f5eee3;
    box-shadow: 5px -3px 0 #f5eee388;
    opacity: 0;
    z-index: 6;
  }

  .scene-veil {
    position: absolute;
    inset: 0;
    z-index: 10000;
    background: #211229;
    opacity: 0;
    will-change: clip-path, opacity;
  }

  .skip-button {
    position: absolute;
    top: calc(18px + env(safe-area-inset-top));
    right: var(--inset-right);
    z-index: 10001;
    border: 1px solid #a38aab66;
    border-radius: 30px;
    background: #fffbf4d9;
    color: #6c536e;
    padding: 9px 16px;
    font-size: var(--label-size);

    &:disabled { opacity: .5; }
  }

  @keyframes invitation-pulse { to { transform: scale(1.09); box-shadow: 0 0 0 13px #e3b04b08, 0 0 35px #e3b04b30; } }
}
</style>
