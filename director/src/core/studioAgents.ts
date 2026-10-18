// Agents generated in agent-studio (agent-studio/agents/*.json), as the console's asset library keeps them.
// They pass through the stage protocol's own check, so whatever the library holds can go on stage as a guest.
// Plain TypeScript with relative imports: the tests load it without Vite.
import { parseAppMessage, type AgentProfile } from '../../../src/agents/feed/protocol.ts'

export type AgentSource = 'phone' | 'studio' | 'created'
export interface StudioVoice { timbre: string; speed: number }
/** A generated host in the library: from the phone, imported from agent-studio, or made here with 「+」. */
export interface LibraryAgent extends AgentProfile {
  source: AgentSource
  /** agent-studio's voice choice, kept for reference: voice is not connected in this app. */
  studio?: { voice?: StudioVoice; voiceDesc?: string }
}

const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {})

// agent-studio writes local time without a zone ("2026-10-17 17:12:47").
function isoTime(value: unknown) {
  if (typeof value !== 'string') return new Date(0).toISOString()
  const time = new Date(value.includes('T') ? value : value.replace(' ', 'T'))
  return Number.isNaN(time.getTime()) ? new Date(0).toISOString() : time.toISOString()
}

/** Throws (with the failing field) when the file is not an agent-studio agent contract. */
export function fromStudioAgent(raw: unknown): LibraryAgent {
  const source = record(raw)
  const { contract } = parseAppMessage({ kind: 'agent', contract: { ...source, created: isoTime(source.created) } }) as { contract: AgentProfile }
  const energy = record(record(record(record(source.decisions).assets).answers).energy).score
  const voice = record(source.voice)
  const studio = {
    ...(typeof voice.timbre === 'string' && typeof voice.speed === 'number' ? { voice: { timbre: voice.timbre, speed: voice.speed } } : {}),
    ...(typeof source.voiceDesc === 'string' ? { voiceDesc: source.voiceDesc } : {}),
  }
  return {
    ...contract,
    ...(contract.energy == null && typeof energy === 'number' ? { energy: Math.max(0, Math.min(3, energy)) } : {}),
    source: 'studio',
    ...(Object.keys(studio).length ? { studio } : {}),
  }
}
