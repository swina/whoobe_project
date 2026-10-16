<template>
  <div class="flex flex-col h-full min-h-0 gap-6 p-1">
    <!--<div class="shrink-0 flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold text-slate-100 light:text-slate-900">Data Objects</h2>
        <p class="text-xs text-slate-400 light:text-slate-600">Whoobe CMS data objects, backed by admin-defined classes. Migrated from Pimcore or authored directly.</p>
      </div>
      <button
        v-if="selectedClassId"
        @click="handleCreate"
        class="btn btn-primary"
      >
        + Create {{ classLabel(selectedClassId) }}
      </button>
    </div>
    -->
    <div class="shrink-0 flex flex-col gap-3 p-4 rounded-xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200">
      <div class="flex flex-col sm:flex-row gap-4 items-center">
        <label class="bg-slate-800 light:bg-slate-300 text-slate-300 light:text-slate-700 px-3 py-2 rounded-lg">{{ classLabel(selectedClassId) }}</label>
        <input v-model="searchQuery" type="text" placeholder="Filter by key or path..."
          class="field flex-1" />
        <button
        v-if="selectedClassId"
        @click="handleCreate"
        class="btn btn-primary"
      >
        + Create {{ classLabel(selectedClassId) }}
      </button>
        <select v-model="selectedClassId" @change="handleClassChange"
          class="field">
          <option value="">All Classes</option>
          <option v-for="dataClass in dataClassesStore.classes" :key="dataClass.id" :value="dataClass.id">{{ dataClass.label }}</option>
        </select>

        <div v-if="selectedDataClass" class="relative">
          <button @click="isColumnsMenuOpen = !isColumnsMenuOpen"
            class="px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 hover:border-indigo-500 transition"
            :class="activeColumnNames.length > 0 ? 'border-indigo-500 text-indigo-400' : ''">
            View ▾
          </button>
          <!-- Columns view menu -->
          <div v-if="isColumnsMenuOpen"
            class="absolute right-0 mt-1 w-72 rounded-lg bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 shadow-xl z-1000 p-3 space-y-3">
            <div class="space-y-1">
              <span class="text-[10px] font-semibold text-slate-500 uppercase">Columns</span>
              <div class="flex flex-col gap-1 max-h-60 overflow-y-auto">
                <div v-for="(col, idx) in displayColumns" :key="col.name"
                  class="flex items-center gap-1.5 text-xs text-slate-300 light:text-slate-700 group">
                  <button @click="moveColumn(col.name, -1)" :disabled="idx === 0"
                    class="btn btn-link-muted shrink-0" title="Move up">
                    <ChevronUp class="w-3 h-3" />
                  </button>
                  <button @click="moveColumn(col.name, 1)" :disabled="idx === displayColumns.length - 1"
                    class="btn btn-link-muted shrink-0" title="Move down">
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
                class="btn btn-link">
                + Save preset
              </button>
              <button v-if="activePreset" @click="updateCurrentPreset"
                class="btn btn-link-success"
                :title="'Update &quot;' + activePreset.name + '&quot;'">
                Update
              </button>
            </div>
            <div v-if="classListColumns.length > 0" class="pt-1 border-t border-slate-800 light:border-slate-200">
              <button @click="applyClassListColumns" type="button"
                class="text-xs text-slate-400 hover:text-indigo-300"
                title="Re-apply the columns defined in the class editor's List Layout tab">
                Use class default listing
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
                    title="Set as default" class="btn btn-link">Default</button>
                  <button @click.stop="removePreset(preset.name)" type="button"
                    class="btn btn-link-danger shrink-0">×</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- View: compact list or spreadsheet-like table -->
        <div class="inline-flex rounded-lg border border-slate-800 light:border-slate-200 overflow-hidden" role="group" aria-label="View mode" data-testid="objects-view-mode">
          <button type="button" @click="setViewMode('list')" title="List view" aria-label="List view" :aria-pressed="!isTable"
            class="px-2.5 py-2 text-sm inline-flex items-center transition"
            :class="!isTable ? 'bg-indigo-600 text-white' : 'bg-slate-950 light:bg-slate-50 text-slate-400 light:text-slate-600 hover:text-slate-200'">
            <LayoutList class="w-4 h-4" />
          </button>
          <button type="button" @click="setViewMode('table')" title="Table view" aria-label="Table view" :aria-pressed="isTable"
            class="px-2.5 py-2 text-sm inline-flex items-center transition border-l border-slate-800 light:border-slate-200"
            :class="isTable ? 'bg-indigo-600 text-white' : 'bg-slate-950 light:bg-slate-50 text-slate-400 light:text-slate-600 hover:text-slate-200'">
            <Table2 class="w-4 h-4" />
          </button>
        </div>
        <button v-if="selectedDataClass" @click="showFilterModal = true"
          class="px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 hover:border-indigo-500 transition inline-flex items-center gap-1.5"
          :class="queryFilters.length > 0 ? 'border-indigo-500 text-indigo-400' : ''">
          <Filter class="w-4 h-4" /> Filter{{ queryFilters.length > 0 ? ` (${queryFilters.length})` : '' }}
        </button>
        <!-- Refresh: reload the list from the server (useful while a big import is running) -->
        <button type="button" @click="fetchObjects" :disabled="isLoading" title="Refresh the list" aria-label="Refresh the list" data-testid="objects-refresh"
          class="px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 hover:border-indigo-500 transition inline-flex items-center gap-1.5 disabled:opacity-60">
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isLoading }" /> Refresh
        </button>
        <button v-if="selectedDataClass" type="button" @click="showEmptyModal = true" title="Delete every object of this class" data-testid="objects-empty"
          class="px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-rose-400 hover:border-rose-500 transition inline-flex items-center gap-1.5">
          <Trash2 class="w-4 h-4" /> Empty data
        </button>
        <EmptyClassModal v-if="showEmptyModal && selectedDataClass" :data-class="selectedDataClass" @close="showEmptyModal = false" @emptied="fetchObjects" />
        <!-- Export -->
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
    <p v-if="!selectedClassId" class="shrink-0 text-xs text-slate-500 -mt-2">Select a class above to create a new object.</p>

    <div v-if="selectedRowIds.length > 0"
      class="shrink-0 absolute bottom-0 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-indigo-900 light:bg-indigo-50 border border-indigo-700/50 light:border-indigo-200 z-1000">
      <span class="text-xs font-semibold text-indigo-200 light:text-indigo-700">{{ selectedRowIds.length }} selected</span>
      <button @click="handleBatchPublish"
        class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white">Publish</button>
      <button @click="handleBatchUnpublish"
        class="btn btn-warning">Unpublish</button>
      <button @click="handleBatchDelete"
        class="btn btn-danger">Delete</button>
      <button @click="handleBatchResolveAssets"
        class="btn btn-secondary">Resolve assets</button>
      <button @click="selectedGroupIds = new Set()"
        class="btn btn-link-muted ml-auto">Clear</button>
    </div>

    <div v-if="isLoading && objects.length === 0"
      class="shrink-0 p-12 text-center text-xs text-slate-500">Loading objects…</div>

    <div v-else-if="sortedRecords.length === 0"
      class="shrink-0 rounded-2xl bg-slate-900/40 light:bg-white/40 border border-slate-800/80 light:border-slate-200/80 p-12 text-center text-xs text-slate-500">
      No objects yet. Run the migration tool's `migrate-objects` command to import from Pimcore, or author a class and its objects directly.
    </div>

    <div v-else
      class="flex flex-col flex-1 min-h-0 rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 overflow-hidden">

      <!-- One scroll container for header and rows: the table view can be wider than the screen and both scroll together -->
      <div class="flex-1 min-h-0 overflow-auto" data-testid="objects-grid" :data-view="viewMode">
        <div :style="{ minWidth: gridMinWidth }">

          <!-- Sticky header -->
          <div
            class="sticky top-0 z-10 grid text-xs uppercase text-slate-400 light:text-slate-600 border-b border-slate-800 light:border-slate-200"
            :class="isTable ? 'bg-slate-900 light:bg-slate-100' : 'bg-slate-950/70 light:bg-white/70'"
            :style="{ gridTemplateColumns: gridTemplateCols }">
            <div v-if="isTable" class="px-2 py-1.5 text-center border-r border-slate-800 light:border-slate-200">#</div>
            <div class="flex items-center" :class="isTable ? 'px-2 py-1.5 justify-center border-r border-slate-800 light:border-slate-200' : 'px-3 py-2 w-10 shrink-0'">
              <input type="checkbox" :checked="allPageSelected()" @change="toggleSelectAll"
                class="w-4 h-4 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600" />
            </div>
            <div v-for="col in visibleColumns" :key="col.name" @click="toggleSort(col.name)"
              class="relative font-semibold cursor-pointer hover:text-slate-200 select-none whitespace-nowrap truncate"
              :class="isTable ? 'px-2 py-1.5 border-r border-slate-800 light:border-slate-200' : 'px-4 py-2'">
              {{ col.title }}
              <span v-if="sortField === col.name" class="ml-1">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
              <!-- drag to resize, double click to reset (table view) -->
              <span v-if="isTable" class="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-500/60 touch-none"
                title="Drag to resize, double click to reset" @click.stop @pointerdown.stop.prevent="startResize($event, col.name)" @dblclick.stop="resetColWidth(col.name)"></span>
            </div>
          </div>

          <!-- Rows -->
          <div :class="isTable ? '' : 'divide-y divide-slate-800/60 light:divide-slate-200/60'">
            <div v-for="(record, rowIdx) in pagedRecords" :key="record.translationGroupId"
              class="grid hover:bg-slate-800/40 transition text-slate-300 light:text-slate-700"
              :class="isTable
                ? 'text-xs border-b border-slate-800 light:border-slate-200 odd:bg-slate-900/30 light:odd:bg-white light:even:bg-slate-50 light:hover:bg-indigo-50'
                : 'text-sm light:bg-slate-100/40'"
              :style="{ gridTemplateColumns: gridTemplateCols }"
              @contextmenu.prevent="openContextMenu($event, record)">
              <div v-if="isTable" class="px-2 py-0.5 flex items-center justify-center text-[11px] tabular-nums text-slate-500 bg-slate-900/60 light:bg-slate-100 border-r border-slate-800 light:border-slate-200 select-none"
                title="Right click: Edit / Delete">{{ rowNumberOffset + rowIdx + 1 }}</div>
              <div class="flex items-center"
                :class="isTable ? 'px-2 py-0.5 justify-center border-r border-slate-800 light:border-slate-200' : 'px-3 py-1 w-10 shrink-0'" @click.stop>
                <input type="checkbox" :checked="selectedGroupIds.has(record.translationGroupId)"
                  @change="toggleSelectGroup(record.translationGroupId)"
                  class="w-4 h-4 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600" />
              </div>
              <div v-for="col in visibleColumns" :key="col.name" @dblclick="startEdit(record, col.name)"
                class="flex items-center overflow-hidden"
                :class="[
                  isTable ? 'px-2 py-0.5 border-r border-slate-800 light:border-slate-200' : 'px-4 py-1',
                  col.name === 'key' ? 'font-medium text-slate-200 light:text-slate-800' : 'text-slate-400 light:text-slate-600',
                  cellErrors.has(`${record.primary.id}:${col.name}`) ? 'ring-1 ring-inset ring-rose-500/70 bg-rose-500/10' : isCellDirty(record, col.name) ? 'ring-1 ring-inset ring-amber-500/50 bg-amber-500/10' : ''
                ]"
                :title="cellErrors.get(`${record.primary.id}:${col.name}`)">
                <!-- table view: a cell being edited -->
                <template v-if="editing && editing.rowId === record.primary.id && editing.col === col.name">
                  <select v-if="editKind(col.name) === 'select'" data-cell-editor v-model="editText" @change="commitEdit(record, col.name)" @blur="commitEdit(record, col.name)" @keydown.esc="cancelEdit"
                    class="w-full bg-slate-950 light:bg-white border border-indigo-500 rounded px-1 py-0 text-xs text-slate-200 light:text-slate-800">
                    <option value="">—</option>
                    <option v-for="opt in classFieldByName(col.name)?.options ?? []" :key="opt" :value="opt">{{ opt }}</option>
                  </select>
                  <input v-else data-cell-editor v-model="editText"
                    :type="editKind(col.name) === 'number' ? 'number' : editKind(col.name) === 'date' ? 'date' : 'text'"
                    @keydown.enter.prevent="commitEdit(record, col.name)" @keydown.esc="cancelEdit" @blur="commitEdit(record, col.name)"
                    class="w-full bg-slate-950 light:bg-white border border-indigo-500 rounded px-1 py-0 text-xs text-slate-200 light:text-slate-800" />
                </template>
                <input v-else-if="editKind(col.name) === 'checkbox'" type="checkbox" :checked="!!cellValue(record, col.name)"
                  @change="setDraft(record, col.name, ($event.target as HTMLInputElement).checked)"
                  class="w-4 h-4 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600" />
                <template v-else-if="isTable && editKind(col.name) && col.name !== 'key'">
                  <span class="truncate" :title="String(cellValue(record, col.name) ?? '')">{{ cellValue(record, col.name) ?? '' }}</span>
                </template>
                <template v-else>
                <template v-if="col.name === 'key'">
                  <!-- one line: the path follows the key (in the table only as a tooltip, the key column stays short) -->
                  <div class="flex items-baseline gap-2 min-w-0 w-full" :title="record.primary.path">
                    <span class="truncate shrink-0 max-w-[70%]">{{ cellValue(record, 'key') }}</span>
                    <span v-if="!isTable" class="text-xs text-slate-500 font-mono truncate">{{ record.primary.path }}</span>
                  </div>
                </template>
                <template v-else-if="col.name === 'locales'">
                  <div class="flex gap-1 overflow-hidden">
                    <span v-for="row in record.rows" :key="row.locale"
                      class="px-2 text-[10px] font-bold rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 uppercase">{{ row.locale }}</span>
                  </div>
                </template>
                <template v-else-if="col.name === 'class'">
                  <span
                    class="truncate px-2 text-xs bg-slate-800 light:bg-slate-100 rounded font-mono text-indigo-300">{{ classLabel(record.primary.classId) }}</span>
                </template>
                <template v-else-if="col.name === 'status'">
                  <span :class="[
                    'truncate px-2 text-[10px] font-bold rounded-full border uppercase',
                    record.primary.published ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  ]">{{ record.primary.published ? 'published' : (record.primary.workflowState || 'draft') }}</span>
                </template>
                <template v-else-if="col.name === 'updatedAt'">
                  <span class="truncate">{{ new Date(record.primary.updatedAt).toLocaleString() }}</span>
                </template>
                <template v-else>
                  <img
                    v-if="classFieldByName(col.name) && isAssetField(classFieldByName(col.name)!) && recordAssetUrl(record, col.name)"
                    :src="recordAssetUrl(record, col.name)!"
                    class="rounded object-cover border border-slate-700/50 bg-slate-800 shrink-0"
                    :class="isTable ? 'w-5 h-5' : 'w-7 h-7'"
                    :title="col.title"
                    @error="($event.target as HTMLImageElement).style.display = 'none'"
                  />
                  <span v-else class="truncate" :title="isTable ? listCellValue(record, col.name) : undefined">{{ listCellValue(record, col.name) }}</span>
                </template>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Unsaved cell edits (table view): saved only when asked -->
      <div v-if="drafts.size > 0"
        class="shrink-0 flex items-center gap-3 px-4 py-2 border-t border-amber-500/40 bg-amber-500/10 text-xs text-amber-200 light:text-amber-800" data-testid="objects-save-bar">
        <span>{{ drafts.size }} row{{ drafts.size === 1 ? '' : 's' }} with unsaved changes</span>
        <button type="button" class="btn btn-link-muted btn-compact" :disabled="isSaving" @click="discardDrafts">Discard</button>
        <div class="relative ml-auto">
          <button type="button" class="btn btn-primary btn-compact" :disabled="isSaving" data-testid="objects-save-menu"
            @click.stop="isSaveMenuOpen = !isSaveMenuOpen">{{ isSaving ? 'Saving…' : 'Save changes ▾' }}</button>
          <div v-if="isSaveMenuOpen" @click.stop
            class="absolute right-0 bottom-full mb-1 w-44 rounded-lg bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 shadow-xl z-20 overflow-hidden">
            <button type="button" data-testid="objects-save" @click="saveDrafts(false)"
              class="block w-full text-left px-3 py-2 text-xs text-slate-300 light:text-slate-700 hover:bg-slate-800 light:hover:bg-slate-100">Save</button>
            <button type="button" data-testid="objects-save-publish" @click="saveDrafts(true)"
              class="block w-full text-left px-3 py-2 text-xs text-slate-300 light:text-slate-700 hover:bg-slate-800 light:hover:bg-slate-100">Save &amp; Publish</button>
          </div>
        </div>
      </div>

      <!-- Sticky Pagination Footer -->
      <div
        class="sticky bottom-0 z-10 flex items-center justify-between px-4 py-3 border-t border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-white/40">
        <div class="flex items-center gap-2 text-xs text-slate-400 light:text-slate-600">
          <span>Rows per page:</span>
          <select v-model="pageSize"
            class="field">
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="all">All</option>
            <option value="custom">Custom...</option>
          </select>
          <input v-if="pageSize === 'custom'" v-model.number="customPageSize" type="number" min="1"
            class="field w-16"
            placeholder="Rows" />
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
    <BaseModal v-if="showFilterModal && selectedDataClass" :open="true" size="lg" @close="showFilterModal = false">
      <template #header>
        <h2 class="ui-modal-title flex items-center gap-2">Filter {{ selectedDataClass.label }} objects</h2>
      </template>
      <div class="space-y-4">
            <div class="min-h-0 p-3 space-y-2">
          <div class="text-[10px] text-gray-400 mb-1">Filters (all must match)</div>
          <div v-if="queryFilters.length === 0" class="text-xs text-gray-400 text-center py-4">No filters — shows all objects of this class.</div>
          <div v-for="(f, i) in queryFilters" :key="i" class="flex items-center gap-2">
            <select v-model="f.field" @change="onFilterFieldChange(f)" class="text-xs border rounded px-2 py-1 min-w-[7rem]">
              <option v-for="ff in filterFields" :key="ff.name" :value="ff.name">{{ ff.title || ff.name }}</option>
            </select>
            <select v-if="filterInputType(f.field) !== 'relation'" v-model="f.operator" class="text-xs border rounded px-2 py-1">
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
            <template v-else-if="filterInputType(f.field) === 'relation'">
              <div class="relative flex-1">
                <button @click.stop="toggleRelationDropdown(i)"
                  class="w-full px-2 py-1 text-xs border rounded flex items-center gap-1 bg-white"
                  :class="isRelationDropdownOpen === i ? 'border-indigo-500' : 'border-gray-200'">
                  <span class="truncate flex-1 text-left text-gray-500" v-if="!Array.isArray(f.value) || (f.value as string[]).length === 0">Select values...</span>
                  <span class="truncate flex-1 text-left" v-else>{{ (f.value as string[]).length }} selected</span>
                  <ChevronDown class="w-3 h-3 shrink-0 text-gray-400" />
                </button>
                <div v-if="isRelationDropdownOpen === i"
                  class="absolute top-full mt-1 left-0 right-0 z-50 bg-white border border-gray-200 rounded shadow-lg max-h-48 overflow-y-auto">
                  <label v-for="opt in relationFilterOptions(f.field)" :key="opt.id"
                    class="flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" :checked="isRelationSelected(f.field, opt.id)"
                      @change="toggleRelationFilter(f.field, opt.id)"
                      class="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600" />
                    <span class="truncate">{{ relationFilterLabel(f.field, opt) }}</span>
                  </label>
                </div>
              </div>
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
    </BaseModal>
    <!-- Context menu of a row -->
    <div v-if="ctxMenu" class="fixed z-50 w-40 rounded-lg bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 shadow-xl overflow-hidden"
      :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }" role="menu" data-testid="objects-context-menu" @click.stop @contextmenu.prevent>
      <button type="button" role="menuitem" @click="ctxEdit"
        class="block w-full text-left px-3 py-2 text-xs text-slate-300 light:text-slate-700 hover:bg-slate-800 light:hover:bg-slate-100">Edit</button>
      <button type="button" role="menuitem" data-testid="objects-ctx-copy-id" @click="ctxCopyId" title="The id to use in /client/v1/data/&lt;Class&gt;/&lt;id&gt;"
        class="block w-full text-left px-3 py-2 text-xs text-slate-300 light:text-slate-700 hover:bg-slate-800 light:hover:bg-slate-100">Copy id</button>
      <button type="button" role="menuitem" @click="ctxDelete"
        class="block w-full text-left px-3 py-2 text-xs text-rose-400 hover:bg-slate-800 light:hover:bg-slate-100">Delete</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import BaseModal from '../components/ui/BaseModal.vue'
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { ChevronUp, ChevronDown, Filter, LayoutList, Plus, RefreshCw, Table2, Trash2, X } from '@lucide/vue'
import { useDataClassesStore } from '../stores/dataClassesStore'
import { useDamStore } from '../stores/damStore'
import { useTabsStore } from '../stores/tabsStore'
import { useToastStore } from '../stores/toastStore'
import { useAuthStore } from '../stores/authStore'
import type { DataObject } from '../utils/data-objects-api'
import { fetchDataObjects, deleteDataObject as apiDeleteDataObject, updateDataObject as apiUpdateDataObject, batchActionDataObjects, batchResolveAssets } from '../utils/data-objects-api'
import type { DataObjectQueryFilter } from '../utils/data-objects-api'
import EmptyClassModal from '../components/objects/EmptyClassModal.vue'
import { exportRowsAsCsv, exportRowsAsJson, exportRowsAsXlsx } from '../utils/data-export'
import { useRelationOptions } from '../composables/useRelationOptions'
import { loadObjectListPresets, upsertObjectListPreset, deleteObjectListPreset, setDefaultPreset, getDefaultPreset, type ObjectListPreset } from '../utils/object-list-presets'
import { SYSTEM_LIST_COLUMNS, type ListColumnOption } from '../utils/list-columns'
import { fetchAssetById } from '../utils/dam-api'
import type { ClassFieldDefinition } from '@whoobe-cms/core'
import { randomUUID } from '../utils/random-id'

