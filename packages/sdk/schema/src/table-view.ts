// What a bound Table shows, as pure functions: the rows (every cell already text or a checked link, with the raw sort key and the
// normalised search text) and the VIEW of those rows for a given state of the visitor's controls (search words, sort, page). The editor
// and the SDK adapters (React, Vue, Svelte) all call these two functions, so a table cannot behave differently depending on where it is drawn;
// an adapter only keeps the state (four values) and draws the markup. See docs/plans/cms/table-element-sdk-plan.md section 3.2.

import { applyTransform, type FieldTransform } from './transform.js'
import {
  compareCellValues,
  formatRowCount,
  matchesTerms,
  nextSort,
  normalizeSearchText,
  pageCount,
  pageRows,
  plainCellText,
  rowRange,
  searchTerms,
  tableCellValue,
  type PaginationSettings,
  type TableSort,
} from './table-binding.js'

export type SortKey = string | number | boolean | null

export interface TableCellData {
  text: string
  /** A checked address (the "turn into link" format); absent for plain text. */
  href?: string
  target?: string
  /** Classes of a "map value to label/class" format. */
  className?: string
}

export interface TableRowData {
  cells: TableCellData[]
  /** The comparable value of each cell, for sorting (a number stays a number). */
  sortKeys: SortKey[]
  /** Normalised text of the searchable columns, ready to be matched. */
  search: string
}

/** What building rows needs to know about a column. */
export interface TableRowColumn {
  field: string
  searchable?: boolean
  transform?: FieldTransform | null
}

function sortKeyOf(raw: unknown): SortKey {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number' || typeof raw === 'boolean') return raw
  const text = plainCellText(raw)
  return text === '' ? null : text
}

/** One pre-formatted row per record. `searchable: false` on a column keeps it out of the search text. */
export function buildTableRows(records: unknown[], columns: TableRowColumn[], locale?: string): TableRowData[] {
  return records.map((record) => {
    const cells: TableCellData[] = []
    const sortKeys: SortKey[] = []
    const searchParts: string[] = []
    for (const col of columns) {
      const raw = tableCellValue(record, col.field)
      sortKeys.push(sortKeyOf(raw))
      let cell: TableCellData
      if (col.transform && col.transform.type !== 'none') {
        const r = applyTransform(raw, col.transform, locale)
        cell = r.kind === 'link'
          ? { text: r.text, href: r.href, ...(r.target ? { target: r.target } : {}) }
          : { text: r.text, ...(r.className ? { className: r.className } : {}) }
      } else {
        cell = { text: plainCellText(raw) }
      }
      cells.push(cell)
      if (col.searchable !== false) searchParts.push(cell.text)
    }
    return { cells, sortKeys, search: normalizeSearchText(searchParts.join(' ')) }
  })
}

export interface TableViewColumn {
  field: string
  sortable?: boolean
}

export interface TableViewInput {
  columns: TableViewColumn[]
  rows: TableRowData[]
  pagination: Pick<PaginationSettings, 'rowsPerPage' | 'mode'>
  sortable: boolean
  searchable: boolean
  countText?: string
}

export interface TableViewState {
  query: string
  sort: TableSort | null
  /** 1-based, standard pagination. */
  page: number
  /** Rows revealed so far, lazyload pagination. */
  visible: number
}

export interface TableView {
  /** The rows to draw now. */
  rows: TableRowData[]
  /** Rows in the result (after the search). */
  total: number
  /** Rows before the search. */
  all: number
  pages: number
  /** The page actually shown (the state's, kept inside the range). */
  page: number
  from: number
  to: number
  countLabel: string
  /** Pagination controls are needed (more rows than one page). */
  needsControls: boolean
  /** A search is narrowing the list. */
  searching: boolean
  /** The sort that is applied (a sort on a column that is gone or switched off is not). */
  sort: TableSort | null
}

