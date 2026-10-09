<template>
  <div class="flex flex-col h-full gap-6">
    <div class="shrink-0">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-slate-100 light:text-slate-900">Snippets</h2>
          <p class="text-xs text-slate-400 light:text-slate-600">
            Reusable elements saved from the Whoobe One editor. Click a snippet to edit it, or link it to a website template's header/aside/footer.
          </p>
        </div>
      <div class="flex items-center gap-2">
        <span v-if="selectedIds.size > 0" class="text-xs text-slate-400 light:text-slate-600">
          {{ selectedIds.size }} selected
        </span>
        <button
          @click="handleExport"
          :disabled="filteredSnippets.length === 0"
          class="px-3 py-2 text-sm font-medium rounded-xl transition shadow disabled:opacity-40"
          :class="selectedIds.size > 0 ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-white'"
        >
          {{ selectedIds.size > 0 ? `Export Selected (${selectedIds.size})` : 'Export All' }}
        </button>
        <button
          @click="handleDeleteSelected"
          v-if="selectedIds.size > 0"
          class="px-3 py-2 text-sm font-medium rounded-xl bg-rose-700 hover:bg-rose-600 text-white shadow transition"
        >
          Delete Selected ({{ selectedIds.size }})
        </button>
        <button
          @click="handleImportClick"
          class="btn btn-success"
        >
          Import
        </button>
        <input
          ref="fileInput"
          type="file"
          accept=".json"
          class="hidden"
          @change="handleImportFile"
        />
        <button
          @click="handleCreate"
          class="btn btn-primary"
        >
          + New Snippet
        </button>
      </div>
    </div>
    </div>

    <div v-if="importResult" class="p-3 rounded-xl text-xs" :class="importResult.errors.length ? 'bg-amber-900/40 border border-amber-700/50 text-amber-200' : 'bg-emerald-900/40 border border-emerald-700/50 text-emerald-200'">
      <strong>Import complete:</strong> {{ importResult.created }} created, {{ importResult.skipped }} skipped.
      <template v-if="importResult.errors.length">
        <ul class="mt-1 list-disc list-inside text-amber-300">
          <li v-for="err in importResult.errors" :key="err">{{ err }}</li>
        </ul>
      </template>
    </div>

    <div class="flex flex-col gap-3 p-4 rounded-xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200">
      <div class="flex flex-col sm:flex-row gap-4">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by name..."
          class="field flex-1"
        />
        <select
          v-model="categoryFilter"
          class="field"
        >
          <option value="" class="capitalize">All categories</option>
          <option v-for="cat in categories" :key="cat" :value="cat" class="capitalize">{{ cat }}</option>
        </select>
        <div class="flex items-center gap-1 p-1 rounded-lg bg-slate-950/80 light:bg-slate-100 border border-slate-800 light:border-slate-200 shrink-0">
          <button
            @click="viewMode = 'list'"
            :class="viewMode === 'list' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 light:text-slate-600 hover:text-slate-200 light:hover:text-slate-800'"
            class="px-3 py-1.5 text-xs font-semibold rounded-md transition"
            title="List view"
          >
            <List class="w-4 h-4" />
          </button>
          <button
            @click="viewMode = 'grid'"
            :class="viewMode === 'grid' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 light:text-slate-600 hover:text-slate-200 light:hover:text-slate-800'"
            class="px-3 py-1.5 text-xs font-semibold rounded-md transition"
            title="Grid view"
          >
            <LayoutGrid class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

    <div v-if="snippetsStore.isLoading && snippetsStore.snippets.length === 0" class="shrink-0 p-12 text-center text-xs text-slate-500">
      Loading snippets…
    </div>

    <div v-else-if="filteredSnippets.length === 0" class="shrink-0 rounded-2xl bg-slate-900/40 light:bg-white/40 border border-slate-800/80 light:border-slate-200/80 p-12 text-center text-xs text-slate-500">
      <template v-if="snippetsStore.snippets.length === 0">No snippets yet. Save a reusable element from the Whoobe One editor, or create one below.</template>
      <template v-else>No snippets match the current filters.</template>
    </div>

    <!-- List view -->
    <div v-else-if="viewMode === 'list'" class="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200">
      <table class="w-full text-left text-xs text-slate-300 light:text-slate-700">
        <thead class="sticky top-0 z-10 bg-slate-950/80 light:bg-white/80 border-b border-slate-800 light:border-slate-200 text-[11px] font-semibold text-slate-400 light:text-slate-600 uppercase tracking-wider backdrop-blur-sm">
          <tr>
            <th class="py-3 px-4 w-10">
              <input
                type="checkbox"
                :checked="allSelected"
                :indeterminate="someSelected && !allSelected"
                @change="toggleSelectAll"
                class="w-4 h-4 rounded border-slate-600 light:border-slate-300 bg-slate-800 light:bg-slate-100 text-indigo-500 focus:ring-indigo-500 cursor-pointer"
              />
            </th>
            <th class="py-3 px-4">Preview</th>
            <th class="py-3 px-4">Name</th>
            <th class="py-3 px-4">Category</th>
            <th class="py-3 px-4">Updated</th>
            <th class="py-3 px-4">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/60 light:divide-slate-200/60">
          <tr
            v-for="snippet in filteredSnippets"
            :key="snippet.id"
            @click="openSnippetTab(snippet.id)"
            class="cursor-pointer hover:bg-slate-300/50 light:bg-slate-100/50 transition"
          >
            <td class="py-2.5 px-4 w-10" @click.stop>
              <input
                type="checkbox"
                :checked="selectedIds.has(snippet.id)"
                @change="toggleSelect(snippet.id)"
                class="w-4 h-4 rounded border-slate-600 light:border-slate-300 bg-slate-800 light:bg-slate-100 text-indigo-500 focus:ring-indigo-500 cursor-pointer"
              />
            </td>
            <td class="py-2.5 px-4">
              <img v-if="snippet.thumbnail" :src="snippet.thumbnail" alt="" title="Click to enlarge"
                class="w-24 aspect-[16/10] object-cover object-top rounded border border-slate-700 light:border-slate-300 bg-white cursor-zoom-in hover:border-indigo-500 transition"
                @click.stop="thumbnailModal = { src: snippet.thumbnail, title: snippet.name }" />
              <div v-else class="w-24 aspect-[16/10] rounded border border-dashed border-slate-700 light:border-slate-300 flex items-center justify-center text-slate-600">
                <Puzzle class="w-4 h-4" />
              </div>
            </td>
            <td class="py-2.5 px-4">
              <span class="font-semibold text-slate-100 light:text-slate-900 inline-flex items-center gap-2">
                <Puzzle class="w-4 h-4 text-teal-400 inline" /> {{ snippet.name }}
              </span>
            </td>
            <td class="py-2.5 px-4 text-slate-400 light:text-slate-600 capitalize">{{ snippet.category || '—' }}</td>
            <td class="py-2.5 px-4 text-slate-400 light:text-slate-600">{{ new Date(snippet.updatedAt).toLocaleString() }}</td>
            <td class="py-2.5 px-4" @click.stop>
              <button @click="openSnippetTab(snippet.id)" class="btn btn-link mr-3" title="Edit snippet">
                <PencilSparkles class="w-4 h-4"/>
              </button>
              <button v-if="snippet.notes" @click="notesSnippet = snippet" class="btn btn-link-info mr-3" title="View usage notes">
                <Info class="w-4 h-4"/>
              </button>
              <button @click="campaignModalSnippet = snippet" class="btn btn-link-success mr-3" title="Send as Brevo campaign">
                <Send class="w-4 h-4"/>
              </button>
              <button @click="handleDelete(snippet.id, snippet.name)" class="btn btn-link-danger" title="Delete snippet">
                <Trash class="w-4 h-4"/>
              </button>

            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Grid view -->
    <div v-else class="flex-1 min-h-0 overflow-y-auto">
      <div class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))">
      <div
        v-for="snippet in filteredSnippets"
        :key="snippet.id"
        class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 overflow-hidden hover:border-indigo-500 transition cursor-pointer group"
        @click="openSnippetTab(snippet.id)"
      >
        <div class="relative h-[200px] bg-slate-950/40 light:bg-slate-50">
          <div v-if="snippet.thumbnail" 
            title="Click to enlarge"
            @click.stop="thumbnailModal = { src: snippet.thumbnail, title: snippet.name }"
            class="absolute inset-0 flex items-center bg-cover bg-top justify-center text-slate-400 light:text-slate-600" :style="'background-image:url(' + snippet.thumbnail + ')'">
            
          </div>
          <!--<img v-if="snippet.thumbnail" :src="snippet.thumbnail" alt="" title="Click to enlarge"
            class="absolute inset-0 w-full h-full object-cover object-top bg-white cursor-zoom-in"
            @click.stop="thumbnailModal = { src: snippet.thumbnail, title: snippet.name }" />-->
          <SnippetPreviewCard v-else :node="snippet.node as Record<string, any>" />
          <div class="absolute top-2 left-2 z-10" @click.stop>
            <input
              type="checkbox"
              :checked="selectedIds.has(snippet.id)"
              @change="toggleSelect(snippet.id)"
              class="w-4 h-4 rounded border-slate-500 bg-slate-800/80 light:bg-slate-100/80 text-indigo-500 focus:ring-indigo-500 cursor-pointer opacity-0 group-hover:opacity-100 transition"
              :class="selectedIds.has(snippet.id) ? 'opacity-100' : ''"
            />
          </div>
          <div class="absolute bottom-0 inset-x-0 pt-6">
            <span class="text-xs font-semibold text-slate-100 light:text-slate-900">{{ snippet.name }}</span>
            <span class="text-[10px] text-slate-400 light:text-slate-600 ml-2 capitalize">{{ snippet.category }}</span>
          </div>
        </div>
        <div class="flex items-center justify-between px-3 py-2 border-t border-slate-800/60 light:border-slate-200/60">
          <span class="text-[10px] text-slate-500 light:text-slate-600">{{ new Date(snippet.updatedAt).toLocaleString() }}</span>
          <div class="flex items-center gap-1" @click.stop>
            <button @click="openSnippetTab(snippet.id)" class="p-1.5 rounded text-slate-400 light:text-slate-600 hover:text-indigo-400 hover:bg-slate-400/60 light:bg-slate-100/60 transition" title="Edit snippet">
              <PencilSparkles class="w-3.5 h-3.5" />
            </button>
            <button v-if="snippet.notes" @click="notesSnippet = snippet" class="p-1.5 rounded text-slate-400 light:text-slate-600 hover:text-sky-400 hover:bg-slate-400/60 light:bg-slate-100/60 transition" title="View usage notes">
              <Info class="w-3.5 h-3.5" />
            </button>
            <button @click="campaignModalSnippet = snippet" class="p-1.5 rounded text-slate-400 light:text-slate-600 hover:text-emerald-400 hover:bg-slate-400/60 light:bg-slate-100/60 transition" title="Send as Brevo campaign">
              <Send class="w-3.5 h-3.5" />
            </button>
            <button @click="handleDelete(snippet.id, snippet.name)" class="p-1.5 rounded text-slate-400 light:text-slate-600 hover:text-rose-400 hover:bg-slate-400/60 light:bg-slate-100/60 transition" title="Delete snippet">
              <Trash class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<ThumbnailModal v-if="thumbnailModal" :src="thumbnailModal.src" :title="thumbnailModal.title" @close="thumbnailModal = null" />

