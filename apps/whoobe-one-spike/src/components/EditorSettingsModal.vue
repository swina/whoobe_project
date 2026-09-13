<template>
  <div class="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-6" @click.self="$emit('close')">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-sm max-h-[85vh] flex flex-col overflow-hidden">
      <div class="flex items-center justify-between px-4 py-2 border-b shrink-0">
        <span class="font-semibold text-gray-700 text-sm">Editor Settings</span>
        <button class="flex items-center gap-1 text-gray-400 hover:text-gray-700 text-xs" @click="$emit('close')">
          <X class="w-3.5 h-3.5" /> Close
        </button>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
        <section class="space-y-3">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">Autosave</h3>
          <p class="text-[11px] text-gray-400">
            Automatically saves the current document at a regular interval.
          </p>

          <label class="flex items-center justify-between gap-3 text-xs text-gray-700">
            <span>Enable autosave</span>
            <button
              type="button"
              class="relative w-9 h-5 rounded-full border transition"
              :class="local.enabled ? 'bg-indigo-500 border-indigo-500' : 'bg-gray-200 border-gray-300'"
              @click="local.enabled = !local.enabled"
            >
              <span
                class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition"
                :class="local.enabled ? 'left-4' : 'left-0.5'"
              ></span>
            </button>
          </label>

          <div class="flex items-center justify-between gap-3 text-xs text-gray-700">
            <span>Interval (seconds)</span>
            <input
              type="number"
              min="10"
              max="600"
              step="5"
              class="w-20 px-2 py-1 border rounded text-xs text-gray-700 text-center"
              v-model.number="local.interval"
              :disabled="!local.enabled"
              @keydown.enter="save"
            />
          </div>
          <p class="text-[10px] text-gray-400">Between 10 and 600 seconds (min 10s, max 10min).</p>
        </section>
      </div>

      <div class="flex items-center justify-end gap-2 px-4 py-3 border-t shrink-0">
        <button
          class="px-3 py-1.5 text-xs font-semibold rounded bg-indigo-500 text-white hover:bg-indigo-600"
          @click="save"
        >
          Save
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { X } from '@lucide/vue'
import { useEditorStore } from '../store/editor'

const emit = defineEmits<{ close: [] }>()
const editor = useEditorStore()

const local = ref({ ...editor.autosave })

function save() {
  const interval = Math.max(10, Math.min(600, Math.round(local.value.interval)))
  if (local.value.enabled && interval < 10) return
  editor.setAutosave({ enabled: local.value.enabled, interval })
  emit('close')
}
</script>