<template>
  <section v-if="winner" class="result-page">
    <NavHeader title="今晚的选择" @back="router.push('/debate')" />
    <div class="winner-scene">
      <div class="winner-spotlight" aria-hidden="true"></div>
      <h2>今晚，就吃这一家。</h2>
      <div class="celebration-stage">
        <div class="stage-glow" aria-hidden="true"></div>
        <div class="celebration-ring" aria-hidden="true"></div>
        <div class="laurel left" aria-hidden="true">❧</div>
        <div class="laurel right" aria-hidden="true">❧</div>
        <div class="winner-avatar"><div class="winner-cheer"><HostAvatar :restaurant="winner" state="happy" motion="hop" /></div></div>
        <div class="podium" aria-hidden="true"></div>
        <div class="medal" aria-hidden="true"><AppIcon name="trophy" :size="18" /></div>
        <div class="confetti-layer" aria-hidden="true">
          <span v-for="(piece, index) in confetti" :key="index" class="confetti-flight" :style="piece"><i class="confetti-piece"></i></span>
        </div>
      </div>
    </div>
    <div class="result-content">
      <div class="winner-card">
        <h3>{{ winner.name }}</h3>
        <p>{{ winner.cuisine }} <i>·</i> {{ winner.price ? `¥${winner.price} / 人` : '价格待确认' }} <i>·</i> {{ store.distance(winner.id) }} km</p>
        <div class="chips"><span v-for="tag in winner.tags" :key="tag" class="chip green">{{ tag }}</span></div>
      </div>
    </div>
    <div class="bottom-action">
      <button class="btn btn-primary" @click="router.push(`/restaurant/${winner.id}`)">查看饭店<AppIcon name="arrow" :size="20" /></button>
      <div class="secondary-actions">
        <button class="text-btn" @click="compareOpen = true">再比较一下</button>
        <span aria-hidden="true"></span>
        <button class="text-btn" @click="router.push('/pick')">再挑挑饭店</button>
      </div>
    </div>
    <ComparisonSheet :open="compareOpen" @close="compareOpen = false" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDiningStore } from '@/stores/dining'
import NavHeader from '@/components/NavHeader.vue'
import HostAvatar from '@/components/HostAvatar.vue'
import AppIcon from '@/components/AppIcon.vue'
import ComparisonSheet from '@/components/ComparisonSheet.vue'

const store = useDiningStore(), router = useRouter()
const winner = computed(() => store.winner), compareOpen = ref(false)
const colors = ['#c9483e', '#e3b04b', '#2f6e62', '#a18bb8', '#eed49d']

// Staggered trajectories keep the celebration flowing without restarting on ordinary page updates.
const confetti = Array.from({ length: 40 }, (_, index) => {
  const direction = index % 2 === 0 ? 1 : -1
  return {
    '--origin': direction === 1 ? '7%' : '93%',
    '--flight-x': `${direction * (85 + index * 47 % 235)}px`,
    '--rise-y': `${-125 - index * 29 % 170}px`,
    '--fall-y': `${80 + index * 17 % 100}px`,
    '--delay': `${.45 + index % 10 * .045 + (index >= 20 ? .55 : 0)}s`,
    '--duration': `${2.4 + index % 6 * .16}s`,
    '--spin': `${direction * (380 + index * 47 % 450)}deg`,
    '--piece-color': colors[index % colors.length],
    '--piece-width': `${5 + index % 3 * 2}px`,
    '--piece-height': `${7 + index % 4 * 2}px`,
    '--piece-radius': index % 5 === 0 ? '50%' : '1px',
  }
})
</script>

