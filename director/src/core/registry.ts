import { computed } from 'vue'
import type { CastEntry, GuestProfile, PersonaDefaultsPayload } from '@/agents/feed/protocol'
import { BRANDS, type Brand } from '@/agents/generation/brands'
import { edge } from '@/agents/generation/palette'
import type { Figure, KitLook } from '@/agents/rig'
import { BODIES, type BodyTemplate } from '@/agents/rig/rigkit.js'
import { FILM_CHARACTERS, type FilmCharacter } from '../data/film.ts'
import { useDirector } from './director.ts'
import { library, STUDIO_AGENTS } from './library.ts'
import type { AgentSource, LibraryAgent } from './studioAgents.ts'

export type CharacterKind = 'host' | 'agent' | 'template' | 'mascot' | 'film' | 'orb' | 'me'

/** Anyone the console can show: on the phone's stage, in the asset library, or both. */
export interface Character {
  id: string
  kind: CharacterKind
  /** Where an agent came from: the phone generated it, agent-studio did, or 「+」 here. */
  source?: AgentSource
  name: string
  fullName: string
  restaurant: string
  plate: string
  /** Identity colour: bars, tints and name text. */
  color: string
  figure: Figure | null
  defaults: PersonaDefaultsPayload
  language?: string
  agent?: LibraryAgent
  /** The phone's line-up entry while it is in the show. */
  entry?: CastEntry
  brand?: Brand
  body?: BodyTemplate
  film?: FilmCharacter
}

// One neutral look per body (agent-studio roster.js TEMPLATE_LOOKS): the generic templates.
export const TEMPLATE_LOOKS: Record<string, Partial<KitLook>> = {
  f_petite: { hair: 'ponytail', outfit: 'shirt', hat: 'none', age: 'young' },
  f_regular: { hair: 'bun', outfit: 'jacket', hat: 'none', age: 'middle' },
  f_tall: { hair: 'long', outfit: 'chef', hat: 'none', age: 'young' },
  m_round: { hair: 'side', outfit: 'tang', hat: 'none', age: 'middle' },
  m_regular: { hair: 'crew', outfit: 'shirt', hat: 'cap', age: 'young' },
  m_tall: { hair: 'curly', outfit: 'chef', hat: 'toque', age: 'middle' },
}
const TEMPLATE_THEME = '#7D86A0'
const TEMPLATE_EDGE = '#8A93A6'
const CALM: PersonaDefaultsPayload = { expr: 'idle', gesture: 'rest', act: 'none', reaction: 'listen' }
const PITCH: PersonaDefaultsPayload = { expr: 'pitch', gesture: 'present', act: 'stepIn', reaction: 'eyeroll' }

export const ORB: Character = {
  id: 'host', kind: 'orb', name: 'Orb', fullName: 'Orb · 主持人', restaurant: '主持', plate: '主持 · 需求收集 · 洞察 · 预订',
  color: '#C9B3F2', figure: null, defaults: CALM,
}
export const ME: Character = {
  id: 'user', kind: 'me', name: '我', fullName: '我 · 台下顾客', restaurant: '台下', plate: '台下顾客 · 今晚吃啥',
  color: '#D9B77F', figure: null, defaults: CALM,
}

export function agentFigure(agent: Pick<LibraryAgent, 'rig' | 'logo'>): Figure {
  return { kind: 'kit', look: { ...agent.rig, logo: agent.logo } as KitLook }
}

function agentCharacter(agent: LibraryAgent, entry?: CastEntry): Character {
  return {
    id: agent.id, kind: agent.source === 'phone' ? 'host' : 'agent', source: agent.source, name: agent.name, fullName: agent.fullName || `${agent.name} · ${agent.restaurant}`,
    restaurant: agent.restaurant, plate: agent.plate, color: entry?.color ?? agent.edge ?? edge(agent.rig.theme), figure: agentFigure(agent), defaults: agent.defaults,
    language: agent.language, agent, entry, brand: agent.brand ? BRANDS.find((brand) => brand.id === agent.brand!.id) : undefined,
  }
}

// A host the phone is still generating, or a guest some other console brought on: only its line-up entry is known.
function entryCharacter(entry: CastEntry): Character {
  return {
    id: entry.id, kind: entry.kind === 'guest' ? 'agent' : 'host', source: entry.kind === 'guest' ? undefined : 'phone', name: entry.name,
    fullName: `${entry.name} · ${entry.restaurant}`, restaurant: entry.restaurant, plate: entry.restaurant, color: entry.color,
    figure: entry.look ? { kind: 'kit', look: entry.look as KitLook } : null, defaults: PITCH, entry,
  }
}

