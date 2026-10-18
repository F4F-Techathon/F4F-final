<template><svg class="app-icon" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path v-for="(path, i) in paths[name] || paths.sparkles" :key="i" :d="path" /></svg></template>
<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number | string }>(), { size: 22 })
const paths: Record<string, string[]> = {
  arrow: ['M4 12h16m-6-6 6 6-6 6'], back: ['m14 5-7 7 7 7'], close: ['m6 6 12 12M6 18 18 6'], plus: ['M12 5v14M5 12h14'], minus: ['M5 12h14'], check: ['m5 12 4 4L19 6'],
  sparkles: ['m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Z', 'M20 2v4m-2-2h4'], pin: ['M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z', 'M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
  clock: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', 'M12 7v5l3 2'], history: ['M3 11a9 9 0 1 1 2 7', 'M3 4v7h7', 'M12 7v5l3 2'], mic: ['M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Z', 'M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8'], keyboard: ['M3 5h18v14H3z', 'M6 9h.1m3.9 0h.1m3.9 0h.1m3.9 0h.1M6 13h.1m3.9 0h.1m3.9 0h.1m3.9 0h.1M8 16h8'],
  send: ['m3 3 18 9-18 9 4-9-4-9Z', 'M7 12h14'], filter: ['M4 6h16M4 12h16M4 18h16', 'M8 3v6m8 0v6m-6 0v6'], map: ['m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z', 'M9 3v15m6-12v15'], list: ['M9 6h12M9 12h12M9 18h12M3 6h.1M3 12h.1M3 18h.1'],
  chevron: ['m9 5 7 7-7 7'], down: ['m6 9 6 6 6-6'], quote: ['M10 6H4v8h5c0 3-2 4-4 5m15-13h-6v8h5c0 3-2 4-4 5'], book: ['M12 5C8 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1Zm0 0v15'],
  heart: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z'], star: ['m12 3 2.8 5.7 6.3.9-4.5 4.4 1 6.2-5.6-3-5.6 3 1-6.2L2 9.6l6.3-.9L12 3Z'],
  play: ['m9 5 11 7-11 7V5Z'], pause: ['M8 5v14M16 5v14'], volume: ['m11 4-6 5H2v6h3l6 5V4Z', 'M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14'], mute: ['m11 4-6 5H2v6h3l6 5V4Z', 'm16 9 5 6m-5 0 5-6'],
  people: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9', 'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0m4-3.8a4 4 0 0 1 0 7.6'], info: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', 'M12 11v6m0-10h.01'],
  locate: ['M12 2v3m0 14v3M2 12h3m14 0h3', 'M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0', 'M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0'], search: ['M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0', 'm15 15 6 6'], external: ['M14 3h7v7m0-7L10 14', 'M10 3H3v18h18v-7'], leaf: ['M20 3C9 2 2 6 4 14c2 9 16 7 16-11Z', 'M4 21 16 8'], ticket: ['M3 7h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V7Z', 'M16 7v12'], fork: ['M5 2v6m3-6v6M2 2v6a3 3 0 0 0 6 0M5 11v11M18 2c-3 4-4 9 0 10h2V2h-2Zm2 10v10'], trophy: ['M7 3h10v5a5 5 0 0 1-10 0V3Z', 'M7 5H3v2a4 4 0 0 0 4 4m10-6h4v2a4 4 0 0 1-4 4M12 13v6m-4 2h8m-6-2h4'], more: ['M5 12h.01M12 12h.01M19 12h.01'], wifi: ['M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-11 4a6 6 0 0 1 8 0m-4 4h.01'], refresh: ['M20 7a9 9 0 1 0 1 8', 'M20 2v6h-6'], phone: ['M6 3H3c0 10 8 18 18 18v-4l-5-2-2 2-7-7 2-2-3-5Z'],
}
</script>
<style lang="less" scoped>.app-icon { display: inline-block; flex: none; vertical-align: middle; }</style>