<BrevoCampaignModal
  v-if="campaignModalSnippet"
  source-kind="snippet"
  :source-id="campaignModalSnippet.id"
  :source-label="campaignModalSnippet.name"
  @close="campaignModalSnippet = null"
/>

<!-- Usage notes overlay - the snippets-manager counterpart of the
     whoobe-one-spike editor's own snippet-notes affordances (its Snippets
     sidebar chip icon and the inserted element's Advanced > Info panel). -->
<BaseModal v-if="notesSnippet" :open="true" size="md" @close="notesSnippet = null">
  <template #header>
    <h2 class="ui-modal-title flex items-center gap-2"><Puzzle class="w-4 h-4 text-teal-400" /> {{ notesSnippet.name }}</h2>
  </template>
  <div class="space-y-4">
    <p class="p-4 text-sm text-slate-300 light:text-slate-700 whitespace-pre-wrap">{{ notesSnippet.notes }}</p>

  </div>
</BaseModal>
</template>

<script setup lang="ts">
import BaseModal from '../components/ui/BaseModal.vue'
import { ref, computed, onMounted } from 'vue'
import { Puzzle, PencilSparkles, Trash, List, LayoutGrid, Send, Info } from '@lucide/vue'
import { useSnippetsStore } from '../stores/snippetsStore'
import { useTabsStore } from '../stores/tabsStore'
import { useToastStore } from '../stores/toastStore'
import { embedNodeImages } from '../utils/snippet-export'
import { randomUUID } from '../utils/random-id'
import type { WhoobeSnippet } from '../utils/snippets-api'
import BrevoCampaignModal from '../components/settings/BrevoCampaignModal.vue'
import ThumbnailModal from '../components/common/ThumbnailModal.vue'
import type { WhoobeSnippetInput } from '../utils/snippets-api'
import SnippetPreviewCard from '../components/snippets/SnippetPreviewCard.vue'

