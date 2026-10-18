<template>
  <header class="appbar">
    <div class="brand"><span class="mark"></span><b>饭店请就位</b><span>导演台</span></div>
    <nav class="tabs" aria-label="页面">
      <button v-for="tab in TABS" :key="tab.id" type="button" :class="{ on: current === tab.id }" :aria-current="current === tab.id ? 'page' : undefined" @click="go(tab.id)">{{ tab.zh }}</button>
    </nav>
    <div class="bar-right">
      <button class="status" type="button" :title="statusTitle" @click="go('system')">
        <span class="svc" :class="relayClass"><i></i>中继</span>
        <span class="svc" :class="phoneClass"><i></i>{{ phoneLabel }}</span>
        <span class="svc" :class="service.status ? (service.status.jev.configured ? 'ok' : 'warn') : ''"><i></i>Jev</span>
        <span class="svc" :class="service.status ? (service.status.llm.configured ? 'ok' : 'warn') : ''"><i></i>意图</span>
        <span class="svc" :class="service.status ? (voice.on ? 'ok' : 'warn') : ''"><i></i>{{ voice.on ? '语音' : '语音未接入' }}</span>
      </button>
    </div>
  </header>
  <LiveView v-show="current === 'live'" class="view" :active="current === 'live'" />
  <LibraryView v-if="visited.library" v-show="current === 'library'" class="view" :active="current === 'library'" :focus="focus" />
  <SystemView v-if="visited.system" v-show="current === 'system'" class="view" :active="current === 'system'" />
  <PopoverHost />
  <DialogHost />
  <div v-if="toastState.text" :key="toastState.key" class="toast" :class="toastState.tone" role="status">{{ toastState.text }}</div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { useDirector } from './core/director.ts'
import { FEED_LABELS } from './core/labels.ts'
import { service, voiceOf, watchStatus } from './core/status.ts'
import LibraryView from './library/LibraryView.vue'
import LiveView from './live/LiveView.vue'
import SystemView from './system/SystemView.vue'
import DialogHost from './ui/DialogHost.vue'
import PopoverHost from './ui/PopoverHost.vue'
import { closePopover } from './ui/popover.ts'
import { toastState } from './ui/toast.ts'

// The stage's test console, in agent-studio's three pages: 演播 (write and direct the lines the phone performs),
// 资产 (every character and its assets) and 系统 (architecture, registry, Jev check). The URL hash keeps the page.
type Tab = 'live' | 'library' | 'system'
const TABS: { id: Tab; zh: string }[] = [{ id: 'live', zh: '演播' }, { id: 'library', zh: '资产' }, { id: 'system', zh: '系统' }]
const director = useDirector()
watchStatus()

// #library/<character id> opens that character's assets.
function parse(): { tab: Tab; focus: string } {
  const [tab = 'live', ...rest] = location.hash.replace(/^#/, '').split('/')
  return { tab: (TABS.some((item) => item.id === tab) ? tab : 'live') as Tab, focus: decodeURIComponent(rest.join('/')) }
}
const initial = parse()
const current = ref<Tab>(initial.tab)
const focus = ref(initial.focus)
// Pages are built the first time they are opened, and then kept.
const visited = reactive({ library: current.value === 'library', system: current.value === 'system' })
function apply() {
  const next = parse()
  current.value = next.tab
  focus.value = next.focus
  if (next.tab !== 'live') visited[next.tab] = true
  closePopover()
}
function go(tab: Tab) { location.hash = tab === 'live' ? '' : `#${tab}`; apply() }
window.addEventListener('hashchange', apply)
onBeforeUnmount(() => window.removeEventListener('hashchange', apply))

const relayClass = computed(() => (director.status.value === 'open' ? 'ok' : director.status.value === 'closed' ? 'bad' : 'warn'))
const phones = computed(() => director.peers.value?.app ?? 0)
const agentsOn = computed(() => !!service.status?.agents?.reachable)
const voice = computed(() => voiceOf(service.status))
const phoneClass = computed(() => (phones.value === 1 ? 'ok' : 'warn'))
const phoneLabel = computed(() => (phones.value > 1 ? `手机 ×${phones.value}` : phones.value ? '手机' : '手机未连'))
const statusTitle = computed(() => [
  `舞台中继：${FEED_LABELS[director.status.value]}`,
  `手机：${phones.value} 台在线`,
  service.status ? `Jev：${service.status.jev.configured ? service.status.jev.model : '未配置（关键词基线）'}` : service.error || '服务状态读取中',
  service.status ? `意图解析：${service.status.llm.configured ? service.status.llm.model : '未配置'}` : '',
  service.status ? `多智能体后端：${agentsOn ? `在线 · ${service.status.agents!.model ?? '模型未配置'}` : '未连接（辩论台由导演台驱动）'}` : '',
  service.status ? `语音：${voice.value.on ? voice.value.name : '未接入'}` : '',
  '点开系统页看详情',
].filter(Boolean).join('\n'))
</script>
