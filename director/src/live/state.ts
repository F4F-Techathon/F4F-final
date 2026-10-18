import { computed, reactive, watch } from 'vue'
import { HOST_SPEAKER, STAGE_MAX, USER_SPEAKER, type CastEntry } from '@/agents/feed/protocol'
import { useDirector } from '../core/director.ts'
import { ME, ORB, useRegistry, type Character } from '../core/registry.ts'
import { isLine, isStage, type LineItem } from '../core/timeline.ts'
import { toast } from '../ui/toast.ts'

export const MAX_QUOTES = 6
const SESSION_KEY = 'director-live-session'

function savedSession(): { id: string | null; name: string } {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')
    if (value && typeof value.name === 'string') return { id: typeof value.id === 'string' ? value.id : null, name: value.name }
  } catch { /* a fresh tab starts unnamed */ }
  return { id: null, name: '' }
}

// What the 演播 page is doing: who speaks next, which lines the next one answers, the composer's options,
// the card open in the inspector or being edited, and play-all.
export const live = reactive({
  speaker: '',
  quotes: [] as string[],
  interrupt: false,
  topic: '',
  evidence: [] as string[],
  inspecting: null as string | null,
  editing: null as string | null,
  draft: '',
  adding: false,
  playing: false,
  loop: false,
  session: savedSession(),
})

// The thread itself survives a reload (core/director.ts); so does the name it was saved under.
watch(() => ({ ...live.session }), (session) => {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)) } catch { /* only a convenience */ }
})

export type AgentState = 'speaking' | 'preparing' | 'reacting' | 'queued' | 'walking' | 'idle' | 'wing' | 'making'
export const STATE_ZH: Record<AgentState, string> = { speaking: '发言中', preparing: 'Jev 决策中', reacting: '反应中', queued: '排队', walking: '走位', idle: '待命', wing: '候场', making: '化妆中' }

export interface Now { state: AgentState; label: string; expr: string; ex: string; queue?: number }

function createLive() {
  const director = useDirector(), registry = useRegistry()

  const character = (id: string): Character => registry.get(id) ?? (id === HOST_SPEAKER ? ORB : id === USER_SPEAKER ? ME : {
    id, kind: 'agent', name: director.state.roster[id]?.name ?? id, fullName: id, restaurant: director.state.roster[id]?.restaurant ?? '',
    plate: '', color: director.state.roster[id]?.color ?? '#8A93A6', figure: null, defaults: ORB.defaults,
  })
  const colorOf = (id: string) => character(id).color

  /** Who stands on the phone's floor now, left to right. */
  const performers = computed<CastEntry[]>(() => director.onStage.value.filter((entry) => entry.status !== 'error'))
  /** Who can speak, in order: the customer, everyone on stage, then the host (Alt+1… follows this order). */
  const speakers = computed(() => [ME.id, ...performers.value.map((entry) => entry.id), ORB.id])
  const speaker = computed(() => (speakers.value.includes(live.speaker) ? live.speaker : performers.value[0]?.id ?? ORB.id))

  const queuedLines = computed(() => director.lines.value.filter((line) => line.phase === 'queued'))
  const latestDecision = (id: string) => [...director.lines.value].reverse().find((line) => line.speaker === id && line.decision)?.decision

  // Every performer's state, from the line in progress and the queue (the dock's chips and faces).
  function nowOf(id: string): Now {
    const playing = director.playing.value
    const entry = director.cast.value.find((item) => item.id === id)
    if (entry?.status === 'generating' || entry?.status === 'idle') return { state: 'making', label: entry.step ? `化妆中 · ${entry.step}` : '化妆中', expr: 'idle', ex: '' }
    if (entry?.onStage === false) {
      const queued = director.state.timeline.some((item) => isStage(item) && item.who === id && item.act === 'enter' && (item.phase === 'queued' || !item.phase))
      return { state: 'wing', label: queued ? '排队登场' : '候场', expr: 'idle', ex: '' }
    }
    const walking = director.state.timeline.some((item) => isStage(item) && item.who === id && item.phase === 'speaking')
    if (walking) return { state: 'walking', label: STATE_ZH.walking, expr: 'idle', ex: '' }
    if (playing?.speaker === id) {
      const s = playing.decision?.speaker
      const ex = [s?.expr?.zh, s?.gesture?.zh].filter(Boolean).join(' · ')
      return playing.phase === 'speaking'
        ? { state: 'speaking', label: STATE_ZH.speaking, expr: s?.expr?.id ?? 'pitch', ex }
        : { state: 'preparing', label: STATE_ZH.preparing, expr: 'idle', ex }
    }
    const reaction = playing?.phase === 'speaking' ? playing.decision?.listeners[id]?.reaction : undefined
    if (reaction) return { state: 'reacting', label: STATE_ZH.reacting, expr: reaction.id, ex: reaction.zh }
    const position = queuedLines.value.findIndex((line) => line.speaker === id)
    if (position >= 0) return { state: 'queued', label: `排队 #${position + 1}`, expr: 'idle', ex: '', queue: position + 1 }
    const last = latestDecision(id)?.speaker
    return { state: 'idle', label: STATE_ZH.idle, expr: 'idle', ex: last ? [last.expr?.zh, last.gesture?.zh].filter(Boolean).join(' · ') : '' }
  }

  function setSpeaker(id: string) {
    if (!speakers.value.includes(id)) { toast('不在台上，先让其登场'); return }
    live.speaker = id
    live.evidence = []
  }

  function toggleQuote(id: string) {
    if (live.quotes.includes(id)) { live.quotes = live.quotes.filter((item) => item !== id); return }
    if (live.quotes.length >= MAX_QUOTES) { toast(`一次最多回复 ${MAX_QUOTES} 条`); return }
    live.quotes = [...live.quotes, id]
  }

  // Alt+↑: the latest line not by the current speaker and not quoted yet; press again for the one before.
  function quoteRecent() {
    const line = [...director.lines.value].reverse().find((item) => item.seen && item.speaker !== speaker.value && !live.quotes.includes(item.id))
    if (line) toggleQuote(line.id)
  }

  /** How many more could stand on stage: invited hosts plus guests, six at most. */
  const room = computed(() => STAGE_MAX - performers.value.length)

  const line = (id: string): LineItem | undefined => director.state.timeline.find((item): item is LineItem => isLine(item) && item.id === id)

  return { character, colorOf, performers, speakers, speaker, nowOf, setSpeaker, toggleQuote, quoteRecent, room, line }
}

export type Live = ReturnType<typeof createLive>
let instance: Live | null = null
export function useLive(): Live {
  return instance ??= createLive()
}
