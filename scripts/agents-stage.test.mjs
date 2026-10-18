import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'

const storage = new Map(), session = new Map()
const fakeStorage = (map) => ({ getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key) })
globalThis.localStorage = fakeStorage(storage)
globalThis.sessionStorage = fakeStorage(session)
// These tests run on the nine hand-written demo shops (src/data/demo.ts), not the imported real ones.
process.env.VITE_DATASET = 'demo'
const server = await createServer({
  configFile: false,
  resolve: { alias: { '@': process.cwd() + '/src' } },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
})
after(() => server.close())

const { catalog } = JSON.parse(readFileSync(new URL('./fixtures/generation-golden.json', import.meta.url), 'utf8'))
const { restaurants } = await server.ssrLoadModule('/src/data/restaurants.ts')
const { runGeneration } = await server.ssrLoadModule('/src/agents/generation/generateAgent.ts')
const { shopFromRestaurant } = await server.ssrLoadModule('/src/agents/generation/shop.ts')
const { stageCast, stageLayout, guestMember } = await server.ssrLoadModule('/src/agents/stage/cast.ts')
const { decisionReport, agentReport } = await server.ssrLoadModule('/src/agents/stage/report.ts')
const { decideLine } = await server.ssrLoadModule('/src/agents/jev/decideLine.ts')
const { useDiningStore } = await server.ssrLoadModule('/src/stores/dining.ts')
const { makePlan } = await server.ssrLoadModule('/src/agents/performance/plan.ts')
const { parseAppMessage } = await server.ssrLoadModule('/src/agents/feed/protocol.ts')
const { useStageStore } = await server.ssrLoadModule('/src/stores/stage.ts')

const contracts = await Promise.all(['bashi', 'huaji', 'pierre'].map((id) => runGeneration(shopFromRestaurant(restaurants.find((r) => r.id === id)), { id, catalog })))
const choice = (value, confidence = .9) => ({ type: 'choice', choice: value, probabilities: { [value]: confidence }, confidence })

test('generated hosts join the host Orb and the customer as Jev cast members, seated as on stage', () => {
  const cast = stageCast(contracts)
  assert.deepEqual(cast.map((member) => `${member.id}:${member.kind}`), ['bashi:owner', 'huaji:owner', 'pierre:owner', 'host:host', 'user:user'])
  const rong = cast[0]
  assert.equal(rong.name, contracts[0].name)
  assert.equal(rong.persona, contracts[0].persona)
  assert.deepEqual(rong.defaults, contracts[0].defaults)
  assert.equal(cast.find((member) => member.kind === 'host').name, 'Orb')
  const layout = stageLayout(['bashi', 'huaji', 'pierre'], [-.92, 0, .92])
  assert.equal(layout.x('pierre'), .92)
  assert.equal(layout.x('host'), undefined)
})

test('the console sees each decision in Chinese, marks defaults, and a customer line has no face', () => {
  const cast = stageCast(contracts)
  const layout = stageLayout(['bashi', 'huaji', 'pierre'], [-.92, 0, .92])
  const answers = {
    speaker_expr: choice('sly'), speaker_punch: choice('smug'), speaker_gesture: choice('point'), speaker_act: choice('lean'),
    speaker_gaze: choice('quoted'), bubble: choice('normal'), stance: choice('mock'), intensity: { type: 'score', score: 2.2 },
    listener_bashi: choice('shock'), listener_pierre: choice('laugh', .05),
  }
  const plan = makePlan(cast, layout, { speaker: 'huaji', quotes: [{ who: 'bashi', text: '来我屋头坐坐嘛！' }], answers })
  const report = decisionReport('line-2', { source: 'jev', answers, request: { state: {}, questions: {} }, latencyMs: 420 }, plan, false)
  assert.deepEqual(parseAppMessage(report), report)
  assert.equal(report.speaker.expr.zh, '坏笑')
  assert.deepEqual([report.speaker.gaze.zh, report.speaker.intensity.zh], ['看向被回应的人', '鲜明'])
  assert.deepEqual(report.listeners.bashi, { reaction: { id: 'shock', zh: '震惊' }, confidence: .9 })
  assert.equal(report.listeners.pierre.reaction.gated, true)
  assert.equal(report.latencyMs, 420)
  const customer = decisionReport('user-1', { source: 'baseline', note: '未配置', answers: {}, request: { state: {}, questions: {} } }, makePlan(cast, layout, { speaker: 'user' }), true)
  assert.deepEqual(Object.keys(customer.speaker).sort(), ['bubble', 'intensity', 'stance'])
  assert.equal(customer.source, 'baseline')
})

