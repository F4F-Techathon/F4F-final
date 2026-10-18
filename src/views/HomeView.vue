<template>
  <section class="home-page">
    <header class="home-header"><div class="brand"><span class="brand-mark"><AppIcon name="fork" :size="19" /></span><b>{{ APP_NAME }}</b></div></header>
    <div class="hero-copy"><h1>饭店<span>请就位</span></h1><p>菜还没上，<strong>好戏先开场。</strong></p></div>
    <div class="hero-world"><MiniCity /><div class="speech speech-left" lang="yue">嚟食好嘢啦！<i></i></div><div class="speech speech-right" lang="fr">Bon appétit !<i></i></div><span class="twinkle">✧</span><div class="character character-hua"><CharacterAvatar character="hua" state="happy" name="华叔" /><span class="name green">华叔</span></div><div class="character character-pierre"><CharacterAvatar character="pierre" name="Pierre" /><span class="name purple">Pierre</span></div><div class="character character-rong"><CharacterAvatar character="rong" state="speaking" name="蓉姐" /><span class="name red">蓉姐</span></div><div class="world-base"></div></div>
    <div class="home-bottom"><button class="btn btn-primary start-button" @click="start"><AppIcon name="ticket" />开始选餐<AppIcon name="arrow" /></button></div>
  </section>
</template>
<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useDiningStore } from '@/stores/dining'
import { APP_NAME } from '@/data/app'
import AppIcon from '@/components/AppIcon.vue'
import CharacterAvatar from '@/components/CharacterAvatar.vue'
import MiniCity from '@/components/MiniCity.vue'
const router = useRouter(), store = useDiningStore()
// Starts a fresh dining flow from the home page.
function start() { store.begin(); router.push('/input') }
</script>
<style lang="less" scoped>
.home-page { min-height: 100dvh; display: flex; flex-direction: column; overflow: hidden; background: radial-gradient(ellipse at 50% 46%, #fffbf3 0, #f5eee300 60%);
  .home-header { display: flex; align-items: center; padding: calc(22px + env(safe-area-inset-top)) var(--inset-right) 0 var(--inset-left); .brand { display: flex; align-items: center; gap: 8px; .brand-mark { background: var(--red); color: var(--cream); width: 29px; height: 32px; display: grid; place-items: center; border-radius: 9px 9px 12px 12px; transform: rotate(-7deg); } b { font-size: var(--heading-size); } } }
  .hero-copy { text-align: center; padding: clamp(24px, 5dvh, 64px) var(--page-gutter) 0; z-index: 2;  h1 { position: relative; font-family: var(--font-display); font-size: var(--hero-size); line-height: var(--line-heading); letter-spacing: var(--tracking-display); margin: 17px 0 12px; font-weight: var(--weight-regular); text-shadow: 1px 3px 0 #e3b04b77; span { color: var(--red); } } p { margin: 0; font-size: var(--body-size); color: #665365; strong { color: var(--ink); font-weight: var(--weight-semibold); } } }
  .hero-world { position: relative; --side-width: clamp(112px, 32vw, 230px); --center-width: clamp(140px, 38vw, 270px); width: min(100%, 760px); align-self: center; height: clamp(320px, 50dvh, 640px); flex: 1; min-height: 320px; max-height: 680px; margin-top: 15px; transform: translateY(clamp(-24px, -2.5dvh, -12px)); .mini-city { position: absolute; width: 120%; height: 100%; left: -10%; top: -32px; }  .speech { position: absolute; padding: 9px 10px; border-radius: 12px; background: #fffbf4; border: 1px solid #d8cbb9; font-size: var(--label-size); box-shadow: 0 3px 0 #e6dccd; z-index: 4; i { position: absolute; bottom: -5px; width: 8px; height: 8px; background: #fffbf4; border-bottom: 1px solid #d8cbb9; border-right: 1px solid #d8cbb9; transform: rotate(45deg); left: 28px; } &.speech-left { left: 4%; bottom: calc(var(--side-width) * 210 / 137 + 44px); transform: rotate(-6deg); color: var(--red); } &.speech-right { right: 3%; bottom: calc(var(--side-width) * 210 / 137 + 64px); transform: rotate(5deg); color: #7a5a9e; i { left: auto; right: 26px; } } } .character { position: absolute; height: calc(var(--side-width) * 210 / 137); width: var(--side-width); bottom: 20px; z-index: 3; .name { display: flex; flex-direction: column; align-items: center; gap: 3px; margin: -7px auto 0; font-weight: var(--weight-semibold); font-size: var(--label-size); &.green { color: var(--green); } &.red { color: var(--red); } &.purple { color: #7a5a9e; } } &.character-hua { left: 3%; transform: rotate(-3deg); bottom: 34px; } &.character-pierre { right: 3%; bottom: 33px; transform: rotate(3deg); } &.character-rong { width: var(--center-width); height: calc(var(--center-width) * 243 / 160); left: 50%; transform: translateX(-50%); bottom: 14px; z-index: 4; } } .world-base { position: absolute; bottom: 27px; left: 8%; width: 84%; height: 34px; background: #b3ad8b20; filter: blur(12px); border-radius: 50%; } .twinkle { position: absolute; color: var(--gold); left: 22px; top: 56px; font-size: 27px; } }
  .home-bottom { margin-top: auto; z-index: 5; text-align: center; width: 100%; max-width: 680px; margin-inline: auto; padding: clamp(20px, 3dvh, 32px) var(--inset-right) calc(28px + env(safe-area-inset-bottom)) var(--inset-left);   .start-button { box-shadow: 0 4px 0 #c28e32, 0 9px 21px #b0893d22; .app-icon:last-child { margin-left: auto; } .app-icon:first-child { margin-right: auto; } }   }
}
</style>
