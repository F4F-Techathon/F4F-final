import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { createServer as createTcpServer, connect } from 'node:net'
import { once } from 'node:events'
import { command, decodeAudioFrame, encodeMicFrame, MIC_FRAME_SAMPLES } from '../src/agents/backend/protocol.ts'
import { characterHints, evidenceFromBackend, expectedSamples, historyForBackend, lineFromSpeech, preferencesFor } from '../src/agents/backend/brief.ts'
import { agentSocketUrl, createAgentSession } from '../src/agents/backend/session.ts'
import { createAgentProxy, createAgentStatus, AGENT_SOCKET_PATH } from '../server/agentBackend.ts'

// The multi-agent backend (Backend/eat-what-backend) as the debate page speaks to it.

test('microphone frames and TTS frames use the backend binary layout', () => {
  const pcm = new Int16Array(MIC_FRAME_SAMPLES).map((_, index) => index - 160)
  const frame = new Uint8Array(encodeMicFrame('mic-1', 7, pcm))
  const length = new DataView(frame.buffer).getUint32(0, true)
  assert.deepEqual(JSON.parse(new TextDecoder().decode(frame.slice(4, 4 + length))), { kind: 'mic', streamId: 'mic-1', chunkSeq: 7, sampleOffset: 7 * 320 })
  assert.equal(frame.byteLength, 4 + length + 640)
  assert.throws(() => encodeMicFrame('mic-1', 0, new Int16Array(100)))

  const header = new TextEncoder().encode(JSON.stringify({ kind: 'tts', epoch: 2, turnId: 't-1', segmentId: 't-1-s0', speakerId: 'shop', chunkSeq: 0, sampleOffset: 480 }))
  const audio = new Uint8Array(4 + header.length + 6)
  new DataView(audio.buffer).setUint32(0, header.length, true)
  audio.set(header, 4)
  audio.set(new Uint8Array(new Int16Array([1, -2, 3]).buffer), 4 + header.length)
  const decoded = decodeAudioFrame(audio.buffer)
  assert.equal(decoded.header.turnId, 't-1')
  assert.deepEqual([...decoded.pcm], [1, -2, 3])
  assert.equal(decodeAudioFrame(new ArrayBuffer(3)), null)
  assert.equal(decodeAudioFrame(audio.buffer.slice(0, 4 + header.length + 1)), null, 'half a sample is malformed')
  const body = JSON.parse(command('s1', 'user.text', { text: '你好' }))
  assert.equal(body.sessionId, 's1')
  assert.equal(body.type, 'user.text')
  assert.match(body.commandId, /^c-/)
})

test('the customer requirements reach the backend as hard limits plus their own words', () => {
  const filters = { maxBudget: 100, quiet: true, noSpice: true, mild: false, allergies: ['花生'], avoidedIngredients: ['香菜'], scene: '约会', preferences: ['环境好'], cuisines: ['湘菜'], excludedCuisines: ['火锅'] }
  assert.deepEqual(preferencesFor(filters, '想吃点不辣的，安静一点', 2), {
    maxBudget: 100, quiet: true, noSpice: true, allergySource: '过敏与忌口：花生过敏、不吃香菜',
    userNotes: ['想吃点不辣的，安静一点', '场景：约会；一共2位；想吃湘菜；不想吃火锅；环境好'],
  })
  assert.deepEqual(preferencesFor({ ...filters, maxBudget: 0, quiet: false, noSpice: false, allergies: [], avoidedIngredients: [], scene: '', preferences: [], cuisines: [], excludedCuisines: [] }, '', null), {})
})

test('hosts become the backend characters: their names, genders and ages', () => {
  const contracts = { a: { name: '郑姐', rig: { gender: 'female', age: 'old' } }, b: { name: '一个非常非常长的名字超过十二', rig: { gender: 'robot' } } }
  assert.deepEqual(characterHints([{ id: 'a' }, { id: 'b' }, { id: 'c' }], (host) => contracts[host.id]), { a: { characterName: '郑姐', gender: 'female', age: 'old' }, b: {} })
})

