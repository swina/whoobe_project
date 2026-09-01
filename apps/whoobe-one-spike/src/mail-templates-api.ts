// Client for this monorepo's mail template store (apps/core-api), following
// the exact same pattern as pages-api.ts - docs/plans/forms/mail-templates.
// md. The editor only ever opens the `html` kind (an Element tree in
// `content`); the admin dashboard manages the `text` kind via a textarea.
export interface WhoobeOneMailTemplate {
  id: string
  name: string
  kind: 'html' | 'text'
  description: string | null
  subject: string | null
  to: string | null
  bcc: string | null
  content: unknown
  body: string | null
  createdAt: string
  updatedAt: string
}

export interface MailTemplateSummary {
  id: string
  name: string
  kind: 'html' | 'text'
  description: string | null
  subject: string | null
  to: string | null
  bcc: string | null
  updatedAt: string
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

export async function listMailTemplates(): Promise<MailTemplateSummary[]> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/mail-templates`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.templates ?? []
}

export async function getMailTemplate(id: string): Promise<WhoobeOneMailTemplate> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/mail-templates/${id}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.template
}

export async function createMailTemplate(input: {
  name: string
  kind: 'html' | 'text'
  description?: string | null
  subject?: string | null
  content?: unknown
  body?: string | null
}): Promise<WhoobeOneMailTemplate> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/mail-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.template
}

export async function updateMailTemplate(
  id: string,
  input: {
    name?: string
    subject?: string | null
    content?: unknown
  },
): Promise<WhoobeOneMailTemplate> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/mail-templates/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.template
}
