// The hosts invited onto one stage, made to look clearly different from each other. Each shop's host is generated
// on its own and kept as is (the same shop always gets the same host), so similar shops can still come out alike:
// Jev picks a chef's hat for nearly every cook, glasses for half of them, and two branches of one chain are the
// same character. This pass runs over the line-up in order and changes only what the hosts already standing there
// make ambiguous: the second branch of a chain plays one of its crew; a host too close to an earlier one changes
// hat, outfit, hair, colours or glasses (never gender or age, which the names and voices follow). Pure and
// deterministic: the same line-up always looks the same, on the phone and in the director console.
import { BRANDS } from './brands.ts'
import type { AgentContract } from './types.ts'
import type { Hair, Hat, KitLook, Outfit } from '../rig/types.ts'

export interface StageHost { id: string; contract: AgentContract }

const HUMAN = /^[fm]_/
const WHITE_HATS: Hat[] = ['toque', 'cap']
// Hats and outfits a host may switch to, the most ordinary first.
const HAT_CHOICES: Hat[] = ['none', 'bandana', 'beret', 'visor', 'cap']
const OUTFIT_CHOICES: Outfit[] = ['jacket', 'tang', 'shirt', 'polo', 'chef']
const HAIR_CHOICES: Record<'female' | 'male', Hair[]> = { female: ['bob', 'ponytail', 'long', 'bun'], male: ['crew', 'side', 'curly', 'bald'] }
const HAIR_COLORS = ['#2A1C24', '#6B3E26', '#8A5A3B', '#3B2A4A', '#A8784A', '#553A2A']
const MAX_GLASSES = 2

function hue(hex: string) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (!d) return -1
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}
function hueGap(a: string, b: string) {
  const x = hue(a), y = hue(b)
  if (x < 0 || y < 0) return x === y ? 0 : 180
  const d = Math.abs(x - y)
  return Math.min(d, 360 - d)
}
function rotateHue(hex: string, degrees: number) {
  const n = parseInt(hex.slice(1), 16), rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  // Rodrigues rotation of the RGB cube around its grey diagonal: keeps lightness close, turns the hue.
  const a = degrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), k = (1 - c) / 3, q = Math.sqrt(1 / 3) * s
  const m = [[c + k, k - q, k + q], [k + q, c + k, k - q], [k - q, k + q, c + k]]
  return '#' + m.map((row) => Math.max(0, Math.min(255, Math.round(row[0]! * rgb[0]! + row[1]! * rgb[1]! + row[2]! * rgb[2]!))).toString(16).padStart(2, '0')).join('').toUpperCase()
}

const bodyHeight = (body: string) => (/petite|round/.test(body) ? 'short' : /tall/.test(body) ? 'tall' : 'regular')
const sameSet = (a: readonly string[] = [], b: readonly string[] = []) => a.length === b.length && a.every((item) => b.includes(item))

/** How alike two human looks are at a glance, from 0 to 12; 7 or more reads as "the same host twice". */
export function likeness(a: KitLook, b: KitLook) {
  let score = 0
  if (a.gender === b.gender) score += 2
  if (a.outfit === b.outfit) score += 2
  if (a.hat === b.hat) score += a.hat === 'none' || !a.hat ? 1 : 2
  if (a.hair === b.hair) score += 1.5
  if (a.age === b.age) score += 1
  if (bodyHeight(a.body) === bodyHeight(b.body)) score += 0.5
  if (hueGap(a.top || a.theme, b.top || b.theme) < 30) score += 2
  if (sameSet(a.accessories, b.accessories)) score += 1
  return score
}
const TOO_ALIKE = 7

