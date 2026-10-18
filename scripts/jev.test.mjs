import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import { createJevHandler, JEV_API_URL } from '../server/jev.ts'

const server = await createServer({ configFile: false, resolve: { alias: { '@': process.cwd() + '/src' } }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
after(() => server.close())
const { buildLineState, buildLineQuestions } = await server.ssrLoadModule('/src/agents/jev/lineDecision.ts')
const { baseline, KEYWORDS } = await server.ssrLoadModule('/src/agents/jev/baseline.ts')
const { askJev, JevError, isNoKey } = await server.ssrLoadModule('/src/agents/jev/client.ts')
const { decideLine, NO_KEY_NOTE } = await server.ssrLoadModule('/src/agents/jev/decideLine.ts')
const { hostMember, userMember } = await server.ssrLoadModule('/src/agents/catalog/personas.ts')
const catalog = await server.ssrLoadModule('/src/agents/catalog/performance.ts')
const { makePlan, resolvePose, lookVec, HOST, CAM } = await server.ssrLoadModule('/src/agents/performance/plan.ts')
const stage = await server.ssrLoadModule('/src/agents/performance/choreography.ts')
const { typingDuration, BEATS, DECIDE_WAIT } = await server.ssrLoadModule('/src/agents/performance/timing.ts')
const { RIG } = await server.ssrLoadModule('/src/lib/characterRig.js')

// Exported once from agent-studio's Python (jev.py + catalog.json); see the fixture's `source`.
const golden = JSON.parse(readFileSync(new URL('./fixtures/jev-golden.json', import.meta.url), 'utf8'))
const cast = golden.cast
const goldenCase = (name) => golden.cases.find((c) => c.name === name)
const expectedQuestions = (c) => Object.fromEntries(c.questionKeys.map((k) => [k, c.listenerQuestions[k] ?? golden.sharedQuestions[k]]))

// Deep equality where floats may differ by `eps`: both sides round the same way, exp() may not.
function assertClose(actual, expected, eps, path = '$') {
  if (typeof expected === 'number') {
    assert.equal(typeof actual, 'number', path)
    assert(Math.abs(actual - expected) <= eps + 1e-12, `${path}: ${actual} ≠ ${expected}`)
  } else if (Array.isArray(expected)) {
    assert(Array.isArray(actual) && actual.length === expected.length, path)
    expected.forEach((v, i) => assertClose(actual[i], v, eps, `${path}[${i}]`))
  } else if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual), Object.keys(expected), `${path} keys`)
    for (const k of Object.keys(expected)) assertClose(actual[k], expected[k], eps, `${path}.${k}`)
  } else assert.equal(actual, expected, path)
}

test('state, questions and keyword baseline match agent-studio jev.py for every golden line', async (t) => {
  for (const c of golden.cases) await t.test(c.name, () => {
    const { state, listeners } = buildLineState({ cast, ...c.input })
    assert.deepEqual(listeners, c.listeners)
    assert.deepEqual(state, c.state)
    const questions = buildLineQuestions(cast, c.input.speaker, listeners)
    assert.deepEqual(Object.keys(questions), c.questionKeys)
    assert.deepEqual(questions, expectedQuestions(c))
    const res = baseline(cast, c.input.speaker, c.input.text, c.input.quotes, questions, listeners)
    assert.equal(res.model, c.baseline.model)
    assertClose(res.answers, c.baseline.answers, 1e-4)
  })
})

test('baseline keyword rules are the Python patterns, \\d read as any Unicode digit', () => {
  const sources = Object.fromEntries(Object.entries(KEYWORDS).map(([k, re]) => [k, re.source.replace('\\p{Nd}', '\\d')]))
  assert.deepEqual(sources, golden.keywords)
  for (const re of Object.values(KEYWORDS)) assert.equal(re.flags, 'gu')
})

