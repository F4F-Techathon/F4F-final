<template>
  <svg class="i" viewBox="0 0 24 24" aria-hidden="true" v-html="ICONS[name]"></svg>
</template>
<script setup lang="ts">
import { ICONS, type IconName } from './icons.ts'
defineProps<{ name: IconName }>()
</script>