const props = withDefaults(defineProps<{ classId?: string }>(), { classId: '' })
const dataClassesStore = useDataClassesStore()
const damStore = useDamStore()
const tabsStore = useTabsStore()
const toastStore = useToastStore()
const authStore = useAuthStore()

// Each ObjectsView instance owns its own object list — class list tabs
// each get their own instance (v-show keeps them alive), so sharing a
// global store would mix data between classes.
const objects = ref<DataObject[]>([])
const isLoading = ref(false)

const searchQuery = ref('')
const selectedClassId = ref(props.classId)
const isExportMenuOpen = ref(false)
const showEmptyModal = ref(false)
const isColumnsMenuOpen = ref(false)
const activeColumnNames = ref<string[]>([])
const presets = ref<ObjectListPreset[]>([])
const pageSize = ref<number | 'all' | 'custom'>(25)
const customPageSize = ref(50)
const currentPage = ref(1)
const sortField = ref<string>('key')
const sortDir = ref<'asc' | 'desc'>('asc')

const showFilterModal = ref(false)
const queryFilters = ref<DataObjectQueryFilter[]>([])

// System columns always available in the view config - shared vocabulary
// with the class editor's List Layout tab (utils/list-columns.ts).
type ColumnOption = ListColumnOption
const SYSTEM_COLUMNS = SYSTEM_LIST_COLUMNS

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

