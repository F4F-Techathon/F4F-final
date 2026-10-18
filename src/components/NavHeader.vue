<template>
  <header class="nav-header" :class="{ dark }"><button class="icon-btn back" aria-label="返回上一页" @click="$emit('back')"><AppIcon name="back" /></button><div class="heading"><h1>{{ title }}</h1></div><slot /></header>
</template>
<script setup lang="ts">import AppIcon from './AppIcon.vue'; defineProps<{ title: string; dark?: boolean }>(); defineEmits<{ back: [] }>()</script>
<style lang="less" scoped>
.nav-header { min-height: clamp(66px, 8vw, 92px); flex-shrink: 0; display: flex; align-items: center; gap: 12px; padding: calc(12px + env(safe-area-inset-top)) var(--inset-right) 12px var(--inset-left); .back { background: #fffbf4; border: 1px solid var(--line); width: 44px; height: 44px; flex-shrink: 0; } .heading { flex: 1; min-width: 0;  h1 { margin: 0; font-size: var(--heading-size); font-weight: var(--weight-semibold); } } &.dark { color: var(--cream); .back { color: var(--cream); border-color: #604868; background: #ffffff08; } } }
</style>
