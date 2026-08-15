import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchPages, fetchPageById, updatePageById, createPageById, deletePageById, type WhoobeOnePage, type PageSeo, type PageSitemapSettings, type PageSearchSettings } from '../utils/pages-api'
import { useAuthStore } from './authStore'

export const usePagesStore = defineStore('pages', () => {
  const pages = ref<WhoobeOnePage[]>([])
  const isLoading = ref(false)

  const filteredPages = computed(() => (websiteId?: string) => {
    if (!websiteId) return pages.value
    return pages.value.filter((p) => p.websiteId === websiteId)
  })

  async function refreshPages(websiteId?: string): Promise<void> {
    const authStore = useAuthStore()
    isLoading.value = true
    try {
      pages.value = await fetchPages(authStore.config.coreApiUrl, websiteId)
    } catch (e) {
      console.warn('Could not load pages:', e)
    } finally {
      isLoading.value = false
    }
  }

  async function getPage(id: string): Promise<WhoobeOnePage> {
    const authStore = useAuthStore()
    return fetchPageById(authStore.config.coreApiUrl, id)
  }

  async function updatePage(
    id: string,
    input: {
      title?: string
      slug?: string
      category?: string
      kind?: 'content' | 'module'
      published?: boolean
      workflowState?: string | null
      locale?: string
      path?: string | null
      websiteId?: string | null
      seo?: PageSeo | null
      sitemap?: PageSitemapSettings | null
      search?: PageSearchSettings | null
    }
  ): Promise<WhoobeOnePage> {
    const authStore = useAuthStore()
    const updated = await updatePageById(authStore.config.coreApiUrl, id, input)
    const idx = pages.value.findIndex((p) => p.id === id)
    if (idx !== -1) {
      pages.value[idx] = { ...pages.value[idx], ...updated }
    }
    return updated
  }

  async function createPage(input: {
    slug: string
    title: string
    category?: string
    content: unknown
    websiteId?: string | null
  }): Promise<WhoobeOnePage> {
    const authStore = useAuthStore()
    const created = await createPageById(authStore.config.coreApiUrl, input)
    pages.value.unshift(created)
    return created
  }

  async function deletePage(id: string): Promise<void> {
    const authStore = useAuthStore()
    await deletePageById(authStore.config.coreApiUrl, id)
    pages.value = pages.value.filter((p) => p.id !== id)
  }

  return {
    pages,
    isLoading,
    filteredPages,
    refreshPages,
    getPage,
    updatePage,
    createPage,
    deletePage,
  }
})
