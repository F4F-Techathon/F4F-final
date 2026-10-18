import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { specFor } from '../src/agents/rig/rigkit.js'
import '../src/agents/rig/mascots.js' // registers the brand mascots' bodies
import { parseShop } from '../director/src/core/shop.ts'
import { fromStudioAgent } from '../director/src/core/studioAgents.ts'
import { applyStageMessage, createDirectorState, itemFor, persistable, removeItem, restoreState, DETAIL_KEEP } from '../director/src/core/timeline.ts'
import { PERFORMANCE_CATALOG } from '../src/agents/catalog/performance.ts'
import { LOOK_BODIES } from '../src/agents/feed/protocol.ts'

const golden = JSON.parse(readFileSync(new URL('./fixtures/parse-shop-golden.json', import.meta.url), 'utf8'))
const studioDir = new URL('../director/src/data/studio-agents/', import.meta.url)
const studioFiles = readdirSync(studioDir).filter((name) => name.endsWith('.json'))

test('shop text parses exactly as agent-studio’s parse_shop does', () => {
  assert.ok(golden.length >= 10)
  for (const { text, shop } of golden) assert.deepEqual(parseShop(text), shop, text)
})

test('agent-studio’s brand agents import as library agents a guest can be made from', () => {
  assert.deepEqual(studioFiles.sort(), ['a65a783.json', 'a661fa3.json', 'af3c0bf.json'])
  const ids = (list) => list.map((item) => item.id)
  for (const file of studioFiles) {
    const raw = JSON.parse(readFileSync(new URL(file, studioDir), 'utf8'))
    const agent = fromStudioAgent(raw)
    assert.equal(agent.source, 'studio')
    assert.equal(agent.id, raw.id)
    assert.deepEqual(agent.rig, raw.rig)
    assert.ok(LOOK_BODIES.includes(agent.rig.body))
    assert.ok(specFor(agent.rig).headOrigin < 0, 'the rig can lay it out')
    assert.ok(ids(PERFORMANCE_CATALOG.expressions).includes(agent.defaults.expr))
    assert.ok(ids(PERFORMANCE_CATALOG.gestures).includes(agent.defaults.gesture))
    assert.ok(ids(PERFORMANCE_CATALOG.acts).includes(agent.defaults.act))
    assert.ok(PERFORMANCE_CATALOG.reactions.includes(agent.defaults.reaction))
    assert.deepEqual(agent.studio.voice, raw.voice)
    assert.equal(agent.energy, raw.decisions.assets.answers.energy.score)
    assert.match(agent.created, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)
    assert.equal(new Date(agent.created).getTime(), new Date(raw.created.replace(' ', 'T')).getTime())
    for (const key of ['voice', 'voiceDesc', 'distanceKm', 'kind']) assert.equal(key in agent, false)
  }
  assert.throws(() => fromStudioAgent({ id: 'x' }), /agent\.contract/)
})

const meta = (n) => ({ id: `ab-${n}`, at: 1000 + n, from: 'console' })
const line = (id, extra = {}) => ({ kind: 'line', id, speaker: 'bashi', text: `台词 ${id}`, ...extra })
const decision = (lineId, extra = {}) => ({ kind: 'decision', lineId, source: 'jev', speaker: {}, listeners: {}, ...extra })

test('a replay or an edit lands on the original card, and the superseded performance stops reporting there', () => {
  const state = createDirectorState()
  let n = 0
  const apply = (message) => applyStageMessage(state, message, meta(++n))
  apply(line('l1'))
  apply({ kind: 'line-state', id: 'l1', phase: 'done' })
  apply(decision('l1', { latencyMs: 300 }))
  // A replay sent from this console: the alias is recorded before the echo arrives.
  state.aliases.r1 = 'l1'
  apply(line('r1', { replaces: 'l1', text: '台词 l1', override: { expr: 'laugh' } }))
  const card = itemFor(state, 'r1')
  assert.equal(card.id, 'l1')
  assert.equal(state.timeline.length, 1)
  assert.deepEqual([card.live, card.replaying, card.override, card.phase, card.edited], ['r1', true, { expr: 'laugh' }, undefined, undefined])
  apply({ kind: 'line-state', id: 'l1', phase: 'dropped' }) // the old id no longer speaks for the card
  assert.equal(card.phase, undefined)
  apply({ kind: 'line-state', id: 'r1', phase: 'speaking' })
  apply(decision('r1', { latencyMs: 700 }))
  assert.deepEqual([card.phase, card.decision.lineId], ['speaking', 'r1'])
  apply({ kind: 'line-state', id: 'r1', phase: 'done' })
  assert.equal(card.replaying, false)
  assert.equal(card.times.done, 1000 + n)
  // Another console's edit arrives with only `replaces`.
  apply(line('e1', { replaces: 'l1', text: '改过的台词' }))
  assert.deepEqual([card.text, card.edited, card.live, state.aliases.e1], ['改过的台词', true, 'e1', 'l1'])
})

