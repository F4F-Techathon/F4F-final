<template>
  <div class="guide-orb" :class="{ listening, thinking, speaking, small, looking: look != null }" :style="look != null ? { '--look': look } : undefined" aria-hidden="true">
    <div class="ring"></div>
    <div class="orb-float">
      <div class="orb">
        <i class="color-sage"></i><i class="color-lilac"></i><i class="color-peach"></i>
        <svg class="face" viewBox="0 0 126 126" fill="none">
          <g class="expression">
            <g class="brows" stroke="#655068" stroke-width="1.6" stroke-linecap="round">
              <path d="M42 47q5-3 9-1" /><path d="M75 46q5-2 9 1" />
            </g>
            <g class="gaze">
              <g class="eye eye-left"><ellipse cx="48" cy="57" rx="3.7" ry="5.5" fill="#4d3c58" /><circle cx="49" cy="55" r="1.1" fill="#fff9ef" /></g>
              <g class="eye eye-right"><ellipse cx="78" cy="57" rx="3.7" ry="5.5" fill="#4d3c58" /><circle cx="79" cy="55" r="1.1" fill="#fff9ef" /></g>
            </g>
            <g class="cheeks" fill="#d997a1"><ellipse cx="37" cy="69" rx="7" ry="3.5" /><ellipse cx="89" cy="69" rx="7" ry="3.5" /></g>
            <path class="smile" d="M55 72q8 10 16 0" stroke="#655068" stroke-width="2" stroke-linecap="round" />
            <ellipse class="listening-mouth" cx="63" cy="75" rx="3.5" ry="4.5" fill="#735371" />
          </g>
        </svg>
        <div class="shine"></div>
      </div>
    </div>
    <div class="shadow"></div>
  </div>
</template>

<script setup lang="ts">
// `speaking` talks (the host's own lines); `look` (-1 left … 1 right) turns the eyes toward whoever is speaking.
defineProps<{ listening?: boolean; thinking?: boolean; speaking?: boolean; small?: boolean; look?: number | null }>()
</script>

