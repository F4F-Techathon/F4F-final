// How long a line lasts on stage and where its beats fall (agent-studio plan.js / live.js).
// There is no audio here: a line lasts as long as its typewriter, and every beat is a fraction of that.

export const TYPE_MS = 65 // the debate typewriter reveals one character every 65 ms
export const MIN_LINE = 0.6 // seconds; as live.js, no line counts as shorter, so the beats keep apart
export const DECIDE_WAIT = 1.0 // seconds the typewriter waits for Jev before it starts anyway
export const SETTLE_DELAY = 2.6 // seconds after a line ends before the cast eases back (unless cancelled)

// Fractions of the line's duration.
export const BEATS = {
  quoted: 0.22, // a listener the line answers reacts first…
  bystander: 0.4, // …everyone else a beat later
  secondTarget: 0.48, // answering several people: the speaker turns to the next one
  thumb: 0.62, // a wink or star punchline comes with a thumbs-up
  punch: 0.64, // the punchline face lands
  kiss: 0.66, // a kiss punchline: fingers to the lips…
  kissOut: 0.82, // …and blown out
} as const

// Counts UTF-16 units, as the typewriter reveals `text.length` of them.
export function typingDuration(text: string, msPerChar = TYPE_MS) {
  return Math.max(MIN_LINE, (text.length * msPerChar) / 1000)
}
