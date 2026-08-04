import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  fetchDataObjects,
  fetchDataObjectById,
  deleteDataObject as apiDeleteDataObject,
  createDataObject as apiCreateDataObject,
  updateDataObject as apiUpdateDataObject,
  type DataObject,
} from '../utils/data-objects-api'
import { useAuthStore } from './authStore'

export const useDataObjectsStore = defineStore('dataObjects', () => {
  const objects = ref<DataObject[]>([])
  const isLoading = ref(false)

  async function refreshDataObjects(classId?: string): Promise<void> {
    const authStore = useAuthStore()
    isLoading.value = true
    try {
      objects.value = await fetchDataObjects(authStore.config.coreApiUrl, classId)
    } catch (e) {
      console.warn('Could not load data objects:', e)
    } finally {
      isLoading.value = false
    }
  }

  async function getDataObject(id: string): Promise<DataObject> {
    const authStore = useAuthStore()
    return fetchDataObjectById(authStore.config.coreApiUrl, id)
  }

  async function createDataObject(input: {
    classId: string
    key: string
    path?: string
    locale?: string
    attributes: Record<string, unknown>
  }): Promise<DataObject> {
    const authStore = useAuthStore()
    const created = await apiCreateDataObject(authStore.config.coreApiUrl, input)
    objects.value = [created, ...objects.value]
    return created
  }

  async function updateDataObject(
    id: string,
    input: { key?: string; published?: boolean; workflowState?: string | null; attributes?: Record<string, unknown> }
  ): Promise<DataObject> {
    const authStore = useAuthStore()
    const updated = await apiUpdateDataObject(authStore.config.coreApiUrl, id, input)
    const index = objects.value.findIndex((o) => o.id === id)
    if (index >= 0) objects.value[index] = updated
    return updated
  }

  async function deleteDataObject(id: string): Promise<void> {
    const authStore = useAuthStore()
    await apiDeleteDataObject(authStore.config.coreApiUrl, id)
    objects.value = objects.value.filter((o) => o.id !== id)
  }

  refreshDataObjects()

  return {
    objects,
    isLoading,
    refreshDataObjects,
    getDataObject,
    createDataObject,
    updateDataObject,
    deleteDataObject,
  }
})
