import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ClassFieldDefinition, ClassViewConfig } from '@whoobe-cms/core'
import {
  fetchDataClasses,
  fetchDataClassById,
  createDataClass as apiCreateDataClass,
  updateDataClass as apiUpdateDataClass,
  deleteDataClass as apiDeleteDataClass,
  type DataClass,
} from '../utils/data-classes-api'
import { useAuthStore } from './authStore'

export const useDataClassesStore = defineStore('dataClasses', () => {
  const classes = ref<DataClass[]>([])
  const isLoading = ref(false)
  const selectedClassId = ref('')

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

  // Class Builder mutations - docs/plans/datamodel/native-class-authoring-
  // plan.md §3.1/Phase 1. Each re-fetches the list afterward rather than
  // patching `classes` locally, matching ObjectsView.vue's own "refetch on
  // return" convention elsewhere in this store's siblings - a class list
  // is small (tens, not thousands, of rows) so a full refresh is cheap and
  // avoids a second source of truth for ordering/dedup.
  async function createDataClass(
    input: { name: string; label: string; fields: ClassFieldDefinition[]; viewConfig?: ClassViewConfig | null }
  ): Promise<DataClass> {
    const authStore = useAuthStore()
    const created = await apiCreateDataClass(authStore.config.coreApiUrl, input)
    await refreshDataClasses()
    return created
  }

  async function updateDataClass(
    id: string,
    input: { name?: string; label?: string; fields?: ClassFieldDefinition[]; viewConfig?: ClassViewConfig | null }
  ): Promise<DataClass> {
    const authStore = useAuthStore()
    const updated = await apiUpdateDataClass(authStore.config.coreApiUrl, id, input)
    await refreshDataClasses()
    return updated
  }

  async function deleteDataClass(id: string): Promise<void> {
    const authStore = useAuthStore()
    await apiDeleteDataClass(authStore.config.coreApiUrl, id)
    await refreshDataClasses()
  }

  refreshDataClasses()

  return {
    classes,
    isLoading,
    selectedClassId,
    refreshDataClasses,
    getDataClass,
    createDataClass,
    updateDataClass,
    deleteDataClass,
  }
})
