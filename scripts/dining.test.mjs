import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'
import { createRenderer, h, nextTick } from 'vue'

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

const { restaurants, evidence, defaultFilters } = await server.ssrLoadModule('/src/data/restaurants.ts')
const { matchesFilters, parseRequirements } = await server.ssrLoadModule('/src/lib/filtering.ts')
const { useDiningStore } = await server.ssrLoadModule('/src/stores/dining.ts')
const { runnerPose, contestantReveal, venuePose, curtainFolds, GATHER_DURATION, STAGE_HANDOFF_START } = await server.ssrLoadModule('/src/lib/entranceMotion.ts')
const { useEntranceStore } = await server.ssrLoadModule('/src/stores/entrance.ts')
const { useSpeechInput } = await server.ssrLoadModule('/src/composables/useSpeechInput.ts')
const { usePressToTalk } = await server.ssrLoadModule('/src/composables/usePressToTalk.ts')
const { stageSlots } = await server.ssrLoadModule('/src/lib/stageLayout.ts')
const { RIG } = await server.ssrLoadModule('/src/lib/characterRig.js')
const { cardStackPose, swipeDirection, VISIBLE_STACK_CARDS } = await server.ssrLoadModule('/src/lib/swipeMotion.ts')
const { orbAnchorFrame, pickerArrivalProgress, PICKER_ARRIVAL_DURATION } = await server.ssrLoadModule('/src/lib/pickerArrivalMotion.ts')
const { usePickerArrivalStore } = await server.ssrLoadModule('/src/stores/pickerArrival.ts')

// Exercises the same explicit invitations used by the swipe UI instead of auto-filling a cast.
function inviteRestaurants(store, count) {
  for (let index = 0; index < count; index++) assert(store.swipeRestaurant(store.swipeCandidates[0].id, true))
}

// A component lifecycle and a fake recognition service exercise event ordering without a browser.
function mountSpeech(t, options = {}, supported = true, pressToTalk = false) {
  const previousWindow = globalThis.window, previousDocument = globalThis.document
  const instances = [], heard = [], completed = []
  class FakeRecognition {
    constructor() { instances.push(this) }
    start() {}
    stop() { this.stopped = true; this.stopCount = (this.stopCount || 0) + 1 }
    abort() { this.aborted = true }
    result(text, isFinal) { this.onresult?.({ results: [{ 0: { transcript: text }, isFinal }] }) }
    end() { this.onend?.() }
  }
  globalThis.window = Object.assign(new EventTarget(), supported ? { SpeechRecognition: FakeRecognition } : {})
  globalThis.document = Object.assign(new EventTarget(), { hidden: false })
  const renderer = createRenderer({
    createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    insert() {}, remove() {}, setElementText() {}, setText() {}, setComment() {}, patchProp() {},
    parentNode: () => null, nextSibling: () => null,
  })
  let speech
  const app = renderer.createApp({ setup() {
    speech = (pressToTalk ? usePressToTalk : useSpeechInput)((text) => heard.push(text), { ...options, onComplete: (text) => completed.push(text) })
    return () => h('div')
  } })
  app.mount({})
  t.after(() => {
    app.unmount()
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument
  })
  return { speech, instances, heard, completed, app }
}

// Model captured pointer delivery, including capture loss after a normal release, without opening a browser.
function mountHold(t, options = {}) {
  const mounted = mountSpeech(t, options, true, true)
  let now = 0
  t.mock.method(performance, 'now', () => now)
  const captures = new Set()
  const target = {
    setPointerCapture: (id) => captures.add(id),
    hasPointerCapture: (id) => captures.has(id),
    releasePointerCapture(id) { captures.delete(id); pointer('lostpointercapture', { pointerId: id }) },
  }
  function pointer(type, overrides = {}) {
    mounted.speech.events[type]({ isPrimary: true, button: 0, pointerId: 7, currentTarget: target, preventDefault() {}, ...overrides })
  }
  function key(type, key = ' ', repeat = false) { mounted.speech.events[type]({ key, repeat, preventDefault() {} }) }
  return { ...mounted, pointer, key, advance: (milliseconds = 500) => { now += milliseconds }, captures }
}

