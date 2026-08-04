import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchPages, fetchPageById, type WhoobeOnePage } from '../utils/pages-api'
import { useAuthStore } from './authStore'

export const usePagesStore = defineStore('pages', () => {
  const pages = ref<WhoobeOnePage[]>([])
  const isLoading = ref(false)

  async function refreshPages(): Promise<void> {
    const authStore = useAuthStore()
    isLoading.value = true
    try {
      pages.value = await fetchPages(authStore.config.coreApiUrl)
    } catch (e) {
      console.warn('Could not load pages:', e)
    } finally {
      isLoading.value = false
    }
  }

  // Full content isn't kept in `pages` - the list view only needs summary
  // fields, and this is used for the tab header's snapshot at open-time
  // (see MasterPageTab.vue - it does not stay in sync with edits made
  // inside the embedded editor, since there is no bridge here to notify it).
  async function getPage(id: string): Promise<WhoobeOnePage> {
    const authStore = useAuthStore()
    return fetchPageById(authStore.config.coreApiUrl, id)
  }

  refreshPages()

  return {
    pages,
    isLoading,
    refreshPages,
    getPage,
  }
})
