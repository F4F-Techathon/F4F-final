import { reactive } from 'vue'

// The console's own message bus: what the relay, the phone and the generator report, in the order it
// happened. The 事件 panel lists it; the system page lights its diagram from it.
export interface StudioEvent {
  n: number
  type: string
  /** A cast id (restaurant, guest, host or user) when the event concerns one character. */
  who?: string
  detail?: string
  /** Seconds since this console opened. */
  t: number
}

const LIMIT = 160
const started = performance.now()
export const eventLog = reactive({ items: [] as StudioEvent[], count: 0 })
const listeners = new Set<(event: StudioEvent) => void>()

export function emit(type: string, who?: string, detail?: string) {
  const event: StudioEvent = { n: ++eventLog.count, type, ...(who ? { who } : {}), ...(detail ? { detail } : {}), t: (performance.now() - started) / 1000 }
  eventLog.items.unshift(event)
  if (eventLog.items.length > LIMIT) eventLog.items.length = LIMIT
  for (const listener of listeners) listener(event)
}

export function onEvent(listener: (event: StudioEvent) => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function clearEvents() {
  eventLog.items.splice(0)
}