test('a backend turn becomes a stage line, with its evidence as cards', () => {
  const ready = { turnId: 't-9', speakerId: 'k4ltYupc8AF8MBV1', speaker: '郑姐', speechAct: 'attack', discussionDimension: '价格', text: '你那人均一百三，我这儿二十七管饱。', audioEnabled: true,
    evidence: [{ id: 'shop:k4ltYupc8AF8MBV1:avg_price', restaurantId: 'k4ltYupc8AF8MBV1', kind: 'shop', quote: '参考人均27元' }] }
  assert.deepEqual(lineFromSpeech(ready, { phase: 'start', turnId: 't-9', replyTo: ['t-8'] }), {
    kind: 'line', id: 't-9', speaker: 'k4ltYupc8AF8MBV1', text: ready.text, replyTo: ['t-8'], topic: '开怼 · 价格', evidenceIds: ['shop:k4ltYupc8AF8MBV1:avg_price'],
  })
  assert.deepEqual(evidenceFromBackend({ id: 'review:x:1', restaurantId: 'x', kind: 'review', quote: '[米饭]口味：一般般', star: '2.0', sourceLabel: '差评', dateRaw: '9月29日' }),
    { id: 'review:x:1', restaurantId: 'x', kind: 'review', title: '差评 · 2.0 星', text: '口味：一般般', source: '大众点评', date: '9月29日', mock: false })
  assert.equal(evidenceFromBackend({ id: 'dish:x:1', restaurantId: 'x', kind: 'dish', quote: '剁椒鱼头' }).title, '推荐菜')
  assert.equal(expectedSamples('一二三四五'), Math.round(5 * 0.22 * 24000))
})

test('a regional host speaks its dialect: its language goes to the backend, the Mandarin comes back as the gloss', () => {
  const contracts = { a: { name: '钟叔', language: 'yue', rig: { gender: 'male', age: 'middle' } }, b: { name: '上校', language: 'zh', rig: { gender: 'male', age: 'old' } } }
  assert.deepEqual(characterHints([{ id: 'a' }, { id: 'b' }], (host) => contracts[host.id]),
    { a: { characterName: '钟叔', gender: 'male', age: 'middle', language: 'yue' }, b: { characterName: '上校', gender: 'male', age: 'old' } })
  const ready = { turnId: 't-3', speakerId: 'a', speaker: '钟叔', text: '食完要食成个月公仔面喎！', gloss: '吃完要吃一个月泡面！', evidence: [], audioEnabled: true }
  assert.equal(lineFromSpeech(ready).gloss, '吃完要吃一个月泡面！')
  assert.equal('gloss' in lineFromSpeech({ ...ready, gloss: ready.text }), false)
  // Coming back to the debate, the backend gets the line as it first wrote it.
  assert.deepEqual(historyForBackend([{ id: 't-3', restaurantId: 'a', text: ready.text, gloss: ready.gloss, evidenceIds: [] }], ['a']),
    [{ turnId: 't-3', restaurantId: 'a', text: '吃完要吃一个月泡面！', evidenceIds: [] }])
})

