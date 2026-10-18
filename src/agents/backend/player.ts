// Plays the multi-agent backend's TTS (PCM s16le mono, 24 kHz) for the stage, one turn at a time.
// A turn's audio is held until the stage starts that line, then scheduled back to back on one AudioContext.
// How much of a turn was actually heard comes from the audio output clock, never from what has been received:
// the backend only commits heard text to the debate's history, and accepts "ended" only when every sample it sent
// was played (Backend/eat-what-backend/server/realtime_console.py playback_report).

interface Chunk { offset: number; pcm: Int16Array; rate: number }
interface Frame { start: number; count: number; offset: number; rate: number }
interface Turn {
  epoch: number
  pending: Chunk[]
  frames: Frame[]
  sources: Set<AudioBufferSourceNode>
  received: number
  total: number | null
  playing: boolean
  drained: Promise<void>
  finish: () => void
  done: boolean
}

export interface PcmPlayer {
  /** True once an AudioContext is running; until then nothing can be heard. */
  readonly ready: boolean
  /** An AudioContext exists (running, or suspended while the stage is paused). */
  readonly available: boolean
  /** Creates or resumes the AudioContext; call it from a user gesture where autoplay rules need one. */
  unlock(): Promise<boolean>
  push(turnId: string, epoch: number, offset: number, pcm: Int16Array, rate: number): void
  /** The backend has sent all of a turn's audio (its audio.end). */
  end(turnId: string, totalSamples: number): void
  /** Starts playing a turn (now and as more arrives, even if none has yet); resolves once all of it has been heard. */
  play(turnId: string, epoch: number): Promise<void>
  has(turnId: string): boolean
  /** Samples of a turn actually played so far. */
  played(turnId: string): number
  /** 0–1 of a turn heard; an estimate (from `expected`) until its total is known. */
  progress(turnId: string, expected: number): number
  /** Stops a turn (or everything) at once; buffered audio is dropped. */
  stop(turnId?: string): void
  pause(): Promise<void>
  resume(): Promise<void>
  /** Silences what plays without stopping it, so a turn still runs to its end on the output clock. */
  setMuted(muted: boolean): void
  onProgress(listener: (turnId: string, epoch: number, played: number) => void): void
  close(): void
}

const LEAD = 0.06 // seconds between scheduling a buffer and its start, so nothing starts in the past

