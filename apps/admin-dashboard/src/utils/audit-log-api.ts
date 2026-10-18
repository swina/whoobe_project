// Thin HTTP client for apps/core-api's GET /audit-log (docs/plans/system/audit-log-plan.md). Read only; needs the permission `audit:read`.
import { getDefaultCoreApiUrl } from './auth-api'

export interface AuditEntry {
  id: string
  at: string
  actorType: 'user' | 'api-client' | 'system'
  actorId: string | null
  actorLabel: string | null
  ip: string | null
  action: string
  targetType: string | null
  targetId: string | null
  targetLabel: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  requestId: string | null
}

export interface AuditFilters {
  action?: string
  actor?: string
  targetType?: string
  targetId?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

function base(baseUrl: string): string {
  return (baseUrl || getDefaultCoreApiUrl()).replace(/\/+$/, '')
}

function query(f: AuditFilters, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams(extra)
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '') q.set(k, String(v))
  return q.toString()
}

async function failure(res: Response): Promise<Error> {
  let message = res.status === 403 ? 'You need the permission "audit:read" for this' : `Request failed with status ${res.status}`
  try { const body = await res.json(); if (body?.error) message = body.error } catch { /* generic message */ }
  return new Error(message)
}

export async function listAuditLog(baseUrl: string, filters: AuditFilters): Promise<{ entries: AuditEntry[]; total: number }> {
  const res = await fetch(`${base(baseUrl)}/audit-log?${query(filters)}`, { credentials: 'include' })
  if (!res.ok) throw await failure(res)
  return res.json()
}

/** The same rows as a CSV file (the session cookie is needed, so it is fetched and saved from here, not opened as a link). */
export async function downloadAuditCsv(baseUrl: string, filters: AuditFilters): Promise<Blob> {
  const res = await fetch(`${base(baseUrl)}/audit-log?${query({ ...filters, offset: undefined }, { format: 'csv' })}`, { credentials: 'include' })
  if (!res.ok) throw await failure(res)
  return res.blob()
}