// List: the compact rows of the dashboard. Table: a spreadsheet look (cell borders, row numbers, one line per row, resizable columns
// that never get narrower than MIN_COL_PX, the whole grid scrolls sideways when they do not fit, cells can be edited in place).
// The choice is remembered per class and browser; without one, the class's own default applies (Class > List Layout > "Set Table view
// as default", viewConfig.defaultListView).
type ViewMode = 'list' | 'table'
const VIEW_MODE_KEY = 'whoobe.objects.viewMode'
const COL_WIDTHS_KEY = 'whoobe.objects.colWidths'
const TABLE_MIN_COL = '9rem'
const MIN_COL_PX = 64
function readStored(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeStored(key: string, value: string | null): void {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value) } catch { /* private window: just not remembered */ }
}
const savedViewMode = ref<ViewMode | null>(null)
const colWidths = ref<Record<string, number>>({})
watch(selectedClassId, (classId) => {
  const saved = classId ? readStored(`${VIEW_MODE_KEY}.${classId}`) : null
  savedViewMode.value = saved === 'table' || saved === 'list' ? saved : null
  let widths: Record<string, number> = {}
  try { widths = classId ? JSON.parse(readStored(`${COL_WIDTHS_KEY}.${classId}`) ?? '{}') : {} } catch { widths = {} }
  colWidths.value = widths && typeof widths === 'object' ? widths : {}
}, { immediate: true })
const viewMode = computed<ViewMode>(() => savedViewMode.value ?? (selectedDataClass.value?.viewConfig?.defaultListView === 'table' ? 'table' : 'list'))
const isTable = computed(() => viewMode.value === 'table')
function setViewMode(mode: ViewMode): void {
  savedViewMode.value = mode
  if (selectedClassId.value) writeStored(`${VIEW_MODE_KEY}.${selectedClassId.value}`, mode)
  if (mode === 'list') { editing.value = null; closeContextMenu() }
}

