import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { createServer, request as httpRequest } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { createStageRelay } from '../server/stageRelay.ts'

// examples/stage-bridge.mjs is the template a multi-agent backend starts from; here the test plays the phone.
const root = fileURLToPath(new URL('..', import.meta.url))
const cast = [
  { id: 'bashi', name: '蓉姐', restaurant: '巴适川菜', color: '#C9483E', status: 'ready', kind: 'host', onStage: true, greeting: '来我屋头坐坐嘛！', evidenceIds: ['bashi-info', 'bashi-review'] },
  { id: 'huaji', name: '华叔', restaurant: '华记粤点', color: '#2F6E62', status: 'ready', kind: 'host', onStage: true },
  { id: 'wings', name: '候场', restaurant: '候场小馆', color: '#333333', status: 'ready', kind: 'host', onStage: false },
]

async function startRelay(t) {
  const relay = createStageRelay()
  const server = createServer((request, response) => relay(request, response, () => { response.writeHead(404); response.end() }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => { relay.close(); server.closeAllConnections(); server.close(resolve) }))
  return `http://127.0.0.1:${server.address().port}`
}

function post(base, from, message) {
  return fetch(`${base}/api/stage/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, message }) })
    .then(async (response) => { assert.equal(response.status, 202, await response.text()) })
}

// The phone's side of the relay: every line the console sends, performed one at a time and reported done.
// `busy()` is true while a line is on stage; the real phone ends that line before a customer's line goes up.
function phone(t, base) {
  const lines = []
  let performing = null, pending = 0
  const busy = () => performing !== null || pending > 0
  return new Promise((ready) => {
    const request = httpRequest(`${base}/api/stage/events?role=app`, (response) => {
      let buffer = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        buffer += chunk
        for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
          const frame = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          if (frame.startsWith('retry:')) ready({ lines, busy })
          const data = frame.split('\n').filter((line) => line.startsWith('data: ')).map((line) => line.slice(6)).join('\n')
          if (!data || frame.startsWith('event:')) continue
          const { message } = JSON.parse(data)
          if (message.kind !== 'line') continue
          assert.equal(performing, null, `${message.id} arrived while ${performing} was still being performed`)
          performing = message.id
          lines.push(message)
          pending++
          void (async () => {
            await post(base, 'app', { kind: 'line-state', id: message.id, phase: 'speaking' })
            await delay(40)
            performing = null
            await post(base, 'app', { kind: 'line-state', id: message.id, phase: 'done' })
            pending--
          })()
        }
      })
    })
    request.end()
    t.after(() => request.destroy())
  })
}

async function until(check, ms = 8000) {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out')
    await delay(25)
  }
}

function bridge(t, base, ...flags) {
  const child = spawn(process.execPath, ['examples/stage-bridge.mjs', '--base', base, ...flags], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  const exited = new Promise((resolve) => child.on('exit', resolve))
  t.after(() => child.kill())
  return { exited, output: () => output }
}

test('the example bridge opens the debate one line at a time and answers the customer', async (t) => {
  const base = await startRelay(t)
  const { lines, busy } = await phone(t, base)
  await post(base, 'app', { kind: 'snapshot', phase: 'debate', cast })
  const child = bridge(t, base, '--quiet')

  // Host first, then everyone on stage (not the one in the wings), each after the phone finished the one before.
  await until(() => lines.length === 3)
  assert.deepEqual(lines.map((line) => line.speaker), ['host', 'bashi', 'huaji'])
  assert.equal(lines[1].text, '来我屋头坐坐嘛！')
  assert.deepEqual(lines[1].evidenceIds, ['bashi-info'])
  assert.ok(lines.every((line) => /^bridge-[A-Za-z0-9_.:-]+$/.test(line.id) && line.id.length <= 80))

  // The customer cuts in by voice: the bridge answers that line.
  await until(() => !busy())
  await post(base, 'app', { kind: 'user-line', id: 'user-1', text: '不要太辣，人均一百以内' })
  await until(() => lines.length === 5 && !busy())
  assert.deepEqual(lines.slice(3).map((line) => [line.speaker, line.replyTo]), [['host', ['user-1']], ['bashi', ['user-1']]])
  assert.match(child.output(), /→ 主持人 Orb：欢迎来到今晚的饭局/)
  assert.match(child.output(), /← 顾客：不要太辣/)
})

test('the example bridge waits for the debate page and --once ends after the opening', async (t) => {
  const base = await startRelay(t)
  const { lines, busy } = await phone(t, base)
  await post(base, 'app', { kind: 'snapshot', phase: 'pick', cast })
  const child = bridge(t, base, '--once', '--quiet')
  await delay(400)
  assert.equal(lines.length, 0, 'nothing is said before the phone reaches the debate page')
  await post(base, 'app', { kind: 'snapshot', phase: 'debate', cast })
  await until(() => lines.length === 3 && !busy())
  assert.equal(await Promise.race([child.exited, delay(5000, 'still running', { ref: false })]), 0)
})
