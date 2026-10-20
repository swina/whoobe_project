<template>
  <div class="min-h-screen bg-gray-50 text-gray-800 text-sm" data-testid="kit-preview">
    <header class="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-2 bg-white border-b border-gray-200">
      <div class="min-w-0">
        <span class="font-semibold text-gray-800">{{ kit?.name || 'Loading…' }}</span>
        <span v-if="kit" class="text-gray-400 ml-2 text-xs capitalize">{{ kit.category }}</span>
        <span v-if="kit && !editable" class="ml-2 inline-flex items-center gap-1 text-xs text-amber-600" title="Shipped kit: it is not modified, editing works on a copy">
          <Lock class="w-3 h-3" /> read-only
        </span>
      </div>
      <span v-if="kit" class="text-xs text-gray-400 shrink-0">{{ kit.templates.length }} template(s)</span>
    </header>

    <main class="p-4">
      <div v-if="loading" class="text-xs text-gray-400 text-center py-10">Loading…</div>
      <div v-else-if="error" class="text-xs text-rose-500 text-center py-10">{{ error }}</div>
      <div v-else-if="!kit?.templates.length" class="text-xs text-gray-400 text-center py-10">No templates in this kit.</div>
      <div v-else class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))">
        <div v-for="template in kit.templates" :key="template.id" class="rounded-lg border border-gray-200 bg-white overflow-hidden" :data-testid="`kit-template-${template.id}`">
          <button type="button" title="Click to preview" class="relative block w-full h-[260px] overflow-hidden hover:opacity-90" @click="previewDoc = template.json?.blocks">
            <div class="absolute inset-0 overflow-hidden pointer-events-none">
              <div style="width: 1200px; transform: scale(0.25); transform-origin: top left">
                <BlockContainerPreview :doc="template.json?.blocks" />
              </div>
            </div>
          </button>
          <div class="px-3 py-2 border-t border-gray-100">
            <div class="truncate font-semibold" :title="template.name">{{ template.name }}</div>
            <div class="text-xs text-gray-400 capitalize truncate">{{ template.category }}</div>
            <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <button type="button" class="px-2 py-1 rounded border border-gray-300 hover:bg-gray-100 inline-flex items-center gap-1" @click="previewDoc = template.json?.blocks"><Eye class="w-3.5 h-3.5" /> Preview</button>
              <button v-if="editable" type="button" class="px-2 py-1 rounded border border-gray-300 hover:bg-gray-100 inline-flex items-center gap-1" :data-testid="`kit-template-edit-${template.id}`" @click="edit(template.id)"><Pencil class="w-3.5 h-3.5" /> Edit</button>
              <button type="button" class="px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500 inline-flex items-center gap-1 disabled:opacity-50" :disabled="busy" title="Duplicates the kit and opens this template in the copy: the original is not changed" :data-testid="`kit-template-edit-copy-${template.id}`" @click="editCopy(template.id)"><Copy class="w-3.5 h-3.5" /> Edit a copy</button>
              <button v-if="editable" type="button" class="ml-auto px-2 py-1 rounded text-rose-600 hover:bg-rose-50 inline-flex items-center gap-1" title="Remove this template from the kit" :data-testid="`kit-template-delete-${template.id}`" @click="remove(template)"><Trash class="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>
      </div>
      <p v-if="actionError" class="mt-3 text-xs text-rose-500">{{ actionError }}</p>
    </main>

    <DocumentPreview v-if="previewDoc" :doc="previewDoc" @close="previewDoc = null" />
  </div>
</template>

<script setup lang="ts">
// A kit's templates as a gallery (live thumbnails, the same component KitGalleryModal uses), shown by the dashboard's Kits page in an iframe
// and reachable from the editor ("back to the kit"). Nothing here changes a shipped kit: "Edit a copy" duplicates the kit first
// (core-api POST /whoobe-one/kits/:id/duplicate keeps every template id) and opens the same template in the copy.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Copy, Eye, Lock, Pencil, Trash } from '@lucide/vue'
import { getKit, duplicateKit, type WhoobeOneKit } from '../kits-api'
import { removeKitTemplate } from '../scripts/database-actions'
import BlockContainerPreview from '../components/preview/BlockContainerPreview.vue'
import DocumentPreview from '../components/DocumentPreview.vue'

const route = useRoute()
const router = useRouter()

const kitId = computed(() => (typeof route.query.kitId === 'string' ? route.query.kitId : ''))
const parentOrigin = computed(() => (typeof route.query.parentOrigin === 'string' ? route.query.parentOrigin : undefined))

const kit = ref<WhoobeOneKit | null>(null)
const loading = ref(true)
const error = ref('')
const actionError = ref('')
const busy = ref(false)
const previewDoc = ref<any>(null)

const editable = computed(() => kit.value?.origin === 'user')

async function load() {
  loading.value = true
  error.value = ''
  try {
    if (!kitId.value) throw new Error('No kit selected')
    kit.value = await getKit(kitId.value)
  } catch (e: any) {
    error.value = e?.message || 'Failed to load the kit'
  } finally {
    loading.value = false
  }
}

function openEditor(onKitId: string, templateId: string) {
  router.push({ path: '/editor', query: { kitId: onKitId, templateId, parentOrigin: parentOrigin.value } })
}

function edit(templateId: string) {
  openEditor(kitId.value, templateId)
}

async function editCopy(templateId: string) {
  actionError.value = ''
  busy.value = true
  try {
    const copy = await duplicateKit(kitId.value)
    openEditor(copy.id, templateId)
  } catch (e: any) {
    actionError.value = e?.message || 'The kit could not be duplicated'
  } finally {
    busy.value = false
  }
}

async function remove(template: { id: string; name: string }) {
  if (!window.confirm(`Remove “${template.name}” from this kit? It cannot be undone.`)) return
  actionError.value = ''
  try {
    await removeKitTemplate(kitId.value, template.id)
    await load()
  } catch (e: any) {
    actionError.value = e?.message || 'The template could not be removed'
  }
}

onMounted(load)
</script>