// A stand-in for the relay feed: the test delivers console messages, opens the link and reads what the app sent back.
function fakeFeed() {
  const listeners = [], statuses = [], sent = []
  const feed = {
    role: 'app', status: 'open', peers: null, lastEventId: undefined, sent,
    onMessage: (listener) => { listeners.push(listener); return () => {} },
    onStatus: (listener) => { statuses.push(listener); return () => {} },
    send: async (message) => { sent.push(message); return 'x' },
    close: () => {},
    deliver: (message, id) => listeners.forEach((listener) => listener(message, { id, at: Date.now(), from: 'console' })),
    open: () => statuses.forEach((listener) => listener('open', { app: 1, console: 1 })),
  }
  return feed
}

test('lines queue in order, replays and performed lines are skipped, and a clear drops what is waiting', () => {
  session.clear()
  setActivePinia(createPinia())
  const stage = useStageStore()
  const feed = fakeFeed()
  let resumedFrom = 'none'
  stage.connect((lastEventId) => { resumedFrom = lastEventId; return feed })
  assert.equal(resumedFrom, undefined)
  stage.markPerformed(['old'])
  const line = (id, text) => ({ kind: 'line', id, speaker: 'bashi', text })
  feed.deliver(line('old', '上次说过了'), 'e-1')
  feed.deliver(line('a', '第一句'), 'e-2')
  feed.deliver(line('a', '重放的第一句'), 'e-3')
  feed.deliver(line('b', '第二句'), 'e-4')
  assert.deepEqual(stage.queue.map((item) => item.id), ['a', 'b'])
  assert.deepEqual(feed.sent.filter((m) => m.kind === 'line-state').map((m) => `${m.id}:${m.phase}`), ['a:queued', 'b:queued'])
  assert.equal(stage.next().id, 'a')
  stage.finish('a')
  assert.equal(session.get('stage-feed-app'), 'e-2')
  feed.deliver({ kind: 'clear' }, 'e-5')
  assert.deepEqual(stage.queue, [])
  assert.equal(stage.clears, 1)
  assert.deepEqual(feed.sent.filter((m) => m.kind === 'line-state').at(-1), { kind: 'line-state', id: 'b', phase: 'dropped', note: '舞台已清空' })
  assert.equal(session.get('stage-feed-app'), 'e-5')
  stage.snapshot('debate', [])
  stage.snapshot('debate', [])
  assert.equal(feed.sent.filter((m) => m.kind === 'snapshot').length, 1)
})

test('another phone’s mirrored line is left to that phone: never queued, never said twice', () => {
  session.clear()
  setActivePinia(createPinia())
  const stage = useStageStore()
  const feed = fakeFeed()
  stage.connect(() => feed)
  feed.deliver({ kind: 'line', id: 't-1', speaker: 'bashi', text: '另一台手机的后端台词', mirror: true }, 'e-1')
  feed.deliver({ kind: 'line', id: 'c-1', speaker: 'bashi', text: '导演台的台词' }, 'e-2')
  assert.deepEqual(stage.queue.map((cue) => cue.id), ['c-1'])
  assert.equal(feed.sent.some((m) => m.kind === 'line-state' && m.id === 't-1'), false)
  assert.equal(session.get('stage-feed-app'), 'e-1') // nothing left to replay before it
})

