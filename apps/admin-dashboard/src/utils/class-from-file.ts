// "+ From file" in ClassSettingsCard.vue: read a JSON, CSV or TSV file and propose the fields of a Data Class from its columns (the keys
// of the records for JSON). Only the structure is used: the type of each column is guessed from its values and can be changed in the
// wizard before the class is created. The rows can then be imported as Data Objects (`attributesOfRow`), as drafts.
import type { ClassFieldDefinition } from '@whoobe-cms/core'

export type Row = Record<string, unknown>

export interface ParsedFile {
  /** The arrays of a JSON object; one entry for CSV/TSV and a plain JSON array. */
  tables: { name: string; rows: Row[] }[]
}

/** The field types a column can be given in the wizard. */
export const FILE_FIELD_TYPES = [
  { value: 'input', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'wysiwyg', label: 'Rich text' },
  { value: 'numeric', label: 'Number' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'date', label: 'Date' },
  { value: 'email', label: 'Email' },
  { value: 'urlSlug', label: 'Slug (URL)' },
  { value: 'select', label: 'Select (single)' },
  { value: 'array', label: 'Array (list)' },
  { value: 'json', label: 'Object (JSON)' },
] as const

const isRecord = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)

/** JSON: an array of records, an object holding arrays of records (one table each), or a single record. */
export function tablesFromJson(data: unknown): ParsedFile['tables'] {
  if (Array.isArray(data)) return data.length && data.every(isRecord) ? [{ name: 'data', rows: data }] : []
  if (!isRecord(data)) return []
  const tables = Object.entries(data)
    .filter(([, v]) => Array.isArray(v) && v.length && v.every(isRecord))
    .map(([name, v]) => ({ name, rows: v as Row[] }))
  return tables.length ? tables : [{ name: 'data', rows: [data] }]
}

/** The lists of records in a response: the body itself when it is an array of objects, and arrays of objects held by its keys (up to 3 levels). */
export function findRecordLists(body: unknown): { path: string; rows: Row[] }[] {
  const out: { path: string; rows: Row[] }[] = []
  const walk = (v: unknown, path: string, depth: number) => {
    if (Array.isArray(v)) {
      if (v.length && v.every(isRecord)) out.push({ path, rows: v })
      return
    }
    if (isRecord(v) && depth < 3) for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k, depth + 1)
  }
  walk(body, '', 0)
  // a single record answer (GET /thing/1): one row
  if (!out.length && isRecord(body)) out.push({ path: '(the response itself)', rows: [body] })
  return out
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'json') {
    let data: unknown
    try { data = JSON.parse(await file.text()) } catch { throw new Error('This is not valid JSON.') }
    const tables = tablesFromJson(data)
    if (!tables.length) throw new Error('Expected a JSON array of objects (or an object holding such arrays).')
    return { tables }
  }
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
    const rows = rowsFromDelimited(await file.text(), ext === 'tsv' ? '\t' : undefined)
    if (!rows.length) throw new Error('No rows found: the first row must hold the column names, with data below it.')
    return { tables: [{ name: 'data', rows }] }
  }
  throw new Error('Use a .json, .csv or .tsv file.')
}

/** Cells of a delimited text (RFC 4180 quoting). The delimiter is guessed from the first line when not given. */
export function parseDelimited(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^\uFEFF/, '')
  const first = text.split(/\r?\n/, 1)[0]
  const d = delimiter ?? ([',', ';', '\t'].map((c) => [c, first.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0])
  const out: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else quoted = false } else cell += c
    } else if (c === '"' && cell === '') quoted = true
    else if (c === d) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((x) => x !== '')) out.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x !== '')) out.push(row)
  return out
}

/** Records of a delimited text: the first line names the columns; empty cells are null, plain numbers numbers, true/false booleans. */
export function rowsFromDelimited(input: string, delimiter?: string): Row[] {
  const [head, ...body] = parseDelimited(input, delimiter)
  if (!head) return []
  const names = head.map((h, i) => h.trim() || `column_${i + 1}`)
  return body.map((cells) => {
    const r: Row = {}
    names.forEach((n, i) => {
      const v = cells[i] ?? ''
      r[n] = v === '' ? null : /^-?(0|[1-9]\d*)(\.\d+)?$/.test(v) ? Number(v) : /^(true|false)$/i.test(v) ? v.toLowerCase() === 'true' : v
    })
    return r
  })
}

export interface ProposedField {
  /** Column name in the file. */
  column: string
  name: string
  title: string
  fieldType: string
  options: string[]
  include: boolean
  /** A few values, to recognise the column. */
  samples: string[]
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/
// an opening, closing or self-closing tag (`<p>`, `</div>`, `<br/>`, `<a href="..">`): not a bare `a < b`
const HTML_RE = /<\/?[a-z][a-z0-9-]*(\s[^<>]*)?\/?>/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** `First name` -> `firstName`, ASCII only, starting with a letter. */
export function identifierOf(header: string): string {
  const words = header.normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean)
  const id = words.map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1))).join('')
  return /^[A-Za-z]/.test(id) ? id : `field${id ? id.charAt(0).toUpperCase() + id.slice(1) : ''}`
}

export function pascalOf(text: string): string {
  const id = identifierOf(text)
  return id.charAt(0).toUpperCase() + id.slice(1)
}

const text = (v: unknown): string => (v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v))