test('the catalog object carries catalog.json’s keys for the avatar generator', () => {
  const { PERFORMANCE_CATALOG: all } = catalog
  assert.deepEqual(Object.keys(all), ['expressions', 'gestures', 'acts', 'reactions', 'reactionCriteria', 'deliveries', 'stances'])
  assert.equal(all.expressions, catalog.EXPRESSIONS)
  assert.deepEqual([all.expressions.length, all.gestures.length, all.acts.length, all.reactions.length], [20, 17, 11, 15])
  assert(all.gestures.every((g) => g.poses.length >= 1 && g.desc && g.zh))
  assert.deepEqual(Object.keys(all.reactionCriteria).sort(), [...all.reactions].sort())
})

test('host and customer personas are agent-studio’s; the host is named Orb here', () => {
  assert.deepEqual(hostMember({ id: 'orb', name: '小选' }), cast.find((c) => c.id === 'orb'))
  assert.deepEqual(userMember({ id: 'me' }), cast.find((c) => c.id === 'me'))
  assert.deepEqual([hostMember().id, hostMember().name, userMember().id], ['host', 'Orb', 'user'])
  const c = goldenCase('主持人说话')
  const scene = buildLineState({ cast, ...c.input }, { hostName: 'Orb' }).state.scene
  assert.equal(scene, c.state.scene.replace('「小选」', '「Orb」'))
})

const failing = (error) => async () => { throw error }

test('decideLine asks Jev first and reports its answers as Jev', async () => {
  const c = goldenCase('引用回怼')
  const answers = { speaker_expr: { type: 'choice', choice: 'sly', confidence: 0.8, probabilities: { sly: 0.9 } } }
  let asked
  const controller = new AbortController()
  const decision = await decideLine({ cast, ...c.input, text: `  ${c.input.text} ` }, {
    signal: controller.signal,
    ask: async (state, questions, options) => { asked = { state, questions, options }; return { model: 'jev-1.13.0', answers } },
  })
  assert.equal(decision.source, 'jev')
  assert.equal(decision.model, 'jev-1.13.0')
  assert.equal(decision.note, undefined)
  assert.deepEqual(decision.answers, answers)
  assert.deepEqual(decision.request, { state: c.state, questions: expectedQuestions(c) })
  assert.deepEqual(asked.state, c.state)
  assert.equal(asked.options.signal, controller.signal)
  assert.equal(typeof decision.latencyMs, 'number')
})

test('without a key, or when Jev fails, decideLine falls back to the baseline and says it is not Jev', async () => {
  const c = goldenCase('感叹生气')
  const noKey = await decideLine({ cast, ...c.input }, { ask: failing(new JevError('no_key', 503, '未配置')) })
  assert.equal(noKey.source, 'baseline')
  assert.equal(noKey.note, NO_KEY_NOTE)
  assert.equal(noKey.note, '未配置 TYPESAFE_API_KEY，使用关键词基线（不是 Jev）。')
  assert.equal(noKey.model, 'baseline-keywords')
  assertClose(noKey.answers, c.baseline.answers, 1e-4)
  const busy = await decideLine({ cast, ...c.input }, { ask: failing(new JevError('busy', 429, 'Jev 现在有点忙，稍后再试。')) })
  assert.equal(busy.source, 'baseline')
  assert.equal(busy.note, 'Jev 调用失败，已回退到关键词基线：Jev 现在有点忙，稍后再试。')
  // engine 'jev' refuses to fake a decision, except when no key is configured (as /api/decide)
  await assert.rejects(decideLine({ cast, ...c.input }, { engine: 'jev', ask: failing(new JevError('upstream', 502, 'x')) }), JevError)
  assert.equal((await decideLine({ cast, ...c.input }, { engine: 'jev', ask: failing(new JevError('no_key', 503, 'x')) })).note, NO_KEY_NOTE)
  let calls = 0
  const plain = await decideLine({ cast, ...c.input }, { engine: 'baseline', ask: async () => { calls++; return { answers: {} } } })
  assert.equal(calls, 0)
  assert.equal(plain.source, 'baseline')
  assert.equal('note' in plain, false)
})

