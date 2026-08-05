import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchDataObjects, deleteDataObject as apiDeleteDataObject, type DataObject } from '../utils/data-objects-api'
import { useAuthStore } from './authStore'

// Backs ObjectsView.vue's list only - create/update now go straight
// through MasterObjectTab.vue to the API client (see that component's own
// comment on why it bypasses this store), so this store only needs to
// list and delete.
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
    deleteDataObject,
  }
})
