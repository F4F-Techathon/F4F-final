import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer, request as httpRequest } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { createStageRelay } from '../server/stageRelay.ts'
import { createMessageId, parseAppMessage, parseConsoleMessage, parseEventId } from '../src/agents/feed/protocol.ts'
import { createSseStageFeed } from '../src/agents/feed/stageFeed.ts'
import { applyStageMessage, createDirectorState, recentLines, speakerOf } from '../director/src/core/timeline.ts'

const cast = [
  { id: 'bashi', name: '蓉姐', restaurant: '巴适川菜', color: '#C9483E', status: 'ready', greeting: '来我屋头坐坐嘛！', evidenceIds: ['bashi-info', 'bashi-review'] },
  { id: 'huaji', name: '华叔', restaurant: '华记粤点', color: '#2F6E62', status: 'generating', step: '口音' },
]
const line = (id, extra = {}) => ({ kind: 'line', id, speaker: 'bashi', text: `台词 ${id}`, ...extra })
const snapshot = (phase) => ({ kind: 'snapshot', phase, cast })
const decision = (lineId) => ({
  kind: 'decision', lineId, source: 'jev', latencyMs: 1180,
  speaker: { expr: { id: 'pitch', zh: '自信推销' }, punch: { id: 'proud', zh: '得意' }, gesture: { id: 'present', zh: '摊手展示' }, act: { id: 'stepIn', zh: '上前一步' }, gaze: { id: 'audience', zh: '看向观众' }, bubble: { id: 'normal', zh: '普通气泡' }, intensity: { score: 1.6, zh: '鲜明' } },
  listeners: { huaji: { reaction: { id: 'shock', zh: '震惊' }, confidence: 0.82 } },
})

// Mounts the relay on a plain server the way vite.config.ts and server/index.ts do; restart() swaps in a new instance.
async function startRelay(t, options) {
  let relay = createStageRelay(options)
  const server = createServer((request, response) => relay(request, response, () => { response.writeHead(204, { 'x-next': '1' }); response.end() }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => { relay.close(); server.closeAllConnections(); server.close(resolve) }))
  return {
    port: server.address().port,
    get relay() { return relay },
    restart() { relay.close(); relay = createStageRelay(options) },
  }
}

// Parses SSE by the spec's line rules; comments are reported separately so heartbeats stay observable.
function readSse(response, onEvent, onComment) {
  let buffer = '', data = [], type = '', frameId, lastEventId = ''
  response.setEncoding('utf8')
  response.on('data', (chunk) => {
    buffer += chunk
    for (let index = buffer.indexOf('\n'); index >= 0; index = buffer.indexOf('\n')) {
      const text = buffer.slice(0, index).replace(/\r$/, '')
      buffer = buffer.slice(index + 1)
      if (text === '') {
        if (data.length) onEvent({ type: type || 'message', data: data.join('\n'), id: frameId, lastEventId })
        data = []; type = ''; frameId = undefined
      } else if (text.startsWith(':')) onComment(text.slice(1).trim())
      else {
        const colon = text.indexOf(':')
        const field = colon < 0 ? text : text.slice(0, colon), value = colon < 0 ? '' : text.slice(colon + 1).replace(/^ /, '')
        if (field === 'data') data.push(value)
        else if (field === 'event') type = value
        else if (field === 'id') frameId = lastEventId = value
        else if (field === 'retry') onEvent({ type: 'retry', data: value })
      }
    }
  })
}

