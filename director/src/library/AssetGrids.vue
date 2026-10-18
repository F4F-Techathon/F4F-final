<template>
  <section v-for="(section, index) in sections" :key="section.title ?? index" class="lib-sec">
    <h2 v-if="section.title">{{ section.title }}</h2>
    <div class="grid">
      <SpecimenCard v-for="item in section.items" :key="`${item.type}:${item.id}`" :spec="{ figure, recipe: item.recipe, mode: item.mode }" :zh="item.zh" :sub="item.sub ?? item.id"
        :group="item.group" :badge="item.badge" :crop="item.crop" :on="selected === `${item.type}:${item.id}`" @open="emit('open', item)" />
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import type { Figure } from '@/agents/rig'
import { assetSections, type AssetItem, type CategoryId } from './catalog.ts'
import SpecimenCard from './SpecimenCard.vue'

// One of the six shared categories, drawn on this character's own rig.
const props = defineProps<{ figure: Figure; category: CategoryId; selected?: string }>()
const emit = defineEmits<{ open: [item: AssetItem] }>()
const sections = computed(() => assetSections(props.category, props.figure))
</script>
