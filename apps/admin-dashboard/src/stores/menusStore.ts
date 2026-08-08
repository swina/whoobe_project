import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchWebsitePaths, fetchWebsitePathById, createWebsitePath, updateWebsitePath, deleteWebsitePath, type WebsitePathRecord, type MenuItem } from '../utils/menus-api'
import { useAuthStore } from './authStore'

export const usePathStore = defineStore('paths', () => {
  const paths = ref<WebsitePathRecord[]>([])
  const isLoading = ref(false)

  async function refreshPaths(websiteId?: string): Promise<void> {
    const authStore = useAuthStore()
    isLoading.value = true
    try {
      paths.value = await fetchWebsitePaths(authStore.config.coreApiUrl, websiteId)
    } catch (e) {
      console.warn('Could not load website paths:', e)
    } finally {
      isLoading.value = false
    }
  }

  async function getPath(id: string): Promise<WebsitePathRecord> {
    const authStore = useAuthStore()
    return fetchWebsitePathById(authStore.config.coreApiUrl, id)
  }

  async function create(input: {
    websiteId: string
    name: string
    items?: MenuItem[]
  }): Promise<WebsitePathRecord> {
    const authStore = useAuthStore()
    const created = await createWebsitePath(authStore.config.coreApiUrl, input)
    paths.value.push(created)
    return created
  }

  async function update(
    id: string,
    input: {
      name?: string
      items?: MenuItem[]
    }
  ): Promise<WebsitePathRecord> {
    const authStore = useAuthStore()
    const updated = await updateWebsitePath(authStore.config.coreApiUrl, id, input)
    const idx = paths.value.findIndex((p) => p.id === id)
    if (idx !== -1) paths.value[idx] = updated
    return updated
  }

  async function remove(id: string): Promise<void> {
    const authStore = useAuthStore()
    await deleteWebsitePath(authStore.config.coreApiUrl, id)
    paths.value = paths.value.filter((p) => p.id !== id)
  }

  return {
    paths,
    isLoading,
    refreshPaths,
    getPath,
    create,
    update,
    remove,
  }
})