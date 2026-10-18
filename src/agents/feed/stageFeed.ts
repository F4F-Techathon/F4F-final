import { parseAppMessage, parseConsoleMessage, parseEnvelope, parseEventId, parsePresence, type AppMessage, type ConsoleMessage, type FeedRole, type RelayPresence, type StageMessage } from './protocol.ts'

export type FeedStatus = 'connecting' | 'open' | 'retrying' | 'closed'
export interface FeedMeta { id: string; at: number; from: FeedRole }

/** A two-way stage channel. The SSE relay implements it today; a multi-agent backend could implement it directly. */
export interface StageFeed<In extends StageMessage, Out extends StageMessage> {
  readonly role: FeedRole
  readonly status: FeedStatus
  /** Connected apps and consoles, once the relay has reported them; null while disconnected. */
  readonly peers: RelayPresence | null
  /** Relay event id of the last delivered message; persist it to replay what a reload missed. */
  readonly lastEventId: string | undefined
  onMessage(listener: (message: In, meta: FeedMeta) => void): () => void
  onStatus(listener: (status: FeedStatus, peers: RelayPresence | null) => void): () => void
  /** Resolves with the relay event id once the relay has accepted the message. */
  send(message: Out): Promise<string>
  close(): void
}

/** The stage receives what consoles send and reports its own state back. */
export type AppStageFeed = StageFeed<ConsoleMessage, AppMessage>
/** Consoles receive both directions, so lines from any sender appear on every console. */
export type ConsoleStageFeed = StageFeed<StageMessage, ConsoleMessage>

export interface SseStageFeedOptions {
  base?: string
  /** Resume point from an earlier page, e.g. kept in sessionStorage. */
  lastEventId?: string
  EventSource?: typeof EventSource
  fetch?: typeof fetch
  reconnectMs?: { min: number; max: number }
  sendTimeoutMs?: number
}

const CLOSED = 2
const STALE_AFTER_HIDDEN_MS = 20000

export function createSseStageFeed(options: SseStageFeedOptions & { role: 'app' }): AppStageFeed
export function createSseStageFeed(options: SseStageFeedOptions & { role: 'console' }): ConsoleStageFeed
export function createSseStageFeed(options: SseStageFeedOptions & { role: FeedRole }): StageFeed<StageMessage, StageMessage> {
  const { role, base = '/api/stage', sendTimeoutMs = 8000, reconnectMs = { min: 1000, max: 15000 } } = options
  const Source = options.EventSource ?? globalThis.EventSource
  if (!Source) throw new Error('EventSource is unavailable; pass options.EventSource')
  const post = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init))
  const messageListeners = new Set<(message: StageMessage, meta: FeedMeta) => void>()
  const statusListeners = new Set<(status: FeedStatus, peers: RelayPresence | null) => void>()
  let last = parseEventId(options.lastEventId)
  let lastEventId = last ? options.lastEventId : undefined
  let status: FeedStatus = 'connecting', peers: RelayPresence | null = null
  let source: EventSource | null = null, timer: ReturnType<typeof setTimeout> | undefined, attempts = 0, hiddenSince = 0

  function setStatus(next: FeedStatus, nextPeers = peers) {
    if (next === status && nextPeers === peers) return
    status = next
    peers = nextPeers
    for (const listener of [...statusListeners]) listener(status, peers)
  }

  function receive(data: string) {
    let envelope
    try { envelope = parseEnvelope(JSON.parse(data)) } catch { return }
    // Keeps the role's inbound type honest even if another relay mirrored app traffic back to apps.
    if (role === 'app' && envelope.from !== 'console') return
    const id = parseEventId(envelope.id)!
    // Replays repeat ids within an epoch; a restarted relay begins a new epoch whose ids are all new.
    if (last && id.epoch === last.epoch && id.seq <= last.seq) return
    last = id
    lastEventId = envelope.id
    const meta = { id: envelope.id, at: envelope.at, from: envelope.from }
    for (const listener of [...messageListeners]) {
      try { listener(envelope.message, meta) } catch (error) { console.error(error) }
    }
  }

  function connect() {
    clearTimeout(timer)
    source?.close()
    if (status === 'open') setStatus('connecting', null)
    const query = new URLSearchParams({ role })
    if (lastEventId) query.set('lastEventId', lastEventId)
    const events = new Source(`${base}/events?${query}`)
    source = events
    events.onopen = () => { if (source === events) { attempts = 0; setStatus('open') } }
    events.onmessage = (event) => { if (source === events) receive(event.data) }
    events.addEventListener('presence', (event) => {
      if (source !== events) return
      try { setStatus(status, parsePresence(JSON.parse(event.data))) } catch { /* Presence is advisory. */ }
    })
    events.onerror = () => {
      if (source !== events) return
      // CLOSED means the browser gave up (HTTP error, proxy down); otherwise it is already reconnecting on its own.
      if (events.readyState === CLOSED) scheduleReconnect()
      else setStatus('retrying', null)
    }
  }

  function scheduleReconnect() {
    source?.close()
    source = null
    setStatus('retrying', null)
    timer = setTimeout(connect, Math.min(reconnectMs.max, reconnectMs.min * 2 ** attempts++))
  }

  function reconnectNow() {
    if (status === 'closed') return
    attempts = 0
    connect()
  }

  // A phone that slept can hold a dead socket the browser never notices; a fresh one replays what was missed.
  const page = typeof document === 'undefined' ? undefined : document
  const browser = typeof window === 'undefined' ? undefined : window
  function onVisibility() {
    if (page?.hidden) { hiddenSince = Date.now(); return }
    if (hiddenSince && Date.now() - hiddenSince > STALE_AFTER_HIDDEN_MS) reconnectNow()
    hiddenSince = 0
  }
  function onOnline() { if (status !== 'open') reconnectNow() }
  page?.addEventListener('visibilitychange', onVisibility)
  browser?.addEventListener('online', onOnline)

  async function send(message: StageMessage): Promise<string> {
    if (status === 'closed') throw new Error('舞台连接已关闭。')
    const checked = role === 'app' ? parseAppMessage(message) : parseConsoleMessage(message)
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), sendTimeoutMs)
    let response: Response
    try {
      response = await post(`${base}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: role, message: checked }), signal: controller.signal })
    } catch {
      throw new Error(controller.signal.aborted ? '发送超时，请检查与舞台中继的连接。' : '发送失败：连不上舞台中继。')
    } finally { clearTimeout(timeout) }
    const body = await response.json().catch(() => null) as { id?: unknown; error?: unknown; detail?: unknown } | null
    if (response.ok && typeof body?.id === 'string') return body.id
    const reason = typeof body?.error === 'string' ? body.error : `发送失败（HTTP ${response.status}）。`
    throw new Error(typeof body?.detail === 'string' ? `${reason}（${body.detail}）` : reason)
  }

  function close() {
    clearTimeout(timer)
    source?.close()
    source = null
    page?.removeEventListener('visibilitychange', onVisibility)
    browser?.removeEventListener('online', onOnline)
    setStatus('closed', null)
    messageListeners.clear()
    statusListeners.clear()
  }

  connect()
  return {
    role,
    get status() { return status },
    get peers() { return peers },
    get lastEventId() { return lastEventId },
    onMessage(listener) { messageListeners.add(listener); return () => { messageListeners.delete(listener) } },
    onStatus(listener) { statusListeners.add(listener); return () => { statusListeners.delete(listener) } },
    send,
    close,
  }
}
