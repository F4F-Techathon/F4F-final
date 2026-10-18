<template>
  <section class="evidence-panel" :class="{ dark }" aria-label="依据">
    <header class="evidence-heading"><AppIcon name="book" :size="15" /><h2>依据</h2></header>
    <div class="evidence-list">
      <article v-for="item in items" :key="item.id" class="evidence-item" :data-evidence-id="item.id" :class="{ flash: flashing === item.id }">
        <h3><i v-if="numbers?.[item.id]" class="evidence-number" :aria-label="`来源 ${numbers[item.id]}`">{{ numbers[item.id] }}</i>{{ item.title }}</h3>
        <blockquote v-if="item.text">{{ item.text }}</blockquote>
        <div v-if="item.images?.length" class="evidence-images" :class="{ multiple: item.images.length > 1 }">
          <img v-for="image in item.images" :key="image.src" :src="image.src" :alt="image.alt" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
        </div>
        <footer>
          <span v-if="item.mock" class="demo-label">演示</span>
          <a v-if="item.url" :href="item.url" target="_blank" rel="noopener noreferrer">{{ item.source }}<AppIcon name="external" :size="12" /></a>
          <span v-else>{{ item.source }}</span>
          <time v-if="item.date" :datetime="/^\d{4}-\d{2}-\d{2}/.test(item.date) ? item.date : undefined">{{ item.date }}</time>
        </footer>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Evidence } from '@/data/types'
import AppIcon from './AppIcon.vue'

// `numbers` labels the records a spoken line's highlighted facts point to; `focus` flashes the one just tapped.
const props = defineProps<{ items: Evidence[]; dark?: boolean; numbers?: Record<string, number>; focus?: { id: string; at: number } | null }>()
const flashing = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
watch(() => props.focus, (focus) => {
  if (!focus) return
  flashing.value = ''
  clearTimeout(timer)
  requestAnimationFrame(() => { flashing.value = focus.id; timer = setTimeout(() => { flashing.value = '' }, 1400) })
})
</script>

<style lang="less" scoped>
.evidence-panel {
  --evidence-ink: #71616b;
  --evidence-muted: #9b897d;
  --evidence-accent: #786046;
  --evidence-line: #e3d6c1;
  --evidence-surface: #efe5d7;
  padding: 18px 0 8px;

  .evidence-heading {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 12px;
    color: var(--evidence-accent);

    h2 { margin: 0; font-size: var(--label-size); font-weight: var(--weight-semibold); }
  }

  .evidence-list {
    .evidence-item {
      min-width: 0;
      padding: 2px 0 2px 14px;
      border-left: 1px solid var(--evidence-line);

      & + .evidence-item { margin-top: 20px; }

      &.flash { animation: evidence-flash 1.4s ease-out; }

      h3 {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0 0 8px;
        color: var(--evidence-accent);
        font-size: var(--label-size);
        font-weight: var(--weight-semibold);
      }

      blockquote {
        margin: 0;
        color: var(--evidence-ink);
        font-size: var(--body-size);
        line-height: var(--line-body);
        white-space: pre-line;
        overflow-wrap: anywhere;
      }

      .evidence-images {
        display: grid;
        gap: 8px;
        margin-top: 12px;

        img {
          display: block;
          width: 100%;
          height: clamp(160px, 24dvh, 260px);
          min-width: 0;
          border-radius: 12px;
          background: var(--evidence-surface);
          object-fit: contain;
        }

        &.multiple {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          img { height: auto; aspect-ratio: 4 / 3; }
        }
      }

      footer {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 5px 10px;
        margin-top: 10px;
        color: var(--evidence-muted);
        font-size: var(--small-size);
        line-height: var(--line-compact);
        overflow-wrap: anywhere;

        .demo-label { padding: 0 5px; border: 1px solid var(--evidence-line); border-radius: 4px; }
        a { display: inline-flex; align-items: center; gap: 4px; color: var(--evidence-accent); }
      }
    }
  }

  .evidence-number {
    display: grid;
    place-items: center;
    width: 17px;
    height: 17px;
    border-radius: 50%;
    background: var(--evidence-accent);
    color: var(--evidence-surface);
    font-size: 10px;
    font-style: normal;
    font-weight: var(--weight-semibold);
    flex: none;
  }

  &.dark {
    --evidence-ink: #d7c6d3;
    --evidence-muted: #a38aa3;
    --evidence-accent: #d6b780;
    --evidence-line: #6d526e;
    --evidence-surface: #302037;
  }
}
@keyframes evidence-flash {
  0%, 30% { background: #d6b78033; box-shadow: -1px 0 0 var(--evidence-accent, #d6b780); }
  100% { background: transparent; box-shadow: none; }
}
@media (prefers-reduced-motion: reduce) { .evidence-panel .evidence-list .evidence-item.flash { animation-duration: .01s; } }
</style>