test('stage directions get their own rows, deleted cards stay deleted, and only recent lines keep Jev’s detail', () => {
  const state = createDirectorState()
  let n = 0
  const apply = (message) => applyStageMessage(state, message, meta(++n))
  apply({ kind: 'line-state', id: 's1', phase: 'queued' }) // the phone's report beat the echo
  apply({ kind: 'cast', id: 's1', act: 'enter', who: 'af3c0bf', guest: {} })
  apply({ kind: 'line-state', id: 's1', phase: 'done', note: '舞台已满（最多 6 位）' })
  assert.deepEqual(state.timeline.map((item) => [item.type, item.id, item.phase]), [['stage', 's1', 'done']])
  assert.equal(state.timeline[0].phaseNote, '舞台已满（最多 6 位）')
  apply(line('l1'))
  removeItem(state, 'l1')
  apply({ kind: 'line-state', id: 'l1', phase: 'dropped', note: '导演台撤回' })
  apply(line('l1'))
  assert.deepEqual(state.timeline.map((item) => item.id), ['s1'])
  const detail = { state: {}, questions: [], answers: {}, plan: {} }
  for (let i = 0; i < DETAIL_KEEP + 5; i++) { apply(line(`m${i}`)); apply(decision(`m${i}`, { detail })) }
  const saved = persistable(state)
  const kept = saved.timeline.filter((item) => item.type === 'line' && item.decision?.detail).map((item) => item.id)
  assert.equal(kept.length, DETAIL_KEEP)
  assert.equal(kept[0], 'm5')
  assert.ok(state.timeline.find((item) => item.id === 'm0').decision.detail, 'the live view keeps everything')
  const restored = restoreState(JSON.parse(JSON.stringify({ ...saved, timeline: [{ type: 'line', id: 'old', key: 'line:old', no: 1, origin: 'console', speaker: 'x', text: 'y', replyTo: [], evidenceIds: [], at: 1, seen: true }], aliases: undefined })))
  assert.deepEqual([restored.timeline[0].times, restored.aliases, Array.isArray(restored.removed)], [{}, {}, true])
})

test('with several phones open, a late report never pulls a card back, and old lines a phone catches up on make no rows', () => {
  const state = createDirectorState()
  let n = 0
  const apply = (message) => applyStageMessage(state, message, meta(++n))
  apply(line('l1'))
  for (const phase of ['queued', 'deciding', 'speaking', 'done', 'queued', 'speaking']) apply({ kind: 'line-state', id: 'l1', phase })
  assert.equal(itemFor(state, 'l1').phase, 'done')
  apply({ kind: 'line-state', id: 'old1', phase: 'queued' })
  apply({ kind: 'line-state', id: 'old2', phase: 'dropped', note: '舞台已清空' })
  assert.deepEqual(state.timeline.map((item) => item.id), ['l1'])
  apply({ kind: 'line-state', id: 'old3', phase: 'speaking' }) // the stage performs a line this console never saw
  apply(decision('old4'))
  assert.deepEqual(state.timeline.map((item) => [item.id, item.seen]), [['l1', true], ['old3', false], ['old4', false]])
})

test('the Jev check hands Jev the film’s cast and languages exactly as agent-studio did', async (t) => {
  const { createServer } = await import('vite')
  const server = await createServer({ configFile: false, resolve: { alias: { '@': process.cwd() + '/src' } }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' })
  t.after(() => server.close())
  const { filmCast, lineLanguage } = await server.ssrLoadModule('/director/src/system/check.ts')
  const { FILM_LINES } = await server.ssrLoadModule('/director/src/data/film.ts')
  const golden = JSON.parse(readFileSync(new URL('./fixtures/jev-golden.json', import.meta.url), 'utf8'))
  const cast = filmCast()
  assert.deepEqual(cast, golden.cast.filter((member) => cast.some((item) => item.id === member.id)))
  assert.deepEqual(cast.map((member) => member.id), ['rong', 'hua', 'pierre', 'orb', 'me'])
  assert.equal(FILM_LINES.length, 13)
  assert.deepEqual(Object.fromEntries(['R1', 'H1', 'P0', 'P1', 'O3'].map((id) => [id, lineLanguage(FILM_LINES.find((line) => line.id === id))])),
    { R1: '四川话', H1: '粤语', P0: '法语', P1: '法式口音普通话', O3: '普通话' })
})
