import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { DATASET, defaultFilters, restaurants } from '@/data/restaurants'
import { MIN_CONTESTANTS, MAX_CONTESTANTS } from '@/data/app'
import { distanceKm, matchesFilters, parseRequirements } from '@/lib/filtering'
import type { Filters, HistoryEntry } from '@/data/types'
import type { ShortlistBrief, ShortlistResult } from '@/lib/shortlistProtocol'
import { useIntakeStore } from './intake'

const STORAGE_KEY = 'tonight-dining-v1'

// The shortlist agent's picks for one request (rawInput + filters): the deck's shops, best first, with reasons.
export interface Shortlist { key: string; ids: string[]; reasons: Record<string, string>; summary: string; model: string }
const requestKey = (rawInput: string, filters: Filters) => JSON.stringify([rawInput, filters])

export const useDiningStore = defineStore('dining', () => {
  const rawInput = ref('')
  const filters = ref<Filters>(defaultFilters())
  const selectedIds = ref<string[]>([])
  const swipeHistory = ref<{ id: string; liked: boolean }[]>([])
  const history = ref<HistoryEntry[]>([])
  const winnerId = ref('')
  const paused = ref(false)
  const shortlist = ref<Shortlist | null>(null)
  const shortlistState = ref<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const toast = ref('')
  let toastTimer: ReturnType<typeof setTimeout>

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (saved && typeof saved.rawInput === 'string' && Array.isArray(saved.selectedIds) && Array.isArray(saved.history)) {
      // State saved on another set of shops (the demo shops before the real ones) keeps the request but starts
      // from the new shops' area, without their picks or discussion.
      const sameShops = (saved.dataset ?? 'demo') === DATASET
      rawInput.value = saved.rawInput
      filters.value = { ...defaultFilters(), ...saved.filters, ...(sameShops ? {} : { locationName: defaultFilters().locationName, center: defaultFilters().center }) }
      if (!sameShops) saved.history = []
      if (!Array.isArray(saved.filters?.allergies) && typeof saved.filters?.allergy === 'string' && saved.filters.allergy) filters.value.allergies = [saved.filters.allergy]
      delete (filters.value as Filters & { allergy?: string }).allergy
      selectedIds.value = [...new Set<string>(saved.selectedIds.filter((id: string) => restaurants.some((r) => r.id === id)))].slice(0, MAX_CONTESTANTS)
      if (Array.isArray(saved.swipeHistory)) {
        swipeHistory.value = saved.swipeHistory.filter((choice: { id: string; liked: boolean }, index: number, choices: { id: string }[]) =>
          choice && typeof choice.liked === 'boolean' && restaurants.some((r) => r.id === choice.id) && choices.findIndex((item) => item?.id === choice.id) === index)
      }
      history.value = saved.history.map((entry: HistoryEntry) => ({ ...entry, speakerId: entry.speakerId || (entry.user ? 'user' : entry.restaurantId), topic: entry.topic || '', evidenceIds: entry.evidenceIds || [] }))
      winnerId.value = saved.winnerId || ''
      const kept = saved.shortlist as Shortlist | undefined
      if (sameShops && kept && typeof kept.key === 'string' && Array.isArray(kept.ids) && kept.reasons && typeof kept.reasons === 'object') {
        shortlist.value = { key: kept.key, ids: kept.ids.filter((id) => restaurants.some((r) => r.id === id)), reasons: kept.reasons, summary: String(kept.summary || ''), model: String(kept.model || '') }
      }
      paused.value = true
    }
  } catch { /* A fresh session remains usable if browser storage is unavailable. */ }

  // The hard limits decide which shops may be invited at all; within them, the agent's picks (when they were made for
  // this very request) decide the deck and its order. Without them the deck keeps the rule order.
  const eligible = computed(() => restaurants.filter((r) => matchesFilters(r, filters.value)))
  const shortlistKey = computed(() => requestKey(rawInput.value, filters.value))
  const currentShortlist = computed(() => shortlist.value?.key === shortlistKey.value ? shortlist.value : null)
  const candidates = computed(() => {
    const picked = currentShortlist.value?.ids.flatMap((id) => eligible.value.filter((r) => r.id === id)) ?? []
    return picked.length ? picked : eligible.value
  })
  const selected = computed(() => selectedIds.value.map((id) => restaurants.find((r) => r.id === id)!).filter(Boolean))
  const swipeCandidates = computed(() => candidates.value.filter((r) => !selectedIds.value.includes(r.id) && !swipeHistory.value.some((choice) => choice.id === r.id)))
  const canStartDebate = computed(() => selected.value.length >= MIN_CONTESTANTS && selected.value.length <= MAX_CONTESTANTS)
  const decisionCandidates = computed(() => selected.value.filter((r) => matchesFilters(r, filters.value)))
  const winner = computed(() => decisionCandidates.value.find((r) => r.id === winnerId.value))
  const conditionTags = computed(() => [
    { key: 'people', text: `${filters.value.people} 人`, hard: true },
    ...(filters.value.maxBudget || filters.value.minBudget ? [{ key: 'budget', text: filters.value.maxBudget ? `¥${filters.value.minBudget || 0}–${filters.value.maxBudget} / 人` : `¥${filters.value.minBudget} 以上`, hard: true }] : []),
    { key: 'radius', text: filters.value.radius ? `${filters.value.radius} km 内` : '距离不限', hard: true },
    ...(filters.value.scene ? [{ key: 'scene', text: filters.value.scene, hard: false }] : []),
    ...(filters.value.quiet ? [{ key: 'quiet', text: '安静一点', hard: false }] : []),
    ...(filters.value.mild && !filters.value.noSpice ? [{ key: 'mild', text: '偏好少辣', hard: false }] : []),
    ...(filters.value.noSpice ? [{ key: 'noSpice', text: '不吃辣', hard: true }] : []),
    ...filters.value.allergies.map((item) => ({ key: `allergy:${item}`, text: `${item}过敏`, hard: true })),
    ...filters.value.avoidedIngredients.map((item) => ({ key: `avoid:${item}`, text: `不吃${item}`, hard: true })),
    ...filters.value.excludedCuisines.map((item) => ({ key: `exclude:${item}`, text: `不吃${item}`, hard: true })),
    ...filters.value.cuisines.map((c) => ({ key: `cuisine:${c}`, text: c, hard: true })),
  ])

  // New conditions start a fresh deck while keeping explicit invitations for reconciliation.
  watch(filters, () => { swipeHistory.value = [] }, { deep: true, flush: 'sync' })

  watch([rawInput, filters, selectedIds, swipeHistory, history, winnerId, shortlist], () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ dataset: DATASET, rawInput: rawInput.value, filters: filters.value, selectedIds: selectedIds.value, swipeHistory: swipeHistory.value, history: history.value, winnerId: winnerId.value, shortlist: shortlist.value })) } catch { /* Storage does not block the flow. */ }
  }, { deep: true })

  // Gives brief action feedback without introducing blocking dialogs.
  function notify(text: string) { toast.value = text; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.value = '' }, 3000) }

  // Clears the current dining flow when starting from the home page.
  function begin() { useIntakeStore().reset(); rawInput.value = ''; filters.value = defaultFilters(); selectedIds.value = []; swipeHistory.value = []; history.value = []; winnerId.value = '' }

  // Parses the initial description before the user invites restaurants from the swipe deck.
  function understand(text: string, confirmed?: Filters) { rawInput.value = text.trim(); filters.value = confirmed || parseRequirements(text, defaultFilters()); selectedIds.value = []; swipeHistory.value = []; winnerId.value = ''; history.value = [] }

  // Condition edits remove ineligible invitations without silently adding other restaurants.
  function reconcileSelection() {
    selectedIds.value = selectedIds.value.filter((id) => eligible.value.some((r) => r.id === id))
  }

  // Orb's picks straight onto the stage, best first, up to the stage's contestants (no swiping needed).
  function invitePicks(count = MAX_CONTESTANTS) {
    for (const restaurant of candidates.value) {
      if (selectedIds.value.length >= count) break
      if (selectedIds.value.includes(restaurant.id)) continue
      selectedIds.value.push(restaurant.id)
      swipeHistory.value.push({ id: restaurant.id, liked: true })
    }
  }

  function brief(): ShortlistBrief {
    const f = filters.value
    return {
      text: rawInput.value, people: f.people, minBudget: f.minBudget, maxBudget: f.maxBudget, scene: f.scene, time: f.time,
      quiet: f.quiet, mild: f.mild, noSpice: f.noSpice, cuisines: f.cuisines, excludedCuisines: f.excludedCuisines,
      preferences: f.preferences, allergies: f.allergies, avoidedIngredients: f.avoidedIngredients, locationName: f.locationName, center: f.center,
    }
  }

  // Asks the shortlist agent (POST /api/shortlist) to pick this request's deck from the shops within its hard limits.
  // A failure leaves the rule order in place; a newer request supersedes an older one still on its way.
  let shortlistRequest: AbortController | undefined
  async function refreshShortlist() {
    const key = shortlistKey.value, pool = eligible.value
    if (currentShortlist.value) { shortlistState.value = 'ready'; return }
    shortlistRequest?.abort()
    if (pool.length < 2) { shortlistState.value = 'idle'; return }
    const request = shortlistRequest = new AbortController()
    const timer = setTimeout(() => request.abort(), 55000)
    shortlistState.value = 'loading'
    try {
      const response = await fetch('/api/shortlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: request.signal,
        body: JSON.stringify({ brief: brief(), candidateIds: pool.map((r) => r.id) }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const result = await response.json() as ShortlistResult
      if (request !== shortlistRequest || key !== shortlistKey.value) return
      shortlist.value = { key, ids: result.picks.map((pick) => pick.id), reasons: Object.fromEntries(result.picks.map((pick) => [pick.id, pick.reason])), summary: result.summary, model: result.model }
      shortlistState.value = 'ready'
    } catch {
      if (request === shortlistRequest) shortlistState.value = 'failed'
    } finally {
      clearTimeout(timer)
    }
  }

  // Commits the visible card once, so canceled gestures and duplicate animation events cannot vote.
  function swipeRestaurant(id: string, liked: boolean) {
    if (swipeCandidates.value[0]?.id !== id || (liked && selectedIds.value.length >= MAX_CONTESTANTS)) return false
    swipeHistory.value.push({ id, liked })
    if (liked) selectedIds.value.push(id)
    return true
  }

  // Undo restores the previous card and reverses its invitation, including after a reload.
  function undoSwipe() {
    const choice = swipeHistory.value.pop()
    if (choice?.liked) removeSelection(choice.id)
  }

  function removeSelection(id: string) { selectedIds.value = selectedIds.value.filter((value) => value !== id) }
  function resetSwipes() { swipeHistory.value = [] }

  // Creates a fresh discussion for the current selection.
  function startDebate() {
    if (!canStartDebate.value || selected.value.some((r) => !matchesFilters(r, filters.value))) return false
    history.value = []; paused.value = false; winnerId.value = ''
    return true
  }

  // Keeps each performed line once, with the sources it cited.
  function recordLine(entry: HistoryEntry) {
    if (!history.value.some((item) => item.id === entry.id)) history.value.push(entry)
  }

  // A replayed or edited line takes its original's place and id, so later replies still find it.
  function replaceLine(id: string, changes: Pick<HistoryEntry, 'text' | 'topic' | 'evidenceIds' | 'time'>) {
    const entry = history.value.find((item) => item.id === id)
    if (entry) Object.assign(entry, changes)
    return !!entry
  }

  // A spoken interjection joins the history and updates the conditions; the stage reacts to it.
  function intervene(text: string) {
    const entry: HistoryEntry = { id: `user-${Date.now()}`, restaurantId: '', speakerId: 'user', speaker: '你', text, round: 0, topic: '补充需求', evidenceIds: [], time: new Date().toISOString(), user: true }
    history.value.push(entry)
    filters.value = parseRequirements(text, filters.value)
    notify('收到，选手会带着你的新要求继续讨论')
    return entry
  }

  // Commit only the restaurant explicitly confirmed by the user.
  function decide(id: string) {
    const choice = decisionCandidates.value.find((r) => r.id === id)
    if (!choice) return undefined
    winnerId.value = choice.id
    paused.value = true
    return choice
  }

  function distance(id: string) { const r = restaurants.find((v) => v.id === id); return r ? distanceKm(filters.value.center, r.coordinates).toFixed(1) : '—' }

  return { shortlist: currentShortlist, shortlistState, shortlistKey, refreshShortlist, invitePicks, eligible, brief, rawInput, filters, selectedIds, swipeHistory, swipeCandidates, history, winnerId, paused, toast, candidates, selected, decisionCandidates, canStartDebate, winner, conditionTags, notify, begin, understand, reconcileSelection, swipeRestaurant, undoSwipe, removeSelection, resetSwipes, startDebate, recordLine, replaceLine, intervene, decide, distance }
})