function openStream(port, { role, header, query } = {}) {
  const params = new URLSearchParams(role ? { role } : {})
  if (query) params.set('lastEventId', query)
  const stream = { status: 0, events: [], comments: [], retry: null, ended: false, waiters: new Set() }
  const notify = () => { for (const waiter of [...stream.waiters]) waiter() }
  stream.request = httpRequest({ host: '127.0.0.1', port, path: `/api/stage/events?${params}`, headers: header ? { 'Last-Event-ID': header } : {} })
  stream.ready = new Promise((resolve, reject) => {
    stream.request.on('response', (response) => {
      Object.assign(stream, { status: response.statusCode, headers: response.headers })
      readSse(response, (event) => { if (event.type === 'retry') stream.retry = Number(event.data); else stream.events.push(event); notify() }, (comment) => { stream.comments.push(comment); notify() })
      response.on('end', () => { stream.ended = true; notify() })
      resolve(stream)
    })
    stream.request.on('error', (error) => { if (!stream.closed) reject(error) })
  })
  stream.request.end()
  stream.messages = () => stream.events.filter((event) => event.type === 'message').map((event) => JSON.parse(event.data))
  stream.presence = () => stream.events.filter((event) => event.type === 'presence').map((event) => JSON.parse(event.data)).at(-1)
  stream.until = (check, timeout = 2000) => new Promise((resolve, reject) => {
    const done = () => { clearTimeout(timer); stream.waiters.delete(tick) }
    const tick = () => { const value = check(stream); if (value) { done(); resolve(value) } }
    const timer = setTimeout(() => { done(); reject(new Error('Timed out waiting for the event stream')) }, timeout)
    stream.waiters.add(tick)
    tick()
  })
  stream.close = () => { stream.closed = true; stream.request.destroy() }
  return stream
}

async function post(port, body, { type = 'application/json', path = '/api/stage/send' } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'Content-Type': type }, body: typeof body === 'string' ? body : JSON.stringify(body) })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

async function until(check, timeout = 2000) {
  for (const start = Date.now(); !check(); await delay(5)) if (Date.now() - start > timeout) throw new Error('Timed out waiting for the condition')
}

test('protocol normalizes valid messages in both directions and names the failing field', () => {
  assert.deepEqual(parseConsoleMessage({ kind: 'line', id: 'c-1', speaker: 'bashi', text: '  欢迎！  ', replyTo: ['u-1', 'u-1', 'c-0'], topic: null, evidenceIds: undefined }), { kind: 'line', id: 'c-1', speaker: 'bashi', text: '欢迎！', replyTo: ['u-1', 'c-0'] })
  assert.deepEqual(parseConsoleMessage({ kind: 'clear', extra: true }), { kind: 'clear' })
  assert.deepEqual(parseAppMessage(decision('c-1')), decision('c-1'))
  assert.deepEqual(parseAppMessage(snapshot('debate')), snapshot('debate'))
  const customer = parseAppMessage({ ...decision('u-1'), source: 'baseline', note: 'Jev 超时', speaker: { bubble: { id: 'normal', zh: '普通气泡' }, mood: 'extra' } })
  assert.deepEqual(customer.speaker, { bubble: { id: 'normal', zh: '普通气泡' } })
  for (const value of [snapshot('debate'), { kind: 'line', id: 'x', speaker: 'bashi' }, line('has space'), line('long', { text: '长'.repeat(601) }), line('many', { replyTo: Array.from({ length: 13 }, (_, i) => `r${i}`) })]) assert.throws(() => parseConsoleMessage(value))
  for (const value of [{ ...decision('x'), source: 'gpt' }, { ...snapshot('debate'), phase: 'lobby' }, { ...snapshot('debate'), cast: [cast[0], cast[0]] }, { ...snapshot('debate'), cast: [{ ...cast[0], color: 'red' }] }, { kind: 'line-state', id: 'x', phase: 'paused' }, line('wrong-direction')]) assert.throws(() => parseAppMessage(value))
  assert.throws(() => parseAppMessage({ ...decision('x'), listeners: { huaji: { reaction: { id: 'shock', zh: '震惊' }, confidence: 1.2 } } }), /decision\.listeners\.huaji\.confidence/)
  assert.throws(() => parseAppMessage({ ...decision('x'), speaker: { intensity: { score: 4, zh: '爆发' } } }), /decision\.speaker\.intensity\.score/)
  const unsure = parseAppMessage({ ...decision('x'), speaker: { expr: { id: 'idle', zh: '待机', gated: true } }, listeners: { huaji: { reaction: { id: 'listen', zh: '倾听', gated: true }, confidence: null }, pierre: { reaction: { id: 'laugh', zh: '大笑' } } } })
  assert.deepEqual(unsure.listeners, { huaji: { reaction: { id: 'listen', zh: '倾听', gated: true }, confidence: null }, pierre: { reaction: { id: 'laugh', zh: '大笑' }, confidence: null } })
  assert.equal(unsure.speaker.expr.gated, true)
  assert.throws(() => parseAppMessage({ ...decision('x'), speaker: { expr: { id: 'idle', zh: '待机', gated: 'yes' } } }), /decision\.speaker\.expr\.gated/)
  assert.deepEqual(parseEventId('k3j2a1-12'), { epoch: 'k3j2a1', seq: 12 })
  for (const value of ['k3j2a1-0', 'K3-1', '12', undefined, 'a-1-2']) assert.equal(parseEventId(value), null)
  const id = createMessageId('c')
  assert.match(id, /^c-[a-z0-9]+-[a-z0-9]+$/)
  assert.equal(parseConsoleMessage(line(id)).id, id)
})

