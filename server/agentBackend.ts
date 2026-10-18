import type { IncomingMessage } from 'node:http'
import { connect, type Socket } from 'node:net'
import { connect as connectTls } from 'node:tls'
import type { Duplex } from 'node:stream'

/** Where the page opens the multi-agent backend's realtime socket; this server passes it through. */
export const AGENT_SOCKET_PATH = '/api/agents/realtime'
export const DEFAULT_AGENT_BACKEND = 'http://127.0.0.1:8771'

// The page talks to its own origin and this server forwards the WebSocket to the backend (Backend/eat-what-backend,
// /api/realtime), so phones on the LAN or behind HTTPS never need to reach the backend's own address.
// The tunnel is byte for byte after the upgrade: frames, binary audio and closing are the backend's own.
export function createAgentProxy(target = DEFAULT_AGENT_BACKEND) {
  const base = new URL(target)
  const secure = base.protocol === 'https:' || base.protocol === 'wss:'
  const port = Number(base.port) || (secure ? 443 : 80)
  const path = `${base.pathname.replace(/\/$/, '')}/api/realtime`
  return (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const [pathname = '', search = ''] = (request.url || '').split('?')
    if (pathname !== AGENT_SOCKET_PATH) return false
    const upstream: Socket = secure ? connectTls({ host: base.hostname, port, servername: base.hostname }) : connect({ host: base.hostname, port })
    const ready = () => {
      const lines = [`GET ${path}${search ? `?${search}` : ''} HTTP/1.1`, `Host: ${base.host}`]
      for (let i = 0; i < request.rawHeaders.length; i += 2) {
        const name = request.rawHeaders[i]!
        if (name.toLowerCase() !== 'host') lines.push(`${name}: ${request.rawHeaders[i + 1]}`)
      }
      upstream.write(`${lines.join('\r\n')}\r\n\r\n`)
      if (head.length) upstream.write(head)
      upstream.pipe(socket)
      socket.pipe(upstream)
    }
    upstream.once(secure ? 'secureConnect' : 'connect', ready)
    upstream.setNoDelay(true)
    upstream.on('error', () => {
      // Not upgraded yet: say so in HTTP, so the page sees a failed connection rather than a silent one.
      if (!socket.destroyed && (socket as Socket).bytesWritten === 0) socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
      else socket.destroy()
    })
    socket.on('error', () => upstream.destroy())
    socket.on('close', () => upstream.destroy())
    upstream.on('close', () => socket.destroy())
    return true
  }
}

export interface AgentBackendStatus { url: string; reachable: boolean; model: string | null; tts: string | null }

// For /api/status: is the backend up, and with which model and voices. Cached briefly; never blocks long.
export function createAgentStatus(target = DEFAULT_AGENT_BACKEND, requestFetch: typeof fetch = fetch) {
  let cached: { at: number; value: AgentBackendStatus } | null = null
  return async (): Promise<AgentBackendStatus> => {
    if (cached && Date.now() - cached.at < 5000) return cached.value
    let value: AgentBackendStatus = { url: target, reachable: false, model: null, tts: null }
    try {
      const response = await requestFetch(new URL('api/config', target.replace(/\/?$/, '/')), { signal: AbortSignal.timeout(1500) })
      if (response.ok) {
        const config = await response.json() as { llmModel?: string; ttsProvider?: string; llmConfigured?: boolean }
        value = { url: target, reachable: true, model: config.llmConfigured ? config.llmModel || null : null, tts: config.ttsProvider || null }
      }
    } catch { /* unreachable */ }
    cached = { at: Date.now(), value }
    return value
  }
}
