// CSV/XLSX/JSON export for the Data Objects list view - one of the
// requirements in docs/plans/datamodel/data-objects-views-editing.md.
// Rows are pre-flattened by the caller (ObjectsView.vue) into plain
// records keyed by column label, so this module has no knowledge of
// DataObject/ClassFieldDefinition shapes.
import * as XLSX from 'xlsx'

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value)
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

export function exportRowsAsCsv(rows: Record<string, unknown>[], filenameBase: string) {
  if (rows.length === 0) return
  const columns = Object.keys(rows[0])
  const lines = [columns.join(','), ...rows.map((row) => columns.map((col) => csvEscape(row[col])).join(','))]
  triggerDownload(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }), `${filenameBase}.csv`)
}

export function exportRowsAsJson(rows: Record<string, unknown>[], filenameBase: string) {
  triggerDownload(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }), `${filenameBase}.json`)
}

export function exportRowsAsXlsx(rows: Record<string, unknown>[], filenameBase: string) {
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Objects')
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  triggerDownload(new Blob([buffer], { type: 'application/octet-stream' }), `${filenameBase}.xlsx`)
}
