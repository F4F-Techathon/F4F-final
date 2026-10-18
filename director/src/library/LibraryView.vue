<template>
  <div class="library">
    <aside class="rail" aria-label="角色">
      <button class="ovbtn" :class="{ on: !character }" type="button" @click="open('')"><Icon name="grid" />总览</button>
      <div v-for="group in groups" :key="group.title">
        <h4>{{ group.title }}</h4>
        <div v-if="group.items.length" class="chars">
          <button v-for="item in group.items" :key="item.id" type="button" :class="{ on: character?.id === item.id }" :style="{ '--c': item.color }" @click="open(item.id)">
            <Face :who="item.id" :expr="item.defaults.expr" :size="34" />
            <span><b>{{ item.name }}</b><small>{{ group.sub(item) }}</small></span>
          </button>
        </div>
        <div v-else class="dim rail-empty">{{ group.empty }}</div>
      </div>
      <div v-if="character">
        <h4>资产</h4>
        <div class="cats">
          <button v-for="[id, zh] in cats" :key="id" type="button" :class="{ on: category === id }" @click="openCategory(id)">{{ zh }}<span class="n">{{ COUNTS[id] ?? '' }}</span></button>
        </div>
      </div>
      <div v-if="character" class="exp">
        <button class="btn sm ghost" type="button" @click="exportJSON(character)"><Icon name="download" />JSON</button>
        <button class="btn sm ghost" type="button" @click="exportCSV(character)"><Icon name="download" />CSV</button>
      </div>
    </aside>
    <main ref="main" class="lib-main">
      <Overview v-if="!character" @open="open" />
      <template v-else>
        <div class="lib-h">
          <h1>{{ cats.find(([id]) => id === category)?.[1] }}</h1>
          <span class="who-chip" :style="{ '--c': character.color }"><Face :who="character.id" :size="22" />{{ character.fullName }}</span>
        </div>
        <PartsPage v-if="category === 'parts' && character.kind === 'template'" :key="`parts:${character.id}`" :character="character" :active="active" />
        <MascotPage v-else-if="category === 'parts'" :key="`brand:${character.id}`" :character="character" :active="active" @open="open" />
        <FilmPage v-else-if="category === 'profile'" :key="`film:${character.id}`" :character="character" :active="active" />
        <Dossier v-else-if="category === 'dossier'" :key="`dossier:${character.id}`" :character="character" :active="active" />
        <AssetGrids v-else-if="character.figure" :key="`${character.id}:${category}`" :figure="character.figure" :category="category" :selected="selected ? `${selected.type}:${selected.id}` : ''" @open="(item) => (selected = item)" />
        <div v-else class="empty-card"><b>还没有形象</b><span>手机还在生成这位店主</span></div>
      </template>
    </main>
    <AssetDrawer :item="selected" :figure="character?.figure ?? null" :name="character?.id ?? ''" :film="character?.kind === 'film'" :active="active" @close="selected = null" />
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, provide, ref, watch } from 'vue'
import { SpecimenEngine } from '../assets/specimens.ts'
import { FILM, MASCOTS, TEMPLATES, useRegistry, type Character } from '../core/registry.ts'
import Face from '../ui/Face.vue'
import Icon from '../ui/Icon.vue'
import AssetDrawer from './AssetDrawer.vue'
import AssetGrids from './AssetGrids.vue'
import { categories, COUNTS, exportCSV, exportJSON, type AssetItem, type CategoryId } from './catalog.ts'
import Dossier from './Dossier.vue'
import { SPECIMENS } from './engine.ts'
import FilmPage from './FilmPage.vue'
import MascotPage from './MascotPage.vue'
import Overview from './Overview.vue'
import PartsPage from './PartsPage.vue'

// 资产: agent-studio's asset library. The rail lists everyone; a character opens into its own page
// (parts, brand, profile or dossier) and the six shared categories, every asset drawn on its own rig.
const props = defineProps<{ active: boolean; focus: string }>()
const registry = useRegistry()
const main = ref<HTMLElement>()
const who = ref('')
const category = ref<CategoryId>('dossier')
const selected = ref<AssetItem | null>(null)
const character = computed<Character | undefined>(() => (who.value ? registry.get(who.value) : undefined))
const cats = computed(() => (character.value ? categories(character.value) : []))

const groups = computed(() => [
  { title: '通用模板', items: TEMPLATES, empty: '', sub: (item: Character) => item.restaurant },
  { title: '品牌形象', items: MASCOTS, empty: '', sub: (item: Character) => item.restaurant },
  { title: `品牌 agent · ${registry.studio.value.length}`, items: registry.studio.value, empty: '在总览导入 agent-studio 的 JSON', sub: (item: Character) => item.restaurant },
  { title: `本场店主 · ${registry.phoneHosts.value.length}`, items: registry.phoneHosts.value, empty: '手机进入滑卡后开始生成', sub: (item: Character) => item.restaurant },
  { title: `新建的 agent · ${registry.created.value.length}`, items: registry.created.value, empty: '在演播页点「+ 添加」新建', sub: (item: Character) => item.restaurant },
  { title: '原片角色', items: FILM, empty: '', sub: (item: Character) => item.restaurant },
])

// Every page gets a fresh specimen engine; the old one's frames are freed when it goes.
let engine = new SpecimenEngine()
provide(SPECIMENS, () => engine)
watch([who, category], () => {
  engine.dispose()
  engine = new SpecimenEngine()
  selected.value = null
}, { flush: 'pre' })
onBeforeUnmount(() => engine.dispose())

function open(id: string, wanted?: string) {
  who.value = id
  const list = id && registry.get(id) ? categories(registry.get(id)!) : []
  category.value = (list.find(([cat]) => cat === wanted)?.[0] ?? list[0]?.[0] ?? 'dossier') as CategoryId
  syncHash()
  void nextTick(() => main.value?.scrollTo({ top: 0 }))
}
// The address shows the open character while this page is on show (and only then).
function syncHash() {
  if (props.active) history.replaceState(null, '', who.value ? `#library/${encodeURIComponent(who.value)}` : '#library')
}
function openCategory(id: CategoryId) {
  category.value = id
  void nextTick(() => main.value?.scrollTo({ top: 0 }))
}

// #library/<id> from elsewhere (the dock's 「在资产库查看」) opens that character; coming back to the tab keeps the page.
watch(() => props.focus, (focus) => { if (focus && focus !== who.value) open(focus) }, { immediate: true })
// A deleted agent's page goes back to the overview; leaving the page closes the drawer.
watch(character, (value) => { if (who.value && !value && registry.all.value.length) open('') })
watch(() => props.active, (active) => { if (active) syncHash(); else selected.value = null })
</script>
