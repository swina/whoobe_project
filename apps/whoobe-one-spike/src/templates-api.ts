// Client for this monorepo's real backend template library (apps/core-api),
// following the exact same pattern as dam-api.ts/snippets-api.ts: no login
// flow of its own in this app, so these calls only succeed with an
// existing session cookie for the current hostname.
//
// A "template" is a whole document (see database-actions.ts's own header
// comment) - what this app called a "page" until this data moved here from
// local IndexedDB storage (see apps/whoobe-one-spike/README.md).
export interface WhoobeOneTemplate {
  id: string
  name: string
  category: string
  path: string
  description: string | null
  node: unknown
}

function getDefaultCoreApiUrl(): string {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:3003`
  }
  return 'http://localhost:3003'
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

export async function listTemplates(): Promise<WhoobeOneTemplate[]> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/templates`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.templates
}

export async function getTemplate(id: string): Promise<WhoobeOneTemplate> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/templates/${id}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.template
}

export async function createTemplate(input: {
  name: string
  category: string
  path: string
  description?: string | null
  node: unknown
}): Promise<WhoobeOneTemplate> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.template
}

export async function updateTemplate(
  id: string,
  input: { name: string; category: string; description?: string | null; node: unknown }
): Promise<WhoobeOneTemplate> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/templates/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.template
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/templates/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  await parseJsonOrThrow(res)
}
