<template>
  <div class="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-6" @click.self="$emit('close')">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-sm max-h-[80vh] flex flex-col overflow-hidden">
      <div class="flex items-center justify-between px-4 py-2 border-b shrink-0">
        <span class="font-semibold text-gray-700 text-sm">Version history</span>
        <button class="flex items-center gap-1 text-gray-400 hover:text-gray-700 text-xs" @click="$emit('close')">
          <X class="w-3.5 h-3.5" /> Close
        </button>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto p-3">
        <p v-if="!resourceId" class="text-[11px] text-gray-400 text-center py-6">
          Save this {{ resourceType }} at least once to start its version history.
        </p>
        <p v-else-if="loading" class="text-[11px] text-gray-400 text-center py-6">Loading versions…</p>
        <p v-else-if="restoring" class="text-[11px] text-gray-400 text-center py-6">Loading version into the editor…</p>
        <p v-else-if="error" class="text-[11px] text-rose-500 text-center py-6">{{ error }}</p>
        <p v-else-if="!versions.length" class="text-[11px] text-gray-400 text-center py-6">
          No earlier versions yet - they appear here after the next save.
        </p>
        <ul v-else class="flex flex-col gap-1">
          <li v-for="(v, i) in versions" :key="v.id">
            <button
              type="button"
              class="w-full flex items-center justify-between gap-2 text-xs border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 rounded px-3 py-2 text-left transition"
              @click="restore(v.id)"
            >
              <span class="flex flex-col">
                <span class="font-medium text-gray-700">{{ formatDate(v.createdAt) }}</span>
                <span v-if="v.label" class="text-gray-400">{{ v.label }}</span>
              </span>
              <span v-if="i === 0" class="text-[10px] uppercase tracking-wide text-indigo-500 font-semibold shrink-0">Most recent</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Instant version history panel (content-versions-schema.ts) - lists up to
// the 10 most recent prior states of whichever page/snippet is currently
// open, snapshotted automatically on every save (manual or autosave, see
// updateWhoobePage()/updateWhoobeOneSnippet() in packages/core). Clicking an
// entry loads it into the editor via restoreVersion() - non-destructive
// until the user hits Save, same as opening any other document.
import { computed, onMounted, ref } from 'vue'
import { X } from '@lucide/vue'
import { useEditorStore } from '../store/editor'
import { listPageVersions, type ContentVersionSummary } from '../pages-api'
import { listSnippetVersions } from '../snippets-api'
import { restoreVersion } from '../scripts/database-actions'

const emit = defineEmits<{ (e: 'close'): void }>()

const editor = useEditorStore()

const resourceType = computed<'page' | 'snippet'>(() => (editor.snippetMode ? 'snippet' : 'page'))
const resourceId = computed<string | null>(() => (editor.snippetMode ? editor.snippetId : editor.page?.id ? String(editor.page.id) : null))

const versions = ref<ContentVersionSummary[]>([])
const loading = ref(false)
const restoring = ref(false)
const error = ref<string | null>(null)

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

onMounted(async () => {
  if (!resourceId.value) return
  loading.value = true
  try {
    versions.value = resourceType.value === 'snippet'
      ? await listSnippetVersions(resourceId.value)
      : await listPageVersions(resourceId.value)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load version history'
  } finally {
    loading.value = false
  }
})

async function restore(versionId: string) {
  if (!resourceId.value) return
  restoring.value = true
  try {
    await restoreVersion(editor, resourceType.value, resourceId.value, versionId)
    emit('close')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load this version'
  } finally {
    restoring.value = false
  }
}
</script>