test('decideLine cleans its input like /api/decide and does not fall back once cancelled', async () => {
  const c = goldenCase('店主自荐无引用')
  const quotes = [{ who: 'hua', text: '   ' }, ...Array.from({ length: 7 }, (_, i) => ({ who: 'hua', text: `第${i}句` }))]
  let state
  await decideLine({ cast, ...c.input, quotes }, { ask: async (s) => { state = s; return { answers: {} } } })
  assert.deepEqual(state.quoted.map((q) => q.text), ['第0句', '第1句', '第2句', '第3句', '第4句', '第5句'])
  await assert.rejects(decideLine({ cast, ...c.input, text: '  ' }), /1–300/)
  await assert.rejects(decideLine({ cast, ...c.input, text: '好'.repeat(301) }), /1–300/)
  await assert.rejects(decideLine({ cast, ...c.input, speaker: 'nobody' }), /nobody/)
  const controller = new AbortController()
  const pending = decideLine({ cast, ...c.input }, {
    signal: controller.signal,
    ask: (_s, _q, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
  })
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  const named = await decideLine({ cast: [...cast.filter((m) => m.kind !== 'host'), hostMember()], ...c.input }, { engine: 'baseline' })
  assert.match(named.request.state.scene, /主持智能体「Orb」/)
})

function mockFetch(t, implementation) {
  const original = globalThis.fetch
  globalThis.fetch = implementation
  t.after(() => { globalThis.fetch = original })
}

test('askJev posts to the same-origin relay and tells a missing key apart from other failures', async (t) => {
  let sent
  mockFetch(t, async (url, options) => {
    sent = { url, options }
    return Response.json({ model: 'jev-1.13.0', answers: { bubble: { type: 'choice', choice: 'shout' } }, usage: { input_tokens: 9 } })
  })
  const res = await askJev({ line: { text: '好' } }, { bubble: { type: 'choice', instructions: '?', criteria: { shout: '!' } } })
  assert.equal(sent.url, '/api/jev')
  assert.equal(sent.options.method, 'POST')
  assert.deepEqual(JSON.parse(sent.options.body), { state: { line: { text: '好' } }, questions: { bubble: { type: 'choice', instructions: '?', criteria: { shout: '!' } } } })
  const { latencyMs, ...rest } = res
  assert(Number.isInteger(latencyMs) && latencyMs >= 0)
  assert.deepEqual(rest, { model: 'jev-1.13.0', answers: { bubble: { type: 'choice', choice: 'shout' } }, usage: { input_tokens: 9 } })
  const failures = [
    [Response.json({ error: '未配置 TYPESAFE_API_KEY，Jev 暂不可用。', code: 'no_key' }, { status: 503 }), 'no_key', 503],
    [Response.json({ error: 'Jev 现在有点忙，稍后再试。', code: 'busy' }, { status: 429 }), 'busy', 429],
    [new Response('Service Unavailable', { status: 503 }), 'http', 503],
    [Response.json({ answers: 'nope' }), 'bad_response', 200],
  ]
  for (const [response, code, status] of failures) {
    globalThis.fetch = async () => response
    await assert.rejects(askJev({}, {}), (error) => error instanceof JevError && error.code === code && error.status === status && isNoKey(error) === (code === 'no_key'))
  }
  globalThis.fetch = async () => { throw new TypeError('fetch failed') }
  await assert.rejects(askJev({}, {}), (error) => error instanceof JevError && error.code === 'network')
  const controller = new AbortController()
  controller.abort()
  globalThis.fetch = async (_url, options) => { throw options.signal.reason }
  await assert.rejects(askJev({}, {}, { signal: controller.signal }), { name: 'AbortError' })
})

// The real HTTP middleware against a fake upstream: no browser, no paid call.
async function request(handler, value, { method = 'POST', type = 'application/json', raw, onResponse } = {}) {
  const req = Readable.from([Buffer.from(raw ?? JSON.stringify(value))])
  Object.assign(req, { url: '/api/jev', method, headers: { 'content-type': type } })
  const res = new EventEmitter()
  Object.assign(res, { destroyed: false, writableEnded: false, writeHead(status) { this.status = status }, end(body) { this.body = body; this.writableEnded = true } })
  onResponse?.(res)
  await handler(req, res)
  return { status: res.status, body: res.body ? JSON.parse(res.body) : null }
}

const jevRequest = { state: { line: { text: '来我屋头嘛！' } }, model: 'page-picked-model', questions: { bubble: { type: 'choice', instructions: '气泡？', criteria: { normal: '普通' } } } }
const jevAnswer = { model: 'jev-1.13.0', answers: { bubble: { type: 'choice', choice: 'normal', confidence: 0.9 } }, usage: { input_tokens: 812 } }

test('relay adds the key, uses only its own model and returns Jev’s answers', async () => {
  const sent = []
  const handler = createJevHandler({ apiKey: 'test-private-token', model: '' }, async (url, options) => {
    sent.push({ url, headers: options.headers, body: JSON.parse(options.body) })
    return Response.json(jevAnswer)
  })
  const response = await request(handler, jevRequest)
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, jevAnswer)
  assert.equal(sent[0].url, JEV_API_URL)
  assert.equal(JEV_API_URL, 'https://api.typesafe.ai/v1/systemone')
  assert.equal(sent[0].headers.Authorization, 'Bearer test-private-token')
  assert.deepEqual(sent[0].body, { state: jevRequest.state, model: 'jev-latest', questions: jevRequest.questions })
  assert(!JSON.stringify(response.body).includes('test-private-token'))
  const pinned = createJevHandler({ apiKey: 'k', model: 'jev-1.13.0' }, async (_url, options) => { sent.push(JSON.parse(options.body)); return Response.json(jevAnswer) })
  await request(pinned, jevRequest)
  assert.equal(sent.at(-1).model, 'jev-1.13.0')
  let passed = false
  await createJevHandler({ apiKey: 'k' })(Object.assign(Readable.from([]), { url: '/api/intake', method: 'POST', headers: {} }), new EventEmitter(), () => { passed = true })
  assert(passed)
})

