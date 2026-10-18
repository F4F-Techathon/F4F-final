// Every asset of a character as a frame sequence: the rig is a pure function of time, so each frame is just
// Actor.state(t) sampled at 30 fps (agent-studio frames.js). The asset library flips through them.
import { RIG, type VisualState } from '@/lib/characterRig'
import type { Figure } from '@/agents/rig'
import { actor, type Crop } from './faces.ts'

export const FPS = 30
export interface Frame { i: number; t: number; st: VisualState; label?: string }
export interface Recipe { crop: Crop; frames: Frame[]; note?: string }

export function sample(a: ReturnType<typeof actor>, t0: number, t1: number, mutate?: (st: VisualState, t: number, i: number) => void): Frame[] {
  const out: Frame[] = []
  const n = Math.max(1, Math.round((t1 - t0) * FPS) + 1)
  for (let i = 0; i < n; i += 1) {
    const t = t0 + i / FPS
    const st = a.state(t)
    mutate?.(st, t, i)
    out.push({ i, t: +(t - t0).toFixed(3), st })
  }
  return out
}

const OSCILLATING: Record<string, number> = { waveL: 1 / 2.2, waveR: 1 / 2.2, wagL: 1 / 2.6, wagR: 1 / 2.6, handsUp: 1 / 3 }
const LOOPING_FX: Record<string, number> = { sweat: 40 / 26, steam: 1 / 0.9, anger: 0.4, sparkle: 1 / 1.8 }

export const recipes = {
  expr(figure: Figure, id: string): Recipe {
    const a = actor(figure)
    a.e(1, id)
    return { crop: 'head', frames: sample(a, 1, 1.4), note: `idle → ${id}：0.22 s 混合 + 0.34 s 头部挤压回弹` }
  },
  pose(figure: Figure, id: string): Recipe {
    const a = actor(figure)
    if (id === 'run') {
      a.run(1, 3, 3.2)
      return { crop: 'body', frames: sample(a, 1.2, 1.2 + 1 / 3.2), note: '跑步循环 3.2 Hz，一个周期' }
    }
    a.p(1, id, 0.3)
    const swing = OSCILLATING[id]
    return { crop: 'body', frames: sample(a, 1, swing ? 1.3 + swing : 1.34), note: `rest → ${id}：0.3 s easeOutBack${swing ? ' + 一个摆动周期' : ''}` }
  },
  act(figure: Figure, id: string, dur: number): Recipe {
    const a = actor(figure)
    if (id === 'none') return { crop: 'body', frames: sample(a, 1, 1), note: '无动作' }
    a.act(1, id, dur, 1)
    const jump = id === 'hop' || id === 'jump'
    const pre = jump ? 0.13 : 0
    const post = jump ? 0.2 : id === 'lean' || id === 'stepIn' ? 0.32 : 0.02
    return { crop: 'body', frames: sample(a, 1 - pre, 1 + dur + post), note: `时长 ${dur}s${pre ? ' · 含起跳预备与落地回弹' : ''}` }
  },
  viseme(figure: Figure, v: string): Recipe {
    const a = actor(figure)
    const frames: Frame[] = []
    for (let o = 0; o <= 9; o += 1) {
      const st = a.state(1)
      st.mouth = v
      st.open = o / 9
      frames.push({ i: o, t: o / 9, st, label: `开合 ${o}` })
    }
    return { crop: 'mouth', frames, note: '开合度 0–9（来自音量包络）' }
  },
  mouth(figure: Figure, m: string): Recipe {
    const st = actor(figure).state(1)
    st.mouth = m
    return { crop: 'mouth', frames: [{ i: 0, t: 0, st }] }
  },
  eye(figure: Figure, mode: string): Recipe {
    const a = actor(figure)
    if (mode === 'blink') {
      a.blinkAt = RIG.Actor.prototype.blinkAt
      const t0 = 0.9 + a.seed * 0.73
      return { crop: 'head', frames: sample(a, t0 - 0.02, t0 + 0.16), note: '眨眼 0.16 s' }
    }
    const st = a.state(1)
    st.eye = [mode, mode]
    if (mode === 'n') st.lid = [0.12, 0.12]
    return { crop: 'head', frames: [{ i: 0, t: 0, st }] }
  },
  hand(figure: Figure, hand: string): Recipe {
    const a = actor(figure)
    a.p(0, 'present', 0.01)
    const st = a.state(1)
    st.arms = [(st.arms as unknown[])[0], [50, 30, hand, 0]]
    return { crop: 'body', frames: [{ i: 0, t: 0, st }] }
  },
  fx(figure: Figure, id: string): Recipe {
    const a = actor(figure)
    a.fx(0.5, id, 9)
    if (id === 'excl') {
      // the "!" pops in on an expression change and leaves after 0.9 s
      a.e(1, 'idle')
      return { crop: 'head', frames: sample(a, 1, 1.3), note: '回弹弹出 0.25 s，0.9 s 后消失' }
    }
    const loop = LOOPING_FX[id]
    if (!loop) return { crop: 'head', frames: sample(a, 1.2, 1.2) }
    return { crop: id === 'steam' ? 'body' : 'head', frames: sample(a, 1.2, 1.2 + loop), note: `循环周期 ${loop.toFixed(2)} s` }
  },
  /** A template's calling card: a pitch with a thumbs-up, played back and forth. */
  showcase(figure: Figure): Recipe {
    const a = actor(figure)
    a.e(1, 'pitch').p(1, 'thumbR', 0.3)
    return { crop: 'body', frames: sample(a, 1, 1.5) }
  },
}
