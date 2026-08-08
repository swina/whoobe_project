import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchMenus, fetchMenuById, createMenu, updateMenu, deleteMenu, type MenuRecord, type MenuItem } from '../utils/menus-api'
import { useAuthStore } from './authStore'

export const useMenusStore = defineStore('menus', () => {
  const menus = ref<MenuRecord[]>([])
  const isLoading = ref(false)

  async function refreshMenus(websiteId?: string): Promise<void> {
    const authStore = useAuthStore()
    isLoading.value = true
    try {
      menus.value = await fetchMenus(authStore.config.coreApiUrl, websiteId)
    } catch (e) {
      console.warn('Could not load menus:', e)
    } finally {
      isLoading.value = false
    }
  }

  async function getMenu(id: string): Promise<MenuRecord> {
    const authStore = useAuthStore()
    return fetchMenuById(authStore.config.coreApiUrl, id)
  }

  async function create(input: {
    websiteId: string
    name: string
    items?: MenuItem[]
  }): Promise<MenuRecord> {
    const authStore = useAuthStore()
    const created = await createMenu(authStore.config.coreApiUrl, input)
    menus.value.push(created)
    return created
  }

  async function update(
    id: string,
    input: {
      name?: string
      items?: MenuItem[]
    }
  ): Promise<MenuRecord> {
    const authStore = useAuthStore()
    const updated = await updateMenu(authStore.config.coreApiUrl, id, input)
    const idx = menus.value.findIndex((m) => m.id === id)
    if (idx !== -1) menus.value[idx] = updated
    return updated
  }

  async function remove(id: string): Promise<void> {
    const authStore = useAuthStore()
    await deleteMenu(authStore.config.coreApiUrl, id)
    menus.value = menus.value.filter((m) => m.id !== id)
  }

  return {
    menus,
    isLoading,
    refreshMenus,
    getMenu,
    create,
    update,
    remove,
  }
})