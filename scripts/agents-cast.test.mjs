import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'

const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
}
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
const { useCastStore, provideGenerationDeps } = await server.ssrLoadModule('/src/stores/cast.ts')
const byId = (id) => restaurants.find((r) => r.id === id)

// A Jev stand-in without a key: it records when each shop's generation first reached it.
function slowJev(order) {
  return async (state) => {
    if (!order.includes(state.shop.name)) order.push(state.shop.name)
    await new Promise((resolve) => setTimeout(resolve, 5))
    throw Object.assign(new Error('no key'), { status: 503 })
  }
}

function freshStore() {
  setActivePinia(createPinia())
  return useCastStore()
}

test('cards are generated in order, an invited restaurant jumps the queue, and at most two run at once', async () => {
  storage.clear()
  const order = []
  provideGenerationDeps({ catalog, ask: slowJev(order) })
  const cast = freshStore()
  cast.prefetch([byId('noodle'), byId('jiangnan'), byId('hotpot')])
  assert.equal(cast.statusOf(byId('hotpot')), 'queued')
  const contract = await cast.ensure(byId('sushi'))
  assert.equal(contract.restaurant, '鮨与四季')
  assert.equal(contract.decisions.look.note, '未配置 TYPESAFE_API_KEY，改用规则。')
  assert.deepEqual(order.slice(0, 3), ['一碗山野', '小满·江南食堂', '鮨与四季'])
  await Promise.all(['noodle', 'jiangnan', 'hotpot'].map((id) => cast.ensure(byId(id))))
  assert(cast.isReady([byId('noodle'), byId('jiangnan'), byId('hotpot'), byId('sushi')]))
  assert.deepEqual(cast.figureOf(byId('sushi')), { kind: 'kit', look: { ...contract.rig, logo: null } })
})

test('generated hosts survive a reload and are redone only when their shop facts change', async () => {
  storage.clear()
  provideGenerationDeps({ catalog })
  const first = freshStore()
  const contract = await first.ensure(byId('bashi'))
  const restored = freshStore()
  assert.equal(restored.statusOf(byId('bashi')), 'ready')
  assert.deepEqual(restored.contractOf(byId('bashi')), contract)
  const changed = { ...byId('bashi'), price: 99 }
  assert.equal(restored.statusOf(changed), 'idle')
  assert.equal(restored.figureOf(changed), null)
  const redone = await restored.ensure(changed)
  assert.equal(redone.plate, '川菜 · ¥99/人')
})

test('a failed generation is reported and retried on the next request', async () => {
  storage.clear()
  provideGenerationDeps(null)
  const cast = freshStore()
  await assert.rejects(cast.ensure(byId('coffee')), /dependencies/)
  assert.equal(cast.statusOf(byId('coffee')), 'error')
  provideGenerationDeps({ catalog })
  const contract = await cast.ensure(byId('coffee'))
  assert.equal(contract.name, '阿落')
  assert.equal(cast.statusOf(byId('coffee')), 'ready')
})
