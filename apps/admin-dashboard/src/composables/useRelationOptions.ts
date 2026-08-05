// Loads the objects of a relation field's target class, for the dynamic
// object-detail form's relation pickers (docs/plans/datamodel/advanced-
// data-modeling-plan.md §6.3, Phase 2). Deliberately bypasses
// dataObjectsStore's own shared `objects` list - that list belongs to
// whichever class ObjectsView.vue is currently browsing, and a relation
// picker inside the form (e.g. a Product's `category` field, pointing at
// Category) would otherwise stomp on it. Each target class gets its own
// small, independently-cached fetch instead.
import { ref } from 'vue'
import { fetchDataObjects, type DataObject } from '../utils/data-objects-api'
import { useDataClassesStore } from '../stores/dataClassesStore'
import { useAuthStore } from '../stores/authStore'

const cacheByClassName = new Map<string, ReturnType<typeof ref<DataObject[]>>>()

export function useRelationOptions(className: string) {
  if (!cacheByClassName.has(className)) {
    const options = ref<DataObject[]>([])
    const dataClassesStore = useDataClassesStore()
    const authStore = useAuthStore()

    async function load() {
      const targetClass = dataClassesStore.classes.find((c) => c.name === className)
      if (!targetClass) return
      try {
        options.value = await fetchDataObjects(authStore.config.coreApiUrl, targetClass.id)
      } catch (e) {
        console.warn(`Could not load objects for relation target "${className}":`, e)
      }
    }

    load()
    cacheByClassName.set(className, options)
  }

  return cacheByClassName.get(className)!
}
