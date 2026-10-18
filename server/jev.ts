import type { IncomingMessage, ServerResponse } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'
import type { JevErrorBody, JevErrorCode } from '../src/agents/jev/types.ts'

interface Config {
  apiKey: string
  model?: string
  timeoutMs?: number // per attempt, as agent-studio's call_jev
  backoffMs?: number // first wait after a 429/529; doubles once
}

export const JEV_API_URL = 'https://api.typesafe.ai/v1/systemone'
export const DEFAULT_JEV_MODEL = 'jev-latest'
const MAX_BODY = 64 * 1024
const MAX_QUESTIONS = 40
const ATTEMPTS = 3
const QUESTION_TYPES = new Set(['choice', 'score', 'noul'])

function send(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(value))
}

function fail(response: ServerResponse, status: number, code: JevErrorCode, error: string) {
  send(response, status, { error, code } satisfies JevErrorBody)
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isBusy = (status: number) => status === 429 || status === 529

// TypeSafe refuses browser CORS, so the browser builds every Jev request itself and this
// same-origin relay only checks it, adds the key and forwards it. Dev, preview and npm start share it.
export function createJevHandler(config: Config, requestFetch: typeof fetch = fetch) {
  const model = config.model || DEFAULT_JEV_MODEL
  const timeoutMs = config.timeoutMs ?? 25000
  const backoffMs = config.backoffMs ?? 800
  return async (request: IncomingMessage, response: ServerResponse, next?: () => void) => {
    if (request.url?.split('?')[0] !== '/api/jev') { next?.(); return }
    if (request.method !== 'POST') { fail(response, 405, 'bad_request', '请用 POST 提交表演决策。'); return }
    if (!request.headers['content-type']?.startsWith('application/json')) { fail(response, 415, 'bad_request', '无法读取这次决策请求。'); return }
    if (!config.apiKey) { fail(response, 503, 'no_key', '未配置 TYPESAFE_API_KEY，Jev 暂不可用。'); return }
    const controller = new AbortController()
    const disconnect = () => { if (!response.writableEnded) controller.abort() }
    response.on('close', disconnect)
    try {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of request) {
        size += chunk.length
        if (size > MAX_BODY) { fail(response, 413, 'bad_request', '这次决策请求太大了。'); return }
        chunks.push(chunk)
      }
      let input: unknown
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
      catch { input = null }
      const questions = isObject(input) && isObject(input.questions) ? Object.values(input.questions) : []
      if (!isObject(input) || !isObject(input.state) || !questions.length || !questions.every((q) => isObject(q) && QUESTION_TYPES.has(q.type as string))) {
        fail(response, 400, 'bad_request', '决策请求的格式不对。')
        return
      }
      if (questions.length > MAX_QUESTIONS) { fail(response, 400, 'bad_request', `题目太多了（最多 ${MAX_QUESTIONS} 道）。`); return }
      // only the configured model is used; anything else the page sends is dropped
      const body = JSON.stringify({ state: input.state, model, questions: input.questions })
      for (let attempt = 1; ; attempt++) {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)])
        const upstream = await requestFetch(JEV_API_URL, {
          method: 'POST', signal, body,
          headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        })
        if (!upstream.ok) {
          await upstream.body?.cancel()
          if (isBusy(upstream.status) && attempt < ATTEMPTS) {
            await sleep(backoffMs * 2 ** (attempt - 1), undefined, { signal: controller.signal })
            continue
          }
          if (isBusy(upstream.status)) fail(response, 429, 'busy', 'Jev 现在有点忙，稍后再试。')
          else fail(response, 502, 'upstream', 'Jev 暂时没有响应。')
          return
        }
        const payload: unknown = await upstream.json().catch(() => null)
        signal.throwIfAborted()
        if (!isObject(payload) || !isObject(payload.answers)) { fail(response, 502, 'upstream', 'Jev 返回的结果无法读取。'); return }
        send(response, 200, { model: typeof payload.model === 'string' ? payload.model : model, answers: payload.answers, usage: isObject(payload.usage) ? payload.usage : null })
        return
      }
    } catch (error) {
      if (controller.signal.aborted || response.destroyed) return // the browser left: nobody to answer
      if ((error as { name?: unknown } | null)?.name === 'TimeoutError') fail(response, 504, 'timeout', 'Jev 响应超时。')
      else fail(response, 502, 'upstream', 'Jev 暂时没有响应。')
    } finally {
      response.off('close', disconnect)
    }
  }
}
