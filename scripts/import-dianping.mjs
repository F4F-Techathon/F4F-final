// Imports crawled Dianping shop data (a folder of six CSV exports) into the app:
//   src/data/dianping/shops.json      every shop with its best dishes, deals and reviews (bundled)
//   public/data/dianping/<shop>.json  everything about one shop, loaded when its page opens
//
//   node scripts/import-dianping.mjs ~/Downloads/已爬数据
//
// The CSVs are third-party data: they are parsed as text only, URLs are kept only when they are https
// images on Dianping/Meituan hosts, reviewer nicknames are masked and Dianping's emoji codes dropped.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const FILES = {
  shops: '商户基础信息.csv', dishes: '推荐菜.csv', meals: '到店套餐.csv', vouchers: '代金券.csv', reviews: '最新评论.csv', complaints: '差评.csv',
}
const IMAGE_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(dpfile\.com|meituan\.net)\//i
const ID = /^[A-Za-z0-9_-]{1,40}$/
// What the app bundles per shop; the shop's own file keeps everything.
const LIMITS = { dishes: 6, meals: 3, reviews: 3, complaints: 2, images: 4, bundledImages: 2, bundledText: 120, fullText: 1200 }

// RFC 4180: quoted fields may hold commas, newlines and doubled quotes.
export function parseCsv(text) {
  const rows = []
  let row = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const [head = [], ...body] = rows.filter((r) => r.some((cell) => cell.trim()))
  return body.map((r) => Object.fromEntries(head.map((key, index) => [key.trim(), (r[index] ?? '').trim()])))
}

