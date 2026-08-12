<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold text-slate-100 light:text-slate-900">Data Objects</h2>
        <p class="text-xs text-slate-400 light:text-slate-600">Whoobe CMS data objects, backed by admin-defined classes. Migrated from Pimcore or authored directly.</p>
      </div>
      <button
        v-if="selectedClassId"
        @click="handleCreate"
        class="px-4 py-2 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition"
      >
        + Create {{ classLabel(selectedClassId) }}
      </button>
    </div>

    <div class="flex flex-col gap-3 p-4 rounded-xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200">
      <div class="flex flex-col sm:flex-row gap-4">
        <input v-model="searchQuery" type="text" placeholder="Filter by key or path..."
          class="flex-1 px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
        <select v-model="selectedClassId" @change="handleClassChange"
          class="px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500">
          <option value="">All Classes</option>
          <option v-for="dataClass in dataClassesStore.classes" :key="dataClass.id" :value="dataClass.id">{{ dataClass.label }}</option>
        </select>

        <div v-if="selectedDataClass" class="relative">
          <button @click="isColumnsMenuOpen = !isColumnsMenuOpen"
            class="px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 hover:border-indigo-500 transition"
            :class="activeColumnNames.length > 0 ? 'border-indigo-500 text-indigo-400' : ''">
            View ▾
          </button>
          <div v-if="isColumnsMenuOpen"
            class="absolute right-0 mt-1 w-72 rounded-lg bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 shadow-xl z-10 p-3 space-y-3">
            <div class="space-y-1">
              <span class="text-[10px] font-semibold text-slate-500 uppercase">Columns</span>
              <div class="flex flex-col gap-1 max-h-60 overflow-y-auto">
                <div v-for="(col, idx) in displayColumns" :key="col.name"
                  class="flex items-center gap-1.5 text-xs text-slate-300 light:text-slate-700 group">
                  <button @click="moveColumn(col.name, -1)" :disabled="idx === 0"
                    class="text-slate-600 hover:text-slate-300 disabled:opacity-20 shrink-0" title="Move up">
                    <ChevronUp class="w-3 h-3" />
                  </button>
                  <button @click="moveColumn(col.name, 1)" :disabled="idx === displayColumns.length - 1"
                    class="text-slate-600 hover:text-slate-300 disabled:opacity-20 shrink-0" title="Move down">
                    <ChevronDown class="w-3 h-3" />
                  </button>
                  <input type="checkbox" :checked="activeColumnNames.includes(col.name)"
                    @change="toggleColumn(col.name)"
                    class="w-3.5 h-3.5 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600 shrink-0" />
                  <span class="truncate">{{ col.title }}</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2 pt-1 border-t border-slate-800 light:border-slate-200">
              <button @click="saveCurrentAsPreset" :disabled="activeColumnNames.length === 0"
                class="text-xs font-semibold text-indigo-400 hover:text-indigo-300 disabled:opacity-40">
                + Save preset
              </button>
              <button v-if="activePreset" @click="updateCurrentPreset"
                class="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
                :title="'Update &quot;' + activePreset.name + '&quot;'">
                Update
              </button>
            </div>
            <div v-if="presets.length > 0" class="space-y-1 pt-1 border-t border-slate-800 light:border-slate-200">
              <span class="text-[10px] font-semibold text-slate-500 uppercase">Saved presets</span>
              <div v-for="preset in presets" :key="preset.name"
                class="flex items-center justify-between gap-2">
                <button @click="applyPreset(preset)" type="button"
                  class="text-xs text-slate-300 light:text-slate-700 hover:text-indigo-300 truncate text-left flex items-center gap-1">
                  {{ preset.name }}
                  <span v-if="preset.isDefault" class="text-[9px] text-indigo-400 font-semibold">(default)</span>
                </button>
                <div class="flex items-center gap-1 shrink-0">
                  <button v-if="!preset.isDefault" @click.stop="setDefaultPresetAction(preset.name)" type="button"
                    title="Set as default" class="text-[10px] text-indigo-400 hover:text-indigo-300">Default</button>
                  <button @click.stop="removePreset(preset.name)" type="button"
                    class="text-xs text-rose-400 hover:text-rose-300 shrink-0">×</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <button v-if="selectedDataClass" @click="showFilterModal = true"
          class="px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 hover:border-indigo-500 transition inline-flex items-center gap-1.5"
          :class="queryFilters.length > 0 ? 'border-indigo-500 text-indigo-400' : ''">
          <Filter class="w-4 h-4" /> Filter{{ queryFilters.length > 0 ? ` (${queryFilters.length})` : '' }}
        </button>

        <div class="relative">
          <button @click="isExportMenuOpen = !isExportMenuOpen"
            class="px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 hover:border-indigo-500 transition">
            Export ▾
          </button>
          <div v-if="isExportMenuOpen"
            class="absolute right-0 mt-1 w-32 rounded-lg bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 shadow-xl z-10 overflow-hidden">
            <button @click="handleExport('csv')"
              class="block w-full text-left px-3 py-2 text-xs text-slate-300 light:text-slate-700 hover:bg-slate-800 light:bg-slate-100">CSV</button>
            <button @click="handleExport('xlsx')"
              class="block w-full text-left px-3 py-2 text-xs text-slate-300 light:text-slate-700 hover:bg-slate-800 light:bg-slate-100">XLSX</button>
            <button @click="handleExport('json')"
              class="block w-full text-left px-3 py-2 text-xs text-slate-300 light:text-slate-700 hover:bg-slate-800 light:bg-slate-100">JSON</button>
          </div>
        </div>
      </div>
    </div>
    <p v-if="!selectedClassId" class="text-xs text-slate-500 -mt-2">Select a class above to create a new object.</p>

    <div v-if="selectedRowIds.length > 0"
      class="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-indigo-900/40 light:bg-indigo-50/60 border border-indigo-700/50 light:border-indigo-200">
      <span class="text-xs font-semibold text-indigo-200 light:text-indigo-700">{{ selectedRowIds.length }} selected</span>
      <button @click="handleBatchPublish"
        class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white">Publish</button>
      <button @click="handleBatchUnpublish"
        class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white">Unpublish</button>
      <button @click="handleBatchDelete"
        class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-700 hover:bg-rose-600 text-white">Delete</button>
      <button @click="handleBatchResolveAssets"
        class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white">Resolve assets</button>
      <button @click="selectedGroupIds = new Set()"
        class="text-xs text-slate-400 hover:text-slate-200 light:text-slate-500 ml-auto">Clear</button>
    </div>

    <div v-if="dataObjectsStore.isLoading && dataObjectsStore.objects.length === 0"
      class="p-12 text-center text-xs text-slate-500">Loading objects…</div>

    <div v-else-if="sortedRecords.length === 0"
      class="rounded-2xl bg-slate-900/40 light:bg-white/40 border border-slate-800/80 light:border-slate-200/80 p-12 text-center text-xs text-slate-500">
      No objects yet. Run the migration tool's `migrate-objects` command to import from Pimcore, or author a class and its objects directly.
    </div>

    <div v-else
      class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 overflow-hidden">
      <table class="w-full text-left text-sm text-slate-300 light:text-slate-700">
        <thead
          class="text-xs uppercase bg-slate-950/70 light:bg-white/70 text-slate-400 light:text-slate-600 border-b border-slate-800 light:border-slate-200">
          <tr>
            <th class="px-3 py-3 w-10">
              <input type="checkbox" :checked="allPageSelected()" @change="toggleSelectAll"
                class="w-4 h-4 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600" />
            </th>
            <th v-for="col in visibleColumns" :key="col.name" @click="toggleSort(col.name)"
              class="px-4 py-3 font-semibold cursor-pointer hover:text-slate-200 select-none whitespace-nowrap">
              {{ col.title }}
              <span v-if="sortField === col.name" class="ml-1">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="px-4 py-3 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/60 light:divide-slate-200/60">
          <tr v-for="record in pagedRecords" :key="record.translationGroupId"
            class="hover:bg-slate-800/40 light:bg-slate-100/40 transition cursor-pointer">
            <td class="px-3 py-3.5" @click.stop>
              <input type="checkbox" :checked="selectedGroupIds.has(record.translationGroupId)"
                @change="toggleSelectGroup(record.translationGroupId)"
                class="w-4 h-4 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600" />
            </td>
            <td v-for="col in visibleColumns" :key="col.name" @click="openRecord(record)"
              class="px-4 py-3.5" :class="col.name === 'key' ? 'font-medium text-slate-200 light:text-slate-800' : 'text-slate-400 light:text-slate-600'">
              <template v-if="col.name === 'key'">
                <div>{{ record.primary.key }}</div>
                <div class="text-xs text-slate-500 font-mono">{{ record.primary.path }}</div>
              </template>
              <template v-else-if="col.name === 'locales'">
                <span v-for="row in record.rows" :key="row.locale"
                  class="px-2 py-0.5 mr-1 text-[10px] font-bold rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 uppercase">{{ row.locale }}</span>
              </template>
              <template v-else-if="col.name === 'class'">
                <span
                  class="px-2 py-0.5 text-xs bg-slate-800 light:bg-slate-100 rounded font-mono text-indigo-300">{{ classLabel(record.primary.classId) }}</span>
              </template>
              <template v-else-if="col.name === 'status'">
                <span :class="[
                  'px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase',
                  record.primary.published ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                ]">{{ record.primary.published ? 'published' : (record.primary.workflowState || 'draft') }}</span>
              </template>
              <template v-else-if="col.name === 'updatedAt'">
                {{ new Date(record.primary.updatedAt).toLocaleString() }}
              </template>
              <template v-else>
                <img v-if="classFieldByName(col.name) && isAssetField(classFieldByName(col.name)!)"
                  :src="recordAssetUrl(record, col.name) || ''"
                  class="w-10 h-10 rounded object-cover border border-slate-700/50 bg-slate-800"
                  :title="col.title"
                  @error="($event.target as HTMLImageElement).style.display = 'none'"
                />
                <span v-else>{{ formatListValue(record.primary.attributes?.[col.name]) }}</span>
              </template>
            </td>
            <td class="px-4 py-3.5 text-right" @click.stop>
              <button @click="openRecord(record)"
                class="text-xs font-medium text-indigo-400 hover:text-indigo-300 mr-3">Edit</button>
              <button @click="handleDelete(record)"
                class="text-xs font-medium text-rose-400 hover:text-rose-300">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>

      <div
        class="flex items-center justify-between px-4 py-3 border-t border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-white/40">
        <div class="flex items-center gap-2 text-xs text-slate-400 light:text-slate-600">
          <span>Rows per page:</span>
          <select v-model.number="pageSize"
            class="px-2 py-1 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700">
            <option v-for="size in [10, 25, 50, 100]" :key="size" :value="size">{{ size }}</option>
          </select>
        </div>
        <div class="flex items-center gap-3 text-xs text-slate-400 light:text-slate-600">
          <span>{{ pageRangeLabel }}</span>
          <button @click="currentPage = Math.max(1, currentPage - 1)" :disabled="currentPage <= 1"
            class="px-2 py-1 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 disabled:opacity-40 hover:border-indigo-500">‹
            Prev</button>
          <button @click="currentPage = Math.min(totalPages, currentPage + 1)" :disabled="currentPage >= totalPages"
            class="px-2 py-1 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 disabled:opacity-40 hover:border-indigo-500">Next
            ›</button>
        </div>
      </div>
    </div>

    <!-- Filter Query-->
    <div v-if="showFilterModal && selectedDataClass"
      class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center" @click.self="showFilterModal = false">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        <div class="flex items-center justify-between px-3 py-2 border-b shrink-0">
          <span class="text-xs font-semibold text-gray-600">Filter {{ selectedDataClass.label }} objects</span>
          <button class="text-xs text-gray-400 hover:text-gray-700" @click="showFilterModal = false"><X class="w-4 h-4" /></button>
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
          <div class="text-[10px] text-gray-400 mb-1">Filters (all must match)</div>
          <div v-if="queryFilters.length === 0" class="text-xs text-gray-400 text-center py-4">No filters — shows all objects of this class.</div>
          <div v-for="(f, i) in queryFilters" :key="i" class="flex items-center gap-2">
            <select v-model="f.field" class="text-xs border rounded px-2 py-1 min-w-[7rem]">
              <option v-for="ff in filterFields" :key="ff.name" :value="ff.name">{{ ff.title || ff.name }}</option>
            </select>
            <select v-model="f.operator" class="text-xs border rounded px-2 py-1">
              <option value="eq">=</option>
              <option value="neq">≠</option>
              <option value="contains">contains</option>
              <option value="gt">&gt;</option>
              <option value="lt">&lt;</option>
            </select>
            <template v-if="filterInputType(f.field) === 'checkbox'">
              <select v-model="f.value" class="text-xs border rounded px-2 py-1">
                <option :value="true">true</option>
                <option :value="false">false</option>
              </select>
            </template>
            <template v-else-if="filterInputType(f.field) === 'select'">
              <select v-model="f.value" class="text-xs border rounded px-2 py-1 flex-1">
                <option value="">Any</option>
                <option v-for="opt in filterFieldOptions(f.field)" :key="opt" :value="opt">{{ opt }}</option>
              </select>
            </template>
            <template v-else-if="filterInputType(f.field) === 'number'">
              <input v-model.number="f.value" type="number" class="text-xs border rounded px-2 py-1 flex-1" placeholder="value" />
            </template>
            <template v-else-if="filterInputType(f.field) === 'date'">
              <input v-model="f.value" type="date" class="text-xs border rounded px-2 py-1 flex-1" />
            </template>
            <template v-else>
              <input v-model="f.value" type="text" class="text-xs border rounded px-2 py-1 flex-1" placeholder="value" />
            </template>
            <button class="text-gray-400 hover:text-rose-500 shrink-0" @click="queryFilters.splice(i, 1)"><Trash2 class="w-3.5 h-3.5" /></button>
          </div>
          <button class="flex items-center gap-1 text-xs text-indigo-600" @click="addQueryFilter"><Plus class="w-3.5 h-3.5" /> Add filter</button>
        </div>
        <div class="flex items-center justify-between px-3 py-2 border-t shrink-0">
          <button v-if="queryFilters.length > 0" class="text-xs text-rose-500 hover:text-rose-700" @click="clearQueryFilters">Clear</button>
          <div v-else></div>
          <div class="flex items-center gap-2">
            <button class="text-xs px-3 py-1.5 rounded border text-gray-500 hover:bg-gray-50" @click="showFilterModal = false">Cancel</button>
            <button class="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white" @click="showFilterModal = false">Apply</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ChevronUp, ChevronDown, Filter, Plus, Trash2, X } from '@lucide/vue'
