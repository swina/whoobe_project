// The pure parts of a data-bound Table element: which columns to show, how a cell value is read from a record, and how a
// list is cut into pages. No Vue and no network: the editor's table components (and, later, the headless adapters) feed
// them the records a binding resolved. The binding itself is the element's ordinary `dataBinding` (a Data Class query) or
// `gatewayBinding` (an array in a gateway reply); this file only decides what to draw from the result.

export interface TableColumn {
  id: string
  /** Text of the header cell. */
  header: string
  /** Attribute of a Data Object, or a dot path (`address.city`, `items[0].name`) into a gateway item or a system field. */
  field: string
  cellClass?: string
  headerCellClass?: string
  /** false = the visitor cannot sort by this column (when the table is sortable). */
  sortable?: boolean
  /** false = the search box does not look at this column (when the table is searchable). */
  searchable?: boolean
}

export type PaginationMode = 'standard' | 'lazyload'

export interface PaginationSettings {
  /** 0 = no pagination: the whole working set is drawn. */
  rowsPerPage: number
  mode: PaginationMode
  loadMoreText: string
  loadMoreClass: string
  containerClass: string
}

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** A resolved binding is usable as table rows only when it is an array. */
export function tableRecords(resolved: unknown): unknown[] {
  return Array.isArray(resolved) ? resolved : []
}

/** Walks `a.b[0].c`; own properties only, never `__proto__` / `constructor` / `prototype`. */
function walkPath(value: unknown, path: string): unknown {
  let current: unknown = value
  for (const part of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    const m = /^([^[\]]+)\[(\d+)\]$/.exec(part)
    const key = m ? m[1] : part
    if (!key || BLOCKED_KEYS.has(key) || !own(current as object, key)) return undefined
    current = (current as Record<string, unknown>)[key]
    if (m) {
      if (!Array.isArray(current)) return undefined
      current = current[Number(m[2])]
    }
  }
  return current
}

/** The value of a column in one record. A Data Object keeps its fields in `attributes`; those win over a system field of the
 *  same name. Anything else (a gateway item) is read by path from the record itself. */
export function tableCellValue(record: unknown, field: string): unknown {
  const f = field.trim()
  if (!f || !isObject(record)) return undefined
  const attrs = record.attributes
  if (isObject(attrs)) {
    if (own(attrs, f) && !BLOCKED_KEYS.has(f)) return attrs[f]
    const viaAttrs = walkPath(attrs, f)
    if (viaAttrs !== undefined) return viaAttrs
  }
  return walkPath(record, f)
}

/** Text shown for a plain value (no transform): scalars as written, a list of scalars joined, anything else empty. */
export function plainCellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) {
    const parts = value.filter((v) => ['string', 'number', 'boolean'].includes(typeof v)).map((v) => String(v))
    return parts.join(', ')
  }
  return ''
}

const humanize = (key: string): string => {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim()
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key
}

/** Columns to offer when none were configured: the scalar fields of the first record, at most `max`. */
export function columnsFromRecords(records: unknown[], max = 12): { field: string; header: string }[] {
  const first = records.find(isObject)
  if (!first) return []
  const source = isObject(first.attributes) ? first.attributes : first
  const out: { field: string; header: string }[] = []
  for (const [key, value] of Object.entries(source)) {
    if (out.length >= max) break
    if (BLOCKED_KEYS.has(key)) continue
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) out.push({ field: key, header: humanize(key) })
  }
  return out
}

/** Pagination settings of whichever binding feeds the table (same fields on a Data Class and a gateway binding). */
export function paginationOf(binding: unknown): PaginationSettings {
  const b = isObject(binding) ? binding : {}
  const rows = Math.floor(Number(b.rowsPerPage))
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
  return {
    rowsPerPage: Number.isFinite(rows) && rows > 0 ? Math.min(rows, 1000) : 0,
    mode: b.paginationMode === 'lazyload' ? 'lazyload' : 'standard',
    loadMoreText: str(b.loadMoreText) || 'More',
    loadMoreClass: str(b.loadMoreClass) || 'px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50',
    containerClass: str(b.paginationContainerClass) || 'w-full flex flex-col items-center justify-center md:gap-3 gap-2 md:p-4 p-2',
  }
}

export function pageCount(total: number, rowsPerPage: number): number {
  return rowsPerPage > 0 ? Math.max(1, Math.ceil(total / rowsPerPage)) : 1
}

/** The rows to draw. `page` is 1-based (standard mode); `visible` is how many rows are shown so far (lazyload mode). */
export function pageRows<T>(items: T[], p: Pick<PaginationSettings, 'rowsPerPage' | 'mode'>, page: number, visible: number): T[] {
  if (p.rowsPerPage <= 0) return items
  if (p.mode === 'lazyload') return items.slice(0, Math.max(p.rowsPerPage, visible))
  const pages = pageCount(items.length, p.rowsPerPage)
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages)
  const start = (current - 1) * p.rowsPerPage
  return items.slice(start, start + p.rowsPerPage)
}

// --- editing the columns (the Columns panel of the editor) ---
// Pure, and they return a new list: the author's columns (headers, formats, classes, order) are never replaced by a fresh set.

