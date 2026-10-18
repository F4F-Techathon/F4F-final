// The people a line can involve, as Jev reads them: every generated host on stage, the guests the
// console brought on, the host Orb (above the stage) and the customer (in the audience).
import { ACTS, EXPRESSIONS, GESTURES, REACTIONS } from '../catalog/performance.ts'
import { hostMember, userMember, type CastMember, type PersonaDefaults } from '../catalog/personas.ts'
import type { GuestProfile } from '../feed/protocol.ts'
import type { AgentContract } from '../generation/types.ts'
import type { StageLayout } from '../performance/plan.ts'

export const HOST_NAME = 'Orb'
export const USER_NAME = '我'

export function ownerMember(contract: AgentContract): CastMember {
  return {
    id: contract.id,
    kind: 'owner',
    name: contract.name,
    restaurant: contract.restaurant,
    plate: contract.plate,
    persona: contract.persona,
    cuisine: contract.cuisine,
    keywords: contract.keywords,
    // The generator only picks catalog ids (src/agents/generation/generateAgent.ts).
    defaults: contract.defaults as PersonaDefaults,
  }
}

const known = <T extends string>(ids: readonly T[], value: string, fallback: T): T => (ids.includes(value as T) ? value as T : fallback)

// A guest reads to Jev exactly like a host on the floor; its fallbacks come from outside, so each is checked.
export function guestMember(id: string, guest: GuestProfile): CastMember {
  const d = guest.defaults
  return {
    id,
    kind: 'owner',
    name: guest.name,
    restaurant: guest.restaurant,
    plate: guest.plate,
    persona: guest.persona,
    cuisine: guest.cuisine,
    keywords: guest.keywords,
    defaults: {
      expr: known(EXPRESSIONS.map((e) => e.id), d.expr, 'pitch'),
      gesture: known(GESTURES.map((g) => g.id), d.gesture, 'present'),
      act: known(ACTS.map((a) => a.id), d.act, 'none'),
      reaction: known(REACTIONS, d.reaction, 'listen'),
    },
  }
}

export function stageCast(contracts: readonly AgentContract[], guests: readonly (GuestProfile & { id: string })[] = []): CastMember[] {
  return [...contracts.map(ownerMember), ...guests.map((guest) => guestMember(guest.id, guest)), hostMember({ name: HOST_NAME }), userMember({ name: USER_NAME })]
}

// Seats as TheaterStage lays them out (stageSlots offsets), so gazes point at the right neighbour.
// `seats` lists everyone standing there when some of them (a host still being drawn) cannot act yet.
export function stageLayout(order: readonly string[], offsets: readonly number[], seats: readonly string[] = order): StageLayout {
  return { order, x: (id) => offsets[seats.indexOf(id)] }
}
