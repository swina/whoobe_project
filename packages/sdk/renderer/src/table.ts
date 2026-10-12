// The Table element as a render descriptor (docs/plans/cms/table-element-sdk-plan.md, phase 2). Pure TS, no framework imports, fully
// serialisable: it crosses the server-rendering boundary into the adapters' components.
//
// Two shapes. A typed grid carries its cells as sanitised HTML. A table bound to a list (the element's `dataBinding` Data Class query or
// `gatewayBinding` array) carries one PRE-FORMATTED row per record: every cell already text (or a checked link), plus the raw sort key of the
// cell and the row's normalised search text. So an adapter needs no field reader and no transformer engine; the rules for paging, sorting,
// searching and the counter are in table-binding.ts (shared with the editor).

import {
  applyTransform,
  columnsFromRecords,
  normalizeSearchText,
  paginationOf,
  plainCellText,
  sanitizeRichText,
  tableCellValue,
  tableRecords,
  type ElementTable,
  type PaginationSettings,
  type TableCell,
  type TableColumnConfig,
  type WhoobeElementNode,
} from '@whoobe-cms/schema'
import type { RenderApi } from './api-client.js'
import { resolveDataBinding, resolveGatewayBinding } from './resolve.js'

export const DEFAULT_TABLE_MAX_ROWS = 1000

export interface TableGridCell { html: string; colspan: number; rowspan: number; className?: string }
export type SortKey = string | number | boolean | null

export interface TableBoundCell {
  text: string
  /** A checked address (the "turn into link" format); absent for plain text. */
  href?: string
  target?: string
  /** Classes of a "map value to label/class" format. */
  className?: string
}

export interface TableDescriptorColumn {
  id: string
  header: string
  field: string
  headerClass?: string
  cellClass?: string
  sortable: boolean
  searchable: boolean
}

export interface TableBoundRow {
  cells: TableBoundCell[]
  /** The comparable value of each cell, for sorting (a number stays a number). */
  sortKeys: SortKey[]
  /** Normalised text of the searchable columns, ready to be matched. */
  search: string
}

