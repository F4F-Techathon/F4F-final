// What the asset library shows for each kind of character, and what it exports (agent-studio library.js).
import { ACTS, EXPRESSIONS, GESTURES } from '@/agents/catalog/performance'
import type { Figure } from '@/agents/rig'
import { RIG } from '@/lib/characterRig'
import { download, toCSV } from '../assets/export.ts'
import type { Crop } from '../assets/faces.ts'
import { recipes, type Recipe } from '../assets/frames.ts'
import { EFFECTS, EYES, HANDS, MOUTHS, POSES, VISEMES } from '../assets/vocabulary.ts'
import type { Character } from '../core/registry.ts'

export type CategoryId = 'parts' | 'profile' | 'dossier' | 'expr' | 'pose' | 'act' | 'mouth' | 'eye' | 'fx'
const SHARED: [CategoryId, string][] = [['expr', '表情'], ['pose', '手势'], ['act', '动作'], ['mouth', '口型'], ['eye', '眼睛与手型'], ['fx', '特效']]

/** A template shows its parts, a mascot its brand, a film owner its profile, any agent its dossier; then the six shared kinds. */
export function categories(character: Character): [CategoryId, string][] {
  const first: [CategoryId, string] = character.kind === 'template' ? ['parts', '部件'] : character.kind === 'mascot' ? ['parts', '形象'] : character.kind === 'film' ? ['profile', '角色'] : ['dossier', '档案']
  return [first, ...SHARED]
}

export const COUNTS: Partial<Record<CategoryId, number>> = {
  expr: EXPRESSIONS.length, pose: POSES.length, act: ACTS.length - 1, mouth: VISEMES.length + MOUTHS.length, eye: EYES.length + 1 + HANDS.length, fx: EFFECTS.length,
}

export type AssetType = 'expr' | 'pose' | 'act' | 'viseme' | 'mouth' | 'eye' | 'hand' | 'fx'
/** One specimen card: what it shows, how it plays, and the catalog entry behind it (for the drawer). */
export interface AssetItem {
  type: AssetType
  id: string
  zh: string
  sub?: string
  group?: string
  badge?: string
  crop: Crop
  mode: 'pingpong' | 'loop'
  recipe: () => Recipe
  src: { desc?: string; use?: string; sound?: string; expr?: readonly string[]; gesture?: string | null; dur?: number; film?: readonly string[] }
}
export interface AssetSection { title?: string; items: AssetItem[] }

const BLINK = { id: 'blink', zh: '眨眼', desc: '固定节奏眨眼，上眼皮 0.16 s 合上再睁开。', expr: ['常态眼时自动'] }

export function assetSections(category: CategoryId, figure: Figure): AssetSection[] {
  switch (category) {
    case 'expr': return [{ items: EXPRESSIONS.map((item) => ({ type: 'expr', id: item.id, zh: item.zh, group: item.group, crop: 'head', mode: 'pingpong', src: item, recipe: () => recipes.expr(figure, item.id) })) }]
    case 'pose': return [{ items: POSES.map((item) => ({ type: 'pose', id: item.id, zh: item.zh, crop: 'body', mode: item.id === 'run' ? 'loop' : 'pingpong', src: item, recipe: () => recipes.pose(figure, item.id) })) }]
    case 'act': return [{ items: ACTS.filter((item) => item.id !== 'none').map((item) => ({ type: 'act', id: item.id, zh: item.zh, badge: `${item.dur}s`, crop: 'body', mode: 'loop', src: item, recipe: () => recipes.act(figure, item.id, item.dur) })) }]
    case 'mouth': return [
      { title: '说话口型', items: VISEMES.map((item) => ({ type: 'viseme', id: item.id, zh: item.zh, sub: item.sound, crop: 'mouth', mode: 'pingpong', src: item, recipe: () => recipes.viseme(figure, item.id) })) },
      { title: '静态嘴形', items: MOUTHS.map((item) => ({ type: 'mouth', id: item.id, zh: item.zh, crop: 'mouth', mode: 'pingpong', src: item, recipe: () => recipes.mouth(figure, item.id) })) },
    ]
    case 'eye': return [
      { title: '眼睛', items: [...EYES, BLINK].map((item) => ({ type: 'eye', id: item.id, zh: item.zh, crop: 'head', mode: 'loop', src: item, recipe: () => recipes.eye(figure, item.id) })) },
      { title: '手型', items: HANDS.map((item) => ({ type: 'hand', id: item.id, zh: item.zh, crop: 'body', mode: 'pingpong', src: item, recipe: () => recipes.hand(figure, item.id) })) },
    ]
    case 'fx': return [{ items: EFFECTS.map((item) => ({ type: 'fx', id: item.id, zh: item.zh, crop: item.id === 'steam' ? 'body' : 'head', mode: 'loop', src: item, recipe: () => recipes.fx(figure, item.id) })) }]
    default: return []
  }
}

const fileName = (character: Character) => character.id.replace(/[:/\\]/g, '-')

// The character itself, then every asset with the renderer's parameters, as agent-studio exported it.
export function exportJSON(character: Character) {
  const who = character.kind === 'film' && character.film
    ? { ...character.film, specs: RIG.SPECS[character.film.id] }
    : character.kind === 'template' ? { id: character.id, look: (character.figure as Extract<Figure, { kind: 'kit' }>).look }
    : character.kind === 'mascot' ? { id: character.id, look: (character.figure as Extract<Figure, { kind: 'kit' }>).look, brand: { ...character.brand, match: String(character.brand?.match ?? '') } }
    : structuredClone({ ...character.agent })
  const data = {
    character: who,
    expressions: EXPRESSIONS.map((item) => ({ ...item, params: RIG.EXPR[item.id] ?? null })),
    poses: POSES.map((item) => ({ ...item, params: RIG.POSES[item.id] ?? null })),
    gestures: GESTURES, acts: ACTS, visemes: VISEMES, mouths: MOUTHS, eyes: EYES, hands: HANDS, fx: EFFECTS, fps: 30,
  }
  download(`${fileName(character)}-assets.json`, JSON.stringify(data, null, 1))
}

export function exportCSV(character: Character) {
  const rows: unknown[][] = [['类别', 'ID', '名称', '分组/时长', '描述', '适用', '参数']]
  EXPRESSIONS.forEach((item) => rows.push(['表情', item.id, item.zh, item.group, item.desc, item.use ?? '', RIG.EXPR[item.id] ?? '']))
  POSES.forEach((item) => rows.push(['姿势', item.id, item.zh, item.gesture ?? '', '', '', RIG.POSES[item.id] ?? '']))
  ACTS.forEach((item) => rows.push(['动作', item.id, item.zh, item.dur, item.desc, item.use ?? '', '']))
  VISEMES.forEach((item) => rows.push(['说话口型', item.id, item.zh, '', item.desc, item.sound, '']))
  MOUTHS.forEach((item) => rows.push(['静态嘴形', item.id, item.zh, '', item.desc, item.expr.join(' '), '']))
  EYES.forEach((item) => rows.push(['眼', item.id, item.zh, '', item.desc, item.expr.join(' '), '']))
  HANDS.forEach((item) => rows.push(['手', item.id, item.zh, '', item.desc, '', '']))
  EFFECTS.forEach((item) => rows.push(['特效', item.id, item.zh, '', item.desc, item.expr.join(' '), '']))
  download(`${fileName(character)}-assets.csv`, toCSV(rows), 'text/csv')
}
