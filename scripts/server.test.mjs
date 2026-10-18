import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../server/app.ts'
import { publicConfig } from '../server/publicConfig.ts'
import { serviceStatus } from '../server/status.ts'

// A project folder with stand-in builds: the app at dist/, the test console at director/dist/.
function fakeProject() {
  const root = mkdtempSync(join(tmpdir(), 'what-to-eat-'))
  const files = {
    'dist/index.html': '<!doctype html><title>app</title>',
    'dist/assets/app-abc123.js': 'console.log("app")',
    'dist/data/dianping/shop-1.json': '{"id":"shop-1"}',
    'dist/favicon.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'director/dist/index.html': '<!doctype html><title>director</title>',
    'director/dist/assets/director-def456.js': 'console.log("director")',
    'secret.txt': 'outside both builds',
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

async function serve(t, root, env = {}) {
  const app = createApp({ root, env })
  const server = createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => { app.close(); server.closeAllConnections(); server.close(resolve) }))
  const base = `http://127.0.0.1:${server.address().port}`
  return (path, init) => fetch(base + path, { redirect: 'manual', ...init })
}

test('one server serves the phone app at / and the test console at /director/', async (t) => {
  const root = fakeProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const get = await serve(t, root)

  const home = await get('/')
  assert.equal(home.status, 200)
  assert.match(await home.text(), /<title>app<\/title>/)
  assert.equal(home.headers.get('cache-control'), 'no-cache')
  // Client-side routes of the app fall back to its page; missing files do not.
  assert.match(await (await get('/debate')).text(), /app/)
  assert.equal((await get('/missing.js')).status, 404)
  const asset = await get('/assets/app-abc123.js')
  assert.equal(asset.headers.get('content-type'), 'text/javascript; charset=utf-8')
  assert.match(asset.headers.get('cache-control'), /immutable/)

  const bare = await get('/director?tab=library')
  assert.equal(bare.status, 301)
  assert.equal(bare.headers.get('location'), '/director/?tab=library')
  assert.match(await (await get('/director/')).text(), /<title>director<\/title>/)
  assert.match(await (await get('/director/live')).text(), /director/)
  assert.match(await (await get('/director/assets/director-def456.js')).text(), /director/)
  // The console shares the app's public files: shop details and icons.
  const shop = await get('/director/data/dianping/shop-1.json')
  assert.equal(shop.status, 200)
  assert.deepEqual(await shop.json(), { id: 'shop-1' })
  assert.equal((await get('/director/favicon.svg')).status, 200)
  assert.equal((await get('/director/assets/missing.js')).status, 404)
})

test('requests never leave the two build folders and unknown APIs are not pages', async (t) => {
  const root = fakeProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const get = await serve(t, root)
  for (const path of ['/..%2Fsecret.txt', '/director/..%2F..%2Fsecret.txt', '/director/%2e%2e%2F%2e%2e%2Fsecret.txt', '/assets/..%2F..%2Fsecret.txt']) {
    const response = await get(path)
    assert.ok(response.status === 403 || response.status === 404, `${path} → ${response.status}`)
    assert.doesNotMatch(await response.text(), /outside both builds/)
  }
  assert.equal((await get('/api/nothing-here')).status, 404)
  assert.equal((await get('/', { method: 'POST' })).status, 405)
})

test('a console that was never built says how to build it', async (t) => {
  const root = fakeProject()
  rmSync(join(root, 'director'), { recursive: true, force: true })
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const get = await serve(t, root)
  const response = await get('/director/')
  assert.equal(response.status, 404)
  assert.match(await response.text(), /npm run build/)
})

test('the map key reaches the page at run time, under the new names or the old VITE_ ones', async (t) => {
  assert.deepEqual(publicConfig({}), { amap: null })
  assert.deepEqual(publicConfig({ AMAP_KEY: 'k1', AMAP_SECURITY_CODE: 's1' }), { amap: { key: 'k1', securityJsCode: 's1' } })
  assert.deepEqual(publicConfig({ VITE_AMAP_KEY: 'k2', VITE_AMAP_SECURITY_CODE: 's2' }), { amap: { key: 'k2', securityJsCode: 's2' } })
  // A security proxy keeps the code off the page.
  assert.deepEqual(publicConfig({ AMAP_KEY: 'k3', AMAP_SECURITY_CODE: 's3', AMAP_SERVICE_HOST: 'https://example.test/_AMapService' }), { amap: { key: 'k3', serviceHost: 'https://example.test/_AMapService' } })
  assert.equal(serviceStatus({ VITE_AMAP_KEY: 'k' }, { app: 0, console: 0 }).amap.configured, true)
  assert.equal(serviceStatus({}, { app: 0, console: 0 }).amap.configured, false)

  const root = fakeProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const get = await serve(t, root, { AMAP_KEY: 'key-from-env', AMAP_SECURITY_CODE: 'code-from-env', LLM_API_KEY: 'never-shown' })
  const config = await get('/api/config')
  assert.equal(config.headers.get('cache-control'), 'no-store')
  const body = await config.text()
  assert.deepEqual(JSON.parse(body), { amap: { key: 'key-from-env', securityJsCode: 'code-from-env' } })
  assert.doesNotMatch(body, /never-shown/)
  const status = await (await get('/api/status')).text()
  assert.doesNotMatch(status, /key-from-env|code-from-env|never-shown/)
  assert.equal((await get('/api/config', { method: 'POST' })).status, 405)
})