const snippetsStore = useSnippetsStore()
const tabsStore = useTabsStore()
const toastStore = useToastStore()

const searchQuery = ref('')
const categoryFilter = ref('')
const viewMode = ref<'list' | 'grid'>('list')
const thumbnailModal = ref<{ src: string; title: string } | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const importResult = ref<{ created: number; skipped: number; errors: string[] } | null>(null)
const selectedIds = ref(new Set<string>())
const campaignModalSnippet = ref<WhoobeSnippet | null>(null)
const notesSnippet = ref<WhoobeSnippet | null>(null)

const categories = computed(() => {
  const set = new Set(snippetsStore.snippets.map((s) => s.category).filter(Boolean))
  return [...set].sort((a, b) => a.localeCompare(b))
})

const filteredSnippets = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return snippetsStore.snippets.filter((s) => {
    if (q && !s.name.toLowerCase().includes(q)) return false
    if (categoryFilter.value && s.category !== categoryFilter.value) return false
    return true
  })
})

const allSelected = computed(() => filteredSnippets.value.length > 0 && filteredSnippets.value.every((s) => selectedIds.value.has(s.id)))
const someSelected = computed(() => filteredSnippets.value.some((s) => selectedIds.value.has(s.id)))

function toggleSelect(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  selectedIds.value = next
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(filteredSnippets.value.map((s) => s.id))
  }
}

