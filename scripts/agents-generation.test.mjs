import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import { createServer } from 'vite'

// These tests run on the nine hand-written demo shops (src/data/demo.ts), not the imported real ones.
process.env.VITE_DATASET = 'demo'
const server = await createServer({
  configFile: false,
  resolve: { alias: { '@': process.cwd() + '/src' } },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
})
after(() => server.close())

// Exported once from agent-studio's Python generator (keyword rules, no Jev) for the same inputs.
const golden = JSON.parse(readFileSync(new URL('./fixtures/generation-golden.json', import.meta.url), 'utf8'))
const { runGeneration } = await server.ssrLoadModule('/src/agents/generation/generateAgent.ts')
const { sha1Hex } = await server.ssrLoadModule('/src/agents/generation/sha1.ts')
const { matchBrand } = await server.ssrLoadModule('/src/agents/generation/brands.ts')
const { shopFromRestaurant, shopHash } = await server.ssrLoadModule('/src/agents/generation/shop.ts')
const { restaurants } = await server.ssrLoadModule('/src/data/restaurants.ts')

// Parity with the Python original holds with variety off; the app draws parts with variety on.
const generate = (shop, options = {}) => runGeneration(shop, { id: 'test', catalog: golden.catalog, variety: false, ...options })

test('SHA-1 seeds match the standard digest for ASCII, Chinese and multi-block text', () => {
  for (const text of ['', 'abc', '巴适川菜', 'Chez Pierre', '鮨与四季'.repeat(40)]) {
    assert.equal(sha1Hex(text), createHash('sha1').update(text, 'utf8').digest('hex'))
  }
})

test('without Jev every host equals the original Python generator, field by field', async () => {
  assert(golden.cases.length >= 11)
  for (const { id, shop, expected } of golden.cases) {
    const agent = await generate(shop, { id })
    for (const [field, value] of Object.entries(expected)) {
      if (field === 'decisions') continue
      assert.deepEqual(agent[field], value, `${id}.${field}`)
    }
    for (const step of ['look', 'accent', 'assets']) {
      assert.equal(agent.decisions[step].source, expected.decisions[step].source, `${id}.${step}.source`)
      assert.deepEqual(agent.decisions[step].answers, expected.decisions[step].answers, `${id}.${step}.answers`)
    }
    assert.equal(agent.voice, null)
  }
})

test('a known chain is played by its mascot, matched on its name or owner only', async () => {
  assert.equal(matchBrand({ name: '蜜雪冰城（静安寺店）', owner: '' })?.id, 'mixue')
  assert.equal(matchBrand({ name: '街角咖啡', owner: '' }), null)
  const agent = await generate(golden.cases.find((c) => c.id === 'mixue').shop, { id: 'mixue' })
  const events = []
  await runGeneration(golden.cases.find((c) => c.id === 'starbucks').shop, { id: 'starbucks', catalog: golden.catalog }, (event) => events.push(event))
  assert.equal(agent.rig.body, 'snowking')
  assert.equal(agent.decisions.look.source, 'brand')
  assert.deepEqual(events.map((event) => event.type === 'step' ? `${event.step}:${event.status}` : event.type),
    ['start', 'look:run', 'look:done', 'accent:run', 'accent:done', 'assets:run', 'assets:done', 'done'])
  assert.equal(events[0].brand.mascot, '塞壬')
})

test('Jev answers drive the look, and a failing Jev falls back to the rules with a note', async () => {
  const shop = golden.cases.find((c) => c.id === 'bashi').shop
  const asked = []
  const ask = async (state, questions) => {
    asked.push({ state, questions: Object.keys(questions) })
    if ('gender' in questions) {
      return { model: 'jev-test', latencyMs: 12, answers: {
        gender: { type: 'choice', choice: 'male', probabilities: { male: .8, female: .2 }, confidence: .6 },
        age: { type: 'choice', choice: 'old', probabilities: { old: 1 } }, build: { type: 'choice', choice: 'tall', probabilities: { tall: 1 } },
        hair_male: { type: 'choice', choice: 'bald', probabilities: { bald: 1 } }, outfit: { type: 'choice', choice: 'chef', probabilities: { chef: 1 } },
        hat: { type: 'choice', choice: 'toque', probabilities: { toque: 1 } }, personality: { type: 'choice', choice: 'pro', probabilities: { pro: 1 } },
        glasses: { type: 'noul', noul: .9 }, mustache: { type: 'noul', noul: .2 }, earrings: { type: 'noul', noul: .9 },
      } }
    }
    throw Object.assign(new Error('Jev HTTP 500'), { status: 500 })
  }
  const agent = await generate(shop, { id: 'bashi', ask })
  assert.deepEqual(asked.map((call) => call.questions[0]), ['gender', 'accent', 'expr'])
  assert.equal(asked[0].state.shop.name, '巴适川菜')
  assert.equal(asked[1].state.owner.age, '老年')
  assert.equal(agent.decisions.look.source, 'jev')
  assert.deepEqual([agent.rig.body, agent.rig.hair, agent.rig.outfit, agent.rig.hat, agent.rig.accessories], ['m_tall', 'bald', 'chef', 'toque', ['glasses']])
  assert.equal(agent.decisions.accent.source, 'rules')
  assert.match(agent.decisions.accent.note, /Jev 调用失败，改用规则/)
  assert.equal(agent.language, 'sc')
  const unavailable = await generate(shop, { id: 'bashi', ask: async () => { throw Object.assign(new Error('no key'), { status: 503 }) } })
  assert.equal(unavailable.decisions.look.note, '未配置 TYPESAFE_API_KEY，改用规则。')
})

test('demo restaurants become generator input without demo-only artefacts', () => {
  const bashi = shopFromRestaurant(restaurants.find((r) => r.id === 'bashi'))
  assert.equal(bashi.dishes, '回锅肉、鸳鸯锅')
  assert.equal(bashi.address, '')
  assert.deepEqual(bashi.colors, [{ hex: '#C9483E', share: 1 }])
  assert.notEqual(shopHash(bashi), shopHash({ ...bashi, price: 86 }))
})
