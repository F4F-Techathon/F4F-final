import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { Restaurant } from '@/data/types'
import type { EntranceAnchors } from '@/lib/entranceMotion'
import { STAGE_DURATION, segment } from '@/lib/entranceMotion'

export interface EntranceScene {
  actors: Restaurant[]
  mapAvailable: boolean
  anchors: () => EntranceAnchors
  focusTarget: () => void
}

// This short-lived visual state never enters the persisted dining session.
export const useEntranceStore = defineStore('entrance', () => {
  const scene = shallowRef<EntranceScene | null>(null)
  const phase = ref<'map' | 'covered' | 'stage'>('map')
  const elapsed = ref(0)
  const active = computed(() => scene.value !== null)
  const stageProgress = computed(() => !active.value ? 1 : phase.value === 'stage' ? segment(elapsed.value, 0, STAGE_DURATION) : 0)

  function begin(value: EntranceScene) {
    if (active.value) return false
    scene.value = value
    phase.value = 'map'
    elapsed.value = 0
    return true
  }

  function cover() { phase.value = 'covered'; elapsed.value = 0 }
  function reveal() { phase.value = 'stage'; elapsed.value = 0 }
  function finish() { scene.value = null; elapsed.value = 0 }

  return { scene, phase, elapsed, active, stageProgress, begin, cover, reveal, finish }
})
