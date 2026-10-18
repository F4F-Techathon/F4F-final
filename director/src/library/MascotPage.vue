<template>
  <div class="profile">
    <Stagelet :figure="character.figure!" :seq="SEQ" :active="active" />
    <div class="facts">
      <div class="fact"><small>品牌</small><div>{{ brand.name }} · {{ brand.mascot }} · {{ brand.cuisine }}</div></div>
      <div class="fact"><small>形象</small><div>{{ brand.look }}</div></div>
      <div class="fact"><small>体型</small><div>{{ body?.zh }}：专属体型，不套用人形模板 · 腿长 lext {{ body?.lext }} · 肩宽 {{ body?.shoulder }} · 舞台缩放 {{ body?.scale }}{{ body?.legW ? '' : ' · 没有腿，身子落地' }}</div></div>
      <div class="fact"><small>人设</small><div>{{ brand.persona }}</div></div>
      <div class="fact"><small>由品牌决定</small><div>形象、主题色 {{ brand.theme }}（{{ brand.color }}）、口音（{{ accent }}）、性格（{{ brand.personality }}）；生成时只有「组件」一步还问 Jev</div></div>
      <div class="fact"><small>怎么认出</small><div>店名或店主里出现「{{ brand.name }}」，生成时就用这个形象</div></div>
      <div class="fact"><small>沿用原片</small><div>{{ EXPRESSIONS.length }} 表情 · {{ POSES.length }} 姿势 · {{ ACTS.length - 1 }} 动作 · {{ VISEMES.length }} 口型 · {{ EFFECTS.length }} 特效：同一个 RIG.Actor 驱动；手里的道具始终朝上</div></div>
      <div class="fact"><small>品牌 agent</small><div>{{ agent ? `${agent.fullName || agent.name}（${agent.source === 'studio' ? 'agent-studio 生成' : '导演台生成'}）` : '还没有：第一次请上台时按品牌生成一个' }}</div></div>
      <div class="fact-actions">
        <button v-if="agent" class="btn sm ghost" type="button" @click="emit('open', agent.id)"><Icon name="inspect" />看它的档案</button>
        <button class="btn sm primary" type="button" @click="invite(character)"><Icon name="enter" />请上台</button>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { ACTS, EXPRESSIONS } from '@/agents/catalog/performance'
import { LANGUAGES } from '@/agents/generation/languages'
import { mascot } from '@/agents/rig/mascots.js'
import { EFFECTS, POSES, VISEMES } from '../assets/vocabulary.ts'
import { brandAgent, type Character } from '../core/registry.ts'
import { invite } from '../live/actions.ts'
import Icon from '../ui/Icon.vue'
import Stagelet from './Stagelet.vue'

// A brand mascot: its own body and what the brand fixes; it can walk on stage as a guest.
const props = defineProps<{ character: Character; active: boolean }>()
const emit = defineEmits<{ open: [id: string] }>()
const SEQ: [string, string][] = [['pitch', 'thumbR'], ['listen', 'rest'], ['laugh', 'cheer'], ['shock', 'rest'], ['proud', 'present'], ['idle', 'rest']]
const brand = computed(() => props.character.brand!)
const body = computed(() => mascot(brand.value.body))
const accent = computed(() => LANGUAGES.find((item) => item.id === brand.value.accent)?.zh ?? brand.value.accent)
const agent = computed(() => brandAgent(brand.value.id))
</script>
