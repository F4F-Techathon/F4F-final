<template>
  <section ref="page" class="pick-page" :class="{ 'is-gathering': entrance.active, 'is-arriving': pickerArrival.active }"
    :style="{ '--picker-chrome': pickerArrival.progress.chrome, '--picker-title': pickerArrival.progress.title, '--picker-cards': pickerArrival.progress.cards, '--picker-map': pickerArrival.progress.map, '--picker-invitations': pickerArrival.progress.invitations }">
    <div class="opening-map" :aria-hidden="!entrance.active" :inert="!entrance.active || undefined">
      <AMapView ref="mapView" :restaurants="store.selected" :selected-ids="store.selectedIds"
        :center="store.filters.center" :gathering="entrance.active" :gathering-time="entrance.elapsed" />
    </div>
    <div class="picker-header">
      <NavHeader title="饭店候场" @back="router.push('/input')">
        <button class="icon-btn filter-button" aria-label="调整口味和范围" :disabled="deck?.busy || clapping || entrance.active" @click="filterOpen = true"><AppIcon name="filter" :size="20" /></button>
      </NavHeader>
    </div>
    <div class="picker-content">
      <div class="picker-intro"><div class="orb-anchor" data-guide-orb-anchor="pick" aria-hidden="true"></div><h1>今晚，谁来打动你？</h1></div>
      <p v-if="shortlistNote" class="shortlist-note" :class="store.shortlistState" role="status">{{ shortlistNote }}
        <button v-if="store.shortlistState === 'ready' && !deckFinished" class="text-btn invite-picks" :disabled="clapping || entrance.active" @click="store.invitePicks()">让 Orb 直接请入场</button>
      </p>
      <div class="picker-stage">
        <Transition name="casting">
          <div v-if="store.shortlistState === 'loading'" key="choosing" class="deck-empty choosing" aria-busy="true">
            <div class="empty-ticket"><AppIcon name="fork" :size="42" /></div>
            <h2>按你的需求挑店中…</h2>
          </div>
          <RestaurantDeck v-else-if="!deckFinished" ref="deck" key="cards"
            :restaurants="store.swipeCandidates" :center="store.filters.center" :reasons="store.shortlist?.reasons"
            :disabled="entrance.active || filterOpen || pickerArrival.active"
            @choose="store.swipeRestaurant" @inspect="router.push(`/restaurant/${$event}`)" />
          <div v-else key="ready" class="deck-empty">
            <template v-if="store.canStartDebate">
              <OpeningClapper :playing="clapping || entrance.active"
                :disabled="pickerArrival.active || filterOpen || !castReady" :style="{ '--clap-duration': `${CLAP_DURATION}ms` }" @clap="start" />
              <p v-if="!castReady" class="makeup-note" role="status">选手化妆中… {{ readyCount }}/{{ store.selected.length }}</p>
            </template>
            <template v-else>
              <div class="empty-ticket"><AppIcon name="fork" :size="42" /></div>
              <h2>{{ emptyTitle }}</h2>
            </template>
            <div class="empty-actions">
              <button v-if="!full && store.candidates.length" class="text-btn" :disabled="clapping || entrance.active" @click="store.resetSwipes"><AppIcon name="refresh" :size="17" />再看一轮</button>
              <button v-else-if="!store.candidates.length" class="text-btn" @click="filterOpen = true"><AppIcon name="filter" :size="17" />调整口味和范围</button>
            </div>
          </div>
        </Transition>
      </div>
    </div>
    <div class="picker-footer">
      <div class="chosen-tray" :class="{ visible: store.selected.length }">
        <div class="chosen-clip">
          <div class="chosen-restaurants" aria-label="已邀请的饭店，点击可取消邀请">
            <button v-for="restaurant in store.selected" :key="restaurant.id" class="chosen-restaurant"
              :data-contestant-id="restaurant.id" :aria-label="`取消邀请${restaurant.name}`"
              :disabled="deck?.busy || clapping || entrance.active" @click="store.removeSelection(restaurant.id)">
              <span class="avatar" :style="{ background: `${restaurant.color}12` }"><HostAvatar :restaurant="restaurant" portrait /></span>
              <span class="remove-mark"><AppIcon name="close" :size="10" /></span>
              <span class="host-name">{{ cast.hostNameOf(restaurant) }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    <BottomSheet :open="filterOpen" title="换个口味和范围" size="large" @close="closeFilters">
      <FilterFields />
      <template #footer><button class="btn btn-primary" @click="closeFilters">继续挑选<AppIcon name="check" :size="18" /></button></template>
    </BottomSheet>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { MAX_CONTESTANTS } from '@/data/app'
import { useCastStore } from '@/stores/cast'
import { useDiningStore } from '@/stores/dining'
import { useEntranceStore } from '@/stores/entrance'
import { usePickerArrivalStore } from '@/stores/pickerArrival'
import NavHeader from '@/components/NavHeader.vue'
import AppIcon from '@/components/AppIcon.vue'
import RestaurantDeck from '@/components/RestaurantDeck.vue'
import HostAvatar from '@/components/HostAvatar.vue'
import AMapView from '@/components/AMapView.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import FilterFields from '@/components/FilterFields.vue'
import OpeningClapper from '@/components/OpeningClapper.vue'

const store = useDiningStore(), entrance = useEntranceStore(), router = useRouter(), cast = useCastStore()
const pickerArrival = usePickerArrivalStore()
const page = ref<HTMLElement>(), deck = ref<InstanceType<typeof RestaurantDeck>>()
const mapView = ref<InstanceType<typeof AMapView>>()
const filterOpen = ref(false)
const clapping = ref(false)
const CLAP_DURATION = 1100
let clapTimer: ReturnType<typeof setTimeout> | undefined
const full = computed(() => store.selected.length >= MAX_CONTESTANTS)
// The shortlist agent picks this request's deck from the shops within its hard limits; until it answers the deck waits.
const shortlistNote = computed(() => store.shortlistState === 'ready' && store.shortlist
  ? `Orb：${store.shortlist.summary || `按你的需求挑了 ${store.shortlist.ids.length} 家`}`
  : store.shortlistState === 'failed' ? '选店助手没连上，先按条件筛出的顺序看' : '')
// The filter sheet edits the request live, one field at a time: pick again once it closes, not on every tap.
watch(() => filterOpen.value ? '' : store.shortlistKey, (key) => { if (key) void store.refreshShortlist() }, { immediate: true })
const deckFinished = computed(() => full.value || !store.swipeCandidates.length)
const emptyTitle = computed(() => !store.candidates.length ? '这一轮，还没找到合适的' : store.selected.length ? '再找个聊得来的' : '还没心动？')
const castReady = computed(() => cast.isReady(store.selected))
const readyCount = computed(() => store.selected.filter((restaurant) => cast.statusOf(restaurant) === 'ready').length)

// Hosts are generated while the user swipes: the next cards in order, invited ones first.
watch(() => store.swipeCandidates.slice(0, 3), (upcoming) => cast.prefetch(upcoming), { immediate: true })
watch(() => store.selected, (invited) => invited.forEach((restaurant) => { void cast.ensure(restaurant).catch(() => undefined) }), { immediate: true })

// Apply edited limits to invitations without replacing the user's choices with a default cast.
function closeFilters() { store.reconcileSelection(); filterOpen.value = false }

// Finish the clap once before handing the selected cast to the existing opening sequence.
function start() {
  if (clapping.value || deck.value?.busy || entrance.active || pickerArrival.active || filterOpen.value || !deckFinished.value || !page.value) return
  store.reconcileSelection()
  if (!store.canStartDebate || !cast.isReady(store.selected)) return
  clapping.value = true
  void import('@/views/DebateView.vue')
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : CLAP_DURATION
  clapTimer = setTimeout(gather, duration)
}

// The map warms up behind the cards, then gathering and the curtain take over after the clap.
function gather() {
  if (entrance.active || !page.value || !store.canStartDebate) { clapping.value = false; return }
  const actors = [...store.selected]
  const initial = page.value.getBoundingClientRect()
  const initialHeight = window.innerHeight
  const starts = actors.map((restaurant, index) => {
    const avatar = page.value!.querySelector<HTMLElement>(`[data-contestant-id="${restaurant.id}"] .avatar`)
    const rect = avatar?.getBoundingClientRect()
    return rect ? { x: rect.left + rect.width / 2, y: rect.bottom } : { x: initial.left + initial.width * (index + 1) / (actors.length + 1), y: initialHeight * .7 }
  })
  const mapAvailable = mapView.value?.beginEntrance(actors) || false
  entrance.begin({
    actors,
    mapAvailable,
    anchors: () => {
      const current = page.value?.getBoundingClientRect() || initial
      return {
        starts: actors.map((restaurant, index) => (mapAvailable ? mapView.value?.project(restaurant.coordinates) : undefined) || {
          x: current.left + (starts[index]!.x - initial.left) / initial.width * current.width,
          y: starts[index]!.y / initialHeight * window.innerHeight,
        }),
        target: (mapAvailable ? mapView.value?.project(store.filters.center) : undefined) || {
          x: current.left + current.width / 2,
          y: window.innerHeight * .51,
        },
      }
    },
    focusTarget: () => { if (mapAvailable) mapView.value?.focusTarget() },
  })
  clapping.value = false
}

onMounted(store.reconcileSelection)
onBeforeUnmount(() => clearTimeout(clapTimer))
</script>

<style lang="less" scoped>
.pick-page {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  overflow-x: clip;
  background: var(--cream);

  .opening-map {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 50%;
    width: min(100%, var(--app-max-width));
    transform: translateX(-50%);
    z-index: 0;
    opacity: 0;
    pointer-events: none;
    transition: opacity .6s ease;
  }

  .picker-header, .picker-content, .picker-footer {
    position: relative;
    z-index: 1;
    transition: opacity .5s ease, transform .7s cubic-bezier(.22, .8, .25, 1);
  }

  .picker-header {
    flex-shrink: 0;
    opacity: var(--picker-chrome, 1);
    transform: translateY(calc((1 - var(--picker-chrome, 1)) * -6px));
    .filter-button { flex-shrink: 0; width: 34px; height: 44px; color: #8d7768; }
  }

  .picker-content {
    display: flex;
    flex-direction: column;
    flex: 1 0 auto;
    gap: clamp(12px, 2dvh, 20px);
    width: 100%;
    max-width: 680px;
    margin-inline: auto;
    padding: 8px var(--inset-right) 4px var(--inset-left);

    .picker-intro {
      display: flex;
      align-items: center;
      gap: clamp(12px, 2vw, 18px);
      flex-shrink: 0;
      width: 100%;
      max-width: 500px;
      margin-inline: auto;
      padding-inline: 8px;
      .orb-anchor { flex: none; width: clamp(52px, 8vw, 68px); aspect-ratio: 1; }
      h1 {
        min-width: 0;
        margin: 0;
        font-family: var(--font-display);
        font-size: clamp(20px, 6vw, var(--title-size));
        font-weight: var(--weight-regular);
        letter-spacing: var(--tracking-display);
        white-space: nowrap;
        opacity: var(--picker-title, 1);
        transform: translateX(calc((1 - var(--picker-title, 1)) * 14px));
      }
    }

    .picker-stage {
      display: grid;
      flex: 1;
      min-width: 0;

      >* { grid-area: 1 / 1; }
      >.casting-enter-active { transition: opacity .65s ease .12s, transform .8s cubic-bezier(.22, .8, .25, 1) .12s; }
      >.casting-leave-active { pointer-events: none; transition: opacity .3s ease, transform .45s ease; }
      >.casting-enter-from { opacity: 0; transform: translateY(22px) scale(.97); }
      >.casting-leave-to { opacity: 0; transform: translateY(-10px) scale(.98); }
    }

    .shortlist-note {
      width: 100%;
      max-width: 500px;
      margin: -6px auto 0;
      padding-inline: 8px;
      color: #8f7653;
      font-size: var(--label-size);
      line-height: 1.5;
      &.failed { color: #a1855e; }
      .invite-picks { display: inline; margin-left: 6px; padding: 0; color: #b0742f; font-weight: var(--weight-semibold); text-decoration: underline; text-underline-offset: 3px; }
    }

    .deck-empty {
      display: flex;
      flex: 1;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 300px;
      text-align: center;
      opacity: var(--picker-cards, 1);
      transform: translateY(calc((1 - var(--picker-cards, 1)) * 12px));

      .empty-ticket { display: grid; place-items: center; width: 100px; height: 100px; color: #b48c4e; background: #ecdfc8; border: 1px solid #dac09b; border-radius: 30px; transform: rotate(-7deg); }
      h2 { margin: 30px 0 12px; font-family: var(--font-display); font-weight: var(--weight-regular); font-size: var(--title-size); letter-spacing: var(--tracking-display); }
      .empty-actions .text-btn { display: inline-flex; align-items: center; gap: 7px; min-height: 44px; color: #a1855e; }
      .makeup-note { margin: 14px 0 0; color: #a1855e; font-size: var(--label-size); }
    }
  }

  .picker-footer {
    flex-shrink: 0;
    width: 100%;
    max-width: 680px;
    margin-inline: auto;
    padding: 4px var(--inset-right) calc(16px + env(safe-area-inset-bottom)) var(--inset-left);
    opacity: var(--picker-invitations, 1);
    transform: translateY(calc((1 - var(--picker-invitations, 1)) * 10px));

    .chosen-tray {
      display: grid;
      grid-template-rows: 0fr;
      opacity: 0;
      pointer-events: none;
      transform: translateY(4px);
      transition: grid-template-rows .4s cubic-bezier(.22, .61, .36, 1), opacity .3s ease, transform .4s cubic-bezier(.22, .61, .36, 1);
      &.visible { grid-template-rows: 1fr; opacity: 1; pointer-events: auto; transform: translateY(0); }

      .chosen-clip {
        min-height: 0;
        overflow: hidden;

        .chosen-restaurants {
          display: flex;
          min-height: 84px;
          justify-content: center;
          gap: clamp(8px, 2vw, 16px);
          padding: 4px 0 8px;
          overflow-x: auto;

          .chosen-restaurant {
            position: relative;
            flex: 0 0 48px;
            display: flex;
            align-items: center;
            flex-direction: column;
            gap: 4px;
            min-height: 44px;
            padding: 0;
            border: 0;
            background: none;

            .avatar { display: block; width: 44px; height: 44px; border: 1px solid #d7c6ae; border-radius: 50%; overflow: hidden; }
            .remove-mark { position: absolute; top: -2px; right: 0; display: grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; border: 1px solid #dacdbb; background: var(--paper); color: #a08b77; }
            .host-name { color: #8d7768; font-size: var(--small-size); white-space: nowrap; }
          }
        }
      }
    }

  }

  &.is-arriving {
    .picker-header, .picker-footer { transition: none; }
  }

  &.is-gathering {
    .opening-map { opacity: 1; }
    .picker-header { opacity: 0; transform: translateY(-100%); pointer-events: none; }
    .picker-content { opacity: 0; transform: translateY(-30px) scale(.96); pointer-events: none; }
    .picker-footer { opacity: 0; transform: translateY(110%); pointer-events: none; }
  }

  @media (max-height: 700px) {
    .picker-footer {
      padding-bottom: calc(12px + env(safe-area-inset-bottom));
      .chosen-tray {
        .chosen-clip .chosen-restaurants { min-height: 52px; padding: 4px 0; .chosen-restaurant { .avatar { width: 36px; height: 36px; } .host-name { display: none; } } }
      }
    }
  }
}
</style>