test('holding captures the pointer and release waits for final recognition before sending once', (t) => {
  const { speech, instances, pointer, advance, completed, captures } = mountHold(t)
  pointer('pointerdown')
  assert(speech.holding.value)
  assert(captures.has(7))
  assert.equal(instances[0].continuous, true)
  instances[0].result('两个人，人均', false)
  advance()
  pointer('pointerup', { pointerId: 8 })
  assert(speech.holding.value)
  pointer('pointerup')
  assert.equal(speech.holding.value, false)
  assert(speech.finishing.value)
  assert.equal(captures.size, 0)
  // Disabling a focused button during finalization must not discard its last words.
  speech.events.blur()
  pointer('pointerdown')
  assert.equal(instances.length, 1)
  instances[0].result('两个人，人均200以内', true)
  instances[0].end()
  instances[0].end()
  assert.equal(speech.listening.value, false)
  assert.deepEqual(completed, ['两个人，人均200以内'])
})

test('a quick tap, right click or secondary touch cannot send a voice turn', (t) => {
  const { speech, instances, pointer, advance, completed } = mountHold(t)
  pointer('pointerdown', { button: 2 })
  pointer('pointerdown', { isPrimary: false })
  assert.equal(instances.length, 0)
  pointer('pointerdown')
  const recording = instances[0], lateEnd = recording.onend
  recording.result('误触', true)
  advance(100)
  pointer('pointerup')
  lateEnd()
  assert(recording.aborted)
  assert.equal(speech.listening.value, false)
  assert.deepEqual(completed, [])
})

test('a recognizer that stops early during a hold is resumed and every word is kept until release', (t) => {
  const { speech, instances, pointer, advance, completed, heard } = mountHold(t)
  // Like Chrome, every result event carries the session's whole list: [text, isFinal] pairs.
  const say = (recording, ...results) => recording.onresult?.({ results: results.map(([text, isFinal]) => ({ 0: { transcript: text }, isFinal })) })
  pointer('pointerdown')
  // Chrome's speech service stalls after the first phrase: an error, then the session ends on its own.
  say(instances[0], ['不吃辣，', true])
  say(instances[0], ['不吃辣，', true], ['想吃', false])
  instances[0].onerror({ error: 'network' })
  instances[0].end()
  assert.equal(instances.length, 2, 'a new session starts while the button is held')
  assert(speech.holding.value && speech.listening.value)
  assert.equal(speech.error.value, '')
  assert.deepEqual(completed, [])
  say(instances[1], ['粤菜', false])
  assert.equal(heard.at(-1), '不吃辣，想吃粤菜')
  say(instances[1], ['粤菜，两个人', true])
  instances[1].end() // a pause ends this one too
  say(instances[2], ['预算一百', true])
  advance()
  pointer('pointerup')
  assert(instances[2].stopped)
  instances[2].end()
  assert.deepEqual(completed, ['不吃辣，想吃粤菜，两个人预算一百'])
  assert.equal(speech.listening.value, false)
  assert.equal(instances.length, 3)
})

test('lost touches, backgrounding and leaving cancel held or finalizing voice without late submissions', (t) => {
  const { speech, instances, pointer, advance, completed, app } = mountHold(t)
  const cancelActions = [
    () => pointer('pointercancel'),
    () => pointer('lostpointercapture'),
    () => window.dispatchEvent(new Event('blur')),
    () => { document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); document.hidden = false },
    () => speech.events.blur(),
    () => speech.cancel(),
    () => { pointer('pointerup'); window.dispatchEvent(new Event('blur')) },
    () => app.unmount(),
  ]
  for (const cancel of cancelActions) {
    pointer('pointerdown')
    const recording = instances.at(-1), lateEnd = recording.onend
    recording.result('这段话取消', true)
    advance()
    cancel()
    lateEnd()
    assert(recording.aborted)
    assert.equal(speech.listening.value, false)
    assert.equal(speech.finishing.value, false)
    assert.deepEqual(completed, [])
  }
})

test('Space and Enter support holding, ignore repeated keys and release only the matching key', (t) => {
  const { speech, instances, key, advance, completed } = mountHold(t)
  key('keydown', 'a')
  assert.equal(instances.length, 0)
  key('keydown')
  key('keydown', ' ', true)
  key('keydown', 'Enter')
  assert.equal(instances.length, 1)
  advance()
  key('keyup', 'Enter')
  assert(speech.holding.value)
  key('keyup')
  instances[0].result('附近吃饭', true)
  instances[0].end()
  key('keydown', 'Enter')
  advance()
  key('keyup', 'Enter')
  instances[1].result('三个人', true)
  instances[1].end()
  assert.deepEqual(completed, ['附近吃饭', '三个人'])
})