test('console lines reach apps and every console; app reports reach consoles only', async (t) => {
  const { port } = await startRelay(t)
  const app = openStream(port, { role: 'app' }), desk = openStream(port, { role: 'console' })
  await Promise.all([app.ready, desk.ready])
  assert.equal(app.status, 200)
  assert.match(app.headers['content-type'], /^text\/event-stream/)
  assert.match(app.headers['cache-control'], /no-cache/)
  await desk.until((s) => s.presence()?.app === 1 && s.presence()?.console === 1)
  const sent = await post(port, { from: 'console', message: line('l1', { replyTo: ['u1'], topic: '开场', evidenceIds: ['bashi-info'] }) })
  assert.equal(sent.status, 202)
  await app.until((s) => s.messages().length === 1)
  const [delivered] = app.messages()
  assert.deepEqual(delivered.message, line('l1', { replyTo: ['u1'], topic: '开场', evidenceIds: ['bashi-info'] }))
  assert.equal(delivered.id, sent.body.id)
  assert.equal(delivered.from, 'console')
  assert.equal(app.events.find((event) => event.type === 'message').lastEventId, sent.body.id)
  await desk.until((s) => s.messages().some((m) => m.id === sent.body.id))
  const report = await post(port, { from: 'app', message: { kind: 'line-state', id: 'l1', phase: 'speaking' } })
  await desk.until((s) => s.messages().some((m) => m.id === report.body.id))
  const clear = await post(port, { from: 'console', message: { kind: 'clear' } })
  await app.until((s) => s.messages().some((m) => m.id === clear.body.id))
  await desk.until((s) => s.messages().some((m) => m.id === clear.body.id))
  assert.deepEqual(app.messages().map((m) => m.message.kind), ['line', 'clear'])
  assert.deepEqual(desk.messages().map((m) => m.message.kind), ['line', 'line-state', 'clear'])
  const seqs = [sent, report, clear].map((r) => parseEventId(r.body.id))
  assert(seqs[0].seq < seqs[1].seq && seqs[1].seq < seqs[2].seq && seqs.every((s) => s.epoch === seqs[0].epoch))
  app.close()
  await desk.until((s) => s.presence()?.app === 0)
})

test('a fresh console first receives only the latest snapshot; a fresh app starts from now', async (t) => {
  const { port } = await startRelay(t)
  await post(port, { from: 'app', message: snapshot('pick') })
  const latest = await post(port, { from: 'app', message: snapshot('debate') })
  await post(port, { from: 'app', message: decision('l0') })
  await post(port, { from: 'console', message: line('l0') })
  const desk = openStream(port, { role: 'console' }), app = openStream(port, { role: 'app' })
  await desk.until((s) => s.presence()?.app === 1)
  await app.until((s) => s.presence())
  assert.equal(desk.retry, 2000)
  assert.equal(desk.events[0].type, 'message')
  assert.deepEqual(desk.messages().map((m) => [m.id, m.message.kind, m.message.phase]), [[latest.body.id, 'snapshot', 'debate']])
  assert.equal(app.messages().length, 0)
})

