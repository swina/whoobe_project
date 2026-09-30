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
      <label class="ml-2 flex items-center gap-1"><input type="checkbox" v-model="table.hasHeader" /> Header</label>
      <label class="flex items-center gap-1"><input type="checkbox" v-model="table.hasFooter" /> Footer</label>
    </div>

    <!-- Per-cell colspan/rowspan editor - only shown once a cell is
         clicked, since a span only ever makes sense for one specific cell
         at a time. Rowspan is hidden for header/footer cells: those are
         each a single logical row, so spanning rows there has nothing to
         span into (see ElementsClass.js's Table() comment). -->
    <div v-if="selectedCellData" class="flex flex-wrap items-end gap-2 mb-2 bg-indigo-50 border border-indigo-200 p-1.5 rounded text-[10px] text-indigo-900" @click.stop>
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
      <caption v-if="table.caption" class="text-left text-xs text-gray-400 mb-1">{{ table.caption }}</caption>
      <thead v-if="table.hasHeader">
        <tr :class="table.headerRowClass">
          <template v-for="(cell, c) in table.header" :key="cell.id">
            <th
              v-if="!cell.merged"
              :colspan="cell.colspan > 1 ? cell.colspan : undefined"
              :class="[table.headerCellClass, cell.cellClass, isCellSelected('header', 0, c) ? 'ring-2 ring-inset ring-indigo-400' : '']"
              contenteditable="true"
              v-html="cell.content"
              @click.stop="selectCell('header', 0, c)"
              @blur="onCellBlur(cell, $event)"
            ></th>
          </template>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, r) in table.body" :key="r" :class="table.bodyRowClass">
          <template v-for="(cell, c) in row" :key="cell.id">
            <td
              v-if="!cell.merged"
              :colspan="cell.colspan > 1 ? cell.colspan : undefined"
              :rowspan="cell.rowspan > 1 ? cell.rowspan : undefined"
              :class="[table.bodyCellClass, cell.cellClass, isCellSelected('body', r, c) ? 'ring-2 ring-inset ring-indigo-400' : '']"
              contenteditable="true"
              v-html="cell.content"
              @click.stop="selectCell('body', r, c)"
              @blur="onCellBlur(cell, $event)"
            ></td>
          </template>
        </tr>
      </tbody>
      <tfoot v-if="table.hasFooter">
        <tr :class="table.footerRowClass">
          <template v-for="(cell, c) in table.footer" :key="cell.id">
            <td
              v-if="!cell.merged"
              :colspan="cell.colspan > 1 ? cell.colspan : undefined"
              :class="[table.footerCellClass, cell.cellClass, isCellSelected('footer', 0, c) ? 'ring-2 ring-inset ring-indigo-400' : '']"
              contenteditable="true"
              v-html="cell.content"
              @click.stop="selectCell('footer', 0, c)"
              @blur="onCellBlur(cell, $event)"
            ></td>
          </template>
        </tr>
      </tfoot>
    </table>
  </div>
</template>

<script setup lang="ts">
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

function onCellBlur(cell: TableCell, e: FocusEvent) {
  const target = e.target as HTMLElement
  cell.content = target.innerHTML.replace(/style="[^"]*"/gm, '')
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
