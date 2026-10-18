<template>
  <main class="app-shell">
    <div v-if="offline" class="network-notice"><AppIcon name="wifi" :size="15" />网络已断开，已保存的选餐仍可继续</div>
    <RouterView v-slot="{ Component }">
      <Transition name="page" :css="!entrance.active && !pickerArrival.active">
        <component :is="Component" :key="route.path" :inert="entrance.active || pickerArrival.active || undefined" />
      </Transition>
    </RouterView>
    <SharedGuideOrb :suspended="entrance.active" />
    <OpeningSequence v-if="entrance.active" @covered="enterTheater" />
    <Transition name="toast"><div v-if="store.toast" class="toast-message" role="status">{{ store.toast }}</div></Transition>
  </main>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createMessageId, type AppPhase, type CastEntry } from '@/agents/feed/protocol'
import { performers } from '@/agents/stage/lineup'
import { agentReport } from '@/agents/stage/report'
import { useCastStore } from '@/stores/cast'
import { useDiningStore } from '@/stores/dining'
import { useEntranceStore } from '@/stores/entrance'
import { usePickerArrivalStore } from '@/stores/pickerArrival'
import { useStageStore } from '@/stores/stage'
import AppIcon from '@/components/AppIcon.vue'
import OpeningSequence from '@/components/OpeningSequence.vue'
import SharedGuideOrb from '@/components/SharedGuideOrb.vue'
const store = useDiningStore(), offline = ref(!navigator.onLine)
const entrance = useEntranceStore(), router = useRouter(), route = useRoute()
const pickerArrival = usePickerArrivalStore()
const cast = useCastStore(), stage = useStageStore()

// Whoever writes the stage's lines (the test console, later the multi-agent backend) sees where the
// user is, how far each invited host's generation has got, and who stands on stage, guests included.
const PHASES: Record<string, AppPhase> = { '/': 'home', '/input': 'input', '/pick': 'pick', '/debate': 'debate', '/result': 'result' }
const STEP_ZH: Record<string, string> = { look: '形象', accent: '口音', assets: '组件' }
const phase = computed<AppPhase>(() => route.path.startsWith('/restaurant/') ? 'detail' : entrance.active ? 'opening' : PHASES[route.path] || 'home')
const castEntries = computed<CastEntry[]>(() => {
  const standing = new Set(performers(stage.lineup, store.selected.map((restaurant) => restaurant.id)))
  const hosts = store.selected.map((restaurant): CastEntry => {
    const status = cast.statusOf(restaurant), contract = cast.contractOf(restaurant), step = cast.stepOf(restaurant)
    return {
      id: restaurant.id, name: cast.hostNameOf(restaurant), restaurant: restaurant.name, color: restaurant.color,
      status: status === 'queued' ? 'generating' : status, kind: 'host', onStage: standing.has(restaurant.id), ...(step ? { step: STEP_ZH[step] } : {}),
      ...(contract ? { greeting: contract.greeting, look: { ...contract.rig, logo: undefined } } : {}), evidenceIds: restaurant.evidenceIds,
    }
  })
  // Guests on stage first, so a long line of guests in the wings never pushes them out of the snapshot.
  const guests = [...stage.lineup.guests].sort((a, b) => Number(b.onStage) - Number(a.onStage)).map((guest): CastEntry => ({
    id: guest.id, name: guest.name, restaurant: guest.restaurant, color: guest.color, status: 'ready', kind: 'guest', onStage: guest.onStage,
    ...(guest.greeting ? { greeting: guest.greeting } : {}), look: { ...guest.look, logo: undefined },
  }))
  return [...hosts, ...guests].slice(0, 16)
})
watch([phase, castEntries], () => stage.snapshot(phase.value, castEntries.value), { immediate: true })
// Lines are performed only on the debate page; elsewhere they wait, and the console is told why.
const PAGE_ZH: Record<AppPhase, string> = { home: '首页', input: '说需求', pick: '滑卡选店', opening: '开场动画', debate: '辩论', result: '已做决定', detail: '餐厅详情' }
watch(phase, (value) => { stage.holdPage = value === 'debate' ? '' : `手机在「${PAGE_ZH[value]}」页，进入辩论后才开演` }, { immediate: true })
// Every host generated so far goes to the console's asset library, invited or not; an invited host as it looks in
// this line-up (a chain's second branch sends its crew, see cast.contractOf), so the library matches the stage.
watch(() => Object.entries(cast.entries).flatMap(([id, entry]) => {
  if (entry.status !== 'ready' || !entry.contract) return []
  const restaurant = store.selected.find((item) => item.id === id)
  return [(restaurant && cast.contractOf(restaurant)) || entry.contract]
}),
  (contracts) => { for (const contract of contracts) stage.publishAgent(agentReport(contract)) }, { immediate: true })
// Lines already performed before a reload never come back, whichever page the replay reaches first.
onMounted(() => { stage.markPerformed(store.history.map((entry) => entry.id)); stage.connect() })

// The page changes only under an opaque cover; the mounted stage then owns the reveal.
async function enterTheater() {
  const scene = entrance.scene
  if (!store.startDebate()) { entrance.finish(); return }
  // A new debate starts with exactly the shops just picked: whoever an earlier debate in this tab sent off (or a guest
  // it brought on) is back to normal, and lines still queued from it are dropped.
  stage.applyCue({ kind: 'cast', id: createMessageId('stage'), act: 'reset' }, store.selectedIds)
  stage.clearQueue('新的一场开始了')
  try {
    await router.push('/debate')
    await nextTick()
    if (entrance.scene !== scene) return
    if (route.path === '/debate') entrance.reveal()
    else entrance.finish()
  } catch {
    entrance.finish()
    store.notify('开场没有加载成功，点一下可以重试')
  }
}

// Browser back or an unrelated route cancels the visual sequence immediately.
watch(() => route.path, (path) => {
  if (entrance.active && path !== '/pick' && !(path === '/debate' && entrance.phase !== 'map')) entrance.finish()
})
function updateNetwork() { offline.value = !navigator.onLine }
window.addEventListener('online', updateNetwork); window.addEventListener('offline', updateNetwork)
onBeforeUnmount(() => { window.removeEventListener('online', updateNetwork); window.removeEventListener('offline', updateNetwork) })
</script>
<style lang="less" scoped>
.app-shell { position: relative; margin: 0 auto; width: 100%; max-width: var(--app-max-width); min-width: 0; min-height: 100dvh; background: var(--cream); box-shadow: 0 0 100px #3a283a15; .network-notice { position: sticky; top: 0; z-index: 99; display: flex; justify-content: center; gap: 6px; background: #f2ddbb; padding: 9px 10px; font-size: var(--small-size); } .toast-message { position: fixed; bottom: calc(105px + env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); width: max-content; max-width: min(calc(100vw - 40px), 560px); background: #2b1b30ed; color: var(--paper); font-size: var(--label-size); line-height: var(--line-compact); padding: 12px 18px; border-radius: 14px; box-shadow: 0 5px 25px #120a1730; z-index: 200; text-align: center; } .toast-enter-active, .toast-leave-active { transition: opacity .2s; } .toast-enter-from, .toast-leave-to { opacity: 0; } }
</style>
