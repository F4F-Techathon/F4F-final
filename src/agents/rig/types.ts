import type { CharacterId } from '../../data/types.ts'

export type Gender = 'female' | 'male'
export type HumanBody = 'f_petite' | 'f_regular' | 'f_tall' | 'm_round' | 'm_regular' | 'm_tall'
export type MascotBody = 'snowking' | 'panda' | 'opera' | 'lady' | 'siren'
export type Hair = 'bun' | 'bob' | 'long' | 'ponytail' | 'side' | 'crew' | 'curly' | 'bald' | 'clown'
export type Outfit = 'jacket' | 'tang' | 'chef' | 'shirt' | 'suit' | 'jumpsuit' | 'polo'
export type Hat = 'none' | 'toque' | 'cap' | 'bandana' | 'straw' | 'visor' | 'cowboy' | 'beret'
export type Accessory = 'glasses' | 'mustache' | 'earrings' | 'goatee' | 'bowtie' | 'clownface'
/** A brand's signature food, held up in the left hand. */
export type Prop = 'bucket' | 'fries' | 'hen' | 'sub' | 'drumstick' | 'burger' | 'taco' | 'pizza' | 'bowl'

// A generated character: a human template dressed by its parts, or a brand mascot drawn as itself.
export interface KitLook {
  body: HumanBody | MascotBody
  gender: Gender
  theme: string
  age?: 'young' | 'middle' | 'old'
  hair?: Hair
  hairColor?: string
  outfit?: Outfit
  hat?: Hat
  skin?: string
  badgeText?: string
  accessories?: Accessory[]
  prop?: Prop
  /** Colour overrides for a brand's uniform: the top, its second colour (stripes, collar, hat band), trousers, shoes. */
  top?: string
  trim?: string
  pants?: string
  shoes?: string
  /** The shop's picture for the chest badge: its cover photo (a data URL, or the photo's own URL) or a logo. */
  logo?: string | null
  brand?: string
}

// Everything the avatar can draw: one of the film's hand-made owners or a generated look.
export type Figure = { kind: 'film'; id: CharacterId } | { kind: 'kit'; look: KitLook }
