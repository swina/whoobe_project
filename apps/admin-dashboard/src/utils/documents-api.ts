// Thin HTTP client for apps/core-api's /documents endpoints. Session state
// is the same httpOnly cookie auth-api.ts already relies on - see its
// header comment for why credentials:'include' is always sent instead of
// handling a token directly.
import type { WhoobeBlockNode } from '@whoobe-cms/core'
import { getDefaultCoreApiUrl } from './auth-api'

export interface CmsDocumentRecord {
  id: string
  pimcoreId: string | null
  title: string
  slug: string
  locale: string
  rootBlock: WhoobeBlockNode
  metadata: Record<string, unknown> | null
  status: string
  createdAt: string
  updatedAt: string
}

function normalizeBaseUrl(baseUrl: string): string {
  return (baseUrl || getDefaultCoreApiUrl()).replace(/\/+$/, '')
}

// Mirrors getDefaultCoreApiUrl()/getDefaultAssetProcessorUrl(): default to
// whatever hostname the page itself was loaded from, never a hardcoded
// "localhost" - see apps/whoobe-studio's vite.config.ts for the port.
export function getDefaultWhoobeStudioUrl(): string {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:3004`
  }
  return 'http://localhost:3004'
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

export async function fetchDocuments(baseUrl: string): Promise<CmsDocumentRecord[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/documents`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.documents
}

export async function fetchDocumentById(baseUrl: string, id: string): Promise<CmsDocumentRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/documents/${id}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.document
}

export async function updateDocumentContent(
  baseUrl: string,
  id: string,
  input: { title: string; rootBlock: WhoobeBlockNode; status?: string }
): Promise<CmsDocumentRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/documents/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.document
}