<style lang="less" scoped>
.guide-orb {
  position: relative;
  width: 150px;
  height: 150px;
  margin: 0 auto;

  .ring {
    position: absolute;
    inset: 3%;
    border: 1px solid #d0bed677;
    border-radius: 50%;
    animation: orb-ring 6s ease-in-out infinite;
  }

  .orb-float {
    position: absolute;
    inset: 8%;
    animation: orb-float 6s ease-in-out infinite;

    .orb {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      overflow: hidden;
      background: radial-gradient(circle at 30% 20%, #fff6e8 0, #edc7b6 38%, #b8b0da 78%, #8a8fb9 100%);
      box-shadow: inset 7px 9px 16px #fff9, inset -9px -7px 14px #a49bc077, 0 10px 30px #ad9ab940;
      transition: transform .65s ease-in-out, box-shadow .5s;

      >i {
        position: absolute;
        border-radius: 50%;
        filter: blur(10px);
        animation: orb-colors 11s ease-in-out infinite alternate;
        &.color-sage { width: 64%; height: 64%; background: #accbbe; left: 8%; top: 46%; }
        &.color-lilac { width: 72%; height: 64%; background: #bda8d4; left: 42%; top: 14%; animation-delay: -4s; }
        &.color-peach { width: 48%; height: 40%; background: #f6c3ac; left: 11%; top: 13%; animation-delay: -7s; }
      }

      .face {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        overflow: visible;

        .expression {
          transform-origin: 63px 63px;
          animation: orb-expression 9s ease-in-out infinite;

          .brows { opacity: .65; animation: orb-brows 9s ease-in-out infinite; }
          .gaze {
            animation: orb-gaze 8s ease-in-out infinite;
            .eye {
              transform-box: fill-box;
              transform-origin: center;
              animation: orb-blink 6.8s ease-in-out infinite;
              &.eye-left { animation-name: orb-blink-left; }
            }
          }
          .cheeks { opacity: .35; animation: orb-blush 9s ease-in-out infinite; }
          .smile { transform-origin: 63px 72px; animation: orb-smile 9s ease-in-out infinite; transition: opacity .35s; }
          .listening-mouth { opacity: 0; transform-origin: 63px 75px; transition: opacity .35s; }
        }
      }

      .shine {
        position: absolute;
        width: 28%;
        height: 13%;
        top: 9%;
        left: 17%;
        background: #fff7;
        border-radius: 50%;
        filter: blur(5px);
        transform: rotate(-32deg);
      }
    }
  }

  .shadow {
    position: absolute;
    width: 51%;
    height: 7%;
    left: 24.5%;
    bottom: -7%;
    border-radius: 50%;
    background: #7a5a9e25;
    filter: blur(6px);
    animation: orb-shadow 6s ease-in-out infinite;
  }

  &.listening {
    .ring { animation: orb-listening-ring 2.4s ease-out infinite; }
    .orb-float {
      .orb {
        transform: rotate(-5deg) scale(1.02);
        box-shadow: inset 7px 9px 16px #fff9, inset -9px -7px 14px #a49bc077, 0 10px 38px #ad9ab960;
        .face {
          .expression {
            animation-name: orb-listening-expression;
            animation-duration: 3.2s;
            .brows { animation: none; transform: translateY(-3px); opacity: .85; }
            .gaze { animation: none; transform: translate(1px, -1px); }
            .smile { opacity: 0; }
            .listening-mouth { opacity: 1; animation: orb-listening-mouth 2.6s ease-in-out infinite; }
          }
        }
      }
    }
  }

  &.thinking {
    .ring { animation: orb-thinking-ring 2.8s ease-in-out infinite; }
    .orb-float .orb {
      transform: rotate(6deg);
      .face .expression {
        animation: none;
        transform: rotate(3deg);
        .brows { animation: none; transform: translateY(-2px); }
        .gaze { animation: none; transform: translate(2px, -4px); }
        .smile { animation: none; transform: scale(.7, .5); }
      }
    }
  }

  &.looking .orb-float .orb .face .expression .gaze { animation: none; transform: translate(calc(var(--look, 0) * 4px), 1px); transition: transform .45s ease-out; }

  &.speaking {
    .ring { border-color: #f0d9ad99; animation: orb-speaking-ring 1.2s ease-out infinite; }
    .orb-float {
      .orb {
        transform: scale(1.06);
        box-shadow: inset 7px 9px 16px #fff9, inset -9px -7px 14px #a49bc077, 0 0 34px #f3dcb8aa, 0 10px 38px #ad9ab960;
        .face .expression {
          animation-name: orb-listening-expression;
          animation-duration: 2.4s;
          .brows { animation: none; transform: translateY(-2px); opacity: .85; }
          .smile { opacity: 0; }
          .listening-mouth { opacity: 1; animation: orb-talk .26s ease-in-out infinite alternate; }
        }
      }
    }
  }

  &.small {
    width: 46px;
    height: 46px;
    .orb-float { inset: 4%; animation-name: orb-small-float; }
    .ring, .shadow { display: none; }
  }

  @keyframes orb-float { 0%, 100% { transform: translateY(3px) rotate(-3deg); } 45% { transform: translateY(-8px) rotate(4deg); } 75% { transform: translateY(-2px) rotate(-1deg); } }
  @keyframes orb-ring { 0%, 100% { transform: scale(1.04); opacity: .65; } 45% { transform: scale(1.12); opacity: .35; } }
  @keyframes orb-colors { to { transform: translate(-10%, 12%) scale(1.1); } }
  @keyframes orb-expression { 0%, 25%, 70%, 100% { transform: translateY(0) rotate(0); } 38%, 54% { transform: translateY(-2px) rotate(-5deg); } 85% { transform: translateY(1px) rotate(3deg); } }
  @keyframes orb-gaze { 0%, 16%, 47%, 62%, 100% { transform: translate(0, 0); } 25%, 37% { transform: translate(-3px, -1px); } 72%, 86% { transform: translate(3px, 1px); } }
  @keyframes orb-blink { 0%, 19%, 23%, 76%, 80%, 100% { transform: scaleY(1); } 21%, 78% { transform: scaleY(.08); } }
  @keyframes orb-blink-left { 0%, 19%, 23%, 53%, 59%, 76%, 80%, 100% { transform: scaleY(1); } 21%, 55%, 57%, 78% { transform: scaleY(.08); } }
  @keyframes orb-brows { 0%, 25%, 70%, 100% { transform: translateY(0); } 38%, 54% { transform: translateY(-2px); } }
  @keyframes orb-blush { 0%, 25%, 75%, 100% { opacity: .3; } 40%, 60% { opacity: .55; } }
  @keyframes orb-smile { 0%, 25%, 75%, 100% { transform: scale(1); } 40%, 60% { transform: scale(1.12, 1.3); } }
  @keyframes orb-shadow { 0%, 100% { transform: scale(1); opacity: .8; } 45% { transform: scale(.82); opacity: .5; } }
  @keyframes orb-listening-ring { from { transform: scale(.97); opacity: .8; } to { transform: scale(1.25); opacity: 0; } }
  @keyframes orb-listening-expression { 0%, 100% { transform: translateY(-1px) rotate(-4deg); } 50% { transform: translateY(1px) rotate(-1deg); } }
  @keyframes orb-listening-mouth { 0%, 100% { transform: scale(.9, 1); } 50% { transform: scale(1.05, .8); } }
  @keyframes orb-small-float { 0%, 100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-2px) rotate(3deg); } }
  @keyframes orb-thinking-ring { 0%, 100% { transform: scale(1.04); opacity: .3; } 50% { transform: scale(1.17); opacity: .7; } }
  @keyframes orb-speaking-ring { from { transform: scale(1); opacity: .9; } to { transform: scale(1.3); opacity: 0; } }
  @keyframes orb-talk { from { transform: scale(1.1, .35); } to { transform: scale(.95, 1.15); } }
}
</style>
