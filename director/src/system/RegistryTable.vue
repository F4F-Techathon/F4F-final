<template>
  <div class="tablewrap">
    <table class="vt">
      <thead><tr><th>agent</th><th>id</th><th>类型</th><th>店铺</th><th>口音</th><th>形象</th><th>来源</th><th>状态</th></tr></thead>
      <tbody>
        <tr v-for="row in rows" :key="row.character.id">
          <td><div class="cell"><Face :who="row.character.id" :size="24" /><b>{{ row.character.name }}</b></div></td>
          <td class="mono sub2">{{ row.character.id }}</td>
          <td>{{ row.type }}</td>
          <td>{{ row.character.restaurant }}</td>
          <td>{{ language(row.character) }}</td>
          <td class="sub2">{{ look(row.character) }}</td>
          <td class="sub2">{{ source(row.character) }}</td>
          <td :class="row.state === '在台上' ? 'hit' : 'sub2'">{{ row.state }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import type { CastEntry } from '@/agents/feed/protocol'
import { LANGUAGES } from '@/agents/generation/languages'
import { useDirector } from '../core/director.ts'
import { SOURCE_ZH } from '../core/labels.ts'
import { ME, ORB, useRegistry, type Character } from '../core/registry.ts'
import Face from '../ui/Face.vue'

// Everyone in the show (the customer, the floor, the host, the wings), then every agent in the library that could come on.
const director = useDirector(), registry = useRegistry()
interface Row { character: Character; type: string; state: string }

function typeOf(character: Character) {
  if (character.kind === 'host') return '本场店主'
  if (character.source === 'created') return '导演台新建'
  if (character.source === 'studio') return character.brand ? '品牌 agent' : 'agent-studio'
  return '嘉宾'
}
const of = (entry: CastEntry) => registry.get(entry.id)
const rows = computed<Row[]>(() => {
  const list: Row[] = [{ character: ME, type: '用户', state: '台下' }]
  for (const entry of director.onStage.value) { const c = of(entry); if (c) list.push({ character: c, type: typeOf(c) + (entry.kind === 'guest' ? ' · 嘉宾' : ''), state: entry.status === 'ready' ? '在台上' : '化妆中' }) }
  list.push({ character: ORB, type: '主持', state: '舞台上方' })
  for (const entry of director.wings.value) { const c = of(entry); if (c) list.push({ character: c, type: `${typeOf(c)} · 候场`, state: '候场' }) }
  const inShow = new Set(director.cast.value.map((entry) => entry.id))
  for (const c of registry.agents.value) if (!inShow.has(c.id)) list.push({ character: c, type: typeOf(c), state: '资产库' })
  return list
})

const language = (character: Character) => (character.kind === 'orb' || character.kind === 'me' ? '普通话' : LANGUAGES.find((item) => item.id === character.language)?.zh ?? character.language ?? '—')
function look(character: Character) {
  if (character.kind === 'orb') return '光球'
  if (character.kind === 'me') return '台下（无形象）'
  const rig = character.agent?.rig ?? (character.figure?.kind === 'kit' ? character.figure.look : undefined)
  if (!rig) return '生成中'
  if (rig.brand) return `品牌形象 · ${rig.body}`
  return [rig.body, rig.hair, rig.outfit, rig.hat && rig.hat !== 'none' ? rig.hat : ''].filter(Boolean).join(' · ')
}
function source(character: Character) {
  const agent = character.agent
  if (!agent) return character.kind === 'orb' || character.kind === 'me' ? '—' : '手机生成中'
  const time = new Date(agent.created)
  return `${SOURCE_ZH[agent.source]}${Number.isNaN(time.getTime()) ? '' : ` · ${time.toLocaleString('zh-CN', { hour12: false })}`}`
}
</script>
