<template><BottomSheet :open="open" title="从哪里开始找？" size="large" @close="$emit('close')"><div class="location-picker"><p class="small muted">选择搜索中心，范围会随之重新计算。</p><form class="search-field" @submit.prevent="search"><AppIcon name="search" :size="20" /><input v-model="keyword" placeholder="搜索城市、商圈或具体地点" aria-label="搜索地点" /><button :disabled="loading || !keyword.trim()" type="submit">搜索</button></form><button class="locate-button" :disabled="loading" @click="locate"><AppIcon name="locate" />{{ loading ? '正在查找位置…' : '使用我的当前位置' }}</button><p v-if="error" class="error" role="status">{{ error }}</p><button v-for="(place, index) in places" :key="index" class="place-item" @click="choose(place)"><AppIcon name="pin" :size="19" /><span><b>{{ place.name }}</b><small>{{ place.address || '已找到该位置' }}</small></span><AppIcon name="chevron" :size="17" /></button><div class="section-heading"><h2>体验推荐区域</h2></div><button class="place-item" @click="chooseDemo"><AppIcon name="map" :size="20" /><span><b>{{ START_PLACE.name }}</b><small>{{ START_PLACE.note }}</small></span><AppIcon name="chevron" :size="17" /></button><div class="notice"><AppIcon name="info" :size="15" />{{ START_PLACE.note }}，离得太远会找不到店。</div></div></BottomSheet></template>
<script setup lang="ts">
import { ref } from 'vue'
import { loadAMap } from '@/lib/amap'
import type { Place } from '@/lib/amap'
import { useDiningStore } from '@/stores/dining'
import { START_PLACE } from '@/data/restaurants'
import BottomSheet from './BottomSheet.vue'
import AppIcon from './AppIcon.vue'
defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>(), store = useDiningStore(), keyword = ref(''), loading = ref(false), error = ref(''), places = ref<Place[]>([])
// Searches the official POI service instead of interpreting arbitrary text as a location.
async function search() {
  error.value = ''; loading.value = true
  try { const AMap = await loadAMap(); new AMap.PlaceSearch({ pageSize: 6, citylimit: false }).search(keyword.value, (status, result) => { loading.value = false; places.value = status === 'complete' ? result.poiList?.pois || [] : []; if (!places.value.length) error.value = '没有找到这个地点，试试更具体的名称。' }) } catch (e) { loading.value = false; error.value = (e as Error).message }
}
// AMap geolocation returns coordinates in the same system as the restaurant markers.
async function locate() {
  error.value = ''; loading.value = true
  try { const AMap = await loadAMap(); new AMap.Geolocation({ enableHighAccuracy: true, timeout: 10000, convert: true }).getCurrentPosition((status, result) => { loading.value = false; if (status === 'complete' && result.position) { store.filters.center = [result.position.lng, result.position.lat]; store.filters.locationName = result.formattedAddress || '当前位置'; emit('close'); store.notify('已更新搜索中心') } else error.value = '无法获取定位，请允许定位权限，或手动搜索地点。' }) } catch (e) { loading.value = false; error.value = (e as Error).message }
}
function choose(place: Place) { store.filters.center = [place.location.lng, place.location.lat]; store.filters.locationName = place.name; emit('close') }
function chooseDemo() { store.filters.center = [...START_PLACE.center]; store.filters.locationName = START_PLACE.name; emit('close') }
</script>
<style lang="less" scoped>
.location-picker { .search-field { display: flex; gap: 8px; align-items: center; background: var(--cream); border: 1px solid var(--line); padding: 10px 12px; border-radius: 13px; input { min-width: 0; width: 100%; border: 0; background: none; outline: 0; font-size: var(--input-size); } button { border: 0; background: none; font-size: var(--label-size); white-space: nowrap; color: var(--green); padding: 6px 0; } } .locate-button { display: flex; align-items: center; gap: 10px; background: #e7eee3; border: 0; border-radius: 12px; color: var(--green); padding: 15px; width: 100%; margin: 15px 0; font-size: var(--body-size); } .place-item { display: flex; width: 100%; align-items: center; gap: 12px; background: none; border: 0; border-bottom: 1px solid var(--line); padding: 17px 0; text-align: left; span { flex: 1; b { display: block; font-size: var(--body-size); } small { display: block; font-size: var(--small-size); color: var(--muted); margin-top: 6px; } } } .notice { margin-top: 25px; } .error { color: var(--red); font-size: var(--label-size); line-height: var(--line-body); } }
</style>