// Column resizing (table view): a handle on the right edge of every header cell; double click resets that column.
function colTrack(name: string): string {
  const w = colWidths.value[name]
  return w ? `${w}px` : `minmax(${TABLE_MIN_COL}, 1fr)`
}
function startResize(event: PointerEvent, name: string): void {
  const handle = event.currentTarget as HTMLElement
  const startX = event.clientX
  const startW = colWidths.value[name] ?? handle.parentElement!.getBoundingClientRect().width
  handle.setPointerCapture(event.pointerId)
  const move = (e: PointerEvent) => { colWidths.value = { ...colWidths.value, [name]: Math.max(MIN_COL_PX, Math.round(startW + e.clientX - startX)) } }
  const up = () => {
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', up)
    if (selectedClassId.value) writeStored(`${COL_WIDTHS_KEY}.${selectedClassId.value}`, JSON.stringify(colWidths.value))
  }
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', up)
}
function resetColWidth(name: string): void {
  const { [name]: _gone, ...rest } = colWidths.value
  colWidths.value = rest
  if (selectedClassId.value) writeStored(`${COL_WIDTHS_KEY}.${selectedClassId.value}`, JSON.stringify(rest))
}

const gridTemplateCols = computed(() => {
  const cols = visibleColumns.value
  return isTable.value
    ? `3rem 2.25rem ${cols.map((c) => colTrack(c.name)).join(' ')}`
    : `40px repeat(${cols.length}, minmax(0, 1fr))`
})
// the table scrolls sideways instead of squeezing the columns: the grid is never narrower than its tracks
const gridMinWidth = computed(() => {
  if (!isTable.value) return undefined
  const fixed = visibleColumns.value.reduce((sum, c) => sum + (colWidths.value[c.name] ?? 0), 0)
  const flexible = visibleColumns.value.filter((c) => !colWidths.value[c.name]).length
  return `calc(3rem + 2.25rem + ${fixed}px + ${flexible} * ${TABLE_MIN_COL})`
})
const rowNumberOffset = computed(() => (currentPage.value - 1) * effectivePageSize.value)

