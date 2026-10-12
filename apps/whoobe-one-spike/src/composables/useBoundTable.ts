// What a Table element draws when it is bound to a list (the element's own `dataBinding` or `gatewayBinding`, set from the toolbar):
// the columns, one row per record, and the rows of the page the visitor is on. Shared by BlockTable.vue (editor canvas) and
// preview/BlockTablePreview.vue (preview and published pages). This file only holds the STATE (search words, sort, page) and the
// list of columns; the rows and the view of them (search, sort, page, counter) come from @whoobe-cms/schema (table-view.ts), the same
// two functions the SDK adapters of the generated sites call, so a table behaves the same wherever it is drawn.
import { computed, ref, watch, type Ref } from 'vue'
import {
  ariaSortOf,
  buildTableRows,
  columnsFromRecords,
  computeTableView,
  nextSort,
  paginationOf,
  sortMarkOf,
  tableRecords,
  type TableCellData,
  type TableSort,
} from '@whoobe-cms/schema'
import { useEditorStore } from '../store/editor'
import type { TableBoundColumn } from '../scripts/ElementsClass.js'

export interface BoundCell extends TableCellData {
  key: string
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
  const sortEnabled = computed(() => doc.value?.table?.sortable === true)
  const searchEnabled = computed(() => doc.value?.table?.searchable === true)
  const showCount = computed(() => doc.value?.table?.showCount === true)

  // The state of the visitor's controls
  const page = ref(1)
  const visible = ref(pagination.value.rowsPerPage)
  const query = ref('')
  const sort = ref<TableSort | null>(null)

  const rowData = computed(() => buildTableRows(records.value, columns.value, editor.page?.locale))
  const view = computed(() => computeTableView(
    {
      columns: columns.value,
      rows: rowData.value,
      pagination: pagination.value,
      sortable: sortEnabled.value,
      searchable: searchEnabled.value,
      countText: doc.value?.table?.countText,
    },
    { query: query.value, sort: sort.value, page: page.value, visible: visible.value },
  ))

  watch(records, () => { page.value = 1; visible.value = pagination.value.rowsPerPage })
  watch([query, sort], () => { page.value = 1; visible.value = pagination.value.rowsPerPage })
  watch(() => pagination.value.rowsPerPage, (n) => { visible.value = n })
  watch(() => view.value.pages, (p) => { if (page.value > p) page.value = p })

  const rows = computed(() => view.value.rows.map((r, i) => ({
    key: i,
    cells: r.cells.map((c, j): BoundCell => ({ ...c, key: columns.value[j].id, cellClass: columns.value[j].cellClass })),
  })))

  const total = computed(() => view.value.total)
  const recordCount = computed(() => records.value.length)
  const pages = computed(() => view.value.pages)
  const needsControls = computed(() => view.value.needsControls)
  const countLabel = computed(() => view.value.countLabel)
  const hasFooter = computed(() => needsControls.value || showCount.value)
  const searching = computed(() => view.value.searching)

  const canSort = (col: { sortable?: boolean }) => sortEnabled.value && col.sortable !== false
  function setSort(col: { field: string; sortable?: boolean }) {
    if (canSort(col)) sort.value = nextSort(sort.value, col.field)
  }
  const ariaSort = (col: { field: string }) => ariaSortOf(view.value.sort, col.field)
  const sortMark = (col: { field: string }) => sortMarkOf(view.value.sort, col.field)

  function prev() { page.value = Math.max(1, page.value - 1) }
  function next() { page.value = Math.min(pages.value, page.value + 1) }
  function more() { visible.value = Math.min(visible.value + pagination.value.rowsPerPage, total.value) }

  return {
    binding, isBound, records, columns, rows, pagination, page, pages, visible, total, recordCount, needsControls, prev, next, more,
    countLabel, showCount, hasFooter,
    query, searchEnabled, searching, sortEnabled, canSort, setSort, ariaSort, sortMark,
  }
}