const guest = {
  name: '雪王', restaurant: '蜜雪冰城', plate: '冰淇淋与茶饮', cuisine: '冰淇淋与茶饮', persona: '蜜雪冰城的吉祥物雪王，社牛，爱唱甜蜜蜜。',
  keywords: ['雪王', '蜜雪冰城'], defaults: { expr: 'pitch', gesture: 'present', act: 'stepIn', reaction: 'eyeroll' }, color: '#ED4754',
  look: { body: 'snowking', brand: 'mixue', gender: 'male', theme: '#E60012', badgeText: '蜜', accessories: [] }, greeting: '你爱我，我爱你，蜜雪冰城甜蜜蜜！',
}

test('cut-in lines go first, withdrawn ones leave, stage directions queue, and a reload resumes after what is really over', () => {
  session.clear()
  setActivePinia(createPinia())
  const stage = useStageStore()
  const feed = fakeFeed()
  stage.connect(() => feed)
  const line = (id, extra = {}) => ({ kind: 'line', id, speaker: 'bashi', text: `台词 ${id}`, ...extra })
  feed.deliver(line('a'), 'e-1')
  feed.deliver(line('b'), 'e-2')
  feed.deliver(line('c', { interrupt: true }), 'e-3')
  feed.deliver({ kind: 'cast', id: 's1', act: 'enter', who: 'af3c0bf', guest }, 'e-4')
  assert.deepEqual(stage.queue.map((cue) => cue.id), ['c', 'a', 'b', 's1'])
  assert.equal(stage.cuts, 1)
  feed.deliver({ kind: 'drop', id: 'b' }, 'e-5')
  assert.deepEqual(stage.queue.map((cue) => cue.id), ['c', 'a', 's1'])
  assert.deepEqual(feed.sent.filter((m) => m.kind === 'line-state').at(-1), { kind: 'line-state', id: 'b', phase: 'dropped', note: '导演台撤回' })
  // The cut-in line ends first; the resume point must not pass the earlier line still waiting.
  assert.equal(stage.next().id, 'c')
  stage.finish('c')
  assert.equal(session.get('stage-feed-app'), undefined)
  assert.equal(stage.next().id, 'a')
  feed.deliver({ kind: 'drop', id: 'a' }, 'e-6')
  assert.equal(stage.dropped.id, 'a')
  stage.finish('a')
  assert.equal(session.get('stage-feed-app'), 'e-3')
  const cue = stage.next()
  assert.equal(stage.applyCue(cue, ['bashi', 'huaji']).applied, true)
  stage.finish(cue.id)
  assert.equal(session.get('stage-feed-app'), 'e-4')
  assert.deepEqual(JSON.parse(session.get('stage-lineup-v1')).guests.map((g) => [g.id, g.onStage]), [['af3c0bf', true]])
  assert.deepEqual(stage.lineup.guests[0].look, guest.look)
})

test('each generated host is published once per version and again whenever the link opens', () => {
  setActivePinia(createPinia())
  const stage = useStageStore()
  const feed = fakeFeed()
  stage.connect(() => feed)
  const report = agentReport(contracts[0])
  stage.publishAgent(report)
  stage.publishAgent(agentReport(contracts[0]))
  assert.equal(feed.sent.filter((m) => m.kind === 'agent').length, 1)
  stage.publishAgent(agentReport({ ...contracts[0], greeting: '换了一句开场白' }))
  assert.equal(feed.sent.filter((m) => m.kind === 'agent').length, 2)
  feed.open()
  assert.equal(feed.sent.filter((m) => m.kind === 'agent').length, 3)
})

test('generated hosts reach the console whole and within the size limit', () => {
  for (const contract of contracts) {
    const message = agentReport(contract)
    const wire = JSON.parse(JSON.stringify(message))
    assert.deepEqual(parseAppMessage(wire), wire)
    assert.ok(new TextEncoder().encode(JSON.stringify(message)).length < 60 * 1024)
    assert.equal(message.contract.rig.body, contract.rig.body)
    assert.deepEqual(Object.keys(message.contract.decisions), ['look', 'accent', 'assets'])
  }
})

