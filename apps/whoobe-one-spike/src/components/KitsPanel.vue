<template>
  <div class="flex-1 min-h-0 overflow-y-auto text-sm">
    <div v-if="loading" class="p-3 text-gray-400">Loading kits…</div>
    <div v-else-if="!kits.length" class="p-3 text-gray-400">No kits yet</div>
    <template v-for="kit in kits" :key="kit.id">
      <div class="w-full flex items-center gap-1 px-3 py-1.5 border-b hover:bg-violet-500 hover:text-white" :class="{ 'bg-violet-500 text-white': openKitId === kit.id }">
        <button type="button" class="flex-1 min-w-0 flex items-center justify-between font-semibold capitalize text-left" @click="toggleKit(kit.id)">
          <span class="truncate">{{ kit.name }} <span class="text-gray-400 font-normal">({{ kit.templateCount }})</span></span>
          <ChevronDown v-if="openKitId === kit.id" class="w-3.5 h-3.5 text-gray-400 shrink-0 ml-1" />
          <ChevronRight v-else class="w-3.5 h-3.5 text-gray-400 shrink-0 ml-1" />
        </button>
        <button type="button" title="Preview kit as a gallery" class="shrink-0 px-1 text-gray-400 hover:text-indigo-600" @click="showGalleryForKitId = kit.id">
          <LayoutGrid class="w-3.5 h-3.5" />
        </button>
      </div>
      <div v-if="openKitId === kit.id" class="border-b bg-gray-50 text-xs hover:bg-violet-100 cursor-pointer">
        <p v-if="kit.description" class="px-3 pt-2 text-gray-500">{{ kit.description }}</p>
        <div v-if="!(templatesByKit[kit.id]?.length)" class="px-3 py-2 text-gray-400">Loading templates…</div>
        <div
          v-for="template in templatesByKit[kit.id]"
          :key="template.id"
          class="flex items-center justify-between gap-1 px-3 py-1.5 hover:bg-white"
        >
          <span class="truncate" :title="template.name">{{ template.name }}</span>
          <div class="flex items-center gap-1 shrink-0">
            <button type="button" title="Preview" class="px-1 py-0.5 rounded hover:bg-gray-200" @click="preview(kit.id, template.id)"><Eye class="w-3.5 h-3.5" /></button>
            <button
              type="button"
              title="Load into the currently selected container"
              class="px-1 py-0.5 rounded hover:bg-gray-200"
              @click="load(kit.id, template.id)"
            >
              <Import class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>

  <DocumentPreview v-if="previewDoc" :doc="previewDoc" @close="previewDoc = null" />

  <KitGalleryModal
    v-if="showGalleryForKitId"
    :kit-id="showGalleryForKitId"
    @close="showGalleryForKitId = null"
    @loaded="emit('loaded')"
  />
</template>

<script setup lang="ts">
// Not a port - no equivalent UI exists in the source app for browsing its
// own public/kits/*.json "UI Kit" collections at all (they're only ever
// referenced as static files, never surfaced through any component). A
// kit is a named, categorized collection of templates (see database-
// actions.ts's own header comment on the Kits section) - this panel lists
// kits as accordions (same one-open-at-a-time pattern as BlockElements
// Palette.vue/TailwindCustomizer.vue, its two sibling tabs), each
// expanding to its own templates with Preview/Load actions.
//
// Preview reuses DocumentPreview.vue directly - it already accepts an
// arbitrary `:doc` prop, not just the live editor.document, so previewing
// a kit template read-only needs no new preview machinery at all.
//
// "Load" inserts the template into whatever container is currently
// selected in the editor - the same behavior as dragging in a saved
// snippet or a palette element, not a replacement for the whole document
// (see database-actions.ts's loadKitTemplateIntoEditor() for the fuller
// reasoning). Requires selecting a container first; loadKitTemplateInto
// Editor() checks that before it does anything else, so a plain window.
// alert() here is enough to tell the user why nothing happened.
import { onMounted, ref } from 'vue'
import { ChevronDown, ChevronRight, Eye, Import, LayoutGrid } from '@lucide/vue'
import { useEditorStore } from '../store/editor'
import {
  listKits,
  getKitTemplates,
  getKitTemplateDoc,
  loadKitTemplateIntoEditor,
  type KitSummary,
  type KitTemplateSummary,
} from '../scripts/database-actions'
import DocumentPreview from './DocumentPreview.vue'
import KitGalleryModal from './KitGalleryModal.vue'

const emit = defineEmits<{
  (e: 'loaded'): void
}>()

const editor = useEditorStore()

const loading = ref(true)
const kits = ref<KitSummary[]>([])
const openKitId = ref<string | null>(null)
const templatesByKit = ref<Record<string, KitTemplateSummary[]>>({})
const previewDoc = ref<any>(null)
const showGalleryForKitId = ref<string | null>(null)

async function refresh() {
  loading.value = true
  try {
    kits.value = await listKits()
  } finally {
    loading.value = false
  }
}

async function toggleKit(kitId: string) {
  if (openKitId.value === kitId) {
    openKitId.value = null
    return
  }
  openKitId.value = kitId
  if (!templatesByKit.value[kitId]) {
    templatesByKit.value[kitId] = await getKitTemplates(kitId)
  }
}

async function preview(kitId: string, templateId: string) {
  previewDoc.value = await getKitTemplateDoc(kitId, templateId)
}

async function load(kitId: string, templateId: string) {
  const result = await loadKitTemplateIntoEditor(editor, kitId, templateId)
  if (result === 'loaded') {
    emit('loaded')
    return
  }
  if (result === 'no-container-selected') {
    window.alert('Select a container in the document first - the template loads into whatever container is currently selected.')
    return
  }
  window.alert('That template could not be found.')
}

onMounted(refresh)
</script>