test('relay answers 503 no_key without a key and rejects malformed requests before calling Jev', async () => {
  let calls = 0
  const upstream = async () => { calls++; return Response.json(jevAnswer) }
  const noKey = await request(createJevHandler({ apiKey: '' }, upstream), jevRequest)
  assert.equal(noKey.status, 503)
  assert.equal(noKey.body.code, 'no_key')
  const handler = createJevHandler({ apiKey: 'test-private-token' }, upstream)
  const many = Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`q${i}`, { type: 'noul', instructions: '?' }]))
  const cases = [
    [{ method: 'GET' }, jevRequest, 405],
    [{ type: 'text/plain' }, jevRequest, 415],
    [{ raw: JSON.stringify({ ...jevRequest, padding: 'x'.repeat(64 * 1024) }) }, null, 413],
    [{ raw: '{"state":' }, null, 400],
    [{}, { questions: jevRequest.questions }, 400],
    [{}, { state: {}, questions: {} }, 400],
    [{}, { state: {}, questions: { a: { type: 'essay', instructions: '?' } } }, 400],
    [{}, { state: {}, questions: many }, 400],
  ]
  for (const [options, value, status] of cases) {
    const response = await request(handler, value, options)
    assert.equal(response.status, status, JSON.stringify(options).slice(0, 60))
    assert.equal(response.body.code, 'bad_request')
  }
  assert.equal(calls, 0)
})

test('relay backs off twice on 429/529, doubling the wait, then gives up as busy', async () => {
  const times = []
  const statuses = [429, 529, 200]
  const handler = createJevHandler({ apiKey: 'k', backoffMs: 20 }, async () => {
    times.push(performance.now())
    const status = statuses[times.length - 1]
    return status === 200 ? Response.json(jevAnswer) : new Response('slow down', { status })
  })
  assert.equal((await request(handler, jevRequest)).status, 200)
  assert.equal(times.length, 3)
  assert(times[1] - times[0] >= 15 && times[2] - times[1] >= 35, `waits ${times[1] - times[0]} / ${times[2] - times[1]}`)
  let calls = 0
  const busy = await request(createJevHandler({ apiKey: 'k', backoffMs: 1 }, async () => { calls++; return new Response('', { status: 529 }) }), jevRequest)
  assert.deepEqual([busy.status, busy.body.code, calls], [429, 'busy', 3])
})

