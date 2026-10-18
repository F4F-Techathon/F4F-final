import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'
import { createRenderer, h, nextTick, ref } from 'vue'

// One voice at a time (src/composables/useLinePlayback.ts): a line that brings its own audio (the multi-agent
// backend's) is never read aloud by the browser as well, not when the sound comes back on mid-line and not when the
// stage resumes from a pause.

const storage = () => { const map = new Map(); return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key), clear: () => map.clear() } }
globalThis.localStorage = storage()
globalThis.sessionStorage = storage()
process.env.VITE_DATASET = 'demo'
const server = await createServer({
  configFile: false,
  resolve: { alias: { '@': process.cwd() + '/src' } },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
})
after(() => server.close())

const { useLinePlayback } = await server.ssrLoadModule('/src/composables/useLinePlayback.ts')
const { createStageDirector } = await server.ssrLoadModule('/src/composables/useStageDirector.ts')
const { stageCast, stageLayout } = await server.ssrLoadModule('/src/agents/stage/cast.ts')
const { useStageStore } = await server.ssrLoadModule('/src/stores/stage.ts')
const { useDiningStore } = await server.ssrLoadModule('/src/stores/dining.ts')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(check, ms = 4000) {
  const start = Date.now()
  while (!check()) { if (Date.now() - start > ms) throw new Error('timed out'); await sleep(20) }
}

function mountPlayback(t, { voiced }) {
  setActivePinia(createPinia())
  // Jev is not reachable here: the line plays on the baseline after its short wait.
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('offline') })
  const spoken = []
  globalThis.window = globalThis
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text } }
  globalThis.speechSynthesis = { speak: (utterance) => spoken.push(utterance.text), cancel: () => {} }
  let heard
  const voice = {
    expects: () => voiced,
    begin: () => new Promise((resolve) => { heard = resolve }),
    progress: () => .5,
    duration: () => 3,
  }
  const audio = ref(true)
  const stage = useStageStore(), dining = useDiningStore()
  dining.paused = false
  let playback
  const renderer = createRenderer({
    createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    insert() {}, remove() {}, setElementText() {}, setText() {}, setComment() {}, patchProp() {},
    parentNode: () => null, nextSibling: () => null,
  })
  const app = renderer.createApp({ setup() {
    const cast = { value: stageCast([]) }, layout = { value: stageLayout([], []) }
    playback = useLinePlayback({ director: createStageDirector(), cast, layout, nameOf: () => 'Orb', hosts: () => [], audio, blocked: () => false, voice })
    return () => h('div')
  } })
  app.mount({})
  t.after(() => { app.unmount(); delete globalThis.speechSynthesis; delete globalThis.SpeechSynthesisUtterance })
  return { playback, stage, dining, audio, spoken, finish: () => heard?.() }
}

test('a line with its own audio is never read over by the browser, whatever the sound and the pause do', async (t) => {
  const { playback, stage, dining, audio, spoken, finish } = mountPlayback(t, { voiced: true })
  stage.enqueueLocal({ kind: 'line', id: 't-1', speaker: 'host', text: '各位选手准备好了吗？开始抢客！' })
  await until(() => playback.current.value?.typing)
  assert.equal(playback.current.value.voiced, true)
  audio.value = false; await nextTick()
  audio.value = true; await nextTick()
  dining.paused = true; await nextTick()
  dining.paused = false; await nextTick()
  assert.deepEqual(spoken, [], 'the backend audio is the only voice')
  finish()
  await until(() => !playback.current.value?.typing)
})

test('a line without audio is read aloud, and read on from where it stopped after a pause', async (t) => {
  const { playback, stage, dining, spoken } = mountPlayback(t, { voiced: false })
  stage.enqueueLocal({ kind: 'line', id: 'c-1', speaker: 'host', text: '各位选手准备好了吗？开始抢客！' })
  await until(() => playback.current.value?.typing)
  assert.equal(spoken.length, 1)
  dining.paused = true; await nextTick()
  dining.paused = false; await nextTick()
  assert.equal(spoken.length, 2)
  assert.ok(spoken[1].length <= spoken[0].length)
})