import { useDataObjectsStore } from '../stores/dataObjectsStore'
import { useDataClassesStore } from '../stores/dataClassesStore'
import { useDamStore } from '../stores/damStore'
import { useTabsStore, sectionTabId } from '../stores/tabsStore'
import { useToastStore } from '../stores/toastStore'
import { useAuthStore } from '../stores/authStore'
import type { DataObject } from '../utils/data-objects-api'
import { batchActionDataObjects, batchResolveAssets } from '../utils/data-objects-api'
import type { DataObjectQueryFilter } from '../utils/data-objects-api'
import { exportRowsAsCsv, exportRowsAsJson, exportRowsAsXlsx } from '../utils/data-export'
import { loadObjectListPresets, upsertObjectListPreset, deleteObjectListPreset, setDefaultPreset, getDefaultPreset, type ObjectListPreset } from '../utils/object-list-presets'
import type { ClassFieldDefinition } from '@whoobe-cms/core'
import { randomUUID } from '../utils/random-id'

const dataObjectsStore = useDataObjectsStore()
const dataClassesStore = useDataClassesStore()
const damStore = useDamStore()
const tabsStore = useTabsStore()
const toastStore = useToastStore()
const authStore = useAuthStore()

const searchQuery = ref('')
const selectedClassId = ref('')
const isExportMenuOpen = ref(false)
const isColumnsMenuOpen = ref(false)
const activeColumnNames = ref<string[]>([])
const presets = ref<ObjectListPreset[]>([])
const pageSize = ref(25)
const currentPage = ref(1)
const sortField = ref<string>('key')
const sortDir = ref<'asc' | 'desc'>('asc')

