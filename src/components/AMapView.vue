<template><div class="amap-view" :class="{ gathering, mini }"><div ref="container" class="map-container" :role="mini ? 'img' : undefined" :aria-label="mini ? `${restaurants[0]?.name || '餐厅'}的位置地图` : '可拖动和缩放的高德餐厅地图'"></div><div v-if="loading || error" class="map-state"><div v-if="loading" class="loading-ring"></div><AppIcon v-else name="map" :size="32" /><b>{{ loading ? '正在展开今晚的美食地图…' : '地图暂时没展开' }}</b><p v-if="error">{{ error }}</p><button v-if="error" class="text-btn" aria-label="重新加载餐厅地图" @click="initialize">{{ mini ? '重试' : '重新加载地图' }}<AppIcon name="refresh" :size="14" /></button></div><span v-if="!loading && !error && !mini" class="data-label">{{ DATA_LABEL }}</span></div></template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { loadAMap } from '@/lib/amap'
import { contestantReveal, OPENING_PLAYBACK_RATE } from '@/lib/entranceMotion'
import type { AMapSDK, MapBounds, MapInstance } from '@/lib/amap'
import type { Coordinates, Restaurant } from '@/data/types'
import { DATA_LABEL } from '@/data/restaurants'
import AppIcon from './AppIcon.vue'
const props = withDefaults(defineProps<{ restaurants: Restaurant[]; selectedIds?: string[]; center: Coordinates; radius?: number; mini?: boolean; gathering?: boolean; gatheringTime?: number }>(), { selectedIds: () => [], radius: 0, mini: false, gatheringTime: 0 })
const emit = defineEmits<{ select: [id: string]; bounds: [bounds: MapBounds]; ready: []; failed: [] }>()
const container = ref<HTMLElement>(), loading = ref(true), error = ref('')
let map: MapInstance | undefined, sdk: AMapSDK, overlays: unknown[] = [], alive = true
let restaurantMarkers: HTMLElement[] = []

// Houses and contestants share one clock, so a house only disappears as its own person appears.
function updateGatheringMarkers() {
  restaurantMarkers.forEach((element, index) => {
    if (!props.gathering || props.mini) { element.style.opacity = ''; element.style.transform = ''; return }
    const reveal = contestantReveal(props.gatheringTime, index)
    const selectedScale = props.selectedIds.includes(props.restaurants[index]!.id) ? 1.09 : 1
    element.style.opacity = String(reveal.houseOpacity)
    element.style.transform = `scale(${selectedScale * reveal.houseScale})`
  })
}

// Markers use DOM text nodes so merchant names never become untrusted HTML.
function updateMarkers() {
  if (!map) return
  map.remove(overlays); overlays = []; restaurantMarkers = []
  if (props.radius) overlays.push(new sdk.Circle({ center: props.center, radius: props.radius * 1000, fillColor: '#9dbea8', fillOpacity: .08, strokeColor: '#739780', strokeOpacity: .5, strokeWeight: 1, strokeStyle: 'dashed' }))
  const centerMarker = document.createElement('div'); centerMarker.className = 'user-location-marker'; centerMarker.textContent = '你'
  if (!props.mini) overlays.push(new sdk.Marker({ position: props.center, content: centerMarker, anchor: 'center', zIndex: 5 }))
  for (const r of props.restaurants) {
    const selected = props.selectedIds.includes(r.id)
    const el = document.createElement(props.mini ? 'div' : 'button')
    if (!props.mini) el.setAttribute('type', 'button')
    el.className = `restaurant-marker ${selected ? 'is-selected' : ''}`; el.style.setProperty('--marker-color', r.color); el.setAttribute('aria-label', props.mini ? r.name : `查看${r.name}`)
    const shape = document.createElement('span'); shape.className = 'marker-shop'; shape.innerHTML = '<svg viewBox="0 0 44 42" fill="none"><path d="M5 16h34v24H5Z" fill="#fff5df" stroke="#805c4a" stroke-width="1.4"/><path d="m2 15 20-13 20 13Z" fill="currentColor"/><path d="M3 16h38v9H3Z" fill="currentColor"/><path d="M9 16v9m13-9v9m13-9v9" stroke="#fff4df" stroke-width="6"/><path d="M18 40V28h9v12" fill="#66514d"/><path d="M9 29h5v7H9m22-7h5v7h-5" fill="#9dbea8"/></svg>'
    const label = document.createElement('span'); label.className = 'marker-name'; label.textContent = r.name
    if (selected) { const check = document.createElement('i'); check.textContent = '✓'; shape.appendChild(check) }
    el.append(shape, label)
    restaurantMarkers.push(el)
    const marker = new sdk.Marker({ position: r.coordinates, content: el, anchor: props.mini ? 'center' : 'bottom-center', zIndex: selected ? 20 : 10 })
    if (!props.mini) marker.on('click', () => emit('select', r.id))
    overlays.push(marker)
  }
  map.add(overlays)
  updateGatheringMarkers()
}

