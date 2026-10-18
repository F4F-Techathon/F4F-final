// Every image of a character is drawn here from its rig: one hidden rig per figure, posed by a fresh Actor
// and serialised to an SVG blob (agent-studio frames.js / icons.js). The film's three use their measured
// crops; generated looks crop by their own geometry (head origin, face centre, mouth).
import { RIG, type Actor, type Rig, type VisualState } from '@/lib/characterRig'
import { createFigureRig, figureKey, type Figure } from '@/agents/rig'
import type { KitSpec } from '@/agents/rig/rigkit.js'

export type Crop = 'icon' | 'head' | 'body' | 'mouth'

const VIEW = { body: '-235 -720 470 740', head: '-180 -600 360 360' }
const FILM_ICON_Y: Record<string, number> = { rong: -392, hua: -372, pierre: -392 }
const FILM_MOUTH_Y: Record<string, number> = { rong: -300, hua: -284, pierre: -298 }

interface Pool { box: HTMLDivElement; rig: Rig & { kit?: KitSpec } }
const pools = new Map<string, Pool>()
let serial = 0

function pool(figure: Figure): Pool {
  const key = figureKey(figure)
  let found = pools.get(key)
  if (found) return found
  const box = document.createElement('div')
  box.style.cssText = 'position:fixed;left:-4000px;top:0;width:420px;height:640px;pointer-events:none;opacity:0'
  document.body.appendChild(box)
  const rig = createFigureRig(box, figure, `fr${++serial}`) as Pool['rig']
  rig.svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  found = { box, rig }
  pools.set(key, found)
  return found
}

function geometry(figure: Figure) {
  if (figure.kind === 'film') return { icon: FILM_ICON_Y[figure.id] ?? -392, mouth: FILM_MOUTH_Y[figure.id] ?? -300, head: null }
  const kit = pool(figure).rig.kit
  if (!kit) return { icon: -385, mouth: -300, head: -420 }
  return { icon: kit.headOrigin + kit.sp.face.cy - 28, mouth: kit.headOrigin + kit.sp.mouthAt.y, head: kit.headOrigin - 130 }
}

export function viewBox(figure: Figure, crop: Crop) {
  const g = geometry(figure)
  if (crop === 'icon') return `-150 ${g.icon - 150} 300 300`
  if (crop === 'mouth') return `-75 ${g.mouth - 36} 150 90`
  if (crop === 'head') return g.head == null ? VIEW.head : `-180 ${g.head - 180} 360 360`
  return VIEW.body
}

/** A fresh actor on the figure's hidden rig, eyes open, so a frame shows only the asset itself. */
export function actor(figure: Figure, options: { seed?: number; expr?: string } = {}): Actor {
  const a = new RIG.Actor(pool(figure).rig, { seed: 0, expr: 'idle', ...options })
  a.blinkAt = () => 0
  return a
}

/** One frame as an SVG blob URL; the caller owns (and revokes) it. */
export function snapshot(figure: Figure, state: VisualState, crop: Crop) {
  const { rig } = pool(figure)
  rig.render(state)
  const before = rig.svg.getAttribute('viewBox')
  rig.svg.setAttribute('viewBox', viewBox(figure, crop))
  const markup = new XMLSerializer().serializeToString(rig.svg)
  if (before) rig.svg.setAttribute('viewBox', before)
  return URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }))
}

const faces = new Map<string, string>()
/** A round face icon of the figure showing `expr`, drawn once and cached. */
export function faceUrl(figure: Figure, expr = 'idle') {
  const key = `${figureKey(figure)}|${expr}`
  let url = faces.get(key)
  if (!url) {
    const a = actor(figure)
    a.e(0, expr)
    url = snapshot(figure, a.state(2), 'icon')
    faces.set(key, url)
  }
  return url
}

/** A one-off variant (a hair, an outfit, a colour), rendered once on its own hidden rig and dropped. */
export function lookStill(figure: Figure, crop: 'head' | 'body', expr = 'pitch') {
  const box = document.createElement('div')
  box.style.cssText = 'position:fixed;left:-4000px;top:0;width:420px;height:640px;opacity:0;pointer-events:none'
  document.body.appendChild(box)
  try {
    const rig = createFigureRig(box, figure, `pv${++serial}`) as Pool['rig']
    rig.svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const a = new RIG.Actor(rig, { seed: 0, expr: 'idle' })
    a.blinkAt = () => 0
    a.e(0.2, expr)
    rig.render(a.state(2))
    const kit = rig.kit
    rig.svg.setAttribute('viewBox', crop === 'head' && kit ? `-180 ${kit.headOrigin - 310} 360 360` : crop === 'head' ? VIEW.head : VIEW.body)
    return URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(rig.svg)], { type: 'image/svg+xml' }))
  } finally { box.remove() }
}
