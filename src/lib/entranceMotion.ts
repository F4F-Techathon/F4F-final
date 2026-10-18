export interface ScreenPoint { x: number; y: number }
export interface EntranceAnchors { starts: ScreenPoint[]; target: ScreenPoint }

export const OPENING_PLAYBACK_RATE = .85
export const GATHER_DURATION = 5000
export const STAGE_DURATION = 1900
export const STAGE_HANDOFF_START = 4440

export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

export function segment(time: number, start: number, end: number) {
  return clamp((time - start) / (end - start))
}

export function easeInOut(value: number) {
  return value < .5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2
}

export function easeOutBack(value: number) {
  return 1 + 2.70158 * (value - 1) ** 3 + 1.70158 * (value - 1) ** 2
}

// The small venue settles at its normal size while contestants gather.
export function venuePose(time: number) {
  const reveal = segment(time, 3000, 3500)
  const scale = reveal === 0 ? 0 : easeOutBack(reveal)
  return { opacity: clamp(scale), scale }
}

// Give the houses time to establish, then fade each one as its contestant emerges.
export function contestantReveal(time: number, index: number) {
  const start = 900 + index * 140
  const pop = segment(time, start, start + 470)
  const handoff = easeInOut(pop)
  return { pop, houseOpacity: 1 - handoff, houseScale: 1 - handoff * .22 }
}

// Curved screen-space paths are a theatrical gathering, not a claimed navigation route.
export function runnerPose(time: number, index: number, count: number, start: ScreenPoint, target: ScreenPoint, size = 1) {
  const runTime = 1550 + index * 110
  const arrivalTime = 3280 + index * 90
  const { pop } = contestantReveal(time, index)
  const running = segment(time, runTime, arrivalTime)
  const k = easeInOut(running)
  const slot = index - (count - 1) / 2
  const destination = { x: target.x + slot * 52 * size, y: target.y + (18 + Math.abs(slot) * 9) * size }
  const bend = (index % 2 ? 1 : -1) * Math.min(55 * size, Math.abs(destination.y - start.y) * .3 + 20 * size)
  const x = start.x + (destination.x - start.x) * k + Math.sin(Math.PI * k) * bend
  const y = start.y + (destination.y - start.y) * k - Math.sin(Math.PI * pop) * 25 * size
  const landing = segment(time, arrivalTime, arrivalTime + 350)
  const enter = easeInOut(segment(time, 3730 + index * 65, 4160 + index * 65))
  const scale = (pop <= 0 ? 0 : easeOutBack(pop)) * (1 - enter * .86)
  return {
    x: x + (target.x - x) * enter,
    y: y + (target.y - y) * enter - Math.sin(landing * Math.PI) * 9 * size - Math.sin(enter * Math.PI) * 22 * size,
    scale,
    opacity: pop <= 0 ? 0 : 1 - enter,
    direction: (destination.x >= start.x ? 1 : -1) as 1 | -1,
    running: time >= runTime && time < arrivalTime,
    arrived: time >= arrivalTime,
  }
}

// The same folding model as damo.html compresses cloth instead of sliding flat rectangles.
export function curtainFolds(widths: number[], progress: number, halfWidth: number, direction: number) {
  const unit = (halfWidth + 12) / widths.reduce((sum, width) => sum + width, 0)
  let x = -4
  return widths.map((width, index) => {
    const u = index / (widths.length - 1)
    const sx = 1 - progress * (.88 - .14 * u)
    const sy = 1 - progress * .07 * u * u
    const fold = { width: width * unit + 2, x: direction * x, sx, sy, shade: .34 * (1 - sx), crest: 44 + index * 5 % 13 }
    x += width * unit * sx
    return fold
  })
}
