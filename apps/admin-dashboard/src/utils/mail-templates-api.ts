import { getDefaultCoreApiUrl } from './auth-api'

// Reusable outgoing-mail templates (docs/plans/forms/mail-templates.md) -
// Settings → Mail → Templates. `fetchMailTemplates` returns metadata only;
// `fetchMailTemplate` returns the full row (Element tree / text body).
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

export interface MailTemplateRecord extends MailTemplateSummary {
  content: unknown | null
  body: string | null
  createdAt: string
}

export interface MailTemplateInput {
  name: string
  kind: 'html' | 'text'
  description?: string | null
  subject?: string | null
  to?: string | null
  bcc?: string | null
  content?: unknown | null
  body?: string | null
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

export async function fetchMailTemplates(baseUrl: string): Promise<MailTemplateSummary[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/mail-templates`, { credentials: 'include' })
  const data = await parseJsonOrThrow(res)
  return data.templates ?? []
}

export async function fetchMailTemplate(baseUrl: string, id: string): Promise<MailTemplateRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/mail-templates/${id}`, { credentials: 'include' })
  const data = await parseJsonOrThrow(res)
  return data.template
}

export async function createMailTemplate(baseUrl: string, input: MailTemplateInput): Promise<MailTemplateRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/mail-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const data = await parseJsonOrThrow(res)
  return data.template
}

export async function updateMailTemplate(
  baseUrl: string,
  id: string,
  input: Partial<MailTemplateInput>,
): Promise<MailTemplateRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/mail-templates/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const data = await parseJsonOrThrow(res)
  return data.template
}

export async function deleteMailTemplate(baseUrl: string, id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/mail-templates/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

export interface RenderedMailTemplate {
  html: string
  text: string
  subject: string | null
}

// Renders an HTML template's Element tree to a standalone <!DOCTYPE html>
// email document (DAM images resolved, Tailwind inlined, Google Fonts
// linked in <head>) plus a plain-text fallback - the step
// BrevoCampaignModal.vue needs before it can hand htmlContent/textContent
// to Brevo's own campaign-create API. `embedImages` (default true) inlines
// images as base64 data: URIs rather than proxy URLs - the only choice
// that works when this install's own DAM isn't publicly reachable (a
// local/dev environment), which an ESP's servers never are.
export async function renderMailTemplate(baseUrl: string, id: string, embedImages = true): Promise<RenderedMailTemplate> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/mail-templates/${id}/render`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embedImages }),
  })
  return parseJsonOrThrow(res)
}