const showFilterModal = ref(false)
const queryFilters = ref<DataObjectQueryFilter[]>([])

// System columns always available in the view config
interface ColumnOption { name: string; title: string }
const SYSTEM_COLUMNS: ColumnOption[] = [
  { name: 'key', title: 'Key / Path' },
  { name: 'locales', title: 'Locales' },
  { name: 'class', title: 'Class' },
  { name: 'status', title: 'Status' },
  { name: 'updatedAt', title: 'Modification Date' },
]

const allColumnOptions = computed<ColumnOption[]>(() => {
  const classFields = filterableFields.value.map((f) => ({ name: f.name, title: f.title || f.name }))
  return [...SYSTEM_COLUMNS, ...classFields]
})

const visibleColumns = computed<ColumnOption[]>(() => {
  if (activeColumnNames.value.length === 0) return allColumnOptions.value
  return activeColumnNames.value
    .map((name) => allColumnOptions.value.find((c) => c.name === name))
    .filter((c): c is ColumnOption => !!c)
})

// Order used in the View dropdown: selected columns first (in active order),
// then unselected columns (in their natural order).
const displayColumns = computed<ColumnOption[]>(() => {
  const all = allColumnOptions.value
  const active = activeColumnNames.value
  if (active.length === 0) return all
  const byName = new Map(all.map((c) => [c.name, c]))
  const selected = active.map((name) => byName.get(name)).filter((c): c is ColumnOption => !!c)
  const unselected = all.filter((c) => !active.includes(c.name))
  return [...selected, ...unselected]
})