test('Last-Event-ID replays exactly what was missed, by header or query, and everything after a relay restart', async (t) => {
  const relay = await startRelay(t)
  const { port } = relay
  const first = openStream(port, { role: 'app' })
  await first.until((s) => s.presence())
  await post(port, { from: 'console', message: line('A') })
  const b = await post(port, { from: 'console', message: line('B') })
  await first.until((s) => s.messages().length === 2)
  first.close()
  await post(port, { from: 'console', message: line('C') })
  await post(port, { from: 'app', message: snapshot('debate') })
  const d = await post(port, { from: 'console', message: line('D') })
  // The header wins over a stale query, as when a browser reconnects with the URL it was opened with.
  for (const resume of [{ header: b.body.id }, { query: b.body.id }, { header: b.body.id, query: 'zzzz-1' }]) {
    const again = openStream(port, { role: 'app', ...resume })
    await again.until((s) => s.messages().length >= 2 && s.presence())
    assert.deepEqual(again.messages().map((m) => m.message.id), ['C', 'D'])
    again.close()
  }
  const desk = openStream(port, { role: 'console', header: b.body.id })
  await desk.until((s) => s.messages().length >= 3 && s.presence())
  assert.deepEqual(desk.messages().map((m) => m.message.id ?? m.message.kind), ['C', 'snapshot', 'D'])
  const garbage = openStream(port, { role: 'app', header: 'not-an-event-id' })
  await garbage.until((s) => s.presence())
  assert.equal(garbage.messages().length, 0)
  relay.restart()
  const e = await post(port, { from: 'console', message: line('E') })
  const resumed = openStream(port, { role: 'app', header: d.body.id })
  await resumed.until((s) => s.messages().length >= 1 && s.presence())
  assert.deepEqual(resumed.messages().map((m) => m.message.id), ['E'])
  assert.notEqual(parseEventId(e.body.id).epoch, parseEventId(d.body.id).epoch)
  assert.equal(parseEventId(e.body.id).seq, 1)
})

test('the replay backlog is bounded per sender', async (t) => {
  const { port } = await startRelay(t, { backlog: 2 })
  for (const id of ['1', '2', '3']) await post(port, { from: 'console', message: line(`l${id}`) })
  for (const id of ['1', '2', '3']) await post(port, { from: 'app', message: { kind: 'line-state', id: `l${id}`, phase: 'done' } })
  const app = openStream(port, { role: 'app', header: 'zzzz-1' }), desk = openStream(port, { role: 'console', header: 'zzzz-1' })
  await app.until((s) => s.messages().length >= 2 && s.presence())
  await desk.until((s) => s.messages().length >= 4 && s.presence())
  assert.deepEqual(app.messages().map((m) => m.message.id), ['l2', 'l3'])
  assert.deepEqual(desk.messages().map((m) => `${m.message.kind}:${m.message.id}`), ['line:l2', 'line:l3', 'line-state:l2', 'line-state:l3'])
})