test('guests act as hosts for Jev, and six on stage still fit one decision report with Jev’s detail', async () => {
  const guests = ['g1', 'g2', 'g3'].map((id) => ({ ...guest, id, name: `雪王${id}` }))
  const odd = guestMember('g9', { ...guest, defaults: { expr: 'moonwalk', gesture: 'present', act: 'fly', reaction: 'eyeroll' } })
  assert.deepEqual(odd.defaults, { expr: 'pitch', gesture: 'present', act: 'none', reaction: 'eyeroll' })
  const cast = stageCast(contracts, guests)
  assert.deepEqual(cast.map((member) => member.kind).join(','), 'owner,owner,owner,owner,owner,owner,host,user')
  const order = ['bashi', 'huaji', 'pierre', 'g1', 'g2', 'g3']
  const layout = stageLayout(order, [-1.1, -.66, -.22, .22, .66, 1.1])
  const ask = async (state, questions) => ({ model: 'jev-test', answers: Object.fromEntries(Object.entries(questions).map(([key, q]) => {
    if (q.type === 'score') return [key, { type: 'score', score: 2.13456, confidence: .8, probabilities: { 0: .1, 1: .2, 2: .4, 3: .3 }, legend: { 0: '平静', 1: '温和', 2: '鲜明', 3: '爆发' } }]
    const ids = Object.keys(q.criteria)
    return [key, { type: 'choice', choice: ids[1], confidence: .4, probabilities: Object.fromEntries(ids.map((id, i) => [id, i === 1 ? .4 : .6 / (ids.length - 1)])) }]
  })) })
  const quotes = [{ who: 'huaji', text: '饮茶先啦！' }]
  const decision = await decideLine({ cast, speaker: 'bashi', text: '来我屋头坐坐嘛，雪王也来尝尝！', quotes, stage: order }, { ask })
  assert.equal(Object.keys(decision.request.questions).filter((key) => key.startsWith('listener_')).length, 5)
  const plan = makePlan(cast, layout, { speaker: 'bashi', quotes, answers: decision.answers, override: { gesture: 'point' } })
  const report = JSON.parse(JSON.stringify(decisionReport('line-6', decision, plan, false)))
  assert.deepEqual(parseAppMessage(report), report)
  assert.ok(new TextEncoder().encode(JSON.stringify(report)).length < 12 * 1024, 'detail stays small')
  assert.equal(report.detail.plan.gesture.manual, true)
  assert.equal(report.detail.plan.listener_g2.id, plan.listeners.g2.id)
  assert.equal(report.detail.answers.intensity.score, 2.135)
  assert.ok(report.speaker.delivery.zh)
  assert.deepEqual(report.detail.questions, Object.keys(decision.request.questions))
})

test('a replayed or edited line keeps its place and id in the history', () => {
  setActivePinia(createPinia())
  const dining = useDiningStore()
  dining.recordLine({ id: 'l1', restaurantId: 'bashi', speakerId: 'bashi', speaker: '蓉姐', text: '原来的话', round: 1, topic: '', evidenceIds: [], time: '2026-10-17T12:00:00.000Z' })
  dining.recordLine({ id: 'l2', restaurantId: '', speakerId: 'af3c0bf', speaker: '雪王', text: '甜蜜蜜', round: 0, topic: '', evidenceIds: [], time: '2026-10-17T12:00:01.000Z', guest: true })
  assert.equal(dining.replaceLine('l1', { text: '改过的话', topic: '开场白', evidenceIds: ['bashi-info'], time: '2026-10-17T12:00:02.000Z' }), true)
  assert.deepEqual(dining.history.map((entry) => [entry.id, entry.text, entry.round]), [['l1', '改过的话', 1], ['l2', '甜蜜蜜', 0]])
  assert.equal(dining.replaceLine('missing', { text: 'x', topic: '', evidenceIds: [], time: '' }), false)
})
