<template>
  <div class="lib-h">
    <h1>资产</h1>
    <span class="acts">
      <button class="btn sm ghost" type="button" title="导入 agent-studio 生成的 agent（agents/<id>.json）" @click="file?.click()"><Icon name="folder" />导入 agent-studio JSON</button>
      <input ref="file" type="file" accept="application/json,.json" multiple hidden @change="importFiles" />
    </span>
  </div>
  <section class="lib-sec">
    <h2>通用模板 · 形象<small>6 种体型 · 4 发型 · 4 服装 · 4 帽子 · 配饰 · 胸牌 logo · 主题色 —— 表情、手势、动作、口型、特效沿用原片 rig</small></h2>
    <div v-for="gender in (['female', 'male'] as const)" :key="gender" class="tpl-row">
      <div class="tpl-g">{{ gender === 'female' ? '女' : '男' }}</div>
      <SpecimenCard v-for="character in TEMPLATES.filter((item) => item.body?.gender === gender)" :key="character.id" :spec="showcase(character)" :zh="character.name"
        :sub="`${HEIGHT[character.body!.height]} · 腿长 ${character.body!.lext}`" crop="body" showcase @open="emit('open', character.id, 'parts')" />
    </div>
  </section>
  <section class="lib-sec">
    <h2>品牌形象<small>{{ MASCOTS.length }} 个品牌 · 店名认出是这些品牌，就由它自己的形象出镜，不套用人形模板；可以在「登台」时直接请上舞台</small></h2>
    <div v-for="(row, index) in mascotRows" :key="index" class="tpl-row">
      <div class="tpl-g">品牌</div>
      <SpecimenCard v-for="character in row" :key="character.id" :spec="showcase(character)" :zh="character.fullName" :sub="mascotZh(character)" crop="body" showcase @open="emit('open', character.id, 'parts')" />
    </div>
  </section>
  <section class="lib-sec">
    <h2>品牌 agent<small>agent-studio 里按品牌生成的店主 · 没有对应店铺也能作为嘉宾登台</small></h2>
    <div class="agent-grid">
      <EntityCard v-for="character in registry.studio.value" :key="character.id" :character="character" @open="emit('open', character.id)" />
    </div>
  </section>
  <section class="lib-sec">
    <h2>本场店主 · {{ registry.phoneHosts.value.length }}<small>手机按店铺信息实时生成：形象 → 口音 → 组件，每一步先问 Jev</small></h2>
    <div class="agent-grid">
      <EntityCard v-for="character in registry.phoneHosts.value" :key="character.id" :character="character" @open="emit('open', character.id)" />
      <div v-if="!registry.phoneHosts.value.length" class="empty-card"><Icon name="spark" /><b>手机上还没生成店主</b><span>手机进入滑卡后就会按顺序生成，生成好的会出现在这里</span></div>
    </div>
  </section>
  <section class="lib-sec">
    <h2>新建的 agent · {{ registry.created.value.length }}<small>在演播页点「+ 添加」，输入店铺信息和 logo 生成</small></h2>
    <div class="agent-grid">
      <EntityCard v-for="character in registry.created.value" :key="character.id" :character="character" @open="emit('open', character.id)" />
      <div v-if="!registry.created.value.length" class="empty-card"><Icon name="plus" /><b>还没有新建的 agent</b><span>演播页「+ 添加」→ 新建店铺 agent</span></div>
    </div>
  </section>
  <section class="lib-sec">
    <h2>原片角色<small>原片里的三位手绘店主 · 系统页的 Jev 一致性检查也用它们</small></h2>
    <div class="agent-grid">
      <EntityCard v-for="character in FILM" :key="character.id" :character="character" @open="emit('open', character.id)" />
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { mascot } from '@/agents/rig/mascots.js'
import { recipes } from '../assets/frames.ts'
import type { SpecimenSpec } from '../assets/specimens.ts'
import { importStudioText } from '../core/library.ts'
import { FILM, MASCOTS, TEMPLATES, useRegistry, type Character } from '../core/registry.ts'
import Icon from '../ui/Icon.vue'
import { toast } from '../ui/toast.ts'
import EntityCard from './EntityCard.vue'
import SpecimenCard from './SpecimenCard.vue'

// The library's landing page: templates first, then brand mascots and agents, the phone's hosts, agents made here, the film's three.
const emit = defineEmits<{ open: [id: string, category?: string] }>()
const registry = useRegistry()
const file = ref<HTMLInputElement>()
const HEIGHT = { short: '矮 / 娇小', regular: '标准', tall: '高' } as const
const mascotRows = computed(() => Array.from({ length: Math.ceil(MASCOTS.length / 3) }, (_, index) => MASCOTS.slice(index * 3, index * 3 + 3)))
const mascotZh = (character: Character) => mascot((character.figure as { look: { body: string } }).look.body)?.zh.split(' · ')[0] ?? ''
const showcase = (character: Character): SpecimenSpec => ({ figure: character.figure!, recipe: () => recipes.showcase(character.figure!), mode: 'pingpong' })

async function importFiles(event: Event) {
  const input = event.target as HTMLInputElement
  for (const picked of [...(input.files ?? [])]) {
    try {
      const agent = importStudioText(await picked.text())
      toast(`已导入 ${agent.name} · ${agent.restaurant}`)
    } catch (error) { toast(`${picked.name}：${error instanceof Error ? error.message : error}`, 'bad', 3600) }
  }
  input.value = ''
}
</script>
