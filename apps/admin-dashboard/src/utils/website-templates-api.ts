import { getDefaultCoreApiUrl } from './auth-api'

// Website Templates (docs/plans/cms/website-templates.md) - a named
// composition of module pages into header/aside/footer slots per website.
export interface TemplateSlot {
  pageIds: string[]
  /** whoobe_one_snippets ids (reusable Element subtrees from the editor). */
  snippetIds?: string[] | null
  className?: string | null
  style?: string | null
  /** Alpine.js directives applied to the slot wrapper element. */
  alpine?: Record<string, string> | null
  /** Directly-authored Element tree(s) rendered in the slot alongside the
   *  module pages (a single node or an array of nodes). */
  content?: unknown | null
}

export interface WebsiteTemplateLayout {
  header?: TemplateSlot | null
  appHeader?: TemplateSlot | null
  aside?: TemplateSlot | null
  footer?: TemplateSlot | null
  appFooter?: TemplateSlot | null
  /** Main body wrapper — className/style applied to the <main> element in
   *  preview. Same options as header minus snippetIds. */
  main?: TemplateSlot | null
  /** Body element — className/style/alpine applied to the root page wrapper. */
  body?: TemplateSlot | null
  /** 404 error page — rendered with module pages when the routed page is
   *  not found. Same options as header including snippets. */
  notFound404?: TemplateSlot | null
}

export interface WebsiteTemplate {
  id: string
  websiteId: string
  name: string
  description: string | null
  layout: WebsiteTemplateLayout
  pathPatterns: string[]
  /** When set (e.g. "it"), this template applies to every page of that
   *  locale unconditionally, bypassing pathPatterns entirely. Null = not
   *  locale-restricted. */
  locale: string | null
  isDefault: boolean
  updatedAt: string
  createdAt: string
}

export interface WebsiteTemplateInput {
  name: string
  description?: string | null
  layout?: WebsiteTemplateLayout
  pathPatterns?: string[]
  locale?: string | null
  isDefault?: boolean
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

export async function fetchWebsiteTemplates(baseUrl: string, websiteId: string): Promise<WebsiteTemplate[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${websiteId}/templates`, { credentials: 'include' })
  const data = await parseJsonOrThrow(res)
  return data.templates ?? []
}

export async function createWebsiteTemplate(baseUrl: string, websiteId: string, input: WebsiteTemplateInput): Promise<WebsiteTemplate> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${websiteId}/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const data = await parseJsonOrThrow(res)
  return data.template
}

export async function updateWebsiteTemplate(
  baseUrl: string,
  websiteId: string,
  id: string,
  input: Partial<WebsiteTemplateInput>,
): Promise<WebsiteTemplate> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${websiteId}/templates/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const data = await parseJsonOrThrow(res)
  return data.template
}

export async function deleteWebsiteTemplate(baseUrl: string, websiteId: string, id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${websiteId}/templates/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}
