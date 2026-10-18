import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

// The app on the imported Dianping shops (the default dataset).
delete process.env.VITE_DATASET
const server = await createServer({
  configFile: false,
  resolve: { alias: { '@': process.cwd() + '/src' } },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
})
after(() => server.close())

const { DATASET, restaurants, getEvidence, defaultFilters } = await server.ssrLoadModule('/src/data/restaurants.ts')
const { matchesFilters, sameCuisine, distanceKm } = await server.ssrLoadModule('/src/lib/filtering.ts')
const { shopFromRestaurant } = await server.ssrLoadModule('/src/agents/generation/shop.ts')
const { runGeneration } = await server.ssrLoadModule('/src/agents/generation/generateAgent.ts')
const { PERFORMANCE_CATALOG } = await server.ssrLoadModule('/src/agents/catalog/performance.ts')
const ID = /^[A-Za-z0-9_.:-]{1,80}$/

test('the app runs on the 66 imported shops, every one placeable on AMap and speakable on stage', () => {
  assert.equal(DATASET, 'dianping')
  assert.equal(restaurants.length, 66)
  assert.equal(new Set(restaurants.map((r) => r.id)).size, 66)
  for (const r of restaurants) {
    assert.match(r.id, ID, r.name)
    const [lng, lat] = r.coordinates
    assert.ok(lng > 121 && lng < 122 && lat > 30.9 && lat < 31.5, `${r.name} sits in Shanghai`)
    assert.ok(r.cover.src && r.cover.alt)
    assert.ok(r.listing && r.listing.source === '大众点评')
  }
  const photos = restaurants.filter((r) => r.cover.remote)
  assert.ok(photos.length >= 60, `${photos.length} shops show a real photo`)
  for (const r of photos) assert.match(r.cover.src, /^https:\/\/([a-z0-9-]+\.)*(dpfile\.com|meituan\.net)\//)
})

test('each shop cites its facts, what diners say and what to check, in the order the pages read them', () => {
  for (const r of restaurants) {
    const items = getEvidence(r.evidenceIds)
    assert.equal(items.length, r.evidenceIds.length, `${r.name} cites only what exists`)
    assert.equal(items[0].title, '商家资料')
    assert.equal(items[2].title, '用餐前需要确认')
    assert.equal(items[2].text, r.caveat)
    assert.ok(items.every((item) => item.mock === false && item.restaurantId === r.id))
    assert.ok(r.evidenceIds.length <= 12, 'a line may cite every source of its shop')
  }
  const reviews = restaurants.flatMap((r) => getEvidence(r.evidenceIds)).filter((item) => item.kind === 'review')
  assert.ok(reviews.length > 100)
  assert.ok(reviews.every((item) => /\*\*$/.test(item.title)), 'reviewers stay anonymous')
})

test('a search from the default spot finds every shop; requests match the listing\'s own cuisine names', () => {
  const filters = defaultFilters()
  assert.equal(filters.locationName, '上海 · 张江')
  assert.equal(restaurants.filter((r) => matchesFilters(r, filters)).length, 66)
  assert.ok(restaurants.every((r) => distanceKm(filters.center, r.coordinates) < 3))
  for (const [wanted, cuisine] of [['川菜', '川菜馆'], ['日料', '日本料理'], ['快餐', '西式快餐'], ['面馆', '日式面条'], ['火锅', '老北京火锅'], ['浙菜', '浙菜']]) assert.equal(sameCuisine(wanted, cuisine), true, `${wanted} ~ ${cuisine}`)
  for (const [wanted, cuisine] of [['西餐', '西式快餐'], ['川菜', '浙菜'], ['日料', '韩式料理']]) assert.equal(sameCuisine(wanted, cuisine), false, `${wanted} ≁ ${cuisine}`)
  const sichuan = restaurants.filter((r) => matchesFilters(r, { ...filters, cuisines: ['川菜'] }))
  assert.ok(sichuan.length >= 1 && sichuan.every((r) => sameCuisine('川菜', r.cuisine)))
  const mild = restaurants.filter((r) => matchesFilters(r, { ...filters, noSpice: true }))
  assert.ok(mild.length >= 20 && mild.every((r) => r.spice === 0), `${mild.length} shops for 不吃辣`)
  // Allergens are inferred from dish and set-meal names: a shop naming peanuts drops out, one with no listing at all too.
  const safe = restaurants.filter((r) => matchesFilters(r, { ...filters, allergies: ['花生'] }))
  assert.ok(safe.length >= 20, `${safe.length} shops for 花生过敏`)
  assert.ok(safe.every((r) => Array.isArray(r.allergens) && !r.allergens.includes('花生')))
  assert.ok(restaurants.some((r) => r.allergens === null))
})

test('the brand shops in the data are played by their mascots', async () => {
  for (const [name, body] of [['蜜雪冰城', 'snowking'], ['星巴克', 'siren'], ['茶百道', 'panda']]) {
    const shop = restaurants.find((r) => r.name === name)
    assert.ok(shop, name)
    const contract = await runGeneration(shopFromRestaurant(shop), { id: shop.id, catalog: PERFORMANCE_CATALOG })
    assert.equal(contract.rig.body, body)
    assert.equal(contract.brand.name, name)
  }
})
