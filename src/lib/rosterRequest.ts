// The customer asking, mid-debate, for someone to leave the stage or to join it ("把肯德基踢掉", "让谢叔下台",
// "把巡面加进来", "请赛百味上台"). The host Orb answers these itself and changes the line-up; everything else stays a
// question for the restaurants.

export interface RosterCandidate { id: string; name: string; hostName?: string }
export interface RosterRequest { act: 'exit' | 'enter'; id: string | null }

const EXIT = /踢|赶走|撤掉|移除|去掉|淘汰|下台|下去|出局|走人|请.{0,8}(走|离开|退场)|不要|不想要|不想吃|别让/
const EXIT_NEGATED = /别踢|不要踢|别赶|别移除|别淘汰|不要让.{0,8}下台|别让.{0,8}下台/
const ENTER = /加入|加上|加进|加回|上台|上来|登台|请.{0,8}(来|上)|叫.{0,8}来|回来|也来|再加|邀请/
// Without a shop named, only words that can only mean the line-up open the question "which one?".
const STRONG = /踢|下台|上台|登台|淘汰|出局|加入|加进/

// What a shop is called aloud: the brand before a "·" / "-" tagline, without a "(新启汇店)" branch.
export function spokenName(name: string) {
  return name.split(/[·\-—|｜]/)[0]!.replace(/[（(][^）)]*[）)]/g, '').trim() || name
}

function mentions(text: string, candidate: RosterCandidate) {
  // "SUBWAY赛百味" is also just 赛百味 aloud.
  const spoken = spokenName(candidate.name)
  const names = [candidate.name, spoken, spoken.replace(/[A-Za-z0-9\s&'.]+/g, ''), candidate.hostName ?? ''].filter((name) => name.length >= 2)
  return names.some((name) => text.includes(name))
}

/** The line-up change asked for, with the shop named (null id: asked, but no shop recognized), or null. */
export function rosterRequest(text: string, candidates: readonly RosterCandidate[]): RosterRequest | null {
  const named = candidates.filter((candidate) => mentions(text, candidate))
  // The longest match wins ("肯德基" over a shop whose spoken name is a prefix of it).
  const target = named.sort((a, b) => spokenName(b.name).length - spokenName(a.name).length)[0]
  const exit = EXIT.test(text) && !EXIT_NEGATED.test(text), enter = ENTER.test(text)
  if (!exit && !enter) return null
  const act = exit && !(enter && text.search(ENTER) < text.search(EXIT)) ? 'exit' : 'enter'
  if (target) return { act, id: target.id }
  return STRONG.test(text) ? { act, id: null } : null
}