/** Adds the column of `field` if there is none, removes it if there is one. The last column is never removed: with none the
 *  table would fall back to showing every field. */
export function toggleColumnField<C extends { field: string }>(columns: C[], field: string, make: () => C): C[] {
  const i = columns.findIndex((c) => c.field === field)
  if (i < 0) return [...columns, make()]
  if (columns.length <= 1) return columns
  return columns.filter((_, k) => k !== i)
}

/** The available fields that are not a column yet, in the order they are offered. */
export function missingColumnFields<F extends { field: string }>(columns: { field: string }[], available: F[]): F[] {
  const have = new Set(columns.map((c) => c.field))
  return available.filter((f) => !have.has(f.field))
}

/** Appends a column for each missing field; the existing ones stay as they are. */
export function appendMissingColumns<C extends { field: string }, F extends { field: string }>(columns: C[], available: F[], make: (f: F) => C): C[] {
  return [...columns, ...missingColumnFields(columns, available).map(make)]
}

// --- sorting and searching (the visitor's side) ---
// Both act on the whole list, before it is cut into pages.

export type SortDirection = 'asc' | 'desc'
export interface TableSort { field: string; direction: SortDirection }

/** What a click on a header does: unsorted -> ascending -> descending -> unsorted; a click on another column starts it ascending. */
export function nextSort(current: TableSort | null, field: string): TableSort | null {
  if (!current || current.field !== field) return { field, direction: 'asc' }
  return current.direction === 'asc' ? { field, direction: 'desc' } : null
}

const isEmptyValue = (v: unknown): boolean => v === null || v === undefined || v === ''

/** Order of two non-empty cell values: numbers as numbers, yes/no as 0/1, everything else as text with numbers inside it in
 *  numeric order ("item 2" before "item 10") and without regard to case or accents. */
export function compareCellValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return plainCellText(a).localeCompare(plainCellText(b), undefined, { numeric: true, sensitivity: 'base' })
}

/** A sorted copy; the original order stays for equal values. Empty values are always last, whatever the direction. */
export function sortRecords<T>(records: T[], sort: TableSort | null): T[] {
  if (!sort || !sort.field.trim()) return records
  const keyed = records.map((record, index) => ({ record, index, value: tableCellValue(record, sort.field) }))
  const sign = sort.direction === 'desc' ? -1 : 1
  keyed.sort((x, y) => {
    const xe = isEmptyValue(x.value)
    const ye = isEmptyValue(y.value)
    if (xe || ye) return xe && ye ? x.index - y.index : xe ? 1 : -1
    return sign * compareCellValues(x.value, y.value) || x.index - y.index
  })
  return keyed.map((k) => k.record)
}

/** Lower case, without accents, spaces collapsed: both the text searched and the words typed go through it. */
export function normalizeSearchText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** The words of a query (all of them must be found), at most 8. */
export function searchTerms(query: string): string[] {
  const n = normalizeSearchText(query)
  return n ? n.split(' ').slice(0, 8) : []
}

/** `haystack` must already be normalized. */
export function matchesTerms(haystack: string, terms: string[]): boolean {
  return terms.every((t) => haystack.includes(t))
}

// --- the row counter ("Showing 1-10 of 87") ---

/** The rows on screen, 1-based and inclusive: `shown` is how many rows are drawn now, `page` the current page (standard mode). */
export function rowRange(total: number, p: Pick<PaginationSettings, 'rowsPerPage' | 'mode'>, page: number, shown: number): { from: number; to: number } {
  if (total <= 0 || shown <= 0) return { from: 0, to: 0 }
  if (p.rowsPerPage <= 0 || p.mode === 'lazyload') return { from: 1, to: Math.min(shown, total) }
  const pages = pageCount(total, p.rowsPerPage)
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages)
  const from = (current - 1) * p.rowsPerPage + 1
  return { from, to: Math.min(from + shown - 1, total) }
}

export const DEFAULT_COUNT_TEXT = 'Showing {from}–{to} of {total}'
export const DEFAULT_COUNT_TEXT_FILTERED = 'Showing {from}–{to} of {total} (filtered from {all})'
export const DEFAULT_COUNT_TEXT_NONE = 'No records'

/** The text of the counter. Placeholders: {from} {to} {total} (rows in the result) {all} (rows before the search). Plain text: the
 *  caller shows it as text, never as HTML. Without a `pattern`, a default is used (one for a filtered result, one for no record). */
export function formatRowCount(
  pattern: string | undefined,
  n: { from: number; to: number; total: number; all: number },
): string {
  const custom = typeof pattern === 'string' && pattern.trim() ? pattern : ''
  const template = custom
    || (n.total === 0 ? DEFAULT_COUNT_TEXT_NONE : n.total !== n.all ? DEFAULT_COUNT_TEXT_FILTERED : DEFAULT_COUNT_TEXT)
  const values: Record<string, number> = { from: n.from, to: n.to, total: n.total, all: n.all }
  return template.replace(/\{(from|to|total|all)\}/g, (_, k: string) => String(values[k]))
}
