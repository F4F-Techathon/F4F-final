<template>
  <section class="requirements-card" aria-label="今晚的用餐需求">
    <div v-for="row in rows" :key="row.id" class="requirement-row">
      <span class="row-icon"><AppIcon :name="row.icon" :size="18" /></span>
      <div class="row-copy"><span class="row-label">{{ row.label }}</span><p :key="row.value">{{ row.value }}</p></div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DiningRequirements } from '@/lib/intakeProtocol'
import { requirementRows } from '@/lib/intakeRequirements'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ requirements: DiningRequirements }>()
const rows = computed(() => requirementRows(props.requirements))
</script>

<style lang="less" scoped>
.requirements-card {
  width: 100%;
  padding: 6px clamp(18px, 3vw, 26px);
  border: 1px solid #dfd0bb;
  border-radius: 22px;
  background: #fffbf4b3;
  box-shadow: 0 5px 22px #6b4f4c06;

  .requirement-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 0;
    & + .requirement-row { border-top: 1px solid #e7dccc; }
    .row-icon { display: grid; place-items: center; flex: none; width: 32px; height: 32px; border-radius: 11px; background: #eee7d9; color: #99825e; }
    .row-copy {
      min-width: 0;
      .row-label { color: #9b897d; font-size: var(--small-size); }
      p { margin: 2px 0 0; font-size: var(--body-size); color: #574558; line-height: var(--line-compact); overflow-wrap: anywhere; animation: requirement-arrive .45s ease both; }
    }
  }
  @keyframes requirement-arrive { from { opacity: .3; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
}
</style>
