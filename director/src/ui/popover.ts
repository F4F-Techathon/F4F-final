import { markRaw, reactive, type Component } from 'vue'

/** A face in a menu row: a character id from the registry, shown with this expression. */
export interface PopFace { who: string; expr?: string }
export type PopItem =
  | { head: string; c?: string }
  | { sep: true }
  | { label: string; sub?: string; icon?: string; face?: PopFace; kbd?: string; on?: boolean; danger?: boolean; disabled?: boolean; title?: string; keep?: boolean; onClick?: () => void }

interface PopoverState {
  open: boolean
  anchor: HTMLElement | null
  items: PopItem[]
  component: Component | null
  props: Record<string, unknown>
  className: string
}

// The console has one popover for every menu: a card's ⋯, a line's ⋯, 会话 ▾, the speaker picker, 选项 and 「+」.
export const popover = reactive<PopoverState>({ open: false, anchor: null, items: [], component: null, props: {}, className: '' })

export function closePopover() {
  popover.open = false
  popover.anchor = null
}

// Clicking the same anchor again closes it.
export function openPopover(anchor: HTMLElement, options: { items?: PopItem[]; component?: Component; props?: Record<string, unknown>; className?: string }) {
  if (popover.open && popover.anchor === anchor) { closePopover(); return }
  Object.assign(popover, {
    open: true, anchor, items: options.items ?? [], component: options.component ? markRaw(options.component) : null,
    props: options.props ?? {}, className: options.className ?? '',
  })
}
