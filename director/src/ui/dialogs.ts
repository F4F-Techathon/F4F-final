import { reactive } from 'vue'

interface DialogState {
  kind: 'confirm' | 'name' | null
  title: string
  body: string
  check: string
  checked: boolean
  ok: string
  danger: boolean
  value: string
  placeholder: string
  resolve: ((result: { ok: boolean; checked: boolean; value: string }) => void) | null
}

export const dialog = reactive<DialogState>({ kind: null, title: '', body: '', check: '', checked: true, ok: '确定', danger: false, value: '', placeholder: '', resolve: null })

function open(kind: 'confirm' | 'name', fields: Partial<DialogState>) {
  dialog.resolve?.({ ok: false, checked: false, value: '' })
  return new Promise<{ ok: boolean; checked: boolean; value: string }>((resolve) => {
    Object.assign(dialog, { kind, title: '', body: '', check: '', checked: true, ok: '确定', danger: false, value: '', placeholder: '', ...fields, resolve })
  })
}

export function settleDialog(ok: boolean) {
  const resolve = dialog.resolve
  const result = { ok, checked: dialog.checked, value: dialog.value.trim() }
  Object.assign(dialog, { kind: null, resolve: null })
  resolve?.(result)
}

/** A yes/no question; an optional checkbox (checked by default) rides along. */
export async function confirmBox(options: { title: string; body?: string; check?: string; ok?: string; danger?: boolean }) {
  const { ok, checked } = await open('confirm', options)
  return { ok, checked: ok && !!options.check && checked }
}

/** Asks for a name; null when cancelled or left empty. */
export async function askName(options: { title: string; body?: string; value?: string; placeholder?: string; ok?: string }) {
  const { ok, value } = await open('name', options)
  return ok && value ? value : null
}
