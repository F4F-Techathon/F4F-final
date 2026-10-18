<template>
  <div class="restaurant-deck" :class="{ 'is-dragging': dragging, 'is-leaving': exiting }">
    <div ref="stack" class="card-stack" tabindex="0" role="group" aria-label="餐厅卡片，按左方向键跳过，右方向键邀请"
      @keydown.left.prevent="choose(-1)" @keydown.right.prevent="choose(1)">
      <article v-for="(restaurant, index) in restaurants.slice(0, VISIBLE_STACK_CARDS + 1)" :key="restaurant.id" class="swipe-card"
        :class="{ 'is-top': index === 0 }" :style="cardStyle(index)"
        :aria-hidden="index !== 0" :inert="index !== 0 || disabled || undefined"
        @pointerdown="index === 0 && pointerDown($event)" @pointermove="pointerMove"
        @pointerup="pointerUp" @pointercancel="cancelGesture" @lostpointercapture="cancelGesture"
        @transitionend="finishTransition($event, restaurant.id)">
        <div class="card-scene">
          <img class="merchant-photo" :src="restaurant.cover.src" :alt="restaurant.cover.alt" referrerpolicy="no-referrer"
            :style="{ objectPosition: restaurant.cover.position || '50% 50%' }" draggable="false"
            loading="eager" decoding="async" />
          <div class="photo-wash" aria-hidden="true"></div>
          <span class="cuisine-label">{{ restaurant.cuisine }}</span>
          <button class="card-info icon-btn" :aria-label="`查看${restaurant.name}的资料`" :disabled="busy || disabled"
            @pointerdown.stop @click="emit('inspect', restaurant.id)"><AppIcon name="info" :size="20" /></button>
          <div class="host-portrait"><HostAvatar :restaurant="restaurant" portrait
            :state="index === 0 && delta.x > 35 ? 'happy' : index === 0 && delta.x < -35 ? 'disagree' : 'idle'" /></div>
          <span v-if="index === 0" class="choice-stamp invite" :style="{ opacity: delta.x > 0 ? stampOpacity : 0 }" aria-hidden="true">请就位</span>
          <span v-if="index === 0" class="choice-stamp skip" :style="{ opacity: delta.x < 0 ? stampOpacity : 0 }" aria-hidden="true">下次吧</span>
        </div>
        <div class="card-copy">
          <div class="restaurant-heading"><h2>{{ restaurant.name }}</h2><span>{{ restaurant.price ? `¥${restaurant.price} / 人` : '价格待确认' }}</span></div>
          <p class="host-line" :class="{ picked: reasons?.[restaurant.id] }">“{{ reasons?.[restaurant.id] || restaurant.intro }}”</p>
          <div class="restaurant-tags"><span v-for="tag in restaurant.tags.slice(0, 2)" :key="tag">{{ tag }}</span></div>
        </div>
      </article>
    </div>
    <div v-if="currentRestaurant" class="location-preview" role="group" :aria-label="`${currentRestaurant.name}的位置`">
      <div class="map-preview">
        <AMapView :restaurants="[currentRestaurant]" :center="currentRestaurant.coordinates" mini />
        <span class="map-label">{{ DATA_LABEL }}</span>
      </div>
      <Transition name="location">
        <div :key="currentRestaurant.id" class="location-details">
          <p class="location-address"><AppIcon name="pin" :size="14" /><span>{{ currentRestaurant.address.split(' · ')[0] }}</span></p>
          <span class="location-distance">直线 {{ distance(currentRestaurant) }} km</span>
        </div>
      </Transition>
    </div>
    <p class="current-announcement" aria-live="polite">{{ restaurants[0]?.name }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Coordinates, Restaurant } from '@/data/types'
import { DATA_LABEL } from '@/data/restaurants'
import { cardStackPose, swipeDirection, VISIBLE_STACK_CARDS } from '@/lib/swipeMotion'
import { distanceKm } from '@/lib/filtering'
import AppIcon from './AppIcon.vue'
import HostAvatar from './HostAvatar.vue'
import AMapView from './AMapView.vue'