function classFieldByName(name: string): ClassFieldDefinition | undefined {
  return filterableFields.value.find((f) => f.name === name)
}

function toggleColumn(fieldName: string) {
  const current = new Set(activeColumnNames.value)
  if (current.has(fieldName)) current.delete(fieldName)
  else current.add(fieldName)
  activeColumnNames.value = allColumnOptions.value.map((c) => c.name).filter((n) => current.has(n))
}

function moveColumn(name: string, delta: number) {
  const names = [...activeColumnNames.value.length > 0 ? activeColumnNames.value : allColumnOptions.value.map((c) => c.name)]
  const idx = names.indexOf(name)
  if (idx === -1) return
  const target = idx + delta
  if (target < 0 || target >= names.length) return
  names.splice(idx, 1)
  names.splice(target, 0, name)
  activeColumnNames.value = names
}

function toggleSort(colName: string) {
  if (sortField.value === colName) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = colName
    sortDir.value = 'asc'
  }
  currentPage.value = 1
}

// Active preset (the one whose columns match the current selection)
const activePreset = computed<ObjectListPreset | undefined>(() => {
  const current = activeColumnNames.value
  if (current.length === 0) return undefined
  return presets.value.find((p) => p.columns.length === current.length && p.columns.every((c, i) => c === current[i]))
})