// Context menu (right click on a row; a long press on touch screens that send contextmenu): the way to open or delete a record.
const ctxMenu = ref<{ x: number; y: number; record: ObjectRecord } | null>(null)
function openContextMenu(event: MouseEvent, record: ObjectRecord): void {
  ctxMenu.value = { x: Math.min(event.clientX, window.innerWidth - 176), y: Math.min(event.clientY, window.innerHeight - 130), record }
}
function closeContextMenu(): void { ctxMenu.value = null; isSaveMenuOpen.value = false }
function ctxEdit(): void { const r = ctxMenu.value?.record; closeContextMenu(); if (r) openRecord(r) }
// The record's id, as an API client writes it in /client/v1/data/<Class>/<id>
async function ctxCopyId(): Promise<void> {
  const r = ctxMenu.value?.record
  closeContextMenu()
  if (!r) return
  const id = r.primary.id
  try {
    await navigator.clipboard.writeText(id)
    toastStore.show(`Id copied: ${id}`)
  } catch {
    // not a secure context (plain http on a non-localhost address): show it so it can be selected by hand
    toastStore.show(`Id: ${id}`)
  }
}
function ctxDelete(): void { const r = ctxMenu.value?.record; closeContextMenu(); if (r) void handleDelete(r) }
function onWindowKey(e: KeyboardEvent): void { if (e.key === 'Escape') closeContextMenu() }
function warnUnsaved(e: BeforeUnloadEvent): void { if (drafts.size > 0) { e.preventDefault(); e.returnValue = '' } }
onMounted(() => {
  window.addEventListener('click', closeContextMenu)
  window.addEventListener('keydown', onWindowKey)
  window.addEventListener('beforeunload', warnUnsaved)
})
onBeforeUnmount(() => {
  window.removeEventListener('click', closeContextMenu)
  window.removeEventListener('keydown', onWindowKey)
  window.removeEventListener('beforeunload', warnUnsaved)
})

// Editing in the cells (table view). Nothing is saved while typing: an edit is a draft per row (drafts, keyed by the id of the shown
// row), shown on a tinted cell; the bar under the table saves them all ("Save") or saves and publishes ("Save & Publish"). The
// server replaces the whole attributes object, so a save sends the stored attributes with the drafts laid over them. Only plain
// field types are editable here (text, number, date, checkbox, select with options); relations, assets, rich text, arrays and
// objects are edited in the record. Only the shown (first) locale row of a record is edited.
interface RowDraft { key?: string; attributes: Record<string, unknown> }
type EditKind = 'text' | 'number' | 'date' | 'checkbox' | 'select'
const drafts = reactive(new Map<string, RowDraft>())
const cellErrors = reactive(new Map<string, string>())
const editing = ref<{ rowId: string; col: string } | null>(null)
const editText = ref('')
const isSaving = ref(false)
const isSaveMenuOpen = ref(false)

function editKind(colName: string): EditKind | null {
  if (!isTable.value) return null
  if (colName === 'key') return 'text'
  const f = classFieldByName(colName)
  if (!f || f.relationTarget) return null
  if (['input', 'textarea', 'email', 'urlSlug'].includes(f.fieldType)) return 'text'
  if (f.fieldType === 'numeric') return 'number'
  if (f.fieldType === 'date') return 'date'
  if (f.fieldType === 'checkbox') return 'checkbox'
  if (f.fieldType === 'select' && f.options && f.options.length > 0) return 'select'
  return null
}
function cellValue(record: ObjectRecord, col: string): unknown {
  const d = drafts.get(record.primary.id)
  if (col === 'key') return d?.key ?? record.primary.key
  if (d && col in d.attributes) return d.attributes[col]
  return record.primary.attributes?.[col]
}
function isCellDirty(record: ObjectRecord, col: string): boolean {
  const d = drafts.get(record.primary.id)
  return !!d && (col === 'key' ? d.key !== undefined : col in d.attributes)
}
function sameValue(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => (v === null || v === undefined || v === '' ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))
  return norm(a) === norm(b)
}
function setDraft(record: ObjectRecord, col: string, value: unknown): void {
  const id = record.primary.id
  const d: RowDraft = drafts.get(id) ?? { attributes: {} }
  const original = col === 'key' ? record.primary.key : record.primary.attributes?.[col]
  if (sameValue(value, original)) {
    if (col === 'key') delete d.key
    else delete d.attributes[col]
  } else if (col === 'key') d.key = String(value ?? '')
  else d.attributes[col] = value
  cellErrors.delete(`${id}:${col}`)
  if (d.key === undefined && Object.keys(d.attributes).length === 0) drafts.delete(id)
  else drafts.set(id, d)
}
function startEdit(record: ObjectRecord, col: string): void {
  const kind = editKind(col)
  if (!kind || kind === 'checkbox') return
  if (editing.value?.rowId === record.primary.id && editing.value.col === col) return
  editing.value = { rowId: record.primary.id, col }
  const v = cellValue(record, col)
  editText.value = v === null || v === undefined ? '' : String(v)
  void nextTick(() => document.querySelector<HTMLElement>('[data-cell-editor]')?.focus())
}
function commitEdit(record: ObjectRecord, col: string): void {
  if (!editing.value || editing.value.rowId !== record.primary.id || editing.value.col !== col) return
  const kind = editKind(col)
  let value: unknown = editText.value
  if (kind === 'number') {
    if (editText.value.trim() === '') value = null
    else {
      value = Number(editText.value)
      if (!Number.isFinite(value as number)) { toastStore.show('That is not a number'); return }
    }
  }
  editing.value = null
  setDraft(record, col, value)
}
function cancelEdit(): void { editing.value = null }
function discardDrafts(): void { drafts.clear(); cellErrors.clear(); editing.value = null; isSaveMenuOpen.value = false }

