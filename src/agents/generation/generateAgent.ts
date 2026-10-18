// A restaurant host generated from its shop info, ported from agent-studio/server/agents.py.
// Three steps in order, each one Jev request whose state carries the earlier answers:
//   look    gender · age · build · hair · outfit · hat · personality · accessories (· palette)
//   accent  the catalog language the owner speaks, from cuisine and region
//   assets  signature expression / punchline / gesture / act / listener reaction and energy
// Without Jev a step falls back to the keyword rules (source='rules'); a recognisable brand is
// played by its mascot (source='brand') and only its assets step asks Jev. The voice step waits
// for the streaming multi-agent system.
import type { Accessory, Gender, Hair, Hat, KitLook, Outfit } from '../rig/types.ts'
import { matchBrand } from './brands.ts'
import { LANGUAGES, type Language } from './languages.ts'
import { colorName, edge, luma, PALETTE, roundHalfEven, shade } from './palette.ts'
import { accentRules, assetRules, lookRules, one } from './rules.ts'
import { nameSeed } from './sha1.ts'
import { draw, FOREIGN_POOL, HAIR_COLORS, maybe, plausible, seededRandom, SKIN_TONES, SURNAME_POOL, type Random } from './variety.ts'
import { shopBlob, shopState, type ShopInfo } from './shop.ts'
import {
  BODY, BUILDS, FOREIGN_NAMES, HAIR_ZH, HAIRS, HAT_ZH, HATS, OUTFIT_ZH, OUTFITS, PERSONALITY, SKINS, STYLE, SURNAMES,
  type Build, type Personality,
} from './vocabulary.ts'
import {
  GENERATION_STEPS, type AgentContract, type Answers, type BrandRef, type CatalogItem, type GenerationDecision, type GenerationEvent,
  type GenerationQuestions, type JevAsk, type PerformanceCatalogLike,
} from './types.ts'

// 3: the fast-food chains play their own characters, badges carry the shop's cover photo, tall toques only on chefs.
export const GENERATOR_VERSION = 3

type Age = 'young' | 'middle' | 'old'
const TASK = '为一家餐馆设计在「饭店请就位」舞台上替店铺争取顾客的卡通店主（智能体），会和其他几家饭店的店主同台。'
const AGE_OWNER: Record<Age, string> = { young: '二三十岁', middle: '中年', old: '老年' }
const AGE_PERSONA: Record<Age, string> = { young: '二十多岁', middle: '四十岁上下', old: '六十多岁' }
const ACCESSORY_ZH: Record<Accessory, string> = { glasses: '眼镜', mustache: '小胡子', earrings: '耳环', goatee: '山羊胡', bowtie: '领结', clownface: '小丑妆' }

export interface GenerateOptions {
  id: string
  catalog: PerformanceCatalogLike
  languages?: Language[]
  ask?: JevAsk
  signal?: AbortSignal
  /** Draw each part among Jev's plausible answers (seeded by the shop name) so similar shops get different hosts.
   *  Default true; false reproduces agent-studio's generator exactly. */
  variety?: boolean
}

const criterion = (item: CatalogItem) => `${item.zh}：${item.desc}` + (item.use ? ` 适用：${item.use}` : '')
const firstChars = (text: string, n: number) => Array.from(text).slice(0, n).join('')
const keysOf = (record: object) => Object.keys(record)

// The answer to `key`, or the most probable option among `allowed` (Python's pick()).
export function pick(answers: Answers, key: string, allowed: string[], fallback: string) {
  const answer = answers[key] || {}
  let best: string | undefined, bestP = -Infinity
  for (const [option, p] of Object.entries(answer.probabilities || {})) {
    if (allowed.includes(option) && p > bestP) { best = option; bestP = p }
  }
  if (best !== undefined) return best
  return answer.choice && allowed.includes(answer.choice) ? answer.choice : fallback
}

// A step the brand decides by itself (its mascot's look and accent): no Jev request.
function given(key: string, choice: string, why: string): GenerationDecision {
  return { source: 'brand', model: 'brand-ip', ms: 0, answers: { [key]: one(choice) }, questions: [key], why, note: null }
}

function jevUnavailable(error: unknown) {
  const failure = error as { status?: number; name?: string } | null
  return failure?.status === 503 || failure?.name === 'JevUnavailableError'
}

function ownerName(owner: string) {
  const plain = (owner || '').replace(/[（(].*?[)）]/g, '').trim()
  return firstChars(plain ? plain.split(/[，,、；;/ ]/)[0]! : '', 8)
}