test('busy states block new holds and a microphone rejection cancels capture before retrying', (t) => {
  let disabled = true, starts = 0
  const { speech, instances, pointer, captures, advance, completed } = mountHold(t, { disabled: () => disabled, onStart: () => starts++ })
  pointer('pointerdown')
  assert.equal(starts, 0)
  assert.equal(instances.length, 0)
  disabled = false
  pointer('pointerdown')
  instances[0].onerror({ error: 'not-allowed' })
  assert.equal(captures.size, 0)
  assert.equal(speech.holding.value, false)
  assert(speech.error.value.includes('再长按'))
  pointer('pointerdown')
  advance()
  pointer('pointerup')
  instances[1].result('重新说这句', true)
  instances[1].end()
  assert.deepEqual(completed, ['重新说这句'])
})

test('a delayed microphone startup after release is stopped again and cannot restart recording', (t) => {
  const { speech, instances, completed } = mountSpeech(t)
  speech.start()
  speech.start()
  assert.equal(instances.length, 1)
  assert.equal(instances[0].stopCount, undefined)
  speech.stop()
  instances[0].onstart()
  assert.equal(instances[0].stopCount, 2)
  instances[0].result('最终文字', true)
  instances[0].end()
  assert.deepEqual(completed, ['最终文字'])
})

test('voice-only input waits for final words after stop before completing exactly once', (t) => {
  const { speech, instances, heard, completed } = mountSpeech(t, { continuous: false })
  speech.start()
  const recording = instances[0]
  assert.equal(recording.continuous, false)
  recording.result('两个人，人均', false)
  assert.equal(heard.at(-1), '两个人，人均')
  assert.deepEqual(completed, [])
  speech.stop()
  assert(recording.stopped)
  assert.equal(speech.listening.value, true)
  recording.result('两个人，人均200以内', true)
  assert.deepEqual(completed, [])
  recording.end()
  recording.end()
  assert.deepEqual(completed, ['两个人，人均200以内'])
  assert.equal(speech.listening.value, false)
})

test('failed, empty and interim-only recordings cannot submit stale requirements on a retry', (t) => {
  const { speech, instances, completed } = mountSpeech(t, { continuous: false })
  speech.start()
  instances[0].result('旧的需求', true)
  instances[0].onerror({ error: 'not-allowed' })
  instances[0].end()
  assert(speech.error.value.includes('麦克风'))
  speech.start()
  assert.equal(speech.error.value, '')
  assert.equal(speech.transcript.value, '')
  instances[1].end()
  assert(speech.error.value)
  speech.start()
  instances[2].result('没有确认的句子', false)
  instances[2].end()
  assert.deepEqual(completed, [])
  speech.start()
  instances[3].result('附近吃点清淡的', true)
  instances[3].end()
  assert.deepEqual(completed, ['附近吃点清淡的'])
})

test('discussion dictation stays continuous and leaving aborts without completing', (t) => {
  const { speech, instances, app, completed } = mountSpeech(t)
  speech.start()
  const recording = instances[0], lateEnd = recording.onend
  assert.equal(recording.continuous, true)
  recording.result('不吃辣', true)
  app.unmount()
  lateEnd()
  assert(recording.aborted)
  assert.equal(recording.onresult, null)
  assert.equal(recording.onerror, null)
  assert.equal(recording.onend, null)
  assert.deepEqual(completed, [])
})

test('canceling stage speech discards late words and allows a new conversation turn', (t) => {
  const { speech, instances, completed } = mountSpeech(t)
  speech.start()
  const first = instances[0], lateEnd = first.onend
  first.result('这一句已取消', true)
  speech.cancel()
  lateEnd()
  assert.equal(speech.listening.value, false)
  assert(first.aborted)
  assert.deepEqual(completed, [])
  speech.start()
  instances[1].result('新的想法', true)
  instances[1].end()
  assert.deepEqual(completed, ['新的想法'])
})

test('unsupported speech recognition gives a retryable message without starting a session', (t) => {
  const { speech, instances, completed } = mountSpeech(t, {}, false)
  speech.start()
  assert(speech.error.value.includes('浏览器'))
  assert.equal(speech.listening.value, false)
  assert.deepEqual(instances, [])
  assert.deepEqual(completed, [])
})

