import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { LOOK_ACCESSORIES, LOOK_AGES, LOOK_BODIES, LOOK_HAIRS, LOOK_HATS, LOOK_OUTFITS, LOOK_PROPS, parseAppMessage, parseConsoleMessage } from '../src/agents/feed/protocol.ts'
import { applyCast, emptyLineup, performers } from '../src/agents/stage/lineup.ts'
import { BODIES, HAIRS, HATS, OUTFITS, PROPS } from '../src/agents/rig/rigkit.js'
import { MASCOTS } from '../src/agents/rig/mascots.js'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='
const guest = {
  name: '雪王', restaurant: '蜜雪冰城', plate: '冰淇淋与茶饮', cuisine: '冰淇淋与茶饮', persona: '蜜雪冰城的吉祥物雪王，社牛，爱唱甜蜜蜜。',
  keywords: ['雪王', '蜜雪冰城'], defaults: { expr: 'pitch', gesture: 'present', act: 'stepIn', reaction: 'eyeroll' }, color: '#ED4754',
  look: { body: 'snowking', brand: 'mixue', gender: 'male', theme: '#E60012', badgeText: '蜜', accessories: [] }, greeting: '你爱我，我爱你，蜜雪冰城甜蜜蜜！',
}
const cast = (id, act, extra = {}) => ({ kind: 'cast', id, act, ...extra })

test('lines may cut in, carry hand-set slots and replace an earlier line', () => {
  const line = { kind: 'line', id: 'c-2', speaker: 'af3c0bf', text: ' 甜蜜蜜！ ', interrupt: true, override: { expr: 'laugh', listener_bashi: 'shock' }, replaces: 'c-1' }
  assert.deepEqual(parseConsoleMessage(line), { ...line, text: '甜蜜蜜！' })
  assert.equal('interrupt' in parseConsoleMessage({ ...line, interrupt: false }), false)
  assert.throws(() => parseConsoleMessage({ ...line, override: { mood: 'happy' } }), /line\.override key mood/)
  assert.throws(() => parseConsoleMessage({ ...line, override: { expr: 'big smile' } }), /line\.override\.expr/)
  assert.throws(() => parseConsoleMessage({ ...line, replaces: 'two words' }), /line\.replaces/)
  assert.equal(parseConsoleMessage({ ...line, mirror: true }).mirror, true)
  assert.equal('mirror' in parseConsoleMessage({ ...line, mirror: false }), false)
  assert.throws(() => parseConsoleMessage({ ...line, mirror: 'yes' }), /line\.mirror/)
  assert.equal(parseConsoleMessage({ ...line, gloss: '吃完要吃一个月泡面！' }).gloss, '吃完要吃一个月泡面！')
  assert.throws(() => parseConsoleMessage({ ...line, gloss: '释'.repeat(601) }), /line\.gloss/)
})

test('stage directions bring guests on with a checked look, and drops withdraw a line', () => {
  const enter = parseConsoleMessage(cast('s-1', 'enter', { who: 'af3c0bf', guest: { ...guest, look: { ...guest.look, logo: PNG } } }))
  assert.equal(enter.guest.look.logo, PNG)
  assert.deepEqual(parseConsoleMessage(cast('s-2', 'reset', { who: 'x', guest })), { kind: 'cast', id: 's-2', act: 'reset' })
  assert.deepEqual(parseConsoleMessage(cast('s-3', 'exit', { who: 'bashi', guest })), { kind: 'cast', id: 's-3', act: 'exit', who: 'bashi' })
  assert.throws(() => parseConsoleMessage(cast('s-4', 'exit')), /cast\.who/)
  assert.throws(() => parseConsoleMessage(cast('s-5', 'dance', { who: 'bashi' })), /cast\.act/)
  assert.throws(() => parseConsoleMessage(cast('s-6', 'enter', { who: 'g', guest: { ...guest, look: { ...guest.look, body: 'robot' } } })), /cast\.guest\.look\.body/)
  assert.throws(() => parseConsoleMessage(cast('s-7', 'enter', { who: 'g', guest: { ...guest, look: { ...guest.look, logo: 'data:image/svg+xml;base64,PHN2Zz4=' } } })), /logo/)
  assert.throws(() => parseConsoleMessage(cast('s-8', 'enter', { who: 'g', guest: { ...guest, look: { ...guest.look, logo: PNG.padEnd(50000, 'A') } } })), /logo/)
  assert.throws(() => parseConsoleMessage(cast('s-9', 'enter', { who: 'g', guest: { ...guest, color: 'red' } })), /cast\.guest\.color/)
  assert.deepEqual(parseConsoleMessage({ kind: 'drop', id: 'c-1' }), { kind: 'drop', id: 'c-1' })
  assert.throws(() => parseConsoleMessage({ kind: 'drop' }), /drop\.id/)
})

