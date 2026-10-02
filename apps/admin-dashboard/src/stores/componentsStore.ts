import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ClassFieldDefinition } from '@whoobe-cms/core'
import {
  fetchDataComponents,
  fetchDataComponentById,
  createDataComponent as apiCreateDataComponent,
  updateDataComponent as apiUpdateDataComponent,
  deleteDataComponent as apiDeleteDataComponent,
  type DataComponent,
} from '../utils/data-components-api'
import { useAuthStore } from './authStore'

// Component Types (docs/plans/datamodel/component-fields-plan.md) - the
// live library DataObjectForm.vue's own resolution computed (§2.3)
// resolves a `fieldcollections` field's `allowedComponentTypes` names
// against, and ComponentSettingsCard.vue (Phase 3) authors. Mirrors
// dataClassesStore.ts's own shape and "refetch after mutation" convention
// directly - a Component list is exactly as small as a class list.
export const useComponentsStore = defineStore('components', () => {
  const components = ref<DataComponent[]>([])
  const isLoading = ref(false)

  async function refreshComponents(): Promise<void> {
    const authStore = useAuthStore()
    isLoading.value = true
    try {
      components.value = await fetchDataComponents(authStore.config.coreApiUrl)
    } catch (e) {
      console.warn('Could not load components:', e)
    } finally {
      isLoading.value = false
    }
  }

  async function getComponent(id: string): Promise<DataComponent> {
    const authStore = useAuthStore()
    return fetchDataComponentById(authStore.config.coreApiUrl, id)
  }

  async function createComponent(input: { name: string; label: string; fields: ClassFieldDefinition[] }): Promise<DataComponent> {
    const authStore = useAuthStore()
    const created = await apiCreateDataComponent(authStore.config.coreApiUrl, input)
    await refreshComponents()
    return created
  }

  async function updateComponent(
    id: string,
    input: { name?: string; label?: string; fields?: ClassFieldDefinition[]; confirmTypeChange?: boolean }
  ): Promise<DataComponent> {
    const authStore = useAuthStore()
    const updated = await apiUpdateDataComponent(authStore.config.coreApiUrl, id, input)
    await refreshComponents()
    return updated
  }

  async function deleteComponent(id: string): Promise<void> {
    const authStore = useAuthStore()
    await apiDeleteDataComponent(authStore.config.coreApiUrl, id)
    await refreshComponents()
  }

  refreshComponents()

  return {
    components,
    isLoading,
    refreshComponents,
    getComponent,
    createComponent,
    updateComponent,
    deleteComponent,
  }
})
