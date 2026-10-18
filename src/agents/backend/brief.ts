// What this app tells the multi-agent backend, and how the backend's turns become stage lines.
// Pure functions: the bridge (src/composables/useAgentBackend.ts) and the tests share them.
import type { LineMessage } from '../feed/protocol.ts'
import type { BackendCharacterHint, BackendFact, BackendHistoryItem, BackendPreferences, SpeechReady, TurnEvent } from './protocol.ts'
import { SPEECH_ACT_ZH } from './protocol.ts'

// Structural types, so this file needs nothing from the app's modules.
interface FiltersLike {
  maxBudget: number; quiet: boolean; noSpice: boolean; mild: boolean; allergies: string[]; avoidedIngredients: string[]
  scene: string; preferences: string[]; cuisines: string[]; excludedCuisines: string[]
}
interface EvidenceLike { id: string; restaurantId: string; kind: 'business' | 'review' | 'summary'; title: string; text?: string; source: string; date?: string; mock: boolean }

/**
 * The customer's confirmed requirements, as the backend reads them (server/console_preferences.py): hard limits as
 * fields, everything else as the customer's own words in userNotes, which the backend keeps and re-reads every turn.
 */
export function preferencesFor(filters: FiltersLike, rawInput: string, people?: number | null): BackendPreferences {
  const preferences: BackendPreferences = {}
  if (filters.maxBudget > 0) preferences.maxBudget = filters.maxBudget
  if (filters.quiet) preferences.quiet = true
  if (filters.noSpice) preferences.noSpice = true
  const avoid = [...filters.allergies.map((item) => `${item}过敏`), ...filters.avoidedIngredients.map((item) => `不吃${item}`)]
  if (avoid.length) preferences.allergySource = `过敏与忌口：${avoid.join('、')}`.slice(0, 600)
  const notes: string[] = []
  if (rawInput.trim()) notes.push(rawInput.trim().slice(0, 300))
  const extras = [
    filters.scene && `场景：${filters.scene}`,
    people ? `一共${people}位` : '',
    filters.mild && !filters.noSpice ? '口味想清淡、少辣' : '',
    filters.cuisines.length ? `想吃${filters.cuisines.join('、')}` : '',
    filters.excludedCuisines.length ? `不想吃${filters.excludedCuisines.join('、')}` : '',
    ...filters.preferences,
  ].filter(Boolean)
  if (extras.length) notes.push(extras.join('；').slice(0, 300))
  if (notes.length) preferences.userNotes = notes
  return preferences
}

interface HostLike { id: string }
interface ContractLike { name: string; language?: string; rig: { gender?: string; age?: string } }

/** The hosts standing on stage, by restaurant id: the backend speaks under these names, with voices to match. */
export function characterHints(hosts: HostLike[], contractOf: (host: HostLike) => ContractLike | null | undefined): Record<string, BackendCharacterHint> {
  const hints: Record<string, BackendCharacterHint> = {}
  for (const host of hosts) {
    const contract = contractOf(host)
    if (!contract) continue
    const hint: BackendCharacterHint = {}
    if (contract.name && contract.name.length <= 12) hint.characterName = contract.name
    if (contract.rig.gender === 'female' || contract.rig.gender === 'male') hint.gender = contract.rig.gender
    if (contract.rig.age === 'young' || contract.rig.age === 'middle' || contract.rig.age === 'old') hint.age = contract.rig.age
    if (contract.language && contract.language !== 'zh' && /^[a-z]{2,10}$/.test(contract.language)) hint.language = contract.language
    hints[host.id] = hint
  }
  return hints
}

interface HistoryEntryLike { id: string; restaurantId: string; text: string; gloss?: string; evidenceIds?: string[]; user?: boolean }
const HISTORY_LIMIT = 200 // as many as the backend reads from one session.start

/**
 * The debate so far, for a new backend session to go on from (the customer left the debate page and came back): the
 * lines of the hosts on stage under their line ids, which are the backend's turn ids, with the sources they cited, and
 * the customer's own words. The guide's lines (speaker 'host') and the guests' are this app's own and stay out. A line a
 * regional host said in dialect goes back as the Mandarin it was written in, as the backend first had it.
 */
export function historyForBackend(history: HistoryEntryLike[], restaurantIds: string[]): BackendHistoryItem[] {
  const items: BackendHistoryItem[] = []
  for (const entry of history) {
    const text = (entry.gloss || entry.text).trim().slice(0, 600)
    if (!text) continue
    if (entry.user) items.push({ turnId: entry.id, role: 'user', text })
    else if (restaurantIds.includes(entry.restaurantId))
      items.push({ turnId: entry.id, restaurantId: entry.restaurantId, text, evidenceIds: (entry.evidenceIds || []).slice(0, 12) })
  }
  return items.slice(-HISTORY_LIMIT)
}

const FACT_TITLES: Record<string, string> = { shop: '商家资料', dish: '推荐菜', package: '到店套餐', coupon: '代金券' }

/** A record the backend cited, as an evidence card under the line. */
export function evidenceFromBackend(fact: BackendFact): EvidenceLike {
  const review = fact.kind === 'review'
  const negative = review && fact.sourceLabel === '差评'
  const star = review && fact.star ? ` · ${fact.star} 星` : ''
  return {
    id: fact.id, restaurantId: fact.restaurantId, kind: review ? 'review' : 'business',
    title: review ? `${negative ? '差评' : '评价'}${star}` : FACT_TITLES[fact.kind] || '商家资料',
    // Dianping review text keeps its emoji codes ([米饭]); the cards show prose.
    text: fact.quote.replace(/\[[^\]\s]{1,6}\]/g, '').trim().slice(0, 400),
    source: '大众点评', ...(fact.dateRaw ? { date: fact.dateRaw } : {}), mock: false,
  }
}

/** A backend turn, at the moment its text is ready, as a stage line: the turn id is the line id. */
export function lineFromSpeech(ready: SpeechReady, plan?: TurnEvent): LineMessage {
  const act = ready.speechAct || plan?.speechAct
  const topic = [act && SPEECH_ACT_ZH[act], ready.discussionDimension || plan?.discussionDimension].filter(Boolean).join(' · ')
  return {
    kind: 'line', id: ready.turnId, speaker: ready.speakerId, text: ready.text.slice(0, 600),
    ...(ready.gloss?.trim() && ready.gloss.trim() !== ready.text.trim() ? { gloss: ready.gloss.trim().slice(0, 600) } : {}),
    ...(plan?.replyTo?.length ? { replyTo: plan.replyTo.slice(0, 12) } : {}),
    ...(topic ? { topic: topic.slice(0, 40) } : {}),
    ...(ready.evidence?.length ? { evidenceIds: ready.evidence.map((fact) => fact.id).slice(0, 12) } : {}),
  }
}

/** Roughly how long a line takes to say, in samples, before its audio has all arrived (about 4.5 characters a second). */
export function expectedSamples(text: string, rate = 24000) {
  return Math.round(text.length * 0.22 * rate)
}