// Batch selection
const selectedGroupIds = ref<Set<string>>(new Set())

function toggleSelectGroup(groupId: string) {
  const next = new Set(selectedGroupIds.value)
  if (next.has(groupId)) next.delete(groupId)
  else next.add(groupId)
  selectedGroupIds.value = next
}

function toggleSelectAll() {
  if (selectedGroupIds.value.size === pagedRecords.value.length) {
    selectedGroupIds.value = new Set()
  } else {
    selectedGroupIds.value = new Set(pagedRecords.value.map((r) => r.translationGroupId))
  }
}

function allPageSelected(): boolean {
  return pagedRecords.value.length > 0 && pagedRecords.value.every((r) => selectedGroupIds.value.has(r.translationGroupId))
}

const selectedRowIds = computed<string[]>(() => {
  const ids: string[] = []
  for (const group of groupedRecords.value) {
    if (selectedGroupIds.value.has(group.translationGroupId)) {
      for (const row of group.rows) ids.push(row.id)
    }
  }
  return ids
})

async function handleBatchPublish() {
  const ids = selectedRowIds.value; if (ids.length === 0) return
  try {
    const result = await batchActionDataObjects(authStore.config.coreApiUrl, ids, 'publish')
    toastStore.show(`${result.succeeded} published, ${result.failed} failed`)
    selectedGroupIds.value = new Set(); await dataObjectsStore.refreshDataObjects(selectedClassId.value || undefined)
  } catch (e: any) { toastStore.show(e?.message || 'Batch publish failed') }
}

async function handleBatchUnpublish() {
  const ids = selectedRowIds.value; if (ids.length === 0) return
  try {
    const result = await batchActionDataObjects(authStore.config.coreApiUrl, ids, 'unpublish')
    toastStore.show(`${result.succeeded} unpublished, ${result.failed} failed`)
    selectedGroupIds.value = new Set(); await dataObjectsStore.refreshDataObjects(selectedClassId.value || undefined)
  } catch (e: any) { toastStore.show(e?.message || 'Batch unpublish failed') }
}

