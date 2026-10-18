export interface SwipeGesture {
  x: number
  y: number
  elapsed: number
  width: number
}

export const VISIBLE_STACK_CARDS = 3

// At full progress each surviving card already matches its next slot, including the hidden reserve.
export function cardStackPose(index: number, progress: number) {
  const depth = index - (index ? progress : 0)
  return {
    scale: 1 - depth * .045,
    y: depth * 12,
    opacity: index < VISIBLE_STACK_CARDS ? 1 : progress,
  }
}

// A deliberate horizontal drag or quick flick commits; a vertical scroll never does.
export function swipeDirection({ x, y, elapsed, width }: SwipeGesture): -1 | 0 | 1 {
  if (Math.abs(x) < Math.abs(y) * 1.2) return 0
  const distance = Math.abs(x)
  const threshold = Math.max(64, Math.min(width * .25, 120))
  const flick = distance >= 36 && elapsed > 0 && distance / elapsed >= .55
  return distance >= threshold || flick ? x > 0 ? 1 : -1 : 0
}
