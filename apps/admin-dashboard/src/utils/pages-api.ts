// Thin HTTP client for apps/core-api's /whoobe-one/pages endpoints - see
// docs/plans/cms/whoobe-one-editor-integration-plan.md §4/§7 (Phase 4).
// Mirrors documents-api.ts's shape (baseUrl passed in from authStore.config
// so it obeys the same configurable core-api URL as the rest of this app),
// not apps/whoobe-one-spike/src/pages-api.ts's own client (that one hardcodes
// its own hostname-derived default since it has no settings UI of its own).
//
// Deliberately list/get-only for now: this app doesn't yet have a "create a
// new page" flow (DocumentsView.vue doesn't have one either - pages are
// authored either via the Pimcore migration tool or directly inside
// whoobe-one-spike's own standalone UI), and edits happen entirely inside
// the embedded editor itself (see WhoobeOneEmbed.vue), not through this
// client.
import { getDefaultCoreApiUrl } from './auth-api'

export interface PageSeo {
  metaTitle?: string | null
  metaDescription?: string | null
  canonicalUrl?: string | null
  robots?: { index: boolean; follow: boolean } | null
  ogTitle?: string | null
  ogDescription?: string | null
  ogImage?: string | null
  structuredData?: Record<string, unknown> | null
}

export interface PageSitemapSettings {
  included: boolean
  priority?: number | null
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never' | null
}

export interface PageSearchSettings {
  indexable: boolean
  keywords?: string[] | null
}

export interface WhoobeOnePage {
  id: string
  translationGroupId: string
  locale: string
  slug: string
  title: string
  category: string
  published: boolean
  workflowState: string | null
  content: unknown
  seo: PageSeo | null
  sitemap: PageSitemapSettings | null
  search: PageSearchSettings | null
  pimcoreId: string | null
  publishedAt: string | null
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

export async function fetchPages(baseUrl: string): Promise<WhoobeOnePage[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/pages`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.pages
}

export async function fetchPageById(baseUrl: string, id: string): Promise<WhoobeOnePage> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/pages/${id}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.page
}

export async function updatePageById(
  baseUrl: string,
  id: string,
  input: {
    slug?: string
    title?: string
    category?: string
    published?: boolean
    workflowState?: string | null
    locale?: string
    websiteId?: string | null
    seo?: PageSeo | null
    sitemap?: PageSitemapSettings | null
    search?: PageSearchSettings | null
  }
): Promise<WhoobeOnePage> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/pages/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.page
}

export async function createPageById(
  baseUrl: string,
  input: {
    slug: string
    title: string
    category?: string
    content: unknown
  }
): Promise<WhoobeOnePage> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/pages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.page
}
