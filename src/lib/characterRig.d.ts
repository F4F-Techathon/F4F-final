import type { CharacterId } from '../data/types'
export interface VisualState { mouth: string; open: number; tilt: number; [key: string]: unknown }
export interface Rig { svg: SVGSVGElement; render(state: VisualState): void }
export interface Actor {
  /** Varies the blink rhythm between characters. */
  seed: number
  e(t: number, expression: string): Actor
  p(t: number, pose: string, duration?: number): Actor
  look(t: number, x: number, y: number): Actor
  run(start: number, end: number, rate?: number): Actor
  stopRun(t: number): Actor
  cancelAfter(t: number): Actor
  act(t: number, name: string, duration?: number, amplitude?: number): Actor
  fx(t: number, name: string, duration?: number): Actor
  /** 0–1 lid closure at t; replace with () => 0 to keep the eyes open. */
  blinkAt(t: number): number
  state(t: number): VisualState
  render(t: number): void
}
export const RIG: {
  /** The film owners' palettes and proportions. */
  SPECS: Record<CharacterId, Record<string, unknown>>
  /** Expression and pose parameters, as the asset library shows them. */
  EXPR: Record<string, Record<string, unknown>>
  POSES: Record<string, Record<string, unknown>>
  create(container: HTMLElement, who: CharacterId, id: string, opts?: { viewBox?: string }): Rig
  Rig: { prototype: Rig }
  Actor: (new (rig: Rig, opts?: { seed?: number; expr?: string }) => Actor) & { prototype: Actor }
}