test('relay never passes upstream errors or the key back to the page', async () => {
  let calls = 0
  const leaky = createJevHandler({ apiKey: 'test-private-token' }, async () => { calls++; return new Response('bad token test-private-token', { status: 401 }) })
  const failure = await request(leaky, jevRequest)
  assert.deepEqual([failure.status, failure.body.code, calls], [502, 'upstream', 1])
  assert(!JSON.stringify(failure.body).includes('private-token'))
  const malformed = await request(createJevHandler({ apiKey: 'k' }, async () => Response.json({ result: 'no answers' })), jevRequest)
  assert.deepEqual([malformed.status, malformed.body.code], [502, 'upstream'])
  const broken = await request(createJevHandler({ apiKey: 'k' }, async () => { throw new TypeError('getaddrinfo ENOTFOUND api.typesafe.ai') }), jevRequest)
  assert.deepEqual([broken.status, broken.body.code], [502, 'upstream'])
  assert(!JSON.stringify(broken.body).includes('ENOTFOUND'))
})

const hanging = (onStart) => (_url, options) => new Promise((_resolve, reject) => {
  options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
  onStart?.(options.signal)
})

test('relay times out a silent Jev and cancels when the browser leaves', async () => {
  const timeout = await request(createJevHandler({ apiKey: 'k', timeoutMs: 30 }, hanging()), jevRequest)
  assert.deepEqual([timeout.status, timeout.body.code], [504, 'timeout'])
  let upstreamSignal, response, started
  const ready = new Promise((resolve) => { started = resolve })
  const pending = request(createJevHandler({ apiKey: 'k' }, hanging((signal) => { upstreamSignal = signal; started() })), jevRequest, { onResponse: (value) => { response = value } })
  await ready
  response.destroyed = true
  response.emit('close')
  await pending
  assert.equal(upstreamSignal.aborted, true)
  assert.equal(response.writableEnded, false)
  // leaving during the back-off: no further attempt
  let calls = 0, left
  const leaving = new Promise((resolve) => { left = resolve })
  const backingOff = request(createJevHandler({ apiKey: 'k', backoffMs: 60000 }, async () => { calls++; left(); return new Response('', { status: 429 }) }), jevRequest, { onResponse: (value) => { response = value } })
  await leaving
  response.destroyed = true
  response.emit('close')
  await backingOff
  assert.equal(calls, 1)
  assert.equal(response.writableEnded, false)
})

// The film's floor: 1920 wide, owners at their stageX.
const FILM_X = { rong: 440, hua: 960, pierre: 1480 }
const filmLayout = { order: ['rong', 'hua', 'pierre'], x: (id) => FILM_X[id], center: 960 }
const one = (choice, confidence = 1) => ({ type: 'choice', choice, confidence, probabilities: { [choice]: confidence } })

test('a plan takes Jev’s choices, gates unsure ones to the persona default and aims at who is answered', () => {
  const answers = {
    speaker_expr: one('sly'), speaker_punch: one('smug'), speaker_gesture: one('wag'), speaker_act: one('lean', 0.11),
    speaker_gaze: one('quoted'), bubble: one('megaphone'), intensity: { type: 'score', score: 2.4 },
    listener_rong: one('shock'),
  }
  const plan = makePlan(cast, filmLayout, { speaker: 'hua', quotes: [{ who: 'rong', text: 'R1' }], answers })
  assert.deepEqual([plan.expr.id, plan.punch.id, plan.gesture.id, plan.gaze.id, plan.intensity], ['sly', 'smug', 'wag', 'quoted', 2.4])
  assert.deepEqual([plan.act.id, plan.act.gated, plan.act.top], ['lean', true, 'lean'])
  const gated = makePlan(cast, filmLayout, { speaker: 'hua', answers: { speaker_act: one('shake', 0.11) } })
  assert.deepEqual([gated.act.id, gated.act.gated, gated.act.top], ['lean', true, 'shake']) // hua's default act is lean
  assert.deepEqual([plan.bubble.id, plan.bubble.missing], ['normal', true]) // not a bubble style: ignored
  assert.deepEqual([plan.listeners.rong.id, plan.listeners.pierre.id, plan.listeners.pierre.missing], ['shock', 'haughty', true])
  assert.equal('hua' in plan.listeners, false)
  assert.equal(plan.target, 'rong')
  assert.deepEqual(resolvePose(filmLayout, 'wag', 'hua', 'rong'), ['wagL'])
  assert.deepEqual(resolvePose(filmLayout, 'wag', 'hua', 'pierre'), ['wagR'])
  assert.deepEqual(resolvePose(filmLayout, 'hip_one', 'pierre', CAM), ['hipL']) // open toward the middle
  assert.deepEqual(resolvePose(filmLayout, 'kiss', 'pierre', CAM), ['kissR', 'kissOut'])
  const none = makePlan(cast, filmLayout, { speaker: 'pierre', quotes: [{ who: 'rong', text: 'R2' }, { who: 'hua', text: 'H2' }] })
  assert.deepEqual([none.expr.id, none.gesture.id, none.stance.id, none.gaze.id, none.target, none.target2], ['proud', 'present', 'rebut', 'quoted', 'rong', 'hua'])
  const manual = makePlan(cast, filmLayout, { speaker: 'rong', answers, override: { expr: 'win', listener_hua: 'laugh' } })
  assert.deepEqual([manual.expr.id, manual.expr.manual, manual.listeners.hua.id], ['win', true, 'laugh'])
})

