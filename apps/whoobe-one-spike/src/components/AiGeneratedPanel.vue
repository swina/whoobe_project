<template>
  <div class="flex-1 min-h-0 flex flex-col text-xs font-mono">
    <div class="flex items-center justify-between px-3 py-2 border-b shrink-0">
      <span class="text-xs font-semibold text-gray-600">AI generations</span>
      <button
        type="button"
        title="Refresh"
        class="p-1 rounded text-gray-400 hover:text-indigo-600 disabled:opacity-40"
        :disabled="loading"
        @click="load"
      >
        <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': loading }" />
      </button>
    </div>
    <div class="flex-1 min-h-0 overflow-y-auto">
      <div v-if="loading" class="p-3 text-gray-400">Loading…</div>
      <div v-else-if="error" class="p-3 text-rose-600 text-xs">{{ error }}</div>
      <div v-else-if="!records.length" class="p-3 text-gray-400">
        No usable generations yet — generate a page or snippet from the toolbar buttons; they land here (history of the last 50 calls).
      </div>
      <button
        v-for="record in records"
        :key="record.id"
        type="button"
        class="w-full text-left px-3 py-2 border-b hover:bg-violet-50 cursor-pointer"
        :title="`Import as ${record.kind} (${record.provider} · ${record.model})`"
        @click="emit('import', record)"
      >
        <div class="flex items-center gap-1.5 text-[9px] mb-1">
          <span class="px-1 py-0.5 rounded font-semibold uppercase tracking-wide" :class="record.kind === 'page' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'">
            {{ record.kind }}
          </span>
          <span class="truncate text-gray-400">{{ record.model }}</span>
          <span class="ml-auto shrink-0 text-gray-400">{{ formatDate(record.createdAt) }}</span>
        </div>
        <p class="text-xs text-gray-700 line-clamp-2">{{ record.prompt }}</p>
        <div class="flex gap-1 mt-1.5">
          <button
            type="button"
            title="Preview in a modal"
            class="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border text-gray-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50"
            @click.stop="emit('preview', record)"
          >
            <Eye class="w-3 h-3" /> Preview
          </button>
          <button
            type="button"
            title="Import into the currently selected element"
            class="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border text-gray-500 hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50"
            @click.stop="emit('import', record)"
          >
            <Download class="w-3 h-3" /> Import
          </button>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RefreshCw, Eye, Download } from '@lucide/vue'
import { listAiGenerations, type AiGeneratedRecord } from '../ai-api'

// Not a port - the source app has no equivalent (AI generation didn't
// exist there at all). Re-import panel for the whoobe_ai_generated audit
// table (docs/plans/ai/ai-pages-snippets-generator.md): a generation can
// be lost between server-side success (payload stored) and the client
// actually inserting it into the canvas (network drop, tab closed, a
// provider 429 right after the reply was saved, ...). This panel lists
// every record with a valid payload; the row or its Import button emits
// `import` so the parent can insert it the same way a fresh generation
// would be (snippet → into/after the current selection, page → replace
// document); Preview emits `preview` for the read-only modal.

const emit = defineEmits<{ import: [record: AiGeneratedRecord]; preview: [record: AiGeneratedRecord] }>()

const records = ref<AiGeneratedRecord[]>([])
const loading = ref(false)
const error = ref('')

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    records.value = await listAiGenerations()
  } catch (e: any) {
    error.value = e?.message || 'Failed to load AI generations'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
