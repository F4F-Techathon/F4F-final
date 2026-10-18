import { clamp, easeInOut, segment } from './entranceMotion'

export interface OrbAnchorBox { left: number; top: number; size: number }

export const PICKER_DEPART_DURATION = 220
export const PICKER_ARRIVAL_DURATION = 1850

// The orb leads; the title, cards and map follow with overlapping, gentle reveals.
export function pickerArrivalProgress(elapsed: number) {
  const reveal = (start: number, end: number) => 1 - (1 - segment(elapsed, start, end)) ** 3
  return {
    orb: easeInOut(segment(elapsed, 0, 1120)),
    chrome: reveal(160, 680),
    title: reveal(580, 1200),
    cards: reveal(1020, 1610),
    map: reveal(1170, 1770),
    invitations: reveal(1300, PICKER_ARRIVAL_DURATION),
  }
}

// Viewport coordinates keep the same orb aligned with both responsive page anchors.
export function orbAnchorFrame(from: OrbAnchorBox, to: OrbAnchorBox, progress: number): OrbAnchorBox {
  const p = clamp(progress)
  return {
    left: from.left + (to.left - from.left) * p,
    top: from.top + (to.top - from.top) * p,
    size: from.size + (to.size - from.size) * p,
  }
}
