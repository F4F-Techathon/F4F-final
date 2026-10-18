<template>
  <section class="debate-page" :class="{ 'is-opening': entrance.active, peeking: !!peek }" :style="{ '--reveal': revealProgress }">
    <NavHeader :title="APP_NAME" dark @back="openSheet('more')">
      <button class="decision-button" @click="openDecision">做出决定<AppIcon name="arrow" :size="14" /></button>
    </NavHeader>
    <TheaterStage :performers="onStage" :active-id="line?.speakerId" :paused="store.paused" directed
      :listening="speech.listening.value" :speaking-state="line?.typing ? 'speaking' : 'idle'" :entering="entrance.active" :progress="entrance.stageProgress"
      :selected-id="peek || undefined" :leaving="leaving" @select="selectPerformer" />
    <div class="discussion-area">
      <p v-if="agent.status.value !== 'off' || agentLost" class="agent-status" :class="agent.status.value" role="status">
        <i aria-hidden="true"></i><span>{{ agentText }}</span>
        <button v-if="agent.status.value === 'unavailable' || agentLost" class="text-btn" @click="agent.reconnect()">重新连接</button>
        <button v-else-if="agent.status.value === 'stalled'" class="text-btn" @click="agent.retry()">再试一次</button>
      </p>
      <article v-if="line || speech.listening.value" class="speech-card" :class="{ 'is-listening': speech.listening.value }">
        <header>
          <span class="speaker-dot" :style="{ background: speech.listening.value ? 'var(--green)' : speakerColor }"></span>
          <b>{{ speech.listening.value ? '正在听你说' : line?.name }}</b>
          <template v-if="!speech.listening.value && line">
            <span>{{ speakerRole }}</span>
            <button class="icon-btn audio-toggle" :aria-label="audio ? '关闭语音播放' : '开启语音播放'" @click="toggleAudio"><AppIcon :name="audio ? 'volume' : 'mute'" :size="17" /></button>
            <button class="icon-btn" :aria-label="store.paused ? '继续讨论' : '暂停讨论'" @click="store.paused = !store.paused"><AppIcon :name="store.paused ? 'play' : 'pause'" :size="17" /></button>
          </template>
        </header>
        <div class="speech-text" :aria-live="speech.listening.value ? 'polite' : 'off'">
          <span v-if="speech.listening.value">{{ interruption || '…' }}</span>
          <template v-else-if="line">
            <template v-for="(piece, index) in caption" :key="index">
              <mark v-if="piece.factId" class="fact" :class="{ unspoken: !piece.spoken }" role="button" tabindex="0" :aria-label="`${piece.text}，来源 ${factNumbers[piece.factId]}`"
                @click="openFact(piece.text, piece.factId)" @keydown.enter.prevent="openFact(piece.text, piece.factId)">{{ piece.text }}</mark><sup v-if="piece.factId && piece.last && piece.spoken" class="fact-ref" aria-hidden="true">{{ factNumbers[piece.factId] }}</sup>
              <span v-else-if="!piece.factId" :class="{ unspoken: !piece.spoken }">{{ piece.text }}</span>
            </template>
          </template>
        </div>
        <!-- A regional host speaks its dialect; the Mandarin it means follows once it starts talking. -->
        <p v-if="!speech.listening.value && line?.gloss" class="gloss" :class="{ shown: line.visible > 0 }"><span>{{ dialectLabel || '方言' }} · 释义</span>{{ line.gloss }}</p>
        <ul v-if="!speech.listening.value && factSources.length" class="fact-sources" aria-label="关键信息的来源">
          <li v-for="item in factSources" :key="item.id">
            <button type="button" @click="focusEvidence(item.id)"><i>{{ item.n }}</i><b>{{ item.said }}</b><span>{{ item.source }}</span></button>
          </li>
        </ul>
        <div class="progress"><i :style="{ width: `${progress}%` }"></i></div>
      </article>
      <article v-else class="speech-card is-waiting" role="status">
        <div class="speech-text">{{ waitingText }}</div>
      </article>
      <EvidencePanel v-if="!speech.listening.value && lineEvidence.length" :items="lineEvidence" :numbers="factNumbers" :focus="focusedFact" dark />
    </div>
    <div class="debate-controls">
      <p v-if="speech.error.value" class="voice-error" role="status">{{ speech.error.value }}</p>
      <div class="control-row">
        <button class="interrupt-button" :class="{ listening: speech.listening.value }" :disabled="finishing || entrance.active || !!sheet"
          :aria-pressed="speech.holding.value" :aria-busy="finishing" :aria-label="speech.holding.value ? '松开发送' : '长按说话'" v-on="speech.events">
          <span v-if="speech.listening.value" class="voice-wave" aria-hidden="true"><i v-for="n in 5" :key="n"></i></span>
          <AppIcon v-else name="mic" :size="21" />
          <span>{{ finishing ? '稍等…' : speech.holding.value ? '松开发送' : '长按说话' }}</span>
        </button>
        <button class="pause-control icon-btn" :disabled="speech.listening.value" :aria-label="store.paused ? '继续讨论' : '暂停讨论'" @click="store.paused = !store.paused"><AppIcon :name="store.paused ? 'play' : 'pause'" :size="21" /></button>
      </div>
    </div>
    <Transition name="dish-photo">
      <div v-if="proposal" class="orb-confirm" role="dialog" aria-modal="true" aria-labelledby="orb-confirm-title">
        <div class="panel">
          <h2 id="orb-confirm-title"><span class="orb-dot" aria-hidden="true"></span>Orb 想调整台上阵容</h2>
          <ul>
            <li v-for="item in proposal.items" :key="item.act + item.id" :class="item.act"><b>{{ item.act === 'exit' ? '下台' : '上台' }}</b>{{ item.label }}</li>
          </ul>
          <p v-if="proposal.decision.reply" class="reason">{{ proposal.decision.reply }}</p>
          <div class="actions">
            <button type="button" class="btn decline" @click="answerProposal(false)">不用了</button>
            <button type="button" class="btn agree" @click="answerProposal(true)">同意</button>
          </div>
        </div>
      </div>
    </Transition>
    <Transition name="dish-photo">
      <div v-if="dishPhoto" class="dish-photo" role="dialog" :aria-label="`${dishPhoto.name}的图片`" @click="dishPhoto = null">
        <figure>
          <img :src="dishPhoto.src" :alt="dishPhoto.name" referrerpolicy="no-referrer" />
          <figcaption><b>{{ dishPhoto.name }}</b><span>{{ dishPhoto.shop }}{{ dishPhoto.price ? ` · ¥${dishPhoto.price}` : '' }}</span></figcaption>
        </figure>
        <p>点任意处关闭</p>
      </div>
    </Transition>
    <DebateSheet v-model="sheet" />
    <StagePeek :open="!!peek" :restaurant="peekRestaurant" :guest="peekGuest" :host-name="HOST_NAME" :others="peekRoster"
      @close="peek = ''" @select="selectPerformer" />
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useCastStore } from '@/stores/cast'
import { useDiningStore } from '@/stores/dining'
import { useEntranceStore } from '@/stores/entrance'
import { useStageStore } from '@/stores/stage'
import { usePressToTalk } from '@/composables/usePressToTalk'
import { createStageDirector, provideStageDirector } from '@/composables/useStageDirector'
import { useLinePlayback } from '@/composables/useLinePlayback'
import { useAgentBackend } from '@/composables/useAgentBackend'
import { HOST_NAME, stageCast, stageLayout } from '@/agents/stage/cast'
import { performers } from '@/agents/stage/lineup'
import { createMessageId, STAGE_MAX, type LineMessage } from '@/agents/feed/protocol'
import { rosterRequest, spokenName } from '@/lib/rosterRequest'
import type { OrbDecision } from '@/lib/orbProtocol'
import { APP_NAME } from '@/data/app'
import { getEvidence, restaurants } from '@/data/restaurants'
import { captionPieces, highlightFacts } from '@/agents/stage/highlights'
import { LANGUAGES } from '@/agents/generation/languages'
import { segment } from '@/lib/entranceMotion'
import { stageSlots } from '@/lib/stageLayout'
import NavHeader from '@/components/NavHeader.vue'
import AppIcon from '@/components/AppIcon.vue'
import TheaterStage, { type StagePerformer } from '@/components/TheaterStage.vue'
import DebateSheet from '@/components/DebateSheet.vue'
import EvidencePanel from '@/components/EvidencePanel.vue'
import StagePeek, { type PeekRosterItem } from '@/components/StagePeek.vue'

