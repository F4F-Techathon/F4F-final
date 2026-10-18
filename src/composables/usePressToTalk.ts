import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue'
import { useSpeechInput } from './useSpeechInput'

/** Something that turns a held button's speech into text: the browser's recognition, or the multi-agent backend's. */
export interface SpeechEngine {
  listening: Ref<boolean>
  error: Ref<string>
  transcript: Ref<string>
  start(handlers: { onText: (text: string) => void; onComplete: (text: string) => void }): void
  stop(): void
  cancel(): void
}

interface PressToTalkOptions {
  disabled?: () => boolean
  onStart?: () => void
  onComplete: (text: string) => void
  /** Another engine to use while it is available; the browser's speech recognition otherwise. */
  engine?: () => SpeechEngine | null
}

// Share one hold gesture across intake and stage, keeping final words until the user releases.
export function usePressToTalk(onText: (text: string) => void, options: PressToTalkOptions) {
  const holding = ref(false)
  let accepting = false, pressedAt = 0, pendingText = ''
  let pointerId: number | undefined, captureTarget: HTMLElement | undefined, heldKey: string | undefined
  function finished(text: string) {
    if (!accepting) return
    if (holding.value) pendingText = text
    else complete(text)
  }
  // The button is held for as long as the user talks: a session the browser ends early is resumed.
  const browser = useSpeechInput(onText, { resume: true, onComplete: finished })
  const browserEngine: SpeechEngine = { ...browser, start: () => browser.start() }
  const engine = shallowRef<SpeechEngine>(browserEngine)
  const listening = computed(() => holding.value || engine.value.listening.value)
  const finishing = computed(() => !holding.value && engine.value.listening.value)

  function complete(text: string) { accepting = false; pendingText = ''; options.onComplete(text) }

  // Clear ownership before releasing capture: lostpointercapture must not cancel a completed hold.
  function releaseCapture() {
    const target = captureTarget, id = pointerId
    captureTarget = undefined; pointerId = undefined; heldKey = undefined
    if (target && id !== undefined && target.hasPointerCapture(id)) target.releasePointerCapture(id)
  }

  function cancel() {
    accepting = false; pendingText = ''; holding.value = false
    releaseCapture()
    engine.value.cancel()
  }

  // Start synchronously in the user gesture so microphone permission works on mobile browsers.
  function begin() {
    if (options.disabled?.() || accepting || listening.value) return false
    engine.value = options.engine?.() || browserEngine
    accepting = true; holding.value = true; pressedAt = performance.now()
    options.onStart?.()
    engine.value.start({ onText, onComplete: finished })
    if (!engine.value.listening.value) { cancel(); return false }
    return true
  }

  function release() {
    if (!holding.value) return
    if (performance.now() - pressedAt < 200) { cancel(); return }
    holding.value = false
    releaseCapture()
    if (pendingText) complete(pendingText)
    else engine.value.stop()
  }

  function pointerdown(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0 || pointerId !== undefined || heldKey) return
    event.preventDefault()
    if (!begin()) return
    pointerId = event.pointerId
    captureTarget = event.currentTarget as HTMLElement
    try { captureTarget.setPointerCapture(event.pointerId) }
    catch { cancel() }
  }

  function pointerup(event: PointerEvent) { if (event.pointerId === pointerId) release() }
  function pointercancel(event: PointerEvent) { if (event.pointerId === pointerId) cancel() }
  function keydown(event: KeyboardEvent) {
    if (event.key !== ' ' && event.key !== 'Enter') return
    event.preventDefault()
    if (!event.repeat && pointerId === undefined && !heldKey && begin()) heldKey = event.key
  }
  function keyup(event: KeyboardEvent) {
    if (event.key !== heldKey) return
    event.preventDefault()
    release()
  }
  function visibilitychange() { if (document.hidden) cancel() }

  watch(() => engine.value.error.value, (value) => { if (value) cancel() }, { flush: 'sync' })
  onMounted(() => { window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', visibilitychange) })
  onBeforeUnmount(() => { cancel(); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', visibilitychange) })

  return {
    holding, listening, finishing, cancel,
    // Writable, so a page can clear a shown error once the user retries another way.
    error: computed({ get: () => engine.value.error.value, set: (value: string) => { engine.value.error.value = value } }),
    transcript: computed(() => engine.value.transcript.value),
    events: {
      pointerdown, pointerup, pointercancel, lostpointercapture: pointercancel, keydown, keyup,
      blur: () => { if (holding.value) cancel() },
      contextmenu: (event: Event) => event.preventDefault(), click: (event: Event) => event.preventDefault(),
    },
  }
}