// The shop's own owner if named; else a fitting foreign given name, else a surname by seed.
function hostName(shop: ShopInfo, gender: Gender, age: Age, language: Language, seed: bigint, random?: Random) {
  const owner = ownerName(shop.owner)
  if (owner) return owner
  const pool = language.accent ? FOREIGN_POOL[language.accent] : undefined
  if (pool && random) return draw(pool[gender === 'female' ? 0 : 1], random)
  const foreign = language.accent ? FOREIGN_NAMES[language.accent] : undefined
  if (foreign) return foreign[gender === 'female' ? 0 : 1]
  const surname = random ? draw(Array.from(SURNAME_POOL), random) : SURNAMES[Number(seed % BigInt(SURNAMES.length))]!
  if (gender === 'female') return { young: '小' + surname, middle: surname + '姐', old: surname + '婆婆' }[age]
  return { young: '小' + surname, middle: surname + '叔', old: surname + '伯' }[age]
}

export async function* generateAgent(shop: ShopInfo, options: GenerateOptions): AsyncGenerator<GenerationEvent, AgentContract> {
  const { catalog, signal } = options
  const languages = options.languages || LANGUAGES
  const colors = (shop.colors || []).filter((color) => /^#[0-9A-Fa-f]{6}$/.test(color.hex)).slice(0, 4)
  const blob = shopBlob(shop)
  const seed = nameSeed(shop.name)
  const vary = options.variety !== false
  const random = (part: string) => seededRandom(seed, part)
  const state: Record<string, unknown> = { task: TASK, shop: shopState(shop) }
  if (colors.length) state.logo = { colors: colors.map((color) => `${colorName(color.hex)} ${color.hex.toUpperCase()}（占 ${roundHalfEven(color.share * 100)}%）`) }
  const brand = matchBrand(shop)
  if (brand) state.brand = { name: brand.name, mascot: brand.mascot, look: brand.look }
  const brandRef: BrandRef | undefined = brand ? { id: brand.id, name: brand.name, mascot: brand.mascot } : undefined
  yield { type: 'start', id: options.id, steps: [...GENERATION_STEPS], ...(brandRef ? { brand: brandRef } : {}) }

  // Jev first; on failure the step's keyword rules, with the reason kept as a note.
  async function ask(stepState: object, questions: GenerationQuestions, rules: () => Answers): Promise<GenerationDecision> {
    const started = Date.now()
    let note: string | null = null
    if (options.ask) {
      try {
        const response = await options.ask(stepState, questions, { signal })
        return { source: 'jev', model: response.model, ms: response.latencyMs ?? Date.now() - started, answers: response.answers || {}, questions: keysOf(questions), note: null }
      } catch (error) {
        if (signal?.aborted) throw error
        note = jevUnavailable(error) ? '未配置 TYPESAFE_API_KEY，改用规则。' : `Jev 调用失败，改用规则：${String((error as Error)?.message || error).slice(0, 160)}`
      }
    }
    return { source: 'rules', model: 'keyword-rules', ms: Date.now() - started, answers: rules(), questions: keysOf(questions), note }
  }

  // ---- 1 look
  yield { type: 'step', step: 'look', status: 'run' }
  let lookDecision: GenerationDecision, gender: Gender, age: Age, personality: Personality, theme: string, themeSource: string, rig: KitLook
  let hair: Hair | undefined, outfit: Outfit | undefined, hat: Hat | undefined
  const accessories: Accessory[] = []
  if (brand) {
    const human = !!brand.parts
    lookDecision = given('brand', brand.id, human ? `识别到品牌「${brand.name}」：由它的角色「${brand.mascot}」出镜，穿品牌的行头` : `识别到品牌「${brand.name}」：由它的形象「${brand.mascot}」出镜，不套用人形模板`)
    gender = brand.gender
    age = brand.parts?.age || 'young'
    personality = brand.personality as Personality
    theme = brand.theme
    themeSource = `品牌色 · ${brand.color}`
    rig = { body: brand.body, brand: brand.id, gender, theme, badgeText: firstChars(shop.name, 1), accessories: [], ...(brand.parts || {}) }
  } else {
    const questions: GenerationQuestions = {
      gender: { type: 'choice', instructions: '根据 `shop`（店主称呼、店名、简介里的线索），这家店出镜推销的店主是男是女？没有明显线索时按店铺气质判断。',
        criteria: { female: '女性：老板娘、阿姨、姐、妹、婆婆、女主厨', male: '男性：老板、师傅、叔、哥、大爷、男主厨' } },
      age: { type: 'choice', instructions: '店主大概多大年纪？',
        criteria: { young: '20–30 岁：新派、网红、年轻人创业的小店', middle: '35–50 岁：经营多年的老板/老板娘', old: '55 岁以上：老字号、祖传手艺、几十年的老店' } },
      build: { type: 'choice', instructions: '这位卡通店主的身材？', criteria: BUILDS },
      hair_female: { type: 'choice', instructions: '如果店主是女性，最适合她的发型？', criteria: HAIRS.female as Record<string, string> },
      hair_male: { type: 'choice', instructions: '如果店主是男性，最适合他的发型？', criteria: HAIRS.male as Record<string, string> },
      outfit: { type: 'choice', instructions: '店主的服装？看菜系和店铺档次。', criteria: OUTFITS },
      hat: { type: 'choice', instructions: '店主戴什么帽子？', criteria: HATS },
      personality: { type: 'choice', instructions: '在直播里推销时，店主是什么性格？参考 `shop` 的卖点、店名和语气。', criteria: PERSONALITY },
      glasses: { type: 'noul', instructions: '店主戴眼镜吗？（只有斯文、文艺、精打细算或老学究的形象才戴）' },
      mustache: { type: 'noul', instructions: '如果店主是男性，他留小胡子吗？（法式大厨、老师傅、江湖气的老板才留）' },
      earrings: { type: 'noul', instructions: '如果店主是女性，她戴耳环吗？（时髦、精致或热情的老板娘才戴）' },
    }
    if (!colors.length) {
      questions.palette = { type: 'choice', instructions: '店主服装和胸牌的主题色？要和菜系、店名的气质相配。', criteria: Object.fromEntries(PALETTE.map((p) => [p.id, p.zh])) }
    }
    lookDecision = await ask(state, questions, () => lookRules(blob, seed, !colors.length))
    const answers = lookDecision.answers
    // With variety, each part is drawn among Jev's plausible answers instead of always its favourite (variety.ts).
    // A shop that names its owner (老板娘, 叔) leaves Jev sure of the gender, so only unclear shops change.
    const choose = <T extends string>(key: string, allowed: T[], chosen: T) => (vary ? plausible(answers, key, allowed, chosen, random(key)) : chosen)
    const genders: Gender[] = ['female', 'male']
    gender = choose('gender', genders, pick(answers, 'gender', genders, 'female') as Gender)
    const ages: Age[] = ['young', 'middle', 'old']
    age = choose('age', ages, pick(answers, 'age', ages, 'middle') as Age)
    const builds = keysOf(BUILDS) as Build[]
    const build = choose('build', builds, pick(answers, 'build', builds, 'regular') as Build)
    const hairs = keysOf(HAIRS[gender]) as Hair[]
    hair = choose('hair_' + gender, hairs, pick(answers, 'hair_' + gender, hairs, hairs[0]!) as Hair)
    const outfits = keysOf(OUTFITS) as Outfit[]
    outfit = choose('outfit', outfits, pick(answers, 'outfit', outfits, 'jacket') as Outfit)
    const hats = keysOf(HATS) as Hat[]
    hat = choose('hat', hats, pick(answers, 'hat', hats, 'none') as Hat)
    // The tall toque belongs with the chef's whites: anyone else takes Jev's next likely hat, or none.
    if (vary && hat === 'toque' && outfit !== 'chef') hat = choose('hat', hats.filter((item) => item !== 'toque'), pick(answers, 'hat', hats.filter((item) => item !== 'toque'), 'none') as Hat)
    personality = pick(answers, 'personality', keysOf(PERSONALITY), 'fiery') as Personality
    const noul = (key: string) => Number(answers[key]?.noul || 0)
    const wears = (key: string) => (vary ? maybe(noul(key), random(key)) : noul(key) >= .5)
    if (wears('glasses')) accessories.push('glasses')
    if (gender === 'male' && wears('mustache')) accessories.push('mustache')
    if (gender === 'female' && wears('earrings')) accessories.push('earrings')
    if (colors.length) {
      theme = colors[0]!.hex.toUpperCase()
      themeSource = `logo 主色 · ${colorName(theme)}`
    } else {
      const id = pick(answers, 'palette', PALETTE.map((p) => p.id), 'red')
      const color = PALETTE.find((p) => p.id === id)!
      theme = color.hex
      themeSource = color.zh
    }
    if (luma(theme) > .86) theme = shade(theme, -.55) // a white logo would vanish on a white chef coat
    else if (luma(theme) < .08) theme = '#3A3540'
    rig = {
      body: BODY[gender][build], gender, age, hair, hairColor: vary ? draw(HAIR_COLORS[age], random('hairColor')) : '#2A1C24', outfit, hat, theme,
      skin: vary ? draw(SKIN_TONES, random('skin')) : SKINS[Number((seed >> 9n) % BigInt(SKINS.length))]!, badgeText: firstChars(shop.name, 1), accessories,
    }
  }
  lookDecision.note = lookDecision.note ?? null
  yield { type: 'step', step: 'look', status: 'done', decision: lookDecision, data: { rig, personality, themeSource, ...(brandRef ? { brand: brandRef } : {}) } }

  // ---- 2 accent
  yield { type: 'step', step: 'accent', status: 'run' }
  const owner: Record<string, string> = brand
    ? { mascot: `${brand.name}的${brand.mascot}`, look: brand.look, gender: gender === 'female' ? '女' : '男', personality: PERSONALITY[personality].split('：')[0]! }
    : { gender: gender === 'female' ? '女' : '男', age: AGE_OWNER[age], personality: PERSONALITY[personality].split('：')[0]!, outfit: OUTFIT_ZH[outfit!] }
  const accentState = { ...state, owner }
  const choices = Object.fromEntries(languages.filter((language) => language.id !== 'fr').map((language) => [language.id, `${language.zh}：${language.region}`]))
  let accentDecision: GenerationDecision, languageId: string
  if (brand && brand.accent in choices) {
    accentDecision = given('accent', brand.accent, `「${brand.name}」的出身`)
    languageId = brand.accent
  } else {
    accentDecision = await ask(accentState, {
      accent: { type: 'choice', criteria: choices, instructions: '这家店的店主在直播里说话带哪种口音？主要看 `shop.cuisine`、店名和招牌菜对应的地区：'
        + '川菜→四川话，粤菜→粤语，湘菜→湖南话，日料→日式口音普通话……外国菜系的店主说带本国口音的中文。没有明显地域特征时选普通话。' },
    }, () => accentRules(blob))
    languageId = pick(accentDecision.answers, 'accent', keysOf(choices), 'zh')
  }
  const language = languages.find((item) => item.id === languageId)!
  yield { type: 'step', step: 'accent', status: 'done', decision: accentDecision, data: { language: languageId, zh: language.zh, region: language.region } }

  // ---- 3 assets
  yield { type: 'step', step: 'assets', status: 'run' }
  const assetState = { ...accentState, owner: { ...owner, accent: language.zh } }
  const allExpressions = Object.fromEntries(catalog.expressions.map((item) => [item.id, criterion(item)]))
  const expressions = Object.fromEntries(catalog.expressions.filter((item) => item.id !== 'idle' && item.id !== 'listen').map((item) => [item.id, criterion(item)]))
  const gestures = Object.fromEntries(catalog.gestures.filter((item) => item.id !== 'rest').map((item) => [item.id, criterion(item)]))
  const acts = Object.fromEntries(catalog.acts.map((item) => [item.id, criterion(item)]))
  const reactionCriteria = catalog.reactionCriteria || {}
  const reactions = Object.fromEntries(catalog.reactions.filter((id) => id !== 'idle').map((id) => [id,
    reactionCriteria[id] ? `${allExpressions[id]!.split('：')[0]}：${reactionCriteria[id]}` : allExpressions[id]!]))
  const assetDecision = await ask(assetState, {
    expr: { type: 'choice', instructions: '按照 `owner.personality`，店主推销自家菜时的招牌表情是哪一个？', criteria: expressions },
    punch: { type: 'choice', instructions: '店主说到得意处（笑点落下）时会切换成哪个表情？', criteria: expressions },
    gesture: { type: 'choice', instructions: '店主的招牌手势？', criteria: gestures },
    act: { type: 'choice', instructions: '店主开口推销时配合的招牌身体动作？', criteria: acts },
    reaction: { type: 'choice', instructions: '台上的对手吹牛或拆台时，店主默认的反应？', criteria: reactions },
    energy: { type: 'score', instructions: '店主说话的能量和语速有多高？', criteria: ['慢条斯理', '平稳', '轻快', '连珠炮'] },
  }, () => assetRules(personality))
  const style = STYLE[personality]
  const answers = assetDecision.answers
  const defaults = {
    expr: pick(answers, 'expr', keysOf(expressions), style[0]), gesture: pick(answers, 'gesture', keysOf(gestures), style[2]),
    act: pick(answers, 'act', keysOf(acts), style[3]), reaction: pick(answers, 'reaction', keysOf(reactions), style[4]),
  }
  const punch = pick(answers, 'punch', keysOf(expressions), style[1])
  const energy = answers.energy?.score != null ? Number(answers.energy.score) : 1.5
  yield { type: 'step', step: 'assets', status: 'done', decision: assetDecision, data: { defaults: { ...defaults, punch }, energy: Math.round(energy * 100) / 100 } }

  // ---- the contract
  const name = brand ? brand.mascot : hostName(shop, gender, age, language, seed, vary ? random('name') : undefined)
  const role = outfit === 'chef' ? '主厨' : gender === 'female' ? '老板娘' : '老板'
  const sell = firstChars(shop.selling || shop.dishes || shop.desc, 60).replace(/[，。,.；; ]+$/, '')
  const cuisine = shop.cuisine ? shop.cuisine.split(/\s*[/、，,|｜]\s*/)[0]! : brand ? brand.cuisine : languageId !== 'zh' ? language.region.split('、')[0]! : '家常菜'
  let persona = brand ? brand.persona : `${cuisine}店${role}，${AGE_PERSONA[age]}。${PERSONALITY[personality]}。`
  if (sell && !persona.includes(sell)) persona += `卖点：${sell}。`
  const plate = [cuisine, shop.price ? `¥${shop.price}/人` : '', shop.distance ? `${shop.distance} km` : ''].filter(Boolean).join(' · ')
  const dish = shop.dishes ? shop.dishes.split(/[，,、；;/ ]/)[0]! : ''
  let greeting: string, lookText: string, palette: string[], keywords: string[]
  if (brand) {
    // The brand's own line first; the shop's dish only when that line doesn't already name it.
    const more = [dish && !brand.hello.includes(dish) ? `招牌${dish}` : '', shop.price ? `人均才${shop.price}` : ''].filter(Boolean).join('，')
    greeting = brand.hello + (more ? more + '，快来尝尝！' : '')
    lookText = brand.parts ? `${brand.look}；品牌色 ${brand.color} ${theme}；胸牌印店铺头图` : `${brand.look}；品牌色 ${brand.color} ${theme}（${brand.name}的形象，不套用人形模板）`
    palette = [theme, shade(theme, -.2), '#FFFFFF', '#1A1A1A']
    keywords = [name, shop.name, brand.name, ...brand.keywords, cuisine, dish]
  } else {
    const hook = [dish ? `招牌${dish}` : '', shop.price ? `人均才${shop.price}` : ''].filter(Boolean).join('，')
    greeting = `大家好，我是${shop.name}的${name}！` + (hook ? hook + '，快来尝尝！' : '欢迎来尝尝！')
    lookText = [HAIR_ZH[hair!], OUTFIT_ZH[outfit!], HAT_ZH[hat!], ...accessories.map((item) => ACCESSORY_ZH[item])].filter(Boolean).join('、')
      + `；胸牌印店铺 logo；主题色 ${colorName(theme)} ${theme}（${themeSource}）`
    palette = [theme, shade(theme, -.2), rig.skin!, rig.hairColor!]
    keywords = [name, shop.name, cuisine, dish]
  }
  const zhOf = (items: readonly CatalogItem[], id: string) => items.find((item) => item.id === id)?.zh || id
  const agent: AgentContract = {
    id: options.id, kind: 'agent', name, fullName: `${name} · ${shop.name}`, restaurant: shop.name, plate, cuisine, price: shop.price,
    edge: edge(theme), language: languageId, persona, look: lookText,
    signature: `${zhOf(catalog.expressions, defaults.expr)}开场，${zhOf(catalog.gestures, defaults.gesture)}，说到得意处${zhOf(catalog.expressions, punch)}。`,
    palette, defaults, punch, personality, energy, keywords: [...new Set(keywords.filter(Boolean))], logo: shop.logo || null, rig, greeting, shop,
    decisions: { look: lookDecision, accent: accentDecision, assets: assetDecision },
    ...(brandRef ? { brand: brandRef } : {}),
    voice: null, generator: GENERATOR_VERSION, created: new Date().toISOString(),
  }
  yield { type: 'done', agent }
  return agent
}

// Runs a generation to its contract, reporting each event on the way.
export async function runGeneration(shop: ShopInfo, options: GenerateOptions, onEvent?: (event: GenerationEvent) => void) {
  const steps = generateAgent(shop, options)
  for (;;) {
    const next = await steps.next()
    if (next.done) return next.value
    onEvent?.(next.value)
  }
}
