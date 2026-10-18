import { computed, reactive, ref, toRaw } from 'vue'
import { createMessageId, type AgentProfile, type CastAct, type CastMessage, type ConsoleMessage, type GuestProfile, type LineMessage, type RelayPresence, type StageMessage } from '@/agents/feed/protocol'
import { createSseStageFeed, type FeedStatus } from '@/agents/feed/stageFeed'
import { emit } from './events.ts'
import { CAST_ACT_LABELS, FEED_LABELS, LINE_PHASE_LABELS, PHASE_LABELS } from './labels.ts'
import { applyStageMessage, isLine, itemFor, persistable, quietly, removeItem, restoreState, type DirectorState, type LineItem, type StageItem } from './timeline.ts'

const STATE_KEY = 'stage-director-v2'
const HOSTS_KEY = 'director-hosts-v1'

export interface LineDraft { speaker: string; text: string; replyTo: string[]; evidenceIds: string[]; topic: string; interrupt: boolean }

function load<T>(storage: Storage, key: string): T | null {
  try { return JSON.parse(storage.getItem(key) || 'null') as T | null } catch { return null }
}
function store(storage: Storage, key: string, value: unknown) {
  try { storage.setItem(key, JSON.stringify(value)) } catch { /* Storage is only a convenience. */ }
}

const open = (item: LineItem | StageItem) => item.phase === 'queued' || item.phase === 'deciding' || item.phase === 'speaking' || (!item.phase && !!item.times.sent)

