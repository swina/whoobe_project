// What a Table element draws when it is bound to a list (the element's own `dataBinding` or `gatewayBinding`, set from the toolbar):
// the columns, one row per record with each cell read and formatted, and the page of rows to show. Shared by BlockTable.vue
// (editor canvas) and preview/BlockTablePreview.vue (preview and published pages) so both draw the same thing. The pure rules
// are in @whoobe-cms/schema (table-binding.ts); this file only adds the reactive state and the field transforms.
import { computed, ref, watch, type Ref } from 'vue'
import {
  columnsFromRecords,
  matchesTerms,
  nextSort,
  normalizeSearchText,
  pageCount,
  pageRows,
  paginationOf,
  plainCellText,
  searchTerms,
  sortRecords,
  tableCellValue,
  tableRecords,
  type TableSort,
} from '@whoobe-cms/schema'
import { useEditorStore } from '../store/editor'
import { applyTransform, type TransformResult } from '../scripts/field-transforms'
import type { TableBoundColumn } from '../scripts/ElementsClass.js'

export interface BoundCell {
  key: string
  result: TransformResult
  cellClass?: string
}

export interface BoundColumn extends TableBoundColumn {
  /** true when it comes from the first record because none was configured */
  detected: boolean
}

export function useBoundTable(doc: Ref<any>) {
  const editor = useEditorStore()

  // A list binding on the element: a gateway array wins over a Data Class query (the resolver stores the later one last).
  // A Data Class binding with a `field` is a single value for another kind of element, not a list.
  const binding = computed(() => {
    const el = doc.value
    if (el?.gatewayBinding) return el.gatewayBinding
    const db = el?.dataBinding
    return db && !db.field ? db : null
  })
  const isBound = computed(() => binding.value !== null)
  const records = computed<unknown[]>(() => (isBound.value ? tableRecords(editor.resolvedData[doc.value.id]) : []))

  const columns = computed<BoundColumn[]>(() => {
    const configured: TableBoundColumn[] = doc.value?.table?.columns ?? []
    if (configured.length) return configured.map((c) => ({ ...c, detected: false }))
    return columnsFromRecords(records.value).map((c, i) => ({ id: `detected-${i}`, header: c.header, field: c.field, detected: true }))
  })

  const pagination = computed(() => paginationOf(binding.value))
  const page = ref(1)
  const visible = ref(0)

  // What the visitor does to the list: search it, sort it. Both act on the whole list, then it is cut into pages.
  const sortEnabled = computed(() => doc.value?.table?.sortable === true)
  const searchEnabled = computed(() => doc.value?.table?.searchable === true)
  const query = ref('')
  const sort = ref<TableSort | null>(null)

  function cellResult(record: unknown, col: BoundColumn): TransformResult {
    const raw = tableCellValue(record, col.field)
    return col.transform && col.transform.type !== 'none'
      ? applyTransform(raw, col.transform, editor.page?.locale)
      : ({ kind: 'text', text: plainCellText(raw) } as TransformResult)
  }

  // What the search looks at: the text the visitor sees in each searchable column. Built only while a query is typed.
  const searchTexts = computed(() => {
    const cols = columns.value.filter((c) => c.searchable !== false)
    return records.value.map((r) => normalizeSearchText(cols.map((c) => cellResult(r, c).text).join(' ')))
  })
  const filtered = computed<unknown[]>(() => {
    const terms = searchEnabled.value ? searchTerms(query.value) : []
    if (!terms.length) return records.value
    const texts = searchTexts.value
    return records.value.filter((_, i) => matchesTerms(texts[i], terms))
  })
  // a sort on a column that no longer exists (or one the author switched off) is ignored
  const activeSort = computed<TableSort | null>(() => {
    const s = sort.value
    if (!sortEnabled.value || !s) return null
    const col = columns.value.find((c) => c.field === s.field)
    return col && col.sortable !== false ? s : null
  })
  const processed = computed<unknown[]>(() => sortRecords(filtered.value, activeSort.value))

  const recordCount = computed(() => records.value.length)
  const total = computed(() => processed.value.length)
  const pages = computed(() => pageCount(total.value, pagination.value.rowsPerPage))
  const shown = computed(() => pageRows(processed.value, pagination.value, page.value, visible.value))
  const needsControls = computed(() => pagination.value.rowsPerPage > 0 && total.value > pagination.value.rowsPerPage)
  const searching = computed(() => searchEnabled.value && searchTerms(query.value).length > 0)

  watch(records, () => { page.value = 1; visible.value = pagination.value.rowsPerPage })
  watch([query, sort], () => { page.value = 1; visible.value = pagination.value.rowsPerPage })
  watch(() => pagination.value.rowsPerPage, (n) => { visible.value = n })
  watch(pages, (p) => { if (page.value > p) page.value = p })
  visible.value = pagination.value.rowsPerPage

  function cellsOf(record: unknown): BoundCell[] {
    return columns.value.map((col) => ({ key: col.id, result: cellResult(record, col), cellClass: col.cellClass }))
  }

  const rows = computed(() => shown.value.map((record, i) => ({ key: i, cells: cellsOf(record) })))

  const canSort = (col: TableSort | { field: string; sortable?: boolean }) => sortEnabled.value && (col as any).sortable !== false
  function setSort(col: { field: string; sortable?: boolean }) {
    if (canSort(col)) sort.value = nextSort(sort.value, col.field)
  }
  function ariaSort(col: { field: string }): 'ascending' | 'descending' | 'none' {
    const s = activeSort.value
    return s && s.field === col.field ? (s.direction === 'asc' ? 'ascending' : 'descending') : 'none'
  }
  function sortMark(col: { field: string }): string {
    const a = ariaSort(col)
    return a === 'ascending' ? '▲' : a === 'descending' ? '▼' : '↕'
  }

  function prev() { page.value = Math.max(1, page.value - 1) }
  function next() { page.value = Math.min(pages.value, page.value + 1) }
  function more() { visible.value = Math.min(visible.value + pagination.value.rowsPerPage, total.value) }

  return {
    binding, isBound, records, columns, rows, pagination, page, pages, visible, total, recordCount, needsControls, prev, next, more,
    query, searchEnabled, searching, sortEnabled, canSort, setSort, ariaSort, sortMark,
  }
}
