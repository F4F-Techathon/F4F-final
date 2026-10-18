<template>
  <div
    ref="container"
    class="character-avatar"
    :class="[`is-${state}`, { portrait }]"
    :style="{ '--facing': direction }"
    role="img"
    :aria-label="`${name || character || ''}，${motion === 'run' ? '正在跑来' : labels[state]}`"
  ></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { RIG, type Actor, type Rig } from '@/lib/characterRig'
import { createFigureRig, type Figure } from '@/agents/rig'
import { useStageDirector } from '@/composables/useStageDirector'
import type { CharacterId, CharacterState } from '@/data/types'

// A generated host passes its `figure`; the film's hand-made owners can still be named by `character`.
// On stage an `actorId` registers the actor with the director; while `directed`, choreography owns its
// face, gestures and gaze, and the props keep only running and the talking mouth.
const props = withDefaults(defineProps<{
  character?: CharacterId
  figure?: Figure
  state?: CharacterState
  name?: string
  portrait?: boolean
  motion?: 'idle' | 'run' | 'hop'
  direction?: 1 | -1
  lookX?: number
  actorId?: string
  directed?: boolean
}>(), { state: 'idle', portrait: false, motion: 'idle', direction: 1, lookX: 0, directed: false })
const director = useStageDirector()

const container = ref<HTMLElement>()
const id = `actor-${useId().replace(/[^a-z0-9]/gi, '')}`
const labels = { idle: '等候中', speaking: '正在发言', listening: '正在聆听', thinking: '思考中', happy: '开心', surprised: '惊讶', disagree: '有不同意见' }
const expressions = { idle: 'idle', speaking: 'pitch', listening: 'listen', thinking: 'think', happy: 'win', surprised: 'shock', disagree: 'sly' }
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
let rig: Rig
let actor: Actor
let raf = 0
let visible = true
let origin = 0
let expression = 'idle'
let pose = 'rest'
let motion = 'idle'
let settledTime = 1
let talk = 0
let lastFrame = 0
let observer: IntersectionObserver | undefined
let unregister: (() => void) | undefined

// One actor keeps its breathing and blink clock while expressions and gestures blend in place.
function updateActor() {
  if (!actor) return
  const t = performance.now() / 1000 - origin
  const nextMotion = reducedMotion.matches ? 'idle' : props.motion
  const nextExpression = props.directed ? expression : expressions[props.state]
  const nextPose = props.directed && nextMotion !== 'run' ? pose : nextMotion === 'run' ? 'run' : props.state === 'happy' ? 'cheer' : props.state === 'speaking' ? 'present' : props.state === 'disagree' ? 'hip' : 'rest'
  if (nextExpression !== expression) actor.e(t, nextExpression)
  if (nextPose !== pose) actor.p(t, nextPose, .65)
  if (nextMotion !== motion) {
    if (motion === 'run') actor.stopRun(t)
    if (nextMotion === 'run') actor.run(t, Number.POSITIVE_INFINITY, 3.1)
    if (nextMotion === 'hop') actor.act(t, 'hop', .5)
  }
  expression = nextExpression
  pose = nextPose
  motion = nextMotion
  settledTime = t + 1
}

// Gaze changes have their own blend and never restart a listener's expression or pose.
function updateGaze() {
  if (!actor || props.directed) return
  const t = performance.now() / 1000 - origin
  actor.look(t, props.lookX, 0)
  settledTime = t + 1
}

// Offscreen characters avoid SVG writes, and every animation frame is released on unmount.
function animate(time: number) {
  if (visible && actor) {
    const t = reducedMotion.matches ? settledTime : Math.max(0, time / 1000 - origin)
    const state = actor.state(t)
    const speaking = !reducedMotion.matches && (props.state === 'speaking' || props.state === 'disagree')
    const dt = lastFrame ? Math.min(time - lastFrame, 80) : 16
    talk += ((speaking ? 1 : 0) - talk) * (1 - Math.exp(-dt / 130))
    if (!reducedMotion.matches && talk > .025) {
      state.mouth = `v${Math.floor(t * 9) % 6 + 1}`
      state.open = (.3 + Math.abs(Math.sin(t * 11)) * .65) * talk
    }
    rig.render(state)
  }
  lastFrame = time
  raf = requestAnimationFrame(animate)
}

watch(() => [props.state, props.motion], updateActor)
watch(() => props.lookX, updateGaze)
onMounted(() => {
  const figure: Figure = props.figure || { kind: 'film', id: props.character || 'hua' }
  rig = createFigureRig(container.value!, figure, id, { portrait: props.portrait })
  origin = performance.now() / 1000
  actor = new RIG.Actor(rig, {
    seed: Array.from(props.name || props.character || id).reduce((seed, letter) => (seed + letter.charCodeAt(0)) % 7, 0),
  })
  updateActor()
  updateGaze()
  if (director && props.actorId) unregister = director.register(props.actorId, actor, origin, (t) => { settledTime = Math.max(settledTime, t + 1) })
  observer = new IntersectionObserver(([entry]) => { visible = !!entry?.isIntersecting })
  observer.observe(container.value!)
  reducedMotion.addEventListener('change', updateActor)
  raf = requestAnimationFrame(animate)
})
onBeforeUnmount(() => {
  unregister?.()
  cancelAnimationFrame(raf)
  observer?.disconnect()
  reducedMotion.removeEventListener('change', updateActor)
})
</script>

<style lang="less" scoped>
.character-avatar {
  position: relative;
  width: 100%;
  height: 100%;

  :deep(svg) {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
    transform: scaleX(var(--facing, 1));
    transition: transform .45s cubic-bezier(.4, 0, .2, 1);
  }

  &.portrait {
    overflow: hidden;
    border-radius: inherit;

    :deep(svg) { overflow: hidden; }
  }
}
</style>
