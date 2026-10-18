<template>
  <section class="panel events collapsible" :class="{ collapsed: !open }">
    <div class="panel-h" role="button" tabindex="0" :aria-expanded="open" @click="toggle" @keydown.enter.self="toggle">
      <span class="chev"><Icon name="chev" /></span>
      <h3>事件</h3>
      <small>{{ eventLog.items.length }} 条</small>
      <span v-if="!open && last" class="ev-last dim">{{ last.type }}{{ last.who ? ` · ${nameOf(last.who)}` : '' }}</span>
      <span class="sp"></span>
      <button v-if="open" class="iconbtn sm" type="button" title="清空事件" @click.stop="clearEvents()"><Icon name="trash" /></button>
    </div>
    <div class="buslog">
      <div v-for="event in eventLog.items" :key="event.n" class="ev" :class="{ quiet: QUIET.test(event.type) }" :style="event.who ? { '--c': colorOf(event.who) } : undefined">
        <span class="t">{{ event.t.toFixed(2) }}</span>
        <code :title="event.type">{{ event.type }}</code>
        <b>{{ event.who ? nameOf(event.who) : '' }}</b>
        <span :title="event.detail">{{ event.detail }}</span>
      </div>
      <div v-if="!eventLog.items.length" class="dim" style="padding: 6px 8px">还没有事件：发一句台词试试</div>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { clearEvents, eventLog } from '../core/events.ts'
import Icon from '../ui/Icon.vue'
import { useLive } from './state.ts'

// The message bus, newest first: relay and phone state, each line's way through queue → Jev → stage,
// stage directions, generation steps. Folded by default; the choice is remembered.
const KEY = 'director.events.open'
const QUIET = /^(relay|phone)\./
const { character, colorOf } = useLive()
const open = ref(read())
const last = computed(() => eventLog.items[0])
const nameOf = (id: string) => character(id).name

function read() { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
function toggle() {
  open.value = !open.value
  try { localStorage.setItem(KEY, open.value ? '1' : '0') } catch { /* only a convenience */ }
}
</script>
