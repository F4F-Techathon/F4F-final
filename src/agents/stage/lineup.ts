// Who stands on the phone's stage: the invited hosts, minus any the console sent to the wings, and the
// guests it brought on. Stage directions arrive in the queue with the lines and apply in that order.
import { STAGE_MAX, type CastMessage, type GuestProfile } from '../feed/protocol.ts'

export interface StageGuest extends GuestProfile { id: string; onStage: boolean }
export interface Lineup {
  /** In the order they first came on; a guest who left stays here, in the wings, until removed. */
  guests: StageGuest[]
  /** Invited hosts sent to the wings. */
  out: string[]
}
export interface CastResult { lineup: Lineup; applied: boolean; note?: string }

export function emptyLineup(): Lineup { return { guests: [], out: [] } }

// Left to right: the invited hosts in invitation order (a returning host takes its old place), then guests.
export function performers(lineup: Lineup, hosts: readonly string[]): string[] {
  return [...hosts.filter((id) => !lineup.out.includes(id)), ...lineup.guests.filter((guest) => guest.onStage).map((guest) => guest.id)]
}

export function applyCast(lineup: Lineup, cue: CastMessage, hosts: readonly string[], max = STAGE_MAX): CastResult {
  const unchanged = (note: string): CastResult => ({ lineup, applied: false, note })
  if (cue.act === 'reset') return { lineup: emptyLineup(), applied: true, note: '阵容已复位' }
  const who = cue.who
  if (!who) return unchanged('没有指明是谁')
  const host = hosts.includes(who)
  const guest = lineup.guests.find((item) => item.id === who)
  const full = performers(lineup, hosts).length >= max
  switch (cue.act) {
    case 'enter': {
      if (host) {
        if (!lineup.out.includes(who)) return unchanged('本就在台上')
        if (full) return unchanged(`舞台已满（最多 ${max} 位）`)
        return { lineup: { ...lineup, out: lineup.out.filter((id) => id !== who) }, applied: true }
      }
      if (guest?.onStage) return unchanged('本就在台上')
      const profile = cue.guest ?? guest
      if (!profile) return unchanged('没有这位嘉宾的资料')
      if (full) return unchanged(`舞台已满（最多 ${max} 位）`)
      const entering: StageGuest = { ...profile, id: who, onStage: true }
      const guests = guest ? lineup.guests.map((item) => (item.id === who ? entering : item)) : [...lineup.guests, entering]
      return { lineup: { ...lineup, guests }, applied: true }
    }
    case 'exit': {
      if (host) {
        if (lineup.out.includes(who)) return unchanged('本就不在台上')
        return { lineup: { ...lineup, out: [...lineup.out, who] }, applied: true }
      }
      if (!guest?.onStage) return unchanged('本就不在台上')
      return { lineup: { ...lineup, guests: lineup.guests.map((item) => (item.id === who ? { ...item, onStage: false } : item)) }, applied: true }
    }
    case 'remove': {
      if (host) return unchanged('本场店主只能下场，不能撤下')
      if (!guest) return unchanged('没有这位嘉宾')
      return { lineup: { ...lineup, guests: lineup.guests.filter((item) => item.id !== who) }, applied: true }
    }
  }
}
