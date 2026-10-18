import type { IncomingMessage, ServerResponse } from 'node:http'
import type { RelayPresence } from '../src/agents/feed/protocol.ts'
import type { AgentBackendStatus } from './agentBackend.ts'
import { DEFAULT_JEV_MODEL } from './jev.ts'
import { publicConfig } from './publicConfig.ts'

export interface ServiceStatus {
  jev: { configured: boolean; model: string }
  llm: { configured: boolean; model: string | null; fallback: { configured: boolean; model: string | null } }
  amap: { configured: boolean }
  proxy: { configured: boolean }
  /** Streaming voice is left to the multi-agent system. */
  voice: { configured: false }
  relay: RelayPresence
  /** The multi-agent backend the debate page connects to, when this server knows of it. */
  agents?: AgentBackendStatus
}

// What the test console's status pills show: which services are set up, never any key itself.
export function serviceStatus(env: Record<string, string | undefined>, relay: RelayPresence): ServiceStatus {
  return {
    jev: { configured: !!env.TYPESAFE_API_KEY, model: env.TYPESAFE_MODEL || DEFAULT_JEV_MODEL },
    llm: {
      configured: !!(env.LLM_API_KEY && env.LLM_BASE_URL && env.LLM_MODEL), model: env.LLM_MODEL || null,
      // A backup provider for every agent (requirements intake here, coordinator and restaurants in the multi-agent backend).
      fallback: { configured: !!(env.LLM_FALLBACK_API_KEY && env.LLM_FALLBACK_BASE_URL && env.LLM_FALLBACK_MODEL), model: env.LLM_FALLBACK_MODEL || null },
    },
    amap: { configured: !!publicConfig(env).amap },
    proxy: { configured: !!(env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy) },
    voice: { configured: false },
    relay,
  }
}

export function createStatusHandler(env: Record<string, string | undefined>, presence: () => RelayPresence, agents?: () => Promise<AgentBackendStatus>) {
  return async (request: IncomingMessage, response: ServerResponse, next?: () => void) => {
    if (request.url?.split('?')[0] !== '/api/status') { next?.(); return }
    const status = request.method === 'GET' ? 200 : 405
    const body = status === 200 ? { ...serviceStatus(env, presence()), ...(agents ? { agents: await agents() } : {}) } : { error: '请用 GET 读取状态。' }
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify(body))
  }
}
