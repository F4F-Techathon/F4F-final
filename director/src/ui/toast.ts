import { reactive } from 'vue'

// One short notice at a time, as agent-studio's console shows them.
export const toastState = reactive({ text: '', tone: 'ok' as 'ok' | 'bad', key: 0 })
let timer: ReturnType<typeof setTimeout> | undefined

export function toast(text: string, tone: 'ok' | 'bad' = 'ok', ms = 2200) {
  clearTimeout(timer)
  Object.assign(toastState, { text, tone, key: toastState.key + 1 })
  timer = setTimeout(() => { toastState.text = '' }, ms)
}
