// Thin HTTP client for apps/core-api's /data-objects endpoints - see
// docs/plans/datamodel/advanced-data-modeling-plan.md §4.2/§6 (Phase 1).
// Mirrors pages-api.ts's shape (baseUrl from authStore.config).
import { getDefaultCoreApiUrl } from './auth-api'

export interface DataObject {
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

function normalizeBaseUrl(baseUrl: string): string {
  return (baseUrl || getDefaultCoreApiUrl()).replace(/\/+$/, '')
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

// `classId` narrows the list to one class - ObjectsView.vue's own class
// filter (a plain query param, not a separate route).
export async function fetchDataObjects(baseUrl: string, classId?: string): Promise<DataObject[]> {
  const query = classId ? `?classId=${encodeURIComponent(classId)}` : ''
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-objects${query}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.objects
}

export async function fetchDataObjectById(baseUrl: string, id: string): Promise<DataObject> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-objects/${id}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.object
}

export async function deleteDataObject(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-objects/${id}`, { method: 'DELETE', credentials: 'include' })
  await parseJsonOrThrow(res)
}

export async function createDataObject(
  baseUrl: string,
  input: { classId: string; key: string; path?: string; locale?: string; attributes: Record<string, unknown> }
): Promise<DataObject> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-objects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.object
}

export async function updateDataObject(
  baseUrl: string,
  id: string,
  input: { key?: string; published?: boolean; workflowState?: string | null; attributes?: Record<string, unknown> }
): Promise<DataObject> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-objects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.object
}
