import type { IncomingMessage, ServerResponse } from 'node:http'
import { formatEventId, parseEventId, parseSendRequest, type FeedRole, type RelayPresence, type StageEnvelope, type StageMessage } from '../src/agents/feed/protocol.ts'

export interface StageRelayOptions {
  /** Messages kept per sender for Last-Event-ID replay; the latest snapshot and each host's agent message are kept on their own. */
  backlog?: number
  /** The same backlog bounded by size, so a reconnecting console never replays more than a few hundred KB per sender. */
  backlogBytes?: number
  heartbeatMs?: number
  maxClients?: number
}

export type StageRelay = ((request: IncomingMessage, response: ServerResponse, next?: () => void) => void) & {
  close(): void
  /** Open streams per role, for /api/status. */
  presence(): RelayPresence
}

interface Entry { seq: number; frame: string; bytes: number }
// While `pending` is set the client is still catching up: new frames wait behind the replay.
interface Client { role: FeedRole; response: ServerResponse; pending: string[] | null }

const BODY_LIMIT = 64 * 1024
const DRAIN_LIMIT = 1024 * 1024
const BUFFER_LIMIT = 1024 * 1024
const RETRY_MS = 2000
const AGENT_LIMIT = 40
const AGENT_BYTES = 256 * 1024

function send(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(value))
}

// Consoles see every message, so a console also mirrors lines that a backend or another console sent.
function receives(role: FeedRole, from: FeedRole) { return role === 'console' || from === 'console' }