async function handleBatchDelete() {
  const ids = selectedRowIds.value; if (ids.length === 0) return
  if (!confirm(`Delete ${ids.length} object row(s)? This cannot be undone.`)) return
  try {
    const result = await batchActionDataObjects(authStore.config.coreApiUrl, ids, 'delete')
    toastStore.show(`${result.succeeded} deleted, ${result.failed} failed`)
    selectedGroupIds.value = new Set(); await dataObjectsStore.refreshDataObjects(selectedClassId.value || undefined)
  } catch (e: any) { toastStore.show(e?.message || 'Batch delete failed') }
}

async function handleBatchResolveAssets() {
  const ids = selectedRowIds.value; if (ids.length === 0) return
  try {
    const results = await batchResolveAssets(authStore.config.coreApiUrl, ids)
    const withAssets = Object.values(results).filter((r) => Object.keys(r).length > 0).length
    toastStore.show(`Checked ${Object.keys(results).length} object(s), ${withAssets} have asset references`)
  } catch (e: any) { toastStore.show(e?.message || 'Asset resolution failed') }
}

function classLabel(classId: string): string {
  return dataClassesStore.classes.find((c) => c.id === classId)?.label || classId
}

const selectedDataClass = computed(() => dataClassesStore.classes.find((c) => c.id === selectedClassId.value) || null)
const filterableFields = computed(() => selectedDataClass.value?.fields ?? [])
const filterFields = computed(() => [
  { name: 'key', title: 'Key', fieldType: 'input' },
  { name: 'path', title: 'Path', fieldType: 'input' },
  { name: 'locale', title: 'Locale', fieldType: 'input' },
  { name: 'published', title: 'Published', fieldType: 'checkbox' },
  { name: 'workflowState', title: 'Workflow Status', fieldType: 'input' },
  { name: 'updatedAt', title: 'Updated At', fieldType: 'date' },
  ...filterableFields.value,
])

const fieldMap = computed(() => {
  const map = new Map<string, ClassFieldDefinition>()
  for (const f of filterFields.value) map.set(f.name, f)
  return map
})

function filterInputType(fieldName: string): 'text' | 'number' | 'date' | 'checkbox' | 'select' {
  const field = fieldMap.value.get(fieldName)
  if (!field) return 'text'
  const ft = field.fieldType
  if (ft === 'numeric' || ft === 'slider' || ft === 'range') return 'number'
  if (ft === 'date' || ft === 'datetime') return 'date'
  if (ft === 'checkbox') return 'checkbox'
  if (ft === 'select' && field.options && field.options.length > 0) return 'select'
  return 'text'
}

function filterFieldOptions(fieldName: string): string[] {
  return fieldMap.value.get(fieldName)?.options ?? []
}

function addQueryFilter() {
  const firstField = filterFields.value[0]
  queryFilters.value.push({ field: firstField?.name ?? 'key', operator: 'contains', value: '' })
}

function clearQueryFilters() { queryFilters.value = [] }

// Asset thumbnails
const ASSET_FIELD_TYPES = new Set(['image', 'video', 'asset'])

function isAssetField(field: ClassFieldDefinition): boolean {
  return ASSET_FIELD_TYPES.has(field.fieldType)
}

function recordAssetUrl(record: ObjectRecord, fieldName: string): string | undefined {
  const value = record.primary.attributes?.[fieldName]
  if (value == null) return undefined
  // Asset reference object { assetId: "..." }
  if (typeof value === 'object') {
    const assetId = (value as Record<string, unknown>).assetId
    if (typeof assetId === 'string') {
      // UUID → look up the pimcorePath from the DAM store and resolve fresh
      if (assetId.includes('-')) {
        const asset = damStore.assets.find((a) => a.id === assetId)
        if (asset) return resolveAssetPathUrl(asset.pimcorePath)
        return undefined
      }
      // Raw path → resolve via DAM API
      return resolveAssetPathUrl(assetId)
    }
  }
  // Plain string path → resolve via DAM API
  if (typeof value === 'string') return resolveAssetPathUrl(value)
  return undefined
}

// Reactive cache for asset path → URL resolution, shared across the view.
// Refreshed on each call if the cache is stale (avoids the module-level
// resolveDisplayUrl cache which may have stale null entries from restarts).
const _assetUrlCache = new Map<string, string | undefined>()
const _assetUrlInFlight = new Set<string>()

