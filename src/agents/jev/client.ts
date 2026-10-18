import type { JevAnswers, JevErrorCode, JevQuestion, JevResponse } from './types.ts'

// TypeSafe refuses browser CORS, so every call goes through the same-origin relay
// (server/jev.ts), which only adds the key and forwards the request.
export const JEV_ENDPOINT = '/api/jev'

const CODES: readonly JevErrorCode[] = ['no_key', 'bad_request', 'busy', 'timeout', 'upstream', 'bad_response', 'network', 'http']

// A failed call. `code` tells a missing key (no_key, HTTP 503) apart from every other failure.
export class JevError extends Error {
  readonly code: JevErrorCode
  readonly status: number

  constructor(code: JevErrorCode, status: number, message: string) {
    super(message)
    this.name = 'JevError'
    this.code = code
    this.status = status
  }
}

// Jev is not configured: the one failure callers report differently from the rest.
export const isNoKey = (error: unknown) => error instanceof JevError && error.code === 'no_key'

// Any typed question set (line decisions, the avatar generator's steps): the relay checks the rest.
export type AskJev = (
  state: object, questions: Readonly<Record<string, { type: JevQuestion['type'] }>>, options?: { signal?: AbortSignal },
) => Promise<JevResponse>

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

// One Jev request: the state plus typed questions in, one answer per question out.
export const askJev: AskJev = async (state, questions, { signal } = {}) => {
  const started = performance.now()
  let response: Response
  try {
    response = await fetch(JEV_ENDPOINT, {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state, questions }),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new JevError('network', 0, '连不上 Jev 中转服务。')
  }
  const payload: unknown = await response.json().catch(() => null)
  signal?.throwIfAborted()
  if (!response.ok) {
    const body = isObject(payload) ? payload : {}
    const code = CODES.find((c) => c === body.code) ?? 'http'
    throw new JevError(code, response.status, typeof body.error === 'string' ? body.error : `Jev 中转服务返回 HTTP ${response.status}。`)
  }
  if (!isObject(payload) || !isObject(payload.answers)) throw new JevError('bad_response', response.status, 'Jev 返回的结果无法读取。')
  return {
    model: typeof payload.model === 'string' ? payload.model : undefined,
    answers: payload.answers as JevAnswers,
    usage: isObject(payload.usage) ? payload.usage : null,
    latencyMs: Math.round(performance.now() - started),
  }
}