test('invalid requests are refused with 4xx and are never delivered or numbered', async (t) => {
  const { port } = await startRelay(t)
  const app = openStream(port, { role: 'app' })
  await app.until((s) => s.presence())
  const refused = [
    { from: 'console', message: snapshot('debate') },
    { from: 'console', message: { kind: 'line', id: 'x', speaker: 'bashi' } },
    { from: 'console', message: line('has space') },
    { from: 'console', message: line('long', { text: '长'.repeat(601) }) },
    { from: 'app', message: { ...decision('l1'), source: 'gpt' } },
    { from: 'robot', message: { kind: 'clear' } },
    { message: { kind: 'clear' } },
  ]
  for (const body of refused) {
    const response = await post(port, body)
    assert.equal(response.status, 400)
    assert.equal(typeof response.body.error, 'string')
    assert.equal(typeof response.body.detail, 'string')
  }
  assert.equal((await post(port, '{"from":')).status, 400)
  assert.equal((await post(port, { from: 'console', message: { kind: 'clear' } }, { type: 'text/plain' })).status, 415)
  assert.equal((await post(port, { from: 'console', message: line('big'), padding: 'x'.repeat(70 * 1024) })).status, 413)
  assert.equal((await post(port, {}, { path: '/api/stage/events?role=app' })).status, 405)
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/stage/send`)).status, 405)
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/stage/events?role=judge`)).status, 400)
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/stage/unknown`)).status, 404)
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/intake`)).headers.get('x-next'), '1')
  const accepted = await post(port, { from: 'console', message: line('valid') })
  assert.equal(parseEventId(accepted.body.id).seq, 1)
  await app.until((s) => s.messages().length === 1)
  assert.equal(app.messages()[0].message.id, 'valid')
})

test('heartbeat comments keep the stream alive without disturbing events or ids', async (t) => {
  const { port } = await startRelay(t, { heartbeatMs: 20 })
  const app = openStream(port, { role: 'app' })
  await app.until((s) => s.comments.length >= 2)
  const sent = await post(port, { from: 'console', message: line('after-ping') })
  await app.until((s) => s.messages().length === 1)
  await app.until((s) => s.comments.length >= 4)
  assert(app.comments.every((comment) => comment === 'ping'))
  assert.equal(app.retry, 2000)
  assert.deepEqual(app.messages().map((m) => m.message.id), ['after-ping'])
  assert.deepEqual(app.events.filter((event) => event.type === 'message').map((event) => event.id), [sent.body.id])
  assert.deepEqual([...new Set(app.events.map((event) => event.type))].sort(), ['message', 'presence'])
  assert(app.events.filter((event) => event.type === 'presence').every((event) => event.id === undefined))
})

test('closing the relay ends open streams and refuses further requests', async (t) => {
  const relay = await startRelay(t)
  const app = openStream(relay.port, { role: 'app' })
  await app.until((s) => s.presence())
  relay.relay.close()
  await app.until((s) => s.ended)
  assert.equal((await post(relay.port, { from: 'console', message: { kind: 'clear' } })).status, 503)
})

// A browser-like EventSource for Node: an HTTP error or a lost stream leaves it CLOSED, as browsers do after errors.
function nodeEventSource() {
  return class NodeEventSource {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSED = 2
    constructor(url) {
      Object.assign(this, { url, readyState: 0, onopen: null, onmessage: null, onerror: null, named: new Map() })
      this.request = httpRequest(new URL(url))
      this.request.on('response', (response) => {
        if (response.statusCode !== 200) { response.resume(); this.fail(); return }
        this.readyState = 1
        this.onopen?.({})
        readSse(response, (event) => {
          if (this.readyState !== 1 || event.type === 'retry') return
          if (event.type === 'message') this.onmessage?.({ data: event.data, lastEventId: event.lastEventId })
          else for (const listener of this.named.get(event.type) || []) listener({ data: event.data })
        }, () => {})
        response.on('end', () => this.fail())
      })
      this.request.on('error', () => this.fail())
      this.request.end()
    }
    addEventListener(type, listener) { this.named.set(type, [...(this.named.get(type) || []), listener]) }
    fail() { if (this.readyState === 2) return; this.readyState = 2; this.onerror?.({}) }
    close() { this.readyState = 2; this.request.destroy() }
  }
}