function resolveAssetPathUrl(path: string): string | undefined {
  if (_assetUrlCache.has(path)) return _assetUrlCache.get(path)
  if (!_assetUrlInFlight.has(path)) {
    _assetUrlInFlight.add(path)
    damStore.generateAssetUrl(path).then((fresh) => {
      _assetUrlCache.set(path, fresh.url)
    }).catch(() => {
      _assetUrlCache.set(path, undefined)
    }).finally(() => {
      _assetUrlInFlight.delete(path)
    })
  }
  return undefined
}

// Preset management
function applyPreset(preset: ObjectListPreset) {
  activeColumnNames.value = [...preset.columns]
}

function saveCurrentAsPreset() {
  if (!selectedClassId.value || activeColumnNames.value.length === 0) return
  const name = prompt('Name this view:')
  if (!name || !name.trim()) return
  presets.value = upsertObjectListPreset(selectedClassId.value, { name: name.trim(), columns: [...activeColumnNames.value] })
  toastStore.show('Preset saved')
}

function updateCurrentPreset() {
  if (!activePreset.value || !selectedClassId.value) return
  presets.value = upsertObjectListPreset(selectedClassId.value, { ...activePreset.value, columns: [...activeColumnNames.value] })
  toastStore.show(`"${activePreset.value.name}" updated`)
}

function removePreset(name: string) {
  if (!selectedClassId.value) return
  presets.value = deleteObjectListPreset(selectedClassId.value, name)
}

function setDefaultPresetAction(name: string) {
  if (!selectedClassId.value) return
  presets.value = setDefaultPreset(selectedClassId.value, name)
  toastStore.show(`"${name}" is now the default view`)
}

const TOP_LEVEL_FILTER_FIELDS = new Set(['key', 'path', 'locale', 'published', 'workflowState', 'updatedAt'])

function matchObjectFilter(obj: DataObject, f: DataObjectQueryFilter): boolean {
  const value = TOP_LEVEL_FILTER_FIELDS.has(f.field) ? (obj as any)[f.field] : (obj.attributes as any)?.[f.field]
  switch (f.operator) {
    case 'eq': return value === f.value
    case 'neq': return value !== f.value
    case 'contains': return String(value ?? '').toLowerCase().includes(String(f.value ?? '').toLowerCase())
    case 'gt': {
      const nv = Number(value); const nf = Number(f.value)
      if (!isNaN(nv) && !isNaN(nf)) return nv > nf
      const dv = new Date(value as any); const df = new Date(f.value as any)
      if (!isNaN(dv.getTime()) && !isNaN(df.getTime())) return dv.getTime() > df.getTime()
      return false
    }
    case 'lt': {
      const nv = Number(value); const nf = Number(f.value)
      if (!isNaN(nv) && !isNaN(nf)) return nv < nf
      const dv = new Date(value as any); const df = new Date(f.value as any)
      if (!isNaN(dv.getTime()) && !isNaN(df.getTime())) return dv.getTime() < df.getTime()
      return false
    }
    default: return true
  }
}

function formatListValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.map(formatListValue).join(', ')
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if ('assetId' in obj) return String(obj.assetId)
    if ('id' in obj) return String(obj.id)
    if ('key' in obj) return String(obj.key)
    return JSON.stringify(obj)
  }
  return String(value)
}

function handleClassChange() {
  queryFilters.value = []
  currentPage.value = 1
  isColumnsMenuOpen.value = false
  activeColumnNames.value = []
  sortField.value = 'key'
  sortDir.value = 'asc'
  presets.value = selectedClassId.value ? loadObjectListPresets(selectedClassId.value) : []
  if (selectedClassId.value) {
    const defaultPreset = getDefaultPreset(selectedClassId.value)
    if (defaultPreset) activeColumnNames.value = [...defaultPreset.columns]
  }
  dataObjectsStore.refreshDataObjects(selectedClassId.value || undefined)
}

interface ObjectRecord {
  translationGroupId: string
  primary: DataObject
  rows: DataObject[]
}

