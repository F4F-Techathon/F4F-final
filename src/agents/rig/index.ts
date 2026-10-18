import { RIG, type Rig } from '../../lib/characterRig.js'
import { createKitRig, specFor } from './rigkit.js'
import './mascots.js' // registers the brand mascots' bodies with rigkit
import type { Figure, KitLook } from './types.ts'

export type { Figure, KitLook } from './types.ts'

const FILM_FULL = '-210 -610 420 640'
const FILM_PORTRAIT = '-175 -565 350 350'

// Every full figure shares the film's frame, so a tall chef stands taller instead of shrinking;
// the body template's own scale grows or shrinks it around the feet.
function kitFullViewBox(look: KitLook) {
  const scale = specFor(look).scale || 1
  const width = 420 / scale, height = 640 / scale
  return `${-width / 2} ${30 - height} ${width} ${height}`
}

// The film's head-and-shoulders crop, lifted for buns and tall hats as far as the chin allows.
function kitPortraitViewBox(look: KitLook) {
  const { headOrigin, headTop } = specFor(look)
  const top = Math.min(headOrigin - 311, Math.max(headTop - 8, headOrigin - 345))
  return `-175 ${top} 350 350`
}

// One entry point for the avatar: the film's hand-made owners or a generated look, same renderer.
export function createFigureRig(container: HTMLElement, figure: Figure, id: string, options: { portrait?: boolean } = {}): Rig {
  if (figure.kind === 'film') return RIG.create(container, figure.id, id, { viewBox: options.portrait ? FILM_PORTRAIT : FILM_FULL })
  const rig = createKitRig(container, figure.look, id)
  rig.svg.setAttribute('viewBox', options.portrait ? kitPortraitViewBox(figure.look) : kitFullViewBox(figure.look))
  return rig
}

// A stable signature for re-keying an avatar when its generated look arrives or changes.
export function figureKey(figure: Figure) {
  return figure.kind === 'film' ? `film:${figure.id}` : `kit:${JSON.stringify(figure.look)}`
}
