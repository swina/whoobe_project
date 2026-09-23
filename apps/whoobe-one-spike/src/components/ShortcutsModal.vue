<template>
  <div class="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-6" @mousedown.self="$emit('close')">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <span class="text-sm font-semibold text-gray-700">Keyboard shortcuts</span>
        <button class="text-gray-400 hover:text-gray-700" @click="$emit('close')"><X class="w-4 h-4" /></button>
      </div>
      <div class="overflow-y-auto p-4">
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
          <template v-for="(label, key) in shortcuts" :key="key">
            <dt class="font-mono font-semibold text-gray-700 whitespace-nowrap">Alt+{{ key }}</dt>
            <dd class="text-gray-500">{{ label }}</dd>
          </template>
        </dl>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Alt+K (hotkeys.ts) already emitted dialogBus's 'shortcuts' event -
// nothing listened for it (same "inert until built" state Alt+< was in,
// per hotkeys.ts's own header comment). BlockEditor.vue now opens this
// both from that event and from a toolbar icon button. The list itself
// isn't hand-duplicated here - it reads straight from hotkeys.ts's own
// exported `shortcuts` dict, the same object the hotkey handlers below it
// are keyed against, so a future new hotkey only has to be added once.
import { X } from '@lucide/vue'
import { shortcuts } from '../scripts/hotkeys'

defineEmits<{ (e: 'close'): void }>()
</script>
