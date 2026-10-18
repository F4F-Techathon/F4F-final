import { baseline } from './baseline.ts'
import { askJev, isNoKey, type AskJev } from './client.ts'
import { buildLineQuestions, buildLineState } from './lineDecision.ts'
import type { LineDecision, LineInput } from './types.ts'

// Port of agent-studio's POST /api/decide, run in the browser: one line in, every actor's
// performance choices out. Jev first; the keyword baseline when Jev is missing or fails.

export type DecideEngine = 'auto' | 'jev' | 'baseline'

export interface DecideOptions {
  ask?: AskJev
  engine?: DecideEngine // 'jev' fails loudly instead of falling back (except without a key, as /api/decide)
  signal?: AbortSignal
  hostName?: string // default: the cast's host, so the scene names the same host as recent_turns
}

const MAX_TEXT = 300
const MAX_QUOTES = 6
export const NO_KEY_NOTE = '未配置 TYPESAFE_API_KEY，使用关键词基线（不是 Jev）。'

export async function decideLine(input: LineInput, { ask = askJev, engine = 'auto', signal, hostName }: DecideOptions = {}): Promise<LineDecision> {
  const started = performance.now()
  const text = input.text.trim()
  if (!text || Array.from(text).length > MAX_TEXT) throw new Error(`台词需要 1–${MAX_TEXT} 个字。`)
  // as /api/decide: only quotes with words, at most six
  const quotes = (input.quotes ?? []).filter((q) => q.text.trim()).slice(0, MAX_QUOTES)
  const host = hostName ?? input.cast.find((c) => c.kind === 'host')?.name
  const { state, listeners } = buildLineState({ ...input, text, quotes }, { hostName: host })
  const questions = buildLineQuestions(input.cast, input.speaker, listeners)
  const request = { state, questions }
  const elapsed = () => Math.round(performance.now() - started)
  let note: string | undefined
  if (engine !== 'baseline') {
    try {
      const res = await ask(state, questions, { signal })
      return { source: 'jev', request, answers: res.answers, ...(res.model ? { model: res.model } : {}), latencyMs: elapsed() }
    } catch (error) {
      if (signal?.aborted) throw error
      if (isNoKey(error)) note = NO_KEY_NOTE
      else if (engine === 'jev') throw error
      else note = `Jev 调用失败，已回退到关键词基线：${error instanceof Error ? error.message : String(error)}`
    }
  }
  const res = baseline(input.cast, input.speaker, text, quotes, questions, listeners)
  return { source: 'baseline', ...(note ? { note } : {}), request, answers: res.answers, model: res.model, latencyMs: elapsed() }
}
