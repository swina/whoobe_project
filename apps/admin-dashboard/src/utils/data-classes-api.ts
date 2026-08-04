// Thin HTTP client for apps/core-api's /data-classes endpoints - see
// docs/plans/datamodel/advanced-data-modeling-plan.md §4.1/§6 (Phase 1).
// Mirrors pages-api.ts's shape (baseUrl from authStore.config, not a
// hardcoded hostname default).
import type { ClassFieldDefinition } from '@pimcore-custom/core'
import { getDefaultCoreApiUrl } from './auth-api'

export interface DataClass {
  id: string
  name: string
  label: string
  fields: ClassFieldDefinition[]
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
