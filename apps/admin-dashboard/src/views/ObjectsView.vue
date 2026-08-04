<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold text-slate-100">Data Objects</h2>
        <p class="text-xs text-slate-400">Whoobe CMS data objects, backed by admin-defined classes. Migrated from Pimcore or authored directly.</p>
      </div>
      <button
        v-if="selectedClassId"
        @click="showCreateModal = true"
        class="px-4 py-2 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition"
      >
        + Create {{ classLabel(selectedClassId) }}
      </button>
    </div>

    <!-- Filter & Search Bar -->
    <div class="flex flex-col sm:flex-row gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Filter by key or path..."
        class="flex-1 px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
      />
      <select
        v-model="selectedClassId"
        @change="dataObjectsStore.refreshDataObjects(selectedClassId || undefined)"
        class="px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-indigo-500"
      >
        <option value="">All Classes</option>
        <option v-for="dataClass in dataClassesStore.classes" :key="dataClass.id" :value="dataClass.id">{{ dataClass.label }}</option>
      </select>
    </div>
    <p v-if="!selectedClassId" class="text-xs text-slate-500 -mt-2">Select a class above to create a new object.</p>

    <div v-if="dataObjectsStore.isLoading && dataObjectsStore.objects.length === 0" class="p-12 text-center text-xs text-slate-500">
      Loading objects…
    </div>

    <div v-else-if="filteredObjects.length === 0" class="rounded-2xl bg-slate-900/40 border border-slate-800/80 p-12 text-center text-xs text-slate-500">
      No objects yet. Run the migration tool's `migrate-objects` command to import from Pimcore, or author a class and its objects directly.
    </div>

    <!-- Data Table -->
    <div v-else class="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
      <table class="w-full text-left text-sm text-slate-300">
        <thead class="text-xs uppercase bg-slate-950/70 text-slate-400 border-b border-slate-800">
          <tr>
            <th class="px-4 py-3 font-semibold">Key / Path</th>
            <th class="px-4 py-3 font-semibold">Class</th>
            <th class="px-4 py-3 font-semibold">Status</th>
            <th class="px-4 py-3 font-semibold">Modification Date</th>
            <th class="px-4 py-3 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/60">
          <tr v-for="obj in filteredObjects" :key="obj.id" class="hover:bg-slate-800/40 transition">
            <td class="px-4 py-3.5 font-medium text-slate-200">
              <div>{{ obj.key }}</div>
              <div class="text-xs text-slate-500 font-mono">{{ obj.path }}</div>
            </td>
            <td class="px-4 py-3.5"><span class="px-2 py-0.5 text-xs bg-slate-800 rounded font-mono text-indigo-300">{{ classLabel(obj.classId) }}</span></td>
            <td class="px-4 py-3.5">
              <span
                :class="[
                  'px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase',
                  obj.published ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                ]"
              >
                {{ obj.published ? 'published' : (obj.workflowState || 'draft') }}
              </span>
            </td>
            <td class="px-4 py-3.5 text-xs text-slate-400">
              {{ new Date(obj.updatedAt).toLocaleString() }}
            </td>
            <td class="px-4 py-3.5 text-right">
              <button @click="editingObject = obj" class="text-xs font-medium text-indigo-400 hover:text-indigo-300 mr-3">Edit</button>
              <button @click="handleDelete(obj)" class="text-xs font-medium text-rose-400 hover:text-rose-300">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <DataObjectEditModal
      v-if="showCreateModal && selectedClassId"
      :data-class="dataClassesStore.classes.find((c) => c.id === selectedClassId)!"
      @close="showCreateModal = false"
      @saved="showCreateModal = false"
    />
    <DataObjectEditModal
      v-if="editingObject"
      :data-class="dataClassesStore.classes.find((c) => c.id === editingObject!.classId)!"
      :data-object="editingObject"
      @close="editingObject = null"
      @saved="editingObject = null"
    />
  </div>
</template>

<script setup lang="ts">
// Retargeted off its previous fully-mocked state onto the real Data
// Object model (docs/plans/datamodel/advanced-data-modeling-plan.md §6.2,
// Phase 1) and now, with the dynamic form built (§6.3, Phase 2), real
// Create/Edit actions too - Create requires a class to be selected first
// (the form's shape depends on it; there's no separate class-picker step).
import { ref, computed } from 'vue'
import { useDataObjectsStore } from '../stores/dataObjectsStore'
import { useDataClassesStore } from '../stores/dataClassesStore'
import { useToastStore } from '../stores/toastStore'
import type { DataObject } from '../utils/data-objects-api'
import DataObjectEditModal from '../components/objects/DataObjectEditModal.vue'

const dataObjectsStore = useDataObjectsStore()
const dataClassesStore = useDataClassesStore()
const toastStore = useToastStore()

const searchQuery = ref('')
const selectedClassId = ref('')
const showCreateModal = ref(false)
const editingObject = ref<DataObject | null>(null)

function classLabel(classId: string): string {
  return dataClassesStore.classes.find((c) => c.id === classId)?.label || classId
}

const filteredObjects = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return dataObjectsStore.objects
  return dataObjectsStore.objects.filter(
    (o) => o.key.toLowerCase().includes(query) || o.path.toLowerCase().includes(query)
  )
})

async function handleDelete(obj: DataObject) {
  if (!confirm(`Delete "${obj.key}"? This cannot be undone.`)) return
  try {
    await dataObjectsStore.deleteDataObject(obj.id)
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to delete object')
  }
}
</script>