test('feeds exchange messages, report presence and resume after a relay restart without losing new ids', async (t) => {
  const relay = await startRelay(t)
  const options = { base: `http://127.0.0.1:${relay.port}/api/stage`, EventSource: nodeEventSource(), reconnectMs: { min: 20, max: 40 } }
  const app = createSseStageFeed({ role: 'app', ...options }), desk = createSseStageFeed({ role: 'console', ...options })
  const appInbox = [], deskInbox = []
  app.onMessage((message, meta) => appInbox.push({ message, meta }))
  desk.onMessage((message, meta) => deskInbox.push({ message, meta }))
  await until(() => desk.status === 'open' && desk.peers?.app === 1 && desk.peers?.console === 1)
  const id = await desk.send({ kind: 'line', id: 'f1', speaker: 'host', text: '欢迎来到饭店请就位！' })
  await until(() => appInbox.length === 1 && deskInbox.length === 1)
  assert.equal(appInbox[0].meta.id, id)
  assert.equal(app.lastEventId, id)
  assert.equal(deskInbox[0].meta.from, 'console')
  await app.send({ kind: 'line-state', id: 'f1', phase: 'done' })
  await until(() => deskInbox.length === 2)
  assert.equal(deskInbox[1].message.phase, 'done')
  await assert.rejects(app.send({ kind: 'line', id: 'x', speaker: 'bashi', text: '应用不能发台词' }))
  relay.restart()
  const fresh = await post(relay.port, { from: 'console', message: line('after-restart') })
  await until(() => appInbox.some((entry) => entry.message.id === 'after-restart') && app.status === 'open')
  assert.equal(app.lastEventId, fresh.body.id)
  assert.deepEqual(appInbox.map((entry) => entry.message.id), ['f1', 'after-restart'])
  app.close()
  desk.close()
  assert.equal(app.status, 'closed')
  await assert.rejects(desk.send({ kind: 'clear' }), /已关闭/)
})

test('feeds drop replayed ids, accept a new relay epoch and reconnect from their resume point', async () => {
  const sources = []
  class ScriptedSource {
    constructor(url) { Object.assign(this, { url, readyState: 0, closed: false, named: {} }); sources.push(this) }
    addEventListener(type, listener) { this.named[type] = listener }
    close() { this.readyState = 2; this.closed = true }
  }
  const statuses = []
  const feed = createSseStageFeed({ role: 'app', EventSource: ScriptedSource, lastEventId: 'aaaa-3', reconnectMs: { min: 5, max: 10 } })
  feed.onStatus((status) => { if (statuses.at(-1) !== status) statuses.push(status) })
  const delivered = []
  feed.onMessage((_message, meta) => delivered.push(meta.id))
  const source = sources[0]
  assert.equal(new URL(source.url, 'http://x').searchParams.get('lastEventId'), 'aaaa-3')
  assert.equal(new URL(source.url, 'http://x').searchParams.get('role'), 'app')
  source.readyState = 1
  source.onopen({})
  const envelope = (id, from = 'console', message = { kind: 'clear' }) => ({ data: JSON.stringify({ id, at: 1, from, message }) })
  for (const id of ['aaaa-2', 'aaaa-3', 'aaaa-4', 'aaaa-4', 'bbbb-1', 'bbbb-1', 'bbbb-2']) source.onmessage(envelope(id))
  source.onmessage({ data: 'not json' })
  source.onmessage(envelope('bbbb-3', 'app', { kind: 'user-line', id: 'u1', text: '我' }))
  source.onmessage(envelope('bbbb-4', 'console', { kind: 'line', id: 'bad id', speaker: 'bashi', text: '格式不对' }))
  assert.deepEqual(delivered, ['aaaa-4', 'bbbb-1', 'bbbb-2'])
  source.named.presence({ data: JSON.stringify({ app: 1, console: 2 }) })
  assert.deepEqual(feed.peers, { app: 1, console: 2 })
  // CONNECTING after an error: the browser retries by itself, so no second source is opened.
  source.readyState = 0
  source.onerror({})
  assert.equal(feed.status, 'retrying')
  assert.equal(sources.length, 1)
  // CLOSED after an error: the feed reopens with its resume point in the query.
  source.readyState = 2
  source.onerror({})
  await until(() => sources.length === 2)
  assert.equal(new URL(sources[1].url, 'http://x').searchParams.get('lastEventId'), 'bbbb-2')
  sources[1].readyState = 1
  sources[1].onopen({})
  assert.deepEqual(statuses, ['open', 'retrying', 'open'])
  feed.close()
  assert(sources[1].closed)
  assert.equal(statuses.at(-1), 'closed')
})

