import type { IncomingMessage, ServerResponse } from 'node:http'

/** The AMap JS API loads with a key plus either the security code itself or a proxy that adds it. */
export type AMapConfig = { key: string; securityJsCode: string } | { key: string; serviceHost: string }

/** What the browser may know, read from the server's environment on every request: nothing here is built into the page. */
export interface PublicConfig { amap: AMapConfig | null }

// The AMap settings once had VITE_ names (Vite built them into the page); those names still work.
function pick(env: Record<string, string | undefined>, name: string) { return env[name] || env[`VITE_${name}`] || '' }

export function publicConfig(env: Record<string, string | undefined>): PublicConfig {
  const key = pick(env, 'AMAP_KEY')
  if (!key) return { amap: null }
  const serviceHost = pick(env, 'AMAP_SERVICE_HOST')
  return { amap: serviceHost ? { key, serviceHost } : { key, securityJsCode: pick(env, 'AMAP_SECURITY_CODE') } }
}

// GET /api/config: the map key travels to the page at run time, so a build carries no key and one build runs anywhere.
export function createConfigHandler(env: Record<string, string | undefined>) {
  return (request: IncomingMessage, response: ServerResponse, next?: () => void) => {
    if (request.url?.split('?')[0] !== '/api/config') { next?.(); return }
    const status = request.method === 'GET' || request.method === 'HEAD' ? 200 : 405
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    response.end(request.method === 'HEAD' ? undefined : JSON.stringify(status === 200 ? publicConfig(env) : { error: '请用 GET 读取配置。' }))
  }
}
