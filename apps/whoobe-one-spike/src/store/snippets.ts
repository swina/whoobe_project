// Reactive list of saved snippets (backed by apps/core-api's own /whoobe-
// one/snippets), shared between BlockElementsPalette.vue (renders them as
// draggable chips, grouped by category), SaveSnippetModal.vue (creates
// new ones), and BlockEditor.vue's drop handler (resolves a dropped
// snippet chip's id back to its stored node to instantiate).
import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  listSnippets,
  createSnippet as apiCreateSnippet,
  updateSnippet as apiUpdateSnippet,
  deleteSnippet as apiDeleteSnippet,
  type WhoobeOneSnippet,
} from '../snippets-api'

export const useSnippetsStore = defineStore('snippets', () => {
  const items = ref<WhoobeOneSnippet[]>([])
  const loading = ref(false)
  const error = ref('')

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      items.value = await listSnippets()
    } catch (e: any) {
      error.value = e?.message || 'Failed to load snippets'
    } finally {
      loading.value = false
    }
  }

  async function save(input: { name: string; category: string; icon?: string | null; node: unknown }): Promise<WhoobeOneSnippet> {
    const created = await apiCreateSnippet(input)
    items.value.unshift(created)
    return created
  }

  async function update(
    id: string,
    input: { name: string; category: string; icon?: string | null; node: unknown }
  ): Promise<WhoobeOneSnippet> {
    const updated = await apiUpdateSnippet(id, input)
    const index = items.value.findIndex((s) => s.id === id)
    if (index >= 0) items.value[index] = updated
    return updated
  }

  async function remove(id: string): Promise<void> {
    await apiDeleteSnippet(id)
    items.value = items.value.filter((s) => s.id !== id)
  }

  return { items, loading, error, refresh, save, update, remove }
})
