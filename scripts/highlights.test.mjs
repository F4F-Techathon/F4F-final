import assert from 'node:assert/strict'
import { test } from 'node:test'
import { captionPieces, highlightFacts, numbersIn, zhNumber } from '../src/agents/stage/highlights.ts'

test('Chinese numerals read as a host says them', () => {
  for (const [text, value] of [['二十三', 23], ['一百零八', 108], ['八百八', 880], ['一千二', 1200], ['三万五', 35000], ['十五', 15], ['两', 2], ['四点五', 4.5], ['一百三十五', 135]])
    assert.equal(zhNumber(text), value, text)
  assert.equal(zhNumber('点五'), null)
  assert.equal(zhNumber('好'), null)
})

test('only numbers that say what they count are facts', () => {
  const values = (text) => numbersIn(text).map((hit) => [text.slice(hit.start, hit.end), hit.value, hit.unit])
  assert.deepEqual(values('人均二十三，一起来'), [['人均二十三', 23, 'money']])
  assert.deepEqual(values('单人餐才二十六块九'), [['才二十六块九', 26.9, 'money']])
  assert.deepEqual(values('三块一份的豆浆'), [['三块', 3, 'money']])
  assert.deepEqual(values('九五折，口味4.5分'), [['九五折', 9.5, 'discount'], ['4.5分', 4.5, 'score']])
  assert.deepEqual(values('十分好吃，等五分钟'), [['五分钟', 5, 'time']])
  assert.deepEqual(values('¥38的鸡腿堡'), [['¥38', 38, 'money']])
})

const facts = [
  { id: 'shop-1', kind: 'business', title: '商家资料', text: '参考人均33元' },
  { id: 'dish-1', kind: 'business', title: '推荐菜', text: '香辣鸡腿堡，资料菜价38元' },
  { id: 'pkg-1', kind: 'business', title: '到店套餐', text: '开工吃堡堡单人餐，资料售价26.9元，展示面额/原价50.5元；使用规则和有效期未提供' },
  { id: 'rev-1', kind: 'review', title: '差评 · 2 星', text: '[米饭]口味：店在地下室，一股霉味，坐不住' },
]

test('a line’s prices, names and review phrases point at the records that say them', () => {
  const text = '人均才三十三，香辣鸡腿堡三十八块，单人餐二十六块九；他家地下室一股霉味！'
  const marks = highlightFacts(text, facts).map((h) => [text.slice(h.start, h.end), h.factId, h.kind])
  assert.deepEqual(marks, [
    ['人均才三十三', 'shop-1', 'number'],
    ['香辣鸡腿堡', 'dish-1', 'name'],
    ['三十八块', 'dish-1', 'number'],
    ['二十六块九', 'pkg-1', 'number'],
  ])
  // With room for more, the review phrase comes too.
  assert.deepEqual(highlightFacts(text, facts, 6).map((h) => text.slice(h.start, h.end)).at(-1), '一股霉味')
})

test('nothing is marked that no cited record says', () => {
  assert.deepEqual(highlightFacts('人均才九十九，我们真的特别好吃', facts), [])
  assert.deepEqual(highlightFacts('人均三十三', []), [])
})

test('the caption splits each fact where the voice has reached', () => {
  const text = '人均三十三，快来'
  const marks = highlightFacts(text, facts)
  assert.deepEqual(captionPieces(text, marks, 3), [
    { text: '人均三', spoken: true, factId: 'shop-1', last: false },
    { text: '十三', spoken: false, factId: 'shop-1', last: true },
    { text: '，快来', spoken: false },
  ])
  assert.equal(captionPieces(text, marks, text.length).map((piece) => piece.text).join(''), text)
})
