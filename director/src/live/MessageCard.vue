<template>
  <article class="msg" :class="{ sel: live.inspecting === item.id, speaking: item.phase === 'speaking', quoting, mine: item.speaker === 'user' }" :style="{ '--c': color }" @click="inspect">
    <span class="av"><Face :who="item.speaker" :expr="face" :size="36" /></span>
    <div>
      <div class="hd">
        <b>{{ name }}</b>
        <span v-if="item.topic" class="tag">{{ item.topic }}</span>
        <span v-if="item.origin === 'app'" class="tag" title="顾客在手机上长按说的">手机端</span>
        <span v-if="item.interrupt" class="tag">插话</span>
        <span v-if="item.edited" class="tag">已编辑</span>
        <span class="time">{{ time }}</span>
        <span class="sp"></span>
        <span class="acts" @click.stop>
          <button class="iconbtn sm" :class="{ on: quoting }" type="button" title="回复这句（可多选 · Alt+↑ 追加）" :disabled="!item.seen" @click="toggleQuote(item.id)"><Icon name="reply" /></button>
          <button class="iconbtn sm" type="button" title="重播" :disabled="!item.seen" @click="replay(item)"><Icon name="replay" /></button>
          <button ref="moreBtn" class="iconbtn sm" type="button" title="更多" @click="menu"><Icon name="more" /></button>
        </span>
      </div>
      <div v-for="quote in quotes.slice(0, 3)" :key="quote.id" class="quote" :style="{ '--q': quote.color }"><em>{{ quote.name }}</em>{{ quote.text }}</div>
      <div v-if="quotes.length > 3" class="quote more">还回复了 {{ quotes.length - 3 }} 条</div>
      <div v-if="editing" class="edit" @click.stop>
        <textarea ref="editor" v-model="live.draft" class="edit-ta" rows="1" maxlength="600" @keydown.stop="editKeys" @input="grow" />
        <div class="edit-bar"><span class="dim">保存后重新决策并重演</span><span class="sp"></span><button class="btn sm ghost" type="button" @click="live.editing = null">取消</button><button class="btn sm primary" type="button" @click="commit">保存</button></div>
      </div>
      <div v-else class="tx">{{ item.seen ? item.text : '（这句不是这个控制台发出的）' }}</div>
      <div v-if="item.evidenceIds.length" class="ev-ids"><span v-for="evidence in evidences" :key="evidence.id" class="tag" :title="evidence.text || evidence.id">{{ evidence.label.slice(0, 18) }}</span></div>
      <div v-if="s" class="dec">
        <span v-if="s.expr" class="chip" :class="{ manual: manual('expr') }" :title="`表情 · ${s.expr.zh}${s.expr.gated ? '（Jev 不确定，用人设默认）' : ''}`">
          <Face :who="item.speaker" :expr="s.expr.id" :size="20" />{{ s.expr.zh }}<span class="c" :class="{ lo: s.expr.gated }">{{ s.expr.gated ? '默认' : pct('expr') }}</span>
          <template v-if="s.punch && s.punch.id !== 'same' && s.punch.id !== s.expr.id">→ <Face :who="item.speaker" :expr="s.punch.id" :size="20" />{{ s.punch.zh }}</template>
        </span>
        <span v-if="s.gesture" class="chip plain" :class="{ manual: manual('gesture') }"><Icon name="hand" />{{ s.gesture.zh }}<span v-if="s.gesture.gated" class="c lo">默认</span></span>
        <span v-if="s.act && s.act.id !== 'none'" class="chip plain" :class="{ manual: manual('act') }"><Icon name="bolt" />{{ s.act.zh }}</span>
        <span v-if="s.stance && item.replyTo.length" class="chip plain" :class="{ manual: manual('stance') }"><Icon name="reply" />{{ s.stance.zh }}</span>
        <span v-if="listeners.length" class="lis"><span v-for="listener in listeners" :key="listener.id" class="lface" :title="`${listener.name}：${listener.zh}`"><Face :who="listener.id" :expr="listener.expr" :size="22" /></span></span>
      </div>
      <div class="st">
        <template v-if="!item.seen && !item.phase"></template>
        <span v-else-if="item.phase === 'deciding'" class="stl"><span class="typing"><i></i><i></i><i></i></span> Jev 决策中</span>
        <span v-else-if="item.phase === 'speaking'" class="stl"><Icon name="wave" /> {{ item.replaying ? '重播中' : '发言中' }}</span>
        <span v-else-if="item.phase === 'queued'" :class="{ warn: item.phaseNote }">排队中{{ item.phaseNote ? ` · ${item.phaseNote}` : '' }}</span>
        <span v-else-if="item.phase === 'dropped'" class="err">未上演{{ item.phaseNote ? ` · ${item.phaseNote}` : '' }}</span>
        <span v-else-if="item.phase === 'done' && item.phaseNote" class="warn">已打断 · {{ item.phaseNote }}</span>
        <span v-else-if="!item.phase && item.times.sent">已发出</span>
        <span v-if="duration">{{ duration }}</span>
        <span v-if="decision?.source === 'baseline'" class="tag" :title="decision.note || '关键词基线，不是 Jev'">基线</span>
        <span v-if="decision?.detail?.provisional" class="tag" title="Jev 晚于开演回来：先按人设默认开演，中途补上表情和反应">先开演</span>
        <span v-if="decision?.latencyMs != null">决策 {{ decision.latencyMs }}ms</span>
      </div>
    </div>
  </article>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useDirector } from '../core/director.ts'
