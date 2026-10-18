<template>
  <div class="pop-h row"><span>引用依据 · {{ live.evidence.length }}/{{ ids.length }}</span><span class="sp"></span><button v-if="live.evidence.length" class="linkbtn" type="button" @click="live.evidence = []">清空</button></div>
  <div class="pop-list">
    <button v-for="item in items" :key="item.id" type="button" :class="{ on: live.evidence.includes(item.id) }" :title="item.text || item.id" @click="toggle(item.id)">
      <img v-if="item.image" class="evthumb" :src="item.image" alt="" referrerpolicy="no-referrer" loading="lazy" />
      <Icon v-else :name="live.evidence.includes(item.id) ? 'check' : 'plus'" />
      <span class="pl"><b>{{ item.label }}</b><small v-if="item.text">{{ item.text }}</small></span>
      <Icon v-if="item.image && live.evidence.includes(item.id)" name="check" />
    </button>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import Icon from '../ui/Icon.vue'
import { evidenceInfo } from './evidence.ts'
import { live } from './state.ts'

// The speaker's evidence, by title (with a photo when there is one); a line may cite up to 12.
const props = defineProps<{ ids: string[]; prefix: string }>()
const items = computed(() => props.ids.map((id) => evidenceInfo(id, props.prefix)))
function toggle(id: string) {
  live.evidence = live.evidence.includes(id) ? live.evidence.filter((item) => item !== id) : [...live.evidence, id].slice(0, 12)
}
</script>
