export type CharacterId = 'rong' | 'hua' | 'pierre'
export type CharacterState = 'idle' | 'speaking' | 'listening' | 'thinking' | 'happy' | 'surprised' | 'disagree'
export type Coordinates = [number, number]

export interface Evidence {
  id: string
  restaurantId: string
  kind: 'business' | 'review' | 'summary'
  title: string
  text?: string
  images?: { src: string; alt: string }[]
  source: string
  date?: string
  mock: boolean
  url?: string
}

// A real shop's listing as the import brings it (scripts/import-dianping.mjs).
export interface ShopScores { taste: number | null; env: number | null; service: number | null }
export interface ShopDish { id: string; name: string; price: number | null; recommended: number; desc: string; image: string | null }
export interface ShopDeal { id: string; name: string; price: number | null; value: number | null; discount: string; sold: string }
export interface ShopReview { id: string; user: string; time: string; star: number | null; text: string; likes: number; images: string[] }
export interface ShopCounts { dishes: number; meals: number; vouchers: number; reviews: number; complaints: number }
export interface ShopListing {
  source: string
  shopId: string
  region: string
  district: string
  scores: ShopScores
  phone: string | null
  counts: ShopCounts
  dishes: ShopDish[]
  meals: ShopDeal[]
  vouchers: ShopDeal[]
}

export interface Restaurant {
  id: string
  name: string
  cuisine: string
  host: string
  color: string
  /** `remote` photos load straight from the listing site's CDN. */
  cover: { src: string; alt: string; position?: string; remote?: boolean }
  price: number | null
  coordinates: Coordinates
  address: string
  hours: string | null
  tags: string[]
  scenes: string[]
  quiet: boolean | null
  spice: number | null
  allergens: string[] | null
  ingredients?: string[]
  specialty: string
  intro: string
  caveat: string
  evidenceIds: string[]
  /** A real shop's listing (scores, contact, dishes, deals); absent on hand-written demo shops. */
  listing?: ShopListing
}

export interface Filters {
  minBudget: number
  maxBudget: number
  radius: number
  cuisines: string[]
  excludedCuisines: string[]
  preferences: string[]
  scene: string
  people: number
  time: string
  quiet: boolean
  mild: boolean
  noSpice: boolean
  allergies: string[]
  avoidedIngredients: string[]
  locationName: string
  center: Coordinates
}

// A line said on stage, as the discussion history keeps it.
export interface HistoryEntry {
  id: string
  restaurantId: string // '' for the host, the customer and guests
  speakerId: string // who said it in the cast: a restaurant id, a guest id, 'host' or 'user'
  speaker: string // the name shown
  text: string
  gloss?: string // a regional host's line, said in dialect: the Mandarin it means (原文释义)
  round: number // the line's place among the hosts' lines
  topic: string
  evidenceIds: string[]
  time: string
  user?: boolean
  guest?: boolean // a guest the console brought on stage, not one of the invited restaurants
}