test('coming back to a debate, the lines already performed go back to the backend', () => {
  const line = (id, restaurantId, text, extra = {}) => ({ id, restaurantId, speakerId: restaurantId || 'host', speaker: '', text, round: 0, topic: '', evidenceIds: [], time: '', ...extra })
  const history = [
    line('t-1', 'a', '来啦，叫我龙叔！灶上春人均二十三。', { evidenceIds: ['shop:a:avg_price', 'dish:a:1'] }),
    line('host-1', '', '各位选手请就位'),
    line('user-1', '', ' 我不吃辣，人均五十以内 ', { speakerId: 'user', user: true }),
    line('t-2', 'b', '龙叔那地下室一股霉味。', { evidenceIds: Array.from({ length: 14 }, (_, i) => `review:a:${i}`) }),
    line('guest-1', '', '我是来串门的', { speakerId: 'guest-x', guest: true }),
    line('t-3', 'gone', '已经离场的店'),
    line('t-4', 'a', '   '),
  ]
  assert.deepEqual(historyForBackend(history, ['a', 'b']), [
    { turnId: 't-1', restaurantId: 'a', text: '来啦，叫我龙叔！灶上春人均二十三。', evidenceIds: ['shop:a:avg_price', 'dish:a:1'] },
    { turnId: 'user-1', role: 'user', text: '我不吃辣，人均五十以内' },
    { turnId: 't-2', restaurantId: 'b', text: '龙叔那地下室一股霉味。', evidenceIds: Array.from({ length: 12 }, (_, i) => `review:a:${i}`) },
  ])
  assert.deepEqual(historyForBackend([], ['a']), [])
  // A long debate sends its latest lines, as many as the backend reads.
  const long = historyForBackend(Array.from({ length: 230 }, (_, i) => line(`t-${i}`, 'a', `第${i}句`)), ['a'])
  assert.equal(long.length, 200)
  assert.equal(long[0].turnId, 't-30')

  const socket = fakeSocket()
  const session = createAgentSession('ws://test/api/agents/realtime', {}, () => socket)
  socket.open()
  session.start({ restaurantIds: ['a', 'b'], audioEnabled: false, history: historyForBackend(history, ['a', 'b']) })
  const start = socket.commands().find((c) => c.type === 'session.start')
  assert.deepEqual(start.data.history.map((item) => item.turnId), ['t-1', 'user-1', 't-2'])
})

// A WebSocket stand-in: what the session sends, and a way to deliver what the backend would.
function fakeSocket() {
  const socket = { readyState: 0, binaryType: '', sent: [], onopen: null, onmessage: null, onclose: null, onerror: null,
    send(data) { this.sent.push(data) }, close() { this.readyState = 3; this.onclose?.({}) } }
  socket.open = () => { socket.readyState = 1; socket.onopen?.({}) }
  socket.event = (type, epoch, data = {}) => socket.onmessage({ data: JSON.stringify({ sessionId: 'console-1', seq: 1, epoch, type, data }) })
  socket.commands = () => socket.sent.filter((item) => typeof item === 'string').map((item) => JSON.parse(item))
  return socket
}

test('the session waits for the socket, follows the epoch and numbers microphone frames', () => {
  const socket = fakeSocket()
  const seen = [], audio = [], statuses = [], epochs = []
  const session = createAgentSession('ws://test/api/agents/realtime', {
    status: (value) => statuses.push(value), event: (event) => seen.push(`${event.type}@${event.epoch}`),
    epoch: (next, previous) => epochs.push([previous, next]), audio: (header) => audio.push(`${header.turnId}@${header.epoch}`),
  }, () => socket)
  session.start({ restaurantIds: ['a'], audioEnabled: false })
  assert.equal(socket.sent.length, 0, 'nothing goes out before the socket opens')
  socket.open()
  assert.deepEqual(socket.commands().map((c) => c.type), ['session.start'])
  socket.event('state', 0, { status: 'ready' })
  socket.event('turn', 1, { phase: 'start', turnId: 't-1' })
  socket.event('speech.ready', 0, { turnId: 't-0' })
  assert.deepEqual(seen, ['state@0', 'turn@1'], 'events of a cancelled epoch are dropped')
  assert.deepEqual(epochs, [[0, 1]])
  const frame = (epoch) => {
    const header = new TextEncoder().encode(JSON.stringify({ kind: 'tts', epoch, turnId: 't-1', segmentId: 's', speakerId: 'a', chunkSeq: 0, sampleOffset: 0 }))
    const bytes = new Uint8Array(4 + header.length + 4)
    new DataView(bytes.buffer).setUint32(0, header.length, true)
    bytes.set(header, 4)
    return bytes.buffer
  }
  socket.onmessage({ data: frame(0) })
  socket.onmessage({ data: frame(1) })
  assert.deepEqual(audio, ['t-1@1'])
  session.userText('预算一百')
  session.playback('t-1', 1, 'ended', 0)
  const stream = session.micStart()
  session.micFrame(new Int16Array(320))
  session.micFrame(new Int16Array(320))
  const commands = socket.commands()
  assert.equal(commands.at(-1).type, 'mic.start')
  assert.equal(commands.at(-1).sessionId, 'console-1', 'commands carry the session id the backend gave')
  assert.deepEqual(commands.find((c) => c.type === 'playback').data, { turnId: 't-1', epoch: 1, status: 'ended', playedSamples: 0 })
  const frames = socket.sent.filter((item) => item instanceof ArrayBuffer).map((buffer) => {
    const length = new DataView(buffer).getUint32(0, true)
    return JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, length)))
  })
  assert.deepEqual(frames.map((f) => [f.streamId, f.chunkSeq]), [[stream, 0], [stream, 1]])
  session.close()
  assert.deepEqual(statuses, ['open', 'closed'])
  assert.equal(agentSocketUrl({ protocol: 'https:', host: 'example.test' }), 'wss://example.test/api/agents/realtime')
})

