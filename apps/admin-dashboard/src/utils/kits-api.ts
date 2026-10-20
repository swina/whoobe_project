import { getDefaultCoreApiUrl } from './auth-api'

// A kit: a named, categorised bundle of templates used by the Whoobe One editor (Kits panel). `bundled` and `catalogue` kits come with the
// distribution or a catalogue and are read-only: duplicate them to get an editable `user` kit (docs/plans/kits/kit-library-plan.md).
export type KitOrigin = 'bundled' | 'user' | 'catalogue'

export interface WhoobeKit {
  id: string
  name: string
  description: string | null
  category: string
  templates: any[]
  origin: KitOrigin
  version: string
  slug: string | null
  forkedFrom: string | null
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

const json = { 'Content-Type': 'application/json' }

export async function fetchKits(baseUrl: string): Promise<WhoobeKit[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/kits`, { credentials: 'include' })
  return (await parseJsonOrThrow(res)).kits
}

export async function createKit(baseUrl: string, input: { name: string; description?: string | null; category: string; templates: any[] }): Promise<WhoobeKit> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/kits`, { method: 'POST', headers: json, credentials: 'include', body: JSON.stringify(input) })
  return (await parseJsonOrThrow(res)).kit
}

export async function updateKit(baseUrl: string, id: string, input: { name?: string; description?: string | null; category?: string }): Promise<WhoobeKit> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/kits/${id}`, { method: 'PATCH', headers: json, credentials: 'include', body: JSON.stringify(input) })
  return (await parseJsonOrThrow(res)).kit
}

export async function duplicateKit(baseUrl: string, id: string): Promise<WhoobeKit> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/kits/${id}/duplicate`, { method: 'POST', credentials: 'include' })
  return (await parseJsonOrThrow(res)).kit
}

export async function deleteKit(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/kits/${id}`, { method: 'DELETE', credentials: 'include' })
  await parseJsonOrThrow(res)
}
