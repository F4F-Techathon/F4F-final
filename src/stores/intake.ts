import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { parseIntakeRequest, parseIntakeResult } from '@/lib/intakeProtocol'
import type { IntakeResult, IntakeTurn } from '@/lib/intakeProtocol'

const STORAGE_KEY = 'tonight-intake-v1'

export const useIntakeStore = defineStore('intake', () => {
  const result = ref<IntakeResult | null>(null)
  const turns = ref<IntakeTurn[]>([])
  const pendingText = ref(''), loading = ref(false), error = ref('')
  const canConfirm = computed(() => !!result.value && !loading.value && !pendingText.value)
  let controller: AbortController | undefined
  let generation = 0

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (saved) {
      const parsed = parseIntakeRequest({ turns: saved.turns, previous: saved.result?.requirements || null, utterance: saved.pendingText || '恢复对话' })
      const restored = saved.result ? parseIntakeResult(saved.result) : null
      result.value = restored
      turns.value = parsed.turns
      pendingText.value = saved.pendingText ? parsed.utterance : ''
      if (pendingText.value) error.value = '这句还没整理好，再试一次。'
    }
  } catch { /* An invalid or unavailable saved draft starts a new conversation. */ }

  watch([result, turns, pendingText], () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ result: result.value, turns: turns.value.slice(-20), pendingText: pendingText.value })) } catch { /* The current conversation remains usable without storage. */ }
  }, { deep: true })

  // Abort and invalidate the response before navigation or a new dining flow can reuse this store.
  function cancel() {
    generation++
    controller?.abort()
    controller = undefined
    loading.value = false
    if (pendingText.value) error.value = '这句还没整理好，再试一次。'
  }

  function reset() { cancel(); result.value = null; turns.value = []; pendingText.value = ''; error.value = '' }

  // A successful turn replaces one complete snapshot; failures keep both the last result and the new words.
  async function submit(value: string) {
    if (loading.value || !value.trim()) return
    const utterance = value.trim()
    pendingText.value = utterance
    if (utterance.length > 4000) { error.value = '这一段有点长，重新说得简短一点吧。'; return }
    error.value = ''
    loading.value = true
    controller = new AbortController()
    const requestController = controller
    const timeout = setTimeout(() => requestController.abort(), 50000)
    const current = ++generation
    try {
      const response = await fetch('/api/intake', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ turns: turns.value.slice(-20), previous: result.value?.requirements || null, utterance }),
      })
      const payload = await response.json()
      if (current !== generation) return
      if (!response.ok) { error.value = typeof payload.error === 'string' ? payload.error : '这句没整理好，再试一次。'; return }
      const next = parseIntakeResult(payload)
      result.value = next
      turns.value.push({ role: 'user', content: utterance }, { role: 'assistant', content: JSON.stringify(next) })
      turns.value = turns.value.slice(-20)
      pendingText.value = ''
    } catch {
      if (current === generation) error.value = '这句没整理好，再试一次。'
    } finally {
      clearTimeout(timeout)
      if (current === generation) { loading.value = false; controller = undefined }
    }
  }

  function retry() { return submit(pendingText.value) }

  return { result, turns, pendingText, loading, error, canConfirm, submit, retry, cancel, reset }
})