// reasons: the shortlist agent's one-line reason per shop, shown in place of the shop's own intro.
const props = defineProps<{ restaurants: Restaurant[]; center: Coordinates; disabled?: boolean; reasons?: Record<string, string> }>()
const currentRestaurant = computed(() => props.restaurants[0])
const emit = defineEmits<{ choose: [id: string, liked: boolean]; inspect: [id: string] }>()
const stack = ref<HTMLElement>()
const delta = ref({ x: 0, y: 0 })
const dragging = ref(false), exiting = ref(false)
const busy = computed(() => dragging.value || exiting.value)
const cardWidth = ref(350)
const progress = computed(() => Math.min(1, Math.abs(delta.value.x) / Math.max(64, Math.min(cardWidth.value * .25, 120))))
const stampOpacity = computed(() => Math.min(1, progress.value * 2))
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
let pointer: { id: number; x: number; y: number; time: number; element: HTMLElement } | undefined
let departing: { id: string; liked: boolean } | undefined
let completionTimer: ReturnType<typeof setTimeout> | undefined

// The hidden reserve joins during the swipe, so removing the front card never adds a visible layer.
function cardStyle(index: number) {
  const pose = cardStackPose(index, progress.value)
  const x = index ? 0 : delta.value.x
  const y = index ? pose.y : delta.value.y
  const rotation = index ? 0 : Math.max(-20, Math.min(20, x / cardWidth.value * 14))
  return {
    zIndex: VISIBLE_STACK_CARDS - index,
    opacity: index === 0 && exiting.value ? 0 : pose.opacity,
    transform: `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg) scale(${pose.scale})`,
  }
}

function distance(restaurant: Restaurant) { return distanceKm(props.center, restaurant.coordinates).toFixed(1) }

// Native vertical scrolling stays available until the pointer clearly moves sideways.
function pointerDown(event: PointerEvent) {
  if (props.disabled || busy.value || !event.isPrimary || event.button !== 0) return
  const element = event.currentTarget as HTMLElement
  cardWidth.value = element.getBoundingClientRect().width
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, element }
  element.setPointerCapture(event.pointerId)
}

function pointerMove(event: PointerEvent) {
  if (!pointer || pointer.id !== event.pointerId) return
  const x = event.clientX - pointer.x, y = event.clientY - pointer.y
  if (!dragging.value) {
    if (Math.abs(y) > 8 && Math.abs(y) > Math.abs(x)) { cancelGesture(); return }
    if (Math.abs(x) < 8) return
    dragging.value = true
  }
  delta.value = { x, y: y * .18 }
}

// Releasing capture first prevents its loss event from canceling an intentional departure.
function pointerUp(event: PointerEvent) {
  if (!pointer || pointer.id !== event.pointerId) return
  const start = pointer
  releasePointer()
  const direction = swipeDirection({ x: event.clientX - start.x, y: event.clientY - start.y, elapsed: event.timeStamp - start.time, width: cardWidth.value })
  if (direction) choose(direction)
  else delta.value = { x: 0, y: 0 }
}

function releasePointer() {
  const active = pointer
  pointer = undefined
  dragging.value = false
  if (active?.element.hasPointerCapture(active.id)) active.element.releasePointerCapture(active.id)
}

function cancelGesture() {
  if (!pointer) return
  releasePointer()
  delta.value = { x: 0, y: 0 }
}

// Keyboard and gestures use the same one-shot departure and decision path.
function choose(direction: -1 | 1) {
  const restaurant = props.restaurants[0]
  if (!restaurant || props.disabled || busy.value) return
  if (reducedMotion.matches) { delta.value = { x: 0, y: 0 }; emit('choose', restaurant.id, direction > 0); return }
  cardWidth.value = stack.value?.getBoundingClientRect().width || cardWidth.value
  departing = { id: restaurant.id, liked: direction > 0 }
  exiting.value = true
  delta.value = { x: direction * (window.innerWidth + cardWidth.value), y: delta.value.y - 25 }
  completionTimer = setTimeout(commitChoice, 560)
}

