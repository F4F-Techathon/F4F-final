<template>
  <div class="profile">
    <Stagelet :figure="character.figure!" :seq="seq" :active="active" />
    <div class="facts">
      <div class="fact"><small>餐馆</small><div>{{ film.fullName }} · {{ film.plate }}</div></div>
      <div class="fact"><small>人设</small><div>{{ film.persona }}</div></div>
      <div class="fact"><small>造型</small><div>{{ film.look }}</div></div>
      <div class="fact"><small>招牌动作</small><div>{{ film.signature }}</div></div>
      <div class="fact"><small>声音</small><div>{{ film.voiceDesc }}（语音暂未接入）</div></div>
      <div class="fact"><small>3D 编号</small><div class="mono">{{ film.actorId }}</div></div>
      <div class="fact wide"><small>色板</small><div class="swatches"><span v-for="[key, color] in palette" :key="key" class="sw" :title="key"><i :style="{ background: color }"></i>{{ color }}</span></div></div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { RIG } from '@/lib/characterRig'
import type { Character } from '../core/registry.ts'
import Stagelet from './Stagelet.vue'

// One of the film's three hand-drawn owners: who they are, and the palette their rig is drawn in.
const props = defineProps<{ character: Character; active: boolean }>()
const film = computed(() => props.character.film!)
const seq = computed((): [string, string][] => [[film.value.defaults.expr, 'hipR'], ['listen', 'rest'], ['laugh', 'belly'], ['shock', 'rest'], ['smug', 'hip'], ['idle', 'rest']])
const palette = computed(() => Object.entries(RIG.SPECS[film.value.id] ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].startsWith('#')))
</script>
