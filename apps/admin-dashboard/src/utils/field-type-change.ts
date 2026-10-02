// Shared by the class and component editors: the server (PATCH /data-classes/
// :id, PATCH /data-components/:id) refuses to change a field's type while
// records use it unless the request carries `confirmTypeChange: true`, and
// answers 409 `FIELD_TYPE_CHANGE_NEEDS_CONFIRMATION` with the details. The
// API clients turn that into a FieldTypeChangeError; the editor shows
// confirmFieldTypeChange()'s warning and, if accepted, saves again with the
// flag set.

export interface FieldTypeChange {
  name: string
  from: string
  to: string
}

export class FieldTypeChangeError extends Error {
  readonly typeChanges: FieldTypeChange[]
  /** Objects of the class affected; null for a component (not counted). */
  readonly objectCount: number | null

  constructor(message: string, typeChanges: FieldTypeChange[], objectCount: number | null) {
    super(message)
    this.name = 'FieldTypeChangeError'
    this.typeChanges = typeChanges
    this.objectCount = objectCount
  }
}

/** Builds a FieldTypeChangeError from a 409 response body, or null when the body is something else. */
export function fieldTypeChangeErrorFromBody(body: any): FieldTypeChangeError | null {
  if (body?.code !== 'FIELD_TYPE_CHANGE_NEEDS_CONFIRMATION' || !Array.isArray(body.typeChanges)) return null
  return new FieldTypeChangeError(body.error ?? 'Field type change needs confirmation', body.typeChanges, body.objectCount ?? null)
}

/** Data-loss warning; true when the user accepts. */
export function confirmFieldTypeChange(err: FieldTypeChangeError): boolean {
  const list = err.typeChanges.map((c) => `  • ${c.name}: ${c.from} → ${c.to}`).join('\n')
  const affected = err.objectCount != null ? `${err.objectCount} existing object(s) of this class` : 'existing objects that use this component'
  return window.confirm(
    `Change the field type?\n\n${list}\n\n` +
      `This affects ${affected}. Their stored values are not modified or converted, ` +
      `but values that don't fit the new type may be shown incorrectly or rejected the next time an object is saved, ` +
      `so data can be lost when it is re-saved.\n\nContinue?`
  )
}
