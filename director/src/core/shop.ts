// Shop info as people type it — 「键：值」 lines or free text — into the generator's ShopInfo.
// Ported from agent-studio/server/agents.py parse_shop; scripts/director.test.mjs checks it against the
// Python original (scripts/fixtures/parse-shop-golden.json). Relative imports: the tests load it without Vite.
import type { ShopInfo } from '../../../src/agents/generation/shop.ts'

type Field = 'name' | 'cuisine' | 'price' | 'distance' | 'dishes' | 'selling' | 'owner' | 'address' | 'desc'
const FIELDS: [Field, RegExp][] = [
  ['name', /^(?:店名|名称|餐厅名?|店铺|门店)$/], ['cuisine', /^(?:菜系|品类|类型|类别)$/], ['price', /^(?:人均|价格|客单价|消费)$/],
  ['distance', /^(?:距离)$/], ['dishes', /^(?:招牌菜?|特色菜|推荐菜|必点|主打)$/], ['selling', /^(?:卖点|亮点|特色|优势|口号)$/],
  ['owner', /^(?:店主|老板娘|老板|主厨|厨师长|掌柜|负责人)$/], ['address', /^(?:地址|位置)$/], ['desc', /^(?:简介|介绍|描述|故事)$/],
]

const chars = (text: string) => Array.from(text).length

// Python's round(x, 1): the double's exact value, rounded half to even.
function round1(x: number) {
  const [whole = '0', frac = ''] = Math.abs(x).toFixed(60).split('.')
  let tenths = Number(whole) * 10 + Number(frac[0] ?? 0)
  const half = frac[1] ?? '0', beyond = /[1-9]/.test(frac.slice(2))
  if (half > '5' || (half === '5' && (beyond || tenths % 2 === 1))) tenths += 1
  return (x < 0 ? -tenths : tenths) / 10
}

export function parseShop(text: string): ShopInfo {
  const shop: Record<Field, string> = { name: '', cuisine: '', price: '', distance: '', dishes: '', selling: '', owner: '', address: '', desc: '' }
  const rest: string[] = []
  const lines = (text || '').split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean)
  for (const line of lines) {
    const match = /^\s*([^:：]{1,8})\s*[:：]\s*(.+)$/.exec(line)
    const field = match ? FIELDS.find(([, pattern]) => pattern.test(match[1]!.trim()))?.[0] : undefined
    if (field) shop[field] = (shop[field] ? shop[field] + '；' : '') + match![2]!.trim()
    else rest.push(line)
  }
  if (!shop.name && rest.length) {
    if (chars(rest[0]!) <= 20 && !/[，。,.!！?？]/.test(rest[0]!)) shop.name = rest.shift()!
    else {
      // 「老北京炸酱面馆，百年老字号，…」: the opening clause names the shop
      const head = rest[0]!.split(/[，。,.!！?？；;]/)[0]!.trim()
      if (chars(head) >= 2 && chars(head) <= 14) shop.name = head
    }
  }
  if (rest.length) shop.desc = [...(shop.desc ? [shop.desc] : []), ...rest].join('；')
  const blob = lines.join(' ')
  const price = /(\d+(?:\.\d+)?)/.exec(shop.price) ?? /人均\s*[¥￥]?\s*(\d+(?:\.\d+)?)/.exec(blob) ?? /[¥￥]\s*(\d+)/.exec(blob)
  const km = /(\d+(?:\.\d+)?)\s*(?:km|KM|公里|千米)/.exec(shop.distance || blob)
  const meters = /(\d+)\s*米/.exec(shop.distance || blob)
  return {
    ...shop,
    name: Array.from(shop.name).slice(0, 24).join(''),
    price: price ? Math.trunc(parseFloat(price[1]!)) : null,
    distance: km ? round1(parseFloat(km[1]!)) : meters ? round1(parseInt(meters[1]!, 10) / 1000) : null,
  }
}
