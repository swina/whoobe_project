// Creates the rows of a wizard's class as draft Data Objects (shared by the file and the integration import).
import { bulkImportDataObjects } from './data-objects-api'
import { attributesOfRow, type ProposedField, type Row } from './class-from-file'

export interface ImportResult { imported: number; failed: number; skipped: number; firstError: string }

/** Rows per request: one transaction on the server each (its limit is 500). */
export const IMPORT_CHUNK_SIZE = 100

/**
 * The rows as draft Data Objects, in chunks of IMPORT_CHUNK_SIZE sent one after the other (POST /data-objects/bulk: a chunk is saved whole
 * or not at all). A chunk that fails is counted and the next one still goes. `keyColumn`: the column whose value is the object's key
 * (a repeated value is one object, the last row wins); without it every object gets a generated key.
 */
export async function importRows(
  baseUrl: string,
  classId: string,
  rows: Row[],
  fields: ProposedField[],
  onProgress: (done: number, total: number) => void,
  keyColumn = '',
): Promise<ImportResult> {
  const out: ImportResult = { imported: 0, failed: 0, skipped: 0, firstError: '' }
  onProgress(0, rows.length)
  for (let i = 0; i < rows.length; i += IMPORT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + IMPORT_CHUNK_SIZE).map((row) => {
      const { attributes, skipped } = attributesOfRow(row, fields)
      out.skipped += skipped
      const key = keyColumn ? String(row[keyColumn] ?? '').trim() : ''
      return { ...(key ? { key } : {}), attributes }
    })
    try {
      const r = await bulkImportDataObjects(baseUrl, { classId, rows: chunk, onConflict: keyColumn ? 'update' : 'skip' })
      out.imported += r.created + r.updated
      // rows left out by a `unique` field
      out.failed += r.rejected.length
      if (r.rejected.length) out.firstError ||= r.rejected[0].message
    } catch (err: any) {
      out.failed += chunk.length
      out.firstError ||= err?.message || 'error'
    }
    onProgress(Math.min(i + IMPORT_CHUNK_SIZE, rows.length), rows.length)
  }
  return out
}

export function importSummary(label: string, r: ImportResult | null): string {
  if (!r) return `Class "${label}" created`
  return `Class "${label}" created, ${r.imported} object(s) imported${r.failed ? `, ${r.failed} row(s) failed (${r.firstError})` : ''}${r.skipped ? `, ${r.skipped} value(s) did not fit their field and were left out` : ''}`
}
