<template>
  <CharacterAvatar v-if="figure" :key="figureKey(figure)" :figure="figure" :name="cast.hostNameOf(restaurant)" :state="state" :motion="motion"
    :direction="direction" :look-x="lookX" :portrait="portrait" :actor-id="actorId" :directed="directed" />
  <div v-else class="host-pending" :class="{ portrait, failed: status === 'error' }" :style="{ '--host-color': restaurant.color }"
    role="img" :aria-label="status === 'error' ? `${cast.hostNameOf(restaurant)}的形象暂时没生成出来` : `${cast.hostNameOf(restaurant)}的形象生成中`">
    <svg :viewBox="portrait ? '-175 -565 350 350' : '-210 -610 420 640'" aria-hidden="true">
      <ellipse v-if="!portrait" cx="0" cy="2" rx="88" ry="16" class="shadow" />
      <path d="M -96 0 V -150 Q -96 -250 0 -250 Q 96 -250 96 -150 V 0 Z" class="body" />
      <circle cx="0" cy="-364" r="104" class="head" />
    </svg>
    <span class="steps" aria-hidden="true"><i v-for="(item, index) in STEPS" :key="item.id" :class="{ done: index < stepIndex, current: index === stepIndex }"></i></span>
    <span v-if="!portrait" class="caption">{{ status === 'error' ? '稍后重试' : `化妆中 · ${STEPS[Math.max(0, stepIndex)]?.zh}` }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import CharacterAvatar from './CharacterAvatar.vue'
import { figureKey } from '@/agents/rig'
import { useCastStore } from '@/stores/cast'
import type { CharacterState, Restaurant } from '@/data/types'

// A restaurant's generated host, or a silhouette in its color while the host is still being made.
const props = withDefaults(defineProps<{
  restaurant: Restaurant
  state?: CharacterState
  portrait?: boolean
  motion?: 'idle' | 'run' | 'hop'
  direction?: 1 | -1
  lookX?: number
  actorId?: string
  directed?: boolean
}>(), { state: 'idle', portrait: false, motion: 'idle', direction: 1, lookX: 0, directed: false })

const STEPS = [{ id: 'look', zh: '形象' }, { id: 'accent', zh: '口音' }, { id: 'assets', zh: '组件' }]
const cast = useCastStore()
const figure = computed(() => cast.figureOf(props.restaurant))
const status = computed(() => cast.statusOf(props.restaurant))
const stepIndex = computed(() => STEPS.findIndex((item) => item.id === cast.stepOf(props.restaurant)))

// Whoever shows a host makes sure it is on its way; failures stay quiet until the next showing.
onMounted(() => { if (status.value === 'idle' || status.value === 'error') void cast.ensure(props.restaurant).catch(() => undefined) })
</script>

<style lang="less" scoped>
.host-pending {
  position: relative;
  width: 100%;
  height: 100%;

  svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .shadow { fill: #2b1b30; opacity: .14; }
  .body, .head { fill: var(--host-color); opacity: .26; animation: host-making 1.4s ease-in-out infinite alternate; }
  .head { animation-delay: -.7s; }

  .steps {
    position: absolute;
    left: 50%;
    bottom: 12%;
    display: flex;
    gap: 3px;
    transform: translateX(-50%);
    i { width: 5px; height: 5px; border-radius: 50%; background: #fff8ee; box-shadow: 0 0 0 1px #2b1b3022; opacity: .55; transition: background .3s, opacity .3s; }
    i.done { background: var(--host-color); opacity: 1; }
    i.current { background: var(--host-color); opacity: 1; animation: host-step .7s ease-in-out infinite alternate; }
  }

  .caption {
    position: absolute;
    left: 50%;
    bottom: 26%;
    transform: translateX(-50%);
    padding: 3px 8px;
    border-radius: 10px;
    background: #fff8eee6;
    color: #6b5248;
    font-size: var(--small-size);
    white-space: nowrap;
  }

  &.portrait .steps { bottom: 10%; i { width: 4px; height: 4px; } }
  &.portrait { overflow: hidden; border-radius: inherit; }
  &.failed .body, &.failed .head { animation: none; opacity: .14; }

  @media (prefers-reduced-motion: reduce) { .body, .head, .steps i.current { animation: none; } }
}

@keyframes host-making { from { opacity: .16; } to { opacity: .34; } }
@keyframes host-step { from { transform: scale(.8); } to { transform: scale(1.25); } }
</style>
