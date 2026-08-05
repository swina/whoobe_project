<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold text-slate-100">Data Objects</h2>
        <p class="text-xs text-slate-400">Whoobe CMS data objects, backed by admin-defined classes. Migrated from Pimcore or authored directly.</p>
      </div>
      <button
        v-if="selectedClassId"
        @click="handleCreate"
        class="px-4 py-2 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition"
      >
        + Create {{ classLabel(selectedClassId) }}
      </button>
    </div>

    <!-- Filter & Search Bar -->
    <div class="flex flex-col gap-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
      <div class="flex flex-col sm:flex-row gap-4">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Filter by key or path..."
          class="flex-1 px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
        />
        <select
          v-model="selectedClassId"
          @change="handleClassChange"
          class="px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-indigo-500"
        >
          <option value="">All Classes</option>
          <option v-for="dataClass in dataClassesStore.classes" :key="dataClass.id" :value="dataClass.id">{{ dataClass.label }}</option>
        </select>
        <div class="relative">
          <button
            @click="isExportMenuOpen = !isExportMenuOpen"
            class="px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg text-slate-300 hover:border-indigo-500 transition"
          >
            Export ▾
          </button>
          <div v-if="isExportMenuOpen" class="absolute right-0 mt-1 w-32 rounded-lg bg-slate-900 border border-slate-800 shadow-xl z-10 overflow-hidden">
            <button @click="handleExport('csv')" class="block w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">CSV</button>
            <button @click="handleExport('xlsx')" class="block w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">XLSX</button>
            <button @click="handleExport('json')" class="block w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">JSON</button>
          </div>
        </div>
      </div>

      <!-- Advanced per-field filters - dynamic based on the selected class's
           own fields (docs/plans/datamodel/data-objects-views-editing.md's
           own "advanced filter on field" requirement). Only shown once a
           single class is selected, since "field" only means something in
           the context of one class's shape. -->
      <div v-if="selectedDataClass" class="flex flex-wrap gap-3 pt-3 border-t border-slate-800/80">
        <div v-for="field in filterableFields" :key="field.name" class="flex flex-col gap-1">
          <label class="text-[10px] font-semibold text-slate-500 uppercase">{{ field.title || field.name }}</label>
          <input
            v-model="fieldFilters[field.name]"
            type="text"
            :placeholder="`Filter by ${field.name}...`"
            class="px-2 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 w-40"
          />
        </div>
        <button v-if="Object.keys(fieldFilters).length > 0" @click="fieldFilters = {}" class="self-end text-xs font-semibold text-slate-500 hover:text-slate-300 pb-1.5">
          Clear field filters
        </button>
      </div>
    </div>
    <p v-if="!selectedClassId" class="text-xs text-slate-500 -mt-2">Select a class above to create a new object.</p>

    <div v-if="dataObjectsStore.isLoading && dataObjectsStore.objects.length === 0" class="p-12 text-center text-xs text-slate-500">
      Loading objects…
    </div>

    <div v-else-if="filteredRecords.length === 0" class="rounded-2xl bg-slate-900/40 border border-slate-800/80 p-12 text-center text-xs text-slate-500">
      No objects yet. Run the migration tool's `migrate-objects` command to import from Pimcore, or author a class and its objects directly.
    </div>

    <!-- Data Table - one row per logical record (translationGroupId), not
         per locale row: editing now opens ONE tab per record with a
         locale sub-tab strip inside it (MasterObjectTab.vue), so a flat
         per-locale-row list no longer matches the editing model. -->
    <div v-else class="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
      <table class="w-full text-left text-sm text-slate-300">
        <thead class="text-xs uppercase bg-slate-950/70 text-slate-400 border-b border-slate-800">
          <tr>
            <th class="px-4 py-3 font-semibold">Key / Path</th>
            <th class="px-4 py-3 font-semibold">Locales</th>
            <th class="px-4 py-3 font-semibold">Class</th>
            <th class="px-4 py-3 font-semibold">Status</th>
            <th class="px-4 py-3 font-semibold">Modification Date</th>
            <th class="px-4 py-3 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/60">
          <tr v-for="record in pagedRecords" :key="record.translationGroupId" class="hover:bg-slate-800/40 transition cursor-pointer" @click="openRecord(record)">
            <td class="px-4 py-3.5 font-medium text-slate-200">
              <div>{{ record.primary.key }}</div>
              <div class="text-xs text-slate-500 font-mono">{{ record.primary.path }}</div>
            </td>
            <td class="px-4 py-3.5">
              <span
                v-for="row in record.rows"
                :key="row.locale"
                class="px-2 py-0.5 mr-1 text-[10px] font-bold rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 uppercase"
              >
                {{ row.locale }}
              </span>
            </td>
            <td class="px-4 py-3.5"><span class="px-2 py-0.5 text-xs bg-slate-800 rounded font-mono text-indigo-300">{{ classLabel(record.primary.classId) }}</span></td>
            <td class="px-4 py-3.5">
              <span
                :class="[
                  'px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase',
                  record.primary.published ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                ]"
              >
                {{ record.primary.published ? 'published' : (record.primary.workflowState || 'draft') }}
              </span>
            </td>
            <td class="px-4 py-3.5 text-xs text-slate-400">
              {{ new Date(record.primary.updatedAt).toLocaleString() }}
            </td>
            <td class="px-4 py-3.5 text-right" @click.stop>
              <button @click="openRecord(record)" class="text-xs font-medium text-indigo-400 hover:text-indigo-300 mr-3">Edit</button>
              <button @click="handleDelete(record)" class="text-xs font-medium text-rose-400 hover:text-rose-300">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div class="flex items-center justify-between px-4 py-3 border-t border-slate-800 bg-slate-950/40">
        <div class="flex items-center gap-2 text-xs text-slate-400">
          <span>Rows per page:</span>
          <select v-model.number="pageSize" class="px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-indigo-500">
            <option v-for="size in [10, 25, 50, 100]" :key="size" :value="size">{{ size }}</option>
          </select>
        </div>
        <div class="flex items-center gap-3 text-xs text-slate-400">
          <span>{{ pageRangeLabel }}</span>
          <button @click="currentPage = Math.max(1, currentPage - 1)" :disabled="currentPage <= 1" class="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 disabled:opacity-40 hover:border-indigo-500">‹ Prev</button>
          <button @click="currentPage = Math.min(totalPages, currentPage + 1)" :disabled="currentPage >= totalPages" class="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 disabled:opacity-40 hover:border-indigo-500">Next ›</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Reworked per docs/plans/datamodel/data-objects-views-editing.md: list +
