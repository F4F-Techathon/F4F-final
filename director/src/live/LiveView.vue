<template>
  <div class="live">
    <div class="main">
      <StageMonitor />
      <AgentDock />
      <EventsPanel />
    </div>
    <ConvoPanel ref="convo" />
    <Inspector />
    <AddAgentDialog />
  </div>
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { watchAutosave, watchPlayAll } from './actions.ts'
import AddAgentDialog from './AddAgentDialog.vue'
import AgentDock from './AgentDock.vue'
import ConvoPanel from './ConvoPanel.vue'
import EventsPanel from './EventsPanel.vue'
import Inspector from './Inspector.vue'
import StageMonitor from './StageMonitor.vue'
import { live, useLive } from './state.ts'

// 演播: agent-studio's live console with the stage on the phone. Left: the stage monitor, the dock and the
// event log; right: the conversation; the inspector opens beside it.
const props = defineProps<{ active: boolean }>()
const { speakers, setSpeaker, quoteRecent } = useLive()
const convo = ref<InstanceType<typeof ConvoPanel>>()
watchPlayAll()
watchAutosave()
watch(() => props.active, (active) => { if (!active) { live.inspecting = null; live.editing = null } })

// Alt+1…9 picks who speaks next (in the dock's order), Alt+↑ answers the latest line too.
function keys(event: KeyboardEvent) {
  if (!props.active || !event.altKey || event.metaKey || event.ctrlKey || live.editing || live.adding) return
  const digit = /^Digit([1-9])$/.exec(event.code)
  if (digit) {
    const id = speakers.value[Number(digit[1]) - 1]
    if (id) { event.preventDefault(); setSpeaker(id); convo.value?.focus() }
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    quoteRecent()
  }
}
onMounted(() => window.addEventListener('keydown', keys))
onBeforeUnmount(() => window.removeEventListener('keydown', keys))
</script>