test('snapshots say who is a guest and who stands on stage, with portraits but never logos', () => {
  const entry = { id: 'af3c0bf', name: '雪王', restaurant: '蜜雪冰城', color: '#ED4754', status: 'ready', kind: 'guest', onStage: true, look: { ...guest.look, logo: PNG } }
  const parsed = parseAppMessage({ kind: 'snapshot', phase: 'debate', cast: [entry] })
  assert.deepEqual(parsed.cast[0].look, guest.look)
  assert.equal(parsed.cast[0].kind, 'guest')
  const many = Array.from({ length: 17 }, (_, i) => ({ ...entry, id: `g${i}` }))
  assert.throws(() => parseAppMessage({ kind: 'snapshot', phase: 'debate', cast: many }), /at most 16/)
  assert.equal(parseAppMessage({ kind: 'snapshot', phase: 'debate', cast: many.slice(0, 16) }).cast.length, 16)
})

test('a decision may carry Jev’s detail, checked slot by slot', () => {
  const detail = {
    model: 'jev-1.13.0', state: { scene: '美食路演', line: { text: '甜蜜蜜', language: '普通话' } }, questions: ['speaker_expr', 'listener_bashi'],
    answers: { speaker_expr: { type: 'choice', choice: 'laugh', confidence: .41, probabilities: { laugh: .41, pitch: .3 } }, intensity: { type: 'score', score: 2.2, legend: { 0: '平静', 3: '爆发' } } },
    plan: { expr: { id: 'laugh', conf: .41, gated: false, top: 'laugh' }, listener_bashi: { id: 'listen', conf: .05, gated: true, top: 'shock', manual: true } },
    target: 'bashi', target2: null, provisional: true,
  }
  const message = { kind: 'decision', lineId: 'c-2', source: 'jev', speaker: { delivery: { id: 'excited', zh: '兴奋' } }, listeners: {}, detail }
  assert.deepEqual(parseAppMessage(message), message)
  assert.throws(() => parseAppMessage({ ...message, detail: { ...detail, plan: { mood: detail.plan.expr } } }), /decision\.detail\.plan key mood/)
  assert.throws(() => parseAppMessage({ ...message, detail: { ...detail, answers: { speaker_expr: { type: 'choice', probabilities: { laugh: 1.4 } } } } }), /probabilities\.laugh/)
  assert.throws(() => parseAppMessage({ ...message, detail: { ...detail, state: { blob: 'x'.repeat(16001) } } }), /decision\.detail\.state/)
})

test('agent-studio contracts pass as agent messages, keeping only the known fields', () => {
  const studio = JSON.parse(readFileSync(new URL('../director/src/data/studio-agents/af3c0bf.json', import.meta.url), 'utf8'))
  const { contract } = parseAppMessage({ kind: 'agent', contract: studio })
  assert.deepEqual(contract.rig, studio.rig)
  assert.deepEqual(Object.keys(contract.decisions), ['look', 'accent', 'assets', 'voice'])
  for (const key of ['voice', 'voiceDesc', 'distanceKm', 'kind']) assert.equal(key in contract, false)
  assert.equal(contract.logo, null)
  assert.throws(() => parseAppMessage({ kind: 'agent', contract: { ...studio, rig: { ...studio.rig, hat: 'crown' } } }), /agent\.contract\.rig\.hat/)
})

