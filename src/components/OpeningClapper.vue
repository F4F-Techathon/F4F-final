<template>
  <button class="opening-clapper" :class="{ 'is-playing': playing }" :disabled="disabled || playing"
    :aria-busy="playing" aria-label="合板开场，进入舞台" @click="$emit('clap')">
    <span class="clapper-board" aria-hidden="true">
      <span class="clapper-arm"><i></i></span>
      <span class="clapper-body">
        <span class="clapper-stripe"></span>
        <span class="clapper-face"><span class="board-title">{{ APP_NAME }}</span><span class="board-action">开场<AppIcon name="arrow" :size="17" /></span></span>
      </span>
    </span>
  </button>
</template>

<script setup lang="ts">
import { APP_NAME } from '@/data/app'
import AppIcon from './AppIcon.vue'

defineProps<{ playing: boolean; disabled?: boolean }>()
defineEmits<{ clap: [] }>()
</script>

<style lang="less" scoped>
.opening-clapper {
  display: block;
  width: min(100%, 320px);
  padding: 128px 8px 22px;
  border: 0;
  border-radius: 20px;
  background: transparent;
  color: var(--paper);
  -webkit-user-select: none;
  user-select: none;

  .clapper-board {
    position: relative;
    display: block;
    transform: rotate(-5deg);
    transform-origin: 50% 75%;
    filter: drop-shadow(0 16px 18px #4c354025);

    .clapper-arm, .clapper-body .clapper-stripe {
      display: block;
      height: 30px;
      background: repeating-linear-gradient(-52deg, #f6ebd8 0 24px, #372c3e 24px 49px);
    }

    .clapper-arm {
      position: absolute;
      z-index: 1;
      top: -28px;
      left: 0;
      width: 100%;
      border: 2px solid #372c3e;
      border-radius: 6px 6px 2px 2px;
      transform: rotate(-12deg);
      transform-origin: 14px calc(100% - 2px);

      i { position: absolute; left: 6px; bottom: 4px; width: 9px; height: 9px; border: 2px solid #594653; border-radius: 50%; background: var(--gold); }
    }

    .clapper-body {
      display: flex;
      flex-direction: column;
      aspect-ratio: 1.5;
      overflow: hidden;
      border: 2px solid #372c3e;
      border-radius: 3px 3px 15px 15px;
      background: #372c3e;
      box-shadow: inset 0 -4px 0 #211728;

      .clapper-stripe { flex: none; border-bottom: 2px solid #372c3e; }

      .clapper-face {
        display: flex;
        flex: 1;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 13px;
        margin: 9px 12px 15px;
        padding: 14px 8px;
        border: 1px solid #e8d8bd66;
        border-radius: 3px 3px 7px 7px;

        .board-title { font-family: var(--font-display); font-size: clamp(28px, 5vw, 36px); letter-spacing: var(--tracking-display); }
        .board-action { display: inline-flex; align-items: center; gap: 7px; color: #e8c883; font-size: var(--label-size); }
      }
    }
  }

  &.is-playing {
    .clapper-board {
      animation: clapper-settle var(--clap-duration) ease-in-out both;
      .clapper-arm { animation: clapper-close var(--clap-duration) cubic-bezier(.45, 0, .25, 1) both; }
    }
  }

  @keyframes clapper-close {
    0% { transform: rotate(-12deg); }
    28% { transform: rotate(-18deg); }
    56% { transform: rotate(0); }
    67% { transform: rotate(-4deg); }
    82%, 100% { transform: rotate(0); }
  }

  @keyframes clapper-settle {
    0%, 48% { transform: rotate(-5deg) translateY(0) scale(1); }
    58% { transform: rotate(-4deg) translateY(5px) scale(.985); }
    82%, 100% { transform: rotate(-3deg) translateY(0) scale(1); }
  }
}
</style>
