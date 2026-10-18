// Hosts made from similar shops looked alike: Jev's top answer for each part tends to agree, the hair colour
// never changed and accessories needed a confident yes. With variety on, each part is drawn among the answers
// Jev found plausible, weighted by its probabilities and seeded by the shop name, so the same shop always gets
// the same host while two noodle shops get two different ones. The generator's rules alone stay as in
// agent-studio (variety off), which scripts/agents-generation.test.mjs checks against the Python original.
import type { Answers } from './types.ts'

export type Random = () => number

// mulberry32 on the shop's name seed plus a per-part salt, so each part draws independently.
export function seededRandom(seed: bigint, salt: string): Random {
  let state = Number(seed & 0xffffffffn)
  for (const char of salt) state = Math.imul(state ^ char.charCodeAt(0), 0x9e3779b1) >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** One of the options Jev gives at least 5%, drawn with tempered weights (√p): Jev is usually very sure of one
 *  part, and its second choice still fits the shop, so it should come up now and then. */
export function plausible<T extends string>(answers: Answers, key: string, allowed: readonly T[], chosen: T, random: Random): T {
  const p = answers[key]?.probabilities
  if (!p) return chosen
  const options = allowed.filter((id) => (p[id] ?? 0) >= .05)
  if (options.length < 2) return chosen
  const weight = (id: T) => Math.sqrt(p[id]!)
  let roll = random() * options.reduce((sum, id) => sum + weight(id), 0)
  for (const id of options) if ((roll -= weight(id)) < 0) return id
  return options.at(-1)!
}

/** A yes/no part (glasses, moustache, earrings) worn as often as Jev thinks likely, a little more for variety. */
export function maybe(noul: number, random: Random) {
  return random() < Math.min(1, noul * 1.6)
}

// Natural shades for working adults; younger hosts may have dyed hair. Old hosts are drawn grey by the rig.
export const HAIR_COLORS = {
  young: ['#2A1C24', '#4A2E22', '#6B3E26', '#8A5A3B', '#3B2A4A', '#7A3328', '#A8784A'],
  middle: ['#2A1C24', '#3A2620', '#553A2A', '#6B4A33', '#4A4448', '#5C3A3A'],
  old: ['#2A1C24'],
} as const
export const SKIN_TONES = ['#F6CBA9', '#F1C09B', '#F7D0B3', '#EBB892', '#DDA27C', '#C98E6B']
export const SURNAME_POOL = '陈王李张刘杨黄赵周吴林何郭罗梁徐孙马朱胡高宋郑谢韩唐冯董萧程曹袁邓许傅沈曾彭吕苏卢蒋蔡贾丁魏薛叶阎余潘杜戴夏钟汪田任姜范方石姚谭廖邹熊金陆郝孔白崔康毛邱秦江史顾侯邵孟龙万段雷钱汤尹黎易常武乔贺赖龚文'
export const FOREIGN_POOL: Record<string, [readonly string[], readonly string[]]> = {
  ja: [['由美', '美咲', '葵', '结衣', '千夏'], ['健太', '翔太', '大辅', '拓海', '悠真']],
  ko: [['智恩', '秀珍', '敏智', '惠英', '多贤'], ['敏俊', '志勋', '在民', '贤宇', '东旭']],
  en: [['Emma', 'Olivia', 'Grace', 'Lucy', 'Mia'], ['Tom', 'Jack', 'Leo', 'Sam', 'Ben']],
  it: [['Giulia', 'Sofia', 'Chiara', 'Martina', 'Elena'], ['Marco', 'Luca', 'Matteo', 'Paolo', 'Davide']],
  es: [['Lucía', 'Carmen', 'Sofía', 'Elena', 'Marta'], ['Carlos', 'Javier', 'Diego', 'Pablo', 'Miguel']],
  de: [['Anna', 'Lena', 'Mia', 'Clara', 'Greta'], ['Hans', 'Lukas', 'Felix', 'Jonas', 'Max']],
  ru: [['Natasha', 'Olga', 'Irina', 'Anya', 'Katya'], ['Ivan', 'Dmitri', 'Sergei', 'Alexei', 'Pavel']],
  fr: [['Camille', 'Chloé', 'Léa', 'Manon', 'Julie'], ['Louis', 'Hugo', 'Lucas', 'Théo', 'Paul']],
}

export const draw = <T>(items: readonly T[], random: Random) => items[Math.floor(random() * items.length)]!
