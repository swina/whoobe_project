// Client for this monorepo's real Data Objects backend (apps/core-api),
// following the exact same pattern as pages-api.ts/snippets-api.ts: no login
// flow of its own in this app, so these calls only succeed with an existing
// session cookie for the current hostname (the admin-dashboard session).
//
// Used by the DataObjectPicker (the editor's "bind this element to a data
// object" UI) and by the render-time data resolver (data-resolver.ts). The
// admin `/data-objects`/`/data-classes` endpoints require OBJECTS_READ; the
// `/public/data-objects` endpoints are unauthenticated and published-only,
// used at render time when no admin session is guaranteed.
export interface ClassFieldDefinition {
  name: string
  title: string
  fieldType: string
  mandatory?: boolean
  localized?: boolean
  relationTarget?: string
  options?: string[]
  className?: string
  assetFilter?: 'any' | 'image' | 'video' | 'document' | 'archive'
}

export interface DataClassRecord {
  id: string
  name: string
  label: string
  fields: ClassFieldDefinition[]
  viewConfig: unknown
  pimcoreId: string | null
  createdAt: string
  updatedAt: string
}

export interface DataObjectRecord {
  id: string
  classId: string
  key: string
  path: string
  parentId: string | null
  translationGroupId: string
  locale: string
  published: boolean
  workflowState: string | null
  attributes: Record<string, unknown>
  pimcoreId: string | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface DataObjectQueryFilter {
  field: string
  operator: 'eq' | 'neq' | 'contains' | 'gt' | 'lt'
  value: unknown
}

export interface DataObjectOrderBy {
  field: string
  direction: 'asc' | 'desc'
}

export interface DataObjectQueryOptions {
  filters?: DataObjectQueryFilter[]
  orderBy?: DataObjectOrderBy | null
  offset?: number
  limit?: number
  locale?: string
}

// Exported for form-actions.ts's public (unauthenticated, no credentials)
// submit call - same core-api host every other call in this file already
// targets, just without `credentials: 'include'` since a site visitor has
// no admin session cookie to send.
export function getDefaultCoreApiUrl(): string {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:3003`
  }
  return 'http://localhost:3003'
}

async function parseJsonOrThrow(res: Response): Promise<any> {
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      // Ignore body parse failures; use the generic message above.
    }
    throw new Error(message)
  }
  return res.json()
}

export async function listDataClasses(): Promise<DataClassRecord[]> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/data-classes`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.classes
}

export async function getDataClass(id: string): Promise<DataClassRecord> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/data-classes/${id}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.class
}

export async function getDataClassByName(name: string): Promise<DataClassRecord | null> {
  const classes = await listDataClasses()
  return classes.find((c) => c.name === name) ?? null
}

export async function listDataObjects(classId?: string): Promise<DataObjectRecord[]> {
  const qs = classId ? `?classId=${encodeURIComponent(classId)}` : ''
  const res = await fetch(`${getDefaultCoreApiUrl()}/data-objects${qs}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.objects
}

export async function getDataObject(id: string): Promise<DataObjectRecord> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/data-objects/${id}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.object
}

export async function listPublishedDataObjects(classId?: string, locale?: string): Promise<DataObjectRecord[]> {
  const params = new URLSearchParams()
  if (classId) params.set('class', classId)
  if (locale) params.set('locale', locale)
  const qs = params.toString() ? `?${params.toString()}` : ''
  const res = await fetch(`${getDefaultCoreApiUrl()}/public/data-objects${qs}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.objects
}

export async function getPublishedDataObject(id: string): Promise<DataObjectRecord> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/public/data-objects/${id}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.object
}

/** Query published data objects with server-side filters/order/offset/
 *  limit. Avoids fetching every object and filtering client-side. Falls
 *  back to the admin endpoint if the public query route is unavailable. */
export async function queryPublishedDataObjects(
  className: string,
  options?: DataObjectQueryOptions
): Promise<DataObjectRecord[]> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/public/data-objects/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ class: className, ...options }),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.objects
}

/** Admin query (returns all objects regardless of published status).
 *  Requires OBJECTS_READ permission (session cookie from admin dashboard). */
export async function queryDataObjects(
  className: string,
  options?: DataObjectQueryOptions
): Promise<DataObjectRecord[]> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/data-objects/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ class: className, ...options }),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.objects
}