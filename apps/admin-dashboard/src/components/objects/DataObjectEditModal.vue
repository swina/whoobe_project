<template>
  <div class="fixed inset-0 z-[9000] bg-black/60 flex items-center justify-center p-6" @click.self="emit('close')">
    <div class="w-full max-w-2xl max-h-[85vh] flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
      <div class="shrink-0 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h3 class="text-sm font-bold text-slate-100">{{ isCreate ? `New ${dataClass.label}` : dataObject!.key }}</h3>
          <p class="text-xs text-slate-500 font-mono">{{ dataClass.label }}</p>
        </div>
        <button @click="emit('close')" class="text-slate-500 hover:text-slate-300 text-lg leading-none">✕</button>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
        <div>
          <label class="block text-xs font-semibold text-slate-400 mb-1">Key<span class="text-rose-400"> *</span></label>
          <input
            v-model="key"
            type="text"
            placeholder="e.g. san-benedetto"
            class="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <DataObjectForm :fields="dataClass.fields" v-model="attributes" />
      </div>

      <div class="shrink-0 px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-2">
        <button @click="emit('close')" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200">
          Cancel
        </button>
        <button
          @click="save(false)"
          :disabled="!!isSaving || !key.trim()"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50"
        >
          {{ isSaving === 'draft' ? 'Saving…' : 'Save as Draft' }}
        </button>
        <button
          @click="save(true)"
          :disabled="!!isSaving || !key.trim()"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
        >
          {{ isSaving === 'published' ? 'Publishing…' : 'Save and Publish' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDataObjectsStore } from '../../stores/dataObjectsStore'
import { useToastStore } from '../../stores/toastStore'
import type { DataClass } from '../../utils/data-classes-api'
import type { DataObject } from '../../utils/data-objects-api'
import DataObjectForm from './DataObjectForm.vue'

const props = defineProps<{
  dataClass: DataClass
  dataObject?: DataObject | null
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const dataObjectsStore = useDataObjectsStore()
const toastStore = useToastStore()

const isCreate = !props.dataObject
const key = ref(props.dataObject?.key ?? '')
const attributes = ref<Record<string, unknown>>({ ...(props.dataObject?.attributes ?? {}) })
const isSaving = ref<'draft' | 'published' | null>(null)

async function save(publish: boolean) {
  isSaving.value = publish ? 'published' : 'draft'
  try {
    if (isCreate) {
      const created = await dataObjectsStore.createDataObject({
        classId: props.dataClass.id,
        key: key.value.trim(),
        attributes: attributes.value,
      })
      // The create route has no `published` field of its own (matching
      // createWhoobePage's identical shape) - a second call flips it,
      // same as updating any other existing object.
      if (publish) await dataObjectsStore.updateDataObject(created.id, { published: true })
    } else {
      await dataObjectsStore.updateDataObject(props.dataObject!.id, {
        key: key.value.trim(),
        attributes: attributes.value,
        published: publish,
      })
    }
    emit('saved')
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to save object')
  } finally {
    isSaving.value = null
  }
}
</script>
