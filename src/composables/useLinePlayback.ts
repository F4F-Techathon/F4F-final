import { onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { CastMember } from '@/agents/catalog/personas'
import type { CastMessage, LineMessage } from '@/agents/feed/protocol'
import { decideLine } from '@/agents/jev/decideLine'
import type { LineDecision, Quote, Turn } from '@/agents/jev/types'
import { intent, interrupted, perform, prepare, reactions, settle, type StageScene, type StageTurn } from '@/agents/performance/choreography'
import { makePlan, type PerformancePlan, type StageLayout } from '@/agents/performance/plan'
import { DECIDE_WAIT, SETTLE_DELAY, TYPE_MS, typingDuration } from '@/agents/performance/timing'
import { decisionReport } from '@/agents/stage/report'
import type { HistoryEntry } from '@/data/types'
import { useDiningStore } from '@/stores/dining'
import { useStageStore } from '@/stores/stage'
import type { StageDirector } from './useStageDirector'

const HOLD_MS = 1600 // reading time after the last character before the next line may start
const STAGING_MS = 900 // a performer running on or off while the others slide to their new seats

export interface PlayingLine {
  id: string
  speakerId: string
  name: string
  restaurantId: string
  text: string
  /** The Mandarin of a line said in dialect. */
  gloss?: string
  topic: string
  evidenceIds: string[]
  visible: number
  typing: boolean
  user: boolean
  /** Stands on the floor (an invited host or a guest), so it can be startled. */
  owner: boolean
  guest: boolean
  /** The earlier line this one replays or edits. */
  replaces?: string
  /** Comes with its own audio (the multi-agent backend's), so the browser never reads it aloud as well. */
  voiced?: boolean
}

interface Run { line: LineMessage; local: boolean; abort: AbortController; timer?: ReturnType<typeof setInterval>; done?: (finished: boolean) => void }

/** Audio that comes with a line (the multi-agent backend's TTS): it sets the line's length and the caption's pace. */
export interface LineVoice {
  /** This line has its own audio coming. */
  expects(lineId: string): boolean
  /** Starts the line's audio; resolves when it has all been heard. */
  begin(lineId: string): Promise<void>
  /** 0–1 of the line heard so far. */
  progress(lineId: string, text: string): number
  /** Seconds the line is expected to take, for the cast's beats. */
  duration(text: string): number
}

interface Options {
  director: StageDirector
  cast: ComputedRef<CastMember[]>
  layout: ComputedRef<StageLayout>
  nameOf: (speakerId: string) => string
  /** The invited restaurants: their lines count as the hosts' rounds; anyone else on the floor is a guest. */
  hosts: () => string[]
  audio: Ref<boolean>
  blocked: () => boolean
  voice?: LineVoice
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// Plays what the stage receives, one cue at a time. A line: the cast gets ready, Jev decides how the
// speaker performs and how everyone else reacts (waiting at most DECIDE_WAIT), the line is typed out with
// the performance on the same clock, and the cast eases back. A stage direction: someone walks on or off.
// The customer's own words take the same path as a line.
export function useLinePlayback({ director, cast, layout, nameOf, hosts, audio, blocked, voice }: Options) {
  const dining = useDiningStore(), stage = useStageStore()
  const current = ref<PlayingLine | null>(null)
  let run: Run | null = null
  let staging = false
  let speechActive = false // the browser reading a line aloud
  let voicePlaying = false // a line's own audio (the multi-agent backend's): only its end, never a mute or a pause, ends it
  let utterance: SpeechSynthesisUtterance | undefined
  let disposed = false

  const scene = (): StageScene => ({ layout: layout.value, cast: cast.value, actors: director.actors })
  const recentTurns = (): Turn[] => dining.history.slice(-4).map((entry) => ({ who: entry.speakerId, text: entry.text }))
  function quotesFor(line: LineMessage): Quote[] {
    return (line.replyTo || []).map((id) => dining.history.find((entry) => entry.id === id)).filter((entry) => !!entry).map((entry) => ({ who: entry.speakerId, text: entry.text }))
  }

  // The customer's own lines report too, but only lines from the feed move the reload resume point.
  function report(item: Run, phase: 'deciding' | 'speaking' | 'done' | 'dropped', note?: string) {
    stage.lineState(item.line.id, phase, note)
    if (!item.local && (phase === 'done' || phase === 'dropped')) stage.finish(item.line.id)
  }
  function reportDecision(item: Run, decision: LineDecision, plan: PerformancePlan) {
    stage.send(decisionReport(item.line.id, decision, plan, item.line.speaker === 'user'))
  }

  function stopSpeech() {
    speechActive = false
    if (utterance) { utterance.onend = null; utterance.onerror = null }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }

  // Native speech is optional; the caption keeps time without it. A line with its own audio is never read over it,
  // whether the sound comes back on or the stage resumes mid-line.
  function speakRemaining() {
    const line = current.value
    if (!audio.value || dining.paused || !line || !line.typing || line.voiced || line.user || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    utterance = new SpeechSynthesisUtterance(line.text.slice(line.visible))
    utterance.lang = 'zh-CN'
    utterance.rate = 1.05
    speechActive = true
    utterance.onend = () => { speechActive = false; if (current.value === line) line.visible = line.text.length }
    utterance.onerror = (event) => {
      speechActive = false
      if (event.error !== 'interrupted' && event.error !== 'canceled') { audio.value = false; dining.notify('语音暂时无法播放，字幕会继续') }
    }
    window.speechSynthesis.speak(utterance)
  }

  // Types the caption one character per TYPE_MS (holding while paused), then leaves it up to be read. A line
  // with its own audio lasts as long as the audio, and its caption keeps pace with what has been heard.
  function typeOut(item: Run, line: PlayingLine, voiced: boolean) {
    return new Promise<boolean>((resolve) => {
      let held = 0
      item.done = resolve
      line.typing = true
      line.voiced = voiced
      if (voiced && voice) {
        voicePlaying = true
        void voice.begin(line.id).then(() => { if (run === item) { voicePlaying = false; line.visible = line.text.length } })
      } else speakRemaining() // the customer's own words are not read back to them
      item.timer = setInterval(() => {
        if (dining.paused) return
        if (voiced && voice && voicePlaying) line.visible = Math.max(line.visible, Math.min(line.text.length, Math.ceil(line.text.length * voice.progress(line.id, line.text))))
        else if (line.visible < line.text.length) line.visible++
        else if (!speechActive && !voicePlaying) {
          line.typing = false
          if ((held += TYPE_MS) >= HOLD_MS) { clearInterval(item.timer); resolve(true) }
        }
      }, TYPE_MS)
    })
  }

  // Stops the line in progress where it is; nothing it scheduled survives.
  function endRun(item: Run) {
    voicePlaying = false
    item.abort.abort()
    clearInterval(item.timer)
    item.done?.(false)
    stopSpeech()
    if (current.value) current.value.typing = false
    if (run === item) run = null
  }

  function settleAll() {
    const now = director.now()
    for (const actor of Object.values(director.actors)) actor.cancelAfter(now)
    settle(scene(), now)
  }

  async function play(item: Run) {
    run = item
    const { line } = item
    const members = cast.value
    const speaker = members.find((member) => member.id === line.speaker)
    if (!speaker || (speaker.kind === 'owner' && !layout.value.order.includes(speaker.id))) {
      report(item, 'dropped', '说话人不在台上')
      run = null
      pump()
      return
    }
    const turn: StageTurn = { speaker: speaker.id, quotes: quotesFor(line) }
    const owner = speaker.kind === 'owner', invited = owner && hosts().includes(speaker.id)
    current.value = {
      id: line.id, speakerId: speaker.id, name: nameOf(speaker.id), restaurantId: invited ? speaker.id : '', text: line.text, ...(line.gloss ? { gloss: line.gloss } : {}),
      topic: line.topic || '', evidenceIds: line.evidenceIds || [], visible: 0, typing: false, user: speaker.kind === 'user',
      owner, guest: owner && !invited, ...(line.replaces ? { replaces: line.replaces } : {}), voiced: !!voice?.expects(line.id),
    }
    const playing = current.value // the reactive copy: the typewriter's progress must re-render the card and the mouth

    // The cast gets ready the instant the line arrives, and Jev is asked at the same time.
    const start = director.now()
    for (const actor of Object.values(director.actors)) actor.cancelAfter(start)
    prepare(scene(), turn, start)
    report(item, 'deciding')
    const planFor = (answers?: LineDecision['answers']) => makePlan(members, layout.value, { speaker: speaker.id, quotes: turn.quotes, answers, override: line.override })
    const deciding = decideLine({ cast: members, speaker: speaker.id, text: line.text, quotes: turn.quotes, history: recentTurns(), stage: layout.value.order }, { signal: item.abort.signal })
      .then((decision) => ({ decision, plan: planFor(decision.answers) }))
    deciding.catch(() => undefined)
    const early = await Promise.race([deciding.catch(() => null), sleep(DECIDE_WAIT * 1000).then(() => undefined)])
    if (run !== item) return
    let plan: PerformancePlan
    if (early) {
      plan = early.plan
      intent(scene(), turn, plan, director.now())
      reportDecision(item, early.decision, plan)
    } else {
      plan = { ...planFor(), provisional: true }
    }

    while (dining.paused && run === item) await sleep(120)
    if (run !== item) return
    const voiced = !!voice?.expects(line.id)
    const T = director.now(), est = voiced ? voice!.duration(line.text) : typingDuration(line.text)
    perform(scene(), turn, plan, T, est)
    report(item, 'speaking')
    if (!early) {
      // Jev answered after the line began: the speaker adopts the decision mid-line, listeners react on cue.
      deciding.then(({ decision, plan: late }) => {
        if (run !== item) return
        const now = director.now()
        intent(scene(), turn, late, now)
        reactions(scene(), turn, late, T, est, now)
        reportDecision(item, decision, { ...late, provisional: true })
      }).catch(() => undefined)
    }

    const finished = await typeOut(item, playing, voiced)
    if (!finished || run !== item) return
    settle(scene(), director.now() + SETTLE_DELAY)
    record(playing)
    report(item, 'done')
    run = null
    pump()
  }

  // A line joins the history once it has been said (to the end, or until someone cut in), so a reload
  // mid-line performs it again instead of treating it as done. A replay or an edit keeps its original's place
  // and id; one whose original this phone never heard (a saved session played again) is kept under that id.
  function record(line: PlayingLine) {
    const time = new Date().toISOString()
    if (line.replaces && dining.replaceLine(line.replaces, { text: line.text, topic: line.topic, evidenceIds: line.evidenceIds, time })) return
    const entry: HistoryEntry = {
      id: line.replaces || line.id, restaurantId: line.restaurantId, speakerId: line.speakerId, speaker: line.name, text: line.text, ...(line.gloss ? { gloss: line.gloss } : {}),
      round: line.restaurantId ? dining.history.filter((item) => item.restaurantId).length + 1 : 0, topic: line.topic,
      evidenceIds: line.evidenceIds, time, user: line.user, ...(line.guest ? { guest: true } : {}),
    }
    dining.recordLine(entry)
  }

  // Someone walks on or off: the line-up changes at once, and the next cue waits until everyone is in place.
  async function stageCue(cue: CastMessage) {
    staging = true
    const result = stage.applyCue(cue, hosts())
    if (result.applied) {
      stage.lineState(cue.id, 'speaking')
      await sleep(STAGING_MS)
      stage.lineState(cue.id, 'done', result.note)
    } else stage.lineState(cue.id, 'dropped', result.note)
    stage.finish(cue.id)
    staging = false
    pump()
  }

  function pump() {
    if (disposed || run || staging || dining.paused || blocked()) return
    const cue = stage.next()
    if (!cue) return
    if (cue.kind === 'cast') void stageCue(cue)
    else void play({ line: cue, local: false, abort: new AbortController() })
  }

  // Someone cut in on the line in progress: whoever was speaking on the floor is startled and stops there.
  function interrupt(note = '被顾客打断') {
    if (!run || !current.value) return
    const item = run
    if (current.value.owner) interrupted(scene(), current.value.speakerId, director.now())
    record(current.value)
    report(item, 'done', note)
    endRun(item)
  }

  // The customer's words become a stage line of their own: Jev decides how every host reacts.
  function interject(text: string) {
    interrupt()
    const entry = dining.intervene(text)
    stage.send({ kind: 'user-line', id: entry.id, text })
    void play({ line: { kind: 'line', id: entry.id, speaker: 'user', text }, local: true, abort: new AbortController() })
  }

  // The console cleared the stage: the line in progress stops and everyone settles at once.
  watch(() => stage.clears, () => {
    if (run) { report(run, 'dropped', '舞台已清空'); endRun(run) }
    current.value = null
    settleAll()
  })
  // A cut-in line waits at the head of the queue; the line in progress gives way to it.
  watch(() => stage.cuts, () => {
    if (run && !run.local) interrupt('被插话打断')
    pump()
  })
  // The console withdrew the line in progress.
  watch(() => stage.dropped, (drop) => {
    if (!drop || !run || run.local || run.line.id !== drop.id) return
    report(run, 'dropped', drop.note || '导演台撤回')
    endRun(run)
    current.value = null
    settleAll()
    pump()
  })
  watch(() => stage.queue.length, pump)
  watch(() => dining.paused, (paused) => {
    if (paused) stopSpeech()
    else { if (current.value?.typing) speakRemaining(); pump() }
  })
  watch(audio, (on) => { if (on) speakRemaining(); else stopSpeech() })

  onBeforeUnmount(() => {
    disposed = true
    if (run) endRun(run)
  })

  return { current, pump, interrupt, interject }
}