export function createPcmPlayer(): PcmPlayer {
  let ctx: AudioContext | null = null
  let out: GainNode | null = null
  let muted = false
  let cursor = 0
  let ticker: ReturnType<typeof setInterval> | undefined
  const turns = new Map<string, Turn>()
  const listeners: ((turnId: string, epoch: number, played: number) => void)[] = []

  function clock() {
    if (!ctx) return 0
    const stamp = ctx.getOutputTimestamp?.()
    return stamp && Number.isFinite(stamp.contextTime) && stamp.contextTime! > 0
      ? stamp.contextTime!
      : Math.max(0, ctx.currentTime - (ctx.baseLatency || 0) - ((ctx as AudioContext & { outputLatency?: number }).outputLatency || 0))
  }

  // Samples reached by the output clock: whole frames before it, and the part of the frame it is in.
  function playedOf(turn: Turn) {
    let played = 0
    const now = clock()
    for (const frame of turn.frames) {
      if (now <= frame.start) break
      const count = Math.min(frame.count, Math.max(0, Math.floor((now - frame.start) * frame.rate)))
      played = Math.max(played, frame.offset + count)
      if (count < frame.count) break
    }
    return played
  }

  function schedule(turn: Turn, chunk: Chunk) {
    if (!ctx) return
    const buffer = ctx.createBuffer(1, chunk.pcm.length, chunk.rate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < chunk.pcm.length; i++) channel[i] = chunk.pcm[i]! / 32768
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(out ?? ctx.destination)
    const start = Math.max(ctx.currentTime + LEAD, cursor)
    cursor = start + buffer.duration
    turn.frames.push({ start, count: chunk.pcm.length, offset: chunk.offset, rate: chunk.rate })
    turn.sources.add(source)
    source.onended = () => turn.sources.delete(source)
    source.start(start)
  }

  function settle(turn: Turn) {
    if (!turn.done && turn.total !== null && playedOf(turn) >= turn.total) { turn.done = true; turn.finish() }
  }

  function tick() {
    let active = false
    for (const [turnId, turn] of turns) {
      if (!turn.playing || turn.done) continue
      active = true
      const played = playedOf(turn)
      for (const listener of listeners) listener(turnId, turn.epoch, played)
      settle(turn)
    }
    if (!active) { clearInterval(ticker); ticker = undefined }
  }

  function turnOf(turnId: string, epoch: number) {
    let turn = turns.get(turnId)
    if (!turn) {
      let finish!: () => void
      const drained = new Promise<void>((resolve) => { finish = resolve })
      turn = { epoch, pending: [], frames: [], sources: new Set(), received: 0, total: null, playing: false, drained, finish, done: false }
      turns.set(turnId, turn)
      // Keep a bounded history; long-finished turns go first.
      while (turns.size > 24) {
        const oldest = [...turns.keys()].find((id) => turns.get(id)!.done) ?? turns.keys().next().value!
        turns.delete(oldest)
      }
    }
    return turn
  }

  return {
    get ready() { return ctx?.state === 'running' },
    get available() { return !!ctx && ctx.state !== 'closed' },
    async unlock() {
      try {
        if (!ctx) {
          ctx = new AudioContext()
          out = ctx.createGain()
          out.gain.value = muted ? 0 : 1
          out.connect(ctx.destination)
        }
        if (ctx.state === 'suspended') await ctx.resume()
      } catch { return false }
      return ctx.state === 'running'
    },
    push(turnId, epoch, offset, pcm, rate) {
      const turn = turnOf(turnId, epoch)
      if (turn.done) return
      turn.received = Math.max(turn.received, offset + pcm.length)
      if (turn.playing) schedule(turn, { offset, pcm, rate })
      else turn.pending.push({ offset, pcm, rate })
    },
    end(turnId, totalSamples) {
      const turn = turns.get(turnId)
      if (!turn) return
      turn.total = totalSamples
      if (turn.playing) settle(turn)
    },
    play(turnId, epoch) {
      const turn = turnOf(turnId, epoch)
      if (!turn.playing) {
        turn.playing = true
        for (const chunk of turn.pending.splice(0)) schedule(turn, chunk)
        ticker ??= setInterval(tick, 100)
      }
      return turn.drained
    },
    has(turnId) { return turns.has(turnId) },
    played(turnId) { const turn = turns.get(turnId); return turn ? playedOf(turn) : 0 },
    progress(turnId, expected) {
      const turn = turns.get(turnId)
      if (!turn) return 0
      const whole = turn.total ?? Math.max(expected, turn.received)
      return whole ? Math.min(1, playedOf(turn) / whole) : 0
    },
    stop(turnId) {
      for (const [id, turn] of turns) {
        if (turnId && id !== turnId) continue
        for (const source of turn.sources) { source.onended = null; try { source.stop() } catch { /* already over */ } }
        turn.sources.clear()
        turn.pending = []
        if (!turn.done) { turn.done = true; turn.finish() }
      }
      // Only one turn plays at a time: whatever comes next starts now, not after what was cut off.
      cursor = 0
    },
    async pause() { if (ctx?.state === 'running') await ctx.suspend() },
    async resume() { if (ctx?.state === 'suspended') await ctx.resume() },
    setMuted(value) { muted = value; if (out) out.gain.value = value ? 0 : 1 },
    onProgress(listener) { listeners.push(listener) },
    close() {
      this.stop()
      clearInterval(ticker)
      void ctx?.close()
      ctx = null
      out = null
    },
  }
}
