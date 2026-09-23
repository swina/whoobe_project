import { getDefaultCoreApiUrl } from './auth-api'

export interface WhoobeSnippet {
  id: string
  name: string
  category: string
  icon: string | null
  node: unknown
  themeId?: string | null
  // Free-text usage notes (set from the whoobe-one-spike editor's "Save as
  // snippet" modal) - shown here via SnippetsView.vue's info icon (list and
  // grid views).
  notes?: string | null
  createdAt: string
  updatedAt: string
}

export interface WhoobeSnippetInput {
  name: string
  category: string
  icon?: string | null
  node: unknown
  themeId?: string | null
  notes?: string | null
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

export async function fetchSnippets(baseUrl: string): Promise<WhoobeSnippet[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/snippets`, { credentials: 'include' })
  const data = await parseJsonOrThrow(res)
  return data.snippets ?? []
}

export async function createSnippet(baseUrl: string, input: WhoobeSnippetInput): Promise<WhoobeSnippet> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/snippets`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await parseJsonOrThrow(res)
  return data.snippet
}

// Renders a snippet's node to standalone email markup (DAM images
// resolved, Tailwind inlined, no `{namespace.field}` substitution - see
// core-api's own /whoobe-one/snippets/:id/render for why) - the content
// source BrevoCampaignModal.vue uses when sending a snippet as a Brevo
// campaign rather than a full Mail Template.
export async function renderSnippet(baseUrl: string, id: string, embedImages = true): Promise<{ html: string; text: string }> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/snippets/${id}/render`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embedImages }),
  })
  return parseJsonOrThrow(res)
}

export async function deleteSnippet(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/snippets/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  await parseJsonOrThrow(res)
}