// SDK failures remain local to the map and leave the contestant list usable.
async function initialize() {
  loading.value = true; error.value = ''
  try {
    sdk = await loadAMap()
    if (!alive || !container.value) return
    map?.destroy()
    map = new sdk.Map(container.value, { viewMode: '2D', zoom: props.mini ? 15 : 14.2, center: props.center, mapStyle: 'amap://styles/whitesmoke', showIndoorMap: false, resizeEnable: true, features: ['bg', 'road', 'building', 'point'], dragEnable: !props.mini && !props.gathering, zoomEnable: !props.mini && !props.gathering })
    map.on('complete', () => { if (!alive) return; loading.value = false; emit('ready') })
    map.on('moveend', () => { if (map) emit('bounds', map.getBounds()) })
    map.on('zoomend', () => { if (map) emit('bounds', map.getBounds()) })
    updateMarkers()
    loading.value = false
    emit('ready')
  } catch (e) { if (alive) { error.value = (e as Error).message; loading.value = false; emit('failed') } }
}
// Fits the contestants and the user before the SVG performance, without replacing the real map.
function beginEntrance(actors: Restaurant[]) {
  if (!map || loading.value || error.value) return false
  map.setStatus({ dragEnable: false, zoomEnable: false, touchZoom: false, keyboardEnable: false })
  const points = [props.center, ...actors.map((r) => r.coordinates)]
  map.setFitView(points.map((position) => new sdk.Marker({ position })), false, [125, 65, 95, 65], 15.5)
  return true
}

function project(position: Coordinates) {
  if (!map || !container.value || loading.value || error.value) return undefined
  const point = map.lngLatToContainer(position)
  const rect = container.value.getBoundingClientRect()
  return { x: point.getX() + rect.left, y: point.getY() + rect.top }
}

function focusTarget() { map?.setZoomAndCenter(16.2, props.center, false, 700 / OPENING_PLAYBACK_RATE) }

watch(() => props.gathering, (active) => {
  if (!active && !props.mini) map?.setStatus({ dragEnable: true, zoomEnable: true, touchZoom: true, keyboardEnable: true })
})
watch(() => [props.gathering, props.gatheringTime], updateGatheringMarkers)
defineExpose({ beginEntrance, project, focusTarget })
watch(() => [props.restaurants, props.selectedIds, props.radius], updateMarkers, { deep: true })
watch(() => props.center, () => { map?.setCenter(props.center); updateMarkers() }, { deep: true })
onMounted(initialize)
onBeforeUnmount(() => { alive = false; map?.destroy() })
</script>
<style lang="less" scoped>
.amap-view {
  &.mini {
    .map-container { pointer-events: none; }
    :deep(.restaurant-marker) {
      padding: 8px;
      .marker-shop { width: 18px; height: 18px; border: 3px solid var(--paper); background: var(--marker-color); box-shadow: 0 0 0 6px #2b1b3010, 0 2px 5px #2b1b3026; svg, i { display: none; } }
      .marker-name { display: none; }
    }
  }
  &.gathering {
    :deep(.restaurant-marker) { transition: none; pointer-events: none; }
    :deep(.user-location-marker), .data-label { opacity: 0; transition: opacity .25s; }
  }
  position: relative; width: 100%; height: 100%; background: #dfe5d3; overflow: hidden; .map-container { width: 100%; height: 100%; } .map-state { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #e4e7dbee; gap: 12px; padding: 25px; color: #6e7c62; b { font-size: var(--body-size); text-align: center; } p { font-size: var(--small-size); text-align: center; line-height: var(--line-body); max-width: 250px; margin: 0; } .text-btn { display: flex; gap: 7px; align-items: center; } .loading-ring { border: 2px solid #82906c44; border-top-color: #78936f; width: 30px; height: 30px; border-radius: 50%; animation: spin 1s linear infinite; } } .data-label { position: absolute; bottom: 30px; right: 8px; font-size: var(--small-size); background: #fffbf4d9; color: #7b826e; padding: 4px 7px; border-radius: 5px; } :deep(.restaurant-marker) { font-family: var(--font-body); display: flex; flex-direction: column; align-items: center; border: 0; background: transparent; padding: 6px; color: var(--marker-color); transition: transform .2s; .marker-shop { position: relative; display: grid; place-items: center; width: 49px; height: 49px; border-radius: 50%; background: #fffbf4e6; border: 2px solid #fff9; box-shadow: 0 3px 9px #2b1b3026; svg { width: 35px; height: 35px; } i { position: absolute; top: -4px; right: -4px; border-radius: 50%; background: #e3b04b; color: #2b1b30; font-size: var(--small-size); font-style: normal; line-height: var(--line-compact); width: 18px; height: 18px; display: grid; place-items: center; } } .marker-name { background: #fffbf4; box-shadow: 0 2px 4px #2b1b3012; border-radius: 5px; color: #4e3c49; font-size: var(--small-size); padding: 3px 5px; margin-top: 4px; white-space: nowrap; } &.is-selected { transform: scale(1.09); .marker-shop { border-color: #e3b04b; box-shadow: 0 0 0 5px #e3b04b30, 0 4px 9px #2b1b3026; } } } :deep(.user-location-marker) { font-family: var(--font-body); line-height: var(--line-compact); width: 26px; height: 26px; border-radius: 50%; background: #2f6e62; border: 3px solid #fffbf4; color: white; display: grid; place-items: center; font-size: var(--small-size); box-shadow: 0 0 0 8px #2f6e6222; } @keyframes spin { to { transform: rotate(360deg); } } }
</style>
