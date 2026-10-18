import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildShops, parseCsv } from './import-dianping.mjs'

const csv = (head, rows) => [head.join(','), ...rows.map((row) => row.map((cell) => /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell).join(','))].join('\n')
const SHOP_HEAD = ['shop_uuid', 'shop_id', 'shop_name', 'city', 'district', 'region', 'category', 'address', 'score', 'avg_price', 'price_text', 'lng', 'lat', 'phone', 'business_time']
const REVIEW_HEAD = ['review_id', 'shop_uuid', 'nickname', 'time', 'star', 'content', 'likes', 'replies', 'image_urls', 'video_urls', 'image_count', 'video_count']
const IMG = 'https://qcloud.dpfile.com/pc/abc.webp'

function tables() {
  return {
    shops: parseCsv(csv(SHOP_HEAD, [
      ['shopA', '1', '麦当劳', '上海', '浦东新区', '张江商圈', '西式快餐', '张江镇张江中科路820号', '口味3.9 环境4.0 服务3.8', '33', '¥33/人', '121.6', '31.18', '', '周一至周五\n07:00-23:00\n\n周六,周日\n08:00-22:00'],
      ['shopB', '2', '麦当劳', '上海', '浦东新区', '张江商圈', '西式快餐', '中国(上海)自由贸易试验区张衡路666弄', '口味4.0 环境4.0 服务4.0', '0', '', '121.61', '31.17', '5000', '周一至周日\n07:00-24:00'],
      ['bad id!', '3', '坏数据', '上海', '浦东新区', '张江商圈', '面馆', '海科路1号', '', '20', '', '121.6', '31.18', '', ''],
      ['shopC', '4', '没有坐标', '上海', '浦东新区', '张江商圈', '面馆', '海科路2号', '', '20', '', '', '', '', ''],
    ])),
    dishes: parseCsv(csv(['shop_uuid', 'shop_id', 'dish_id', 'dish_name', 'price', 'recommend_count', 'description', 'image_url'], [
      ['shopA', '1', 'd1', '薯条', '', '12', '外酥里嫩', IMG],
      ['shopA', '1', 'd2', '巨无霸', '25', '80', '经典汉堡', 'javascript:alert(1)'],
    ])),
    meals: parseCsv(csv(['shop_uuid', 'classification', 'meal_id', 'meal_name', 'price', 'value', 'discount', 'solds', 'meal_type', 'deal_jump_url'], [
      ['shopA', '', 'm1', '单人套餐', '29', '45', '6.4折', '半年售 300+', '1', '/x'],
      ['shopA', '', 'm2', '双人套餐', '59', '90', '6.6折', '半年售 1万+', '1', '/y'],
    ])),
    vouchers: parseCsv(csv(['shop_uuid', 'coupon_id', 'coupon_name', 'price', 'value', 'discount', 'reduce', 'solds'], [['shopB', 'v1', '50元代金券', '44', '50', '8.8折', '3', '半年售 1万+']])),
    reviews: parseCsv(csv(REVIEW_HEAD, [
      ['r1', 'shopA', '闻远', '20小时前', '5.0', '好', '', '', '', '', '0', '0'],
      ['r2', 'shopA', '677爱吃吃', '9月18日', '4.5', '[米饭]口味：薯条很香，环境安静，适合一个人吃，"值得"再来', '6', '1', `${IMG}; http://evil.example.com/x.webp; https://p0.meituan.net/a.webp`, '', '3', '0'],
    ])),
    complaints: parseCsv(csv(REVIEW_HEAD, [['c1', 'shopA', '屁话小橘', '2025年10月25日', '1.0', '排队太久，人太多了，很吵', '2', '1', '', '', '0', '0']])),
  }
}

test('CSV fields may hold commas, quotes and line breaks', () => {
  const rows = parseCsv('a,b,c\r\n"1,2","say ""hi""","line\nbreak"\n\n3,,4\n')
  assert.deepEqual(rows, [{ a: '1,2', b: 'say "hi"', c: 'line\nbreak' }, { a: '3', b: '', c: '4' }])
})

test('the import keeps shops with an id and a position, and tells branches apart by their street', () => {
  const { bundled, details } = buildShops(tables())
  assert.deepEqual(bundled.map((shop) => [shop.id, shop.name]), [['shopA', '麦当劳（中科路）'], ['shopB', '麦当劳（张衡路）']])
  assert.equal(details.length, 2)
  const [a, b] = bundled
  assert.deepEqual(a.scores, { taste: 3.9, env: 4, service: 3.8 })
  assert.equal(a.hours, '周一至周五 07:00-23:00；周六、周日 08:00-22:00')
  assert.equal(b.avgPrice, null)
  assert.equal(a.phone, null)
  assert.deepEqual(b.vouchers.map((v) => v.name), ['50元代金券'])
})

test('dishes and deals are ranked, only Dianping and Meituan https images survive, reviewers stay anonymous', () => {
  const [a] = buildShops(tables()).bundled
  assert.deepEqual(a.dishes.map((dish) => [dish.name, dish.image]), [['巨无霸', null], ['薯条', IMG]])
  assert.deepEqual(a.meals.map((meal) => meal.name), ['双人套餐', '单人套餐'])
  // The useful review (words, photos, likes) comes first; the emoji code is gone; the http and foreign URLs are dropped.
  const [best, short] = a.reviews
  assert.equal(best.id, 'r2')
  assert.equal(best.user, '6**')
  assert.equal(best.text.startsWith('口味：薯条很香'), true)
  assert.deepEqual(best.images, [IMG, 'https://p0.meituan.net/a.webp'])
  assert.equal(short.user, '闻**')
  assert.deepEqual(a.complaints.map((c) => [c.id, c.user]), [['c1', '屁**']])
  assert.deepEqual(a.counts, { dishes: 2, meals: 2, vouchers: 0, reviews: 2, complaints: 1 })
})

test('each review photo is kept once: the thumbnail copy from the crawl is dropped', () => {
  const t = tables()
  const original = 'https://qcloud.dpfile.com/pc/srxajktmq_73Qtpcf37puoNKgPYuNxdHoUrkss9P4seu05_big.webp'
  const thumb = 'https://qcloud.dpfile.com/pc/srxajktmq_73Qtpcf37puoNKgPYuNxdHoUrkss9P4sdIfSk_small.webp'
  const other = 'https://qcloud.dpfile.com/pc/qKHlneHrfO3zmRC2yfDuoeN26Sqb_r8t-FoUcLeh48z3k_big.webp'
  const otherThumb = 'https://qcloud.dpfile.com/pc/qKHlneHrfO3zmRC2yfDuoeN26Sqb_r8t-FoUcLeh48yGHA_small.webp'
  const cover = 'https://p0.meituan.net/coverpic/55e5b3a3f58a4c49e1d5496a52da753f150218.jpg%40400w_400h_1e_1l.webp'
  t.reviews[0].image_urls = [cover, original, thumb, other, otherThumb].join('; ')
  const [a] = buildShops(t).details
  assert.deepEqual(a.reviews.find((r) => r.id === 'r1').images, [cover, original, other])
})

test('review signals count who eats here and how it feels', () => {
  const [a] = buildShops(tables()).bundled
  assert.equal(a.signals.quiet, 1)
  assert.equal(a.signals.solo, 1)
  assert.equal(a.signals.noisy, 1)
  assert.equal(a.signals.spicy, 0)
})
