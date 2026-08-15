<template>
  <div v-if="searchConfig" class="p-2 border-b bg-white">
    <button
      type="button"
      class="text-xs border rounded px-2 py-1.5 w-full bg-gray-50 flex items-center justify-between hover:border-indigo-400"
      @click="showModal = true"
    >
      <span class="font-semibold text-gray-600">Search</span>
      <span class="text-indigo-600 font-semibold shrink-0 ml-2 truncate">{{ summaryLabel }}</span>
    </button>

    <Teleport to="body">
      <div v-if="showModal" class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center" @click.self="showModal = false">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden text-sm">
          <div class="flex items-center justify-between px-3 py-2 border-b shrink-0">
            <span class="text-xs font-semibold text-gray-600">Search configuration</span>
            <button type="button" class="text-gray-400 hover:text-gray-700" @click="showModal = false"><X class="w-4 h-4" /></button>
          </div>

          <div class="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
            <label class="flex flex-col gap-0.5 text-[10px] text-gray-500">
              Placeholder
              <input v-model="placeholder" type="text" class="text-xs border rounded px-1.5 py-1" placeholder="Search…" />
            </label>

            <label class="flex flex-col gap-0.5 text-[10px] text-gray-500">
              Dropdown classes
              <input v-model="dropdownClass" type="text" class="text-xs border rounded px-1.5 py-1 font-mono" placeholder="bg-white border border-gray-200 rounded-lg shadow-lg" />
              <span class="text-[10px] text-gray-400 italic">Tailwind utilities for the results dropdown; blank = no styling.</span>
            </label>

            <label class="flex flex-col gap-0.5 text-[10px] text-gray-500">
              Input classes
              <input v-model="inputClass" type="text" class="text-xs border rounded px-1.5 py-1 font-mono" placeholder="w-full rounded-l-full border border-gray-300 bg-white px-4 py-2 text-sm" />
              <span class="text-[10px] text-gray-400 italic">Tailwind utilities for the search input; blank = no styling.</span>
            </label>

            <label class="flex flex-col gap-0.5 text-[10px] text-gray-500">
              Button classes
              <input v-model="buttonClass" type="text" class="text-xs border rounded px-1.5 py-1 font-mono" placeholder="rounded-r-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white" />
              <span class="text-[10px] text-gray-400 italic">Tailwind utilities for the submit button; blank = no styling.</span>
            </label>

            <div class="flex items-center gap-4 border rounded p-1.5">
              <label class="flex flex-col gap-0.5 text-[10px] text-gray-500 flex-1">
                Button label
                <input v-model="buttonLabel" type="text" class="text-xs border rounded px-1.5 py-1" placeholder="Search" />
              </label>
              <label class="flex items-center gap-1.5 text-xs text-gray-600 pb-1">
                <input type="checkbox" v-model="buttonIcon" />
                Icon instead of text
              </label>
            </div>

            <div class="flex flex-col gap-1 border rounded p-1.5">
              <span class="text-[10px] font-semibold text-gray-600 uppercase">Search in</span>
              <label class="flex items-center gap-1.5 text-xs text-gray-600">
                <input type="checkbox" v-model="searchConfig.types.page" />
                Pages
              </label>
              <label class="flex items-center gap-1.5 text-xs text-gray-600">
                <input type="checkbox" v-model="searchConfig.types.asset" />
                Assets
              </label>
              <label class="flex items-center gap-1.5 text-xs text-gray-600">
                <input type="checkbox" v-model="searchConfig.types.object" />
                Objects
              </label>
            </div>

            <template v-if="searchConfig.types.object">
              <div class="flex flex-col gap-1 border rounded p-1.5">
                <span class="text-[10px] font-semibold text-gray-600 uppercase">Object classes</span>
                <p class="text-[10px] text-gray-400">Leave all unchecked to search objects of every class.</p>
                <label v-if="classes.length === 0" class="text-[10px] text-gray-400 italic">Loading classes…</label>
                <label
                  v-for="c in classes"
                  :key="c.id"
                  class="flex items-center gap-1.5 text-xs text-gray-600"
                >
                  <input type="checkbox" :value="c.id" v-model="searchConfig.classIds" />
                  {{ c.label }}
                </label>
              </div>
            </template>
          </div>

          <div class="flex items-center justify-end gap-2 px-3 py-2 border-t shrink-0">
            <button type="button" class="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-500" @click="showModal = false">Done</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
