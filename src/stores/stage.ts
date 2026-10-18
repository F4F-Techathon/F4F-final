import { computed, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { createSseStageFeed, type AppStageFeed, type FeedStatus } from '@/agents/feed/stageFeed'
import type { AgentMessage, AppMessage, AppPhase, CastEntry, CastMessage, LineMessage, LinePhase, RelayPresence } from '@/agents/feed/protocol'
import { applyCast, emptyLineup, type CastResult, type Lineup } from '@/agents/stage/lineup'

const RESUME_KEY = 'stage-feed-app'
const LINEUP_KEY = 'stage-lineup-v1'

/** A line or a stage direction, performed in arrival order; a cut-in line goes first. */
export type StageCue = LineMessage | CastMessage

interface Arrival { order: number; eventId: string }

function loadLineup(): Lineup {
  try {
    const saved = JSON.parse(sessionStorage.getItem(LINEUP_KEY) || 'null')
    if (saved && Array.isArray(saved.guests) && Array.isArray(saved.out)) return saved as Lineup
  } catch { /* The invited hosts alone stand on stage. */ }
  return emptyLineup()
}

// The stage's link to whoever writes its lines: the test console today, the multi-agent backend
// later, both through the relay. Cues queue here in arrival order; the stage reports back its phase,
// cast and line-up, every cue's progress, the decisions behind each performance and its generated hosts.
export const useStageStore = defineStore('stage', () => {
  const status = ref<FeedStatus>('closed')
  const peers = ref<RelayPresence | null>(null)
  const queue = ref<StageCue[]>([])
  const clears = ref(0)
  /** Bumps when a cut-in line arrives: the line in progress gives way to it. */
  const cuts = ref(0)
  /** A withdrawn cue that had already left the queue: the playback stops it if it is the one in progress. */
  const dropped = ref<{ id: string; at: number; note?: string } | null>(null)
  const lineup = ref<Lineup>(loadLineup())
  // Why queued cues are not being performed right now, so whoever sent them is not left guessing: the page
  // the phone is on (App) or the debate page's own pause (DebateView). Empty while the stage is free.
  const holdPage = ref(''), holdStage = ref('')
  const hold = computed(() => holdPage.value || holdStage.value)
  const feed = shallowRef<AppStageFeed | null>(null)
  const seen = new Set<string>()
  // Cues not yet over, and those over but not yet safe to resume after: a cut-in line or a withdrawn one can
  // end before earlier cues, and a reload must still replay those.
  const pending = new Map<string, Arrival>()
  let over: Arrival[] = []
  let arrivals = 0
  let lastSnapshot: AppMessage | null = null
  const agents = new Map<string, { message: AgentMessage; raw: string }>()

  function resumePoint() {
    try { return sessionStorage.getItem(RESUME_KEY) ?? undefined } catch { return undefined }
  }
  function remember(eventId: string) {
    try { sessionStorage.setItem(RESUME_KEY, eventId) } catch { /* A reload then replays from the relay's backlog. */ }
  }

  function send(message: AppMessage) {
    void feed.value?.send(message).catch(() => undefined)
  }

  // Whoever else follows the stage's progress on a cue (the multi-agent backend's bridge) hears it here too.
  const stateListeners = new Set<(id: string, phase: LinePhase, note?: string) => void>()
  function onLineState(listener: (id: string, phase: LinePhase, note?: string) => void) {
    stateListeners.add(listener)
    return () => { stateListeners.delete(listener) }
  }

  function lineState(id: string, phase: LinePhase, note?: string) {
    send({ kind: 'line-state', id, phase, ...(note ? { note: note.slice(0, 120) } : {}) })
    for (const listener of stateListeners) listener(id, phase, note)
  }

  // A cue is over (performed or dropped). The resume point moves to the newest finished event that has
  // nothing unfinished before it, so a reload replays exactly what was not performed.
  function finish(id: string) {
    const arrival = pending.get(id)
    if (!arrival) return
    pending.delete(id)
    over.push(arrival)
    const floor = Math.min(Infinity, ...[...pending.values()].map((item) => item.order))
    const safe = over.filter((item) => item.order < floor)
    if (!safe.length) return
    remember(safe.reduce((newest, item) => (item.order > newest.order ? item : newest)).eventId)
    over = over.filter((item) => item.order >= floor)
  }

  function clearQueue(note: string) {
    for (const cue of queue.value) { lineState(cue.id, 'dropped', note); finish(cue.id) }
    queue.value = []
  }

  function withdraw(id: string, note = '导演台撤回') {
    const index = queue.value.findIndex((cue) => cue.id === id)
    if (index < 0) { dropped.value = { id, at: Date.now(), note }; return }
    queue.value.splice(index, 1)
    lineState(id, 'dropped', note)
    finish(id)
  }

  // Cues that come from this phone rather than the relay (the multi-agent backend's lines): performed like any
  // other, but never replayed after a reload, since the backend session that wrote them ends with the page.
  function enqueueLocal(cue: StageCue) {
    if (seen.has(cue.id)) return
    seen.add(cue.id)
    if (cue.kind === 'line' && cue.interrupt) { queue.value.unshift(cue); cuts.value++ }
    else queue.value.push(cue)
    lineState(cue.id, 'queued', hold.value || undefined)
  }

  // A local line, copied to the relay so consoles show it with the decisions and states this phone reports.
  // This phone has already seen the id, so the relay's echo back to it is ignored; other phones skip it (mirror).
  function mirror(line: LineMessage) {
    void fetch('/api/stage/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'console', message: { ...line, mirror: true } }) })
      .catch(() => undefined)
  }

  // The relay's SSE feed by default; tests and other transports can hand in their own.
  function connect(create: (lastEventId?: string) => AppStageFeed = (lastEventId) => createSseStageFeed({ role: 'app', lastEventId })) {
    if (feed.value) return
    const next = create(resumePoint())
    next.onStatus((value, presence) => {
      status.value = value
      peers.value = presence
      if (value !== 'open') return
      if (lastSnapshot) send(lastSnapshot)
      for (const { message } of agents.values()) send(message)
    })
    next.onMessage((message, meta) => {
      if (message.kind === 'clear') {
        clearQueue('舞台已清空')
        clears.value++
        // The cue in progress is dropped with everything else; nothing before the clear needs replaying.
        pending.clear()
        over = []
        remember(meta.id)
        return
      }
      if (message.kind === 'drop') { withdraw(message.id); return }
      if (seen.has(message.id)) return
      seen.add(message.id)
      pending.set(message.id, { order: ++arrivals, eventId: meta.id })
      // Another phone's own line, copied for the consoles: that phone performs it, this one must not talk over it.
      if (message.kind === 'line' && message.mirror) { finish(message.id); return }
      if (message.kind === 'line' && message.interrupt) {
        queue.value.unshift(message)
        cuts.value++
      } else queue.value.push(message)
      lineState(message.id, 'queued', hold.value || undefined)
    })
    feed.value = next
  }

  function disconnect() {
    feed.value?.close()
    feed.value = null
    status.value = 'closed'
  }

  function next() { return queue.value.shift() }

  // Lines already performed before a reload are never performed twice.
  function markPerformed(ids: Iterable<string>) { for (const id of ids) seen.add(id) }

  function snapshot(phase: AppPhase, cast: CastEntry[]) {
    const message: AppMessage = { kind: 'snapshot', phase, cast }
    if (JSON.stringify(message) === JSON.stringify(lastSnapshot)) return
    lastSnapshot = message
    send(message)
  }

  // A stage direction takes effect on the line-up the moment it is performed; `hosts` are the invited restaurants.
  function applyCue(cue: CastMessage, hosts: readonly string[]): CastResult {
    const result = applyCast(lineup.value, cue, hosts)
    if (result.applied) {
      lineup.value = result.lineup
      try { sessionStorage.setItem(LINEUP_KEY, JSON.stringify(lineup.value)) } catch { /* The line-up then lasts until a reload. */ }
    }
    return result
  }

  // Each generated host once per version; all of them again after a reconnect, in case the relay restarted.
  function publishAgent(message: AgentMessage) {
    const raw = JSON.stringify(message)
    if (agents.get(message.contract.id)?.raw === raw) return
    agents.set(message.contract.id, { message, raw })
    send(message)
  }

  // A new reason (or none) is reported on every cue still waiting.
  watch(hold, (note) => { for (const cue of queue.value) lineState(cue.id, 'queued', note || undefined) })

  return { status, peers, queue, clears, cuts, dropped, lineup, holdPage, holdStage, hold, connect, disconnect, next, finish, clearQueue, lineState, onLineState, send, snapshot, markPerformed, applyCue, publishAgent, enqueueLocal, drop: withdraw, mirror }
})
