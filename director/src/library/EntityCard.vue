<template>
  <div class="ent-card" :style="{ '--c': character.color }" role="button" tabindex="0" @click="emit('open')" @keydown.enter="emit('open')">
    <div class="ent-av"><Face :who="character.id" :expr="character.defaults.expr" :size="64" :title="character.name" /><img v-if="character.agent?.logo" class="badge-logo" :src="character.agent.logo" alt="" /></div>
    <div class="ent-meta">
      <b>{{ character.name }}</b>
      <small>{{ character.restaurant }}{{ plate ? ` · ${plate}` : '' }}</small>
      <div class="tags">
        <span v-if="state === 'on'" class="live">在台上</span><span v-else-if="state === 'wing'">候场</span>
        <span v-if="character.source">{{ SOURCE_ZH[character.source] }}</span>
        <span v-if="language">{{ language }}</span>
        <span v-if="character.agent?.studio?.voice">{{ TIMBRE_ZH[character.agent.studio.voice.timbre] ?? character.agent.studio.voice.timbre }}</span>
      </div>
    </div>
    <button v-if="invitable" class="btn sm go" type="button" title="作为嘉宾登上手机舞台" @click.stop="invite(character)"><Icon name="enter" />登台</button>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { LANGUAGES } from '@/agents/generation/languages'
import { useDirector } from '../core/director.ts'
import { SOURCE_ZH, TIMBRE_ZH } from '../core/labels.ts'
import type { Character } from '../core/registry.ts'
import { invite } from '../live/actions.ts'
import Face from '../ui/Face.vue'
import Icon from '../ui/Icon.vue'

// A character in the overview: face (and logo), shop, where it came from, and 登台 for anything that can be a guest.
const props = defineProps<{ character: Character }>()
const emit = defineEmits<{ open: [] }>()
const director = useDirector()
const entry = computed(() => director.cast.value.find((item) => item.id === props.character.id))
const state = computed(() => (!entry.value ? null : entry.value.onStage === false ? 'wing' : 'on'))
const plate = computed(() => (props.character.plate || '').split(' · ')[0])
const language = computed(() => LANGUAGES.find((item) => item.id === props.character.language)?.zh)
const invitable = computed(() => (props.character.kind === 'agent' || props.character.kind === 'mascot') && state.value !== 'on')
</script>