export interface TableDescriptor {
  mode: 'static' | 'bound'
  caption: string
  hasHeader: boolean
  hasFooter: boolean
  classes: { headerRow: string; bodyRow: string; footerRow: string; headerCell: string; bodyCell: string; footerCell: string }
  grid?: { header: TableGridCell[]; body: TableGridCell[][]; footer: TableGridCell[] }
  bound?: {
    columns: TableDescriptorColumn[]
    rows: TableBoundRow[]
    /** Rows the list had before the cap; `truncated` when some were left out. */
    totalRows: number
    truncated: boolean
    emptyText: string
    sortable: boolean
    searchable: boolean
    searchPlaceholder: string
    searchClass: string
    showCount: boolean
    countText: string
    countClass: string
    pagination: PaginationSettings
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function gridCell(cell: TableCell): TableGridCell | null {
  if (cell.merged) return null
  const colspan = Number.isInteger(cell.colspan) && (cell.colspan as number) > 1 ? (cell.colspan as number) : 1
  const rowspan = Number.isInteger(cell.rowspan) && (cell.rowspan as number) > 1 ? (cell.rowspan as number) : 1
  return { html: sanitizeRichText(cell.content ?? ''), colspan, rowspan, ...(cell.cellClass ? { className: cell.cellClass } : {}) }
}

const gridRow = (cells: TableCell[] | undefined): TableGridCell[] =>
  (Array.isArray(cells) ? cells : []).map(gridCell).filter((c): c is TableGridCell => c !== null)

function sortKeyOf(raw: unknown): SortKey {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number' || typeof raw === 'boolean') return raw
  const text = plainCellText(raw)
  return text === '' ? null : text
}

async function resolveRecords(
  node: WhoobeElementNode,
  scope: { ctx: Record<string, unknown>; api: RenderApi },
  options: { gatewayUrl?: string; urlParams?: Record<string, string>; gatewaySiteAuth?: unknown },
): Promise<{ bound: boolean; records: unknown[] }> {
  // a gateway array wins over a Data Class query, as in the editor; a Data Class binding with a `field` is a single value, not a list
  try {
    if (node.gatewayBinding) {
      const resolved = await resolveGatewayBinding(node.gatewayBinding as never, options.gatewayUrl || 'http://localhost:3001', options.urlParams, options.gatewaySiteAuth as never)
      return { bound: true, records: tableRecords(resolved) }
    }
    if (node.dataBinding && !node.dataBinding.field) {
      const resolved = await resolveDataBinding(node.dataBinding, scope as never)
      return { bound: true, records: tableRecords(resolved.records) }
    }
  } catch {
    // an unreachable API shows the empty text, not a broken page
    return { bound: true, records: [] }
  }
  return { bound: false, records: [] }
}

/** Builds the descriptor of a Table node. Resolves its list when it has one. */
export async function buildTableDescriptor(
  node: WhoobeElementNode,
  scope: { ctx: Record<string, unknown>; api: RenderApi },
  options: { maxRows?: number; gatewayUrl?: string; urlParams?: Record<string, string>; gatewaySiteAuth?: unknown },
): Promise<TableDescriptor | null> {
  const t = (node.table ?? null) as ElementTable | null
  if (!t) return null

  const base = {
    caption: str(t.caption),
    hasHeader: t.hasHeader !== false,
    hasFooter: t.hasFooter === true,
    classes: {
      headerRow: str(t.headerRowClass), bodyRow: str(t.bodyRowClass), footerRow: str(t.footerRowClass),
      headerCell: str(t.headerCellClass), bodyCell: str(t.bodyCellClass), footerCell: str(t.footerCellClass),
    },
  }

  const { bound, records: all } = await resolveRecords(node, scope, options)
  if (!bound) {
    return {
      mode: 'static', ...base,
      grid: { header: gridRow(t.header), body: (Array.isArray(t.body) ? t.body : []).map(gridRow), footer: gridRow(t.footer) },
    }
  }

  const cap = Number.isInteger(options.maxRows) && (options.maxRows as number) > 0 ? (options.maxRows as number) : DEFAULT_TABLE_MAX_ROWS
  const records = all.slice(0, cap)
  const configured: TableColumnConfig[] = Array.isArray(t.columns) ? t.columns : []
  const columns: (TableDescriptorColumn & { transform?: TableColumnConfig['transform'] })[] = configured.length
    ? configured.map((c) => ({
        id: c.id, header: c.header, field: c.field,
        ...(c.headerCellClass ? { headerClass: c.headerCellClass } : {}), ...(c.cellClass ? { cellClass: c.cellClass } : {}),
        sortable: c.sortable !== false, searchable: c.searchable !== false, transform: c.transform,
      }))
    : columnsFromRecords(records).map((c, i) => ({ id: `detected-${i}`, header: c.header, field: c.field, sortable: true, searchable: true }))

  const rows: TableBoundRow[] = records.map((record) => {
    const cells: TableBoundCell[] = []
    const sortKeys: SortKey[] = []
    const searchParts: string[] = []
    for (const col of columns) {
      const raw = tableCellValue(record, col.field)
      sortKeys.push(sortKeyOf(raw))
      let cell: TableBoundCell
      if (col.transform && col.transform.type !== 'none') {
        const r = applyTransform(raw, col.transform)
        cell = r.kind === 'link'
          ? { text: r.text, href: r.href, ...(r.target ? { target: r.target } : {}) }
          : { text: r.text, ...(r.className ? { className: r.className } : {}) }
      } else {
        cell = { text: plainCellText(raw) }
      }
      cells.push(cell)
      if (col.searchable) searchParts.push(cell.text)
    }
    return { cells, sortKeys, search: normalizeSearchText(searchParts.join(' ')) }
  })

  return {
    mode: 'bound', ...base,
    bound: {
      columns: columns.map(({ transform: _t, ...c }) => c),
      rows,
      totalRows: all.length,
      truncated: all.length > records.length,
      emptyText: str(t.emptyText),
      sortable: t.sortable === true,
      searchable: t.searchable === true,
      searchPlaceholder: str(t.searchPlaceholder),
      searchClass: str(t.searchClass),
      showCount: t.showCount === true,
      countText: str(t.countText),
      countClass: str(t.countClass),
      pagination: paginationOf(node.gatewayBinding ?? node.dataBinding),
    },
  }
}