test('entrance runners remain anchored and gather correctly across phone and tablet sizes', () => {
  for (const width of [320, 390, 768, 1024, 1366]) {
    const target = { x: width / 2, y: 400 }
    const size = Math.min(1.4, Math.max(1, width / 480))
    for (const count of [2, 3, 4, 5]) {
      for (let index = 0; index < count; index++) {
        const start = { x: width * (index + 1) / (count + 1), y: 180 + index * 75 }
        assert.equal(runnerPose(0, index, count, start, target, size).opacity, 0)
        const beforeRunning = runnerPose(1540 + index * 110, index, count, start, target, size)
        assert.equal(beforeRunning.x, start.x)
        assert.equal(beforeRunning.y, start.y)
        const arrived = runnerPose(3750, index, count, start, target, size)
        assert(Math.abs(arrived.x - target.x) <= (26 * (count - 1) + 1) * size)
        assert(Math.abs(arrived.y - target.y) <= (18 + (count - 1) * 4.5 + 1) * size)
        assert.equal(runnerPose(GATHER_DURATION, index, count, start, target, size).opacity, 0)
        for (let time = 0; time <= GATHER_DURATION; time += 25) {
          const pose = runnerPose(time, index, count, start, target, size)
          assert([pose.x, pose.y, pose.scale, pose.opacity].every(Number.isFinite))
          assert(pose.scale >= -1e-8)
        }
      }
    }
  }
})

test('houses establish first and fade only while their own contestants emerge', () => {
  for (let index = 0; index < 5; index++) {
    assert.deepEqual(contestantReveal(800, index), { pop: 0, houseOpacity: 1, houseScale: 1 })
    let previousOpacity = 1
    for (let time = 0; time <= 2200; time += 10) {
      const reveal = contestantReveal(time, index)
      const runner = runnerPose(time, index, 5, { x: 100, y: 200 }, { x: 195, y: 430 })
      if (!reveal.pop) {
        assert.equal(reveal.houseOpacity, 1)
        assert.equal(runner.opacity, 0)
      } else {
        assert(runner.opacity > 0 && runner.scale > 0)
        assert(reveal.houseOpacity < 1)
      }
      if (reveal.houseOpacity === 0) assert.equal(reveal.pop, 1)
      assert(reveal.houseOpacity <= previousOpacity)
      assert(reveal.houseScale >= .78 && reveal.houseScale <= 1)
      previousOpacity = reveal.houseOpacity
    }
    assert.equal(previousOpacity, 0)
  }
})

test('the venue appears late and stays at its normal size; the stage handoff waits for every contestant', () => {
  for (const time of [0, 600, 2200, 3000]) assert.equal(venuePose(time).opacity, 0)
  assert(venuePose(3250).opacity > 0)
  for (let time = 3500; time <= GATHER_DURATION; time += 10) {
    assert.deepEqual(venuePose(time), { opacity: 1, scale: 1 })
  }
  for (const count of [2, 3, 4, 5]) {
    for (let index = 0; index < count; index++) {
      const start = { x: 100, y: 200 }, target = { x: 195, y: 430 }
      assert.equal(runnerPose(STAGE_HANDOFF_START, index, count, start, target).opacity, 0)
    }
  }
  assert(GATHER_DURATION > STAGE_HANDOFF_START)
})

test('cloth covers the center when closed and compresses to the wings on phone and tablet widths', () => {
  const widths = [88, 124, 70, 106, 136, 80, 112, 62, 98, 130, 69]
  for (const width of [320, 375, 390, 430, 480, 768, 834, 1024, 1194, 1366]) {
    const closed = curtainFolds(widths, 0, width / 2, 1)
    const closedEdge = closed.at(-1).x + closed.at(-1).width
    assert(closedEdge > width / 2)
    const open = curtainFolds(widths, 1, width / 2, 1)
    assert(open.at(-1).x + open.at(-1).width * open.at(-1).sx < width * .17)
    assert(open.every((fold) => fold.sx > 0 && fold.sy > 0))
  }
})

