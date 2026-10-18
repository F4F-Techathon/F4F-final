<template>
  <div ref="container" class="stage-curtain" aria-hidden="true">
    <div v-for="(side, index) in folds" :key="index" class="cloth" :class="index ? 'right' : 'left'">
      <div
        v-for="(fold, i) in side"
        :key="i"
        class="fold"
        :style="{
          width: `${fold.width}px`,
          transform: `translateX(${fold.x}px) scale(${fold.sx}, ${fold.sy})`,
          '--shade': fold.shade,
          '--crest': `${fold.crest}%`,
        }"
      ></div>
    </div>
    <div class="valance"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { curtainFolds } from '@/lib/entranceMotion'

const props = defineProps<{ progress: number }>()
const container = ref<HTMLElement>()
const width = ref(390)
const widths = [
  [88, 124, 70, 106, 136, 80, 112, 62, 98, 130, 69],
  [104, 66, 128, 84, 120, 62, 100, 134, 76, 112, 89],
]
const folds = computed(() => widths.map((side, i) => curtainFolds(side, props.progress, width.value / 2, i ? -1 : 1)))
let observer: ResizeObserver

onMounted(() => {
  width.value = container.value!.clientWidth
  observer = new ResizeObserver(([entry]) => { if (entry) width.value = entry.contentRect.width })
  observer.observe(container.value!)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<style lang="less" scoped>
.stage-curtain {
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: none;

  .cloth {
    position: absolute;
    inset: 0 0 21px;
    filter: drop-shadow(5px 5px 8px #120a1766);

    .fold {
      position: absolute;
      top: -8px;
      bottom: -5px;
      background: linear-gradient(90deg, #452244 0%, #73405f 15%, #925675 var(--crest), #613353 80%, #361b3c 100%);
      border-bottom: 5px solid #c19a59;
      border-radius: 0 0 44% 44% / 0 0 13px 13px;
      box-shadow: inset -3px 0 8px #140b2438;
      will-change: transform;

      &::after {
        content: '';
        position: absolute;
        inset: 0;
        background: #120a17;
        opacity: var(--shade);
      }
    }

    &.left .fold { left: 0; transform-origin: left top; }
    &.right .fold { right: 0; transform-origin: right top; }
  }

  .valance {
    position: absolute;
    top: -25px;
    left: -2%;
    width: 104%;
    height: clamp(58px, 8vw, 80px);
    background: repeating-linear-gradient(90deg, #653859 0, #89506c 16px, #563051 30px);
    border-radius: 0 0 35% 35%;
    border-bottom: 3px solid #b89458;
    box-shadow: 0 3px 10px #180c2440;
  }
}
</style>
