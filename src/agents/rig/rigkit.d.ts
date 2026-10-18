import type { Rig } from '../../lib/characterRig.js'
import type { Gender, KitLook } from './types.ts'

// The drawing spec's measures the asset library crops by: the face centre and the mouth, below the head origin.
export interface KitParts { face: { rx: number; ry: number; cy: number }; mouthAt: { y: number; s: number }; [key: string]: unknown }

export interface KitSpec {
  viewBox: string
  vbTop: number
  vbH: number
  headOrigin: number
  headTop: number
  scale: number
  theme: string
  male: boolean
  old: boolean
  sp: KitParts
}

export interface BodyTemplate {
  id: string
  zh: string
  gender: Gender
  height: 'short' | 'regular' | 'tall'
  lext: number
  W: number
  shoulder: number
  legW: number
  round: boolean
  scale: number
}

export const BODIES: BodyTemplate[]
export const HAIRS: Record<Gender, [string, string][]>
export const OUTFITS: [string, string][]
export const HATS: [string, string][]
export const PROPS: [string, string][]
export const SKINS: string[]
export function shade(hex: string, k: number): string
export function specFor(look: KitLook): KitSpec
export function badgeAt(id: string, look: KitLook, x: number, y: number, r: number, ring?: string): string
export function createKitRig(container: HTMLElement, look: KitLook, id: string): Rig & { kit: KitSpec }
