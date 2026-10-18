<template>
  <div class="profile">
    <Stagelet :figure="figure" :seq="SEQ" :active="active" />
    <div class="facts">
      <div class="fact"><small>体型</small><div>{{ body.zh }} · {{ body.gender === 'female' ? '女' : '男' }} · {{ HEIGHT[body.height] }}</div></div>
      <div class="fact"><small>骨架参数</small><div>腿长 lext {{ body.lext }} · 躯干宽 W {{ body.W }} · 肩宽 {{ body.shoulder }} · 腿粗 {{ body.legW }} · 舞台缩放 {{ body.scale }}{{ body.round ? ' · 圆身' : '' }}</div></div>
      <div class="fact"><small>可换部件</small><div>发型 {{ HAIRS[body.gender].length }} · 服装 {{ OUTFITS.length }} · 帽子 {{ HATS.length }} · 配饰 {{ body.gender === 'female' ? '眼镜 / 耳环' : '眼镜 / 小胡子' }} · 肤色 {{ SKINS.length }}</div></div>
      <div class="fact"><small>由店铺决定</small><div>主题色（logo 主色，或 Jev 从色板里选）、胸牌（直接印店铺 logo）、发色、年龄（老年自动灰发、皱纹）</div></div>
      <div class="fact"><small>沿用原片</small><div>{{ EXPRESSIONS.length }} 表情 · {{ POSES.length }} 姿势 · {{ ACTS.length - 1 }} 动作 · {{ VISEMES.length }} 口型 · {{ EFFECTS.length }} 特效：同一个 RIG.Actor 驱动</div></div>
    </div>
  </div>
  <section v-for="group in variants" :key="group.title" class="lib-sec">
    <h2>{{ group.title }}</h2>
    <div class="grid">
      <SpecimenCard v-for="variant in group.items" :key="variant.sub" :spec="{ figure, still: () => lookStill({ kind: 'kit', look: { ...look, ...variant.look } }, group.crop) }" :zh="variant.zh" :sub="variant.sub" :crop="group.crop" inert />
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { ACTS, EXPRESSIONS } from '@/agents/catalog/performance'
import type { Figure, KitLook } from '@/agents/rig'
import { HAIRS, HATS, OUTFITS, SKINS } from '@/agents/rig/rigkit.js'
import { lookStill } from '../assets/faces.ts'
import { EFFECTS, POSES, VISEMES } from '../assets/vocabulary.ts'
import type { Character } from '../core/registry.ts'
import SpecimenCard from './SpecimenCard.vue'
import Stagelet from './Stagelet.vue'

// A generic template: its body, and every interchangeable part drawn on it.
const props = defineProps<{ character: Character; active: boolean }>()
const SEQ: [string, string][] = [['pitch', 'thumbR'], ['listen', 'rest'], ['laugh', 'belly'], ['shock', 'rest'], ['proud', 'present'], ['idle', 'rest']]
const HEIGHT = { short: '矮', regular: '标准', tall: '高' } as const
const figure = computed(() => props.character.figure as Figure)
const look = computed(() => (props.character.figure as { look: KitLook }).look)
const body = computed(() => props.character.body!)
const THEMES: [string, string][] = [['中国红', '#C9483E'], ['玉石绿', '#2F6E62'], ['藏青', '#2D3E6B'], ['姜黄', '#D8A93B'], ['梅子紫', '#7A5A9E'], ['橙', '#D9822B']]
const variants = computed(() => {
  const gender = body.value.gender
  return [
    { title: '发型', crop: 'head' as const, items: HAIRS[gender].map(([id, zh]) => ({ zh, sub: id, look: { hair: id, hat: 'none' } as Partial<KitLook> })) },
    { title: '服装', crop: 'body' as const, items: OUTFITS.map(([id, zh]) => ({ zh: zh.split(' + ')[0]!, sub: id, look: { outfit: id } as Partial<KitLook> })) },
    { title: '帽子', crop: 'head' as const, items: HATS.map(([id, zh]) => ({ zh, sub: id, look: { hat: id } as Partial<KitLook> })) },
    { title: '配饰 · 年龄', crop: 'head' as const, items: [
      { zh: '眼镜', sub: 'glasses', look: { accessories: ['glasses'] } as Partial<KitLook> },
      gender === 'female' ? { zh: '耳环', sub: 'earrings', look: { accessories: ['earrings'] } as Partial<KitLook> } : { zh: '小胡子', sub: 'mustache', look: { accessories: ['mustache'] } as Partial<KitLook> },
      { zh: '老年', sub: 'age: old', look: { age: 'old' } as Partial<KitLook> },
      { zh: '胸牌印 logo', sub: 'badge', look: { badgeText: '湘', theme: '#C9483E' } as Partial<KitLook> },
    ] },
    { title: '主题色', crop: 'body' as const, items: THEMES.map(([zh, color]) => ({ zh, sub: color, look: { theme: color } as Partial<KitLook> })) },
  ]
})
</script>
