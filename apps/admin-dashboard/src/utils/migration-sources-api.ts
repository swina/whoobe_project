// Thin HTTP client for apps/core-api's /migration-sources endpoints - see
// docs/plans/datamodel/native-class-authoring-plan.md §3.4/Phase 4.
// Mirrors data-classes-api.ts's shape. `MigrationSource` never carries a
// password field - the backend's own records layer strips it before a
// response is ever built (migration-sources-records.ts's `toRecord`).
import { getDefaultCoreApiUrl } from './auth-api'

export interface MigrationSource {
  id: string
  label: string
  dbHost: string
  dbPort: number
  dbUser: string
  dbName: string
  classesPath: string
  createdAt: string
  updatedAt: string
}

export interface MigrationRunResult {
  succeeded: number
  failed: number
  errors: { item: string; message: string }[]
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

export async function fetchMigrationSources(baseUrl: string): Promise<MigrationSource[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/migration-sources`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.sources
}

export async function createMigrationSource(
  baseUrl: string,
  input: { label: string; dbHost: string; dbPort: number; dbUser: string; dbPassword: string; dbName: string; classesPath: string }
): Promise<MigrationSource> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/migration-sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.source
}

export async function updateMigrationSource(
  baseUrl: string,
  id: string,
  input: Partial<{ label: string; dbHost: string; dbPort: number; dbUser: string; dbPassword: string; dbName: string; classesPath: string }>
): Promise<MigrationSource> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/migration-sources/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.source
}

export async function deleteMigrationSource(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/migration-sources/${id}`, { method: 'DELETE', credentials: 'include' })
  await parseJsonOrThrow(res)
}

export async function importClassesFromPimcore(
  baseUrl: string,
  id: string,
  input: { dryRun?: boolean; className?: string }
): Promise<MigrationRunResult> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/migration-sources/${id}/import-classes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.result
}

export async function importObjectsFromPimcore(
  baseUrl: string,
  id: string,
  input: { className: string; dryRun?: boolean; limit?: number; clear?: boolean }
): Promise<MigrationRunResult> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/migration-sources/${id}/import-objects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.result
}