function finishTransition(event: TransitionEvent, id: string) {
  if (event.target === event.currentTarget && event.propertyName === 'transform' && departing?.id === id) commitChoice()
}

// The transition and its fallback share a one-shot commit.
function commitChoice() {
  if (!departing) return
  const choice = departing
  departing = undefined
  clearTimeout(completionTimer)
  exiting.value = false
  delta.value = { x: 0, y: 0 }
  emit('choose', choice.id, choice.liked)
}

defineExpose({ busy })
watch(() => props.disabled, (disabled) => { if (disabled) cancelGesture() })
onBeforeUnmount(() => { releasePointer(); clearTimeout(completionTimer) })
</script>

<style lang="less" scoped>
.restaurant-deck {
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 500px;
  margin-inline: auto;

  .card-stack {
    position: relative;
    isolation: isolate;
    flex: 1 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    // Reserve the visible stack's offset; the extra card fades in as it moves forward.
    padding-bottom: 24px;
    margin: 0 8px;
    outline-offset: 7px;
    opacity: var(--picker-cards, 1);
    transform: translateY(calc((1 - var(--picker-cards, 1)) * 12px)) scale(calc(.985 + var(--picker-cards, 1) * .015));
    transform-origin: 50% 0;

    .swipe-card {
      position: relative;
      grid-area: 1 / 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid #d7c5ab;
      border-radius: 25px;
      background: var(--paper);
      box-shadow: 0 8px 24px #59433417, 0 2px 0 #d8c4a9;
      transform-origin: 50% 82%;
      transition: transform .6s cubic-bezier(.2, 1.08, .32, 1), opacity .35s ease;
      pointer-events: none;
      user-select: none;
      touch-action: pan-y;

      &.is-top { pointer-events: auto; cursor: grab; }

      .card-scene {
        position: relative;
        flex: 1 0 auto;
        min-height: clamp(120px, 20dvh, 180px);
        overflow: hidden;
        background: #eadcc4;

        .merchant-photo {
          display: block;
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          filter: saturate(.88) contrast(.95) sepia(.1);
          pointer-events: none;
        }

        .photo-wash {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, #f2dfbb28, transparent 38%, #fffbf410 66%, #fffbf48c 88%, var(--paper));
          pointer-events: none;
        }

        .cuisine-label {
          position: absolute;
          top: 17px;
          left: 18px;
          z-index: 2;
          padding: 6px 11px;
          border: 1px solid #fff3d5b3;
          border-radius: 20px;
          background: #fffbf4de;
          color: #705d48;
          backdrop-filter: blur(10px);
          font-size: var(--label-size);
        }

        .card-info {
          position: absolute;
          z-index: 4;
          top: 13px;
          right: 13px;
          width: 38px;
          height: 38px;
          background: #fffbf4de;
          border: 1px solid #fff3d5b3;
          color: #705d48;
          backdrop-filter: blur(10px);
        }

        .host-portrait {
          position: absolute;
          right: 18px;
          bottom: 4px;
          width: clamp(52px, 10vw, 68px);
          aspect-ratio: 1;
          border-radius: 50%;
          border: 3px solid var(--paper);
          background: #f1e6d2;
          box-shadow: 0 3px 10px #5c3d2617;
          transform: rotate(5deg);
        }

        .choice-stamp {
          position: absolute;
          z-index: 3;
          top: 25%;
          border: 3px solid currentColor;
          border-radius: 9px;
          padding: 7px 12px 5px;
          font-family: var(--font-display);
          font-size: var(--title-size);
          font-weight: var(--weight-regular);
          line-height: var(--line-heading);
          letter-spacing: var(--tracking-display);
          pointer-events: none;

          &.invite { left: 10%; color: var(--green); transform: rotate(-15deg); background: #f5eee3d9; }
          &.skip { right: 10%; color: var(--red); transform: rotate(15deg); background: #f5eee3d9; }
        }
      }

      .card-copy {
        position: relative;
        flex-shrink: 0;
        padding: clamp(15px, 2vw, 24px);

        .restaurant-heading {
          display: flex;
          align-items: baseline;
          gap: 12px;
          h2 { flex: 1; min-width: 0; margin: 0; font-size: var(--section-size); line-height: var(--line-heading); }
          > span { flex-shrink: 0; color: #8b6447; font-size: var(--label-size); }
        }

        .host-line {
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
          margin: 8px 0;
          color: #7d6870;
          font-size: var(--body-size);
          line-height: var(--line-body);
        }

        .restaurant-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          span { padding: 5px 9px; border-radius: 6px; background: #f1e9d9; color: #8b7558; font-size: var(--small-size); }
        }
      }
    }
  }

  .location-preview {
    position: relative;
    isolation: isolate;
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    margin: 0 8px;
    overflow: hidden;
    border: 1px solid #d7cbb8;
    border-radius: 18px;
    background: var(--paper);
    opacity: var(--picker-map, 1);
    transform: translateY(calc((1 - var(--picker-map, 1)) * 10px));

    .map-preview {
      position: relative;
      height: clamp(96px, 14dvh, 120px);
      flex-shrink: 0;
      overflow: hidden;
      background: #e3e7da;

      .amap-view { position: absolute; inset: 0; isolation: isolate; }

      .map-label {
        position: absolute;
        z-index: 1;
        top: 7px;
        right: 9px;
        padding: 3px 7px;
        border: 1px solid #e3d9c599;
        border-radius: 6px;
        background: #fffbf4e6;
        color: #8a7967;
        font-size: var(--small-size);
        pointer-events: none;
      }

      :deep(.map-state) {
        gap: 4px;
        padding: 8px;
        > b, > p { display: none; }
        > .app-icon { width: 20px; height: 20px; }
        .loading-ring { width: 22px; height: 22px; }
        .text-btn { min-height: 24px; padding: 0; font-size: var(--small-size); }
      }
    }

    .location-details {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      gap: 8px;
      min-height: 44px;
      padding: 10px 12px;
      font-size: var(--label-size);
      line-height: var(--line-compact);

      .location-address {
        display: flex;
        align-items: center;
        gap: 5px;
        flex: 1;
        min-width: 0;
        margin: 0;
        color: #796857;
        line-height: inherit;
        .app-icon { color: var(--green); }
        span { overflow-wrap: anywhere; }
      }

      .location-distance { flex-shrink: 0; color: #9b8976; font-size: var(--small-size); font-variant-numeric: tabular-nums; white-space: nowrap; }
    }

    .location-enter-active { transition: opacity .35s ease, transform .45s cubic-bezier(.22, .61, .36, 1); }
    .location-leave-active { position: absolute; bottom: 0; width: 100%; transition: opacity .2s ease; }
    .location-enter-from { opacity: 0; transform: translateY(4px); }
    .location-leave-to { opacity: 0; }
  }

  .current-announcement { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

  &.is-dragging {
    .card-stack .swipe-card { transition: none; }
    .card-stack .swipe-card.is-top { cursor: grabbing; will-change: transform; }
  }

  &.is-leaving {
    .card-stack .swipe-card {
      transition: transform .48s cubic-bezier(.22, .61, .36, 1), opacity .36s ease;
      &.is-top { transition-timing-function: cubic-bezier(.32, .05, .67, .45), ease; will-change: transform, opacity; }
    }
  }

  @media (max-height: 740px) {
    .card-stack .swipe-card .card-copy {
      padding: 12px 15px;
      .restaurant-tags { display: none; }
    }
  }

  @media (max-height: 620px) {
    .card-stack .swipe-card {
      .card-scene { min-height: 112px; }
      .card-copy .host-line { display: none; }
    }
  }
}
</style>