test('send reports the relay refusal, including its detail, or a lost connection', async () => {
  class IdleSource { constructor() { this.readyState = 0 } addEventListener() {} close() {} }
  const refusing = createSseStageFeed({ role: 'console', EventSource: IdleSource, fetch: async () => Response.json({ error: '消息格式不正确。', detail: 'line.text must be text' }, { status: 400 }) })
  await assert.rejects(refusing.send({ kind: 'clear' }), /消息格式不正确。（line\.text must be text）/)
  const offline = createSseStageFeed({ role: 'console', EventSource: IdleSource, fetch: async () => { throw new TypeError('fetch failed') } })
  await assert.rejects(offline.send({ kind: 'clear' }), /连不上舞台中继/)
  const accepting = createSseStageFeed({ role: 'console', EventSource: IdleSource, fetch: async (url, init) => Response.json({ id: 'abcd-7', url, body: init.body }, { status: 202 }) })
  assert.equal(await accepting.send({ kind: 'line', id: 'c1', speaker: 'host', text: ' 晚上好 ' }), 'abcd-7')
  for (const feed of [refusing, offline, accepting]) feed.close()
})

test('the console timeline folds both directions, ignores repeats and keeps reports about unseen lines', () => {
  const state = createDirectorState()
  let seq = 0
  const apply = (message) => applyStageMessage(state, message, { id: `ab-${++seq}`, at: 1000 + seq, from: ['line', 'clear'].includes(message.kind) ? 'console' : 'app' })
  apply(snapshot('debate'))
  apply(line('l1'))
  apply(line('l1'))
  apply({ kind: 'user-line', id: 'u1', text: '有没有不辣的？' })
  apply({ kind: 'line-state', id: 'l1', phase: 'speaking' })
  apply(decision('l1'))
  apply(decision('ghost'))
  assert.deepEqual(state.timeline.map((item) => [item.no, item.id, item.seen]), [[1, 'l1', true], [2, 'u1', true], [3, 'ghost', false]])
  const [first, customer] = state.timeline
  assert.equal(first.phase, 'speaking')
  assert.equal(first.decision.lineId, 'l1')
  assert.deepEqual([customer.speaker, customer.origin], ['user', 'app'])
  assert.deepEqual(recentLines(state, 8).map((item) => item.id), ['l1', 'u1'])
  apply({ kind: 'clear' })
  assert.deepEqual(recentLines(state, 8), [])
  apply(line('ghost'))
  assert.equal(state.timeline.find((item) => item.id === 'ghost').seen, true)
  assert.equal(state.timeline.length, 4)
  apply({ kind: 'snapshot', phase: 'result', cast: [] })
  assert.equal(speakerOf(state, 'bashi').name, '蓉姐')
  assert.equal(speakerOf(state, 'host').name, '主持人 Orb')
})

const contract = (id, greeting) => ({
  id, name: '蓉姐', restaurant: '巴适川菜', plate: '回锅肉', cuisine: '川菜', language: 'sc', persona: '热情的川菜老板娘。', look: '', signature: '',
  palette: ['#C9483E'], defaults: { expr: 'pitch', gesture: 'present', act: 'stepIn', reaction: 'eyeroll' }, punch: 'laugh', personality: 'hearty',
  keywords: ['川菜'], logo: null, rig: { body: 'f_regular', gender: 'female', theme: '#C9483E', hair: 'bun', outfit: 'jacket', hat: 'none' },
  greeting, shop: { name: '巴适川菜' }, decisions: {}, created: '2026-10-17T12:00:00.000Z',
})

