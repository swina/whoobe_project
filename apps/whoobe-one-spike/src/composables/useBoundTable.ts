// What a Table element draws when it is bound to a list (the element's own `dataBinding` or `gatewayBinding`, set from the toolbar):
// the columns, one row per record with each cell read and formatted, and the page of rows to show. Shared by BlockTable.vue
// (editor canvas) and preview/BlockTablePreview.vue (preview and published pages) so both draw the same thing. The pure rules
// are in @whoobe-cms/schema (table-binding.ts); this file only adds the reactive state and the field transforms.
import { computed, ref, watch, type Ref } from 'vue'
import {
  columnsFromRecords,
  pageCount,
  pageRows,
  paginationOf,
  plainCellText,
  tableCellValue,
  tableRecords,
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
  const total = computed(() => records.value.length)
  const pages = computed(() => pageCount(total.value, pagination.value.rowsPerPage))
  const shown = computed(() => pageRows(records.value, pagination.value, page.value, visible.value))
  const needsControls = computed(() => pagination.value.rowsPerPage > 0 && total.value > pagination.value.rowsPerPage)

  watch(records, () => { page.value = 1; visible.value = pagination.value.rowsPerPage })
  watch(() => pagination.value.rowsPerPage, (n) => { visible.value = n })
  watch(pages, (p) => { if (page.value > p) page.value = p })
  visible.value = pagination.value.rowsPerPage

  function cellsOf(record: unknown): BoundCell[] {
    return columns.value.map((col) => {
      const raw = tableCellValue(record, col.field)
      const result = col.transform && col.transform.type !== 'none'
        ? applyTransform(raw, col.transform, editor.page?.locale)
        : ({ kind: 'text', text: plainCellText(raw) } as TransformResult)
      return { key: col.id, result, cellClass: col.cellClass }
    })
  }

  const rows = computed(() => shown.value.map((record, i) => ({ key: i, cells: cellsOf(record) })))

  function prev() { page.value = Math.max(1, page.value - 1) }
  function next() { page.value = Math.min(pages.value, page.value + 1) }
  function more() { visible.value = Math.min(visible.value + pagination.value.rowsPerPage, total.value) }

  return { binding, isBound, records, columns, rows, pagination, page, pages, visible, total, needsControls, prev, next, more }
}
