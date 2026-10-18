<template>
  <div class="theater" :class="{ 'is-entering': entering }" :style="{ '--lights': lights }" data-stage-scene>
    <div class="theater-wall"></div>
    <div class="marquee">
      <i v-for="n in 12" :key="n" :style="{ left: `${(n - 1) * 9.09}%`, opacity: entering ? segment(progress, n * .018, n * .018 + .18) : 1 }"></i>
      <b>{{ APP_NAME }}</b>
    </div>
    <div class="floor"></div>
    <!-- The host floats by the marquee: it talks on its own lines and watches whoever speaks. -->
    <div class="host-orb" :class="{ speaking: hostSpeaking, selected: selectedId === 'host', tapped: tapped.has('host') }"
      :style="{ opacity: entering ? lights : 1 }" v-bind="tapTarget('host', `主持人 ${hostName}`)">
      <GuideOrb :speaking="hostSpeaking" :listening="listening" :look="hostLook" />
      <b>{{ hostName }}</b>
    </div>
    <div class="stage-lighting" aria-hidden="true">
      <div v-for="(performer, index) in performers" :key="performer.id" class="light-position"
        :class="{ active: activeId === performer.id && !listening }" :style="seatStyle(index)">
        <div class="spotlight"></div>
        <div class="light-pool"></div>
      </div>
    </div>
    <TransitionGroup name="performer">
      <div v-for="(performer, index) in performers" :key="performer.id" class="actor-position"
        :class="{ active: activeId === performer.id && !listening, selected: selectedId === performer.id, tapped: tapped.has(performer.id), leaving: leaving.includes(performer.id) }"
        :style="seatStyle(index)" v-bind="tapTarget(performer.id, performer.restaurant ? `查看${performer.name}代表的${performer.restaurant.name}` : `查看嘉宾${performer.name}`)">
        <div class="actor" :style="figureStyle(performer.id, index)">
          <HostAvatar v-if="performer.restaurant" :restaurant="performer.restaurant"
            :state="actorState(performer.id)" :motion="actorMotion(performer.id)"
            :look-x="gazeDirection(index)" :actor-id="performer.id" :directed="directed && !entering"
            :direction="facing(index)" />
          <CharacterAvatar v-else-if="performer.figure" :key="figureKey(performer.figure)" :figure="performer.figure" :name="performer.name"
            :state="actorState(performer.id)" :motion="actorMotion(performer.id)"
            :look-x="gazeDirection(index)" :actor-id="performer.id" :directed="directed && !entering"
            :direction="facing(index)" />
        </div>
        <div class="nameplate" :class="{ long: performer.name.length >= 5 }" :style="{ opacity: entering ? segment(progress, .6, .85) : 1 }">
          <b>{{ performer.name }}</b>
          <small v-if="performer.restaurant" class="shop">
            <img v-if="performer.restaurant.cover.remote" :src="performer.restaurant.cover.src" alt="" referrerpolicy="no-referrer" loading="lazy" />{{ shopLabel(performer.restaurant) }}
          </small>
        </div>
      </div>
    </TransitionGroup>
    <StageCurtain :progress="clothProgress" />
    <div class="stage-front"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { CharacterState, Restaurant } from '@/data/types'
import { APP_NAME } from '@/data/app'
import { figureKey, type Figure } from '@/agents/rig'
import { easeInOut, easeOutBack, segment } from '@/lib/entranceMotion'
import { stageSlots } from '@/lib/stageLayout'
import CharacterAvatar from './CharacterAvatar.vue'
import GuideOrb from './GuideOrb.vue'
import HostAvatar from './HostAvatar.vue'
import StageCurtain from './StageCurtain.vue'

// Who stands on the floor, left to right: an invited restaurant's host, or a guest the console brought on.
export interface StagePerformer { id: string; name: string; restaurant?: Restaurant; figure?: Figure }

const ARRIVAL_MS = 900

const props = withDefaults(defineProps<{
  performers: StagePerformer[]
  activeId?: string
  paused?: boolean
  listening?: boolean
  speakingState?: CharacterState
  entering?: boolean
  progress?: number
  directed?: boolean
  hostName?: string
  /** Whose shop the page is showing beside the stage. */
  selectedId?: string
  /** Performers on their way off: they turn and run out to the right before the line-up drops them. */
  leaving?: string[]
}>(), { speakingState: 'speaking', progress: 1, directed: false, hostName: 'Orb', leaving: () => [] })
const emit = defineEmits<{ select: [id: string] }>()
const clothProgress = computed(() => props.entering ? easeInOut(segment(props.progress, .07, .9)) : 1)
const lights = computed(() => props.entering ? segment(props.progress, .25, .8) : 1)
const seats = computed(() => stageSlots(props.performers.length))
const speakerIndex = computed(() => props.performers.findIndex((p) => p.id === props.activeId))

