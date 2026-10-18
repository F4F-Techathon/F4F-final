import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'
import { createRenderer, h, ref } from 'vue'

// The host Orb's filler lines while the multi-agent backend writes its first answer (src/composables/useAgentBackend.ts).

const storage = new Map()
globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }
process.env.VITE_DATASET = 'demo'
const server = await createServer({
  configFile: false,
  resolve: { alias: { '@': process.cwd() + '/src' } },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
})
after(() => server.close())

const { createInterludes, INTERLUDES, useAgentBackend } = await server.ssrLoadModule('/src/composables/useAgentBackend.ts')
const { useStageStore } = await server.ssrLoadModule('/src/stores/stage.ts')
const { restaurants } = await server.ssrLoadModule('/src/data/restaurants.ts')

// The real stage store, with every cue's progress and every line copied to the relay.
function freshStage(t) {
  setActivePinia(createPinia())
  const mirrored = [], states = []
  t.mock.method(globalThis, 'fetch', async (url, init) => { mirrored.push(JSON.parse(init.body).message); return new Response('{}') })
  const stage = useStageStore()
  stage.onLineState((id, phase, note) => states.push([id, phase, note]))
  return { stage, mirrored, states }
}
const queued = (stage) => stage.queue.map((cue) => cue.id)

test('the host says one filler line at a time, in turn, and a waiting one gives way', (t) => {
  const { stage, mirrored, states } = freshStage(t)
  const interludes = createInterludes(stage)
  const opening = interludes.say('opening')
  assert.deepEqual(stage.queue, [opening])
  assert.equal(opening.speaker, 'host')
  assert.equal(opening.text, INTERLUDES.opening[0])
  assert.deepEqual(mirrored, [{ ...opening, mirror: true }], 'consoles see it too, marked so other phones leave it alone')

  // The backend's answer arrives before the filler began: the filler is withdrawn.
  interludes.withdraw('后端的回应先到了')
  assert.deepEqual(stage.queue, [])
  assert.deepEqual(states.at(-1), [opening.id, 'dropped', '后端的回应先到了'])

  // Two interjections in a row leave only the newer filler waiting; the lines rotate.
  const first = interludes.say('reply'), second = interludes.say('reply')
  assert.deepEqual(queued(stage), [second.id])
  assert.deepEqual([first.text, second.text], INTERLUDES.reply.slice(0, 2))
  assert.notEqual(first.id, second.id)
  for (let index = 2; index <= INTERLUDES.reply.length; index++) interludes.say('reply')
  assert.equal(stage.queue[0].text, INTERLUDES.reply[0], 'back to the first after the last')
})

test('a filler already on stage plays to its end', (t) => {
  const { stage, states } = freshStage(t)
  const interludes = createInterludes(stage)
  const line = interludes.say('reply')
  assert.equal(stage.next().id, line.id) // the playback took it: it is being performed
  interludes.withdraw('后端的回应先到了')
  assert.equal(stage.dropped, null, 'the line in progress is not stopped')
  assert(!states.some(([id, phase]) => id === line.id && phase === 'dropped'))
})

// A WebSocket stand-in for the backend: what the page sends, and a way to deliver its events.
function fakeSockets() {
  const sockets = []
  class FakeSocket {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this) }
    send(data) { this.sent.push(data) }
    close() { this.readyState = 3; this.onclose?.({}) }
    open() { this.readyState = 1; this.onopen?.({}) }
    event(type, data = {}, epoch = 0) { this.onmessage({ data: JSON.stringify({ sessionId: 's-1', seq: 1, epoch, type, data }) }) }
    commands() { return this.sent.filter((item) => typeof item === 'string').map((item) => JSON.parse(item)) }
  }
  return { sockets, FakeSocket }
}

function mountAgent(t) {
  const { stage, mirrored, states } = freshStage(t)
  const { sockets, FakeSocket } = fakeSockets()
  const saved = { WebSocket: globalThis.WebSocket, location: globalThis.location }
  globalThis.WebSocket = FakeSocket
  globalThis.location = { protocol: 'http:', host: 'test' }
  const hosts = restaurants.slice(0, 2)
  const renderer = createRenderer({
    createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    insert() {}, remove() {}, setElementText() {}, setText() {}, setComment() {}, patchProp() {},
    parentNode: () => null, nextSibling: () => null,
  })
  let agent
  // As the debate page does: the customer's words go on stage, then to the bridge.
  const app = renderer.createApp({ setup() {
    agent = useAgentBackend({ hosts: () => hosts, audio: ref(false), ready: () => true, interject: (text) => agent.userSaid(text), autoVoice: false })
    return () => h('div')
  } })
  app.mount({})
  t.after(() => {
    app.unmount()
    for (const [key, value] of Object.entries(saved)) if (value === undefined) delete globalThis[key]; else globalThis[key] = value
  })
  assert.equal(sockets.length, 1)
  const socket = sockets[0]
  socket.open()
  socket.event('state', { status: 'ready' })
  return { agent, socket, stage, mirrored, states, hosts }
}

const ready = (turnId, speakerId, text) => ({ turnId, speakerId, speaker: '店主', text, evidence: [], audioEnabled: false })
const sentText = (socket) => JSON.stringify(socket.commands())

