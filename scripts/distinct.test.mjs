import assert from 'node:assert/strict'
import { test } from 'node:test'
import { differentiate, likeness } from '../src/agents/generation/distinct.ts'
import { BRANDS, matchBrand } from '../src/agents/generation/brands.ts'

const host = (id, name, rig) => ({ id, contract: { id, name, fullName: `${name} · ${id}`, restaurant: id, rig: { badgeText: '店', ...rig } } })
// The five hosts the real line-up produced before this pass: four white chef's hats, four pairs of glasses.
const lineup = [
  host('zaoshang', '龙叔', { body: 'm_round', gender: 'male', age: 'middle', hair: 'crew', outfit: 'jacket', hat: 'cap', theme: '#6A6E8C', accessories: ['glasses', 'mustache'] }),
  host('xunmian', '小黎', { body: 'm_round', gender: 'male', age: 'young', hair: 'side', outfit: 'shirt', hat: 'cap', theme: '#5E7F4A', accessories: [] }),
  host('xiangdao', '郑姐', { body: 'f_petite', gender: 'female', age: 'middle', hair: 'long', outfit: 'jacket', hat: 'bandana', theme: '#A63D52', accessories: ['glasses'] }),
  host('yanchun', '侯伯', { body: 'm_regular', gender: 'male', age: 'old', hair: 'side', outfit: 'tang', hat: 'toque', theme: '#6E7F5A', accessories: [] }),
  host('dingxiang', '谢姐', { body: 'f_regular', gender: 'female', age: 'middle', hair: 'bun', outfit: 'tang', hat: 'toque', theme: '#C08A3E', accessories: ['glasses', 'earrings'] }),
]
const looks = (hosts) => { const changed = differentiate(hosts); return hosts.map((h) => (changed.get(h.id) || h.contract)) }

test('one white chef’s hat and two pairs of glasses at most, and no two hosts alike', () => {
  const result = looks(lineup)
  assert.equal(result.filter((c) => ['toque', 'cap'].includes(c.rig.hat)).length, 1)
  assert.ok(result.filter((c) => c.rig.accessories.includes('glasses')).length <= 2)
  for (let i = 0; i < result.length; i++) for (let j = 0; j < i; j++) assert.ok(likeness(result[i].rig, result[j].rig) < 7, `${result[i].name} ~ ${result[j].name}`)
  // Gender, age and names stay: the backend's voices and the hosts' names follow them.
  assert.deepEqual(result.map((c) => [c.name, c.rig.gender, c.rig.age]), lineup.map((h) => [h.contract.name, h.contract.rig.gender, h.contract.rig.age]))
  // The first host is never touched, and the pass is deterministic.
  assert.equal(differentiate(lineup).has('zaoshang'), false)
  assert.deepEqual(looks(lineup), result)
})

test('a chain’s character stands once; its other branches send their crew', () => {
  const mcd = BRANDS.find((b) => b.id === 'mcdonalds')
  const ronald = (id) => host(id, mcd.mascot, { body: mcd.body, brand: 'mcdonalds', gender: mcd.gender, theme: mcd.theme, ...mcd.parts })
  const result = looks([ronald('mcd-1'), lineup[0], ronald('mcd-2'), ronald('mcd-3')])
  assert.deepEqual(result.map((c) => c.name), ['麦当劳叔叔', '龙叔', '麦麦小姐姐', '汉堡小哥'])
  assert.equal(result[0].rig.hair, 'clown')
  assert.equal(result[2].rig.gender, 'female')
  assert.equal(result[2].rig.outfit, 'polo')
  assert.equal(result[2].fullName, '麦麦小姐姐 · mcd-2')
})

test('the dataset’s chains are recognised by name, and a look-alike name is not', () => {
  const ids = (names) => names.map((name) => matchBrand({ name, owner: '' })?.id ?? null)
  assert.deepEqual(ids(['肯德基', '麦当劳', '老乡鸡', 'SUBWAY赛百味', '德克士', 'Popeyes炸鸡', 'Taco Bell 塔可钟', '萨莉亚意式餐厅', '食其家', 'KPRO肯律轻食', '大米先生新鲜现炒']),
    ['kfc', 'mcdonalds', 'laoxiangji', 'subway', 'dicos', 'popeyes', 'tacobell', 'saizeriya', 'sukiya', null, null])
})
