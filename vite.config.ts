import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createIntakeHandler, intakeConfig } from './server/intake.ts'
import { createOrbHandler, createShortlistHandler } from './server/shortlist.ts'
import { createJevHandler } from './server/jev.ts'
import { applyProxySettings } from './server/network.ts'
import { createConfigHandler } from './server/publicConfig.ts'
import { createStageRelay } from './server/stageRelay.ts'
import { createStatusHandler } from './server/status.ts'
import { AGENT_SOCKET_PATH, createAgentStatus, DEFAULT_AGENT_BACKEND } from './server/agentBackend.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  applyProxySettings(env)
  const intake = createIntakeHandler(intakeConfig(env))
  const shortlist = createShortlistHandler(intakeConfig(env))
  const orb = createOrbHandler(intakeConfig(env))
  // Jev decisions (the key stays here) and the relay that brings the stage its lines.
  const jev = createJevHandler({ apiKey: env.TYPESAFE_API_KEY || '', model: env.TYPESAFE_MODEL || '' })
  const stage = createStageRelay()
  // The multi-agent backend (Backend/eat-what-backend): its realtime socket is proxied below, its health shows in /api/status.
  const agentTarget = env.AGENT_BACKEND_URL || DEFAULT_AGENT_BACKEND
  const status = createStatusHandler(env, stage.presence, createAgentStatus(agentTarget))
  const agentProxy = { [AGENT_SOCKET_PATH]: { target: agentTarget, ws: true, changeOrigin: true, rewrite: (path: string) => path.replace(AGENT_SOCKET_PATH, '/api/realtime') } }
  // The map key reaches the page at run time (GET /api/config), so nothing secret is built into it.
  const config = createConfigHandler(env)
  return {
    plugins: [
      vue(),
      { name: 'dining-intake', configureServer(server) { server.middlewares.use(intake); server.middlewares.use(shortlist); server.middlewares.use(orb) }, configurePreviewServer(server) { server.middlewares.use(intake); server.middlewares.use(shortlist); server.middlewares.use(orb) } },
      {
        name: 'agent-stage',
        configureServer(server) { server.middlewares.use(jev); server.middlewares.use(stage); server.middlewares.use(status); server.middlewares.use(config); server.httpServer?.once('close', stage.close) },
        configurePreviewServer(server) { server.middlewares.use(jev); server.middlewares.use(stage); server.middlewares.use(status); server.middlewares.use(config); server.httpServer?.once('close', stage.close) },
      },
    ],
    server: { proxy: agentProxy },
    preview: { proxy: agentProxy },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
