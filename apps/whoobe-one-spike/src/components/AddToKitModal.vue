<template>
  <div class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center" @click.self="$emit('close')">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col overflow-hidden">
      <div class="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span class="text-xs font-semibold text-gray-600">Add to kit</span>
        <button class="flex items-center gap-1 text-gray-400 hover:text-gray-700 text-xs" @click="$emit('close')"><X class="w-3.5 h-3.5" /> Close</button>
      </div>

      <form class="p-4 space-y-4 text-xs" @submit.prevent="submit">
        <div v-if="kits.length" class="flex gap-4 text-gray-600">
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" value="existing" v-model="mode" />
            Existing kit
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" value="new" v-model="mode" />
            New kit
          </label>
        </div>

        <div v-if="mode === 'existing' && kits.length">
          <label class="block font-semibold text-gray-600 mb-1">Kit</label>
          <select v-model="targetKitId" required class="w-full px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500">
            <option value="" disabled>Choose a kit…</option>
            <option v-for="k in kits" :key="k.id" :value="k.id">{{ k.name }} ({{ k.category }})</option>
          </select>
        </div>

        <template v-else>
          <div>
            <label class="block font-semibold text-gray-600 mb-1">New kit name</label>
            <input
              v-model="newKitName"
              type="text"
              required
              placeholder="e.g. Pricing Kit"
              class="w-full px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label class="block font-semibold text-gray-600 mb-1">New kit category</label>
            <input
              v-model="newKitCategory"
              type="text"
              required
              placeholder="e.g. Pricing"
              class="w-full px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </template>

        <div>
          <label class="block font-semibold text-gray-600 mb-1">Template name</label>
          <input
            v-model="templateName"
            type="text"
            required
            placeholder="e.g. Pricing table with 3 tiers"
            class="w-full px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label class="block font-semibold text-gray-600 mb-1">Template category</label>
          <input
            v-model="templateCategory"
            type="text"
            required
            placeholder="e.g. Pricing"
            class="w-full px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div v-if="error" class="px-2 py-1.5 rounded-md bg-rose-50 border border-rose-200 text-rose-600">{{ error }}</div>

        <div class="flex justify-end gap-2 pt-1">
          <button type="button" class="px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold" @click="$emit('close')">
            Cancel
          </button>
          <button
            type="submit"
            :disabled="submitting"
            class="px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-50"
          >
            {{ submitting ? 'Adding…' : 'Add to kit' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
// Not a port - no equivalent exists in the source app for adding the
// current document to one of its own public/kits/*.json collections (those
// are only ever static, read-only files there). Mirrors SaveSnippetModal.
// vue's "new vs. existing" mode toggle for the same reason: without it,
// every "add to a kit" action would have to create a brand new kit, when
// usually the point is adding one more template to a kit that already
// exists.
import { onMounted, ref } from 'vue'
import { X } from '@lucide/vue'
import { useEditorStore } from '../store/editor'
import { addTemplateToKit, listKits, type KitSummary } from '../scripts/database-actions'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const editor = useEditorStore()

const kits = ref<KitSummary[]>([])
const mode = ref<'existing' | 'new'>('new')
const targetKitId = ref('')
const newKitName = ref('')
const newKitCategory = ref('')
const templateName = ref('')
const templateCategory = ref('')
const error = ref('')
const submitting = ref(false)

onMounted(async () => {
  kits.value = await listKits()
  if (kits.value.length) mode.value = 'existing'
  // Default the template's own metadata to whatever the current document
  // is already named/categorized as, if it has one - saves retyping the
  // common case (adding an already-named page you just built to a kit).
  if (editor.page) {
    templateName.value = editor.page.name || ''
    templateCategory.value = editor.page.category || ''
  }
})

async function submit() {
  error.value = ''
  if (mode.value === 'existing' && !targetKitId.value) {
    error.value = 'Choose a kit'
    return
  }
  if (mode.value === 'new' && (!newKitName.value.trim() || !newKitCategory.value.trim())) {
    error.value = 'New kit name and category are required'
    return
  }
  if (!templateName.value.trim() || !templateCategory.value.trim()) {
    error.value = 'Template name and category are required'
    return
  }

  submitting.value = true
  try {
    const target =
      mode.value === 'existing'
        ? { kitId: targetKitId.value }
        : { newKitName: newKitName.value.trim(), newKitCategory: newKitCategory.value.trim() }
    await addTemplateToKit(editor, target, { name: templateName.value.trim(), category: templateCategory.value.trim() })
    emit('close')
  } catch (e: any) {
    error.value = e?.message || 'Failed to add to kit'
  } finally {
    submitting.value = false
  }
}
</script>