const store = useDiningStore(), cast = useCastStore(), entrance = useEntranceStore(), stage = useStageStore()
const sheet = ref(''), audio = ref(false), interruption = ref('')
const speech = usePressToTalk((text) => { interruption.value = text }, {
  // The multi-agent backend's own speech recognition while it is ready; the browser's otherwise.
  engine: () => agent.speechEngine(),
  disabled: () => entrance.active || !!sheet.value,
  onStart: beginInterruption,
  onComplete: submitInterruption,
})
const finishing = speech.finishing
const revealProgress = computed(() => entrance.active ? segment(entrance.stageProgress, .65, 1) : 1)

// Who stands on the floor, left to right: the invited hosts the console has not sent to the wings, then its guests.
const director = createStageDirector()
provideStageDirector(director)
const hostIds = computed(() => store.selected.map((restaurant) => restaurant.id))
const guests = computed(() => stage.lineup.guests)
const onStage = computed(() => performers(stage.lineup, hostIds.value).flatMap((id): StagePerformer[] => {
  const restaurant = store.selected.find((item) => item.id === id)
  if (restaurant) return [{ id, name: cast.hostNameOf(restaurant), restaurant }]
  const guest = guests.value.find((item) => item.id === id)
  return guest ? [{ id, name: guest.name, figure: { kind: 'kit', look: guest.look } }] : []
}))
// Everyone who may speak or be quoted, as Jev and the choreography see them: every invited host (in the wings
// too) and every guest; only those standing on the floor listen and react.
const contracts = computed(() => store.selected.map((restaurant) => cast.contractOf(restaurant)).filter((contract) => !!contract))
const members = computed(() => stageCast(contracts.value, guests.value))
const layout = computed(() => {
  const seats = onStage.value.map((performer) => performer.id)
  const order = seats.filter((id) => members.value.some((member) => member.id === id))
  return stageLayout(order, stageSlots(seats.length).map((seat) => seat.offset), seats)
})
function nameOf(speakerId: string) {
  if (speakerId === 'host') return HOST_NAME
  if (speakerId === 'user') return '你'
  const restaurant = store.selected.find((item) => item.id === speakerId)
  if (restaurant) return cast.hostNameOf(restaurant)
  return guests.value.find((guest) => guest.id === speakerId)?.name || speakerId
}
// The multi-agent backend writes the debate (who speaks, what they say, their voices); the stage performs it.
// Without it, the director console's lines still play as before.
const agent = useAgentBackend({
  hosts: () => onStage.value.flatMap((performer) => performer.restaurant ? [performer.restaurant] : []),
  audio, ready: () => !entrance.active, interject: (text) => submitInterruption(text),
})
const agentWasLive = ref(false)
const agentLost = computed(() => agent.status.value === 'off' && agentWasLive.value)
watch(() => agent.status.value, (value) => { if (value === 'live') agentWasLive.value = true })
const agentText = computed(() => ({
  off: '多智能体已断开，正在用导演台的台词',
  connecting: '正在连接多智能体…',
  starting: '选手们正在读资料、定人设…',
  live: store.paused ? '多智能体已就绪 · 讨论暂停中' : '多智能体辩论中',
  waiting: '选手们说完了，长按说说你的想法',
  stalled: '选手们暂时连不上模型（已重试 3 次）',
  unavailable: '多智能体后端没连上，可以用导演台发台词',
})[agent.status.value])
// A restored debate opens paused: say so, or the stage just looks stuck.
const waitingText = computed(() => store.paused ? (stage.queue.length ? '选手们已经准备好了：点右下角 ▶ 继续' : '讨论已暂停，点右下角 ▶ 继续')
  : agent.status.value === 'starting' || agent.status.value === 'connecting' ? '选手们正在准备开场…'
  : agent.status.value === 'waiting' ? '轮到你了：长按说说你的想法'
    : agent.status.value === 'stalled' ? '选手们卡住了：点上方「再试一次」，或长按说说你的想法'
    : agent.live.value && store.history.at(-1)?.user ? '选手们在想怎么接你的话…'
      : agent.live.value ? '下一位选手在准备…' : '等待选手发言…')