async function saveDrafts(publish: boolean): Promise<void> {
  if (isSaving.value || drafts.size === 0) return
  isSaving.value = true
  isSaveMenuOpen.value = false
  cellErrors.clear()
  let saved = 0
  let failed = 0
  for (const [rowId, d] of [...drafts.entries()]) {
    const current = objects.value.find((o) => o.id === rowId)
    if (!current) { drafts.delete(rowId); continue }
    try {
      const updated = await apiUpdateDataObject(authStore.config.coreApiUrl, rowId, {
        ...(d.key !== undefined ? { key: d.key } : {}),
        attributes: { ...(current.attributes ?? {}), ...d.attributes },
        ...(publish ? { published: true } : {}),
      })
      objects.value = objects.value.map((o) => (o.id === rowId ? updated : o))
      drafts.delete(rowId)
      saved++
    } catch (e: any) {
      failed++
      const message = e?.message || 'Save failed'
      for (const col of [...(d.key !== undefined ? ['key'] : []), ...Object.keys(d.attributes)]) cellErrors.set(`${rowId}:${col}`, message)
    }
  }
  isSaving.value = false
  const what = publish ? 'saved and published' : 'saved'
  toastStore.show(failed === 0 ? `${saved} row(s) ${what}` : `${saved} ${what}, ${failed} failed - see the marked cells`)
}

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
    selectedGroupIds.value = new Set(); await fetchObjects()
  } catch (e: any) { toastStore.show(e?.message || 'Batch publish failed') }
}

async function handleBatchUnpublish() {
  const ids = selectedRowIds.value; if (ids.length === 0) return
  try {
    const result = await batchActionDataObjects(authStore.config.coreApiUrl, ids, 'unpublish')
    toastStore.show(`${result.succeeded} unpublished, ${result.failed} failed`)
    selectedGroupIds.value = new Set(); await fetchObjects()
  } catch (e: any) { toastStore.show(e?.message || 'Batch unpublish failed') }
}