test('the host is looked up to, the customer speaks from the audience', () => {
  const toHost = makePlan(cast, filmLayout, { speaker: 'rong', quotes: [{ who: 'orb', text: 'O3' }], answers: { speaker_gaze: one('quoted') } })
  assert.equal(toHost.target, HOST)
  assert.deepEqual(lookVec(filmLayout, 'rong', HOST), [0.6, -1])
  assert.deepEqual(lookVec(filmLayout, 'pierre', 'rong'), [-1, 0.1])
  assert.deepEqual(lookVec(filmLayout, 'hua', CAM), [0, 0.15])
  assert.deepEqual(lookVec(filmLayout, 'hua', 'me'), [0, 0.15])
  assert.equal(makePlan(cast, filmLayout, { speaker: 'orb', quotes: [{ who: 'rong', text: 'R1' }] }).target, CAM)
  assert.equal(makePlan(cast, filmLayout, { speaker: 'me', quotes: [{ who: 'rong', text: 'R1' }] }).target, CAM)
  // the app's floor is centred on 0, which is also the default centre
  const app = { order: ['bashi', 'huaji'], x: (id) => ({ bashi: -0.58, huaji: 0.58 })[id] }
  assert.deepEqual(lookVec(app, 'bashi', HOST), [0.6, -1])
})

// Records every beat, as the rig's Actor would schedule it.
function recorder() {
  const calls = []
  const actor = {}
  for (const name of ['e', 'p', 'act', 'look']) actor[name] = (...args) => { calls.push([name, ...args]); return actor }
  return { actor, calls }
}