function openSnippetTab(id: string) {
  tabsStore.openSnippet(id)
}

function handleCreate() {
  tabsStore.openSnippet(`new:${randomUUID()}`)
}

async function handleDelete(id: string, name: string) {
  if (!confirm(`Delete snippet "${name}"? This cannot be undone.`)) return
  try {
    await snippetsStore.remove(id)
  } catch (e: any) {
    alert(e?.message || 'Failed to delete snippet')
  }
}

async function handleDeleteSelected() {
  const count = selectedIds.value.size
  if (count === 0) return
  if (!confirm(`Delete ${count} selected snippet(s)? This cannot be undone.`)) return
  const ids = [...selectedIds.value]
  let errors = 0
  let firstError = ''
  for (const id of ids) {
    try {
      await snippetsStore.remove(id)
    } catch (e: any) {
      errors++
      // e.g. "used by a website template" - the server refuses those deletes.
      if (!firstError) firstError = e?.message || ''
    }
  }
  selectedIds.value = new Set()
  if (errors > 0) {
    toastStore.show(`${count - errors} deleted, ${errors} not deleted${firstError ? `: ${firstError}` : '.'}`)
  } else {
    toastStore.show(`${count} snippet(s) deleted.`)
  }
}

async function handleExport() {
  const toExport = selectedIds.value.size > 0
    ? snippetsStore.snippets.filter((s) => selectedIds.value.has(s.id))
    : filteredSnippets.value

  toastStore.show(`Embedding images for ${toExport.length} snippet(s)…`)

  const data = await Promise.all(
    toExport.map(async (s) => ({
      name: s.name,
      category: s.category,
      icon: s.icon ?? undefined,
      node: await embedNodeImages(s.node),
      themeId: s.themeId ?? undefined,
      notes: s.notes ?? undefined,
    }))
  )

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'whoobe-snippets-export.json'
  a.click()
  URL.revokeObjectURL(url)
}

function handleImportClick() {
  importResult.value = null
  fileInput.value?.click()
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input?.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const parsed: WhoobeSnippetInput[] = JSON.parse(text)

    if (!Array.isArray(parsed)) {
      alert('Invalid file format: expected an array of snippets.')
      return
    }

    for (const item of parsed) {
      if (!item.name || !item.category || !item.node) {
        alert(`Invalid snippet entry: "${item.name || '(unnamed)'}" is missing required fields (name, category, node).`)
        return
      }
    }

    importResult.value = await snippetsStore.importSnippets(parsed)
  } catch (e: any) {
    alert(`Failed to import snippets: ${e?.message || 'Invalid JSON'}`)
  } finally {
    input.value = '' // reset so same file can be re-imported
  }
}

onMounted(() => snippetsStore.refresh())
</script>
