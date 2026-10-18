import { computed, reactive } from 'vue'
import { defineStore } from 'pinia'
import type { Restaurant } from '@/data/types'
import type { Figure } from '@/agents/rig'
import { differentiate } from '@/agents/generation/distinct'
import { GENERATOR_VERSION, runGeneration } from '@/agents/generation/generateAgent'
import { processLogo } from '@/agents/generation/logo'
import { shopFromRestaurant, shopHash } from '@/agents/generation/shop'
import type { AgentContract, GenerationStep, JevAsk, PerformanceCatalogLike } from '@/agents/generation/types'
import { useDiningStore } from './dining'

const STORAGE_KEY = 'tonight-cast-v1'
const CONCURRENCY = 2

export type CastStatus = 'idle' | 'queued' | 'generating' | 'ready' | 'error'
export interface CastEntry { status: CastStatus; shopHash: string; step?: GenerationStep; contract?: AgentContract; error?: string }

// The generator's collaborators, provided once by the app's composition root (or by tests).
export interface GenerationDeps { catalog: PerformanceCatalogLike; ask?: JevAsk }
let deps: GenerationDeps | null = null
export function provideGenerationDeps(value: GenerationDeps) { deps = value }

const BADGE_WAIT_MS = 4000

// The shop's cover photo, cropped round for the host's chest badge. Only a real photo of the shop counts: the
// illustrations used where a listing has none would mislabel it. Null when the photo cannot be read in time.
async function coverBadge(restaurant: Restaurant) {
  if (!restaurant.cover.remote || typeof document === 'undefined') return null
  try {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), BADGE_WAIT_MS))
    const badge = await Promise.race([processLogo(restaurant.cover.src, { cover: true }), timeout])
    return badge?.data || null
  } catch { return null }
}

const hashes = new WeakMap<Restaurant, string>()
function hashOf(restaurant: Restaurant) {
  let hash = hashes.get(restaurant)
  if (!hash) { hash = shopHash(shopFromRestaurant(restaurant)); hashes.set(restaurant, hash) }
  return hash
}

