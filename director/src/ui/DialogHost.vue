<template>
  <div v-if="dialog.kind" class="scrim" @pointerdown.self="settleDialog(false)">
    <div class="modal" role="dialog" aria-modal="true" :aria-label="dialog.title" @keydown.capture="keys">
      <div class="modal-h"><h2>{{ dialog.title }}</h2></div>
      <div class="modal-b">
        <p v-if="dialog.body">{{ dialog.body }}</p>
        <label v-if="dialog.kind === 'confirm' && dialog.check" class="confirm-check"><input v-model="dialog.checked" type="checkbox" />{{ dialog.check }}</label>
        <input v-if="dialog.kind === 'name'" ref="field" v-model="dialog.value" :placeholder="dialog.placeholder" maxlength="40" />
      </div>
      <div class="modal-f">
        <button class="btn ghost" type="button" @click="settleDialog(false)">取消</button>
        <button ref="ok" class="btn" :class="dialog.danger ? 'danger-fill' : 'primary'" type="button" @click="settleDialog(true)">{{ dialog.ok }}</button>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { dialog, settleDialog } from './dialogs.ts'

const field = ref<HTMLInputElement>(), ok = ref<HTMLButtonElement>()
watch(() => dialog.kind, async (kind) => {
  if (!kind) return
  await nextTick()
  if (kind === 'name') { field.value?.focus(); field.value?.select() } else ok.value?.focus()
})

// Enter confirms (not while an input method is composing); Esc cancels and stops there, so the composer underneath does not also act.
function keys(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); settleDialog(false) }
  else if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) { event.stopPropagation(); event.preventDefault(); settleDialog(true) }
}
</script>
