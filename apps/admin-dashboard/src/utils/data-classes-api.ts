// Thin HTTP client for apps/core-api's /data-classes endpoints - see
// docs/plans/datamodel/advanced-data-modeling-plan.md §4.1/§6 (Phase 1).
// Mirrors pages-api.ts's shape (baseUrl from authStore.config, not a
// hardcoded hostname default).
import type { ClassFieldDefinition, ClassViewConfig, WorkflowPlace, WorkflowTransitionDefinition } from '@whoobe-cms/core'
import { getDefaultCoreApiUrl } from './auth-api'

export interface DataClass {
  id: string
  name: string
  label: string
  fields: ClassFieldDefinition[]
  viewConfig: ClassViewConfig | null
  pimcoreId: string | null
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

export async function fetchDataClasses(baseUrl: string): Promise<DataClass[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-classes`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.classes
}

export async function fetchDataClassById(baseUrl: string, id: string): Promise<DataClass> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-classes/${id}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.class
}

// Class Builder mutations - docs/plans/datamodel/native-class-authoring-
// plan.md §3.1/Phase 1. The routes themselves have existed since the
// sibling plan's Phase 1; only the admin-dashboard callers were missing.
export async function createDataClass(
  baseUrl: string,
  input: { name: string; label: string; fields: ClassFieldDefinition[]; viewConfig?: ClassViewConfig | null }
): Promise<DataClass> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-classes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.class
}

export async function updateDataClass(
  baseUrl: string,
  id: string,
  input: { name?: string; label?: string; fields?: ClassFieldDefinition[]; viewConfig?: ClassViewConfig | null }
): Promise<DataClass> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-classes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.class
}

export async function deleteDataClass(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-classes/${id}`, { method: 'DELETE', credentials: 'include' })
  await parseJsonOrThrow(res)
}

// Workflow definitions - docs/plans/backend/object-publish-workflow-
// plan.md §2.4/§5/§7 Phase 3-4.
export interface WorkflowDefinition {
  id: string
  classId: string
  initialPlace: string
  places: WorkflowPlace[]
  transitions: WorkflowTransitionDefinition[]
}

export async function fetchWorkflowDefinition(baseUrl: string, classId: string): Promise<WorkflowDefinition | null> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-classes/${classId}/workflow`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.workflow
}

export async function saveWorkflowDefinition(
  baseUrl: string,
  classId: string,
  input: { initialPlace: string; places: WorkflowPlace[]; transitions: WorkflowTransitionDefinition[] }
): Promise<WorkflowDefinition> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-classes/${classId}/workflow`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.workflow
}

export async function deleteWorkflowDefinition(baseUrl: string, classId: string): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-classes/${classId}/workflow`, { method: 'DELETE', credentials: 'include' })
  await parseJsonOrThrow(res)
}