test('choreography: prepare on arrival, intent on decision, beats at fractions of the typed line', () => {
  const actors = { rong: recorder(), hua: recorder(), pierre: recorder() }
  const scene = { layout: filmLayout, cast, actors: Object.fromEntries(Object.entries(actors).map(([k, v]) => [k, v.actor])) }
  const turn = { speaker: 'hua', quotes: [{ who: 'rong', text: 'R1' }] }
  stage.prepare(scene, turn, 5)
  assert.deepEqual(actors.hua.calls, [['look', 5, -1, 0.1], ['act', 5, 'stepIn', 0.6, 0.35]])
  assert.deepEqual(actors.rong.calls, [['look', 5, 1, 0.1], ['e', 5, 'listen']])
  assert.deepEqual(actors.pierre.calls, [['look', 5 + 0.06, -1, 0.1], ['e', 5 + 0.08, 'listen']])
  const plan = makePlan(cast, filmLayout, { ...turn, answers: { speaker_expr: one('sly'), speaker_punch: one('smug'), speaker_gesture: one('wag'), speaker_act: one('lean'), speaker_gaze: one('quoted'), listener_rong: one('shock'), listener_pierre: one('laugh') } })
  for (const a of Object.values(actors)) a.calls.length = 0
  stage.intent(scene, turn, plan, 5.5)
  assert.deepEqual(actors.hua.calls, [['e', 5.5, 'sly'], ['p', 5.5, 'wagL', 0.3], ['look', 5.5, -1, 0.1]])
  for (const a of Object.values(actors)) a.calls.length = 0
  const est = 2
  stage.perform(scene, turn, plan, 6, est)
  assert.deepEqual(actors.hua.calls, [
    ['e', 6 - 0.05, 'sly'], ['p', 6 - 0.05, 'wagL', 0.3], ['act', 6, 'lean', est * 0.45, -0.6], ['look', 6, -1, 0.1], ['e', 6 + BEATS.punch * est, 'smug'],
  ])
  assert.deepEqual(actors.rong.calls, [['e', 6 + 0.22 * est, 'shock'], ['p', 6 + 0.22 * est, 'rest', 0.3], ['act', 6 + 0.22 * est, 'hop', 0.32, 1]])
  assert.deepEqual(actors.pierre.calls, [['e', 6 + 0.4 * est, 'laugh'], ['p', 6 + 0.4 * est, 'belly', 0.3], ['act', 6 + 0.4 * est, 'bounce', 1.2, 1]])
  // a decision that arrives mid-line lands from now on
  for (const a of Object.values(actors)) a.calls.length = 0
  stage.reactions(scene, turn, plan, 6, est, 7)
  assert.equal(actors.rong.calls[0][1], 7 + 0.1)
  assert.equal(actors.pierre.calls[0][1], 7 + 0.1)
  for (const a of Object.values(actors)) a.calls.length = 0
  stage.settle(scene, 9)
  assert.deepEqual(actors.pierre.calls, [['e', 9 + 2 * 0.15, 'idle'], ['p', 9 + 2 * 0.15, 'rest', 0.4], ['look', 9 + 2 * 0.15, 0, 0.15]])
  stage.interrupted(scene, 'hua', 10)
  assert.deepEqual(actors.hua.calls.slice(-4), [['e', 10, 'shock'], ['act', 10, 'hop', 0.3, 0.8], ['p', 10, 'rest', 0.25], ['e', 10 + 0.9, 'pout']])
})

test('choreography drives the real rig Actor, and a new line drops the old one’s future beats', () => {
  const actors = Object.fromEntries(['rong', 'hua', 'pierre'].map((id, seed) => [id, new RIG.Actor({}, { seed })]))
  const scene = { layout: filmLayout, cast, actors }
  const exprAt = (a, t) => a.expr.filter((row) => row[0] <= t).at(-1)[1]
  const turn = { speaker: 'pierre', quotes: [] }
  const plan = makePlan(cast, filmLayout, { ...turn, answers: { speaker_expr: one('proud'), speaker_punch: one('kiss'), listener_rong: one('eyeroll') } })
  stage.prepare(scene, turn, 1)
  stage.perform(scene, turn, plan, 1.2, 2)
  stage.settle(scene, 6)
  assert.equal(exprAt(actors.pierre, 2), 'proud')
  assert.equal(exprAt(actors.pierre, 1.2 + BEATS.punch * 2), 'kiss')
  assert.equal(exprAt(actors.rong, 2.1), 'eyeroll')
  assert.equal(exprAt(actors.hua, 6.2), 'idle')
  for (const a of Object.values(actors)) stage.cancelFuture(a, 2.3)
  assert.equal(exprAt(actors.pierre, 7), 'proud') // the punchline and the settle were dropped
  assert(Object.values(actors).every((a) => a.expr[0][0] === 0 && a.acts.every((row) => row[0] <= 2.3)))
  stage.cancelFuture(recorder().actor, 1) // an actor without a schedule is left alone
})

test('a line lasts as long as its typewriter, and the stage waits at most a second for Jev', () => {
  assert.equal(typingDuration('来我屋头嘛！正宗麻辣，人均才85块，包你巴适！'), 1.495) // 23 characters
  assert.equal(typingDuration('好'), 0.6)
  assert.equal(DECIDE_WAIT, 1)
  assert.deepEqual([BEATS.punch, BEATS.quoted, BEATS.bystander], [0.64, 0.22, 0.4])
})