const clean = (value) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim()
// Dianping writes its emoji as short bracketed words: 「[米饭]口味：…」.
const prose = (value, max) => {
  const text = clean(value).replace(/\[[^\[\]\n]{1,6}\]/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
const num = (value) => { const n = Number.parseFloat(clean(value)); return Number.isFinite(n) ? n : null }
// The crawl lists every review photo twice, the original (e.g. 1080×1440) and then its thumbnail (500×667):
// two URLs whose file names share a long prefix. Only the first of each such pair is kept.
const SAME_PHOTO = 20
const fileName = (url) => url.split('?')[0].split('/').pop() || ''
function samePhoto(a, b) {
  const x = fileName(a), y = fileName(b)
  let shared = 0
  while (shared < x.length && x[shared] === y[shared]) shared++
  return shared >= SAME_PHOTO
}
const images = (value, max = LIMITS.images) => clean(value).split(/;\s*/).filter((url) => IMAGE_HOSTS.test(url))
  .filter((url, index, all) => !all.slice(0, index).some((earlier) => samePhoto(earlier, url))).slice(0, max)
// Reviewers are private people: only the first character of a nickname stays.
const mask = (nickname) => { const name = clean(nickname); return name ? `${Array.from(name)[0]}**` : '点评用户' }
const count = (sold) => { const m = /([\d.]+)\s*(万)?/.exec(sold || ''); return m ? Number(m[1]) * (m[2] ? 10000 : 1) : 0 }

function scores(text) {
  const pick = (label) => num((new RegExp(`${label}\\s*([\\d.]+)`).exec(text) || [])[1])
  return { taste: pick('口味'), env: pick('环境'), service: pick('服务') }
}

// "周一至周五\n06:00-23:00\n\n周六,周日\n07:00-23:00" → "周一至周五 06:00-23:00；周六、周日 07:00-23:00"
function hours(text) {
  const blocks = clean(text).split(/\n\s*\n/).map((block) => block.split('\n').map((line) => line.trim()).filter(Boolean).join(' ').replace(/,/g, '、'))
  return blocks.filter(Boolean).join('；') || null
}

function review(row, max, pictures = LIMITS.images) {
  return {
    id: clean(row.review_id), user: mask(row.nickname), time: clean(row.time), star: num(row.star),
    text: prose(row.content, max), likes: num(row.likes) || 0, images: images(row.image_urls, pictures),
  }
}

// Useful reviews first: with words worth reading, then with photos, then liked; ties keep the export's order (newest first).
function ranked(rows) {
  return rows
    .map((row, index) => ({ row, index, score: (prose(row.content, 400).length >= 20 ? 4 : 0) + (images(row.image_urls).length ? 2 : 0) + Math.min(2, (num(row.likes) || 0) / 5) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.row)
}

// How many reviews mention each thing; the app turns these into scenes, quietness and spiciness.
const SIGNALS = {
  quiet: /安静|清静|私密|包间|雅致/, noisy: /吵|嘈杂|喧闹|人很多|人太多|太挤|排队/, date: /约会|情侣|女朋友|男朋友|对象|纪念日|浪漫/,
  family: /家人|家庭|孩子|小朋友|宝宝|爸妈|父母|带娃|老人/, friends: /朋友|同事|聚餐|聚会|团建/, solo: /一个人|一人食|独自|单人|工作餐/,
  business: /商务|请客|宴请|接待|客户/, spicy: /(?<!不)辣/, mild: /不辣|微辣|清淡|少辣/,
}
// What the dishes and set meals name, for 「不吃…」 and allergy requests. Inferred from names, never confirmed by the shop.
const ALLERGENS = { 花生: /花生|坚果|腰果|杏仁/, 虾: /虾|蟹|贝|蚝|海鲜/, 鱼: /鱼|三文|金枪|鳕|鲈|鳗/, 乳制品: /奶|芝士|奶酪|乳|黄油|拿铁|冰淇淋/, 小麦: /面|饺|包子|馄饨|饼|馒头|蛋糕|汉堡|三明治|披萨|吐司|意粉/ }
const INGREDIENTS = ['虾', '蟹', '鱼', '贝', '海鲜', '牛肉', '羊肉', '猪肉', '鸡', '鸭', '鹅', '蛋', '牛奶', '奶酪', '芝士', '花生', '坚果', '香菜', '葱', '蒜', '辣椒', '豆腐', '菌', '笋', '面']
function contents(dishRows, mealRows) {
  const text = [...dishRows.map((d) => `${d.dish_name} ${d.description}`), ...mealRows.map((m) => m.meal_name)].join(' ')
  return { allergens: Object.keys(ALLERGENS).filter((name) => ALLERGENS[name].test(text)), ingredients: INGREDIENTS.filter((word) => text.includes(word)) }
}

function signals(rows) {
  return Object.fromEntries(Object.entries(SIGNALS).map(([key, pattern]) => [key, rows.filter((row) => pattern.test(row.content || '')).length]))
}

export function buildShops(tables) {
  const by = (rows) => rows.reduce((map, row) => map.set(row.shop_uuid, [...(map.get(row.shop_uuid) || []), row]), new Map())
  const dishes = by(tables.dishes), meals = by(tables.meals), vouchers = by(tables.vouchers), reviews = by(tables.reviews), complaints = by(tables.complaints)
  const names = tables.shops.reduce((map, row) => map.set(clean(row.shop_name), (map.get(clean(row.shop_name)) || 0) + 1), new Map())
  const bundled = [], details = []
  for (const row of tables.shops) {
    const id = clean(row.shop_uuid), lng = num(row.lng), lat = num(row.lat)
    if (!ID.test(id) || lng == null || lat == null) continue
    const name = clean(row.shop_name)
    // Several branches of one chain: the street tells them apart (the first two-character road after the
    // town or district prefix: 中科路, 张衡路).
    const street = (/(\p{Script=Han}{2}(?:路|街))/u.exec(clean(row.address).replace(/^.*?(?:镇|区)/, '')) || [])[1]
    const label = names.get(name) > 1 && street ? `${name}（${street}）` : name
    const dishRows = [...(dishes.get(id) || [])].sort((a, b) => (num(b.recommend_count) || 0) - (num(a.recommend_count) || 0))
    const mealRows = [...(meals.get(id) || [])].sort((a, b) => count(b.solds) - count(a.solds))
    const dish = (d) => ({ id: clean(d.dish_id), name: clean(d.dish_name), price: num(d.price), recommended: num(d.recommend_count) || 0, desc: prose(d.description, 200), image: images(d.image_url)[0] || null })
    const meal = (m) => ({ id: clean(m.meal_id), name: prose(m.meal_name, 60), price: num(m.price), value: num(m.value), discount: clean(m.discount), sold: clean(m.solds) })
    const voucher = (v) => ({ id: clean(v.coupon_id), name: prose(v.coupon_name, 40), price: num(v.price), value: num(v.value), discount: clean(v.discount), sold: clean(v.solds) })
    const base = {
      id, shopId: clean(row.shop_id), name: label, brand: name, city: clean(row.city), district: clean(row.district), region: clean(row.region),
      category: clean(row.category), address: clean(row.address), scores: scores(row.score), avgPrice: num(row.avg_price) || null,
      lng, lat, phone: clean(row.phone) || null, hours: hours(row.business_time),
    }
    const reviewRows = ranked(reviews.get(id) || []), complaintRows = ranked(complaints.get(id) || [])
    const counts = { dishes: dishRows.length, meals: mealRows.length, vouchers: (vouchers.get(id) || []).length, reviews: reviewRows.length, complaints: complaintRows.length }
    bundled.push({
      ...base, counts, signals: signals([...(reviews.get(id) || []), ...(complaints.get(id) || [])]), ...contents(dishRows, mealRows),
      dishes: dishRows.slice(0, LIMITS.dishes).map(dish), meals: mealRows.slice(0, LIMITS.meals).map(meal), vouchers: (vouchers.get(id) || []).map(voucher),
      reviews: reviewRows.slice(0, LIMITS.reviews).map((r) => review(r, LIMITS.bundledText, LIMITS.bundledImages)),
      complaints: complaintRows.slice(0, LIMITS.complaints).map((r) => review(r, LIMITS.bundledText, LIMITS.bundledImages)),
    })
    details.push({
      ...base, counts, dishes: dishRows.map(dish), meals: mealRows.map(meal), vouchers: (vouchers.get(id) || []).map(voucher),
      // The full lists keep the export's order: newest first.
      reviews: (reviews.get(id) || []).map((r) => review(r, LIMITS.fullText)), complaints: (complaints.get(id) || []).map((r) => review(r, LIMITS.fullText)),
    })
  }
  return { bundled, details }
}

function main() {
  const folder = process.argv[2]
  if (!folder) { console.error('用法：node scripts/import-dianping.mjs <数据文件夹>'); process.exit(1) }
  const tables = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, parseCsv(readFileSync(join(resolve(folder), file), 'utf8').replace(/^﻿/, ''))]))
  const { bundled, details } = buildShops(tables)
  const root = new URL('..', import.meta.url).pathname
  mkdirSync(join(root, 'src/data/dianping'), { recursive: true })
  writeFileSync(join(root, 'src/data/dianping/shops.json'), JSON.stringify({ source: '大众点评', imported: new Date().toISOString().slice(0, 10), shops: bundled }) + '\n')
  const out = join(root, 'public/data/dianping')
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  for (const detail of details) writeFileSync(join(out, `${detail.id}.json`), JSON.stringify(detail) + '\n')
  console.log(`导入 ${bundled.length} 家店：src/data/dianping/shops.json，以及 public/data/dianping/ 下 ${details.length} 份详情`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
