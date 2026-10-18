import { createServer } from 'node:http'
import { createServer as createSecureServer } from 'node:https'
import { existsSync, readFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp, DIRECTOR_BASE } from './app.ts'
import { AGENT_SOCKET_PATH, DEFAULT_AGENT_BACKEND } from './agentBackend.ts'
import { applyProxySettings } from './network.ts'
import { serviceStatus } from './status.ts'

// The project folder, wherever this is started from: the builds and the .env files are found relative to it.
const root = fileURLToPath(new URL('..', import.meta.url))
for (const file of ['.env', '.env.local']) if (existsSync(resolve(root, file))) process.loadEnvFile(resolve(root, file))
applyProxySettings(process.env)
if (!existsSync(resolve(root, 'dist', 'index.html'))) throw new Error('dist/ is missing: run npm run build before npm start（先在项目根目录运行 npm run build）')

const app = createApp({ root, env: process.env })
// TLS_CERT_FILE + TLS_KEY_FILE serve HTTPS, which phones need for the microphone when they open the app over the LAN.
const tls = process.env.TLS_CERT_FILE && process.env.TLS_KEY_FILE
  ? { cert: readFileSync(resolve(root, process.env.TLS_CERT_FILE)), key: readFileSync(resolve(root, process.env.TLS_KEY_FILE)) }
  : null
const server = tls ? createSecureServer(tls, app) : createServer(app)
const host = process.env.HOST || '0.0.0.0'
const port = process.env.PORT ? Number(process.env.PORT) : 3000

// What is reachable where, and which services are set up (names only, never a key).
function announce() {
  const scheme = tls ? 'https' : 'http'
  const bound = (server.address() as { port: number }).port
  const local = `${scheme}://localhost:${bound}`
  const lan = host === '0.0.0.0' || host === '::'
    ? Object.values(networkInterfaces()).flat().filter((item) => item && item.family === 'IPv4' && !item.internal).map((item) => `${scheme}://${item!.address}:${bound}/`)
    : []
  const services = serviceStatus(process.env, { app: 0, console: 0 })
  const mark = (on: boolean) => (on ? '✓' : '✗')
  const console_ = existsSync(resolve(root, 'director', 'dist', 'index.html'))
  console.log([
    `饭店请就位 已启动（Node ${process.version}）`,
    `  手机界面  ${local}/`,
    `  导演台    ${console_ ? `${local}${DIRECTOR_BASE}` : '未构建（npm run build 后可用）'}`,
    ...lan.map((url, index) => `  ${index ? '      ' : '局域网'}    ${url}`),
    ...(lan.length && !tls ? ['            （同一 Wi-Fi 的手机能打开；手机上要用麦克风需 HTTPS，见 HANDOVER.md）'] : []),
    `  服务      需求整理 LLM ${mark(services.llm.configured)}（备用 ${mark(services.llm.fallback.configured)}）· Jev ${mark(services.jev.configured)} · 高德地图 ${mark(services.amap.configured)} · 代理 ${mark(services.proxy.configured)}`,
    `  多智能体  ${process.env.AGENT_BACKEND_URL || DEFAULT_AGENT_BACKEND}（页面经 ${AGENT_SOCKET_PATH} 连接；后端未启动时辩论台改由导演台驱动）`,
    '  按 Ctrl+C 停止',
  ].join('\n'))
}

server.on('upgrade', (request, socket, head) => { if (!app.upgrade(request, socket, head)) socket.destroy() })
server.listen(port, host, announce)
// Open event streams would hold the process; closing the relay ends them. Containers send SIGTERM.
function stop() { app.close(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref() }
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