test('the host opens the debate while the backend writes its first line, and steps aside for it', (t) => {
  const { socket, stage, mirrored, states, hosts } = mountAgent(t)
  assert.deepEqual(stage.queue, [])
  socket.event('restaurants.updated', { restaurants: hosts.map((host) => ({ id: host.id, name: host.name })) })
  assert.deepEqual(stage.queue.map((cue) => [cue.speaker, cue.text]), [['host', INTERLUDES.opening[0]]])
  assert(mirrored.some((line) => line.text === INTERLUDES.opening[0]))
  assert(!sentText(socket).includes(INTERLUDES.opening[0]), 'the backend never hears of it')
  const opening = stage.queue[0].id

  socket.event('speech.ready', ready('t-1', hosts[0].id, '我家人均二十三。'))
  assert.deepEqual(queued(stage), ['t-1'])
  assert.deepEqual(states.find(([id, phase]) => id === opening && phase === 'dropped'), [opening, 'dropped', '后端的回应先到了'])
})

test('after the customer speaks the host fills the wait, typed or heard by the backend', (t) => {
  const { agent, socket, stage, hosts } = mountAgent(t)
  socket.event('restaurants.updated', { restaurants: hosts.map((host) => ({ id: host.id, name: host.name })) })
  socket.event('speech.ready', ready('t-1', hosts[0].id, '我家人均二十三。'))
  stage.next() // the backend's first line is on stage

  // The browser's recognition: the words go to the backend, the filler stays here.
  agent.userSaid('我不吃辣')
  assert.deepEqual(stage.queue.map((cue) => [cue.speaker, cue.text]), [['host', INTERLUDES.reply[0]]])
  const typed = socket.commands().filter((command) => command.type === 'user.text').map((command) => command.data.text)
  assert.deepEqual(typed, ['我不吃辣'])
  assert(!sentText(socket).includes(INTERLUDES.reply[0]))

  // The filler is already being performed when the answer arrives: it plays on, the answer waits behind it.
  const filler = stage.next()
  socket.event('speech.ready', ready('t-2', hosts[1].id, '不辣的话来我家。'))
  assert.equal(stage.dropped, null)
  assert.deepEqual(queued(stage), ['t-2'])
  stage.next()

  // The backend's own recognition: it is answering already, nothing is sent back, the host still fills the wait.
  socket.event('transcript', { text: '人均五十以内' })
  assert.deepEqual(stage.queue.map((cue) => cue.text), [INTERLUDES.reply[1]])
  assert.equal(socket.commands().filter((command) => command.type === 'user.text').length, 1)
  assert.notEqual(stage.queue[0].id, filler.id)
})

test('no filler before the debate has begun, and none left behind when the session ends', (t) => {
  const { agent, socket, stage, hosts } = mountAgent(t)
  agent.userSaid('先说一句') // the agents are still being built: the opening filler will come with them
  assert.deepEqual(stage.queue, [])
  socket.event('restaurants.updated', { restaurants: hosts.map((host) => ({ id: host.id, name: host.name })) })
  assert.equal(stage.queue.length, 1)
  agent.close()
  assert.deepEqual(stage.queue, [], 'no answer is coming any more')
})

// A debate the customer comes back to (from a shop's page, or a reload): its lines are in the saved dining state.
function comeBackTo(t, history) {
  storage.set('tonight-dining-v1', JSON.stringify({ rawInput: '', filters: {}, selectedIds: [], history }))
  t.after(() => storage.delete('tonight-dining-v1'))
  const mounted = mountAgent(t)
  const start = mounted.socket.commands().find((command) => command.type === 'session.start')
  mounted.socket.event('restaurants.updated', { restaurants: mounted.hosts.map((host) => ({ id: host.id, name: host.name })) })
  return { ...mounted, start }
}
const said = (id, restaurantId, text, extra = {}) => ({ id, restaurantId, speakerId: restaurantId || 'host', speaker: '', text, round: 0, topic: '', evidenceIds: [], time: '', ...extra })

test('a debate the customer comes back to goes on: its lines go back to the backend and the host does not open again', (t) => {
  const [a, b] = restaurants.slice(0, 2)
  const { start, stage } = comeBackTo(t, [said('agent-interlude-opening-x-0', '', INTERLUDES.opening[0]),
    said('t-1', a.id, '我先来。', { evidenceIds: ['shop:a:avg_price'] }), said('t-2', b.id, '我接一句。')])
  assert.deepEqual(start.data.history, [
    { turnId: 't-1', restaurantId: a.id, text: '我先来。', evidenceIds: ['shop:a:avg_price'] },
    { turnId: 't-2', restaurantId: b.id, text: '我接一句。', evidenceIds: [] },
  ])
  assert.deepEqual(stage.queue, [], 'no opening line: the debate is already under way')
})

test('coming back to a question nobody has answered yet, the host says its reply line', (t) => {
  const [a] = restaurants
  const { start, stage } = comeBackTo(t, [said('t-1', a.id, '我先来。'), said('user-1', '', '有不辣的吗？', { speakerId: 'user', user: true })])
  assert.deepEqual(start.data.history.at(-1), { turnId: 'user-1', role: 'user', text: '有不辣的吗？' })
  assert.deepEqual(stage.queue.map((cue) => [cue.speaker, cue.text]), [['host', INTERLUDES.reply[0]]])
})
