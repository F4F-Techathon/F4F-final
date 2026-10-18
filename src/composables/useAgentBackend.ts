import { computed, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue'
import type { LineMessage } from '@/agents/feed/protocol'
import { createMicCapture, type MicCapture } from '@/agents/backend/mic'
import { createPcmPlayer } from '@/agents/backend/player'
import type { AudioEvent, BackendEvent, ErrorEvent, ResultEvent, RestaurantsUpdated, SpeechReady, StateEvent, TextDone, TranscriptEvent, TurnEvent } from '@/agents/backend/protocol'
import { agentSocketUrl, createAgentSession, type AgentSession } from '@/agents/backend/session'
import { characterHints, evidenceFromBackend, expectedSamples, historyForBackend, lineFromSpeech, preferencesFor } from '@/agents/backend/brief'
import { registerEvidence } from '@/data/restaurants'
import type { Restaurant } from '@/data/types'
import { useCastStore } from '@/stores/cast'
import { useDiningStore } from '@/stores/dining'
import { useIntakeStore } from '@/stores/intake'
import { useStageStore } from '@/stores/stage'
import type { LineVoice } from './useLinePlayback'
import type { SpeechEngine } from './usePressToTalk'

/** off: not started; connecting / starting: on its way; live: debating; waiting: the agents have run out of things
 * to say until the customer speaks; stalled: turns keep failing (the model is unreachable); unavailable: the backend
 * could not be reached (the director console still works). */
export type AgentStatus = 'off' | 'connecting' | 'starting' | 'live' | 'waiting' | 'stalled' | 'unavailable'

interface Turn {
  turnId: string
  epoch: number
  audio: boolean
  textDone: boolean
  stageDone: boolean
  receipted: boolean
}

interface Options {
  /** The invited hosts standing on stage; the debate is theirs. */
  hosts: () => Restaurant[]
  /** The stage's sound toggle: on, the backend voices the lines. */
  audio: Ref<boolean>
  /** The debate page is past its opening and may start. */
  ready: () => boolean
  /** Puts the customer's words on stage (the debate page's own interjection path). */
  interject: (text: string) => void
  /** Turn the sound on by default when the backend can voice the lines and the browser lets audio play. */
  autoVoice?: boolean
}

const RETRY_LIMIT = 3
const SILENCE_FRAMES = 60 // 1.2 s of silence after a release closes the utterance for the backend's VAD (0.55 s)

/** opening: the debate is about to start; reply: the customer has just spoken. */
export type InterludeKind = 'opening' | 'reply'

/** What the host Orb says while the backend writes its first answer, in turn. */
export const INTERLUDES: Record<InterludeKind, readonly string[]> = {
  opening: ['各位选手准备好了吗？开始抢客！', '人都到齐了，今晚这顿饭谁来争取一下？', '好，比赛开始！各位店主，亮出你们的招牌吧。'],
  reply: ['收到！让几位选手接一下你这个问题。', '好问题，各位店主，谁先来回答？', '记下了，选手们，轮到你们表现了！'],
}

interface InterludeStage {
  readonly queue: readonly { id: string }[]
  enqueueLocal(cue: LineMessage): void
  mirror(line: LineMessage): void
  drop(id: string, note?: string): void
}

// The backend's first answer takes a few seconds (two model calls: who speaks, then what), so the host fills them
// with a short line of its own. It is this phone's line, never a backend turn, and the backend never hears of it.
// The backend's answer takes its place if it has not begun yet; once on stage it plays to the end.
export function createInterludes(stage: InterludeStage) {
  const said: Record<InterludeKind, number> = { opening: 0, reply: 0 }
  let waiting = ''

  function withdraw(note: string) {
    if (waiting && stage.queue.some((cue) => cue.id === waiting)) stage.drop(waiting, note)
    waiting = ''
  }

  function say(kind: InterludeKind) {
    withdraw('换了一句串场')
    const lines = INTERLUDES[kind], count = said[kind]++
    const line: LineMessage = { kind: 'line', id: `agent-interlude-${kind}-${Date.now().toString(36)}-${count}`, speaker: 'host', text: lines[count % lines.length]!, topic: '串场' }
    waiting = line.id
    stage.enqueueLocal(line)
    stage.mirror(line)
    return line
  }

  return { say, withdraw }
}

// The multi-agent backend on the debate stage (Backend/eat-what-backend, WS /api/realtime through /api/agents/realtime).
// The backend decides who speaks and what they say, and voices it; this page performs each turn as a stage line
// (Jev still decides how), plays its audio, and tells the backend what was actually heard. The customer's speech
// goes to the backend's own recognition while it is available, the browser's otherwise.
export function useAgentBackend({ hosts, audio, ready, interject, autoVoice = true }: Options) {
  const dining = useDiningStore(), cast = useCastStore(), stage = useStageStore(), intake = useIntakeStore()
  const status = ref<AgentStatus>('off')
  const engine = ref('')
  const tts = ref('')
  const sttReady = ref(false)
  const error = ref('')
  const session = shallowRef<AgentSession | null>(null)
  const player = createPcmPlayer()
  const turns = new Map<string, Turn>()
  const plans = new Map<string, TurnEvent>()
  const interludes = createInterludes(stage)
  let rostered = false, started = false, failures = 0, retryTimer: ReturnType<typeof setTimeout> | undefined
  let heardByBackend = '' // a transcript the backend already acted on: it is shown, never sent back
  let choseSilence = false // the customer turned the sound off: a reconnect does not turn it back on
  // What the host says once the hosts are ready: a resumed debate does not open again, but a question the customer
  // left unanswered still gets its reply line.
  let opener: InterludeKind | null = 'opening'

  let micStream = ''
  let disposed = false
  // Development: the last events and receipts, for checking a debate step by step (window.__stage.agent.trail).
  const trail: unknown[][] = []
  const note = (...item: unknown[]) => { if (import.meta.env.DEV) { trail.push([Math.round(performance.now()), ...item]); if (trail.length > 300) trail.shift() } }

  const live = computed(() => status.value === 'live' || status.value === 'waiting' || status.value === 'stalled')
  const onStageIds = () => hosts().map((restaurant) => restaurant.id)
  const audioWanted = () => audio.value && player.ready && !!tts.value && tts.value !== 'none'

  function receipt(turn: Turn, kind: 'ended' | 'interrupted' | 'failed') {
    if (turn.receipted || !session.value) return
    turn.receipted = true
    const played = turn.audio ? player.played(turn.turnId) : 0
    note('receipt', turn.turnId, turn.epoch, kind, played)
    session.value.playback(turn.turnId, turn.epoch, kind, played)
  }

  // A turn is over for the backend once the stage has finished it and its full text has arrived; the audio was
  // heard to the end by then, because the line waits for it.
  function settle(turn: Turn) {
    if (!turn.stageDone || !turn.textDone || turn.receipted) return
    // The backend accepts "ended" only once every sample it sent was played; wait for the player if need be.
    if (turn.audio) void player.play(turn.turnId, turn.epoch).then(() => receipt(turn, 'ended'))
    else receipt(turn, 'ended')
  }

  function cancelTurn(turnId: string) {
    const turn = turns.get(turnId)
    player.stop(turnId)
    if (!turn || turn.receipted) return
    receipt(turn, 'interrupted')
    stage.drop(turnId, '后端取消了这句')
  }

  function onEvent(event: BackendEvent) {
    const data = event.data as Record<string, unknown>
    if (event.type !== 'workflow' && (event.type !== 'trace' || ['coordinator.wait', 'interrupt', 'playback.ack', 'history.conservative'].includes(String(data.stage))))
      note(event.type, event.epoch, data.phase ?? data.stage ?? data.code ?? data.status ?? '', data.turnId ?? data.message ?? data.text ?? '', data.samples ?? '')
    switch (event.type) {
      case 'state': {
        const state = data as StateEvent
        if (state.engine) engine.value = state.engine
        if (state.ttsProvider) tts.value = state.ttsProvider
        if (state.micReady && (data as { micStreamId?: string }).micStreamId === micStream) sttReady.value = true
        // The backend's first word says how it can speak; the session starts on it.
        if (state.status === 'ready' && !started) void begin()
        break
      }
      case 'restaurants.updated': {
        // The first roster means the agents are built: the debate can begin.
        const roster = data as unknown as RestaurantsUpdated
        if (!rostered && roster.restaurants.length) { rostered = true; status.value = 'live'; session.value?.resume(); if (opener) interludes.say(opener) }
        break
      }
      case 'turn': {
        const turn = data as unknown as TurnEvent
        if (turn.phase === 'start') { plans.set(turn.turnId, turn); if (status.value === 'waiting') status.value = 'live' }
        else if (turn.phase === 'cancel') cancelTurn(turn.turnId)
        break
      }
      case 'speech.ready': {
        const ready = data as unknown as SpeechReady
        registerEvidence(ready.evidence.map(evidenceFromBackend))
        turns.set(ready.turnId, { turnId: ready.turnId, epoch: event.epoch, audio: !!ready.audioEnabled, textDone: false, stageDone: false, receipted: false })
        while (turns.size > 60) turns.delete(turns.keys().next().value!)
        const line = lineFromSpeech(ready, plans.get(ready.turnId))
        plans.delete(ready.turnId)
        interludes.withdraw('后端的回应先到了')
        stage.enqueueLocal(line)
        stage.mirror(line)
        failures = 0
        if (status.value === 'stalled' || status.value === 'waiting') status.value = 'live'
        break
      }
      case 'audio': {
        const audioEvent = data as unknown as AudioEvent
        if (audioEvent.phase === 'end' && typeof audioEvent.samples === 'number') player.end(audioEvent.turnId, audioEvent.samples)
        break
      }
      case 'text': {
        const done = data as unknown as TextDone
        const turn = turns.get(done.turnId)
        if (turn) { turn.textDone = true; settle(turn) }
        break
      }
      case 'transcript': {
        const transcript = data as unknown as TranscriptEvent
        // While the button is held, show what has been heard so far; only the final one answers the press.
        if (transcript.phase === 'interim') { if (micListening.value && transcript.text) { micTranscript.value = transcript.text; handlers?.onText(transcript.text) } }
        else heard(transcript.text || '')
        break
      }
      case 'result': recommend(data as unknown as ResultEvent); break
      case 'trace':
        if ((data as { stage?: string }).stage === 'coordinator.wait') status.value = 'waiting'
        break
      case 'error': failed(data as unknown as ErrorEvent); break
    }
  }

  // The backend's recommendation, said by the host.
  function recommend(result: ResultEvent) {
    const shop = dining.selected.find((restaurant) => restaurant.id === result.restaurantId)
    const text = shop ? `按你的条件，我先推荐${shop.name}：${result.reasons[0] || ''}${result.cautions[0] ? `（${result.cautions[0]}）` : ''}`
      : `现在还挑不出完全合你条件的：${result.cautions[0] || '资料不够'}`
    const line: LineMessage = { kind: 'line', id: `agent-result-${Date.now().toString(36)}`, speaker: 'host', text: text.slice(0, 600), topic: '推荐' }
    interludes.withdraw('后端的推荐先到了')
    stage.enqueueLocal(line)
    stage.mirror(line)
  }

  // A turn that failed (a model error, an unusable draft) pauses the backend; it is nudged on a few times, then the
  // customer is told and the debate waits for them.
  function failed(problem: ErrorEvent) {
    if (problem.code === 'STT_FAILED' || problem.code === 'MIC_PIPELINE_FAILED') {
      sttReady.value = false
      dining.notify('后端语音识别暂时不可用，改用浏览器识别')
      return
    }
    if (problem.code !== 'TURN_FAILED') return
    if (++failures > RETRY_LIMIT) { status.value = 'stalled'; dining.notify('选手们暂时连不上模型，稍后点「再试一次」'); return }
    clearTimeout(retryTimer)
    retryTimer = setTimeout(() => { if (session.value && !dining.paused) session.value.resume() }, 1500)
  }

  // The stage reports every line's progress; the backend hears about its own turns.
  const stopListening = stage.onLineState((id, phase, note) => {
    const turn = turns.get(id)
    if (!turn) return
    if (phase === 'done') {
      turn.stageDone = true
      // Cut short by the customer: only what was played counts as heard.
      if (note?.includes('打断')) { player.stop(id); receipt(turn, 'interrupted') }
      else settle(turn)
    } else if (phase === 'dropped' && !turn.receipted) {
      // The stage could not perform it (its speaker left): the backend would wait for it, so move it on.
      player.stop(id)
      receipt(turn, 'failed')
      if (!note?.includes('后端取消')) { session.value?.interrupt(); session.value?.resume() }
    }
  })

  player.onProgress((turnId, epoch, played) => { if (session.value && !turns.get(turnId)?.receipted) session.value.playback(turnId, epoch, 'progress', played) })

  function open() {
    const ids = onStageIds()
    if (disposed || session.value || !ids.length) return
    status.value = 'connecting'
    rostered = false
    started = false
    const next = createAgentSession(agentSocketUrl(location), {
      status(value) {
        if (value === 'open') status.value = 'starting'
        if (value === 'closed') {
          if (session.value === next) session.value = null
          sttReady.value = false
          player.stop()
          dropUnheard('多智能体连接断开')
          if (!disposed) status.value = rostered ? 'off' : 'unavailable'
        }
      },
      event: onEvent,
      epoch() { for (const turn of turns.values()) if (!turn.receipted) player.stop(turn.turnId) },
      audio(header, pcm) { player.push(header.turnId, header.epoch, header.sampleOffset, pcm, 24000) },
    })
    session.value = next
  }

  // Voices on when the backend has them and the page may play sound (the customer has tapped through the app, so
  // most browsers allow it now); the session then starts with everything the debate needs. A debate the customer
  // comes back to (from a shop's page, after a reload or a reconnect) brings the lines already performed, so the
  // hosts carry on from them instead of opening and introducing themselves again.
  async function begin() {
    const next = session.value
    if (!next || started) return
    started = true
    const canSpeak = !!tts.value && tts.value !== 'none'
    if (canSpeak && (audio.value || autoVoice && !choseSilence) && await player.unlock() && !audio.value) audio.value = true
    if (session.value !== next) return
    const history = historyForBackend(dining.history, onStageIds())
    next.start({
      restaurantIds: onStageIds(),
      preferences: preferencesFor(dining.filters, dining.rawInput, intake.result?.requirements.people ?? null),
      characters: characterHints(hosts(), (restaurant) => cast.contractOf(restaurant as Restaurant)),
      audioEnabled: audioWanted(),
      ...(history.length ? { history } : {}),
    })
    opener = !history.length ? 'opening' : 'role' in history.at(-1)! ? 'reply' : null
    note('resume', history.length)
    // The speech pipeline loads once per backend; asking now means the first press is not kept waiting.
    micStream = next.micStart()
  }

  // A session's lines that were never performed go with it: no one would hear about them any more.
  function dropUnheard(note: string) {
    interludes.withdraw(note)
    for (const turn of turns.values()) if (!turn.receipted && !turn.stageDone) { turn.receipted = true; stage.drop(turn.turnId, note) }
  }

  function close() {
    clearTimeout(retryTimer)
    session.value?.close()
    session.value = null
    player.stop()
    dropUnheard('多智能体会话已结束')
    status.value = 'off'
  }

  // The customer's words reached the stage. Text the backend transcribed itself is not sent back to it; either
  // way the backend is now writing an answer, and the host fills the wait.
  function userSaid(text: string, hostSpoke = false) {
    if (!session.value) return
    if (rostered && !hostSpoke) interludes.say('reply')
    if (heardByBackend && text === heardByBackend) { heardByBackend = ''; return }
    session.value.userText(text)
  }

  // ---- the backend's speech recognition behind the talk button ----
  let mic: MicCapture | null = null
  let sending = false, awaiting = false, waitTimer: ReturnType<typeof setTimeout> | undefined
  let handlers: { onText: (text: string) => void; onComplete: (text: string) => void } | null = null
  const micListening = ref(false), micError = ref(''), micTranscript = ref('')

  function heard(text: string) {
    clearTimeout(waitTimer)
    const expected = awaiting
    awaiting = false
    micListening.value = false
    if (!text) { if (expected) micError.value = '没听清，再说一次吧。'; return }
    heardByBackend = text
    micTranscript.value = text
    // The answer to a press goes through the button's own completion; a late one is still shown, since the backend
    // is already answering it.
    if (expected && handlers) handlers.onComplete(text)
    else interject(text)
  }

  const backendEngine: SpeechEngine = {
    listening: micListening, error: micError, transcript: micTranscript,
    start(next) {
      handlers = next
      micError.value = ''; micTranscript.value = ''
      micListening.value = true
      sending = true; awaiting = true
      clearTimeout(waitTimer)
      session.value?.micPress('start')
      mic ??= createMicCapture((pcm) => { if (sending) session.value?.micFrame(pcm) })
      mic.start().catch(() => { sending = false; awaiting = false; micListening.value = false; micError.value = '请允许使用麦克风，再长按试试。' })
    },
    stop() {
      sending = false
      mic?.stop()
      for (let i = 0; i < SILENCE_FRAMES; i++) session.value?.micFrame(new Int16Array(320))
      session.value?.micPress('end')
      clearTimeout(waitTimer)
      waitTimer = setTimeout(() => { if (awaiting) heard('') }, 8000)
    },
    cancel() {
      sending = false; awaiting = false
      mic?.stop()
      clearTimeout(waitTimer)
      micListening.value = false
    },
  }
  // Development and tests: what a held button would send, from recorded 16 kHz samples instead of the microphone.
  function debugSpeech(pcm: Int16Array) {
    if (!session.value || !sttReady.value) return false
    handlers = { onText: () => undefined, onComplete: (text) => interject(text) }
    awaiting = true
    micListening.value = true
    session.value.micPress('start')
    for (let i = 0; i + 320 <= pcm.length; i += 320) session.value.micFrame(pcm.slice(i, i + 320))
    for (let i = 0; i < SILENCE_FRAMES; i++) session.value.micFrame(new Int16Array(320))
    session.value.micPress('end')
    clearTimeout(waitTimer)
    waitTimer = setTimeout(() => { if (awaiting) heard('') }, 8000)
    return true
  }

  /** The backend's recognition while its pipeline is ready; null leaves the talk button on the browser's. */
  const speechEngine = () => (sttReady.value && session.value?.status === 'open' ? backendEngine : null)

  // ---- the stage's side of each line's audio ----
  const voice: LineVoice = {
    expects: (lineId) => !!turns.get(lineId)?.audio && player.available,
    begin: (lineId) => player.play(lineId, turns.get(lineId)?.epoch ?? 0),
    progress: (lineId, text) => player.progress(lineId, expectedSamples(text)),
    duration: (text) => expectedSamples(text) / 24000,
  }

  // The sound toggle: the line on stage goes silent (or audible) at once; the backend voices, or stops voicing,
  // from the next line, so no line is cut short (unlocking audio needs this user gesture).
  watch(audio, async (on) => {
    player.setMuted(!on)
    if (!session.value || !rostered || !tts.value || tts.value === 'none') return
    choseSilence = !on
    if (on && !(await player.unlock())) { dining.notify('浏览器没有允许播放声音'); return }
    session.value.setAudio(on && player.ready, true)
  })
  watch(() => dining.paused, (paused) => { void (paused ? player.pause() : player.resume()) })
  watch(() => [ready(), onStageIds().join(',')] as const, ([isReady, ids], previous) => {
    if (!isReady) return
    if (!session.value) { open(); return }
    // Someone left or came back on stage: the backend's list follows the stage's.
    if (previous && ids !== previous[1] && ids) session.value.updateRestaurants(onStageIds(), characterHints(hosts(), (restaurant) => cast.contractOf(restaurant as Restaurant)))
  }, { immediate: true })

  onBeforeUnmount(() => {
    disposed = true
    stopListening()
    mic?.stop()
    close()
    player.close()
  })

  // After repeated failures: try again now (the customer's next words also make the backend try again).
  function retry() { failures = 0; status.value = 'live'; session.value?.resume() }

  return { status, live, engine, tts, sttReady, error, voice, speechEngine, userSaid, reconnect: open, retry, close, debugSpeech, trail }
}
