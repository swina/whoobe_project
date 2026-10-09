import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './authStore'
import { fetchSnippets, createSnippet, deleteSnippet, setSnippetLocked, type WhoobeSnippet, type WhoobeSnippetInput } from '../utils/snippets-api'

export const useSnippetsStore = defineStore('snippets', () => {
  const snippets = ref<WhoobeSnippet[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  function getBaseUrl() {
    return useAuthStore().config.coreApiUrl
  }

  async function refresh() {
    isLoading.value = true
    error.value = null
    try {
      snippets.value = await fetchSnippets(getBaseUrl())
    } catch (e: any) {
      error.value = e?.message ?? 'Failed to load snippets'
    } finally {
      isLoading.value = false
    }
  }

  async function setLocked(id: string, locked: boolean) {
    const updated = await setSnippetLocked(getBaseUrl(), id, locked)
    const i = snippets.value.findIndex((s) => s.id === id)
    if (i >= 0) snippets.value[i] = { ...snippets.value[i], locked: updated.locked === true }
  }

  async function remove(id: string) {
    await deleteSnippet(getBaseUrl(), id)
    snippets.value = snippets.value.filter((s) => s.id !== id)
  }

  async function importSnippets(inputs: WhoobeSnippetInput[]): Promise<{ created: number; skipped: number; errors: string[] }> {
    const errors: string[] = []
    let created = 0
    for (const input of inputs) {
      try {
        await createSnippet(getBaseUrl(), input)
        created++
      } catch (e: any) {
        errors.push(`${input.name}: ${e?.message || 'Unknown error'}`)
      }
    }
    await refresh()
    return { created, skipped: inputs.length - created - errors.length, errors }
  }

  return { snippets, isLoading, error, refresh, remove, setLocked, importSnippets }
})
