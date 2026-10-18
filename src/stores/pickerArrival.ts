import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { PICKER_ARRIVAL_DURATION, pickerArrivalProgress } from '@/lib/pickerArrivalMotion'

// Transient choreography is separate from dining choices and the later theater entrance.
export const usePickerArrivalStore = defineStore('picker-arrival', () => {
  const phase = ref<'idle' | 'departing' | 'arriving'>('idle')
  const elapsed = ref(0)
  const listening = ref(false)
  const thinking = ref(false)
  const active = computed(() => phase.value !== 'idle')
  const progress = computed(() => pickerArrivalProgress(active.value ? elapsed.value : PICKER_ARRIVAL_DURATION))

  // Ignore duplicate starts until the current handoff finishes or is canceled.
  function begin() {
    if (active.value) return false
    phase.value = 'departing'
    elapsed.value = 0
    return true
  }

  function arrive() { phase.value = 'arriving'; elapsed.value = 0 }
  function finish() { phase.value = 'idle'; elapsed.value = 0 }

  return { phase, elapsed, listening, thinking, active, progress, begin, arrive, finish }
})
