import type { Gender, MascotBody } from './types.ts'

export interface Mascot {
  id: MascotBody
  brand: string
  zh: string
  gender: Gender
  height: 'short' | 'regular' | 'tall'
  lext: number
  W: number
  shoulder: number
  legW: number
  scale: number
}
export const MASCOTS: Mascot[]
export function mascot(body: string): Mascot | null
