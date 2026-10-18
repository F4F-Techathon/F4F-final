// The asset library's specimen cards: a card near the viewport renders its frames a few cards at a time
// (24 ms per animation frame, so scrolling stays smooth), then loops them on one shared 30 fps clock.
// A card that leaves the viewport pauses.
import type { Figure } from '@/agents/rig'
import { snapshot } from './faces.ts'
import { FPS, type Recipe } from './frames.ts'

export interface SpecimenSpec {
  figure: Figure
  recipe?: () => Recipe
  /** A single picture instead of frames (part variants). */
  still?: () => string
  /** Transitions ping-pong with holds; cycles loop. */
  mode?: 'pingpong' | 'loop'
}

interface Player { step(): void }
const players = new Set<Player>()
let clock: ReturnType<typeof setInterval> | undefined
function play(player: Player) {
  players.add(player)
  clock ??= setInterval(() => players.forEach((item) => item.step()), 1000 / FPS)
}
function pause(player: Player) {
  players.delete(player)
  if (!players.size && clock) { clearInterval(clock); clock = undefined }
}

function player(img: HTMLImageElement, urls: string[], mode: 'pingpong' | 'loop'): Player {
  const n = urls.length, seq: number[] = []
  if (n <= 1) seq.push(0)
  else if (mode === 'loop') for (let k = 0; k < n; k += 1) seq.push(k)
  else {
    for (let k = 0; k < 8; k += 1) seq.push(0)
    for (let k = 0; k < n; k += 1) seq.push(k)
    for (let k = 0; k < 26; k += 1) seq.push(n - 1)
    for (let k = n - 1; k >= 0; k -= 1) seq.push(k)
  }
  let i = 0, last = -1
  return {
    step() {
      const f = seq[i % seq.length]!
      i += 1
      if (f !== last) { img.src = urls[f]!; last = f }
    },
  }
}

interface Card { el: HTMLElement; img: HTMLImageElement; spec: SpecimenSpec; player?: Player; queued?: boolean }

export class SpecimenEngine {
  private cards = new Map<HTMLElement, Card>()
  private queue: Card[] = []
  private urls: string[] = []
  private draining = false
  private io = new IntersectionObserver((entries) => entries.forEach((entry) => this.visible(entry.target as HTMLElement, entry.isIntersecting)), { rootMargin: '200px' })

  observe(el: HTMLElement, img: HTMLImageElement, spec: SpecimenSpec) {
    this.cards.set(el, { el, img, spec })
    this.io.observe(el)
    return () => {
      const card = this.cards.get(el)
      if (card?.player) pause(card.player)
      this.cards.delete(el)
      this.io.unobserve(el)
    }
  }

  private visible(el: HTMLElement, on: boolean) {
    const card = this.cards.get(el)
    if (!card) return
    if (!on) { if (card.player) pause(card.player); return }
    if (card.player) { play(card.player); return }
    if (card.queued) return
    card.queued = true
    this.queue.push(card)
    this.drain()
  }

  private drain() {
    if (this.draining) return
    this.draining = true
    const run = () => {
      const start = performance.now()
      while (this.queue.length && performance.now() - start < 24) {
        const card = this.queue.shift()!
        if (!card.el.isConnected || !this.cards.has(card.el)) continue
        try {
          if (card.spec.still) {
            const url = card.spec.still()
            this.urls.push(url)
            card.img.src = url
            continue
          }
          const recipe = card.spec.recipe!()
          const urls = recipe.frames.map((frame) => snapshot(card.spec.figure, frame.st, recipe.crop))
          this.urls.push(...urls)
          card.img.src = urls[urls.length - 1]!
          card.player = player(card.img, urls, card.spec.mode ?? 'pingpong')
          play(card.player)
        } catch (error) { console.error(error) }
      }
      if (this.queue.length) requestAnimationFrame(run)
      else this.draining = false
    }
    requestAnimationFrame(run)
  }

  dispose() {
    this.io.disconnect()
    for (const card of this.cards.values()) if (card.player) pause(card.player)
    this.cards.clear()
    this.queue = []
    this.urls.forEach((url) => URL.revokeObjectURL(url))
    this.urls = []
  }
}
