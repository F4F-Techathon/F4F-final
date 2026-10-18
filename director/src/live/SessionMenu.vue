<template>
  <div class="pop-h">会话 · {{ live.session.name || '未保存' }}</div>
  <button type="button" :disabled="empty" @click="run(saveCurrent)"><Icon name="save" /><span class="pl"><b>保存</b><small>{{ live.session.name ? `存回「${live.session.name}」` : '起个名字，存进这个浏览器' }}</small></span></button>
  <button type="button" :disabled="empty" @click="run(exportCurrent)"><Icon name="download" /><span class="pl"><b>导出 JSON</b><small>带去别的电脑，或留档</small></span></button>
  <button type="button" @click="file?.click()"><Icon name="folder" /><span class="pl"><b>导入 JSON</b><small>导演台导出的会话文件</small></span></button>
  <input ref="file" type="file" accept="application/json,.json" hidden @change="importFile" />
  <button type="button" class="danger" :disabled="empty" @click="run(clearSession)"><Icon name="trash" /><span class="pl"><b>清空</b><small>清空对话流和手机上排队的台词</small></span></button>
  <div class="pop-sep"></div>
  <div class="pop-h row"><span>已保存的会话</span><span class="sp"></span><label class="switch" title="播放全部演完后从头再来"><input v-model="live.loop" type="checkbox" /><b></b>循环播放</label></div>
  <div class="pop-list">
    <div v-for="session in sessions" :key="session.id" class="sess-row" :class="{ on: session.id === live.session.id }" role="button" tabindex="0" @click="run(() => loadSession(session))">
      <span class="faces"><Face v-for="who in speakersOf(session)" :key="who" :who="who" :size="18" /></span>
      <span class="meta"><b>{{ session.name }}</b><small>{{ lines(session) }} 句 · {{ stamp(session.updated) }}</small></span>
      <button class="iconbtn sm" type="button" title="载入并播放" @click.stop="run(() => loadSession(session, true))"><Icon name="play" /></button>
      <button class="iconbtn sm" :class="{ armed: armed === session.id }" type="button" :title="armed === session.id ? '再点一次删除' : '删除'" @click.stop="del(session)"><Icon name="trash" /></button>
    </div>
    <div v-if="!sessions.length" class="pop-empty dim">还没有保存的会话</div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDirector } from '../core/director.ts'
import type { Session } from '../core/sessions.ts'
import Face from '../ui/Face.vue'
import Icon from '../ui/Icon.vue'
import { closePopover } from '../ui/popover.ts'
import { clearSession, deleteSession, exportCurrent, importSessionFile, listSessions, loadSession, saveCurrent } from './actions.ts'
import { live } from './state.ts'

// 会话 ▾: save, export, import and clear the thread; the saved sessions, each loadable or played at once.
const director = useDirector()
const file = ref<HTMLInputElement>()
const sessions = ref(listSessions())
const empty = computed(() => !director.state.timeline.some((item) => item.type !== 'clear'))
const lines = (session: Session) => session.items.filter((item) => item.kind === 'line').length
const speakersOf = (session: Session) => [...new Set(session.items.flatMap((item) => (item.kind === 'line' ? [item.speaker] : [])))].slice(0, 4)
const stamp = (iso: string) => {
  const date = new Date(iso)
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function run(action: () => unknown) {
  closePopover()
  void action()
}

async function importFile(event: Event) {
  const picked = (event.target as HTMLInputElement).files?.[0]
  if (!picked) return
  await importSessionFile(picked)
  sessions.value = listSessions()
  ;(event.target as HTMLInputElement).value = ''
}

// The first click arms the button, a second within 3 s deletes.
const armed = ref<string | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
function del(session: Session) {
  if (armed.value !== session.id) { armed.value = session.id; clearTimeout(timer); timer = setTimeout(() => { armed.value = null }, 3000); return }
  clearTimeout(timer)
  armed.value = null
  deleteSession(session.id)
  sessions.value = listSessions()
}
</script>
