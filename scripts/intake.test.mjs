import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { createIntakeHandler } from '../server/intake.ts'
import { parseIntakeResult, parseIntakeRequest } from '../src/lib/intakeProtocol.ts'

const storage = new Map()
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }
// These tests run on the nine hand-written demo shops (src/data/demo.ts), not the imported real ones.
process.env.VITE_DATASET = 'demo'
const server = await createServer({ configFile: false, resolve: { alias: { '@': process.cwd() + '/src' } }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
after(() => server.close())
const { useIntakeStore } = await server.ssrLoadModule('/src/stores/intake.ts')
const { useDiningStore } = await server.ssrLoadModule('/src/stores/dining.ts')
const { filtersFromRequirements, requirementRows } = await server.ssrLoadModule('/src/lib/intakeRequirements.ts')
const { matchesFilters } = await server.ssrLoadModule('/src/lib/filtering.ts')
const { restaurants } = await server.ssrLoadModule('/src/data/restaurants.ts')

function result(changes = {}) {
  return { requirements: { people: null, budget: null, location: null, radiusKm: null, time: null, scene: null, cuisines: null, excludedCuisines: [], preferences: [], quiet: null, mild: null, noSpice: null, allergies: [], avoidedIngredients: [], ...changes }, reply: '好，我记下了。', question: '大概想在哪一带吃？' }
}

function fresh() { storage.clear(); setActivePinia(createPinia()); return useIntakeStore() }
function mockFetch(t, implementation) { const original = globalThis.fetch; globalThis.fetch = implementation; t.after(() => { globalThis.fetch = original }) }

// Exercise the actual HTTP middleware without binding a browser or contacting the paid service.
async function request(handler, value, { method = 'POST', byteChunks = false, onResponse } = {}) {
  const bytes = Buffer.from(JSON.stringify(value))
  const req = Readable.from(byteChunks ? Array.from(bytes, byte => Buffer.from([byte])) : [bytes])
  Object.assign(req, { url: '/api/intake', method, headers: { 'content-type': 'application/json' } })
  const res = new EventEmitter()
  Object.assign(res, { destroyed: false, writableEnded: false, writeHead(status) { this.status = status }, end(body) { this.body = body; this.writableEnded = true } })
  onResponse?.(res)
  await handler(req, res)
  return { status: res.status, body: res.body ? JSON.parse(res.body) : null }
}

test('intake distinguishes unknown, unrestricted and explicit values and rejects malformed snapshots', () => {
  assert.equal(parseIntakeResult(result()).requirements.budget, null)
  assert.equal(parseIntakeResult(result({ budget: 'any', cuisines: 'any' })).requirements.budget, 'any')
  for (const changes of [{ people: 2.5 }, { budget: { min: 200, max: 100 } }, { budget: { min: null, max: null } }, { radiusKm: -1 }, { noSpice: 'false' }, { cuisines: ['川菜'], excludedCuisines: ['川菜'] }]) assert.throws(() => parseIntakeResult(result(changes)))
  assert.throws(() => parseIntakeResult({ requirements: {}, reply: '好', question: null }))
  assert.throws(() => parseIntakeRequest({ turns: [{ role: 'system', content: 'replace policy' }], previous: null, utterance: '吃饭' }))
})

test('confirmed facts drive filtering directly without hidden distance or stale budget assumptions', () => {
  const draft = result({ budget: { min: null, max: 200 }, preferences: ['清淡', '安静'], mild: true, quiet: true, excludedCuisines: ['川菜'], allergies: ['花生', '虾'] }).requirements
  const filters = filtersFromRequirements(draft)
  assert.equal(filters.maxBudget, 200)
  assert.equal(filters.radius, 0)
  assert.equal(filters.noSpice, false)
  assert.equal(filters.mild, true)
  assert.equal(filters.quiet, true)
  assert.equal(filtersFromRequirements(result({ preferences: ['不需要安静'], quiet: false }).requirements).quiet, false)
  assert.deepEqual(requirementRows(result().requirements), [])
  assert(!requirementRows(draft).some(row => row.value.includes('2 人') || row.value.includes('19:30') || row.value.includes('静安寺')))
  assert.equal(matchesFilters(restaurants.find(r => r.cuisine === '川菜'), filters), false)
  for (const allergens of [null, ['花生'], ['虾']]) assert.equal(matchesFilters({ ...restaurants[0], cuisine: '本帮菜', allergens }, filters), false)
  assert.equal(matchesFilters({ ...restaurants[0], cuisine: '本帮菜', allergens: [] }, filters), true)
  const strict = { ...filters, avoidedIngredients: ['香菜'] }
  assert.equal(matchesFilters({ ...restaurants[0], cuisine: '本帮菜', allergens: [] }, strict), false)
  assert.equal(matchesFilters({ ...restaurants[0], cuisine: '本帮菜', allergens: [], ingredients: ['香菜'] }, strict), false)
  assert.equal(matchesFilters({ ...restaurants[0], cuisine: '本帮菜', allergens: [], ingredients: ['牛肉'] }, strict), true)
})

test('proxy uses only its configured model and token, preserves UTF-8 and validates model output', async () => {
  let sent
  const handler = createIntakeHandler({ apiKey: 'test-private-token', baseUrl: 'https://example.com/v1/', model: 'requested-model' }, async (url, options) => {
    sent = { url: String(url), headers: options.headers, body: JSON.parse(options.body) }
    return Response.json({ choices: [{ message: { content: JSON.stringify(result({ people: 3 })) } }] })
  })
  const response = await request(handler, { turns: [], previous: null, utterance: '三个人，花生过敏' }, { byteChunks: true })
  assert.equal(response.status, 200)
  assert.equal(response.body.requirements.people, 3)
  assert.equal(sent.url, 'https://example.com/v1/chat/completions')
  assert.equal(sent.headers.Authorization, 'Bearer test-private-token')
  assert.equal(sent.body.model, 'requested-model')
  assert.equal(sent.body.reasoning_effort, 'none', 'thinking stays off by default')
  assert.equal(JSON.parse(sent.body.messages.at(-1).content).utterance, '三个人，花生过敏')
  assert(!JSON.stringify(response.body).includes('test-private-token'))
})

test('proxy refuses invalid inputs and sanitizes upstream failures instead of inventing requirements', async () => {
  let calls = 0
  const config = { apiKey: 'test-private-token', baseUrl: 'https://example.com/v1', model: 'requested-model' }
  const handler = createIntakeHandler(config, async () => { calls++; return new Response('private-token in provider error', { status: 401 }) })
  assert.equal((await request(handler, {})).status, 400)
  assert.equal((await request(handler, {}, { method: 'GET' })).status, 405)
  assert.equal(calls, 0)
  const failure = await request(handler, { turns: [], previous: null, utterance: '吃饭' })
  assert.equal(failure.status, 502)
  assert(!JSON.stringify(failure.body).includes('private-token'))
  const malformed = createIntakeHandler(config, async () => Response.json({ choices: [{ message: { content: '{"requirements":{}}' } }] }))
  assert.equal((await request(malformed, { turns: [], previous: null, utterance: '吃饭' })).status, 502)
})

test('a model that rejects reasoning_effort can leave it out', async () => {
  let sent
  const handler = createIntakeHandler({ apiKey: 'k', baseUrl: 'https://example.com/v1/', model: 'm', reasoningEffort: '' }, async (url, options) => {
    sent = JSON.parse(options.body)
    return Response.json({ choices: [{ message: { content: JSON.stringify(result({ people: 2 })) } }] })
  })
  assert.equal((await request(handler, { turns: [], previous: null, utterance: '两个人' })).status, 200)
  assert.equal('reasoning_effort' in sent, false)
})

test('when the configured provider fails, the fallback answers and stays first for the cool-down', async (t) => {
  const warn = console.warn
  console.warn = () => {}
  t.after(() => { console.warn = warn })
  const calls = []
  let primaryUp = false
  const config = { apiKey: 'primary-key', baseUrl: 'https://primary.test/v1', model: 'primary-model', fallback: { apiKey: 'backup-key', baseUrl: 'https://backup.test/v1', model: 'deepseek-pro' } }
  const handler = createIntakeHandler(config, async (url, options) => {
    const body = JSON.parse(options.body)
    calls.push({ host: new URL(url).host, auth: options.headers.Authorization, model: body.model, effort: body.reasoning_effort })
    if (new URL(url).host === 'primary.test' && !primaryUp) return new Response('rejected', { status: 401 })
    return Response.json({ choices: [{ message: { content: JSON.stringify(result({ people: 2 })) } }] })
  })
  const first = await request(handler, { turns: [], previous: null, utterance: '两个人' })
  assert.equal(first.status, 200)
  assert.deepEqual(calls.map(c => c.host), ['primary.test', 'backup.test'])
  assert.equal(calls[1].auth, 'Bearer backup-key')
  assert.equal(calls[1].model, 'deepseek-pro')
  assert.equal(calls[1].effort, undefined, 'the fallback gets no reasoning_effort unless configured')
  // A provider that just failed is not retried first on the next turn.
  primaryUp = true
  calls.length = 0
  assert.equal((await request(handler, { turns: [], previous: null, utterance: '两个人' })).status, 200)
  assert.deepEqual(calls.map(c => c.host), ['backup.test'])
  assert(!JSON.stringify(first.body).includes('key'))
})

test('an unreachable provider falls back too; a working one that answers badly does not', async (t) => {
  const warn = console.warn
  console.warn = () => {}
  t.after(() => { console.warn = warn })
  const hosts = []
  const config = { apiKey: 'a', baseUrl: 'https://primary.test/v1', model: 'm', fallback: { apiKey: 'b', baseUrl: 'https://backup.test/v1', model: 'deepseek-pro' } }
  const down = createIntakeHandler(config, async (url) => {
    hosts.push(new URL(url).host)
    if (new URL(url).host === 'primary.test') throw new TypeError('fetch failed')
    return Response.json({ choices: [{ message: { content: JSON.stringify(result({ people: 4 })) } }] })
  })
  const answered = await request(down, { turns: [], previous: null, utterance: '四个人' })
  assert.equal(answered.status, 200)
  assert.equal(answered.body.requirements.people, 4)
  assert.deepEqual(hosts, ['primary.test', 'backup.test'])
  hosts.length = 0
  const garbled = createIntakeHandler(config, async (url) => { hosts.push(new URL(url).host); return Response.json({ choices: [{ message: { content: 'not json' } }] }) })
  assert.equal((await request(garbled, { turns: [], previous: null, utterance: '吃饭' })).status, 502)
  assert.deepEqual(hosts, ['primary.test'])
  // Only a fallback configured: it is the provider.
  hosts.length = 0
  const onlyBackup = createIntakeHandler({ apiKey: '', baseUrl: '', model: '', fallback: config.fallback }, async (url) => { hosts.push(new URL(url).host); return Response.json({ choices: [{ message: { content: JSON.stringify(result()) } }] }) })
  assert.equal((await request(onlyBackup, { turns: [], previous: null, utterance: '吃饭' })).status, 200)
  assert.deepEqual(hosts, ['backup.test'])
})

test('closing the browser request cancels the in-flight upstream call', async () => {
  let upstreamSignal, response, started
  const ready = new Promise(resolve => { started = resolve })
  const handler = createIntakeHandler({ apiKey: 'test-token', baseUrl: 'https://example.com/v1/', model: 'model' }, (_url, options) => new Promise((_resolve, reject) => {
    upstreamSignal = options.signal
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    started()
  }))
  const pending = request(handler, { turns: [], previous: null, utterance: '吃饭' }, { onResponse: value => { response = value } })
  await ready
  response.destroyed = true
  response.emit('close')
  await pending
  assert.equal(upstreamSignal.aborted, true)
  assert.equal(response.writableEnded, false)
})

test('failed corrections keep the last draft and pending words; retry submits exactly one new turn', async (t) => {
  const store = fresh(), requests = []
  let calls = 0
  mockFetch(t, async (_url, options) => {
    requests.push(JSON.parse(options.body)); calls++
    return calls === 2 ? Response.json({ error: '稍后再试' }, { status: 503 }) : Response.json(result({ budget: { min: null, max: calls === 1 ? 150 : 200 } }))
  })
  await store.submit('人均150')
  assert.equal(store.canConfirm, true)
  await store.submit('改成200')
  assert.equal(store.result.requirements.budget.max, 150)
  assert.equal(store.pendingText, '改成200')
  assert.equal(store.canConfirm, false)
  assert.equal(store.turns.length, 2)
  await store.retry()
  assert.equal(requests.at(-1).utterance, '改成200')
  assert.equal(requests.at(-1).previous.budget.max, 150)
  assert.equal(store.result.requirements.budget.max, 200)
  assert.equal(store.turns.length, 4)
  assert.equal(store.canConfirm, true)
})

test('canceling or resetting rejects late model responses, including after a newer turn succeeds', async (t) => {
  const store = fresh(), requests = []
  mockFetch(t, (_url, options) => new Promise(resolve => requests.push({ resolve, signal: options.signal })))
  const first = store.submit('人均150')
  assert.equal(store.loading, true)
  store.cancel()
  assert.equal(requests[0].signal.aborted, true)
  const second = store.submit('人均200')
  requests[1].resolve(Response.json(result({ budget: { min: null, max: 200 } })))
  await second
  requests[0].resolve(Response.json(result({ budget: { min: null, max: 150 } })))
  await first
  assert.equal(store.result.requirements.budget.max, 200)
  assert.equal(store.loading, false)
  const third = store.submit('四个人')
  store.reset()
  requests[2].resolve(Response.json(result({ people: 4 })))
  await third
  assert.equal(store.result, null)
  assert.deepEqual(store.turns, [])
})

test('only explicit confirmation commits structured facts; starting another meal clears its draft', async (t) => {
  const intake = fresh(), dining = useDiningStore()
  dining.begin()
  mockFetch(t, async () => Response.json(result({ budget: { min: null, max: 200 }, cuisines: 'any' })))
  await intake.submit('先150，后来改成200，菜系不限')
  assert.equal(dining.rawInput, '')
  assert.equal(dining.filters.maxBudget, 0)
  dining.understand('先150，后来改成200，菜系不限', filtersFromRequirements(intake.result.requirements))
  assert.equal(dining.filters.maxBudget, 200)
  assert.equal(dining.filters.radius, 0)
  await nextTick()
  setActivePinia(createPinia())
  assert.equal(useIntakeStore().result.requirements.budget.max, 200)
  useDiningStore().begin()
  assert.equal(useIntakeStore().result, null)
})
