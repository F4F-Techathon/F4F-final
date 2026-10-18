// The multi-agent backend's realtime protocol (Backend/eat-what-backend, WS /api/realtime), as this app speaks it.
// JSON messages carry commands and events; binary messages carry PCM audio as
// [uint32 little-endian header length][UTF-8 JSON header][PCM s16le mono]. Imports nothing, so tests and the Node
// server can use it as is.

/** Every backend event: seq counts up per session, epoch is the cancellation generation. */
export interface BackendEvent<T = Record<string, unknown>> { sessionId: string; seq: number; epoch: number; type: string; at?: number; data: T }

export type SpeechAct = 'present' | 'attack' | 'respond' | 'compare' | 'answer' | 'clarify'
export const SPEECH_ACT_ZH: Record<string, string> = { present: '自荐', attack: '开怼', respond: '回击', compare: '对比', answer: '回答你', clarify: '追问' }

/** One merchant record a line cites, as the backend read it from the CSV snapshot. */
export interface BackendFact {
  id: string
  restaurantId: string
  kind: 'shop' | 'dish' | 'review' | 'package' | 'coupon' | string
  quote: string
  dateRaw?: string
  star?: string
  sourceLabel?: string
}

/** A restaurant agent as the backend built it; restaurantId is the shop_uuid, the same id this app uses. */
export interface BackendCharacter { restaurantId: string; restaurantName: string; displayRestaurantName: string; characterName: string; nameSource: string; personaVersion: string }
export interface RestaurantsUpdated { revision: number; reason: string; restaurants: BackendCharacter[]; addedRestaurantIds: string[]; removedRestaurantIds: string[] }

export interface TurnEvent {
  phase: 'start' | 'generated' | 'cancel'
  turnId: string
  restaurantId?: string
  speaker?: string
  speechAct?: SpeechAct
  targetRestaurantId?: string | null
  replyTo?: string[]
  discussionDimension?: string
  reason?: string
  audio?: boolean
}
/** `gloss`: a regional host speaks `text` in its dialect, and this is the Mandarin it was rewritten from (原文释义). */
export interface SpeechReady { turnId: string; speakerId: string; speaker: string; speechAct?: SpeechAct; discussionDimension?: string; text: string; gloss?: string; language?: string; evidence: BackendFact[]; audioEnabled: boolean }
export interface TextDone { phase: 'done'; turnId: string; speakerId: string; text: string; gloss?: string; replyTo: string[]; evidence: BackendFact[]; segments: { segmentId: string; text: string; audio: { sampleStart: number; sampleEnd: number; sampleRate: number } | null }[] }
export interface AudioEvent { phase: 'start' | 'end'; turnId: string; sampleRate?: number; samples?: number }
/** interim: what has been said so far while the button is held; final: the whole press, on release. */
export interface TranscriptEvent { phase: 'interim' | 'final'; utteranceId: number; text: string }
export interface ResultEvent { restaurantId: string | null; reasons: string[]; cautions: string[] }
export interface ErrorEvent { code: string; message: string; recoverable?: boolean }
export interface StateEvent { status?: string; engine?: string; ttsProvider?: string; micReady?: boolean; userSpeaking?: boolean; restaurantIds?: string[] }

/** What the user asked for, in the backend's terms (server/console_preferences.py). */
export interface BackendPreferences { maxBudget?: number; quiet?: boolean; noSpice?: boolean; allergySource?: string; userNotes?: string[] }
/** This app's host for each restaurant: the backend speaks under its name and picks a voice to match. */
/** `language`: the catalog language the host speaks (src/agents/generation/languages.ts); the backend rewrites a regional
 *  host's lines into its dialect (Backend/eat-what-backend/server/console_localize.py). */
export interface BackendCharacterHint { characterName?: string; gender?: 'female' | 'male'; age?: 'young' | 'middle' | 'old'; language?: string }
/** A line the stage already performed, oldest first, for a new session to go on from (server/console_resume.py). */
export type BackendHistoryItem =
  | { turnId: string; restaurantId: string; text: string; evidenceIds: string[] }
  | { turnId: string; role: 'user'; text: string }

export type PlaybackStatus = 'progress' | 'ended' | 'interrupted' | 'failed'

let commands = 0
export function command(sessionId: string, type: string, data: Record<string, unknown> = {}) {
  return JSON.stringify({ sessionId, commandId: `c-${Date.now().toString(36)}-${(++commands).toString(36)}`, type, data })
}

export const MIC_RATE = 16000
export const MIC_FRAME_SAMPLES = 320 // 20 ms at 16 kHz, the only frame size the backend accepts

/** A microphone frame for the backend: 320 samples of 16 kHz mono s16le, numbered without gaps. */
export function encodeMicFrame(streamId: string, chunkSeq: number, pcm: Int16Array): ArrayBuffer {
  if (pcm.length !== MIC_FRAME_SAMPLES) throw new Error(`a mic frame is ${MIC_FRAME_SAMPLES} samples`)
  const header = new TextEncoder().encode(JSON.stringify({ kind: 'mic', streamId, chunkSeq, sampleOffset: chunkSeq * MIC_FRAME_SAMPLES }))
  const frame = new Uint8Array(4 + header.length + pcm.byteLength)
  new DataView(frame.buffer).setUint32(0, header.length, true)
  frame.set(header, 4)
  frame.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 4 + header.length)
  return frame.buffer
}

export interface AudioFrameHeader { kind: 'tts'; epoch: number; turnId: string; segmentId: string; speakerId: string; chunkSeq: number; sampleOffset: number }

/** A TTS frame from the backend, or null for anything malformed. */
export function decodeAudioFrame(buffer: ArrayBuffer): { header: AudioFrameHeader; pcm: Int16Array } | null {
  if (buffer.byteLength < 4) return null
  const length = new DataView(buffer).getUint32(0, true)
  if (length > 2048 || 4 + length >= buffer.byteLength) return null
  let header: AudioFrameHeader
  try { header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, length))) } catch { return null }
  if (header?.kind !== 'tts' || typeof header.turnId !== 'string' || typeof header.epoch !== 'number') return null
  const bytes = buffer.byteLength - 4 - length
  if (bytes % 2) return null
  // Copied so the samples are aligned whatever the header length was.
  return { header, pcm: new Int16Array(buffer.slice(4 + length)) }
}
