<template>
  <BottomSheet :open="open" title="这句话的依据" size="large" @close="$emit('close')">
    <div class="evidence-sheet">
      <div v-if="claim" class="claim"><AppIcon name="quote" :size="23" /><p>{{ claim }}</p><span>当前观点</span></div>
      <EvidencePanel v-if="items.length" :items="items" />
      <div v-else class="empty-state"><AppIcon name="book" :size="30" /><h3>暂无可引用资料</h3></div>
    </div>
  </BottomSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getEvidence } from '@/data/restaurants'
import AppIcon from './AppIcon.vue'
import BottomSheet from './BottomSheet.vue'
import EvidencePanel from './EvidencePanel.vue'

const props = defineProps<{ open: boolean; ids: string[]; claim?: string }>()
defineEmits<{ close: [] }>()
const items = computed(() => getEvidence(props.ids))
</script>

<style lang="less" scoped>
.evidence-sheet {
  .claim {
    padding: 18px;
    border-radius: 15px;
    background: #ede3ed;
    color: #705077;

    >p { font-size: var(--body-size); line-height: var(--line-body); margin: 10px 0; }
    >span { font-size: var(--small-size); color: #9f849c; }
  }
}
</style>
