// Client for this monorepo's real backend snippet library (apps/core-api),
// following the exact same pattern as dam-api.ts: no login flow of its own
// in this app, so these calls only succeed with an existing session cookie
// for the current hostname (see dam-api.ts's own header comment for the
// full explanation - the same "already logged into admin-dashboard, same
// browser, same hostname" precondition applies here).
//
// Stores a whole Element subtree (ElementsClass.js's own shape) as opaque
// JSON - a distinct backend table from Whoobe Studio's own "Save as
// Snippet" feature (packages/core/src/db/snippet-schema.ts), which stores
// a different, incompatible node format for a different app.
export interface WhoobeOneSnippet {
  id: string
  name: string
  category: string
  icon: string | null
  node: unknown
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

export async function listSnippets(): Promise<WhoobeOneSnippet[]> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/snippets`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.snippets
}

export async function getSnippet(id: string): Promise<WhoobeOneSnippet> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/snippets/${id}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.snippet
}

export async function createSnippet(input: {
  name: string
  category: string
  icon?: string | null
  node: unknown
}): Promise<WhoobeOneSnippet> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/snippets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.snippet
}

// Overwrites an existing snippet in place - the "Update existing" mode in
// SaveSnippetModal.vue, for when a minor tweak should replace what's
// already saved rather than piling up another near-duplicate snippet.
export async function updateSnippet(
  id: string,
  input: { name: string; category: string; icon?: string | null; node: unknown }
): Promise<WhoobeOneSnippet> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/snippets/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.snippet
}

export async function deleteSnippet(id: string): Promise<void> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/snippets/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  await parseJsonOrThrow(res)
}