// One step towards standing apart, the least noticeable first; false when nothing is left to change.
function vary(look: KitLook, others: KitLook[], step: number): boolean {
  const used = <T>(get: (look: KitLook) => T) => others.map(get)
  switch (step) {
    case 0: { // a different hat, preferring none
      const hat = HAT_CHOICES.find((item) => item !== look.hat && (item === 'none' || !used((o) => o.hat).includes(item)) && !(WHITE_HATS.includes(item) && others.some((o) => WHITE_HATS.includes(o.hat!))))
      if (!hat) return false
      look.hat = hat
      return true
    }
    case 1: { // a different outfit, one nobody else wears
      const outfit = OUTFIT_CHOICES.find((item) => item !== look.outfit && !used((o) => o.outfit).includes(item))
      if (!outfit) return false
      if (look.hat === 'toque' && outfit !== 'chef') look.hat = 'none'
      look.outfit = outfit
      return true
    }
    case 2: { // another hairstyle
      const hair = HAIR_CHOICES[look.gender].find((item) => item !== look.hair && !used((o) => o.gender === look.gender ? o.hair : '').includes(item))
      if (!hair) return false
      look.hair = hair
      return true
    }
    case 3: { // the clothes in another colour, well away from everyone else's
      const base = look.top || look.theme
      const turn = [60, 120, 180, 240, 300].find((d) => others.every((o) => hueGap(rotateHue(base, d), o.top || o.theme) >= 40)) ?? 120
      if (look.top) look.top = rotateHue(look.top, turn)
      else look.theme = rotateHue(look.theme, turn)
      return true
    }
    case 4: { // glasses off, or on while few others wear them
      const accessories = look.accessories || []
      if (accessories.includes('glasses')) look.accessories = accessories.filter((item) => item !== 'glasses')
      else if (others.filter((o) => o.accessories?.includes('glasses')).length < MAX_GLASSES) look.accessories = [...accessories, 'glasses']
      else return false
      return true
    }
    case 5: { // another hair colour
      const color = HAIR_COLORS.find((item) => item !== look.hairColor && !used((o) => o.hairColor).includes(item))
      if (!color) return false
      look.hairColor = color
      return true
    }
    default:
      return false
  }
}

/** The line-up's hosts as they should look together: only the ones that change, by id. */
export function differentiate(hosts: StageHost[]): Map<string, AgentContract> {
  const changed = new Map<string, AgentContract>()
  const placed: KitLook[] = []
  const branches = new Map<string, number>()
  for (const { id, contract } of hosts) {
    let rig: KitLook = { ...contract.rig, accessories: [...(contract.rig.accessories || [])] }
    let name = contract.name
    const brand = rig.brand ? BRANDS.find((item) => item.id === rig.brand) : undefined
    // A chain's own character keeps its costume; everyone else may change.
    let mutable = HUMAN.test(rig.body) && !brand
    if (brand) {
      // The chain's character stands on stage once; its other branches send their crew.
      const seen = branches.get(brand.id) || 0
      branches.set(brand.id, seen + 1)
      if (seen > 0) {
        const crew = brand.crew?.[(seen - 1) % (brand.crew?.length || 1)]
        if (crew) {
          // A fresh uniform: nothing of the chain's character (the colonel's white hair, the clown's face) carries over.
          rig = { body: crew.gender === 'female' ? 'f_regular' : 'm_regular', brand: brand.id, gender: crew.gender, theme: rig.theme, badgeText: rig.badgeText, ...crew.parts, accessories: [...(crew.parts.accessories || [])] }
          name = crew.name + (brand.crew && seen > brand.crew.length ? '二号' : '')
          mutable = true
        } else name = `${contract.name}二号`
      }
    }
    if (mutable) {
      // One white chef's hat on stage at most, two pairs of glasses at most.
      if (WHITE_HATS.includes(rig.hat!) && placed.some((other) => WHITE_HATS.includes(other.hat!))) vary(rig, placed, 0)
      if (rig.accessories!.includes('glasses') && placed.filter((other) => other.accessories?.includes('glasses')).length >= MAX_GLASSES)
        rig.accessories = rig.accessories!.filter((item) => item !== 'glasses')
      for (let step = 0; step < 6 && placed.some((other) => likeness(rig, other) >= TOO_ALIKE); step++) vary(rig, placed, step)
    }
    placed.push(rig)
    if (name !== contract.name || JSON.stringify(rig) !== JSON.stringify({ ...contract.rig, accessories: contract.rig.accessories || [] }))
      changed.set(id, { ...contract, name, fullName: `${name} · ${contract.restaurant}`, rig })
  }
  return changed
}
