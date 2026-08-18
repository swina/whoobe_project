import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchWebsites, fetchWebsiteById, createWebsite, updateWebsite, deleteWebsite, type WebsiteRecord } from '../utils/websites-api'
import { useAuthStore } from './authStore'

export const useWebsitesStore = defineStore('websites', () => {
  const websites = ref<WebsiteRecord[]>([])
  const isLoading = ref(false)

  async function refreshWebsites(): Promise<void> {
    const authStore = useAuthStore()
    isLoading.value = true
    try {
      websites.value = await fetchWebsites(authStore.config.coreApiUrl)
    } catch (e) {
      console.warn('Could not load websites:', e)
    } finally {
      isLoading.value = false
    }
  }

  async function getWebsite(id: string): Promise<WebsiteRecord> {
    const authStore = useAuthStore()
    return fetchWebsiteById(authStore.config.coreApiUrl, id)
  }

  async function create(input: {
    name: string
    domains?: string[]
    defaultLocale?: string
    supportedLocales?: string[]
    settings?: Record<string, unknown>
    themeId?: string | null
  }): Promise<WebsiteRecord> {
    const authStore = useAuthStore()
    const created = await createWebsite(authStore.config.coreApiUrl, input)
    websites.value.push(created)
    return created
  }

  async function update(
    id: string,
    input: {
      name?: string
      domains?: string[]
      defaultLocale?: string
      supportedLocales?: string[]
      settings?: Record<string, unknown>
      themeId?: string | null
    }
  ): Promise<WebsiteRecord> {
    const authStore = useAuthStore()
    const updated = await updateWebsite(authStore.config.coreApiUrl, id, input)
    const idx = websites.value.findIndex((w) => w.id === id)
    if (idx !== -1) websites.value[idx] = updated
    return updated
  }

  async function remove(id: string): Promise<void> {
    const authStore = useAuthStore()
    await deleteWebsite(authStore.config.coreApiUrl, id)
    websites.value = websites.value.filter((w) => w.id !== id)
  }

  return {
    websites,
    isLoading,
    refreshWebsites,
    getWebsite,
    create,
    update,
    remove,
  }
})