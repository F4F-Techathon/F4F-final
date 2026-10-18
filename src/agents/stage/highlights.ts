// The key facts in a spoken line, each tied to the record it came from, so the caption can mark them and point at
// their source: prices, scores and discounts (written 「人均二十三」 in a line, 「参考人均23元」 in the record), dish and
// set-meal names, and phrases taken from a review. Only what a cited record really says is marked: a number or a
// phrase no cited record contains stays plain text. Pure, so the tests and the debate page share it.

/** A record the line cites, as its evidence card shows it. */
export interface FactLike { id: string; kind: 'business' | 'review' | 'summary'; title: string; text?: string }

/** Characters start..end of the line say what the record `factId` says. */
export interface Highlight { start: number; end: number; factId: string; kind: 'number' | 'name' | 'quote' }

type Unit = 'money' | 'discount' | 'score' | 'time' | 'count' | 'percent'
interface NumberHit { start: number; end: number; value: number; unit: Unit }

const DIGITS: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
const POWERS: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 }

/** 二十三 → 23, 一百零八 → 108, 八百八 → 880, 三万五 → 35000, 四点五 → 4.5; null for anything else. */
export function zhNumber(text: string): number | null {
  const [whole = '', fraction] = text.split('点')
  if (!whole || /[^零〇一二两三四五六七八九十百千万]/.test(whole)) return null
  let total = 0, section = 0, digit: number | null = null, previous = ''
  for (const char of whole) {
    if (char in DIGITS) {
      digit = digit !== null && previous in DIGITS ? digit * 10 + DIGITS[char]! : DIGITS[char]!
    } else {
      const power = POWERS[char]!
      if (power === 10000) { total += (section + (digit ?? 0)) * power; section = 0 }
      else section += (digit ?? (power === 10 ? 1 : 0)) * power
      digit = null
    }
    previous = char
  }
  // Colloquial 八百八, 一千二, 三万五: a last digit straight after a power counts in the next place down.
  if (digit !== null) section += previous in DIGITS && whole.length > 1 && whole.at(-2)! in POWERS && POWERS[whole.at(-2)!]! >= 100
    ? digit * POWERS[whole.at(-2)!]! / 10 : digit
  let value = total + section
  if (fraction !== undefined) {
    if (!fraction || /[^零〇一二三四五六七八九]/.test(fraction)) return null
    value += Number('0.' + Array.from(fraction).map((char) => DIGITS[char]).join(''))
  }
  return value
}

const ZH = '[零〇一二两三四五六七八九十百千万]'
const NUMBER = new RegExp(`(?<money>[¥￥])?\\s*(?<n>\\d+(?:\\.\\d+)?|${ZH}+(?:点[零〇一二三四五六七八九]+)?)(?<unit>块钱|块|元|折|分钟|分|颗星|星|道菜|道|款|份|小时|个钟|点|人|位|%|％)?`, 'g')
// Words before a number that make it a price even without 元 (「人均二十三」「低至十九块九」).
const MONEY_LEAD = /(人均|均价|才|只要|只卖|低至|不到|团购|套餐|售价|原价|菜价|单价|一份|一位)\s*$/
const SCORE_LEAD = /(评分|口味|环境|服务|打了?)\s*$/
const UNITS: Record<string, Unit> = {
  块钱: 'money', 块: 'money', 元: 'money', 折: 'discount', 分钟: 'time', 小时: 'time', 个钟: 'time', 点: 'time',
  分: 'score', 颗星: 'score', 星: 'score', 道菜: 'count', 道: 'count', 款: 'count', 份: 'count', 人: 'count', 位: 'count', '%': 'percent', '％': 'percent',
}

/** Every number in a text that says what it counts: by its unit, a ¥ sign, or a word such as 人均 before it. */
export function numbersIn(text: string): NumberHit[] {
  const hits: NumberHit[] = []
  for (const match of text.matchAll(NUMBER)) {
    const { money, n = '', unit } = match.groups as Record<string, string | undefined>
    const arabic = /^\d/.test(n)
    let value = arabic ? Number(n) : zhNumber(n)
    if (value === null || !Number.isFinite(value)) continue
    let start = match.index!, end = start + match[0].length
    const before = text.slice(Math.max(0, start - 6), start)
    let kind: Unit | undefined = unit ? UNITS[unit] : money ? 'money' : undefined
    if (!kind && MONEY_LEAD.test(before)) kind = 'money'
    if (!kind && SCORE_LEAD.test(before) && value <= 5) kind = 'score'
    // A bare Chinese numeral is a word (一起, 十足), not a fact; so is an arabic one with nothing to say what it counts.
    if (!kind) continue
    // 三块五, 十九块九: a digit straight after 块 is the jiao, unless it starts a count (三块一份).
    const jiao = unit === '块' ? text.slice(end, end + 2) : ''
    if (/^[一二三四五六七八九][^份个位人杯碗斤块元毛]?$/.test(jiao) && !/^.[零〇一二两三四五六七八九十百千万]/.test(jiao)) { value += DIGITS[jiao[0]!]! / 10; end += 1 }
    // 九五折, 八八折: two digits before 折 are a discount of 9.5, 8.8.
    if (kind === 'discount' && !arabic && value >= 10 && value < 100) value /= 10
    // 十分好吃 is "very tasty", not a score of ten.
    if (kind === 'score' && !arabic && !/点/.test(n) && unit === '分' && value >= 10) continue
    // 一份, 一位 are words; a count is a fact from two up.
    if (kind === 'count' && !arabic && value < 2) continue
    const lead = before.match(/(?:(?:参考)?人均|均价|售价|团购|评分)?(?:低至|只要|只卖|才|仅)?\s*$/)
    if (lead) start -= lead[0].length
    hits.push({ start, end, value, unit: kind })
  }
  return hits
}