test('the visual sequence rejects duplicate starts and can be canceled and replayed', () => {
  setActivePinia(createPinia())
  const entrance = useEntranceStore()
  const scene = { actors: restaurants.slice(0, 3), mapAvailable: true, anchors: () => ({ starts: [], target: { x: 195, y: 400 } }), focusTarget() {} }
  assert(entrance.begin(scene))
  assert.equal(entrance.begin(scene), false)
  entrance.cover()
  assert.equal(entrance.phase, 'covered')
  entrance.reveal()
  assert.equal(entrance.stageProgress, 0)
  entrance.elapsed = 1900
  assert.equal(entrance.stageProgress, 1)
  entrance.finish()
  assert.equal(entrance.active, false)
  assert.equal(entrance.stageProgress, 1)
  assert(entrance.begin(scene))
  entrance.finish()
})

test('hard requirements exclude missing facts while soft preferences keep alternatives', () => {
  const filters = defaultFilters()
  assert.equal(matchesFilters(restaurants.find((r) => r.price === null), { ...filters, maxBudget: 200 }), false)
  assert.equal(matchesFilters(restaurants[0], { ...filters, quiet: true }), true)
  assert.equal(matchesFilters(restaurants[0], { ...filters, noSpice: true }), false)
  assert.equal(matchesFilters(restaurants.find((r) => r.allergens === null), { ...filters, allergies: ['花生'] }), false)
  const parsed = parseRequirements('两个人约会，人均200以内，想安静一点', filters)
  assert.equal(parsed.people, 2)
  assert.equal(parsed.maxBudget, 200)
  assert.equal(parsed.scene, '约会')
  assert.equal(parsed.quiet, true)
})

test('every restaurant cites only its own evidence and demo reviews stay marked as mock', () => {
  for (const restaurant of restaurants) {
    assert(restaurant.evidenceIds.length)
    for (const id of restaurant.evidenceIds) assert(evidence.some((e) => e.id === id && e.restaurantId === restaurant.id))
  }
  assert(evidence.filter((e) => e.kind === 'review').every((e) => e.mock))
})

test('interventions preserve history and explicit choices obey the latest hard requirements', async () => {
  storage.clear()
  setActivePinia(createPinia())
  const store = useDiningStore()
  store.understand('两个人约会，人均200以内')
  inviteRestaurants(store, 5)
  assert.equal(store.selected.length, 5)
  store.startDebate()
  const host = store.selected[0]
  store.recordLine({ id: 'line-1', restaurantId: host.id, speakerId: host.id, speaker: host.host, text: '来我屋头坐坐嘛！', round: 1, topic: '', evidenceIds: [], time: new Date().toISOString() })
  store.recordLine({ id: 'line-1', restaurantId: host.id, speakerId: host.id, speaker: host.host, text: '来我屋头坐坐嘛！', round: 1, topic: '', evidenceIds: [], time: new Date().toISOString() })
  assert.equal(store.history.length, 1)
  const previousStatement = store.history[0].text
  const entry = store.intervene('我不能吃辣，人均不能超过150')
  assert.equal(entry.speakerId, 'user')
  assert.equal(store.history[0].text, previousStatement)
  assert.equal(store.filters.maxBudget, 150)
  assert.equal(store.filters.noSpice, true)
  const choice = store.decisionCandidates[0]
  assert(choice)
  const winner = store.decide(choice.id)
  assert(winner)
  assert(matchesFilters(winner, store.filters))
  store.filters.maxBudget = 1
  assert.equal(store.decide(choice.id), undefined)
  assert.equal(store.winner, undefined)
  await nextTick()
  setActivePinia(createPinia())
  const restored = useDiningStore()
  assert.equal(restored.filters.maxBudget, 1)
  assert(restored.history.some((entry) => entry.user))
})