// Standalone control rendered by AdvancedPanel.vue (only for tag ===
// 'search' elements), mirroring FormConfigControl.vue's modal pattern - a
// search box's scope is a one-off setup dialog, not an accordion knob.
// Direct-mutates editor.current's placeholder + searchConfig live, same as
// FormConfigControl does for formConfig.
import { computed, onMounted, ref } from 'vue'
import { X } from '@lucide/vue'
import { useEditorStore } from '../../store/editor'
import { listDataClasses, type DataClassRecord } from '../../data-objects-api'
import type { ElementSearchConfig } from '../../scripts/ElementsClass.js'

const editor = useEditorStore()
const classes = ref<DataClassRecord[]>([])
const showModal = ref(false)

onMounted(async () => {
  try {
    classes.value = await listDataClasses()
  } catch (e) {
    console.warn('[SearchConfigControl] Failed to load data classes:', e)
  }
})

const searchConfig = computed(() => {
  const config = (editor.current as any)?.searchConfig as ElementSearchConfig | undefined
  if (config && !config.types) {
    config.types = { page: true, object: true, asset: false }
  }
  if (config && !config.classIds) config.classIds = []
  return config ?? null
})

// The element's own `placeholder` field (shared with the Input* elements),
// read/written through the store's current node.
const placeholder = computed({
  get: () => ((editor.current as any)?.placeholder as string) ?? '',
  set: (v: string) => {
    if (editor.current) (editor.current as any).placeholder = v
  },
})

// searchConfig.dropdownClass - the live results dropdown's custom classes.
const dropdownClass = computed({
  get: () => ((editor.current as any)?.searchConfig?.dropdownClass as string) ?? '',
  set: (v: string) => {
    const config = searchConfig.value
    if (config) config.dropdownClass = v
  },
})

// searchConfig.inputClass / buttonClass - custom classes for the search
// input and submit button (appended to their built-in defaults).
const inputClass = computed({
  get: () => ((editor.current as any)?.searchConfig?.inputClass as string) ?? '',
  set: (v: string) => {
    const config = searchConfig.value
    if (config) config.inputClass = v
  },
})

const buttonClass = computed({
  get: () => ((editor.current as any)?.searchConfig?.buttonClass as string) ?? '',
  set: (v: string) => {
    const config = searchConfig.value
    if (config) config.buttonClass = v
  },
})

// searchConfig.buttonLabel / buttonIcon - the submit button's text, and
// whether to show the search icon instead.
const buttonLabel = computed({
  get: () => ((editor.current as any)?.searchConfig?.buttonLabel as string) ?? '',
  set: (v: string) => {
    const config = searchConfig.value
    if (config) config.buttonLabel = v
  },
})

const buttonIcon = computed({
  get: () => !!((editor.current as any)?.searchConfig?.buttonIcon as boolean),
  set: (v: boolean) => {
    const config = searchConfig.value
    if (config) config.buttonIcon = v
  },
})

const summaryLabel = computed(() => {
  const config = searchConfig.value
  if (!config) return ''
  const parts: string[] = []
  if (config.types.object) parts.push(config.classIds.length > 0 ? `objects (${config.classIds.length} class)${config.classIds.length > 1 ? 'es' : ''}` : 'objects')
  if (config.types.asset) parts.push('assets')
  if (config.types.page) parts.push('pages')
  return parts.length > 0 ? parts.join(', ') : 'Nothing'
})
</script>