// The host (speaker id 'host') talks while its own line types; otherwise its eyes follow the speaker's seat.
const hostSpeaking = computed(() => props.activeId === 'host' && !props.listening && props.speakingState === 'speaking')
const hostLook = computed(() => {
  if (props.entering || props.listening || props.activeId === 'host') return 0
  const seat = speakerIndex.value >= 0 ? seats.value[speakerIndex.value] : undefined
  return seat ? Math.max(-1, Math.min(1, seat.offset)) : null
})

// Someone who walks on mid-show runs to the seat while the others slide over to make room.
const arriving = reactive(new Set<string>())
watch(() => props.performers.map((p) => p.id), (ids, before) => {
  if (props.entering || !before) return
  for (const id of ids.filter((item) => !before.includes(item))) {
    arriving.add(id)
    setTimeout(() => arriving.delete(id), ARRIVAL_MS)
  }
})

// Anyone on stage, the host too, can be tapped (or reached by keyboard) to show who they speak for. The
// nameplate pops as feedback even for a host whose figure is still being made; the figure itself reacts
// through the director (DebateView).
const TAP_MS = 650
const tapped = reactive(new Set<string>())
function tap(id: string) {
  if (props.entering) return
  tapped.delete(id)
  requestAnimationFrame(() => { tapped.add(id); setTimeout(() => tapped.delete(id), TAP_MS) })
  emit('select', id)
}
function tapTarget(id: string, label: string) {
  return {
    role: 'button',
    tabindex: props.entering ? -1 : 0,
    'aria-label': label,
    'aria-pressed': props.selectedId === id,
    onClick: () => tap(id),
    onKeydown: (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); tap(id) } },
  }
}

// Under each host's name, the shop it speaks for: its cover photo and its plain name (no dishes, no branch).
function shopLabel(restaurant: Restaurant) {
  return restaurant.name.split('·')[0]!.replace(/\s*[（(][^（）()]*[)）]\s*$/, '').trim() || restaurant.name
}

// Light and character share fixed coordinates, independent of the current speaker.
function seatStyle(index: number) {
  const seat = seats.value[index]!
  return {
    '--seat-offset': seat.offset,
    '--seat-scale': seat.scale,
  }
}

// Listeners follow the speaker with their eyes and face the audience during an interruption.
function gazeDirection(index: number) {
  if (props.entering || props.listening || speakerIndex.value < 0 || speakerIndex.value === index) return 0
  return Math.sign(speakerIndex.value - index) * .65
}

function entryProgress(id: string) {
  const index = props.performers.findIndex((p) => p.id === id)
  return props.entering ? segment(props.progress, .2 + index * .065, .62 + index * .065) : 1
}

// Contestants run into their places behind the opening cloth and settle with a small bounce.
function figureStyle(id: string, index: number) {
  const progress = entryProgress(id)
  const eased = easeOutBack(progress)
  const offset = seats.value[index]!.offset
  const direction = offset < 0 ? -1 : offset > 0 ? 1 : -.32
  return {
    opacity: segment(progress, 0, .18),
    transform: `translate(calc(var(--entry-distance) * ${direction * (1 - easeInOut(progress))}), ${18 * (1 - eased)}px) scale(${.86 + .14 * eased})`,
  }
}

function actorMotion(id: string) {
  if (arriving.has(id) || props.leaving.includes(id)) return 'run'
  const progress = entryProgress(id)
  return props.entering && progress > 0 && progress < .9 ? 'run' : 'idle'
}

// Runners face the middle of the floor while they come in.
function facing(index: number): 1 | -1 {
  const id = props.performers[index]?.id
  // Mid-show, everyone comes in from the right and leaves to the right.
  if (id && props.leaving.includes(id)) return 1
  if (!props.entering && id && arriving.has(id)) return -1
  return (props.entering || (id && arriving.has(id))) && (seats.value[index]?.offset || 0) > 0 ? -1 : 1
}

function actorState(id: string): CharacterState {
  if (props.entering) return entryProgress(id) > .85 ? 'happy' : 'idle'
  if (props.listening) return 'listening'
  if (props.activeId === id) return props.paused ? 'thinking' : props.speakingState
  return 'listening'
}
</script>

