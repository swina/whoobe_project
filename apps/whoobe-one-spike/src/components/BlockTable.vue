<template>
  <div class="relative" :class="groupClass" :data-toolbar-anchor="doc.id">
    <button
      type="button"
      class="absolute -top-2.5 -left-2.5 z-50 px-1.5 py-0.5 rounded text-[10px] leading-none font-semibold text-white transition-opacity"
      :class="[tagOpacityClass, tagBgClass]"
      @click.stop="onSelect"
    >
      {{ doc.tag || 'table' }}
    </button>

    <!-- Structure toolbar: grow/shrink the grid and toggle header/footer
         sections - the "nr di colonne, righe... header, footer"
         customization. Kept local to this component (not FloatingToolbar's
         popover system), matching how BlockSlider.vue/BlockIsometric.vue
         keep their own structural editing (add slide/box) inline rather
         than in the shared sidebar. -->
    <div class="flex flex-wrap items-center gap-2 mb-2 bg-slate-100 p-1.5 rounded text-[10px] text-gray-600" @click.stop>
      <span v-if="bound.isBound.value" class="text-amber-700 font-medium">Bound to data: {{ bound.recordCount.value }} record(s)</span>
      <template v-if="!bound.isBound.value">
      <span class="text-gray-400">Rows: {{ table.body.length }}</span>
      <button type="button" class="px-1.5 py-0.5 rounded border border-gray-300 hover:border-indigo-400 hover:text-indigo-600" @click="addRow">+ row</button>
      <button
        type="button"
        class="px-1.5 py-0.5 rounded border border-gray-300 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-30 disabled:hover:border-gray-300 disabled:hover:text-gray-600"
        :disabled="table.body.length <= 1"
        @click="removeRow"
      >- row</button>
      <span class="text-gray-400 ml-2">Cols: {{ table.cols }}</span>
      <button type="button" class="px-1.5 py-0.5 rounded border border-gray-300 hover:border-indigo-400 hover:text-indigo-600" @click="addColumn">+ col</button>
      <button
        type="button"
        class="px-1.5 py-0.5 rounded border border-gray-300 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-30 disabled:hover:border-gray-300 disabled:hover:text-gray-600"
        :disabled="table.cols <= 1"
        @click="removeColumn"
      >- col</button>
      </template>
      <label class="ml-2 flex items-center gap-1"><input type="checkbox" v-model="table.hasHeader" /> Header</label>
      <label v-if="!bound.isBound.value" class="flex items-center gap-1"><input type="checkbox" v-model="table.hasFooter" /> Footer</label>
    </div>

    <!-- Columns of a table bound to a list (the toolbar's "Bind to data object" / "Bind to gateway endpoint"): one row per record.
         The pagination of the list is set in the same binding window ("Rows per page"). -->
    <div v-if="bound.isBound.value" class="mb-2 bg-amber-50 border border-amber-200 p-2 rounded text-[10px] text-amber-900 flex flex-col gap-1.5" @click.stop>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="font-medium flex items-center gap-1" :aria-expanded="columnsOpen" @click="columnsOpen = !columnsOpen">
          <span>{{ columnsOpen ? '▾' : '▸' }}</span> Columns ({{ bound.columns.value.length }})
        </button>
        <template v-if="columnsOpen">
          <button type="button" class="px-1.5 py-0.5 rounded border border-amber-300 hover:bg-amber-100" @click="addBoundColumn">+ column</button>
          <button type="button" class="px-1.5 py-0.5 rounded border border-amber-300 hover:bg-amber-100 disabled:opacity-40" :disabled="!suggestedFields.length" @click="fieldsOpen = !fieldsOpen">
            {{ fieldsOpen ? 'Hide fields' : 'Choose fields' }}
          </button>
          <button type="button" class="px-1.5 py-0.5 rounded border border-amber-300 hover:bg-amber-100 disabled:opacity-40" :disabled="!missingFields.length" title="Adds the fields that are not columns yet; the columns you have are kept" @click="addMissingFields">Add missing fields ({{ missingFields.length }})</button>
          <label class="flex items-center gap-1 ml-auto">Empty text <input v-model="table.emptyText" type="text" placeholder="No data" class="w-28 px-1 py-0.5 rounded border border-amber-300 bg-white" /></label>
        </template>
      </div>
      <template v-if="columnsOpen">
      <div v-if="fieldsOpen" class="flex flex-wrap gap-x-3 gap-y-1 bg-white border border-amber-200 rounded p-1.5">
        <label v-for="f in suggestedFields" :key="f.field" class="flex items-center gap-1 font-mono">
          <input type="checkbox" :checked="hasColumn(f.field)" :disabled="hasColumn(f.field) && bound.columns.value.length <= 1" @change="toggleField(f)" /> {{ f.field }}
        </label>
      </div>
      <!-- What the visitor can do with the list: sort by a header, search. Both work over the whole list, before the pages. -->
      <div class="flex flex-wrap items-center gap-3 border-t border-amber-200 pt-1.5">
        <label class="flex items-center gap-1"><input v-model="table.sortable" type="checkbox" /> Sortable columns</label>
        <label class="flex items-center gap-1"><input v-model="table.searchable" type="checkbox" /> Search box</label>
        <label class="flex items-center gap-1"><input v-model="table.showCount" type="checkbox" /> Row count</label>
        <template v-if="table.searchable">
          <input v-model="table.searchPlaceholder" type="text" placeholder="Search…" title="Placeholder of the search box" class="w-28 px-1 py-0.5 rounded border border-amber-300 bg-white" />
          <input v-model="table.searchClass" type="text" placeholder="Search box classes" title="Tailwind classes of the search box (empty = default)" class="w-44 px-1 py-0.5 rounded border border-amber-300 bg-white font-mono" />
        </template>
      </div>
      <div v-if="table.showCount" class="flex flex-wrap items-center gap-2">
        <input v-model="table.countText" type="text" placeholder="Showing {from}–{to} of {total}" title="Text of the counter. Placeholders: {from} {to} {total} (rows in the result) {all} (rows before a search). Empty = the default." class="w-64 px-1 py-0.5 rounded border border-amber-300 bg-white font-mono" />
        <input v-model="table.countClass" type="text" placeholder="Counter classes" title="Tailwind classes of the counter (empty = default)" class="w-36 px-1 py-0.5 rounded border border-amber-300 bg-white font-mono" />
      </div>
      <p v-if="!(table.columns && table.columns.length)" class="text-amber-700">
        No column set yet: the fields of the first record are shown. Use "Choose fields" to pick them, or add columns.
      </p>
      <datalist :id="`${doc.id}-fields`"><option v-for="f in suggestedFields" :key="f.field" :value="f.field">{{ f.header }}</option></datalist>
      <div v-for="(col, i) in (table.columns || [])" :key="col.id" class="flex flex-wrap items-center gap-1">
        <input v-model="col.header" type="text" placeholder="Header" class="w-28 px-1 py-0.5 rounded border border-amber-300 bg-white" />
        <input v-model="col.field" type="text" placeholder="field or path" :list="`${doc.id}-fields`" class="w-32 px-1 py-0.5 rounded border border-amber-300 bg-white font-mono" />
        <input v-model="col.cellClass" type="text" placeholder="Cell classes" title="Tailwind classes for the cells of this column" class="w-32 px-1 py-0.5 rounded border border-amber-300 bg-white font-mono" />
        <input v-model="col.headerCellClass" type="text" placeholder="Header classes" title="Tailwind classes for the header cell of this column" class="w-32 px-1 py-0.5 rounded border border-amber-300 bg-white font-mono" />
        <select :value="col.transform?.type || 'none'" class="px-1 py-0.5 rounded border border-amber-300 bg-white" @change="setColumnFormat(col, ($event.target as HTMLSelectElement).value)">
          <option value="none">Plain</option>
          <option v-for="t in columnFormats" :key="t.type" :value="t.type">{{ t.label }}</option>
        </select>
        <label v-if="table.sortable" class="flex items-center gap-0.5" title="The visitor can sort by this column"><input type="checkbox" :checked="col.sortable !== false" @change="col.sortable = ($event.target as HTMLInputElement).checked" /> sort</label>
        <label v-if="table.searchable" class="flex items-center gap-0.5" title="The search box looks at this column"><input type="checkbox" :checked="col.searchable !== false" @change="col.searchable = ($event.target as HTMLInputElement).checked" /> search</label>
        <button type="button" class="px-1 rounded border border-amber-300 hover:bg-amber-100 disabled:opacity-30" :disabled="i === 0" title="Move left" @click="moveBoundColumn(i, -1)">←</button>
        <button type="button" class="px-1 rounded border border-amber-300 hover:bg-amber-100 disabled:opacity-30" :disabled="i === (table.columns || []).length - 1" title="Move right" @click="moveBoundColumn(i, 1)">→</button>
        <button type="button" class="px-1 rounded border border-rose-300 text-rose-600 hover:bg-rose-50" title="Remove" @click="removeBoundColumn(i)">×</button>
      </div>
      </template>
    </div>

    <!-- Per-cell colspan/rowspan editor - only shown once a cell is
         clicked, since a span only ever makes sense for one specific cell
         at a time. Rowspan is hidden for header/footer cells: those are
         each a single logical row, so spanning rows there has nothing to
         span into (see ElementsClass.js's Table() comment). -->
    <div v-if="selectedCellData && !bound.isBound.value" class="flex flex-wrap items-end gap-2 mb-2 bg-indigo-50 border border-indigo-200 p-1.5 rounded text-[10px] text-indigo-900" @click.stop>
      <span class="font-medium pb-1">Cell {{ selectedCell!.section }}[{{ selectedCell!.row + 1 }},{{ selectedCell!.col + 1 }}]</span>
      <label class="flex items-center gap-1">
        Colspan
        <input type="number" min="1" :max="table.cols - selectedCell!.col" v-model.number="colspanModel" class="w-12 px-1 py-0.5 rounded border border-indigo-300" />
      </label>
      <label v-if="selectedCell!.section === 'body'" class="flex items-center gap-1">
        Rowspan
        <input type="number" min="1" :max="table.body.length - selectedCell!.row" v-model.number="rowspanModel" class="w-12 px-1 py-0.5 rounded border border-indigo-300" />
      </label>
      <!-- Per-cell override, layered on top of the section's own default
           (table.headerCellClass/bodyCellClass/footerCellClass, edited via
           FloatingToolbar.vue's "Table classes" popover) - see the
           template's th/td `:class` bindings below, which apply both. -->
      <label class="flex items-center gap-1 flex-1 min-w-[10rem]">
        Cell classes
        <ExpandableTextInput
          v-model="selectedCellData!.cellClass"
          popup-label="Cell classes"
          monospace
          class="flex-1"
        />
      </label>
      <button type="button" class="px-1.5 py-0.5 rounded border border-indigo-300 hover:bg-indigo-100" @click="selectedCell = null">Done</button>
    </div>

    <table
      :id="doc.id"
      :class="classe"
      :style="stile"
      data-type="element"
      :data-id="doc.id"
      @click.self="onSelect"
    >
      <caption v-if="table.caption || (bound.isBound.value && table.searchable)" class="text-left text-xs text-gray-400 mb-1">
        <div v-if="bound.isBound.value && table.searchable" class="text-left">
        <input v-model="bound.query.value" type="search" :placeholder="table.searchPlaceholder || 'Search…'" aria-label="Search the table" :class="table.searchClass || 'w-full max-w-xs px-3 py-1.5 mb-2 rounded border border-gray-300 text-sm'" @click.stop />
      </div>
      {{ table.caption }}</caption>
      <thead v-if="table.hasHeader">
        <tr :class="table.headerRowClass">
          <template v-if="bound.isBound.value">
            <th v-for="col in bound.columns.value" :key="col.id" :class="[table.headerCellClass, col.headerCellClass]" :aria-sort="bound.canSort(col) ? bound.ariaSort(col) : undefined">
              <button v-if="bound.canSort(col)" type="button" class="inline-flex items-center gap-1 text-left font-[inherit] cursor-pointer select-none" @click.stop="bound.setSort(col)">
                {{ col.header }}<span aria-hidden="true" class="text-[0.7em] opacity-70">{{ bound.sortMark(col) }}</span>
              </button>
              <template v-else>{{ col.header }}</template>
            </th>
          </template>
          <template v-else>
            <template v-for="(cell, c) in table.header" :key="cell.id">
              <th
                v-if="!cell.merged"
                :colspan="cell.colspan > 1 ? cell.colspan : undefined"
                :class="[table.headerCellClass, cell.cellClass, isCellSelected('header', 0, c) ? 'ring-2 ring-inset ring-indigo-400' : '']"
                contenteditable="true"
                v-html="safeHtml(cell.content)"
                @click.stop="selectCell('header', 0, c)"
                @input="editedCells.add(cell)"
                @blur="onCellBlur(cell, $event)"
              ></th>
            </template>
          </template>
        </tr>
      </thead>
      <tbody v-if="bound.isBound.value">
        <tr v-for="row in bound.rows.value" :key="row.key" :class="table.bodyRowClass">
          <td v-for="cell in row.cells" :key="cell.key" :class="[table.bodyCellClass, cell.cellClass]">
            <a v-if="cell.href" :href="cell.href" @click.prevent>{{ cell.text }}</a>
            <span v-else :class="cell.className">{{ cell.text }}</span>
          </td>
        </tr>
        <tr v-if="!bound.rows.value.length">
          <td :colspan="Math.max(1, bound.columns.value.length)" :class="table.bodyCellClass" class="text-center opacity-60">{{ bound.searching.value ? 'No matching rows' : (table.emptyText || 'No data') }}</td>
        </tr>
      </tbody>
      <tbody v-else>
        <tr v-for="(row, r) in table.body" :key="r" :class="table.bodyRowClass">
          <template v-for="(cell, c) in row" :key="cell.id">
            <td
              v-if="!cell.merged"
              :colspan="cell.colspan > 1 ? cell.colspan : undefined"
              :rowspan="cell.rowspan > 1 ? cell.rowspan : undefined"
              :class="[table.bodyCellClass, cell.cellClass, isCellSelected('body', r, c) ? 'ring-2 ring-inset ring-indigo-400' : '']"
              contenteditable="true"
              v-html="safeHtml(cell.content)"
              @click.stop="selectCell('body', r, c)"
              @input="editedCells.add(cell)"
              @blur="onCellBlur(cell, $event)"
            ></td>
          </template>
        </tr>
      </tbody>
      <tfoot v-if="bound.isBound.value && bound.hasFooter.value" @click.stop>
        <tr>
          <td :colspan="Math.max(1, bound.columns.value.length)" class="p-0">
            <div :class="bound.needsControls.value ? bound.pagination.value.containerClass : 'w-full flex justify-center p-2'">
              <span v-if="bound.showCount.value" :class="table.countClass || 'text-xs text-gray-500'" aria-live="polite">{{ bound.countLabel.value }}</span>
              <template v-if="bound.needsControls.value">
                <template v-if="bound.pagination.value.mode === 'standard'">
                  <div class="flex items-center justify-center gap-3 text-xs text-gray-500">
                    <button type="button" class="px-2 py-1 rounded border disabled:opacity-40" :disabled="bound.page.value <= 1" @click="bound.prev()">‹ Prev</button>
                    <span>Page {{ bound.page.value }} of {{ bound.pages.value }}</span>
                    <button type="button" class="px-2 py-1 rounded border disabled:opacity-40" :disabled="bound.page.value >= bound.pages.value" @click="bound.next()">Next ›</button>
                  </div>
                </template>
                <template v-else>
                  <span v-if="!bound.showCount.value" class="text-xs text-gray-500">{{ bound.rows.value.length }} / {{ bound.total.value }}</span>
                  <button v-if="bound.rows.value.length < bound.total.value" type="button" :class="bound.pagination.value.loadMoreClass" @click="bound.more()">{{ bound.pagination.value.loadMoreText }}</button>
                </template>
              </template>
            </div>
          </td>
        </tr>
      </tfoot>
      <tfoot v-else-if="table.hasFooter && !bound.isBound.value">
        <tr :class="table.footerRowClass">
          <template v-for="(cell, c) in table.footer" :key="cell.id">
            <td
              v-if="!cell.merged"
              :colspan="cell.colspan > 1 ? cell.colspan : undefined"
              :class="[table.footerCellClass, cell.cellClass, isCellSelected('footer', 0, c) ? 'ring-2 ring-inset ring-indigo-400' : '']"
              contenteditable="true"
              v-html="safeHtml(cell.content)"
              @click.stop="selectCell('footer', 0, c)"
              @input="editedCells.add(cell)"
              @blur="onCellBlur(cell, $event)"
            ></td>
          </template>
        </tr>
      </tfoot>
    </table>
  </div>
</template>

<script setup lang="ts">
import { sanitizeRichText as safeHtml, dropForeignInlineStyles } from '@whoobe-cms/schema'
// Editing-time renderer for a `tag === 'table'` element (see ElementsClass.
// js's Table() builder comment for the full grid-model rationale). Not a
// container - `doc.table` is a fixed header/body/footer grid of plain
// {content, colspan, rowspan} cells, never nested Elements/.blocks, so this
// is its own dedicated component (same treatment as BlockSlider.vue/
// BlockIsometric.vue) rather than a branch inside BlockContainer.vue/
// BlockElement.vue.
//
// Two independent selection states: `editor.current` (the whole table
// Element, for FloatingToolbar's normal Style/Advanced tabs - set on any
// click inside this component) and the local `selectedCell` ref (which
// specific cell's colspan/rowspan mini-toolbar is showing) - a cell is
// plain data, not a real Element, so it can never be `editor.current`
// itself.
import { computed, ref } from 'vue'
import Element from '../scripts/ElementsClass.js'
import type { TableCell } from '../scripts/ElementsClass.js'
import { useEditorStore } from '../store/editor'
import ExpandableTextInput from './ExpandableTextInput.vue'
import { appendMissingColumns, columnsFromRecords, missingColumnFields, toggleColumnField } from '@whoobe-cms/schema'
import { useBoundTable } from '../composables/useBoundTable'
import { TRANSFORMERS } from '../scripts/field-transforms'

type WhoobeElement = InstanceType<typeof Element>
type Section = 'header' | 'body' | 'footer'

const props = defineProps<{
  doc: WhoobeElement
  level: number
}>()

const editor = useEditorStore()

// Table() always sets this - the type only needs to say "possibly absent"
// so the shim covers instances imported directly from ElementsClass.d.ts's
// own `table?: ElementTable` field.
const table = computed(() => (props.doc as any).table as NonNullable<WhoobeElement['table']>)

// Bound to a list (a Data Class query or a gateway array, set from the toolbar): header and rows come from the data
// (read-only on the canvas) and the columns are edited in the panel above the table. See composables/useBoundTable.ts.
const bound = useBoundTable(computed(() => props.doc))
const suggestedFields = computed(() => columnsFromRecords(bound.records.value, 40))
const columnFormats = (['date', 'number', 'truncate', 'url'] as const).map((type) => ({ type, label: TRANSFORMERS[type].label }))

function newColumn(field = '', header = ''): NonNullable<NonNullable<WhoobeElement['table']>['columns']>[number] {
  return { id: (props.doc as any).randomID?.() ?? Math.random().toString(36).slice(2, 10), header, field }
}
function addBoundColumn() {
  table.value.columns = [...currentColumns(), newColumn()]
}
// The panel can be folded away, and the list of fields can be opened to pick the columns with check boxes.
const columnsOpen = ref(true)
const fieldsOpen = ref(false)

// A column per field is only written once the author changes something: until then `table.columns` stays empty and the
// fields of the first record are shown. The first change turns what is shown into real, editable columns.
function currentColumns() {
  return table.value.columns?.length ? table.value.columns : bound.columns.value.map((c) => newColumn(c.field, c.header))
}
const hasColumn = (field: string) => bound.columns.value.some((c) => c.field === field)
const missingFields = computed(() => missingColumnFields(bound.columns.value, suggestedFields.value))
function toggleField(f: { field: string; header: string }) {
  table.value.columns = toggleColumnField(currentColumns(), f.field, () => newColumn(f.field, f.header))
}
// Never replaces what the author set: headers, formats, classes and order of the existing columns are kept
function addMissingFields() {
  table.value.columns = appendMissingColumns(currentColumns(), suggestedFields.value, (f) => newColumn(f.field, f.header))
}
function removeBoundColumn(i: number) {
  table.value.columns?.splice(i, 1)
}
function moveBoundColumn(i: number, by: -1 | 1) {
  const cols = table.value.columns
  if (!cols || i + by < 0 || i + by >= cols.length) return
  const [c] = cols.splice(i, 1)
  cols.splice(i + by, 0, c)
}
function setColumnFormat(col: { transform?: any }, type: string) {
  const def = (TRANSFORMERS as Record<string, { defaultOptions: unknown }>)[type]
  col.transform = def ? { type, options: structuredClone(def.defaultOptions) } : null
}

const isSelected = computed(() => editor.current?.id === props.doc.id)
const groupClass = computed(() => `group/${props.doc.id}`)
const tagOpacityClass = computed(() => (isSelected.value ? 'opacity-100' : `opacity-0 group-hover/${props.doc.id}:opacity-100`))

// Same signal as BlockContainer.vue's/BlockSlider.vue's own tagBgClass -
// see BlockContainer.vue's comment for why css.css/inline style (not
// css.container) is what "custom CSS" means here.
const tagBgClass = computed(() => {
  const doc = props.doc as any
  const hasCustomCss = !!(doc.css?.css?.trim() || doc.style?.trim())
  return hasCustomCss ? 'bg-violet-500' : 'bg-red-500'
})

const classe = computed(() => {
  const doc = props.doc as any
  let cls = `${doc.css.css ?? ''} ${doc.css.container ?? ''} relative cursor-pointer p-2 block`
  cls += isSelected.value ? ' border-2 border-red-400' : ' border border-dashed border-transparent hover:border-red-300'
  return cls
})

const stile = computed(() => (props.doc as any).style ?? '')

function onSelect() {
  editor.setCurrent(isSelected.value ? null : props.doc)
}

const selectedCell = ref<{ section: Section; row: number; col: number } | null>(null)

function rowArrayFor(section: Section, row: number): TableCell[] {
  if (section === 'header') return table.value.header
  if (section === 'footer') return table.value.footer
  return table.value.body[row]
}

function getCell(section: Section, row: number, col: number): TableCell | undefined {
  return rowArrayFor(section, row)?.[col]
}

const selectedCellData = computed<TableCell | null>(() => {
  if (!selectedCell.value) return null
  return getCell(selectedCell.value.section, selectedCell.value.row, selectedCell.value.col) ?? null
})

function isCellSelected(section: Section, row: number, col: number): boolean {
  const sel = selectedCell.value
  return !!sel && sel.section === section && sel.row === row && sel.col === col
}

function selectCell(section: Section, row: number, col: number) {
  editor.setCurrent(props.doc)
  selectedCell.value = { section, row, col }
}

// Same rule as BlockElement.vue's onBlur: a blur alone must not rewrite the content with the sanitized DOM, and an
// edit keeps the inline styles the cell already had (colours) while dropping the ones the browser added.
const editedCells = new WeakSet<TableCell>()

function onCellBlur(cell: TableCell, e: FocusEvent) {
  if (!editedCells.has(cell)) return
  editedCells.delete(cell)
  const target = e.target as HTMLElement
  cell.content = dropForeignInlineStyles(target.innerHTML, cell.content)
}

// Clears the `merged` flag (back to a normal, empty-of-obligation cell) on
// every slot a cell's CURRENT colspan/rowspan footprint covers, other than
// its own top-left slot - called before re-applying a (possibly smaller)
// new footprint so shrinking a merge doesn't leave orphaned cells stuck
// permanently hidden.
function releaseFootprint(section: Section, row: number, col: number, colspan: number, rowspan: number) {
  for (let dr = 0; dr < rowspan; dr++) {
    const targetRow = section === 'body' ? table.value.body[row + dr] : rowArrayFor(section, row)
    if (!targetRow) continue
    for (let dc = 0; dc < colspan; dc++) {
      if (dr === 0 && dc === 0) continue
      const cell = targetRow[col + dc]
      if (cell) { cell.merged = false; cell.colspan = 1; cell.rowspan = 1 }
    }
  }
}

function applyFootprint(section: Section, row: number, col: number, colspan: number, rowspan: number) {
  for (let dr = 0; dr < rowspan; dr++) {
    const targetRow = section === 'body' ? table.value.body[row + dr] : rowArrayFor(section, row)
    if (!targetRow) continue
    for (let dc = 0; dc < colspan; dc++) {
      if (dr === 0 && dc === 0) continue
      const cell = targetRow[col + dc]
      if (cell) { cell.merged = true; cell.colspan = 1; cell.rowspan = 1 }
    }
  }
}

// Merge/un-merge a cell by growing or shrinking its colspan/rowspan -
// covered neighbor cells are flagged `merged` (hidden at render, see the
// template's `v-if="!cell.merged"`) rather than removed from the grid, so
// every row stays exactly `table.cols` long and shrinking the span back
// down cleanly reveals plain, empty cells again.
function applySpan(target: { section: Section; row: number; col: number }, colspan: number, rowspan: number) {
  const { section, row, col } = target
  const cell = getCell(section, row, col)
  if (!cell) return
  releaseFootprint(section, row, col, cell.colspan || 1, cell.rowspan || 1)
  const maxCols = table.value.cols - col
  const maxRows = section === 'body' ? table.value.body.length - row : 1
  const nextColspan = Math.max(1, Math.min(colspan || 1, maxCols))
  const nextRowspan = section === 'body' ? Math.max(1, Math.min(rowspan || 1, maxRows)) : 1
  cell.colspan = nextColspan
  cell.rowspan = nextRowspan
  cell.merged = false
  applyFootprint(section, row, col, nextColspan, nextRowspan)
}

const colspanModel = computed({
  get: () => selectedCellData.value?.colspan ?? 1,
  set: (v: number) => { if (selectedCell.value) applySpan(selectedCell.value, v, selectedCellData.value?.rowspan ?? 1) },
})
const rowspanModel = computed({
  get: () => selectedCellData.value?.rowspan ?? 1,
  set: (v: number) => { if (selectedCell.value) applySpan(selectedCell.value, selectedCellData.value?.colspan ?? 1, v) },
})

function makeCell(content = ''): TableCell {
  return new Element().tableCell(content)
}

// Any grid resize (row/column count change) resets every cell's colspan/
// rowspan/merged back to 1x1 - a deliberate simplification (see
// ElementsClass.js's Table() comment): reconciling arbitrary pre-existing
// merges against a newly-shaped grid without ever losing content or
// leaving orphaned hidden cells is real spreadsheet-engine territory, not
// warranted for this editor. Merge state is only meaningful right after
// the grid's own shape (rows/cols/header/footer) is finished.
function resetSpans() {
  const reset = (row: TableCell[]) => row.forEach((c) => { c.colspan = 1; c.rowspan = 1; c.merged = false })
  reset(table.value.header)
  table.value.body.forEach(reset)
  reset(table.value.footer)
  selectedCell.value = null
}

function addRow() {
  table.value.body.push(Array.from({ length: table.value.cols }, () => makeCell()))
  resetSpans()
}

function removeRow() {
  if (table.value.body.length <= 1) return
  table.value.body.pop()
  resetSpans()
}

function addColumn() {
  const nextCol = table.value.cols
  table.value.header.push(makeCell(`Header ${nextCol + 1}`))
  table.value.body.forEach((row) => row.push(makeCell()))
  table.value.footer.push(makeCell())
  table.value.cols += 1
  resetSpans()
}

function removeColumn() {
  if (table.value.cols <= 1) return
  table.value.header.pop()
  table.value.body.forEach((row) => row.pop())
  table.value.footer.pop()
  table.value.cols -= 1
  resetSpans()
}
</script>
