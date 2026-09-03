<template>
  <div class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center" @click.self="$emit('close')">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[80vh]">
      <div class="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span class="text-xs font-semibold text-gray-600">Import from Figma</span>
        <button class="text-xs text-gray-400 hover:text-gray-700" @click="$emit('close')"><X class="w-4 h-4" /></button>
      </div>

      <!-- Tab nav -->
      <div class="flex border-b bg-gray-50 px-3 shrink-0">
        <button
          v-for="tab in tabs" :key="tab.key"
          class="text-xs px-3 py-2 border-b-2 transition-colors"
          :class="tab.key === activeTab ? 'border-indigo-600 text-indigo-700 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'"
          @click="activeTab = tab.key"
        >{{ tab.label }}</button>
      </div>

      <div class="p-3 space-y-3 overflow-y-auto flex-1">
        <!-- Tab: Live API -->
        <template v-if="activeTab === 'live'">
          <div class="text-[10px] text-gray-400">
            Import a frame from Figma using the Live API. Requires a Figma access token configured in Settings → Figma.
          </div>
          <div v-if="!hasToken" class="text-xs text-amber-600 bg-amber-50 rounded px-3 py-2">
            Figma token not configured. Save it in <strong>Settings → Figma</strong> first.
          </div>
          <div class="space-y-2">
            <label class="text-xs text-gray-500 font-medium">File Key</label>
            <input
              v-model="fileKey"
              placeholder="e.g. abc123DEFgh"
              class="w-full text-xs border rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>
          <div class="space-y-2">
            <label class="text-xs text-gray-500 font-medium">Frame / Node ID (optional, leaves blank = first frame)</label>
            <input
              v-model="nodeId"
              placeholder="e.g. 1:2"
              class="w-full text-xs border rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>
          <div v-if="frames.length > 0" class="space-y-2">
            <label class="text-xs text-gray-500 font-medium">Select a frame to import:</label>
            <div class="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
              <button
                v-for="frame in frames" :key="frame.id"
                class="text-xs border rounded px-2 py-1.5 text-left hover:bg-indigo-50 transition-colors"
                :class="selectedFrameId === frame.id ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600'"
                @click="selectFrame(frame.id)"
              >{{ frame.name }}</button>
            </div>
          </div>
          <div v-if="apiError" class="text-xs text-rose-600">{{ apiError }}</div>
        </template>

        <!-- Tab: Upload JSON -->
        <template v-if="activeTab === 'upload'">
          <div class="text-[10px] text-gray-400">
            Upload a JSON file exported from Figma (e.g. via the "Export to JSON" plugin). The converter will parse it directly.
          </div>
          <div
            class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-indigo-400 transition-colors"
            @click="triggerFilePicker"
            @dragover.prevent
            @drop.prevent="onDropFile"
          >
            <Upload class="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p class="text-xs text-gray-500">{{ uploadedFile ? uploadedFile.name : 'Click or drop a Figma JSON file here' }}</p>
            <p v-if="uploadedFile" class="text-[10px] text-gray-400 mt-1">({{ (uploadedFile.size / 1024).toFixed(1) }} KB)</p>
          </div>
          <input ref="fileInput" type="file" accept=".json,application/json" class="hidden" @change="onFileSelected" />
          <div v-if="parseError" class="text-xs text-rose-600">{{ parseError }}</div>
        </template>

        <!-- Preview -->
        <div v-if="previewElement" class="border rounded-lg p-2 bg-gray-50">
          <div class="text-[10px] text-gray-400 mb-1">Preview: {{ previewName }}</div>
          <div class="max-h-48 overflow-auto border rounded bg-white p-2 transform scale-[0.6] origin-top-left" style="width: 166%;">
            <BlockContainerPreview :doc="safePreview" />
          </div>
        </div>
        <div v-if="warnings.length > 0" class="text-[10px] text-amber-600 bg-amber-50 rounded px-2 py-1 space-y-0.5">
          <div v-for="(w, i) in warnings" :key="i">{{ w }}</div>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="text-xs text-gray-400 inline-flex items-center gap-2">
          <Loader2 class="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between px-3 py-2 border-t bg-gray-50 shrink-0">
        <div class="flex items-center gap-2">
          <label
            class="text-xs text-gray-500 inline-flex items-center gap-1 cursor-pointer"
            :class="{ 'text-indigo-600 font-medium': mode === 'snippet' }"
          >
            <input type="radio" v-model="mode" value="snippet" class="w-3 h-3" />
            Import as Snippet
          </label>
          <label
            class="text-xs text-gray-500 inline-flex items-center gap-1 cursor-pointer"
            :class="{ 'text-indigo-600 font-medium': mode === 'page' }"
          >
            <input type="radio" v-model="mode" value="page" class="w-3 h-3" />
            Import as Page
          </label>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="text-xs px-3 py-1.5 rounded border text-gray-500 hover:bg-gray-50" @click="$emit('close')">Cancel</button>
          <button
            type="button"
            class="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
            :disabled="!canImport || loading"
            @click="onImport"
          >Import</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { X, Loader2, Upload } from '@lucide/vue'