test('a console that opens late still gets every host’s latest agent message, in order', async (t) => {
  const { port } = await startRelay(t, { backlog: 1 })
  await post(port, { from: 'app', message: { kind: 'agent', contract: contract('bashi', '来我屋头坐坐嘛！') } })
  await post(port, { from: 'app', message: { kind: 'agent', contract: contract('huaji', '饮茶先啦！') } })
  await post(port, { from: 'app', message: snapshot('pick') })
  for (const id of ['1', '2']) await post(port, { from: 'app', message: { kind: 'line-state', id: `l${id}`, phase: 'done' } })
  const latest = await post(port, { from: 'app', message: { kind: 'agent', contract: contract('bashi', '巴适得板！') } })
  const late = openStream(port, { role: 'console' }), app = openStream(port, { role: 'app' })
  await late.until((s) => s.messages().length >= 3 && s.presence())
  await app.until((s) => s.presence())
  const got = late.messages()
  assert.deepEqual(got.map(({ message: m }) => m.kind === 'agent' ? `${m.contract.id}:${m.contract.greeting}` : m.kind), ['huaji:饮茶先啦！', 'snapshot', 'bashi:巴适得板！'])
  const seqs = got.map((m) => parseEventId(m.id).seq)
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b))
  assert.equal(got.at(-1).id, latest.body.id)
  assert.deepEqual(app.messages(), [])
  // With a resume point the console gets what came after it, agent messages kept apart from the one-message backlog.
  const resumed = openStream(port, { role: 'console', header: got[0].id })
  await resumed.until((s) => s.messages().length >= 3 && s.presence())
  assert.deepEqual(resumed.messages().map(({ message: m }) => m.kind === 'agent' ? m.contract.id : `${m.kind}:${m.id ?? ''}`), ['snapshot:', 'line-state:l2', 'bashi'])
})

const bulky = (i, size) => ({ ...decision(`l${i}`), detail: { state: { blob: '决'.repeat(size) }, questions: [], answers: {}, plan: {} } })

test('the replay backlog is also bounded by size, so a reconnect replays at most about half a megabyte per sender', async (t) => {
  const { port } = await startRelay(t)
  for (let i = 0; i < 120; i++) assert.equal((await post(port, { from: 'app', message: bulky(i, 5000) })).status, 202)
  const desk = openStream(port, { role: 'console', header: 'zzzz-1' })
  await desk.until((s) => s.messages().at(-1)?.message.lineId === 'l119', 5000)
  const kept = desk.messages().map((m) => Number(m.message.lineId.slice(1)))
  assert.ok(kept.length >= 25 && kept.length < 60, `kept ${kept.length}`)
  assert.deepEqual(kept, kept.map((_, i) => 120 - kept.length + i))
})

test('a console far behind catches up at its own pace instead of being dropped', async (t) => {
  const { port } = await startRelay(t, { backlogBytes: 64 * 1024 * 1024 })
  for (let i = 0; i < 300; i++) assert.equal((await post(port, { from: 'app', message: bulky(i, 7000) })).status, 202)
  // About 6 MB waits for a reader that is not reading yet; writing it in one go overflowed the buffer and dropped the console.
  const frames = []
  let ended = false
  const request = httpRequest({ host: '127.0.0.1', port, path: '/api/stage/events?role=console&lastEventId=zzzz-1' })
  t.after(() => request.destroy())
  await new Promise((resolve, reject) => {
    request.on('error', reject)
    request.on('response', (response) => {
      response.pause()
      response.on('close', () => { ended = true })
      setTimeout(() => {
        readSse(response, (event) => { if (event.type === 'message') frames.push(JSON.parse(event.data)) }, () => {})
        response.resume()
        resolve()
      }, 400)
    })
    request.end()
  })
  await until(() => frames.length >= 300 || ended, 10000)
  assert.equal(ended, false)
  assert.deepEqual(frames.map((frame) => frame.message.lineId), Array.from({ length: 300 }, (_, i) => `l${i}`))
  await post(port, { from: 'console', message: line('after') })
  await until(() => frames.some((frame) => frame.message.id === 'after'))
})
