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

// Looked up directly by translationGroupId - MasterObjectTab.vue's own
// need (docs/plans/datamodel/data-objects-views-editing.md), decoupled
// from ObjectsView.vue's shared list store (which can be re-pointed at a
// different class while this tab stays open).
export async function fetchDataObjectTranslationsByGroup(baseUrl: string, translationGroupId: string): Promise<DataObject[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-objects/translations/${translationGroupId}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.translations
}

export async function deleteDataObject(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-objects/${id}`, { method: 'DELETE', credentials: 'include' })
  await parseJsonOrThrow(res)
}

export async function createDataObject(
  baseUrl: string,
  input: {
    classId: string
    key: string
    path?: string
    locale?: string
    // Set when adding a new locale to an *existing* logical record
    // (docs/plans/datamodel/data-objects-views-editing.md's own "same
    // Pimcore ID = same record" requirement) - omitted for a genuinely
    // new record, letting the backend's own column default mint one.
    translationGroupId?: string
    attributes: Record<string, unknown>
  }
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

// Preview links - docs/plans/backend/object-publish-workflow-plan.md
// §2.3/§7 Phase 2.
export interface PreviewToken {
  token: string
  objectId: string
  expiresAt: string
  createdBy: string | null
  createdAt: string
  revokedAt: string | null
  viewCount: number
}

export async function createPreviewLink(baseUrl: string, objectId: string, expiresInDays?: number): Promise<{ token: string; expiresAt: string }> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-objects/${objectId}/preview-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresInDays }),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

export async function fetchPreviewLinks(baseUrl: string, objectId: string): Promise<PreviewToken[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-objects/${objectId}/preview-links`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.tokens
}

export async function revokePreviewLink(baseUrl: string, token: string): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-objects/preview-links/${token}`, { method: 'DELETE', credentials: 'include' })
  await parseJsonOrThrow(res)
}

// Workflow transitions - docs/plans/backend/object-publish-workflow-
// plan.md §2.4/§4/§7 Phase 3-4.
export async function transitionDataObject(baseUrl: string, id: string, transitionName: string): Promise<DataObject> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-objects/${id}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transitionName }),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.object
}
