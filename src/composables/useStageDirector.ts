import { inject, provide, type InjectionKey } from 'vue'
import type { Actor } from '@/lib/characterRig'

// What choreography may do to an actor on stage, on the director's shared clock (seconds).
export interface StageActor {
  e(t: number, expression: string): StageActor
  p(t: number, pose: string, duration?: number): StageActor
  act(t: number, name: string, duration?: number, amplitude?: number): StageActor
  look(t: number, x: number, y: number): StageActor
  cancelAfter(t: number): StageActor
}

// The face and gesture an actor shows at a moment, from the cues it was given (for checks and tools).
export interface StageCue { expression?: string; pose?: string }

export interface StageDirector {
  actors: Record<string, StageActor>
  now(): number
  register(id: string, actor: Actor, origin: number, onCue?: (localTime: number) => void): () => void
  cueAt(id: string, t?: number): StageCue | null
}

const STAGE_DIRECTOR: InjectionKey<StageDirector> = Symbol('stage-director')

// Every avatar keeps its own clock (blinks count from its mount); cues arrive on one shared clock
// and are translated per actor, so a line can schedule the speaker and all listeners together.
export function createStageDirector(): StageDirector {
  const actors: Record<string, StageActor> = {}
  const logs: Record<string, { expression: [number, string][]; pose: [number, string][] }> = {}
  const now = () => performance.now() / 1000

  function register(id: string, actor: Actor, origin: number, onCue?: (localTime: number) => void) {
    const log = { expression: [] as [number, string][], pose: [] as [number, string][] }
    const local = (t: number) => {
      const localTime = Math.max(0, t - origin)
      onCue?.(localTime)
      return localTime
    }
    const remember = (rows: [number, string][], t: number, value: string) => { rows.push([t, value]); rows.sort((a, b) => a[0] - b[0]) }
    const stageActor: StageActor = {
      e: (t, expression) => { actor.e(local(t), expression); remember(log.expression, t, expression); return stageActor },
      p: (t, pose, duration) => { actor.p(local(t), pose, duration); remember(log.pose, t, pose); return stageActor },
      act: (t, name, duration, amplitude) => { actor.act(local(t), name, duration, amplitude); return stageActor },
      look: (t, x, y) => { actor.look(local(t), x, y); return stageActor },
      cancelAfter: (t) => {
        actor.cancelAfter(local(t))
        log.expression = log.expression.filter(([at]) => at <= t)
        log.pose = log.pose.filter(([at]) => at <= t)
        return stageActor
      },
    }
    actors[id] = stageActor
    logs[id] = log
    return () => { if (actors[id] === stageActor) { delete actors[id]; delete logs[id] } }
  }

  function cueAt(id: string, t = now()): StageCue | null {
    const log = logs[id]
    if (!log) return null
    const last = (rows: [number, string][]) => rows.filter(([at]) => at <= t).at(-1)?.[1]
    return { expression: last(log.expression), pose: last(log.pose) }
  }

  return { actors, now, register, cueAt }
}

export function provideStageDirector(director: StageDirector) { provide(STAGE_DIRECTOR, director) }
export function useStageDirector() { return inject(STAGE_DIRECTOR, null) }
