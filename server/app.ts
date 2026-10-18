import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { createReadStream, statSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { createIntakeHandler, intakeConfig } from './intake.ts'
import { createOrbHandler, createShortlistHandler } from './shortlist.ts'
import { createJevHandler } from './jev.ts'
import { createConfigHandler } from './publicConfig.ts'
import { createStageRelay } from './stageRelay.ts'
import { createStatusHandler } from './status.ts'
import { createAgentProxy, createAgentStatus, DEFAULT_AGENT_BACKEND } from './agentBackend.ts'

export interface AppOptions {
  /** The project folder: the phone app is served from dist/, the test console from director/dist/. */
  root: string
  env: Record<string, string | undefined>
}

export type App = ((request: IncomingMessage, response: ServerResponse) => void) & {
  /** Ends the stage relay's open streams, so the server can shut down at once. */
  close(): void
  /** WebSocket upgrades: the multi-agent backend's realtime socket. True when handled. */
  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): boolean
}

/** Where the test console lives; dev runs it on its own port (5174) instead. */
export const DIRECTOR_BASE = '/director/'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.map': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
}

function isFile(path: string) {
  try { return statSync(path).isFile() } catch { return false }
}

// A request path inside a folder, or null when it climbs out of it.
function inside(folder: string, pathname: string) {
  const path = resolve(folder, '.' + pathname)
  return path === folder || path.startsWith(folder + sep) ? path : null
}

function plain(response: ServerResponse, status: number, text = '') {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(text)
}

// Vite fingerprints everything under assets/, so those may be cached for good; everything else is checked each time.
function sendFile(request: IncomingMessage, response: ServerResponse, path: string, pathname: string) {
  response.writeHead(200, {
    'Content-Type': MIME[extname(path).toLowerCase()] || 'application/octet-stream',
    'Content-Length': statSync(path).size,
    'Cache-Control': /\/assets\//.test(pathname) ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  })
  if (request.method === 'HEAD') response.end()
  else createReadStream(path).pipe(response)
}

// One handler for the whole product: the APIs (requirements intake, the shortlist agent, Jev, the stage relay, status, public config),
// the phone app at / and the test console at /director/, so a single `node server/index.ts` runs everything.
export function createApp({ root, env }: AppOptions): App {
  const intake = createIntakeHandler(intakeConfig(env))
  // The agent that picks the swipe deck's shops for the confirmed request, with the same LLM settings.
  const shortlist = createShortlistHandler(intakeConfig(env))
  // Orb, the debate's host, as an agent: line-up changes and finding shops for new wishes.
  const orb = createOrbHandler(intakeConfig(env))
  const jev = createJevHandler({ apiKey: env.TYPESAFE_API_KEY || '', model: env.TYPESAFE_MODEL || '' })
  const stage = createStageRelay()
  // AGENT_BACKEND_URL: the multi-agent backend (Backend/eat-what-backend); its socket is served at /api/agents/realtime.
  const agentTarget = env.AGENT_BACKEND_URL || DEFAULT_AGENT_BACKEND
  const status = createStatusHandler(env, stage.presence, createAgentStatus(agentTarget))
  const config = createConfigHandler(env)
  const appFolder = resolve(root, 'dist'), consoleFolder = resolve(root, 'director', 'dist')

  function serveStatic(request: IncomingMessage, response: ServerResponse) {
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.setHeader('Allow', 'GET, HEAD'); plain(response, 405); return }
    let url: URL, pathname: string
    try { url = new URL(request.url || '/', 'http://localhost'); pathname = decodeURIComponent(url.pathname) }
    catch { plain(response, 400); return }
    if (pathname.startsWith('/api/')) { plain(response, 404, '没有这个接口。'); return }
    if (pathname === DIRECTOR_BASE.slice(0, -1)) { response.writeHead(301, { Location: DIRECTOR_BASE + url.search }); response.end(); return }

    // The console's own build first; the app's public files it shares (shop data, icons) next; any other path is its page.
    if (pathname.startsWith(DIRECTOR_BASE)) {
      const rest = pathname.slice(DIRECTOR_BASE.length - 1)
      const own = inside(consoleFolder, rest), shared = inside(appFolder, rest)
      if (!own || !shared) { plain(response, 403); return }
      if (isFile(own)) { sendFile(request, response, own, pathname); return }
      if (extname(rest)) { if (isFile(shared)) sendFile(request, response, shared, pathname); else plain(response, 404); return }
      const page = resolve(consoleFolder, 'index.html')
      if (isFile(page)) sendFile(request, response, page, pathname)
      else plain(response, 404, '导演台还没有构建：在项目根目录运行 npm run build。')
      return
    }

    const path = inside(appFolder, pathname)
    if (!path) { plain(response, 403); return }
    if (isFile(path)) { sendFile(request, response, path, pathname); return }
    if (extname(pathname)) { plain(response, 404); return }
    const page = resolve(appFolder, 'index.html')
    if (isFile(page)) sendFile(request, response, page, pathname)
    else plain(response, 404, '页面还没有构建：在项目根目录运行 npm run build。')
  }

  const app = ((request, response) => {
    void intake(request, response, () => void shortlist(request, response, () => void orb(request, response, () => void jev(request, response, () => stage(request, response,
      () => status(request, response, () => config(request, response, () => serveStatic(request, response))))))))
  }) as App
  app.close = stage.close
  app.upgrade = createAgentProxy(agentTarget)
  return app
}
