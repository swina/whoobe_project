import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './authStore'
import { fetchSnippets, deleteSnippet, type WhoobeSnippet } from '../utils/snippets-api'

// whoobe_one_snippets - reusable Element subtrees saved from the Whoobe One
// editor. Listed in the Snippets main item; opened for editing in the
// embedded editor (/editor?snippetId=).
export const useSnippetsStore = defineStore('snippets', () => {
  const snippets = ref<WhoobeSnippet[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function refresh() {
    const authStore = useAuthStore()
    isLoading.value = true
    error.value = null
    try {
      snippets.value = await fetchSnippets(authStore.config.coreApiUrl)
    } catch (e: any) {
      error.value = e?.message ?? 'Failed to load snippets'
    } finally {
      isLoading.value = false
    }
  }

  async function remove(id: string) {
    const authStore = useAuthStore()
    await deleteSnippet(authStore.config.coreApiUrl, id)
    snippets.value = snippets.value.filter((s) => s.id !== id)
  }

  return { snippets, isLoading, error, refresh, remove }
})