const plain = (text: string) => text.replace(/\[[^\]\s]{1,6}\]/g, '')
// The name a dish, set meal or voucher record leads with: 「香辣鸡腿堡，资料菜价38元」 → 香辣鸡腿堡.
function recordName(fact: FactLike) {
  if (fact.kind !== 'business' || !/推荐菜|到店套餐|代金券/.test(fact.title)) return ''
  return plain(fact.text || '').split(/[，,；;]/)[0]!.replace(/【[^】]*】|（[^）]*）|\([^)]*\)/g, '').trim()
}

// The longest run of at least `min` CJK characters (letters and digits too) that both texts share.
function shared(text: string, other: string, min: number): { start: number; length: number } | null {
  let best: { start: number; length: number } | null = null
  const word = /[一-鿿A-Za-z0-9]/
  for (let i = 0; i < text.length; i++) {
    if (!word.test(text[i]!)) continue
    for (let length = Math.max(min, (best?.length ?? 0) + 1); i + length <= text.length; length++) {
      const piece = text.slice(i, i + length)
      if (!word.test(piece.at(-1)!) || !other.includes(piece)) break
      best = { start: i, length }
    }
  }
  return best
}

// Common filler that a line and a review may share without the line quoting it.
const FILLER = /^(我们|你们|他们|这里|那里|这家|那家|真的|就是|还是|但是|可以|一个|一下|没有|不是|就是|特别|非常|感觉)+$/

/** The key facts of a line, at most `limit`, non-overlapping and in reading order. */
export function highlightFacts(text: string, facts: FactLike[], limit = 4): Highlight[] {
  const found: (Highlight & { weight: number })[] = []
  const factNumbers = facts.map((fact) => ({ fact, numbers: numbersIn(plain(fact.text || '')) }))
  for (const hit of numbersIn(text)) {
    // The record that states this very amount, a price for a price; 人均 points at the shop's own record first.
    const owners = factNumbers.filter(({ numbers }) => numbers.some((n) => Math.abs(n.value - hit.value) < 0.01 && (n.unit === hit.unit || (hit.unit === 'money' && n.unit === 'money'))))
    const owner = owners.find(({ fact }) => /人均/.test(text.slice(hit.start, hit.end)) && /人均/.test(fact.text || '')) || owners[0]
    if (owner) found.push({ start: hit.start, end: hit.end, factId: owner.fact.id, kind: 'number', weight: 3 })
  }
  for (const fact of facts) {
    const name = recordName(fact)
    if (name.length >= 2) {
      const at = text.indexOf(name)
      const match = at >= 0 ? { start: at, length: name.length } : shared(text, name, 3)
      if (match) found.push({ start: match.start, end: match.start + match.length, factId: fact.id, kind: 'name', weight: 2 })
    }
    if (fact.kind === 'review' && fact.text) {
      const match = shared(text, plain(fact.text), 4)
      if (match && !FILLER.test(text.slice(match.start, match.start + match.length)))
        found.push({ start: match.start, end: match.start + match.length, factId: fact.id, kind: 'quote', weight: 1 })
    }
  }
  // Numbers first, then names, then the longest quotes; whatever overlaps a kept span gives way.
  found.sort((a, b) => b.weight - a.weight || (b.end - b.start) - (a.end - a.start) || a.start - b.start)
  const kept: Highlight[] = []
  for (const { weight: _weight, ...item } of found) {
    if (kept.length >= limit) break
    if (kept.some((other) => item.start < other.end && other.start < item.end)) continue
    kept.push(item)
  }
  return kept.sort((a, b) => a.start - b.start)
}

/** A caption in pieces: plain text and marked facts, each split where the voice has reached (`visible`). */
export interface CaptionPiece { text: string; spoken: boolean; factId?: string; last?: boolean }
export function captionPieces(text: string, highlights: Highlight[], visible: number): CaptionPiece[] {
  const pieces: CaptionPiece[] = []
  const push = (from: number, to: number, factId?: string) => {
    if (to <= from) return
    const cut = Math.max(from, Math.min(to, visible))
    if (cut > from) pieces.push({ text: text.slice(from, cut), spoken: true, ...(factId ? { factId, last: cut === to } : {}) })
    if (to > cut) pieces.push({ text: text.slice(cut, to), spoken: false, ...(factId ? { factId, last: true } : {}) })
  }
  let at = 0
  for (const item of highlights) {
    push(at, item.start)
    push(item.start, item.end, item.factId)
    at = item.end
  }
  push(at, text.length)
  return pieces
}
