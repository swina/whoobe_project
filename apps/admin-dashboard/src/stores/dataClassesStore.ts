import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchDataClasses, fetchDataClassById, type DataClass } from '../utils/data-classes-api'
import { useAuthStore } from './authStore'

export const useDataClassesStore = defineStore('dataClasses', () => {
  const classes = ref<DataClass[]>([])
  const isLoading = ref(false)

  async function refreshDataClasses(): Promise<void> {
    const authStore = useAuthStore()
    isLoading.value = true
    try {
      classes.value = await fetchDataClasses(authStore.config.coreApiUrl)
    } catch (e) {
      console.warn('Could not load data classes:', e)
    } finally {
      isLoading.value = false
    }
  }

  async function getDataClass(id: string): Promise<DataClass> {
    const authStore = useAuthStore()
    return fetchDataClassById(authStore.config.coreApiUrl, id)
  }

  refreshDataClasses()

  return {
    classes,
    isLoading,
    refreshDataClasses,
    getDataClass,
  }
})