test('restaurant order stays stable and only an explicit choice creates a persistent result', async () => {
  storage.clear()
  setActivePinia(createPinia())
  const store = useDiningStore()
  store.understand('今晚和朋友吃饭')
  const originalOrder = store.candidates.map((restaurant) => restaurant.id)
  assert.deepEqual(originalOrder, restaurants.filter((restaurant) => matchesFilters(restaurant, store.filters)).map((restaurant) => restaurant.id))
  store.filters.quiet = true
  store.filters.mild = true
  store.filters.scene = '约会'
  assert.deepEqual(store.candidates.map((restaurant) => restaurant.id), originalOrder)
  inviteRestaurants(store, 5)
  assert.equal(store.winner, undefined)
  assert.equal(store.decide(), undefined)
  assert.equal(store.decide('missing-restaurant'), undefined)
  const outside = restaurants.find((restaurant) => !store.selectedIds.includes(restaurant.id))
  assert.equal(store.decide(outside.id), undefined)
  assert.equal(store.winnerId, '')

  const chosen = store.decisionCandidates.at(-1)
  assert.notEqual(chosen.id, store.decisionCandidates[0].id)
  assert.equal(store.decide(chosen.id).id, chosen.id)
  assert.equal(store.winner.id, chosen.id)
  assert.equal(store.decide('missing-restaurant'), undefined)
  assert.equal(store.winner.id, chosen.id)
  store.filters.quiet = false
  store.filters.scene = '家庭聚会'
  assert.equal(store.winner.id, chosen.id)

  await nextTick()
  setActivePinia(createPinia())
  const restored = useDiningStore()
  assert.equal(restored.winnerId, chosen.id)
  assert.equal(restored.winner.id, chosen.id)
  restored.removeSelection(chosen.id)
  assert(restored.decisionCandidates.length > 0)
  assert.equal(restored.winner, undefined)
})

test('casts have balanced permanent seats and stay inside phone and tablet stages', () => {
  for (const count of [2, 3, 4, 5]) {
    const seats = stageSlots(count)
    assert.equal(seats.length, count)
    assert.equal(new Set(seats.map((seat) => seat.offset)).size, count)
    assert.equal(new Set(seats.map((seat) => seat.scale)).size, 1)
    for (const [index, seat] of seats.entries()) {
      assert(Math.abs(seat.offset + seats[count - 1 - index].offset) < 1e-10)
      for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1024, 768], [1366, 1024]]) {
        const actorHeight = Math.max(135, Math.min(width * .48, height * .27, 350))
        const actorWidth = actorHeight * 140 / 207 * seat.scale
        const center = width / 2 + Math.min(width * .33, 290) * seat.offset
        assert(center - actorWidth / 2 > 8)
        assert(center + actorWidth / 2 < width - 8)
      }
    }
  }
})

test('live expression, gesture and gaze changes preserve the current pose even when interrupted', () => {
  const actor = new RIG.Actor({}, { seed: 1 })
  actor.e(1, 'pitch').p(1, 'present', .65).look(1, .65, 0)
  const before = actor.state(1.12)
  actor.e(1.12, 'listen').p(1.12, 'rest', .65).look(1.12, -.65, 0)
  const after = actor.state(1.12)
  for (const key of ['brow', 'bot', 'lid', 'look', 'tilt', 'sy', 'lean', 'hy']) {
    assert.deepEqual(after[key], before[key], `${key} must not jump during a handoff`)
  }
  for (let side = 0; side < 2; side++) {
    for (const joint of [0, 1, 3]) assert(Math.abs(after.arms[side][joint] - before.arms[side][joint]) < 1e-8)
    assert.equal(after.arms[side][2], before.arms[side][2])
  }
  const settled = actor.state(2)
  assert.equal(settled.look.x, -.65)
  assert.deepEqual(settled.arms.map((arm) => arm.slice(0, 3)), [[12, -8, 'open'], [12, -8, 'open']])
  assert.equal(settled.tilt, 4)
  actor.e(2, 'think')
  const thinking = actor.state(2.2)
  actor.e(2.2, 'pitch').look(2.2, 0, 0)
  assert.deepEqual(actor.state(2.2).look, thinking.look)
  assert.equal(actor.state(3).look.x, 0)
})

test('the entrance run decelerates into the listening pose without a final limb jump', () => {
  const actor = new RIG.Actor({}, { seed: 3 })
  actor.p(0, 'run').run(0, Infinity, 3.1)
  const before = actor.state(1.1)
  actor.p(1.1, 'rest', .65).stopRun(1.1)
  assert.deepEqual(actor.state(1.1), before)
  const landing = actor.state(1.34 - 1e-6)
  const landed = actor.state(1.34 + 1e-6)
  for (const key of ['by', 'legL', 'legR', 'lean']) assert(Math.abs(landing[key] - landed[key]) < .001)
  for (let side = 0; side < 2; side++) {
    for (const joint of [0, 1]) assert(Math.abs(landing.arms[side][joint] - landed.arms[side][joint]) < .001)
  }
  assert.deepEqual(actor.state(2).arms.map((arm) => arm.slice(0, 3)), [[12, -8, 'open'], [12, -8, 'open']])
})

