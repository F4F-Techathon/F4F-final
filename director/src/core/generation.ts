import { reactive } from 'vue'
import { PERFORMANCE_CATALOG } from '@/agents/catalog/performance'
import { runGeneration } from '@/agents/generation/generateAgent'
import { sha1Hex } from '@/agents/generation/sha1'
import type { ShopInfo } from '@/agents/generation/shop'
import type { BrandRef, GenerationDecision, GenerationStep } from '@/agents/generation/types'
import { askJev } from '@/agents/jev/client'
import { agentReport } from '@/agents/stage/report'
import { emit } from './events.ts'
import { STEP_ZH } from './labels.ts'
import { addCreated } from './library.ts'
import type { LibraryAgent } from './studioAgents.ts'

export interface StepState { status: 'wait' | 'run' | 'done'; decision?: GenerationDecision; data?: Record<string, unknown>; started?: number; ms?: number }
/** One shop turning into an agent, as the generation panel shows it. */
export interface GenerationRun {
  id: string
  shop: ShopInfo
  logo: string | null
  started: number
  steps: Record<GenerationStep, StepState>
  brand?: BrandRef
  agent?: LibraryAgent
  error?: string
  finished?: number
}

export const generation = reactive({ run: null as GenerationRun | null })

/** agent-studio's agent ids: "a" + the shop name's SHA-1, so a shop regenerates under the same id. */
export const agentIdFor = (name: string) => 'a' + sha1Hex(name).slice(0, 6)

const SOURCE_ZH: Record<string, string> = { jev: 'Jev', brand: '品牌', rules: '规则' }

// Runs the same generator the phone uses (形象 → 口音 → 组件, Jev first, keyword rules when Jev fails) in the
// console, and keeps the result in the asset library.
export async function generate(shop: ShopInfo): Promise<LibraryAgent> {
  if (generation.run && !generation.run.finished && !generation.run.error) throw new Error('上一个还在生成，稍等一下')
  const id = agentIdFor(shop.name)
  const run: GenerationRun = reactive({
    id, shop, logo: shop.logo ?? null, started: performance.now(),
    steps: { look: { status: 'wait' }, accent: { status: 'wait' }, assets: { status: 'wait' } },
  })
  generation.run = run
  emit('gen.start', id, shop.name)
  try {
    const contract = await runGeneration(shop, { id, catalog: PERFORMANCE_CATALOG, ask: askJev }, (event) => {
      if (event.type === 'start') { if (event.brand) run.brand = event.brand; return }
      if (event.type !== 'step') return
      if (event.status === 'run') {
        run.steps[event.step] = { status: 'run', started: performance.now() }
        emit('gen.step', id, `${event.step}:${STEP_ZH[event.step]} · 开始`)
      } else {
        const step = run.steps[event.step]
        const ms = event.decision.ms ?? Math.round(performance.now() - (step.started ?? run.started))
        run.steps[event.step] = { status: 'done', decision: event.decision, data: event.data, started: step.started, ms }
        emit('gen.step', id, `${event.step}:${STEP_ZH[event.step]} · ${SOURCE_ZH[event.decision.source] ?? event.decision.source} ${ms}ms${event.decision.note ? ` · ${event.decision.note}` : ''}`)
      }
    })
    const agent: LibraryAgent = { ...agentReport(contract).contract, ...(contract.logo ? { logo: contract.logo } : {}), source: 'created' }
    addCreated(agent)
    run.agent = agent
    run.finished = performance.now()
    emit('gen.done', id, `${agent.name} · 共 ${((run.finished - run.started) / 1000).toFixed(1)}s`)
    return agent
  } catch (error) {
    run.error = error instanceof Error ? error.message : String(error)
    emit('gen.error', id, run.error)
    throw error
  }
}

export function dismissGeneration() {
  if (generation.run && (generation.run.finished || generation.run.error)) generation.run = null
}
