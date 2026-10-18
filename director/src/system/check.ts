// The film's dialogue performed by Jev, scored against how the film was choreographed by hand
// (agent-studio system.js validate()): the speaker's opening face, gesture and act, and each listener's reaction.
import { hostMember, userMember, type CastMember, type PersonaDefaults } from '@/agents/catalog/personas'
import { LANGUAGES } from '@/agents/generation/languages'
import { decideLine } from '@/agents/jev/decideLine'
import type { JevAnswers, Turn } from '@/agents/jev/types'
import { FILM_CHARACTERS, FILM_HOST, FILM_LINES, type FilmLine } from '../data/film.ts'

export type ScoreKey = 'expr' | 'gesture' | 'act' | 'listener'
/** Per kind: [top-1 hits, top-3 hits, judged]. */
export type Score = Record<ScoreKey, [number, number, number]>
export interface Judged { choice: string; truth: string; p: number; hit1: boolean; hit3: boolean }
export interface CheckRow {
  line: FilmLine
  source?: 'jev' | 'baseline'
  note?: string
  error?: string
  answers?: JevAnswers
  expr?: Judged
  gesture?: Judged
  act?: Judged
  listeners: (Judged & { who: string })[]
}

/** The film's cast exactly as agent-studio's catalog gives it to Jev, the host named 小选. */
export function filmCast(): CastMember[] {
  return [
    ...FILM_CHARACTERS.map((film): CastMember => ({
      id: film.id, kind: 'owner', name: film.name, restaurant: film.restaurant, plate: film.plate, persona: film.persona,
      cuisine: film.cuisine, keywords: [...film.keywords], defaults: film.defaults as PersonaDefaults,
    })),
    hostMember({ id: FILM_HOST.id, name: FILM_HOST.name }), userMember({ id: 'me' }),
  ]
}

// How each line is spoken, as agent-studio sent it: Cantonese and French lines as such, 蓉姐 in Sichuanese,
// Pierre in French-accented Mandarin, everyone else in Mandarin.
export function lineLanguage(line: FilmLine) {
  const id = line.lang === 'yue' ? 'yue' : line.lang === 'fr' ? 'fr' : line.who === 'rong' ? 'sc' : line.who === 'pierre' ? 'frzh' : 'zh'
  return LANGUAGES.find((item) => item.id === id)?.zh ?? '普通话'
}

export const emptyScore = (): Score => ({ expr: [0, 0, 0], gesture: [0, 0, 0], act: [0, 0, 0], listener: [0, 0, 0] })

function judge(answers: JevAnswers, key: string, truth: string | null | undefined, score: Score, kind: ScoreKey): Judged | undefined {
  const answer = answers[key]
  if (!truth || !answer || answer.type !== 'choice') return undefined
  const ranked = Object.entries(answer.probabilities ?? {}).sort((a, b) => b[1] - a[1]).map(([id]) => id)
  const hit1 = answer.choice === truth, hit3 = ranked.slice(0, 3).includes(truth)
  score[kind][0] += Number(hit1)
  score[kind][1] += Number(hit3)
  score[kind][2] += 1
  return { choice: answer.choice, truth, p: answer.probabilities?.[truth] ?? 0, hit1, hit3 }
}

/** Runs the thirteen lines in order; each row arrives as soon as Jev answers it. */
export async function runCheck(onRow: (row: CheckRow, score: Score) => void, signal?: AbortSignal) {
  const cast = filmCast(), score = emptyScore(), history: Turn[] = []
  for (const line of FILM_LINES) {
    if (signal?.aborted) return score
    const quoted = line.truth.quote ? FILM_LINES.find((item) => item.id === line.truth.quote) : undefined
    try {
      const decision = await decideLine({
        cast, speaker: line.who, text: line.text, language: lineLanguage(line), quotes: quoted ? [{ who: quoted.who, text: quoted.text }] : [],
        history: history.slice(-4), stage: FILM_CHARACTERS.map((film) => film.id),
      }, { signal })
      history.push({ who: line.who, text: line.text })
      const answers = decision.answers
      const listeners = Object.entries(line.truth.listeners).flatMap(([who, truth]) => {
        const judged = judge(answers, `listener_${who}`, truth, score, 'listener')
        return judged ? [{ ...judged, who }] : []
      })
      onRow({
        line, source: decision.source, ...(decision.note ? { note: decision.note } : {}), answers, listeners,
        expr: judge(answers, 'speaker_expr', line.truth.expr, score, 'expr'), gesture: judge(answers, 'speaker_gesture', line.truth.gesture, score, 'gesture'),
        act: judge(answers, 'speaker_act', line.truth.act, score, 'act'),
      }, score)
    } catch (error) {
      if (signal?.aborted) return score
      onRow({ line, error: error instanceof Error ? error.message : String(error), listeners: [] }, score)
    }
  }
  return score
}