// One in-memory channel between the mobile stage and its consoles, mounted by dev, preview and npm start alike.
export function createStageRelay({ backlog = 300, backlogBytes = 512 * 1024, heartbeatMs = 15000, maxClients = 64 }: StageRelayOptions = {}): StageRelay {
  // A new epoch per instance lets clients tell a relay restart from a gap instead of skipping fresh ids.
  const epoch = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const sent: Record<FeedRole, Entry[]> = { app: [], console: [] }
  const sentBytes: Record<FeedRole, number> = { app: 0, console: 0 }
  // Each generated host's latest contract, oldest first, so the console's asset library fills in however late it opens.
  const agents = new Map<string, Entry>()
  const clients = new Set<Client>()
  let seq = 0, snapshot: Entry | null = null, agentBytes = 0, closed = false
  let heartbeat: ReturnType<typeof setInterval> | undefined

  // A live client that stops reading is dropped rather than buffered without bound.
  function write(client: Client, chunk: string) {
    if (client.pending) client.pending.push(chunk)
    else if (client.response.writableLength > BUFFER_LIMIT) client.response.destroy()
    else client.response.write(chunk)
  }

  // Catching up waits for the socket to drain, so a large replay is paced instead of overflowing the buffer.
  async function catchUp(client: Client) {
    const { response } = client
    while (client.pending?.length) {
      if (response.destroyed || response.writableEnded) return
      if (!response.write(client.pending.shift()!)) {
        await new Promise<void>((resolve) => {
          const done = () => { response.off('drain', done); response.off('close', done); resolve() }
          response.on('drain', done)
          response.on('close', done)
        })
      }
    }
    client.pending = null
  }

  function keep(from: FeedRole, entry: Entry) {
    const list = sent[from]
    list.push(entry)
    sentBytes[from] += entry.bytes
    while (list.length > backlog || (list.length > 1 && sentBytes[from] > backlogBytes)) sentBytes[from] -= list.shift()!.bytes
  }

  function keepAgent(key: string, entry: Entry) {
    const old = agents.get(key)
    if (old) { agents.delete(key); agentBytes -= old.bytes }
    agents.set(key, entry)
    agentBytes += entry.bytes
    for (const [other, kept] of agents) {
      if (other === key || (agents.size <= AGENT_LIMIT && agentBytes <= AGENT_BYTES)) break
      agents.delete(other)
      agentBytes -= kept.bytes
    }
  }

  function presence() {
    const counts: RelayPresence = { app: 0, console: 0 }
    for (const client of clients) counts[client.role]++
    return counts
  }

  function announcePresence() {
    const frame = `event: presence\ndata: ${JSON.stringify(presence())}\n\n`
    for (const client of clients) write(client, frame)
  }

  function publish(from: FeedRole, message: StageMessage) {
    const id = formatEventId(epoch, ++seq)
    const envelope: StageEnvelope = { id, at: Date.now(), from, message }
    const frame = `id: ${id}\ndata: ${JSON.stringify(envelope)}\n\n`
    const entry = { seq, frame, bytes: Buffer.byteLength(frame) }
    if (message.kind === 'snapshot') snapshot = entry
    else if (message.kind === 'agent') keepAgent(message.contract.id, entry)
    else keep(from, entry)
    for (const client of clients) if (receives(client.role, from)) write(client, entry.frame)
    return id
  }

  // No resume point: a console starts from the latest snapshot and the hosts' agent messages, an app from now.
  // A resume point from an earlier relay instance replays everything this instance holds; otherwise only what
  // came after it. Replays go out in sequence order, which clients rely on to skip what they already have.
  function replay(role: FeedRole, lastEventId: string | null): Entry[] {
    const last = parseEventId(lastEventId)
    const kept = role === 'console' ? [...(snapshot ? [snapshot] : []), ...agents.values()] : []
    const bySeq = (a: Entry, b: Entry) => a.seq - b.seq
    if (!last) return kept.sort(bySeq)
    const after = last.epoch === epoch ? last.seq : 0
    const entries = role === 'app' ? sent.console : [...sent.app, ...sent.console, ...kept]
    return entries.filter((entry) => entry.seq > after).sort(bySeq)
  }

  function stream(request: IncomingMessage, response: ServerResponse, query: URLSearchParams) {
    const role = query.get('role')
    if (role !== 'app' && role !== 'console') { send(response, 400, { error: '请用 role=app 或 role=console 连接舞台。' }); return }
    if (clients.size >= maxClients) { send(response, 503, { error: '舞台连接太多了，请关掉不用的页面。' }); return }
    // Browsers resend Last-Event-ID on their own reconnects; the query carries it across manual reconnects and reloads.
    const header = request.headers['last-event-id']
    const lastEventId = (typeof header === 'string' && header) || query.get('lastEventId')
    response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' })
    // A small first write also keeps preview's compression middleware from wrapping the stream.
    response.write(`retry: ${RETRY_MS}\n\n`)
    const client: Client = { role, response, pending: replay(role, lastEventId).map((entry) => entry.frame) }
    clients.add(client)
    response.on('close', () => {
      if (!clients.delete(client)) return
      if (!clients.size) { clearInterval(heartbeat); heartbeat = undefined }
      announcePresence()
    })
    heartbeat ??= setInterval(() => { for (const c of clients) write(c, ': ping\n\n') }, heartbeatMs)
    heartbeat.unref?.()
    announcePresence()
    void catchUp(client)
  }

  async function receive(request: IncomingMessage, response: ServerResponse) {
    if (request.method !== 'POST') { send(response, 405, { error: '请用 POST 发送舞台消息。' }); return }
    if (!request.headers['content-type']?.startsWith('application/json')) { send(response, 415, { error: '舞台消息需要是 JSON。' }); return }
    const chunks: Buffer[] = []
    let size = 0
    try {
      // Draining a moderately oversized body lets the client actually read the 413; abuse just loses the socket.
      for await (const chunk of request) {
        size += chunk.length
        if (size > DRAIN_LIMIT) { request.destroy(); return }
        if (size <= BODY_LIMIT) chunks.push(chunk)
      }
    } catch { return }
    if (size > BODY_LIMIT) { send(response, 413, { error: '这条消息太大了。' }); return }
    let input
    try { input = parseSendRequest(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
    catch (error) { send(response, 400, { error: '消息格式不正确。', detail: error instanceof Error ? error.message : String(error) }); return }
    if (closed) { send(response, 503, { error: '舞台中继已关闭。' }); return }
    send(response, 202, { id: publish(input.from, input.message) })
  }

  const relay = ((request, response, next) => {
    const [path = '', search = ''] = (request.url || '').split('?')
    if (!path.startsWith('/api/stage/')) { next?.(); return }
    if (closed) { send(response, 503, { error: '舞台中继已关闭。' }); return }
    if (path === '/api/stage/events') {
      if (request.method !== 'GET') { send(response, 405, { error: '请用 GET 订阅舞台。' }); return }
      stream(request, response, new URLSearchParams(search))
    } else if (path === '/api/stage/send') void receive(request, response)
    else send(response, 404, { error: '没有这个舞台接口。' })
  }) as StageRelay

  relay.presence = presence
  // Ends every open stream so the hosting server can shut down or restart without waiting on them.
  relay.close = () => {
    closed = true
    clearInterval(heartbeat)
    const open = [...clients]
    clients.clear()
    for (const client of open) client.response.end()
    sent.app.length = 0
    sent.console.length = 0
    sentBytes.app = sentBytes.console = 0
    agents.clear()
    agentBytes = 0
    snapshot = null
  }
  return relay
}
