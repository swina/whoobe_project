// Client for this monorepo's real backend kit library (apps/core-api),
// same pattern as dam-api.ts/snippets-api.ts/templates-api.ts. A "kit" is
// a named, categorized collection of templates - see database-actions.ts's
// own header comment on the Kits section for the full history (this used
// to be seeded client-side from static public/kits/*.json files fetched
// straight from the browser; the repo's own reference kits are now seeded
// server-side instead, see packages/core/src/db/seed.ts's
// seedWhoobeOneKits() - there's no client-facing "import" call here at all
// any more, only real CRUD against what the backend already owns).
export interface WhoobeOneKitTemplate {
  id: string
  name: string
  category: string
  description: string
  json: { blocks: any }
}

export interface WhoobeOneKit {
  id: string
  name: string
  description: string | null
  category: string
  templates: WhoobeOneKitTemplate[]
}

export interface WhoobeOneKitSummary {
  id: string
  name: string
  description: string | null
  category: string
  templateCount: number
}

import { getDefaultCoreApiUrl } from './core-api-url'

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

export async function listKits(): Promise<WhoobeOneKitSummary[]> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/kits`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.kits.map((k: WhoobeOneKit) => ({
    id: k.id,
    name: k.name,
    description: k.description,
    category: k.category,
    templateCount: k.templates?.length ?? 0,
  }))
}

export async function getKit(id: string): Promise<WhoobeOneKit> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/kits/${id}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.kit
}

export async function createKit(input: {
  name: string
  description?: string | null
  category: string
  templates?: any[]
}): Promise<WhoobeOneKit> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/kits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.kit
}

export async function addTemplateToKit(kitId: string, template: any): Promise<WhoobeOneKit> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/kits/${kitId}/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template }),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.kit
}

export async function deleteKit(id: string): Promise<void> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/kits/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  await parseJsonOrThrow(res)
}