test('the look lists copied into the protocol match the rig', () => {
  assert.deepEqual([...LOOK_BODIES], [...BODIES.map((body) => body.id), ...MASCOTS.map((m) => m.id)])
  assert.deepEqual([...LOOK_HAIRS], Object.values(HAIRS).flat().map(([id]) => id))
  assert.deepEqual([...LOOK_OUTFITS], OUTFITS.map(([id]) => id))
  assert.deepEqual([...LOOK_HATS], HATS.map(([id]) => id))
  assert.deepEqual([...LOOK_PROPS], PROPS.map(([id]) => id))
  const source = readFileSync(new URL('../src/agents/rig/rigkit.js', import.meta.url), 'utf8')
  for (const id of LOOK_ACCESSORIES) assert.ok(source.includes(`includes("${id}")`), id)
  for (const id of LOOK_AGES.filter((age) => age !== 'young')) assert.ok(source.includes(`look.age === "${id}"`), id)
})

test('the line-up: guests walk on and off, hosts return to their seats, six at most', () => {
  const hosts = ['bashi', 'huaji']
  let lineup = emptyLineup()
  const step = (cue, expected) => {
    const result = applyCast(lineup, cue, hosts)
    assert.equal(result.applied, expected.applied, `${cue.act} ${cue.who}`)
    if (expected.note) assert.equal(result.note, expected.note)
    lineup = result.lineup
  }
  step(cast('s1', 'enter', { who: 'af3c0bf', guest }), { applied: true })
  assert.deepEqual(performers(lineup, hosts), ['bashi', 'huaji', 'af3c0bf'])
  step(cast('s2', 'enter', { who: 'af3c0bf', guest }), { applied: false, note: '本就在台上' })
  step(cast('s3', 'exit', { who: 'bashi' }), { applied: true })
  assert.deepEqual(performers(lineup, hosts), ['huaji', 'af3c0bf'])
  step(cast('s4', 'exit', { who: 'bashi' }), { applied: false, note: '本就不在台上' })
  step(cast('s5', 'enter', { who: 'bashi' }), { applied: true })
  assert.deepEqual(performers(lineup, hosts), ['bashi', 'huaji', 'af3c0bf'])
  step(cast('s6', 'exit', { who: 'af3c0bf' }), { applied: true })
  assert.deepEqual(lineup.guests.map((g) => [g.id, g.onStage]), [['af3c0bf', false]])
  step(cast('s7', 'enter', { who: 'af3c0bf' }), { applied: true }) // back from the wings without resending the profile
  step(cast('s8', 'remove', { who: 'huaji' }), { applied: false, note: '本场店主只能下场，不能撤下' })
  step(cast('s9', 'enter', { who: 'nobody' }), { applied: false, note: '没有这位嘉宾的资料' })
  step(cast('s10', 'remove', { who: 'af3c0bf' }), { applied: true })
  assert.deepEqual(lineup.guests, [])

  const five = ['a', 'b', 'c', 'd', 'e']
  let full = applyCast(emptyLineup(), cast('f1', 'enter', { who: 'g1', guest }), five).lineup
  assert.equal(performers(full, five).length, 6)
  const refused = applyCast(full, cast('f2', 'enter', { who: 'g2', guest }), five)
  assert.deepEqual([refused.applied, refused.note], [false, '舞台已满（最多 6 位）'])
  full = applyCast(full, cast('f3', 'exit', { who: 'a' }), five).lineup
  assert.equal(applyCast(full, cast('f4', 'enter', { who: 'g2', guest }), five).applied, true)
  const reset = applyCast(full, cast('f5', 'reset'), five)
  assert.deepEqual([reset.lineup, reset.note], [emptyLineup(), '阵容已复位'])
})