async function handleBatchDelete() {
  const ids = selectedRowIds.value; if (ids.length === 0) return
  if (!confirm(`Delete ${ids.length} object row(s)? This cannot be undone.`)) return
  try {
    const result = await batchActionDataObjects(authStore.config.coreApiUrl, ids, 'delete')
    toastStore.show(`${result.succeeded} deleted, ${result.failed} failed`)
    selectedGroupIds.value = new Set(); await fetchObjects()
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
const classListColumns = computed(() => selectedDataClass.value?.viewConfig?.listColumns ?? [])
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

const isRelationDropdownOpen = ref<number | null>(null)

function toggleRelationDropdown(index: number) {
  isRelationDropdownOpen.value = isRelationDropdownOpen.value === index ? null : index
}

const relationOptionsByField = computed(() => {
  const map = new Map<string, DataObject[]>()
  if (!selectedDataClass.value) return map
  for (const field of selectedDataClass.value.fields) {
    if (field.relationTarget) {
      const ref = useRelationOptions(field.relationTarget)
      map.set(field.name, ref.value as DataObject[])
    }
  }
  return map
})

function relationFilterOptions(fieldName: string): DataObject[] {
  return relationOptionsByField.value.get(fieldName) ?? []
}

function relationFilterLabel(fieldName: string, opt: DataObject): string {
  const field = fieldMap.value.get(fieldName) as ClassFieldDefinition | undefined
  const displayField = field?.relationDisplayField
  if (displayField) {
    const value = (opt.attributes as Record<string, unknown> | null | undefined)?.[displayField]
    if (value != null && value !== '') return String(value)
  }
  return opt.key || opt.id
}

function isRelationSelected(fieldName: string, id: string): boolean {
  const arr = queryFilters.value.find((f) => f.field === fieldName)?.value
  return Array.isArray(arr) && arr.includes(id)
}

function toggleRelationFilter(fieldName: string, id: string) {
  const f = queryFilters.value.find((ff) => ff.field === fieldName)
  if (!f) return
  const arr: string[] = Array.isArray(f.value) ? [...f.value] : []
  const idx = arr.indexOf(id)
  if (idx >= 0) arr.splice(idx, 1)
  else arr.push(id)
  f.value = arr
  f.operator = 'in'
}

function filterInputType(fieldName: string): 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'relation' {
  const field = fieldMap.value.get(fieldName)
  if (!field) return 'text'
  const ft = field.fieldType
  if (ft === 'numeric' || ft === 'slider' || ft === 'range') return 'number'
  if (ft === 'date' || ft === 'datetime') return 'date'
  if (ft === 'checkbox') return 'checkbox'
  if (ft === 'select' && field.options && field.options.length > 0) return 'select'
  if ((ft === 'select' || ft === 'manyToOneRelation' || ft === 'manyToManyRelation' || ft === 'object' || ft === 'block') && field.relationTarget) return 'relation'
  return 'text'
}

function filterFieldOptions(fieldName: string): string[] {
  return fieldMap.value.get(fieldName)?.options ?? []
}

function addQueryFilter() {
  const firstField = filterFields.value[0]
  if (!firstField) return
  const init: DataObjectQueryFilter = { field: firstField.name ?? 'key', operator: 'contains', value: '' }
  const field = firstField as ClassFieldDefinition
  if (field.relationTarget) {
    init.operator = 'in'
    init.value = []
  } else if (field.fieldType === 'checkbox') {
    init.operator = 'eq'
    init.value = true
  }
  queryFilters.value.push(init)
}

function clearQueryFilters() { queryFilters.value = [] }

// Asset thumbnails
const ASSET_FIELD_TYPES = new Set(['image', 'video', 'asset'])

function isAssetField(field: ClassFieldDefinition): boolean {
  return ASSET_FIELD_TYPES.has(field.fieldType)
}

function recordAssetUrl(record: ObjectRecord, fieldName: string): string | undefined {
  // Dummy read to ensure the template tracks _urlResolveTick as a
  // dependency — this ref is bumped after every async URL fetch so
  // Vue re-evaluates the template even when the reactive Maps don't
  // reliably trigger re-render across re-render boundaries.
  _urlResolveTick.value
  const value = record.primary.attributes?.[fieldName]
  if (value == null) return undefined
  // Asset reference object { assetId: "..." }
  if (typeof value === 'object') {
    const assetId = (value as Record<string, unknown>).assetId
    if (typeof assetId === 'string') {
      // UUID → look up the pimcorePath from the DAM store and resolve fresh.
      // When the asset isn't in the store yet (async load in progress), fall
      // back to fetching it by ID from the backend via resolveAssetIdUrl.
      if (assetId.includes('-')) {
        const asset = damStore.assets.find((a) => a.id === assetId)
        if (asset) return resolveAssetPathUrl(asset.pimcorePath)
        return resolveAssetIdUrl(assetId)
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
// Wrapped in Vue's reactive() so a URL resolved after the initial render
// (e.g. the first request failing transiently right after a server restart)
// still triggers the template to re-render and pick up the fresh URL.
const _assetUrlCache = reactive(new Map<string, string | undefined>())
const _assetUrlInFlight = new Set<string>()
const _assetUrlFailCount = new Map<string, number>()
const ASSET_URL_MAX_RETRIES = 3

// A bump counter incremented whenever any asset URL finishes resolving.
// The template's recordAssetUrl() calls depend on this via the reactive
// Maps above, but Vue 3's tracking of module-level reactive Maps across
// re-renders can be unreliable — this ref forces a re-evaluation.
const _urlResolveTick = ref(0)

function resolveAssetPathUrl(path: string): string | undefined {
  if (_assetUrlCache.has(path)) return _assetUrlCache.get(path)
  if (!_assetUrlInFlight.has(path)) {
    _assetUrlInFlight.add(path)
    damStore.generateAssetUrl(path).then((fresh) => {
      _assetUrlCache.set(path, fresh.url)
      _assetUrlFailCount.delete(path)
      _urlResolveTick.value++
    }).catch(() => {
      const attempts = (_assetUrlFailCount.get(path) ?? 0) + 1
      _assetUrlFailCount.set(path, attempts)
      if (attempts >= ASSET_URL_MAX_RETRIES) {
        _assetUrlCache.set(path, undefined)
        _urlResolveTick.value++
      } else {
        setTimeout(() => resolveAssetPathUrl(path), 1000 * attempts)
      }
    }).finally(() => {
      _assetUrlInFlight.delete(path)
    })
  }
  return undefined
}

// Cache for asset-UUID to URL, mirroring the path-based cache above.
// When an asset references a UUID not yet in damStore.assets (the store
// loads asynchronously and may not include it yet), we fetch the single
// asset from the backend by ID and cache its full-size URL.
const _assetIdUrlCache = reactive(new Map<string, string | undefined>())
const _assetIdUrlInFlight = new Set<string>()
const ASSET_ID_URL_MAX_RETRIES = 3
const _assetIdUrlFailCount = new Map<string, number>()

function resolveAssetIdUrl(assetId: string): string | undefined {
  if (_assetIdUrlCache.has(assetId)) return _assetIdUrlCache.get(assetId)
  if (!_assetIdUrlInFlight.has(assetId)) {
    _assetIdUrlInFlight.add(assetId)
    fetchAssetById(damStore.config.assetProcessorUrl, assetId, damStore.config.folderRules).then((asset) => {
      _assetIdUrlCache.set(assetId, asset.url)
      // Also seed the path-based cache so the next lookup of the same
      // asset via its pimcorePath doesn't need a separate fetch.
      if (asset.pimcorePath) {
        _assetUrlCache.set(asset.pimcorePath, asset.url)
      }
      _urlResolveTick.value++
    }).catch(() => {
      const attempts = (_assetIdUrlFailCount.get(assetId) ?? 0) + 1
      _assetIdUrlFailCount.set(assetId, attempts)
      if (attempts >= ASSET_ID_URL_MAX_RETRIES) {
        _assetIdUrlCache.set(assetId, undefined)
        _urlResolveTick.value++
      } else {
        setTimeout(() => resolveAssetIdUrl(assetId), 1000 * attempts)
      }
    }).finally(() => {
      _assetIdUrlInFlight.delete(assetId)
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
  const raw = TOP_LEVEL_FILTER_FIELDS.has(f.field) ? (obj as any)[f.field] : (obj.attributes as any)?.[f.field]
  const field = fieldMap.value.get(f.field) as ClassFieldDefinition | undefined

  if (field?.relationTarget) {
    // Relation field — the stored value is { id, classId } (single) or
    // [{ id, classId }, ...] (multi). Filter by matching the related
    // object's id against the selected IDs array.
    const selectedIds: string[] = Array.isArray(f.value) ? f.value : []
    if (selectedIds.length === 0) return true
    const ids = relationIds(raw)
    return ids.some((id) => selectedIds.includes(id))
  }

  const value = raw
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

// Reset operator/value when the selected field changes
function onFilterFieldChange(f: DataObjectQueryFilter) {
  const field = fieldMap.value.get(f.field) as ClassFieldDefinition | undefined
  if (field?.relationTarget) {
    f.operator = 'in'
    f.value = []
  } else if (field?.fieldType === 'checkbox') {
    f.operator = 'eq'
    f.value = true
  } else {
    f.operator = 'contains'
    f.value = ''
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

// Relation ids from a stored relation value - `{ id }` for singles, an
// array of `{ id }` for the multi-relation family.
function relationIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => (v && typeof v === 'object' && 'id' in (v as Record<string, unknown>) ? String((v as { id: string }).id) : ''))
      .filter(Boolean)
  }
  if (value && typeof value === 'object' && 'id' in (value as Record<string, unknown>)) return [String((value as { id: string }).id)]
  return []
}

// Cell value for a relation column: resolves each related object and shows
// the field's `relationDisplayField` (class editor's List Layout / View
// Layout tabs) when set, falling back to the object's `key`. Triggers the
// relation-options loader for the target class (cached per class name,
// shared with the form's pickers via useRelationOptions).
function listCellValue(record: ObjectRecord, colName: string): string {
  const field = classFieldByName(colName)
  const raw = record.primary.attributes?.[colName]
  if (field?.relationTarget) {
    const ids = relationIds(raw)
    if (ids.length > 0) {
      const related = useRelationOptions(field.relationTarget).value ?? []
      const displayField = field.relationDisplayField
      return ids
        .map((id) => {
          const target = related.find((o) => o.id === id)
          if (!target) return id
          if (displayField) {
            const value = (target.attributes as Record<string, unknown> | null | undefined)?.[displayField]
            if (value != null && value !== '') return String(value)
          }
          return target.key
        })
        .join(', ')
    }
  }
  return formatListValue(raw)
}

// Local data fetching — each class list tab owns its own object list so
// switching between tabs doesn't mix data from different classes.
async function fetchObjects() {
  if (!selectedClassId.value) {
    objects.value = []
    return
  }
  isLoading.value = true
  try {
    objects.value = await fetchDataObjects(authStore.config.coreApiUrl, selectedClassId.value)
  } catch (e) {
    console.warn('Could not load data objects:', e)
  } finally {
    isLoading.value = false
  }
}

function handleClassChange() {
  if (drafts.size > 0) { toastStore.show(`${drafts.size} row(s) with unsaved edits were discarded`); discardDrafts() }
  queryFilters.value = []
  currentPage.value = 1
  isColumnsMenuOpen.value = false
  activeColumnNames.value = []
  sortField.value = 'key'
  sortDir.value = 'asc'
  presets.value = selectedClassId.value ? loadObjectListPresets(selectedClassId.value) : []
  if (selectedClassId.value) {
    // The class's own List Layout (configured in Settings > Classes > List Layout)
    // is the default. Use it when no user-side default preset exists.
    const classColumns = (selectedDataClass.value?.viewConfig?.listColumns ?? [])
    const known = new Set(allColumnOptions.value.map((c) => c.name))
    const classColumnNames = classColumns.map((c) => c.name).filter((n) => known.has(n))
    if (classColumnNames.length > 0) {
      activeColumnNames.value = classColumnNames
    } else {
      // Fall back to user-side default preset when no class List Layout is set.
      const defaultPreset = getDefaultPreset(selectedClassId.value)
      if (defaultPreset) {
        activeColumnNames.value = [...defaultPreset.columns]
      }
    }
  }
  fetchObjects()
}

// Re-applies the class's List Layout to the current listing (the View ▾
// menu's "Use class default listing" action) - handy after the class
// author changed the default or after a rename dropped a column.
function applyClassListColumns() {
  if (!selectedDataClass.value) return
  const known = new Set(allColumnOptions.value.map((c) => c.name))
  activeColumnNames.value = (selectedDataClass.value.viewConfig?.listColumns ?? [])
    .map((c) => c.name)
    .filter((n) => known.has(n))
}

interface ObjectRecord {
  translationGroupId: string
  primary: DataObject
  rows: DataObject[]
}

const groupedRecords = computed<ObjectRecord[]>(() => {
  const groups = new Map<string, DataObject[]>()
  for (const obj of objects.value) {
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

// Always a finite number: the <select> gives the size as a STRING ("10"), and "10" + 10 is "1010" - page 2 used to show every
// remaining record - while Infinity made the first slice NaN. "All" is the number of records (at least 1).
const effectivePageSize = computed(() => {
  if (pageSize.value === 'all') return Math.max(1, sortedRecords.value.length)
  const n = Math.floor(Number(pageSize.value === 'custom' ? customPageSize.value : pageSize.value))
  return Number.isFinite(n) && n > 0 ? n : 25
})

const totalPages = computed(() => Math.max(1, Math.ceil(sortedRecords.value.length / effectivePageSize.value)))

const pagedRecords = computed(() => {
  const size = effectivePageSize.value
  const start = (currentPage.value - 1) * size
  return sortedRecords.value.slice(start, start + size)
})

const pageRangeLabel = computed(() => {
  if (sortedRecords.value.length === 0) return '0 of 0'
  if (pageSize.value === 'all') return `1-${sortedRecords.value.length} of ${sortedRecords.value.length}`
  const size = effectivePageSize.value
  const start = (currentPage.value - 1) * size + 1
  const end = Math.min(sortedRecords.value.length, currentPage.value * size)
  return `${start}-${end} of ${sortedRecords.value.length}`
})

watch([searchQuery, queryFilters, pageSize], () => { currentPage.value = 1 }, { deep: true })

watch(totalPages, (pages) => { if (currentPage.value > pages) currentPage.value = pages })

// Preload relation filter options when the filter modal opens so the
// multiselect dropdowns are populated immediately.
watch(showFilterModal, (open) => {
  if (!open || !selectedDataClass.value) return
  for (const field of selectedDataClass.value.fields) {
    if (field.relationTarget) {
      useRelationOptions(field.relationTarget)
    }
  }
})

// Section tab (no classId prop): sync with the sidebar's global selected class.
// Class list tabs (with classId prop): ignore global state — each tab owns
// its own data and should not react to sidebar clicks on other classes.
if (!props.classId) {
  watch(() => dataClassesStore.selectedClassId, (classId) => {
    if (classId !== selectedClassId.value) {
      selectedClassId.value = classId
      handleClassChange()
    }
  })

  watch(selectedClassId, (classId) => {
    if (classId !== dataClassesStore.selectedClassId) {
      dataClassesStore.selectedClassId = classId
    }
  })
}

// Class list tab: fetch objects for this class on mount and when the
// classId prop changes (e.g. when the sidebar clicks a different class).
if (props.classId) {
  watch(() => props.classId, (classId) => {
    if (classId !== selectedClassId.value) {
      selectedClassId.value = classId
      handleClassChange()
    }
  })
  // Fetch data immediately on mount since the global-store watcher is
  // skipped for classList tab instances.
  handleClassChange()
}

// When selectedDataClass finishes loading asynchronously (dataClassesStore
// may not be populated yet when handleClassChange runs), apply the class's
// List Layout if it wasn't already set.
watch(selectedDataClass, (dataClass) => {
  if (!dataClass || !selectedClassId.value || activeColumnNames.value.length > 0) return
  const classColumns = dataClass.viewConfig?.listColumns ?? []
  if (classColumns.length === 0) return
  const known = new Set(allColumnOptions.value.map((c) => c.name))
  const names = classColumns.map((c) => c.name).filter((n) => known.has(n))
  if (names.length > 0) {
    activeColumnNames.value = names
  }
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
    await Promise.all(record.rows.map((row) => apiDeleteDataObject(authStore.config.coreApiUrl, row.id)))
    objects.value = objects.value.filter((o) => !record.rows.some((r) => r.id === o.id))
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