import { isLine, type LineItem } from '../core/timeline.ts'
import Face from '../ui/Face.vue'
import Icon from '../ui/Icon.vue'
import { openPopover } from '../ui/popover.ts'
import { commitEdit, removeCard, replay } from './actions.ts'
import { evidenceInfo } from './evidence.ts'
import { live, useLive } from './state.ts'

// One line in the thread: who said it and what it answers, how Jev had it performed (face, gesture, act,
// stance, every listener's reaction), and where it is on the phone right now.
const props = defineProps<{ item: LineItem; start: number }>()
const director = useDirector()
const { character, colorOf, toggleQuote } = useLive()
const moreBtn = ref<HTMLElement>(), editor = ref<HTMLTextAreaElement>()
const name = computed(() => (props.item.seen ? character(props.item.speaker).name : '未知'))
const color = computed(() => colorOf(props.item.speaker))
const quoting = computed(() => live.quotes.includes(props.item.id))
const editing = computed(() => live.editing === props.item.id)
const decision = computed(() => props.item.decision)
const s = computed(() => decision.value?.speaker)
const face = computed(() => {
  const punch = s.value?.punch?.id
  return punch && punch !== 'same' ? punch : s.value?.expr?.id ?? 'idle'
})
const time = computed(() => {
  const seconds = Math.max(0, Math.round((props.item.at - props.start) / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
})
const quotes = computed(() => props.item.replyTo.map((id) => {
  const line = director.state.timeline.find((entry): entry is LineItem => isLine(entry) && entry.id === id)
  return { id, name: line ? character(line.speaker).name : '某人', text: line?.text ?? '（不在本会话里）', color: line ? colorOf(line.speaker) : 'var(--tx-3)' }
}))
const listeners = computed(() => Object.entries(decision.value?.listeners ?? {}).map(([id, listener]) => ({ id, name: character(id).name, zh: listener.reaction.zh, expr: listener.reaction.id })))
const evidences = computed(() => props.item.evidenceIds.map((id) => evidenceInfo(id, props.item.speaker)))
const duration = computed(() => {
  const { speaking, done } = props.item.times
  return speaking && done ? `${((done - speaking) / 1000).toFixed(1)}s` : ''
})
const pct = (slot: string) => {
  const conf = decision.value?.detail?.plan[slot]?.conf
  return conf == null ? '' : `${Math.round(conf * 100)}%`
}
const manual = (slot: string) => !!props.item.override?.[slot]

function inspect() { if (!editing.value) live.inspecting = live.inspecting === props.item.id ? null : props.item.id }

function menu() {
  if (!moreBtn.value) return
  const performing = props.item.phase === 'deciding' || props.item.phase === 'speaking'
  const editable = props.item.seen && !performing && props.item.origin === 'console'
  openPopover(moreBtn.value, { items: [
    { label: '编辑这句', sub: editable ? '改完重新决策并重演' : performing ? '这句还在演' : '只能改控制台发出的台词', icon: 'edit', disabled: !editable, onClick: startEdit },
    { label: '检视决策', sub: 'Jev 的每一项选择和概率', icon: 'inspect', onClick: () => { live.inspecting = props.item.id } },
    { sep: true },
    { label: '删除这句', sub: props.item.phase === 'done' || props.item.phase === 'dropped' ? '从会话里删除' : '从会话里删除，并让手机不再演', icon: 'trash', danger: true, onClick: () => void removeCard(props.item) },
  ] })
}

async function startEdit() {
  live.editing = props.item.id
  live.draft = props.item.text
  await nextTick()
  editor.value?.focus()
  grow()
}
function grow() {
  const el = editor.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(160, el.scrollHeight)}px`
}
function editKeys(event: KeyboardEvent) {
  if (event.key === 'Escape') { live.editing = null; return }
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); void commit() }
}
async function commit() { await commitEdit(props.item, live.draft) }
watch(editing, (on) => { if (!on) live.draft = '' })
</script>
