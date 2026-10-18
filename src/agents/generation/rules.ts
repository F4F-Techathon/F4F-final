// Transparent keyword rules for each generation step, ported from agent-studio/server/agents.py.
// They answer the same questions as Jev when Jev is unavailable, labelled source='rules'.
import { PALETTE } from './palette.ts'
import { ACCENT_KEYS, BUILDS, ENERGY, HAIRS, PERSONALITY, STYLE, type Personality } from './vocabulary.ts'
import type { AnswerLike, Answers } from './types.ts'

export function one(choice: string): AnswerLike {
  return { type: 'choice', choice, probabilities: { [choice]: 1 }, confidence: 1 }
}

const count = (text: string, pattern: RegExp) => (text.match(pattern) || []).length
const has = (text: string, pattern: RegExp) => pattern.test(text)
const nth = <T>(list: T[], seed: bigint) => list[Number(seed % BigInt(list.length))]!

// Gender, age, build, hair, outfit, hat, personality, accessories and (without logo colors) palette.
export function lookRules(blob: string, seed: bigint, withPalette: boolean): Answers {
  const t = blob
  const female = count(t, /老板娘|阿姨|姐|妹|婆|奶奶|女士|小姐|妈|姑|嫂/g)
  const male = count(t, /叔|哥|爷|伯|师傅|先生|老爹|大哥|爸|兄弟/g)
  const gender = female > male ? 'female' : male > female ? 'male' : seed % 2n ? 'female' : 'male'
  const age = has(t, /老字号|祖传|百年|传承|几十年|阿婆|老爷子|奶奶|爷爷|婆婆/) ? 'old' : has(t, /网红|新派|创意|打卡|年轻|小哥|小妹|潮/) ? 'young' : 'middle'
  const outfit = has(t, /法|意|西餐|牛排|日料|寿司|鮨|精致|fine/) ? 'chef'
    : has(t, /粤|茶楼|早茶|老字号|传统|宫廷/) ? 'tang'
    : has(t, /川|湘|火锅|烧烤|东北|江湖|麻辣|串/) ? 'jacket'
    : has(t, /咖啡|甜品|简餐|快餐|面包|奶茶|轻食|汉堡/) ? 'shirt'
    : nth(['jacket', 'tang', 'shirt'], seed)
  const hat = outfit === 'chef' && has(t, /法|西餐|牛排|意/) ? 'toque' : has(t, /日料|拉面|寿司|大排档|烧烤|鮨/) ? 'bandana' : has(t, /面点|包子|饺子|面馆/) ? 'cap' : 'none'
  const personality = age === 'young' && gender === 'female' ? 'cute' : outfit === 'chef' ? 'refined' : has(t, /川|湘|麻辣|火锅/) ? 'fiery'
    : has(t, /粤|茶|汤/) ? 'calm' : has(t, /实惠|量大|便宜|家常/) ? 'honest' : nth(Object.keys(PERSONALITY), seed)
  const answers: Answers = {
    gender: one(gender), age: one(age), build: one(Object.keys(BUILDS)[Number((seed >> 3n) % 3n)]!),
    hair_female: one(Object.keys(HAIRS.female)[Number((seed >> 5n) % 4n)]!), hair_male: one(Object.keys(HAIRS.male)[Number((seed >> 5n) % 4n)]!),
    outfit: one(outfit), hat: one(hat), personality: one(personality),
    glasses: { type: 'noul', noul: has(t, /文艺|书|咖啡|精打细算/) ? .7 : .1 },
    mustache: { type: 'noul', noul: outfit === 'chef' || age === 'old' ? .7 : .15 },
    earrings: { type: 'noul', noul: ['fiery', 'cute', 'refined'].includes(personality) ? .6 : .2 },
  }
  if (withPalette) {
    const palette = has(t, /川|湘|火锅|麻辣|红/) ? 'red' : has(t, /粤|茶|绿/) ? 'jade' : has(t, /日料|寿司|鮨/) ? 'navy' : has(t, /法|红酒/) ? 'plum'
      : has(t, /意|素|轻食/) ? 'olive' : has(t, /东北|烧烤|炸/) ? 'orange' : nth(PALETTE, seed).id
    answers.palette = one(palette)
  }
  return answers
}

// The language whose region keywords appear most; ties go to the earlier language, else 普通话.
export function accentRules(blob: string): Answers {
  let best = 'zh', bestScore = 0
  for (const [id, pattern] of Object.entries(ACCENT_KEYS)) {
    const score = count(blob, pattern)
    if (score > bestScore) { best = id; bestScore = score }
  }
  return { accent: one(best) }
}

// A personality's film-style signature and speaking energy.
export function assetRules(personality: Personality): Answers {
  const [expr, punch, gesture, act, reaction] = STYLE[personality]
  return {
    expr: one(expr), punch: one(punch), gesture: one(gesture), act: one(act), reaction: one(reaction),
    energy: { type: 'score', score: ENERGY[personality] },
  }
}
