// Thin HTTP client for apps/core-api's /data-components endpoints - see
// docs/plans/datamodel/component-fields-plan.md §3 (Phase 1). Mirrors
// data-classes-api.ts's shape directly - Component Types are, on the
// wire, structurally identical to classes (name/label/fields).
import type { ClassFieldDefinition } from '@pimcore-custom/core'
import { getDefaultCoreApiUrl } from './auth-api'

export interface DataComponent {
  id: string
  name: string
  label: string
  fields: ClassFieldDefinition[]
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

export async function fetchDataComponents(baseUrl: string): Promise<DataComponent[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-components`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.components
}

export async function fetchDataComponentById(baseUrl: string, id: string): Promise<DataComponent> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-components/${id}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.component
}

export async function createDataComponent(
  baseUrl: string,
  input: { name: string; label: string; fields: ClassFieldDefinition[] }
): Promise<DataComponent> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-components`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.component
}

export async function updateDataComponent(
  baseUrl: string,
  id: string,
  input: { name?: string; label?: string; fields?: ClassFieldDefinition[] }
): Promise<DataComponent> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-components/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.component
}

export async function deleteDataComponent(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-components/${id}`, { method: 'DELETE', credentials: 'include' })
  await parseJsonOrThrow(res)
}

// component-fields-plan.md §2.5/Phase 4 - lets ComponentSettingsCard.vue
// show a live warning the same way ClassSettingsCard.vue's own
// objectCount already does, not just react to a 409 after the fact.
export async function fetchDataComponentUsage(baseUrl: string, id: string): Promise<boolean> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/data-components/${id}/usage`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.inUse
}
