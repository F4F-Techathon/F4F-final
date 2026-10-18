// One realtime session with the multi-agent backend (WS /api/agents/realtime, proxied to its /api/realtime).
// It sends commands, numbers microphone frames, and passes on events of the current epoch only: anything an
// interrupt has made stale (a cancelled turn's text or audio) is dropped here, as the backend asks of a frontend.
import {
  command, decodeAudioFrame, encodeMicFrame, type AudioFrameHeader, type BackendCharacterHint, type BackendEvent,
  type BackendHistoryItem, type BackendPreferences, type PlaybackStatus,
} from './protocol.ts'

export type SessionStatus = 'connecting' | 'open' | 'closed'

export interface SessionHandlers {
  status?(status: SessionStatus): void
  /** Every JSON event of the current epoch. */
  event?(event: BackendEvent): void
  /** The epoch moved on: whatever is playing from an older one must stop. */
  epoch?(epoch: number, previous: number): void
  audio?(header: AudioFrameHeader, pcm: Int16Array): void
}

export interface StartOptions {
  restaurantIds: string[]
  preferences?: BackendPreferences
  characters?: Record<string, BackendCharacterHint>
  audioEnabled: boolean
  /** The debate so far, when the customer comes back to it: the backend goes on from there instead of opening again. */
  history?: BackendHistoryItem[]
}

type SocketLike = Pick<WebSocket, 'send' | 'close' | 'readyState'> & {
  binaryType: string
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  onerror: ((event: Event) => void) | null
}

export interface AgentSession {
  readonly status: SessionStatus
  readonly epoch: number
  start(options: StartOptions): void
  resume(): void
  pause(): void
  interrupt(): void
  userText(text: string): void
  /** deferred: takes effect from the next turn instead of restarting the current one. */
  setAudio(enabled: boolean, deferred?: boolean): void
  updateRestaurants(restaurantIds: string[], characters?: Record<string, BackendCharacterHint>): void
  playback(turnId: string, epoch: number, status: PlaybackStatus, playedSamples: number): void
  micStart(): string
  micFrame(pcm: Int16Array): void
  /** The talk button went down or up: everything said in between is one utterance, transcribed whole on release. */
  micPress(phase: 'start' | 'end'): void
  close(): void
}

export function agentSocketUrl(location: { protocol: string; host: string }, path = '/api/agents/realtime') {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${path}`
}

export function createAgentSession(url: string, handlers: SessionHandlers, open: (url: string) => SocketLike = (target) => new WebSocket(target)): AgentSession {
  let status: SessionStatus = 'connecting'
  let sessionId = ''
  let epoch = 0
  let micStream = '', micSeq = 0
  const outbox: string[] = []
  const socket = open(url)
  socket.binaryType = 'arraybuffer'

  function setStatus(next: SessionStatus) {
    if (status === next) return
    status = next
    handlers.status?.(next)
  }

  // Commands wait for the socket to open; microphone frames never wait (a late frame is useless).
  function send(type: string, data: Record<string, unknown> = {}) {
    const body = command(sessionId, type, data)
    if (socket.readyState === 1) socket.send(body)
    else if (status !== 'closed') outbox.push(body)
  }

  function advance(next: number) {
    if (next <= epoch) return
    const previous = epoch
    epoch = next
    handlers.epoch?.(next, previous)
  }

  socket.onopen = () => {
    setStatus('open')
    for (const body of outbox.splice(0)) socket.send(body)
  }
  socket.onclose = () => setStatus('closed')
  socket.onerror = () => undefined
  socket.onmessage = ({ data }) => {
    if (data instanceof ArrayBuffer) {
      const frame = decodeAudioFrame(data)
      if (frame && frame.header.epoch === epoch) handlers.audio?.(frame.header, frame.pcm)
      return
    }
    let event: BackendEvent
    try { event = JSON.parse(String(data)) } catch { return }
    if (typeof event?.type !== 'string' || typeof event.epoch !== 'number') return
    if (event.sessionId) sessionId = event.sessionId
    if (event.epoch < epoch) return
    advance(event.epoch)
    handlers.event?.(event)
  }

  return {
    get status() { return status },
    get epoch() { return epoch },
    start(options) { send('session.start', { ...options }) },
    resume() { send('control', { action: 'resume' }) },
    pause() { send('control', { action: 'pause' }) },
    interrupt() { send('control', { action: 'interrupt' }) },
    userText(text) { send('user.text', { text: text.slice(0, 600) }) },
    setAudio(enabled, deferred = false) { send('control', { action: 'audio', enabled, ...(deferred ? { deferred: true } : {}) }) },
    updateRestaurants(restaurantIds, characters) { send('restaurants.update', { restaurantIds, ...(characters ? { characters } : {}) }) },
    playback(turnId, turnEpoch, playbackStatus, playedSamples) {
      send('playback', { turnId, epoch: turnEpoch, status: playbackStatus, playedSamples })
    },
    // A new stream per press keeps chunk numbers starting from zero.
    micStart() {
      micStream = `mic-${Date.now().toString(36)}`
      micSeq = 0
      send('mic.start', { streamId: micStream })
      return micStream
    },
    micPress(phase) { send('mic.press', { phase }) },
    micFrame(pcm) {
      if (!micStream || socket.readyState !== 1) return
      socket.send(encodeMicFrame(micStream, micSeq++, pcm))
    },
    close() {
      setStatus('closed')
      outbox.length = 0
      try { socket.close() } catch { /* already closed */ }
    },
  }
}