const groupedRecords = computed<ObjectRecord[]>(() => {
  const groups = new Map<string, DataObject[]>()
  for (const obj of dataObjectsStore.objects) {
    const existing = groups.get(obj.translationGroupId)
    if (existing) existing.push(obj)
    else groups.set(obj.translationGroupId, [obj])
  }
  return [...groups.entries()].map(([translationGroupId, rows]) => ({ translationGroupId, primary: rows[0], rows }))
})

const filteredRecords = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const activeFilters = queryFilters.value.filter((f) => String(f.value ?? '').trim() !== '')
  return groupedRecords.value.filter((record) => {
    if (query && !record.rows.some((row) => row.key.toLowerCase().includes(query) || row.path.toLowerCase().includes(query))) return false
    if (activeFilters.length === 0) return true
    return record.rows.some((row) => activeFilters.every((f) => matchObjectFilter(row, f)))
  })
})

function recordSortValue(record: ObjectRecord, field: string): unknown {
  if (field === 'key') return record.primary.key
  if (field === 'locales') return record.rows.map((r) => r.locale).join(',')
  if (field === 'class') return classLabel(record.primary.classId)
  if (field === 'status') return record.primary.published ? 1 : 0
  if (field === 'updatedAt') return new Date(record.primary.updatedAt).getTime()
  return record.primary.attributes?.[field]
}

const sortedRecords = computed(() => {
  const field = sortField.value
  const dir = sortDir.value
  return [...filteredRecords.value].sort((a, b) => {
    const va = recordSortValue(a, field)
    const vb = recordSortValue(b, field)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    let cmp = 0
    if (typeof va === 'string' && typeof vb === 'string') cmp = va.localeCompare(vb)
    else if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb
    else cmp = String(va).localeCompare(String(vb))
    return dir === 'asc' ? cmp : -cmp
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(sortedRecords.value.length / pageSize.value)))

const pagedRecords = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return sortedRecords.value.slice(start, start + pageSize.value)
})

const pageRangeLabel = computed(() => {
  if (sortedRecords.value.length === 0) return '0 of 0'
  const start = (currentPage.value - 1) * pageSize.value + 1
  const end = Math.min(sortedRecords.value.length, currentPage.value * pageSize.value)
  return `${start}-${end} of ${sortedRecords.value.length}`
})

watch([searchQuery, queryFilters, pageSize], () => { currentPage.value = 1 }, { deep: true })

watch(totalPages, (pages) => { if (currentPage.value > pages) currentPage.value = pages })

watch(() => tabsStore.activeTabId, (activeId) => {
  if (activeId === sectionTabId('objects')) dataObjectsStore.refreshDataObjects(selectedClassId.value || undefined)
})

function openRecord(record: ObjectRecord) {
  tabsStore.openObject(record.translationGroupId, record.primary.classId, record.primary.locale)
}

function handleCreate() {
  if (!selectedClassId.value) return
  tabsStore.openObject(`new:${randomUUID()}`, selectedClassId.value, 'en')
}

async function handleDelete(record: ObjectRecord) {
  if (!confirm(`Delete "${record.primary.key}" and all its locale rows? This cannot be undone.`)) return
  try {
    await Promise.all(record.rows.map((row) => dataObjectsStore.deleteDataObject(row.id)))
    tabsStore.closeObjectTab(record.translationGroupId)
  } catch (e: any) { toastStore.show(e?.message || 'Failed to delete object') }
}

function flattenRecordForExport(record: ObjectRecord): Record<string, unknown> {
  const row: Record<string, unknown> = {
    key: record.primary.key, path: record.primary.path, class: classLabel(record.primary.classId),
    locales: record.rows.map((r) => r.locale).join(','), published: record.primary.published,
    workflowState: record.primary.workflowState ?? '', updatedAt: record.primary.updatedAt,
  }
  for (const field of filterableFields.value) row[field.name] = record.primary.attributes?.[field.name] ?? ''
  return row
}

function handleExport(format: 'csv' | 'xlsx' | 'json') {
  isExportMenuOpen.value = false
  const rows = sortedRecords.value.map(flattenRecordForExport)
  if (rows.length === 0) { toastStore.show('Nothing to export'); return }
  const filenameBase = `data-objects-${new Date().toISOString().slice(0, 10)}`
  if (format === 'csv') exportRowsAsCsv(rows, filenameBase)
  else if (format === 'xlsx') exportRowsAsXlsx(rows, filenameBase)
  else exportRowsAsJson(rows, filenameBase)
}
</script>