<style lang="less" scoped>
.result-page {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;

  .winner-scene {
    --winner-height: clamp(221px, min(35vw, 32dvh), 335px);
    position: relative;
    isolation: isolate;
    display: flex;
    flex: 1 0 auto;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: clamp(314px, 44dvh, 520px);
    padding: 20px 0 14px;
    text-align: center;
    overflow: hidden;
    background: radial-gradient(ellipse at 50% 82%, #e8ce8e55, #f5eee300 70%);

    .winner-spotlight {
      position: absolute;
      z-index: -1;
      inset: 0 10%;
      background: linear-gradient(#e3b04b00, #e3b04b2b);
      clip-path: polygon(40% 0, 60% 0, 100% 100%, 0 100%);
      transform-origin: 50% 0;
      animation: spotlight-open 1.4s ease-out both, spotlight-sway 7s ease-in-out 1.4s infinite;
    }

    >h2 {
      position: relative;
      z-index: 2;
      margin: 0 20px 16px;
      font-family: var(--font-display);
      font-size: var(--title-size);
      font-weight: var(--weight-regular);
      letter-spacing: var(--tracking-display);
      animation: celebration-reveal .9s ease-out .1s both;
    }

    .celebration-stage {
      position: relative;
      flex: none;
      width: 100%;
      max-width: 680px;
      height: calc(var(--winner-height) + 32px);

      .stage-glow, .celebration-ring {
        position: absolute;
        left: 50%;
        bottom: 30px;
        width: min(70%, 340px);
        aspect-ratio: 1;
        border-radius: 50%;
        pointer-events: none;
      }

      .stage-glow {
        background: radial-gradient(circle, #f6e3a985, #f6e3a900 72%);
        transform: translateX(-50%);
        animation: glow-arrive 1.8s ease-out .25s both, glow-breathe 5s ease-in-out 2.05s infinite;
      }

      .celebration-ring {
        border: 1px solid #d7ae59;
        opacity: 0;
        animation: celebration-ring 3.8s ease-out .55s infinite both;
      }

      .winner-avatar {
        position: absolute;
        z-index: 3;
        bottom: 10px;
        left: 50%;
        width: calc(var(--winner-height) * 420 / 640);
        height: var(--winner-height);
        transform: translateX(-50%);
        animation: winner-arrive 1.1s cubic-bezier(.22, .8, .25, 1) .15s both;

        .winner-cheer {
          width: 100%;
          height: 100%;
          transform-origin: 50% 95%;
          animation: winner-cheer 4.6s ease-in-out 1.3s infinite;
        }
      }

      .podium {
        position: absolute;
        bottom: 0;
        left: 50%;
        width: min(52%, 420px);
        height: 32px;
        border-top: 5px solid #ecdab4;
        border-radius: 50%;
        background: #dcc591;
        transform: translateX(-50%);
      }

      .medal {
        position: absolute;
        z-index: 5;
        bottom: 3px;
        left: calc(50% - 19px);
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        border: 3px solid #f2d796;
        border-radius: 50%;
        background: var(--gold);
        color: #8c6428;
        animation: celebration-reveal .8s ease-out .55s both;
      }

      .laurel {
        position: absolute;
        bottom: 30px;
        color: #c5ad7480;
        font-size: 92px;
        animation: laurel-reveal 1.2s ease-out .3s both;
        &.left { left: calc(50% - min(40%, 270px)); transform: rotate(-40deg); }
        &.right { right: calc(50% - min(40%, 270px)); transform: scaleX(-1) rotate(-40deg); }
      }

      .confetti-layer {
        position: absolute;
        z-index: 4;
        inset: 0;
        pointer-events: none;

        .confetti-flight {
          position: absolute;
          bottom: 16%;
          left: var(--origin);
          opacity: 0;
          animation: confetti-flight var(--duration) linear var(--delay) infinite both;

          .confetti-piece {
            display: block;
            width: var(--piece-width);
            height: var(--piece-height);
            border-radius: var(--piece-radius);
            background: var(--piece-color);
            animation: confetti-flutter var(--duration) ease-in-out var(--delay) infinite both;
          }
        }
      }
    }
  }

  .result-content {
    flex: none;
    width: 100%;
    max-width: var(--content-width);
    margin: 0 auto;
    padding: 0 var(--inset-right) 22px var(--inset-left);
    animation: celebration-reveal .85s ease-out .4s both;

    .winner-card {
      position: relative;
      border: 1px solid #cfb785;
      border-radius: 19px;
      padding: 21px 18px;
      background: var(--paper);
      box-shadow: 0 4px 0 #e3d6c144;
      text-align: center;
      h3 { margin: 4px 0 8px; font-size: var(--title-size); }
      >p {
        margin: 0 0 16px;
        color: #857165;
        font-size: var(--label-size);
        i { padding: 0 7px; color: #bea68b; font-style: normal; }
      }
      .chips { justify-content: center; gap: 5px; .chip { padding: 6px 9px; font-size: var(--small-size); } }
    }
  }

  .bottom-action {
    flex-shrink: 0;
    text-align: center;
    .secondary-actions {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 16px;
      padding-top: 5px;
      .text-btn { min-height: 44px; }
      >span { width: 1px; height: 9px; background: #c5b9a7; }
    }
  }

  @keyframes celebration-reveal { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes laurel-reveal { from { opacity: 0; } to { opacity: 1; } }
  @keyframes spotlight-open { from { opacity: 0; transform: scaleX(.45); } to { opacity: 1; transform: scaleX(1); } }
  @keyframes spotlight-sway {
    0%, 100% { transform: rotate(0) scaleX(1); opacity: 1; }
    30% { transform: rotate(-4deg) scaleX(.95); opacity: .82; }
    70% { transform: rotate(4deg) scaleX(1.04); opacity: .92; }
  }
  @keyframes glow-arrive { from { opacity: 0; transform: translateX(-50%) scale(.65); } to { opacity: 1; transform: translateX(-50%) scale(1); } }
  @keyframes glow-breathe {
    0%, 100% { opacity: 1; transform: translateX(-50%) scale(1); }
    50% { opacity: .7; transform: translateX(-50%) scale(1.07); }
  }
  @keyframes celebration-ring {
    0% { opacity: 0; transform: translateX(-50%) scale(.45); }
    20% { opacity: .5; }
    100% { opacity: 0; transform: translateX(-50%) scale(1.25); }
  }
  @keyframes winner-arrive { from { opacity: 0; transform: translateX(-50%) translateY(20px) scale(.94); } to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } }
  @keyframes winner-cheer {
    0%, 15%, 52%, 100% { transform: translateY(0) rotate(0) scale(1); }
    28% { transform: translateY(-9px) rotate(-2deg) scale(1.01); }
    38% { transform: translateY(0) rotate(1deg) scale(1.02, .98); }
    70% { transform: translateY(-6px) rotate(2deg) scale(1.01); }
    82% { transform: translateY(0) rotate(-1deg) scale(1.015, .985); }
  }
  @keyframes confetti-flight {
    0% { opacity: 0; transform: translate(0, 0) scale(.6); animation-timing-function: cubic-bezier(.16, .7, .36, 1); }
    12% { opacity: .9; }
    45% { opacity: .9; transform: translate(calc(var(--flight-x) * .6), var(--rise-y)) scale(1); animation-timing-function: cubic-bezier(.45, 0, .75, .5); }
    75% { opacity: .8; }
    100% { opacity: 0; transform: translate(var(--flight-x), var(--fall-y)) scale(.8); }
  }
  @keyframes confetti-flutter {
    0% { transform: rotate(0) scaleX(1); }
    35% { transform: rotate(calc(var(--spin) * .35)) scaleX(.3); }
    65% { transform: rotate(calc(var(--spin) * .65)) scaleX(1); }
    100% { transform: rotate(var(--spin)) scaleX(.5); }
  }

  @media (prefers-reduced-motion: reduce) {
    .winner-scene .celebration-stage { .confetti-layer, .celebration-ring { display: none; } }
  }
}
</style>