test('swipes only invite explicit likes, undo the last card and restore the deck after a reload', async () => {
  storage.clear()
  setActivePinia(createPinia())
  let store = useDiningStore()
  store.understand('两个人约会，人均200以内')
  store.reconcileSelection()
  assert.equal(store.selected.length, 0)
  const skipped = store.swipeCandidates[0].id
  assert.equal(store.swipeRestaurant('not-a-restaurant', true), false)
  assert.equal(store.swipeRestaurant(store.swipeCandidates[1].id, true), false)
  assert(store.swipeRestaurant(skipped, false))
  assert.equal(store.selected.length, 0)
  assert.equal(store.swipeRestaurant(skipped, true), false)
  inviteRestaurants(store, 2)
  assert.equal(store.canStartDebate, true)
  const lastLiked = store.selectedIds.at(-1)
  store.undoSwipe()
  assert.equal(store.canStartDebate, false)
  assert.equal(store.swipeCandidates[0].id, lastLiked)
  assert(store.swipeRestaurant(lastLiked, true))
  const original = [...store.selectedIds]
  const pending = store.swipeCandidates.map((restaurant) => restaurant.id)
  const choices = JSON.parse(JSON.stringify(store.swipeHistory))
  await nextTick()
  setActivePinia(createPinia())
  store = useDiningStore()
  assert.deepEqual(store.selectedIds, original)
  assert.deepEqual(store.swipeHistory, choices)
  assert.deepEqual(store.swipeCandidates.map((restaurant) => restaurant.id), pending)
  store.undoSwipe()
  assert.equal(store.swipeCandidates[0].id, lastLiked)
  assert(store.swipeRestaurant(lastLiked, true))
  inviteRestaurants(store, 3)
  const fullCast = [...store.selectedIds]
  const next = store.swipeCandidates[0].id
  assert.equal(store.swipeRestaurant(next, true), false)
  assert.deepEqual(store.selectedIds, fullCast)
  store.removeSelection(original[0])
  assert(store.swipeRestaurant(next, true))
  assert.equal(store.selected.length, 5)
  assert(store.selectedIds.includes(next))
  assert.equal(store.selectedIds.includes(skipped), false)
})

test('condition edits reconcile invitations without silent replacements and all skips can be retried', () => {
  storage.clear()
  setActivePinia(createPinia())
  const store = useDiningStore()
  store.understand('今晚和朋友吃点好的')
  const first = store.swipeCandidates[0].id
  while (store.swipeCandidates.length) assert(store.swipeRestaurant(store.swipeCandidates[0].id, false))
  assert.equal(store.selected.length, 0)
  assert.equal(store.startDebate(), false)
  store.undoSwipe()
  assert.equal(store.swipeCandidates.length, 1)
  store.resetSwipes()
  assert.equal(store.swipeCandidates[0].id, first)
  inviteRestaurants(store, 3)
  const original = [...store.selectedIds]
  store.filters.maxBudget = 1
  assert.equal(store.swipeHistory.length, 0)
  assert.deepEqual(store.selectedIds, original)
  assert.equal(store.startDebate(), false)
  store.reconcileSelection()
  assert.equal(store.selected.length, 0)
  assert.equal(store.swipeCandidates.length, 0)
  store.filters.maxBudget = 200
  store.filters.noSpice = true
  store.filters.allergies = ['花生']
  store.reconcileSelection()
  assert.equal(store.selected.length, 0)
  assert(store.swipeCandidates.every((restaurant) => matchesFilters(restaurant, store.filters)))
  store.begin()
  assert.equal(store.swipeHistory.length, 0)
  assert.equal(store.selected.length, 0)
})

test('only a valid cast can open the theater', () => {
  storage.clear()
  setActivePinia(createPinia())
  const store = useDiningStore()
  store.understand('两个人约会，人均200以内')
  store.selectedIds = [store.candidates[0].id]
  assert.equal(store.canStartDebate, false)
  assert.equal(store.startDebate(), false)
  for (const count of [2, 3, 4, 5]) {
    store.selectedIds = store.candidates.slice(0, count).map((r) => r.id)
    assert.equal(store.canStartDebate, true)
    assert.equal(store.startDebate(), true)
    assert.deepEqual(store.history, [])
  }
  store.selectedIds = store.candidates.slice(0, 6).map((r) => r.id)
  assert.equal(store.canStartDebate, false)
  assert.equal(store.startDebate(), false)
})

