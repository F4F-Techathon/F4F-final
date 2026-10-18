<template>
  <div class="composer">
    <div class="opts">
      <button ref="whoBtn" class="who" type="button" :style="{ '--c': colorOf(speaker) }" title="谁说下一句（Alt+数字）" @click="pickSpeaker">
        <Face :who="speaker" :size="22" /><b>{{ character(speaker).name }}</b><span class="chev"><Icon name="down" /></span>
      </button>
      <button v-if="live.interrupt" class="cutchip" type="button" title="插话已开：这句会打断正在说的那句。点一下关掉" @click="live.interrupt = false"><Icon name="cut" />插话<Icon name="close" /></button>
      <input v-model="live.topic" class="topic" maxlength="40" placeholder="话题" title="话题（可选，40 字以内）" />
      <button v-if="evidence.length" ref="evBtn" class="chip plain evbtn" :class="{ on: live.evidence.length }" type="button" title="这句引用哪些依据" @click="pickEvidence"><Icon name="layers" />依据 {{ live.evidence.length ? `${live.evidence.length}/${evidence.length}` : evidence.length }}</button>
      <span class="sp"></span>
      <button ref="optBtn" class="iconbtn sm" type="button" title="选项" @click="options"><Icon name="more" /></button>
    </div>
    <div v-if="quotes.length" class="reply">
      <div class="reply-h">
        <b>{{ quotes.length > 1 ? `同时回复 ${quotes.length} 条 · ${people} 人` : '回复' }}</b>
        <span class="dim">点消息上的 ↩ 可多选 · Alt+↑ 追加</span>
        <span class="sp"></span>
        <button class="linkbtn" type="button" @click="live.quotes = []">清空</button>
      </div>
      <div v-for="quote in quotes" :key="quote.id" class="reply-row" :style="{ '--q': quote.color }">
        <span class="bar"></span>
        <span class="t"><em>{{ quote.name }}</em>{{ quote.text }}</span>
        <button class="iconbtn sm" type="button" title="不回复这句" @click="toggleQuote(quote.id)"><Icon name="close" /></button>
      </div>
    </div>
    <div class="inrow">
      <textarea ref="input" v-model="text" rows="1" :maxlength="LINE_TEXT_MAX" :placeholder="placeholder" @keydown="keys" @input="grow" />
      <button class="btn primary send" type="button" title="发送（回车）" :disabled="!text.trim() || sending" @click="submit"><Icon name="send" /></button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { LINE_TEXT_MAX } from '@/agents/feed/protocol'
import { useDirector } from '../core/director.ts'
import { isLine } from '../core/timeline.ts'
import Face from '../ui/Face.vue'
import Icon from '../ui/Icon.vue'
import { openPopover, type PopItem } from '../ui/popover.ts'
import { toast } from '../ui/toast.ts'
import { sendDraft, sendGreetings } from './actions.ts'
import EvidencePicker from './EvidencePicker.vue'
import { live, useLive } from './state.ts'

// Who speaks next, whether the line cuts in, its topic and evidence, which earlier lines it answers, and the line itself.
const director = useDirector()
const { character, colorOf, speaker, speakers, setSpeaker, toggleQuote } = useLive()
const whoBtn = ref<HTMLElement>(), optBtn = ref<HTMLElement>(), evBtn = ref<HTMLElement>(), input = ref<HTMLTextAreaElement>()
const text = ref(''), sending = ref(false)

const evidence = computed(() => director.cast.value.find((entry) => entry.id === speaker.value)?.evidenceIds ?? [])
const quotes = computed(() => live.quotes.map((id) => {
  const line = director.state.timeline.find((item) => isLine(item) && item.id === id)
  const who = line && isLine(line) ? line.speaker : ''
  return { id, name: who ? character(who).name : '某人', text: line && isLine(line) ? line.text : '', color: who ? colorOf(who) : 'var(--tx-3)', who }
}))
const people = computed(() => new Set(quotes.value.map((quote) => quote.who)).size)
const placeholder = computed(() => (live.interrupt ? '输入台词，回车插话' : '输入台词，回车发送'))

function pickSpeaker() {
  if (!whoBtn.value) return
  const items: PopItem[] = [{ head: '谁说下一句' }, ...speakers.value.map((id, index): PopItem => {
    const c = character(id)
    const entry = director.cast.value.find((item) => item.id === id)
    return {
      label: c.name, sub: id === 'user' ? '台下顾客' : id === 'host' ? '主持' : entry?.kind === 'guest' ? `嘉宾 · ${c.restaurant}` : c.agent?.plate || c.restaurant,
      face: { who: id }, kbd: index < 9 ? `Alt ${index + 1}` : undefined, on: id === speaker.value, onClick: () => { setSpeaker(id); focus() },
    }
  })]
  openPopover(whoBtn.value, { items, className: 'who-pop' })
}

function options() {
  if (!optBtn.value) return
  openPopover(optBtn.value, { items: [
    { label: live.interrupt ? '插话 · 已开' : '插话 · 关', sub: '打断正在说的那句，这句立刻上演', icon: 'cut', on: live.interrupt, onClick: () => { live.interrupt = !live.interrupt } },
    { label: '全员开场白', sub: '台上每位店主按顺序说开场白', icon: 'spark', onClick: () => void sendGreetings() },
    { sep: true },
    { label: '清空舞台', sub: '手机停下这句，丢掉排队的台词', icon: 'stop', danger: true, onClick: () => void director.clearStage().catch((error: Error) => toast(error.message, 'bad')) },
  ] })
}

function pickEvidence() {
  if (evBtn.value) openPopover(evBtn.value, { component: EvidencePicker, props: { ids: evidence.value, prefix: speaker.value }, className: 'wide' })
}

function grow() {
  const el = input.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(140, el.scrollHeight)}px`
}

async function submit() {
  if (!text.value.trim() || sending.value) return
  sending.value = true
  if (await sendDraft(text.value)) { text.value = ''; await nextTick(); grow() }
  sending.value = false
  focus()
}

function keys(event: KeyboardEvent) {
  if (event.key === 'Escape' && live.quotes.length) { live.quotes = []; event.preventDefault(); return }
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); void submit() }
}

function focus() { input.value?.focus() }
defineExpose({ focus })
</script>