// pagination + advanced field filter + CSV/XLSX/JSON export, and editing
// now opens a real tab (MasterObjectTab.vue) instead of a modal. Rows are
// grouped by translationGroupId - "Pimcore import multilanguage data
// records that have the same [translation group] are hypothetically the
// same record" per that doc, so the list now shows one row per logical
// record with a locale sub-tab system living inside the edit tab, not a
// flat per-locale-row list (superseding the old Locale column/filter).
import { ref, computed, watch } from 'vue'
import { useDataObjectsStore } from '../stores/dataObjectsStore'
import { useDataClassesStore } from '../stores/dataClassesStore'
import { useTabsStore, sectionTabId } from '../stores/tabsStore'
import { useToastStore } from '../stores/toastStore'
import type { DataObject } from '../utils/data-objects-api'
import { exportRowsAsCsv, exportRowsAsJson, exportRowsAsXlsx } from '../utils/data-export'

const dataObjectsStore = useDataObjectsStore()
const dataClassesStore = useDataClassesStore()
const tabsStore = useTabsStore()
const toastStore = useToastStore()

const searchQuery = ref('')
const selectedClassId = ref('')
const fieldFilters = ref<Record<string, string>>({})
const isExportMenuOpen = ref(false)
const pageSize = ref(25)
const currentPage = ref(1)

function classLabel(classId: string): string {
  return dataClassesStore.classes.find((c) => c.id === classId)?.label || classId
}

const selectedDataClass = computed(() => dataClassesStore.classes.find((c) => c.id === selectedClassId.value) || null)

const filterableFields = computed(() => selectedDataClass.value?.fields ?? [])

function handleClassChange() {
  fieldFilters.value = {}
  currentPage.value = 1
  dataObjectsStore.refreshDataObjects(selectedClassId.value || undefined)
}

interface ObjectRecord {
  translationGroupId: string
  primary: DataObject
  rows: DataObject[]
}