test('swipe gestures distinguish deliberate choices from taps, small drags and vertical scrolling', () => {
  for (const width of [280, 350, 500]) {
    const gesture = { x: 0, y: 0, elapsed: 500, width }
    assert.equal(swipeDirection(gesture), 0)
    assert.equal(swipeDirection({ ...gesture, x: 30, y: 2 }), 0)
    assert.equal(swipeDirection({ ...gesture, x: 160, y: 180 }), 0)
    assert.equal(swipeDirection({ ...gesture, x: 140, y: 12 }), 1)
    assert.equal(swipeDirection({ ...gesture, x: -140, y: 12 }), -1)
    assert.equal(swipeDirection({ ...gesture, x: 40, elapsed: 60 }), 1)
    assert.equal(swipeDirection({ ...gesture, x: -40, elapsed: 60 }), -1)
    assert.equal(swipeDirection({ ...gesture, x: 40, elapsed: 0 }), 0)
  }
})

test('reserve card appears during the swipe and every survivor keeps its pose when the front card is removed', () => {
  assert.equal(cardStackPose(VISIBLE_STACK_CARDS, 0).opacity, 0)
  for (const progress of [.25, .5, .75]) {
    const reserve = cardStackPose(VISIBLE_STACK_CARDS, progress)
    assert(reserve.opacity > 0 && reserve.opacity < 1)
    assert(reserve.y > cardStackPose(VISIBLE_STACK_CARDS - 1, 0).y)
  }
  for (let index = 1; index <= VISIBLE_STACK_CARDS; index++) {
    const beforeCommit = cardStackPose(index, 1)
    const afterCommit = cardStackPose(index - 1, 0)
    assert.deepEqual(beforeCommit, afterCommit, `card ${index} must not jump when its slot changes`)
  }
  const gutter = 24 + 12
  for (const height of [180, 220, 370, 500, 800]) {
    for (let step = 0; step <= 100; step++) {
      const pose = cardStackPose(VISIBLE_STACK_CARDS, step / 100)
      const bottomExtension = pose.y - height * .18 * (1 - pose.scale)
      assert(bottomExtension < gutter, 'revealing the reserve must keep it above the map')
    }
  }
})

test('picker arrival docks the same orb at the measured phone or tablet anchor before revealing the deck', () => {
  for (const [from, to] of [
    [{ left: 108, top: 300, size: 159 }, { left: 28, top: 91, size: 52 }],
    [{ left: 274, top: 360, size: 220 }, { left: 142, top: 112, size: 68 }],
  ]) {
    assert.deepEqual(orbAnchorFrame(from, to, 0), from)
    assert.deepEqual(orbAnchorFrame(from, to, 1), to)
    let previous = from
    for (let elapsed = 0; elapsed <= PICKER_ARRIVAL_DURATION; elapsed += 10) {
      const progress = pickerArrivalProgress(elapsed)
      const box = orbAnchorFrame(from, to, progress.orb)
      assert(box.top <= previous.top && box.size <= previous.size)
      assert(box.left >= to.left && box.top >= to.top && box.size >= to.size)
      for (const value of Object.values(progress)) assert(value >= 0 && value <= 1)
      if (progress.cards > 0) assert(progress.title > .9)
      if (progress.map > 0) assert.equal(progress.orb, 1)
      previous = box
    }
  }
  assert(Object.values(pickerArrivalProgress(PICKER_ARRIVAL_DURATION)).every((value) => value === 1))
})

test('picker arrival resets transient motion on cancellation and direct visits stay fully visible', () => {
  setActivePinia(createPinia())
  const arrival = usePickerArrivalStore()
  assert.equal(arrival.active, false)
  assert(Object.values(arrival.progress).every((value) => value === 1))
  assert.equal(arrival.begin(), true)
  assert.equal(arrival.begin(), false)
  assert.equal(arrival.phase, 'departing')
  assert.equal(arrival.progress.cards, 0)
  arrival.arrive()
  arrival.elapsed = 800
  assert(arrival.progress.title > 0)
  assert.equal(arrival.progress.cards, 0)
  arrival.finish()
  assert.equal(arrival.active, false)
  assert.equal(arrival.elapsed, 0)
  assert(Object.values(arrival.progress).every((value) => value === 1))
  assert.equal(arrival.begin(), true)
  arrival.finish()
})