// One generated host per restaurant: queued while the user swipes, reused until its shop facts change.
export const useCastStore = defineStore('cast', () => {
  const entries = reactive<Record<string, CastEntry>>({})
  const queue: Restaurant[] = []
  const waiters = new Map<string, { resolve: (contract: AgentContract) => void; reject: (error: Error) => void }[]>()
  let running = 0

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (saved?.version === GENERATOR_VERSION && saved.entries && typeof saved.entries === 'object') {
      for (const [id, item] of Object.entries(saved.entries as Record<string, { shopHash: string; contract: AgentContract }>)) {
        if (item?.contract?.rig && typeof item.shopHash === 'string') entries[id] = { status: 'ready', shopHash: item.shopHash, contract: item.contract }
      }
    }
  } catch { /* A fresh cast is generated when storage is unavailable. */ }

  function save() {
    const ready = Object.fromEntries(Object.entries(entries).filter(([, entry]) => entry.status === 'ready').map(([id, entry]) => [id, { shopHash: entry.shopHash, contract: entry.contract }]))
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: GENERATOR_VERSION, entries: ready })) } catch { /* Storage does not block the show. */ }
  }

  // Read-only views for templates: an entry made for older shop facts counts as missing.
  function current(restaurant: Restaurant) {
    const entry = entries[restaurant.id]
    return entry && entry.shopHash === hashOf(restaurant) ? entry : undefined
  }
  function statusOf(restaurant: Restaurant): CastStatus { return current(restaurant)?.status || 'idle' }
  function stepOf(restaurant: Restaurant) { return current(restaurant)?.step }
  // The invited hosts as they look together on stage (distinct.ts): a second branch of a chain sends its crew, and
  // hosts too alike change hats, outfits or colours. Every view of a host goes through contractOf, so the stage,
  // the multi-agent backend's names and voices, and the console all see the same line-up.
  const together = computed(() => differentiate(useDiningStore().selected.flatMap((restaurant) => {
    const contract = current(restaurant)?.contract
    return contract ? [{ id: restaurant.id, contract }] : []
  })))
  function contractOf(restaurant: Restaurant) {
    const contract = current(restaurant)?.contract
    return contract && (together.value.get(restaurant.id) || contract)
  }
  function isReady(restaurants: Restaurant[]) { return restaurants.every((restaurant) => statusOf(restaurant) === 'ready') }
  // The name to show: the generated host's once it exists (real listings name no owner), else the shop's own.
  function hostNameOf(restaurant: Restaurant) { return contractOf(restaurant)?.name || restaurant.host || '店主' }

  // The figure the avatar draws; the shop's cover photo goes on the chest badge (the photo itself when it could not
  // be copied into the host).
  function figureOf(restaurant: Restaurant): Figure | null {
    const contract = contractOf(restaurant)
    return contract ? { kind: 'kit', look: { ...contract.rig, logo: contract.logo || (restaurant.cover.remote ? restaurant.cover.src : null) } } : null
  }

  function entryFor(restaurant: Restaurant) {
    return current(restaurant) || (entries[restaurant.id] = { status: 'idle', shopHash: hashOf(restaurant) })
  }

  function settle(id: string, contract?: AgentContract, error?: Error) {
    for (const waiter of waiters.get(id) || []) {
      if (contract) waiter.resolve(contract)
      else waiter.reject(error || new Error('生成失败'))
    }
    waiters.delete(id)
  }

  async function generate(restaurant: Restaurant) {
    const entry = entryFor(restaurant)
    entry.status = 'generating'
    entry.step = 'look'
    try {
      if (!deps) throw new Error('Generation dependencies were not provided')
      const shop = { ...shopFromRestaurant(restaurant), logo: await coverBadge(restaurant) }
      const contract = await runGeneration(shop, { id: restaurant.id, ...deps }, (event) => {
        if (event.type === 'step' && event.status === 'run') entry.step = event.step
      })
      Object.assign(entry, { status: 'ready', contract, step: undefined, error: undefined })
      save()
      settle(restaurant.id, contract)
    } catch (error) {
      Object.assign(entry, { status: 'error', step: undefined, error: (error as Error).message })
      settle(restaurant.id, undefined, error as Error)
    }
  }

  function pump() {
    while (running < CONCURRENCY && queue.length) {
      const restaurant = queue.shift()!
      running++
      void generate(restaurant).finally(() => { running--; pump() })
    }
  }

  function enqueue(restaurant: Restaurant, urgent: boolean) {
    const entry = entryFor(restaurant)
    if (entry.status === 'ready' || entry.status === 'generating') return
    const waiting = queue.findIndex((item) => item.id === restaurant.id)
    if (waiting >= 0 && !urgent) return
    if (waiting >= 0) queue.splice(waiting, 1)
    entry.status = 'queued'
    if (urgent) queue.unshift(restaurant)
    else queue.push(restaurant)
    pump()
  }

  // Cards about to be shown: generated in order, behind any invited restaurant.
  function prefetch(restaurants: Restaurant[]) { restaurants.forEach((restaurant) => enqueue(restaurant, false)) }

  // An invited restaurant jumps the queue; resolves with its host (an earlier failure is retried).
  function ensure(restaurant: Restaurant): Promise<AgentContract> {
    const entry = entryFor(restaurant)
    if (entry.status === 'ready' && entry.contract) return Promise.resolve(entry.contract)
    if (entry.status === 'error') entry.status = 'idle'
    const pending = new Promise<AgentContract>((resolve, reject) => waiters.set(restaurant.id, [...(waiters.get(restaurant.id) || []), { resolve, reject }]))
    enqueue(restaurant, true)
    return pending
  }

  return { entries, statusOf, stepOf, contractOf, figureOf, hostNameOf, isReady, prefetch, ensure }
})