export const TEMPLATES: Character[] = BODIES.map((body) => ({
  id: `tpl:${body.id}`, kind: 'template', name: body.zh, fullName: `${body.zh} · 形象模板`, restaurant: body.gender === 'female' ? '女 · 形象模板' : '男 · 形象模板',
  plate: '通用模板', color: TEMPLATE_EDGE, defaults: PITCH, body,
  figure: { kind: 'kit', look: { body: body.id, gender: body.gender, theme: TEMPLATE_THEME, badgeText: '店', ...TEMPLATE_LOOKS[body.id] } as KitLook },
}))

export const MASCOTS: Character[] = BRANDS.map((brand) => ({
  id: `brand:${brand.id}`, kind: 'mascot', name: brand.mascot, fullName: `${brand.mascot} · ${brand.name}`, restaurant: brand.name, plate: brand.cuisine,
  color: edge(brand.theme), defaults: PITCH, brand, language: brand.accent,
  figure: { kind: 'kit', look: { body: brand.body, brand: brand.id, gender: brand.gender, theme: brand.theme } },
}))

export const FILM: Character[] = FILM_CHARACTERS.map((film) => ({
  id: `film:${film.id}`, kind: 'film', name: film.name, fullName: film.fullName, restaurant: film.restaurant, plate: film.plate, color: film.edge,
  figure: { kind: 'film', id: film.id }, defaults: film.defaults, language: film.language, film,
}))

function createRegistry() {
  const director = useDirector()
  // The phone's hosts: every generated contract it published, plus line-up entries still being generated.
  const phoneHosts = computed(() => {
    const entries = new Map(director.cast.value.filter((entry) => entry.kind !== 'guest').map((entry) => [entry.id, entry]))
    const made = Object.values(director.hosts).map((agent) => agentCharacter({ ...agent, source: 'phone' }, entries.get(agent.id)))
    const pending = [...entries.values()].filter((entry) => !director.hosts[entry.id]).map(entryCharacter)
    return [...made, ...pending]
  })
  const libraryAgents = computed(() => {
    const seen = new Set<string>()
    return [...library.created, ...library.imported, ...STUDIO_AGENTS].filter((agent) => !seen.has(agent.id) && seen.add(agent.id))
  })
  const agents = computed(() => {
    const entries = new Map(director.cast.value.filter((entry) => entry.kind === 'guest').map((entry) => [entry.id, entry]))
    return libraryAgents.value.map((agent) => agentCharacter(agent, entries.get(agent.id)))
  })
  // A guest on the phone this console has no file for (another console brought it on).
  const strangers = computed(() => director.cast.value.filter((entry) => entry.kind === 'guest' && !libraryAgents.value.some((agent) => agent.id === entry.id)).map(entryCharacter))
  const all = computed(() => [ME, ...phoneHosts.value, ...agents.value, ...strangers.value, ORB, ...TEMPLATES, ...MASCOTS, ...FILM])
  const byId = computed(() => new Map(all.value.map((character) => [character.id, character])))

  return {
    all, phoneHosts, agents, strangers,
    studio: computed(() => agents.value.filter((character) => character.source === 'studio')),
    created: computed(() => agents.value.filter((character) => character.source === 'created')),
    get: (id: string) => byId.value.get(id),
  }
}

export type Registry = ReturnType<typeof createRegistry>
let registry: Registry | null = null
export function useRegistry(): Registry {
  return registry ??= createRegistry()
}

/** What the phone needs to bring an agent on as a guest, cut to the protocol's limits. */
export function guestProfile(character: Character): GuestProfile | null {
  const agent = character.agent
  if (!agent) return null
  const logo = agent.logo && agent.logo.length <= 48 * 1024 ? agent.logo : undefined
  return {
    name: agent.name.slice(0, 40), restaurant: agent.restaurant.slice(0, 60), plate: agent.plate.slice(0, 80),
    ...(agent.cuisine ? { cuisine: agent.cuisine.slice(0, 40) } : {}), persona: agent.persona.slice(0, 600),
    keywords: agent.keywords.filter((word) => word.trim() && word.length <= 24).slice(0, 16), defaults: agent.defaults,
    color: character.color, look: { ...agent.rig, ...(logo ? { logo } : {}) }, ...(agent.greeting ? { greeting: agent.greeting.slice(0, 600) } : {}),
  }
}

/** A library agent that plays this brand's mascot, if one exists already. */
export function brandAgent(brandId: string): LibraryAgent | undefined {
  return [...library.created, ...library.imported, ...STUDIO_AGENTS].find((agent) => agent.brand?.id === brandId)
}
