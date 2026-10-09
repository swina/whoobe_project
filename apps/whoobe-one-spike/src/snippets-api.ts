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
  // Free-text usage notes (SaveSnippetModal.vue) - shown from the snippets
  // list and, once dropped into a document, in the inserted element's
  // Advanced > Info panel (see AdvancedPanel.vue's InfoControl).
  notes: string | null
  // Captured preview image (data URL) - set via the editor Preview's
  // "Capture thumbnail"; shown on the Snippets panel chip instead of the icon.
  thumbnail?: string | null
  // Locked: never saved automatically (autosave skips it). Manual saves work.
  locked?: boolean
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
    // the status travels with the error: a refused automatic save (423) is told apart from a failure
    throw Object.assign(new Error(message), { status: res.status })
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
  notes?: string | null
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
  input: { name: string; category: string; icon?: string | null; node: unknown; notes?: string | null; autosave?: boolean }
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

export interface ContentVersionSummary {
  id: string
  label: string | null
  createdAt: string
}

export interface ContentVersion extends ContentVersionSummary {
  content: unknown
}

/** Up to the 10 most recent prior states of this snippet's node - see
 *  apps/core-api/src/server.ts's `GET /whoobe-one/snippets/:id/versions`. */
export async function listSnippetVersions(id: string): Promise<ContentVersionSummary[]> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/snippets/${id}/versions`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.versions
}

export async function getSnippetVersion(id: string, versionId: string): Promise<ContentVersion> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/snippets/${id}/versions/${versionId}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.version
}

export async function deleteSnippet(id: string): Promise<void> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/snippets/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  await parseJsonOrThrow(res)
}

/** Stores a captured preview image (data URL) as the snippet's grid
 *  thumbnail; null clears it. */
export async function setSnippetThumbnail(id: string, thumbnail: string | null): Promise<void> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/snippets/${id}/thumbnail`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thumbnail }),
    credentials: 'include',
  })
  await parseJsonOrThrow(res)
}

/** Locks or unlocks a snippet: a locked one is not saved automatically (the server also refuses a save flagged `autosave`). */
export async function setSnippetLocked(id: string, locked: boolean): Promise<WhoobeOneSnippet> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/snippets/${id}/lock`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locked }),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.snippet
}