/** Rows ordered by the key at `index`; stable, and empty keys last whatever the direction. */
function sortRowsByKey(rows: TableRowData[], index: number, direction: 'asc' | 'desc'): TableRowData[] {
  const sign = direction === 'desc' ? -1 : 1
  return rows
    .map((row, i) => ({ row, i, key: row.sortKeys[index] ?? null }))
    .sort((x, y) => {
      const xe = x.key === null
      const ye = y.key === null
      if (xe || ye) return xe && ye ? x.i - y.i : xe ? 1 : -1
      return sign * compareCellValues(x.key, y.key) || x.i - y.i
    })
    .map((k) => k.row)
}

/** The view of the rows for the state of the controls: search, then sort, then the page; and the text of the counter. */
export function computeTableView(input: TableViewInput, state: TableViewState): TableView {
  const terms = input.searchable ? searchTerms(state.query) : []
  const filtered = terms.length ? input.rows.filter((r) => matchesTerms(r.search, terms)) : input.rows

  let applied: TableSort | null = null
  let ordered = filtered
  if (input.sortable && state.sort) {
    const index = input.columns.findIndex((c) => c.field === state.sort!.field && c.sortable !== false)
    if (index >= 0) {
      applied = state.sort
      ordered = sortRowsByKey(filtered, index, state.sort.direction)
    }
  }

  const total = ordered.length
  const rpp = input.pagination.rowsPerPage
  const pages = pageCount(total, rpp)
  const page = Math.min(Math.max(1, Math.floor(state.page) || 1), pages)
  const rows = pageRows(ordered, input.pagination, page, state.visible)
  const { from, to } = rowRange(total, input.pagination, page, rows.length)
  return {
    rows, total, all: input.rows.length, pages, page, from, to,
    countLabel: formatRowCount(input.countText, { from, to, total, all: input.rows.length }),
    needsControls: rpp > 0 && total > rpp,
    searching: terms.length > 0,
    sort: applied,
  }
}

/** `aria-sort` of a column header for the sort that is applied. */
export function ariaSortOf(sort: TableSort | null, field: string): 'ascending' | 'descending' | 'none' {
  return sort && sort.field === field ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
}

/** The mark drawn next to a sortable header. */
export function sortMarkOf(sort: TableSort | null, field: string): string {
  const a = ariaSortOf(sort, field)
  return a === 'ascending' ? '▲' : a === 'descending' ? '▼' : '↕'
}

// --- the state machine of the controls (shared by every adapter) ---

export type TableViewAction =
  | { type: 'query'; value: string }
  | { type: 'sort'; field: string }
  | { type: 'prev' }
  | { type: 'next' }
  | { type: 'more' }

export function initialTableState(pagination: Pick<PaginationSettings, 'rowsPerPage'>): TableViewState {
  return { query: '', sort: null, page: 1, visible: pagination.rowsPerPage }
}

/** The next state for an action of the visitor. A new search or sort goes back to the first page / the first rows; paging stays inside the
 *  range of the CURRENT result (`view`, computed from `state`). A sort on a column that cannot be sorted changes nothing. */
export function reduceTableState(state: TableViewState, action: TableViewAction, input: TableViewInput, view: TableView): TableViewState {
  const rpp = input.pagination.rowsPerPage
  switch (action.type) {
    case 'query':
      return { ...state, query: action.value, page: 1, visible: rpp }
    case 'sort': {
      const col = input.columns.find((c) => c.field === action.field)
      if (!input.sortable || !col || col.sortable === false) return state
      return { ...state, sort: nextSort(state.sort, action.field), page: 1, visible: rpp }
    }
    case 'prev':
      return { ...state, page: Math.max(1, view.page - 1) }
    case 'next':
      return { ...state, page: Math.min(view.pages, view.page + 1) }
    case 'more':
      return { ...state, visible: Math.min(Math.max(state.visible, rpp) + rpp, view.total) }
  }
}