/** Guess a field type from the non-empty values of one column. */
export function guessType(values: unknown[], column: string): { fieldType: string; options: string[] } {
  const v = values.filter((x) => x !== null && x !== undefined && x !== '')
  const plain = { options: [] as string[] }
  if (!v.length) return { fieldType: 'input', ...plain }
  if (v.every((x) => typeof x === 'boolean')) return { fieldType: 'checkbox', ...plain }
  if (v.every((x) => typeof x === 'number')) return { fieldType: 'numeric', ...plain }
  if (v.every((x) => x instanceof Date || (typeof x === 'string' && DATE_RE.test(x)))) return { fieldType: 'date', ...plain }
  if (v.every((x) => Array.isArray(x) && x.every((i) => typeof i === 'string'))) return { fieldType: 'array', ...plain }
  if (v.every((x) => typeof x === 'object' && !(x instanceof Date))) return { fieldType: 'json', ...plain }
  if (v.every((x) => typeof x === 'string' && EMAIL_RE.test(x))) return { fieldType: 'email', ...plain }
  const strings = v.map(text)
  // a value with HTML in it: rich text (even if only some of the records have markup)
  if (strings.some((x) => HTML_RE.test(x))) return { fieldType: 'wysiwyg', ...plain }
  if (/^slug$/i.test(column)) return { fieldType: 'urlSlug', ...plain }
  if (strings.some((s) => s.length > 120 || s.includes('\n'))) return { fieldType: 'textarea', ...plain }
  // a short, repeated list of values (a status, a size): a select with those options
  const distinct = [...new Set(strings)]
  if (v.length >= 10 && distinct.length <= 8 && distinct.length <= v.length / 2 && distinct.every((s) => s.length <= 40)) return { fieldType: 'select', options: distinct.sort() }
  return { fieldType: 'input', ...plain }
}

export function proposeFields(rows: Row[]): ProposedField[] {
  const columns: string[] = []
  for (const row of rows) for (const k of Object.keys(row)) if (!columns.includes(k)) columns.push(k)
  const used = new Set<string>()
  return columns.filter((c) => !c.startsWith('__EMPTY')).map((column) => {
    const values = rows.map((r) => r[column])
    let name = identifierOf(column)
    for (let i = 2; used.has(name); i++) name = `${identifierOf(column)}${i}`
    used.add(name)
    const { fieldType, options } = guessType(values, column)
    const samples = values.filter((x) => x !== null && x !== undefined && x !== '').slice(0, 3).map((x) => text(x).slice(0, 40))
    return { column, name, title: column.trim() || name, fieldType, options, include: true, samples }
  })
}

/** The class fields of the ticked columns (names made unique and valid by the caller's checks). */
export function fieldsOfProposal(fields: ProposedField[]): ClassFieldDefinition[] {
  return fields.filter((f) => f.include).map((f) => ({
    name: f.name,
    title: f.title.trim() || f.name,
    fieldType: f.fieldType,
    ...(f.fieldType === 'select' && f.options.length ? { options: f.options } : {}),
  }))
}

/** What stops the class from being created, or null. */
export function proposalProblem(fields: ProposedField[]): string | null {
  const on = fields.filter((f) => f.include)
  if (!on.length) return 'Select at least one column.'
  const bad = on.find((f) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(f.name))
  if (bad) return `"${bad.name}" is not a valid field name (letters, digits and _, starting with a letter).`
  const seen = new Set<string>()
  for (const f of on) {
    if (seen.has(f.name)) return `The field name "${f.name}" is used twice.`
    seen.add(f.name)
  }
  return null
}

const TRUE = new Set(['true', 'yes', 'y', 'si', 'sì', '1', 'x'])
const FALSE = new Set(['false', 'no', 'n', '0', ''])

/** One cell as the value its field type stores, or `undefined` when empty or when it does not fit the type (the caller counts those). */
export function coerceValue(value: unknown, fieldType: string): unknown {
  if (value === null || value === undefined || value === '') return undefined
  switch (fieldType) {
    case 'numeric': {
      const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'))
      return Number.isFinite(n) ? n : undefined
    }
    case 'checkbox': {
      if (typeof value === 'boolean') return value
      const t = String(value).trim().toLowerCase()
      return TRUE.has(t) ? true : FALSE.has(t) ? false : undefined
    }
    case 'date': {
      const d = value instanceof Date ? value : new Date(String(value))
      if (Number.isNaN(d.getTime())) return undefined
      // a spreadsheet date is local midnight: keep the day as written, not the UTC day it falls on
      const midnight = d.getHours() + d.getMinutes() + d.getSeconds() + d.getMilliseconds() === 0
      return midnight ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : d.toISOString()
    }
    case 'array':
      return Array.isArray(value) ? value.map(String) : String(value).split(';').map((x) => x.trim()).filter(Boolean)
    case 'json': {
      if (typeof value === 'object' && !(value instanceof Date)) return value
      try {
        const parsed = JSON.parse(String(value))
        return typeof parsed === 'object' && parsed ? parsed : undefined
      } catch { return undefined }
    }
    default:
      return text(value)
  }
}

/** The attributes of the Data Object a row makes, and how many of its cells did not fit their field's type (left out). */
export function attributesOfRow(row: Row, fields: ProposedField[]): { attributes: Record<string, unknown>; skipped: number } {
  const attributes: Record<string, unknown> = {}
  let skipped = 0
  for (const f of fields.filter((x) => x.include)) {
    const raw = row[f.column]
    if (raw === null || raw === undefined || raw === '') continue
    const v = coerceValue(raw, f.fieldType)
    if (v === undefined) skipped++
    else if (f.fieldType === 'select' && f.options.length && !f.options.includes(String(v))) skipped++
    else attributes[f.name] = v
  }
  return { attributes, skipped }
}