import BlockContainerPreview from './preview/BlockContainerPreview.vue'
import { importFromFigma, fetchFigmaSettings, type FigmaImportResult } from '../figma-api'

const emit = defineEmits<{
  close: []
  imported: [result: { element: any; name: string; mode: 'page' | 'snippet' }]
}>()

const activeTab = ref<'live' | 'upload'>('live')
const mode = ref<'snippet' | 'page'>('snippet')
const loading = ref(false)
const apiError = ref('')
const parseError = ref('')

// Live API tab
const hasToken = ref(false)
const fileKey = ref('')
const nodeId = ref('')
const frames = ref<{ id: string; name: string }[]>([])
const selectedFrameId = ref('')

// Upload tab
const uploadedFile = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const uploadedJson = ref<Record<string, unknown> | null>(null)

// Result
const previewElement = ref<any>(null)
const previewName = ref('')
const warnings = ref<string[]>([])

onMounted(async () => {
  const settings = await fetchFigmaSettings()
  hasToken.value = settings?.hasToken ?? false
})

const safePreview = computed(() => {
  if (!previewElement.value) return null
  const el = { ...previewElement.value }
  if (!el.css) el.css = { css: '', container: '' }
  if (!el.blocks) el.blocks = []
  return el
})

const tabs = [
  { key: 'live' as const, label: 'Live API' },
  { key: 'upload' as const, label: 'Upload JSON' },
]

const canImport = computed(() => {
  if (activeTab.value === 'live') return !!fileKey.value && hasToken.value && !loading.value
  return !!uploadedJson.value && !loading.value
})

async function selectFrame(frameId: string) {
  selectedFrameId.value = frameId
  nodeId.value = frameId
  await loadPreview()
}

function triggerFilePicker() {
  fileInput.value?.click()
}

function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) handleFile(file)
}

function onDropFile(e: DragEvent) {
  const file = e.dataTransfer?.files?.[0]
  if (file) handleFile(file)
}

function handleFile(file: File) {
  uploadedFile.value = file
  parseError.value = ''
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const json = JSON.parse(reader.result as string)
      uploadedJson.value = json
      previewName.value = json.name || 'Uploaded frame'
      previewElement.value = json
    } catch {
      parseError.value = 'Invalid JSON file'
    }
  }
  reader.readAsText(file)
}

async function loadPreview() {
  if (!fileKey.value || !hasToken.value) return
  loading.value = true
  apiError.value = ''
  try {
    const result = await importFromFigma({
      fileKey: fileKey.value,
      nodeId: nodeId.value || undefined,
      mode: mode.value,
    })
    previewElement.value = result.element
    previewName.value = result.name
    warnings.value = result.warnings || []
  } catch (err: any) {
    apiError.value = err?.message || 'Failed to load from Figma'
  } finally {
    loading.value = false
  }
}

async function onImport() {
  loading.value = true
  try {
    if (activeTab.value === 'live') {
      const result = await importFromFigma({
        fileKey: fileKey.value,
        nodeId: nodeId.value || undefined,
        mode: mode.value,
      })
      emit('imported', { element: result.element, name: result.name, mode: mode.value })
    } else if (uploadedJson.value) {
      const element = uploadedJson.value
      emit('imported', { element, name: previewName.value || 'Imported Figma', mode: mode.value })
    }
    emit('close')
  } catch (err: any) {
    if (activeTab.value === 'live') {
      apiError.value = err?.message || 'Import failed'
    } else {
      parseError.value = err?.message || 'Import failed'
    }
  } finally {
    loading.value = false
  }
}
</script>