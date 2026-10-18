import type { ActId, ExpressionId, GestureId, ReactionId } from './performance.ts'

// Who can speak on the stage: restaurant owners on the floor, the host above it and the
// customer (「我」) in the audience. Jev's state and the keyword baseline read only these fields.
export type CastKind = 'owner' | 'host' | 'user'

// What a persona falls back to when Jev is unsure or silent.
export interface PersonaDefaults { expr: ExpressionId; gesture: GestureId; act: ActId; reaction: ReactionId }

export interface CastMember {
  id: string
  kind: CastKind
  name: string
  restaurant: string
  plate: string
  persona: string
  cuisine?: string
  keywords?: readonly string[]
  defaults: PersonaDefaults
}

export const HOST_ID = 'host'
export const USER_ID = 'user'

const CALM: PersonaDefaults = { expr: 'idle', gesture: 'rest', act: 'none', reaction: 'listen' }

// agent-studio's catalog.json `characters.orb`; agent-studio calls the host 小选, this app Orb.
export function hostMember({ id = HOST_ID, name = 'Orb' } = {}): CastMember {
  return {
    id, kind: 'host', name, restaurant: '—', plate: '主持 · 需求收集 · 洞察 · 预订',
    persona: '无形象的中立选餐助手（呼吸光球）。收集模糊需求、筛选 top-3、在吃瓜中发现用户潜在需求并完成预订。',
    defaults: { ...CALM },
  }
}

// agent-studio's agents.py `_register_me`: the customer, who never stands on the floor.
export function userMember({ id = USER_ID, name = '我' } = {}): CastMember {
  return {
    id, kind: 'user', name, restaurant: '—', plate: '台下顾客 · 今晚吃啥',
    persona: '台下的顾客（用户本人），正在纠结今晚吃什么：会提问、提要求、吐槽，也会一次回应好几家店。',
    keywords: ['我', '顾客', '客人', '你们'],
    defaults: { ...CALM },
  }
}
