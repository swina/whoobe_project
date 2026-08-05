import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  fetchMigrationSources,
  createMigrationSource as apiCreateMigrationSource,
  updateMigrationSource as apiUpdateMigrationSource,
  deleteMigrationSource as apiDeleteMigrationSource,
  type MigrationSource,
} from '../utils/migration-sources-api'
import { useAuthStore } from './authStore'

export const useMigrationSourcesStore = defineStore('migrationSources', () => {
  const sources = ref<MigrationSource[]>([])
  const isLoading = ref(false)

  async function refreshMigrationSources(): Promise<void> {
    const authStore = useAuthStore()
    isLoading.value = true
    try {
      sources.value = await fetchMigrationSources(authStore.config.coreApiUrl)
    } catch (e) {
      console.warn('Could not load migration sources:', e)
    } finally {
      isLoading.value = false
    }
  }

  async function createMigrationSource(input: {
    label: string
    dbHost: string
    dbPort: number
    dbUser: string
    dbPassword: string
    dbName: string
    classesPath: string
  }): Promise<MigrationSource> {
    const authStore = useAuthStore()
    const created = await apiCreateMigrationSource(authStore.config.coreApiUrl, input)
    await refreshMigrationSources()
    return created
  }

  async function updateMigrationSource(
    id: string,
    input: Partial<{ label: string; dbHost: string; dbPort: number; dbUser: string; dbPassword: string; dbName: string; classesPath: string }>
  ): Promise<MigrationSource> {
    const authStore = useAuthStore()
    const updated = await apiUpdateMigrationSource(authStore.config.coreApiUrl, id, input)
    await refreshMigrationSources()
    return updated
  }

  async function deleteMigrationSource(id: string): Promise<void> {
    const authStore = useAuthStore()
    await apiDeleteMigrationSource(authStore.config.coreApiUrl, id)
    await refreshMigrationSources()
  }

  refreshMigrationSources()

  return {
    sources,
    isLoading,
    refreshMigrationSources,
    createMigrationSource,
    updateMigrationSource,
    deleteMigrationSource,
  }
})
