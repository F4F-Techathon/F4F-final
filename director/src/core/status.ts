import { reactive } from 'vue'
import { IN_DEV } from './where.ts'

// What /api/status says the app server has set up; never any key itself.
export interface ServiceStatus {
  jev: { configured: boolean; model: string }
  llm: { configured: boolean; model: string | null; fallback?: { configured: boolean; model: string | null } }
  amap: { configured: boolean }
  proxy: { configured: boolean }
  voice: { configured: boolean }
  relay: { app: number; console: number }
  /** The multi-agent backend the debate page connects to (server/agentBackend.ts): its model and voice. */
  agents?: { url: string; reachable: boolean; model: string | null; tts: string | null }
}

const TTS_LABELS: Record<string, string> = {
  dashscope: '百炼 Qwen3-TTS', 'dashscope-qwen-tts': '百炼 Qwen3-TTS', 'cosyvoice3-local': 'CosyVoice3', 'cosyvoice-http': 'CosyVoice3', cosyvoice: 'CosyVoice3',
  windows: 'Windows 语音', 'macos-say': 'macOS 语音', none: '',
}

/** The voice the debate actually speaks with: the backend's TTS when it is online, else none. */
export function voiceOf(status: ServiceStatus | null) {
  const agents = status?.agents
  const name = agents?.reachable && agents.tts ? (TTS_LABELS[agents.tts] ?? agents.tts) : ''
  return { on: !!name, name }
}

export const service = reactive({ status: null as ServiceStatus | null, error: '' })
let timer: ReturnType<typeof setInterval> | undefined

async function poll() {
  try {
    const response = await fetch('/api/status', { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    service.status = await response.json() as ServiceStatus
    service.error = ''
  } catch {
    service.error = IN_DEV ? '读不到服务状态，手机端服务（5173）开着吗？' : '读不到服务状态，服务（npm start）还开着吗？'
  }
}

export function watchStatus() {
  if (timer) return
  void poll()
  timer = setInterval(poll, 5000)
}
