<template>
  <section class="dock" aria-label="角色">
    <AgentCard who="user" :index="1" />
    <AgentCard v-for="(entry, index) in performers" :key="entry.id" :who="entry.id" :index="index + 2 <= 9 ? index + 2 : 0" />
    <AgentCard who="host" :index="performers.length + 2 <= 9 ? performers.length + 2 : 0" />
    <AgentCard v-for="entry in director.wings.value" :key="`wing:${entry.id}`" :who="entry.id" wing />
    <div v-if="making" class="agent pending" :style="{ '--c': 'var(--accent)' }" data-state="making">
      <span class="av"><span class="blankface" :style="{ width: '42px', height: '42px', fontSize: '19px' }"><img v-if="making.logo" :src="making.logo" alt="" style="width: 100%; height: 100%; border-radius: 50%" /><template v-else>?</template></span><span class="ring"></span></span>
      <span class="meta">
        <span class="nm"><b>{{ making.shop.name }}</b></span>
        <span class="rs">生成中 · 形象 → 口音 → 组件</span>
        <span class="now"><span class="steps"><i v-for="step in (['look', 'accent', 'assets'] as const)" :key="step" :class="making.steps[step].status === 'done' ? 'done' : making.steps[step].status === 'run' ? 'run' : ''"></i></span></span>
      </span>
    </div>
    <button ref="addBtn" class="agent add" type="button" title="新建店铺 agent，或请资产库里的 agent 上台" @click="add">
      <span class="av"><Icon name="plus" /></span>
      <span class="meta"><span class="nm"><b>添加</b></span><span class="rs">店铺信息 + logo → agent · 邀请嘉宾</span></span>
    </button>
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDirector } from '../core/director.ts'
import { generation } from '../core/generation.ts'
import { brandAgent, useRegistry, MASCOTS } from '../core/registry.ts'
import Icon from '../ui/Icon.vue'
import { openPopover, type PopItem } from '../ui/popover.ts'
import { invite } from './actions.ts'
import AgentCard from './AgentCard.vue'
import { live, useLive } from './state.ts'

// agent-studio's dock: 我, everyone on the phone's floor, the host, the wings, anything being generated, then 「+」.
const director = useDirector(), registry = useRegistry()
const { performers, room } = useLive()
const addBtn = ref<HTMLElement>()
const making = computed(() => (generation.run && !generation.run.finished && !generation.run.error ? generation.run : null))
const SOURCE_ZH = { studio: 'agent-studio', created: '新建', phone: '手机' } as const

function add() {
  if (!addBtn.value) return
  const inShow = new Set(director.cast.value.map((entry) => entry.id))
  const full = room.value <= 0
  const guests: PopItem[] = registry.agents.value.filter((character) => !inShow.has(character.id)).map((character) => ({
    label: character.name, sub: `${character.restaurant} · ${SOURCE_ZH[character.source ?? 'created']}`, face: { who: character.id, expr: character.defaults.expr },
    disabled: full, title: full ? '舞台已满（最多 6 位）' : '', onClick: () => void invite(character),
  }))
  const brands: PopItem[] = MASCOTS.filter((character) => character.brand && !brandAgent(character.brand.id)).map((character) => ({
    label: character.fullName, sub: '品牌形象 · 先生成 agent 再登台', face: { who: character.id, expr: 'pitch' }, disabled: full, onClick: () => void invite(character),
  }))
  const items: PopItem[] = [
    { head: '添加' },
    { label: '新建店铺 agent…', sub: '店铺信息 + logo → Jev 生成形象，再登台', icon: 'plus', onClick: () => { live.adding = true } },
    { sep: true },
    { head: full ? '邀请嘉宾 · 舞台已满（最多 6 位）' : `邀请嘉宾 · 台上还能上 ${room.value} 位` },
    ...guests, ...brands,
  ]
  if (!guests.length && !brands.length) items.push({ label: '资产库里的 agent 都已在场', sub: '新建一个，或在资产页导入 agent-studio 的 JSON', disabled: true })
  openPopover(addBtn.value, { items, className: 'wide' })
}
</script>