// The console's one connection to the stage. Everything the 演播, 资产 and 系统 pages show comes through
// here: the phone's snapshot (phase and line-up), each line's progress and Jev decision, the phone's
// generated hosts; and everything they do goes out from here.
function createDirector() {
  const saved = load<{ lastEventId?: unknown; state?: Partial<DirectorState> }>(sessionStorage, STATE_KEY)
  const state = reactive<DirectorState>(restoreState(saved?.state ?? {}))
  const status = ref<FeedStatus>('connecting')
  const peers = ref<RelayPresence | null>(null)
  // The phone's generated hosts, for the asset library; kept across reloads (the relay keeps only the latest of each).
  const hosts = reactive<Record<string, AgentProfile>>(load<Record<string, AgentProfile>>(localStorage, HOSTS_KEY) ?? {})
  const feed = createSseStageFeed({ role: 'console', lastEventId: typeof saved?.lastEventId === 'string' ? saved.lastEventId : undefined })
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  function save() {
    clearTimeout(saveTimer)
    store(sessionStorage, STATE_KEY, { lastEventId: feed.lastEventId, state: persistable(toRaw(state)) })
  }
  function saveSoon() {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(save, 300)
  }

  function receiveAgent(contract: AgentProfile) {
    if (JSON.stringify(hosts[contract.id]) === JSON.stringify(contract)) return
    hosts[contract.id] = contract
    store(localStorage, HOSTS_KEY, toRaw(hosts))
    emit('agent.ready', contract.id, `${contract.name} · ${contract.restaurant}`)
  }

  const speakerOfItem = (id: string) => {
    const item = itemFor(state, id)
    return item?.type === 'line' ? item.speaker : item?.type === 'stage' ? item.who : undefined
  }

  // One line per message for the 事件 panel and the system page's lights.
  function report(message: StageMessage, previous: DirectorState['snapshot']) {
    switch (message.kind) {
      case 'snapshot': {
        if (message.phase !== previous?.phase) emit('phone.phase', undefined, PHASE_LABELS[message.phase])
        for (const entry of message.cast) {
          const before = previous?.cast.find((item) => item.id === entry.id)
          if (entry.status === 'generating' && entry.step && entry.step !== before?.step) emit('host.gen', entry.id, entry.step)
          if (entry.status === 'ready' && before && before.status !== 'ready') emit('host.ready', entry.id, entry.name)
          if (entry.kind === 'guest' && before && before.onStage !== entry.onStage) emit(entry.onStage ? 'cast.on' : 'cast.off', entry.id)
        }
        return
      }
      case 'line': emit(message.replaces ? 'line.resend' : 'line.send', message.speaker, message.text.slice(0, 24) + (message.replyTo?.length ? ` ↩×${message.replyTo.length}` : '')); return
      case 'user-line': emit('user.line', 'user', message.text.slice(0, 24)); return
      case 'cast': if (!state.quiet.includes(message.id)) emit('cast.send', message.who, CAST_ACT_LABELS[message.act]); return
      case 'drop': emit('line.drop', speakerOfItem(message.id), '撤回'); return
      case 'clear': emit('stage.clear', undefined, '舞台已清空'); return
      case 'line-state': {
        if (state.quiet.includes(message.id)) return
        const item = itemFor(state, message.id)
        const label = item?.type === 'stage' ? `${CAST_ACT_LABELS[item.act]} · ${LINE_PHASE_LABELS[message.phase]}` : LINE_PHASE_LABELS[message.phase]
        emit(`${item?.type === 'stage' ? 'cast' : 'line'}.${message.phase}`, speakerOfItem(message.id), label + (message.note ? ` · ${message.note}` : ''))
        return
      }
      case 'decision': {
        const s = message.speaker
        const picks = [s.expr?.zh, s.gesture?.zh, s.act?.id === 'none' ? null : s.act?.zh].filter(Boolean).join(' / ') || s.stance?.zh || ''
        emit('jev.answer', speakerOfItem(message.lineId), `${message.source === 'jev' ? 'Jev' : '基线'}${message.latencyMs != null ? ` ${message.latencyMs}ms` : ''} → ${picks}`)
        return
      }
      case 'agent': return
    }
  }

  feed.onStatus((next, nextPeers) => {
    if (next !== status.value) emit('relay.state', undefined, FEED_LABELS[next])
    if (nextPeers && (nextPeers.app !== peers.value?.app)) emit('phone.presence', undefined, `${nextPeers.app} 台手机在线`)
    status.value = next
    peers.value = nextPeers
  })
  feed.onMessage((message, meta) => {
    if (message.kind === 'agent') { receiveAgent(message.contract); return }
    const previous = state.snapshot
    applyStageMessage(state, message, meta)
    report(message, previous)
    saveSoon()
  })
  window.addEventListener('pagehide', save)

  /* ---------------------------------------------------------------- derived */
  const cast = computed(() => state.snapshot?.cast ?? [])
  const onStage = computed(() => cast.value.filter((entry) => entry.onStage !== false && (entry.kind === 'guest' || entry.status !== 'error')))
  const wings = computed(() => cast.value.filter((entry) => entry.onStage === false))
  const lines = computed(() => state.timeline.filter(isLine))
  /** The line the phone is deciding or performing now. */
  const playing = computed(() => [...lines.value].reverse().find((line) => line.phase === 'deciding' || line.phase === 'speaking') ?? null)
  /** Anything sent that the phone has not finished (or dropped) yet. */
  const busy = computed(() => state.timeline.some((item) => item.type !== 'clear' && open(item)))

  /* ---------------------------------------------------------------- actions */
  async function send(message: ConsoleMessage) { await feed.send(message) }

  // The first thing sent in a thread fixes the line-up play-all starts from.
  function noteLineup() {
    if (state.lineup0 || state.timeline.some((item) => item.type !== 'clear')) return
    state.lineup0 = cast.value.filter((entry) => entry.kind === 'guest' && entry.onStage).map((entry) => entry.id)
  }

  async function sendLine(draft: LineDraft) {
    noteLineup()
    const message: LineMessage = {
      kind: 'line', id: createMessageId('c'), speaker: draft.speaker, text: draft.text.trim(),
      ...(draft.replyTo.length ? { replyTo: draft.replyTo } : {}), ...(draft.evidenceIds.length ? { evidenceIds: draft.evidenceIds } : {}),
      ...(draft.topic.trim() ? { topic: draft.topic.trim() } : {}), ...(draft.interrupt ? { interrupt: true } : {}),
    }
    await send(message)
    return message.id
  }

  // A replay or an edit: the same line under a new id, carrying the card's hand-set slots. The phone performs it
  // again and keeps the original's place in its history; reports come back to the original card.
  async function resend(card: LineItem, changes: { text?: string; override?: Record<string, string> } = {}) {
    const id = createMessageId('r')
    const override = changes.override ?? card.override
    state.aliases[id] = card.id
    const message: LineMessage = {
      kind: 'line', id, speaker: card.speaker, text: (changes.text ?? card.text).trim(), replaces: card.id,
      ...(card.replyTo.length ? { replyTo: card.replyTo.slice(0, 12) } : {}), ...(card.topic ? { topic: card.topic } : {}),
      ...(card.evidenceIds.length ? { evidenceIds: card.evidenceIds.slice(0, 12) } : {}), ...(override && Object.keys(override).length ? { override } : {}),
    }
    try { await send(message) } catch (error) { delete state.aliases[id]; throw error }
  }

  async function stageAct(act: CastAct, who?: string, guest?: GuestProfile) {
    noteLineup()
    const message: CastMessage = { kind: 'cast', id: createMessageId('s'), act, ...(who ? { who } : {}), ...(guest && act === 'enter' ? { guest } : {}) }
    await send(message)
  }

  async function replayStage(item: StageItem, guest?: GuestProfile) {
    const id = createMessageId('s')
    state.aliases[id] = item.id
    await send({ kind: 'cast', id, act: item.act, ...(item.who ? { who: item.who } : {}), ...(guest && item.act === 'enter' ? { guest } : {}) })
  }

  // Deleting a card withdraws it from the phone too if it has not finished.
  async function remove(item: LineItem | StageItem) {
    const unfinished = open(item)
    removeItem(state, item.id)
    save()
    if (unfinished) await send({ kind: 'drop', id: item.live ?? item.id }).catch(() => undefined)
  }

  async function clearStage(quiet = false) {
    if (quiet) state.quietClears++
    try { await send({ kind: 'clear' }) } catch (error) { if (quiet) state.quietClears--; throw error }
  }

  /** Empties the thread here only (the phone keeps its history). */
  function clearThread() {
    state.timeline = []
    state.aliases = {}
    state.lineup0 = null
    save()
  }

  /** Setup sent by play-all and session loading: the line-up reset and the opening guests, without rows. */
  async function quietCast(act: CastAct, who?: string, guest?: GuestProfile) {
    const id = createMessageId('q')
    quietly(state, id)
    await send({ kind: 'cast', id, act, ...(who ? { who } : {}), ...(guest && act === 'enter' ? { guest } : {}) })
  }

  function dispose() {
    save()
    window.removeEventListener('pagehide', save)
    feed.close()
  }

  return {
    state, status, peers, hosts, cast, onStage, wings, lines, playing, busy, save,
    sendLine, resend, stageAct, replayStage, remove, clearStage, clearThread, quietCast, dispose,
  }
}

export type Director = ReturnType<typeof createDirector>
let director: Director | null = null

/** The console's single stage connection, shared by every page. */
export function useDirector(): Director {
  return director ??= createDirector()
}