const playback = useLinePlayback({
  director, cast: members, layout, nameOf, hosts: () => hostIds.value, audio, voice: agent.voice,
  blocked: () => entrance.active || !!sheet.value || !!peek.value || speech.listening.value,
})
// Development builds let scripts read what each host is showing (expression and gesture cues).
// `say` puts words on stage as if the talk button had heard them (the browser-recognition path).
if (import.meta.env.DEV) Object.assign(window, { __stage: { director, playback, members, layout, agent, say: (text: string) => submitInterruption(text) } })

const line = computed(() => playback.current.value)
const activeRestaurant = computed(() => store.selected.find((restaurant) => restaurant.id === line.value?.restaurantId))
const activeGuest = computed(() => line.value?.guest ? guests.value.find((guest) => guest.id === line.value?.speakerId) : undefined)
const speakerColor = computed(() => activeRestaurant.value?.color || activeGuest.value?.color || (line.value?.speakerId === 'host' ? '#c9b3f2' : '#d9b77f'))
const speakerRole = computed(() => activeRestaurant.value?.name || (activeGuest.value ? `嘉宾 · ${activeGuest.value.restaurant}` : line.value?.speakerId === 'host' ? '主持人' : '顾客'))
const lineEvidence = computed(() => getEvidence(line.value?.evidenceIds || []))
// The dialect a regional host speaks (its generated host's language), named over the Mandarin gloss.
const dialectLabel = computed(() => {
  const contract = activeRestaurant.value && cast.contractOf(activeRestaurant.value)
  return contract ? LANGUAGES.find((language) => language.id === contract.language)?.zh || '' : ''
})
// The line's key facts (prices, dishes, what a review said), marked as the voice reaches them and numbered by the
// record they come from; the same numbers label the evidence cards below. The customer's own words are not marked.
const highlights = computed(() => line.value && !line.value.user ? highlightFacts(line.value.text, lineEvidence.value) : [])
const factNumbers = computed(() => {
  const numbers: Record<string, number> = {}
  for (const item of highlights.value) numbers[item.factId] ??= Object.keys(numbers).length + 1
  return numbers
})
const caption = computed(() => line.value ? captionPieces(line.value.text, highlights.value, line.value.visible) : [])
const factSources = computed(() => {
  const reached = highlights.value.filter((item) => item.start < (line.value?.visible || 0))
  return Object.entries(factNumbers.value).flatMap(([id, n]) => {
    const first = reached.find((item) => item.factId === id)
    const evidence = lineEvidence.value.find((item) => item.id === id)
    return first && evidence ? [{ id, n, said: line.value!.text.slice(first.start, first.end), source: `${evidence.title} · ${evidence.source}` }] : []
  })
})
const focusedFact = ref<{ id: string; at: number } | null>(null)
function focusEvidence(id: string) {
  focusedFact.value = { id, at: Date.now() }
  document.querySelector(`[data-evidence-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'nearest' })
}
// A highlighted dish shows its picture (the shop's recommended dishes come with one); the source card still opens.
// The speaker's own dishes are looked up first, then the other shops on stage.
const dishPhoto = ref<{ name: string; src: string; shop: string; price: number | null } | null>(null)
function dishIn(text: string) {
  const words = text.replace(/[d.¥元块,，。！？、s]/g, '')
  const shops = [activeRestaurant.value, ...store.selected].filter((restaurant, index, all) => restaurant && all.indexOf(restaurant) === index)
  for (const restaurant of shops) for (const dish of restaurant!.listing?.dishes ?? []) {
    if (!dish.image || dish.name.length < 2) continue
    if (text.includes(dish.name) || (words.length >= 2 && dish.name.includes(words))) return { name: dish.name, src: dish.image, shop: spokenName(restaurant!.name), price: dish.price }
  }
  return null
}
function openFact(text: string, factId: string) {
  const dish = dishIn(text)
  if (dish) dishPhoto.value = dish
  focusEvidence(factId)
}
const progress = computed(() => Math.min(100, (line.value?.visible || 0) / (line.value?.text.length || 1) * 100))

function toggleAudio() {
  const backendVoices = agent.live.value && !!agent.tts.value && agent.tts.value !== 'none'
  if (!backendVoices && !('speechSynthesis' in window)) { store.notify('这个浏览器不支持朗读，字幕模式仍可使用'); return }
  audio.value = !audio.value
}
function openSheet(value: string) { speech.cancel(); peek.value = ''; store.paused = true; sheet.value = value }

// Tapping someone on stage shows, beside the stage, the shop they speak for (the host lists the others). The
// line in progress finishes; the next one waits until the panel closes. Tapping the same one again closes it.
const peek = ref('')
const peekRestaurant = computed(() => store.selected.find((restaurant) => restaurant.id === peek.value))
const peekGuest = computed(() => guests.value.find((guest) => guest.id === peek.value))
const peekRoster = computed(() => onStage.value.map((performer): PeekRosterItem => {
  const guest = guests.value.find((item) => item.id === performer.id)
  return { id: performer.id, name: performer.name, shop: performer.restaurant?.name || (guest ? `嘉宾 · ${guest.restaurant}` : ''), color: performer.restaurant?.color || guest?.color || '#d9b77f' }
}))
// What a performer does when tapped, in turn: a hop with starry eyes and a wave, a laugh and a cheer, a wink
// and a thumbs-up. The face and arms then return to whatever the line's choreography has them doing; the
// one speaking keeps its gesture and only hops.
const TAP_REACTIONS = [
  { expression: 'star', pose: 'waveR', act: 'hop', duration: .35 },
  { expression: 'laugh', pose: 'cheer', act: 'bounce', duration: .9 },
  { expression: 'wink', pose: 'thumbR', act: 'nod', duration: .4 },
]
const REACTION_S = 1.2
const taps: Record<string, number> = {}
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
function react(id: string) {
  const actor = director.actors[id]
  if (!actor) return
  const reaction = TAP_REACTIONS[(taps[id] = (taps[id] ?? -1) + 1) % TAP_REACTIONS.length]!
  const t = director.now()
  const back = director.cueAt(id, t + REACTION_S)
  const speaking = line.value?.speakerId === id && line.value.typing
  actor.e(t, reaction.expression).e(t + REACTION_S, back?.expression || 'idle')
  if (reducedMotion.matches) return
  actor.act(t, reaction.act, reaction.duration, 1)
  if (!speaking) actor.p(t, reaction.pose, .25).p(t + REACTION_S, back?.pose || 'rest', .35)
}
function selectPerformer(id: string) {
  if (entrance.active) return
  react(id)
  peek.value = peek.value === id ? '' : id
}
// Someone who leaves the stage takes their panel with them.
watch(() => onStage.value.map((performer) => performer.id), (ids) => { if (peek.value && peek.value !== 'host' && !ids.includes(peek.value)) peek.value = '' })

// Speaking takes over the stage card and holds the host talking; a cancelled hold leaves the line paused.
function beginInterruption() {
  interruption.value = ''
  peek.value = ''
  store.paused = true
}

// The customer's words go on stage as a line of their own, and the hosts react to them. Orb, the host agent
// (POST /api/orb), hears them first: it may propose sending hosts off, bringing hosts back, or finding shops that fit
// a new wish among every shop within the request's hard limits; whatever else was said goes on to the restaurants.
// A line-up change only happens once the customer agrees in a dialog. If Orb cannot be reached, plain keyword rules
// make the proposal instead.
async function submitInterruption(text: string) {
  if (!text.trim()) return
  playback.interject(text)
  store.paused = false
  const decision = await askOrb(text) ?? ruleDecision(text)
  if (!decision) { agent.userSaid(text); return }
  if (decision.forward) agent.userSaid(text, !!decision.reply)
  if (decision.actions.length) propose(decision)
  else if (decision.reply) hostSays(decision.reply)
}

async function askOrb(utterance: string): Promise<OrbDecision | null> {
  const standing = onStage.value
  const stageIds = new Set(standing.map((performer) => performer.id))
  const wings = store.selected.filter((restaurant) => !stageIds.has(restaurant.id))
  const invited = new Set(store.selectedIds)
  try {
    const response = await fetch('/api/orb', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        utterance, brief: store.brief(),
        stage: standing.filter((performer) => performer.restaurant).map((performer) => ({ id: performer.id, host: performer.name })),
        guests: standing.filter((performer) => !performer.restaurant).length,
        wings: wings.map((restaurant) => ({ id: restaurant.id, host: cast.hostNameOf(restaurant) })),
        candidateIds: store.eligible.filter((restaurant) => !invited.has(restaurant.id)).map((restaurant) => restaurant.id),
      }),
    })
    return response.ok ? await response.json() as OrbDecision : null
  } catch { return null }
}

// Without Orb's model: keyword rules (rosterRequest) make the same kind of proposal, or explain why they cannot.
function ruleDecision(text: string): OrbDecision | null {
  const invited = new Set(store.selectedIds)
  const candidates = [...store.selected, ...restaurants.filter((restaurant) => !invited.has(restaurant.id))]
    .map((restaurant) => ({ id: restaurant.id, name: restaurant.name, hostName: invited.has(restaurant.id) ? cast.hostNameOf(restaurant) : undefined }))
  const request = rosterRequest(text, candidates)
  if (!request) return null
  const restaurant = request.id ? restaurants.find((item) => item.id === request.id) : undefined
  const standing = onStage.value.map((performer) => performer.id)
  const shops = onStage.value.filter((performer) => performer.restaurant).length
  const decide = (reply: string, act?: 'exit' | 'enter'): OrbDecision => ({ reply, actions: act && restaurant ? [{ act, id: restaurant.id }] : [], forward: false, model: 'rules' })
  if (!restaurant) return decide(request.act === 'exit' ? '你想请哪一位下台？说一下店名或店主的名字吧。' : '你想请哪家上台？说一下店名吧。')
  const shop = spokenName(restaurant.name)
  const label = invited.has(restaurant.id) ? `${cast.hostNameOf(restaurant)}（${shop}）` : shop
  if (request.act === 'exit') {
    if (!standing.includes(restaurant.id)) return decide(`${shop}现在不在台上哦。`)
    if (shops <= 2) return decide('台上只剩两家了，再请走一位就辩不起来啦。先请一家新店上台吧？')
    return decide(`好，请${label}先下台休息，剩下几位接着比！`, 'exit')
  }
  if (standing.includes(restaurant.id)) return decide(`${label}已经在台上啦。`)
  if (standing.length >= STAGE_MAX) return decide(`台上已经满员了，先请一位下台，${shop}才能上来。`)
  return decide(invited.has(restaurant.id) ? `欢迎${label}回到台上！` : `欢迎${shop}登台！`, 'enter')
}

function hostSays(text: string) {
  const line: LineMessage = { kind: 'line', id: createMessageId('orb'), speaker: 'host', text, topic: '主持', interrupt: true }
  stage.enqueueLocal(line)
  stage.mirror(line)
}

// Orb's proposal waits for the customer: the debate pauses on a dialog listing who would leave and who would come.
interface Proposal { decision: OrbDecision; items: { act: 'exit' | 'enter'; id: string; label: string }[]; resume: boolean }
const proposal = ref<Proposal | null>(null)
function labelOf(id: string) {
  const restaurant = restaurants.find((item) => item.id === id)
  if (!restaurant) return id
  const shop = spokenName(restaurant.name)
  return store.selectedIds.includes(id) ? `${cast.hostNameOf(restaurant)}（${shop}）` : shop
}
function propose(decision: OrbDecision) {
  proposal.value = { decision, items: decision.actions.map((action) => ({ ...action, label: labelOf(action.id) })), resume: !store.paused }
  store.paused = true
}
function answerProposal(agreed: boolean) {
  const current = proposal.value
  if (!current) return
  proposal.value = null
  if (current.resume) store.paused = false
  if (!agreed) { hostSays('好，阵容不变，大家接着比！'); return }
  if (current.decision.reply) hostSays(current.decision.reply)
  applyLineup(current.decision)
}

// Approved changes play out on stage: a leaver turns and runs off to the right (the line-up drops it once it is
// gone); a newcomer runs in from the right while the others slide over. A shop not yet invited gets its host now.
const leaving = ref<string[]>([])
const EXIT_RUN_MS = 1000
function applyLineup(decision: OrbDecision) {
  for (const action of decision.actions) {
    const restaurant = restaurants.find((item) => item.id === action.id)
    if (!restaurant) continue
    if (action.act === 'exit') {
      leaving.value = [...leaving.value, restaurant.id]
      setTimeout(() => {
        stage.applyCue({ kind: 'cast', id: createMessageId('orb'), act: 'exit', who: restaurant.id }, hostIds.value)
        leaving.value = leaving.value.filter((id) => id !== restaurant.id)
      }, EXIT_RUN_MS)
    } else if (store.selectedIds.includes(restaurant.id)) {
      stage.applyCue({ kind: 'cast', id: createMessageId('orb'), act: 'enter', who: restaurant.id }, hostIds.value)
    } else {
      store.selectedIds.push(restaurant.id)
      void cast.ensure(restaurant).catch(() => undefined)
    }
  }
}

// Both the header action and an empty stage wait for the user's own choice.
function openDecision() { openSheet(store.decisionCandidates.length ? 'decision' : 'no-match') }
const hidden = ref(document.hidden)
function onVisibility() { hidden.value = document.hidden; if (document.hidden) store.paused = true }
// The console sees why its lines wait: a phone page in the background pauses itself (a desktop browser does this
// whenever another tab, such as the console, is in front).
const holdReason = computed(() => entrance.active ? '开场动画中，结束后开演'
  : store.paused ? (hidden.value ? '手机页面在后台，已自动暂停（切回页面并点继续）' : '手机上已暂停，点继续后开演')
    : sheet.value ? '手机上打开了面板，关掉后开演'
      : peek.value ? '手机上在看店铺资料，关掉后接着演'
      : speech.listening.value ? '顾客正在说话' : '')
watch(holdReason, (value) => { stage.holdStage = value }, { immediate: true })
onBeforeUnmount(() => { stage.holdStage = '' })
watch(() => [entrance.active, sheet.value, peek.value], () => playback.pump())
onMounted(() => {
  playback.pump()
  document.addEventListener('visibilitychange', onVisibility)
})
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibility))
</script>
<style lang="less" scoped>
.debate-page { height: 100dvh; display: flex; flex-direction: column; background: #211229; color: var(--cream); overflow: hidden;
  --peek-width: min(400px, 40vw);
  transition: padding-right .32s cubic-bezier(.22, .61, .36, 1);
  // Wide screens: the shop drawer opens beside the stage, which moves over to stay whole.
  @media (min-width: 900px) { &.peeking { padding-right: var(--peek-width); } }
  :deep(.nav-header), .discussion-area, .debate-controls {
    opacity: var(--reveal, 1);
  }
  .discussion-area, .debate-controls {
    transform: translateY(calc((1 - var(--reveal, 1)) * 16px));
  }
  .decision-button {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    gap: 6px;
    min-height: 32px;
    padding: 0 11px;
    border: 1px solid #dca64a;
    border-radius: 18px;
    background: var(--gold);
    color: var(--ink);
    font-size: var(--label-size);
    font-weight: var(--weight-semibold);
    white-space: nowrap;
    transition: transform .2s ease;
    &::before { content: ''; position: absolute; inset: -6px 0; }
    &:active { transform: scale(.97); }
  }

  // The stage and the talk bar keep their place; the line, its sources and the evidence scroll in between.
  .discussion-area {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    width: 100%;
    max-width: var(--content-width);
    margin: 0 auto;
    padding: 16px var(--inset-right) 12px var(--inset-left);

    .agent-status {
      display: flex;
      align-items: center;
      gap: 7px;
      margin: -4px 0 10px;
      color: #c8b3c9;
      font-size: var(--small-size);
      line-height: var(--line-compact);
      i { width: 7px; height: 7px; border-radius: 50%; background: #8d7a91; flex: none; }
      span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      &.live i { background: var(--green); box-shadow: 0 0 0 3px #4f8a5b33; }
      &.waiting i { background: var(--gold); }
      &.stalled i { background: #c9675d; }
      &.connecting i, &.starting i { background: var(--gold); animation: agent-pulse 1s ease-in-out infinite alternate; }
      &.unavailable i, &.off i { background: #c9675d; }
      .text-btn { margin-left: auto; padding: 4px 2px; color: var(--gold); flex: none; }
    }

    .speech-card {
      background: #fff9ef;
      color: var(--ink);
      padding: clamp(14px, 2vw, 24px) clamp(16px, 2.5vw, 28px) 14px;
      border: 1px solid #d7bb92;
      border-radius: 16px;
      box-shadow: 0 4px 0 #10091944;
      transition: background .35s ease, border-color .35s ease;

      header {
        display: flex;
        align-items: center;
        gap: 6px;
        min-height: 28px;
        margin-bottom: 9px;
        .speaker-dot { width: 6px; height: 6px; border-radius: 50%; }
        b { font-size: var(--label-size); }
        >span:last-of-type { font-size: var(--small-size); color: #ae9584; }
        .icon-btn { margin-left: 0; width: 28px; height: 28px; color: #8d7869; background: #ede4d5; &.audio-toggle { margin-left: auto; background: transparent; } }
      }
      .speech-text {
        font-size: var(--body-size);
        line-height: var(--line-body);
        min-height: 80px;
        overflow-wrap: anywhere;
        .unspoken { color: #cabcae; }
        // A key fact: a marker stroke under it, its source number after it once said.
        mark.fact {
          color: inherit;
          font-weight: var(--weight-semibold);
          background: linear-gradient(transparent 60%, #f3cf7a 60%);
          border-radius: 2px;
          cursor: pointer;
          &.unspoken { color: #cabcae; background: linear-gradient(transparent 60%, #f3cf7a44 60%); }
          &:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
        }
        sup.fact-ref {
          display: inline-grid;
          place-items: center;
          min-width: 15px;
          height: 15px;
          margin: 0 2px 0 1px;
          padding: 0 3px;
          border-radius: 8px;
          background: #8b6a3e;
          color: #fff9ef;
          font-size: 10px;
          font-weight: var(--weight-semibold);
          line-height: 1;
          vertical-align: super;
        }
      }
      .gloss {
        margin: 8px 0 0;
        color: #8c7568;
        font-size: var(--small-size);
        line-height: var(--line-compact);
        opacity: 0;
        transform: translateY(3px);
        transition: opacity .35s ease, transform .35s ease;
        &.shown { opacity: 1; transform: none; }
        span {
          display: inline-block;
          margin-right: 6px;
          padding: 1px 6px;
          border-radius: 8px;
          background: #efe3cf;
          color: #8b6a3e;
          font-size: 11px;
          font-weight: var(--weight-semibold);
        }
      }
      .fact-sources {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin: 10px 0 0;
        padding: 0;
        list-style: none;
        button {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          max-width: 100%;
          min-height: 26px;
          padding: 3px 9px 3px 4px;
          border: 1px solid #e3cfa9;
          border-radius: 13px;
          background: #fbf1df;
          color: #6f5536;
          font-size: var(--small-size);
          line-height: 1.2;
          text-align: left;
          i { display: grid; place-items: center; width: 17px; height: 17px; border-radius: 50%; background: #8b6a3e; color: #fff9ef; font-size: 10px; font-style: normal; font-weight: var(--weight-semibold); flex: none; }
          b { font-weight: var(--weight-semibold); white-space: nowrap; }
          span { color: #a08466; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        }
      }
      .progress {
        height: 2px;
        margin-top: 16px;
        background: #e4d8c4;
        transition: opacity .25s ease;
        i { height: 100%; display: block; background: var(--gold); transition: width .1s; }
      }
      &.is-waiting { text-align: center; .speech-text { min-height: 0; color: #a8927f; } }
      &.is-listening {
        background: #f3eaf2;
        border-color: #d6c1d9;
        .speech-text { color: #66506d; }
        .progress { opacity: 0; }
      }
    }
  }

  .dish-photo {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-content: center;
    gap: 12px;
    padding: 24px;
    background: rgba(18, 9, 22, .78);
    backdrop-filter: blur(6px);
    figure { margin: 0; max-width: min(88vw, 420px); background: #fff9ef; border-radius: 22px; overflow: hidden; box-shadow: 0 18px 50px rgba(0, 0, 0, .4); }
    img { display: block; width: 100%; max-height: 60dvh; object-fit: cover; }
    figcaption { display: flex; flex-direction: column; gap: 2px; padding: 12px 16px 14px; color: #3b2a33; b { font-size: var(--body-size, 16px); } span { color: #8d7869; font-size: var(--label-size); } }
    p { margin: 0; text-align: center; color: #c9b8c9; font-size: var(--label-size); }
  }
  .orb-confirm {
    position: fixed;
    inset: 0;
    z-index: 61;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(18, 9, 22, .72);
    backdrop-filter: blur(4px);
    .panel { width: min(100%, 360px); padding: 20px 20px 16px; background: #fff9ef; color: #3b2a33; border-radius: 22px; box-shadow: 0 18px 50px rgba(0, 0, 0, .4); }
    h2 { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; font-size: 17px; }
    .orb-dot { width: 18px; height: 18px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff, #c9b3f2 60%, #9d86d6); flex: none; }
    ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
    li { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; background: #f3eadb; font-size: 15px;
      b { padding: 2px 8px; border-radius: 999px; font-size: 12px; color: #fff; background: #b0742f; flex: none; }
      &.exit b { background: #9b5a5a; } }
    .reason { margin: 12px 0 0; color: #7d6a5f; font-size: var(--label-size); line-height: 1.5; }
    .actions { display: flex; gap: 10px; margin-top: 16px; .btn { flex: 1; min-height: 44px; border-radius: 14px; font-weight: 600; } }
    .decline { background: #ede4d5; color: #6d5b51; }
    .agree { background: var(--gold, #d9a645); color: #2b1a20; }
  }
  .dish-photo-enter-active, .dish-photo-leave-active { transition: opacity .2s ease; }
  .dish-photo-enter-from, .dish-photo-leave-to { opacity: 0; }

  .debate-controls {
    flex: none;
    width: 100%;
    max-width: var(--content-width);
    margin: 0 auto;
    padding: 0 var(--inset-right) calc(14px + env(safe-area-inset-bottom)) var(--inset-left);
    background: #211229;
    .voice-error { margin: 0 0 12px; color: #e6b6b1; font-size: var(--label-size); line-height: var(--line-body); }
    .control-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 14px;

      .pause-control {
        width: 46px;
        height: 46px;
        flex-shrink: 0;
        border: 1px solid #57415f;
        color: #c8b3c9;
        background: #ffffff03;
        &:disabled { opacity: .35; }
      }
      .interrupt-button {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 9px;
        flex: 1;
        min-width: 0;
        min-height: var(--control-height);
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
        border-radius: 50px;
        background: var(--gold);
        color: var(--ink);
        border: 1px solid #ebc171;
        box-shadow: 0 3px 0 #89632f;
        font-size: var(--body-size);
        font-weight: var(--weight-semibold);
        transition: background .35s ease, color .35s ease, border-color .35s ease, box-shadow .35s ease;
        &.listening { background: #e6d8e8; color: #65476e; border-color: #c9b4d0; box-shadow: 0 3px 0 #9d83a7; }

        .voice-wave {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 3px;
          width: 21px;
          height: 21px;
          i {
            width: 2px;
            height: 16px;
            border-radius: 3px;
            background: currentColor;
            animation: stage-voice-wave .85s ease-in-out infinite alternate;
            &:nth-child(2) { animation-delay: -.25s; }
            &:nth-child(3) { animation-delay: -.5s; }
            &:nth-child(4) { animation-delay: -.15s; }
            &:nth-child(5) { animation-delay: -.4s; }
          }
        }
      }
    }
  }

  @keyframes stage-voice-wave { from { transform: scaleY(.3); } to { transform: scaleY(1); } }
  @keyframes agent-pulse { from { opacity: .35; } to { opacity: 1; } }
}
</style>