// The page's socket is tunnelled to the backend's /api/realtime, headers and bytes as they are.
test('the agent socket is passed through to the backend, and a missing backend fails visibly', async (t) => {
  let upgradeRequest = ''
  const backend = createTcpServer((socket) => {
    socket.once('data', (data) => {
      upgradeRequest = data.toString('latin1')
      socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
      socket.on('data', (more) => socket.write(Buffer.concat([Buffer.from('echo:'), more])))
    })
  })
  backend.listen(0, '127.0.0.1')
  await once(backend, 'listening')
  const proxy = createAgentProxy(`http://127.0.0.1:${backend.address().port}`)
  const server = createServer((_req, res) => { res.writeHead(404); res.end() })
  server.on('upgrade', (request, socket, head) => { if (!proxy(request, socket, head)) socket.destroy() })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => { server.closeAllConnections?.(); server.close(); backend.close() })

  const client = connect(server.address().port, '127.0.0.1')
  await once(client, 'connect')
  client.write(`GET ${AGENT_SOCKET_PATH}?x=1 HTTP/1.1\r\nHost: phone.local:3000\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: abc\r\nSec-WebSocket-Version: 13\r\n\r\n`)
  let received = ''
  client.on('data', (data) => { received += data.toString('latin1') })
  while (!received.includes('101')) await new Promise((resolve) => setTimeout(resolve, 10))
  assert.match(upgradeRequest, /^GET \/api\/realtime\?x=1 HTTP\/1\.1\r\n/)
  assert.match(upgradeRequest, /\r\nHost: 127\.0\.0\.1:\d+\r\n/)
  assert.match(upgradeRequest, /Sec-WebSocket-Key: abc/)
  client.write('ping')
  while (!received.includes('echo:ping')) await new Promise((resolve) => setTimeout(resolve, 10))
  client.destroy()

  // Other paths are not the proxy's.
  assert.equal(proxy({ url: '/api/stage/events', rawHeaders: [] }, null, Buffer.alloc(0)), false)

  // No backend listening: the page gets an HTTP error instead of a hanging socket.
  const deadProxy = createAgentProxy('http://127.0.0.1:9')
  const dead = createServer()
  dead.on('upgrade', (request, socket, head) => deadProxy(request, socket, head))
  dead.listen(0, '127.0.0.1')
  await once(dead, 'listening')
  t.after(() => dead.close())
  const lonely = connect(dead.address().port, '127.0.0.1')
  await once(lonely, 'connect')
  lonely.write(`GET ${AGENT_SOCKET_PATH} HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n`)
  const [reply] = await once(lonely, 'data')
  assert.match(reply.toString(), /^HTTP\/1\.1 502/)
  lonely.destroy()
})

test('status reports whether the backend is up, and with what', async () => {
  const up = createAgentStatus('http://backend.test:8771', async (url) => {
    assert.equal(String(url), 'http://backend.test:8771/api/config')
    return Response.json({ llmConfigured: true, llmModel: 'gemini-3.8-flash', ttsProvider: 'macos' })
  })
  assert.deepEqual(await up(), { url: 'http://backend.test:8771', reachable: true, model: 'gemini-3.8-flash', tts: 'macos' })
  const down = createAgentStatus('http://backend.test:8771', async () => { throw new TypeError('fetch failed') })
  assert.deepEqual(await down(), { url: 'http://backend.test:8771', reachable: false, model: null, tts: null })
})