<style lang="less" scoped>
.theater {
  position: relative;
  --actor-height: clamp(135px, min(48vw, 27dvh), 350px);
  --side-offset: min(33%, 290px);
  --stage-front-height: 23px;
  --original-baseline: clamp(42px, 6vw, 65px);
  // Reserve the label line, padding, shadow and a gap above the stage front.
  --stage-baseline: max(var(--original-baseline), calc(var(--stage-front-height) + var(--label-size) * var(--line-compact) + 26px));
  --entry-distance: clamp(110px, 17vw, 210px);
  --light-ease: cubic-bezier(.22, .61, .36, 1);
  height: calc(clamp(260px, min(78vw, 42dvh), 560px) + var(--stage-baseline) - var(--original-baseline));
  flex-shrink: 0;
  overflow: hidden;
  isolation: isolate;

  .theater-wall {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(90deg, #35203e 0, #35203e 23px, #3c2645 23px, #3c2645 25px);
    mask-image: linear-gradient(#000, #0003);
  }

  .marquee {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 22px 6px;
    border: 2px solid #ab8046;
    background: #28172e;
    border-radius: 8px;
    width: clamp(168px, 24vw, 260px);
    margin: 9px auto 0;
    z-index: 12;
    box-shadow: 0 3px 0 #130a1a;

    b {
      font-family: var(--font-display);
      color: #f5dfac;
      font-size: var(--section-size);
      font-weight: var(--weight-regular);
      line-height: var(--line-heading);
      letter-spacing: var(--tracking-display);
      white-space: nowrap;
    }

    > i {
      position: absolute;
      width: 3px;
      height: 3px;
      border-radius: 50%;
      background: #efd390;
      box-shadow: 0 0 5px #e3b04b;
      top: -2px;
    }
  }

  // Beside the marquee, clear of every seat whatever the cast size.
  .host-orb {
    --orb-size: clamp(44px, 12vw, 70px);
    position: absolute;
    left: clamp(52px, 16%, 128px);
    top: 8px;
    z-index: 11;
    display: flex;
    flex-direction: column;
    align-items: center;
    transform: translateX(-50%);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: opacity .6s;

    :deep(.guide-orb) { width: var(--orb-size); height: var(--orb-size); transition: transform .5s var(--light-ease); }
    b {
      margin-top: 1px;
      padding: 0 7px;
      border-radius: 8px;
      color: #e9dcf5;
      background: #2b1b3099;
      font-size: 10px;
      font-weight: var(--weight-regular);
      line-height: 1.6;
      letter-spacing: .08em;
      opacity: .55;
      transition: opacity .4s, color .4s;
    }
    &.speaking {
      :deep(.guide-orb) { transform: scale(1.14); }
      b { opacity: 1; color: #f5dfac; }
    }
    &.selected b { opacity: 1; color: #2b1b30; background: #f5dfac; }
    &.tapped { animation: orb-tap .65s var(--light-ease); }
    &:focus-visible { outline: none; b { outline: 2px solid #f5dfac; outline-offset: 2px; } }
  }

  .floor {
    position: absolute;
    height: clamp(95px, 14vw, 180px);
    bottom: 18px;
    left: -10%;
    right: -10%;
    background: repeating-linear-gradient(90deg, #8d6650 0, #8d6650 47px, #74523f 48px, #ac7c58 49px);
    transform: perspective(200px) rotateX(24deg);
    border-top: 2px solid #bc9065;
  }

  .stage-lighting {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;

    .light-position {
      .spotlight {
        position: absolute;
        left: -70%;
        bottom: -6px;
        width: 240%;
        height: 175%;
        background: linear-gradient(180deg, #fff1cf08, #ffe6b31a 55%, #efc97c36);
        clip-path: polygon(44% 0, 56% 0, 100% 100%, 0 100%);
        mask-image: linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent);
        opacity: 0;
        transition: opacity 1s var(--light-ease);
      }

      .light-pool {
        position: absolute;
        bottom: -9px;
        left: -17%;
        width: 134%;
        height: 26px;
        border-radius: 50%;
        background: radial-gradient(ellipse, #ffe4a77a, #ecc58133 48%, transparent 74%);
        opacity: calc(.18 * var(--lights, 1));
        transform: scale(.82);
        transition: opacity 1s var(--light-ease), transform 1.1s var(--light-ease);
      }

      &.active {
        .spotlight { opacity: var(--lights, 1); }
        .light-pool { opacity: var(--lights, 1); transform: scale(1.08); }
      }
    }
  }

  .light-position, .actor-position {
    position: absolute;
    width: calc(var(--actor-height) * 140 / 207);
    height: var(--actor-height);
    left: calc(50% + var(--side-offset) * var(--seat-offset));
    bottom: var(--stage-baseline);
    transform: translateX(-50%) scale(var(--seat-scale));
    transform-origin: 50% 100%;
  }

  .actor-position {
    z-index: 2;
    cursor: pointer;
    // The others slide over when someone comes or goes; a newcomer runs in from the right wing, a leaver runs out.
    transition: left .7s cubic-bezier(.3, .7, .3, 1);
    &.performer-enter-from { left: 118%; opacity: 0; }
    &.performer-enter-active { transition: left .9s cubic-bezier(.25, .8, .3, 1), opacity .25s ease; }
    &.leaving { left: 118%; opacity: 0; pointer-events: none; transition: left 1s cubic-bezier(.5, 0, .75, .4), opacity .35s ease .65s; }
    &.performer-leave-active { transition: opacity .25s ease; }
    &.performer-leave-to { opacity: 0; }
    -webkit-tap-highlight-color: transparent;
    &:focus-visible { outline: none; .nameplate { outline: 2px solid #f5dfac; outline-offset: 2px; } }

    .actor {
      position: relative;
      height: 100%;
      width: 100%;
      z-index: 2;
      transform-origin: 50% 95%;
      filter: brightness(.78) saturate(.88);
      transition: filter .9s var(--light-ease);
    }

    .nameplate {
      position: absolute;
      top: calc(100% + 1px);
      left: 50%;
      transform: translateX(-50%);
      width: max-content;
      min-width: 68%;
      min-height: 28px;
      z-index: 3;
      border: 1px solid #92766a;
      background: #dfd0ba;
      border-radius: 7px;
      color: #66504d;
      box-shadow: 0 3px 0 #4e3340;
      text-align: center;
      padding: 5px 9px;
      line-height: var(--line-compact);
      transition: opacity .4s, color .8s var(--light-ease), background .8s var(--light-ease), border-color .8s var(--light-ease), box-shadow .8s var(--light-ease);

      b {
        font-size: calc(var(--label-size) / var(--seat-scale));
        display: block;
        white-space: nowrap;
        font-weight: var(--weight-semibold);
      }
      &.long { padding-inline: 5px; b { font-size: calc(var(--label-size) * .84 / var(--seat-scale)); letter-spacing: -.02em; } }

      // The shop this host speaks for: its photo, then its name, so two hosts are never told apart by face alone.
      .shop {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        max-width: 5.6em;
        margin: 2px auto 0;
        color: #8a6f62;
        font-size: calc(10px / var(--seat-scale));
        line-height: 1.15;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        img { width: 1.35em; height: 1.35em; border-radius: 50%; object-fit: cover; flex: none; box-shadow: 0 0 0 1px #92766a; }
      }

    }

    &.tapped .nameplate { animation: nameplate-tap .65s var(--light-ease); }
    &.selected {
      .actor { filter: brightness(1) saturate(1); }
      .nameplate { border-color: #e5bf7a; box-shadow: 0 3px 0 #4e3340, 0 0 0 2px #f5dfac; }
    }

    &.active {
      .actor { filter: brightness(1.04) saturate(1.02); }
      .nameplate {
        color: #543c3e;
        background: #fff0cf;
        border-color: #e5bf7a;
        box-shadow: 0 3px 0 #4e3340, 0 0 18px #e3b04b30;
      }
    }
  }

  .stage-front {
    position: absolute;
    bottom: 0;
    height: var(--stage-front-height);
    width: 100%;
    background: linear-gradient(#6b453c, #362035);
    border-top: 3px solid #b48c5e;
    border-bottom: 3px solid #e3b04b22;
    z-index: 5;
  }

  &.is-entering {
    .actor-position, .host-orb { cursor: default; }
    .stage-lighting .light-position {
      .spotlight, .light-pool { transition: none; }
    }
  }
}
@keyframes orb-tap {
  0% { transform: translateX(-50%); }
  30% { transform: translateX(-50%) translateY(-9px) scale(1.12) rotate(-10deg); }
  60% { transform: translateX(-50%) translateY(0) scale(.94) rotate(6deg); }
  100% { transform: translateX(-50%); }
}
@keyframes nameplate-tap {
  0% { transform: translateX(-50%); }
  35% { transform: translateX(-50%) translateY(-4px) scale(1.08); }
  100% { transform: translateX(-50%); }
}
@media (prefers-reduced-motion: reduce) {
  .theater .host-orb.tapped, .theater .actor-position.tapped .nameplate { animation: none; }
}
</style>
