<template>
  <aside class="convo" aria-label="会话">
    <div class="convo-h">
      <button ref="sessBtn" class="sesstitle" type="button" title="保存、载入、导出会话" @click="sessions">
        <h2>会话</h2><small class="sessname">{{ live.session.name }}</small><span class="chev"><Icon name="down" /></span>
      </button>
      <span class="sp"></span>
      <button class="btn sm playall" :class="{ on: running }" type="button" :title="running ? '停止：手机停下并丢掉排队的台词' : '从会话开头的阵容起，把每句台词和走台再演一遍'" @click="toggle">
        <Icon :name="running ? 'stop' : 'playall'" />{{ running ? '停止' : '播放全部' }}
      </button>
    </div>
    <div ref="thread" class="thread" @scroll.passive="onScroll">
      <div v-if="!items.length" class="empty">
        <b>开始一场路演</b>选择角色，输入台词，回车即演
        <div v-if="restore" class="restore">
          <button class="btn sm" type="button" @click="loadSession(restore)">恢复上次会话 · {{ restoreLines }} 句</button>
          <button class="btn sm ghost" type="button" @click="loadSession(restore, true)">恢复并播放</button>
        </div>
      </div>
      <template v-for="item in items" :key="item.key">
        <div v-if="item.type === 'clear'" class="divider">舞台已清空</div>
        <StageRow v-else-if="item.type === 'stage'" :item="item" />
        <MessageCard v-else :item="item" :start="start" />
      </template>
    </div>
    <Composer ref="composer" />
  </aside>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useDirector } from '../core/director.ts'
import Icon from '../ui/Icon.vue'
import { openPopover } from '../ui/popover.ts'
import { lastAutosave, loadSession, playAll, stopAll } from './actions.ts'
import Composer from './Composer.vue'
import MessageCard from './MessageCard.vue'
import SessionMenu from './SessionMenu.vue'
import StageRow from './StageRow.vue'
import { live } from './state.ts'

// The conversation column: 会话 ▾ and play-all / stop, the thread, the composer.
const director = useDirector()
const sessBtn = ref<HTMLElement>(), thread = ref<HTMLElement>(), composer = ref<InstanceType<typeof Composer>>()
const items = computed(() => director.state.timeline)
const start = computed(() => director.state.timeline[0]?.at ?? Date.now())
const running = computed(() => live.playing || director.busy.value)
const restore = computed(() => (items.value.length ? null : lastAutosave()))
const restoreLines = computed(() => restore.value?.items.filter((item) => item.kind === 'line').length ?? 0)

function sessions() { if (sessBtn.value) openPopover(sessBtn.value, { component: SessionMenu, className: 'sess' }) }
function toggle() { void (running.value ? stopAll() : playAll()) }

// The thread follows new lines only while the reader is near the bottom.
let follow = true
function onScroll() {
  const el = thread.value
  if (el) follow = el.scrollHeight - el.scrollTop - el.clientHeight < 120
}
watch(() => items.value.length, async () => {
  if (!follow) return
  await nextTick()
  thread.value?.scrollTo({ top: thread.value.scrollHeight, behavior: 'smooth' })
})

defineExpose({ focus: () => composer.value?.focus() })
</script>
