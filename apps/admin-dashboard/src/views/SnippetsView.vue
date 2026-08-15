<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold text-slate-100 light:text-slate-900">Snippets</h2>
        <p class="text-xs text-slate-400 light:text-slate-600">
          Reusable elements saved from the Whoobe One editor. Click a snippet to edit it, or link it to a website template's header/aside/footer.
        </p>
      </div>
      <button
        @click="handleCreate"
        class="px-4 py-2 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition"
      >
        + New Snippet
      </button>
    </div>

    <div class="flex flex-col gap-3 p-4 rounded-xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200">
      <div class="flex flex-col sm:flex-row gap-4">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by name..."
          class="flex-1 px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
        />
        <select
          v-model="categoryFilter"
          class="px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
        >
          <option value="">All categories</option>
          <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
        </select>
      </div>
    </div>

    <div v-if="snippetsStore.isLoading && snippetsStore.snippets.length === 0" class="p-12 text-center text-xs text-slate-500">
      Loading snippets…
    </div>

    <div v-else-if="filteredSnippets.length === 0" class="rounded-2xl bg-slate-900/40 light:bg-white/40 border border-slate-800/80 light:border-slate-200/80 p-12 text-center text-xs text-slate-500">
      <template v-if="snippetsStore.snippets.length === 0">No snippets yet. Save a reusable element from the Whoobe One editor, or create one below.</template>
      <template v-else>No snippets match the current filters.</template>
    </div>

    <div v-else class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 overflow-hidden">
      <table class="w-full text-left text-xs text-slate-300 light:text-slate-700">
        <thead class="bg-slate-950/80 light:bg-white/80 border-b border-slate-800 light:border-slate-200 text-[11px] font-semibold text-slate-400 light:text-slate-600 uppercase tracking-wider">
          <tr>
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
            class="cursor-pointer hover:bg-slate-800/50 light:bg-slate-100/50 transition"
          >
            <td class="py-2.5 px-4">
              <span class="font-semibold text-slate-100 light:text-slate-900 inline-flex items-center gap-2">
                <Puzzle class="w-4 h-4 text-teal-400 inline" /> {{ snippet.name }}
              </span>
            </td>
            <td class="py-2.5 px-4 text-slate-400 light:text-slate-600">{{ snippet.category || '—' }}</td>
            <td class="py-2.5 px-4 text-slate-400 light:text-slate-600">{{ new Date(snippet.updatedAt).toLocaleString() }}</td>
            <td class="py-2.5 px-4" @click.stop>
              <button @click="openSnippetTab(snippet.id)" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300 mr-3">Edit</button>
              <button @click="handleDelete(snippet.id, snippet.name)" class="text-xs font-semibold text-rose-400 hover:text-rose-300">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Puzzle } from '@lucide/vue'
import { useSnippetsStore } from '../stores/snippetsStore'
import { useTabsStore } from '../stores/tabsStore'
import { randomUUID } from '../utils/random-id'

const snippetsStore = useSnippetsStore()
const tabsStore = useTabsStore()

const searchQuery = ref('')
const categoryFilter = ref('')

const categories = computed(() => {
  const set = new Set(snippetsStore.snippets.map((s) => s.category).filter(Boolean))
  return [...set]
})

const filteredSnippets = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return snippetsStore.snippets.filter((s) => {
    if (q && !s.name.toLowerCase().includes(q)) return false
    if (categoryFilter.value && s.category !== categoryFilter.value) return false
    return true
  })
})

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

onMounted(() => snippetsStore.refresh())
</script>