// One row per translationGroupId; `primary` favors the currently-selected
// locale when present so Status/Modification Date reflect what the user
// is actually filtering by, else falls back to the first locale found.
const groupedRecords = computed<ObjectRecord[]>(() => {
  const groups = new Map<string, DataObject[]>()
  for (const obj of dataObjectsStore.objects) {
    const existing = groups.get(obj.translationGroupId)
    if (existing) existing.push(obj)
    else groups.set(obj.translationGroupId, [obj])
  }
  return [...groups.entries()].map(([translationGroupId, rows]) => ({
    translationGroupId,
    primary: rows[0],
    rows,
  }))
})

const filteredRecords = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const activeFieldFilters = Object.entries(fieldFilters.value).filter(([, v]) => v.trim() !== '')

  return groupedRecords.value.filter((record) => {
    const matchesQuery = !query || record.rows.some((row) => row.key.toLowerCase().includes(query) || row.path.toLowerCase().includes(query))
    if (!matchesQuery) return false

    if (activeFieldFilters.length === 0) return true
    return record.rows.some((row) =>
      activeFieldFilters.every(([fieldName, value]) => {
        const fieldValue = row.attributes?.[fieldName]
        if (fieldValue === null || fieldValue === undefined) return false
        return String(fieldValue).toLowerCase().includes(value.trim().toLowerCase())
      })
    )
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredRecords.value.length / pageSize.value)))

const pagedRecords = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredRecords.value.slice(start, start + pageSize.value)
})

const pageRangeLabel = computed(() => {
  if (filteredRecords.value.length === 0) return '0 of 0'
  const start = (currentPage.value - 1) * pageSize.value + 1
  const end = Math.min(filteredRecords.value.length, currentPage.value * pageSize.value)
  return `${start}-${end} of ${filteredRecords.value.length}`
})

watch([searchQuery, fieldFilters, pageSize], () => {
  currentPage.value = 1
}, { deep: true })

watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages
})

// MasterObjectTab.vue deliberately bypasses this store when saving (to
// avoid a background tab's save silently repointing this list at a
// different class - see MasterObjectTab.vue's own comment), so refetch
// whenever the user comes back to look at this list instead, rather than
// leaving it stale until an unrelated action happens to refresh it.
watch(
  () => tabsStore.activeTabId,
  (activeId) => {
    if (activeId === sectionTabId('objects')) {
      dataObjectsStore.refreshDataObjects(selectedClassId.value || undefined)
    }
  }
)

function openRecord(record: ObjectRecord) {
  tabsStore.openObject(record.translationGroupId, record.primary.classId, record.primary.locale)
}

function handleCreate() {
  if (!selectedClassId.value) return
  // A brand-new record has no real translationGroupId yet - a
  // client-generated placeholder keys the tab; MasterObjectTab.vue omits
  // it from the create call so the backend mints the real one on first
  // save (see MasterObjectTab.vue's own save() for the hand-off).
  const placeholderGroupId = `new:${crypto.randomUUID()}`
  tabsStore.openObject(placeholderGroupId, selectedClassId.value, 'en')
}

async function handleDelete(record: ObjectRecord) {
  if (!confirm(`Delete "${record.primary.key}" and all its locale rows? This cannot be undone.`)) return
  try {
    await Promise.all(record.rows.map((row) => dataObjectsStore.deleteDataObject(row.id)))
    tabsStore.closeObjectTab(record.translationGroupId)
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to delete object')
  }
}

function flattenRecordForExport(record: ObjectRecord): Record<string, unknown> {
  const row: Record<string, unknown> = {
    key: record.primary.key,
    path: record.primary.path,
    class: classLabel(record.primary.classId),
    locales: record.rows.map((r) => r.locale).join(','),
    published: record.primary.published,
    workflowState: record.primary.workflowState ?? '',
    updatedAt: record.primary.updatedAt,
  }
  for (const field of filterableFields.value) {
    row[field.name] = record.primary.attributes?.[field.name] ?? ''
  }
  return row
}

function handleExport(format: 'csv' | 'xlsx' | 'json') {
  isExportMenuOpen.value = false
  const rows = filteredRecords.value.map(flattenRecordForExport)
  if (rows.length === 0) {
    toastStore.show('Nothing to export')
    return
  }
  const filenameBase = `data-objects-${new Date().toISOString().slice(0, 10)}`
  if (format === 'csv') exportRowsAsCsv(rows, filenameBase)
  else if (format === 'xlsx') exportRowsAsXlsx(rows, filenameBase)
  else exportRowsAsJson(rows, filenameBase)
}
</script>
