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
  /** Captured preview image (data URL) shown in the grid view. */
  thumbnail?: string | null
  /** Locked: never saved automatically (the editor's autosave skips it). */
  locked?: boolean
  /** The block of the Generate Website Wizard this snippet stands for (null: only offered when its category names a block). */
  wizardBlock?: string | null
  /** The name the wizard lists it under (null: the snippet's own name). */
  wizardLabel?: string | null
  createdAt: string
  updatedAt: string
}

/** A website template that places a snippet in one of its layout slots (header, footer, ...). */
export interface SnippetTemplateUsage {
  templateId: string
  templateName: string
  websiteId: string
  websiteName: string | null
  slots: string[]
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
  return (await fetchSnippetsWithUsage(baseUrl)).snippets
}

export async function fetchSnippetsWithUsage(baseUrl: string): Promise<{ snippets: WhoobeSnippet[]; templateUsage: Record<string, SnippetTemplateUsage[]> }> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/snippets`, { credentials: 'include' })
  const data = await parseJsonOrThrow(res)
  return { snippets: data.snippets ?? [], templateUsage: data.templateUsage ?? {} }
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

/** Locks or unlocks a snippet: a locked one is not saved automatically. */
export async function setSnippetWizardBlock(baseUrl: string, id: string, block: string | null, label: string | null = null): Promise<WhoobeSnippet> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/snippets/${id}/wizard-block`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ block, label }),
    credentials: 'include',
  })
  return (await parseJsonOrThrow(res)).snippet
}

export async function setSnippetLocked(baseUrl: string, id: string, locked: boolean): Promise<WhoobeSnippet> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/snippets/${id}/lock`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locked }),
    credentials: 'include',
  })
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try { const b = await res.json(); if (b?.error) message = b.error } catch { /* generic */ }
    throw new Error(message)
  }
  return (await res.json()).snippet
}
