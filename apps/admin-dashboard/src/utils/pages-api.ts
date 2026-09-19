// Thin HTTP client for apps/core-api's /whoobe-one/pages endpoints - see
// docs/plans/cms/whoobe-one-editor-integration-plan.md §4/§7 (Phase 4).
// Mirrors documents-api.ts's shape (baseUrl passed in from authStore.config
// so it obeys the same configurable core-api URL as the rest of this app),
// not apps/whoobe-one-spike/src/pages-api.ts's own client (that one hardcodes
// its own hostname-derived default since it has no settings UI of its own).
//
// Full CRUD: PagesView.vue lists/creates pages, edits happen inside the
// embedded editor (see WhoobeOneEmbed.vue), and the list view supports
// batch publish/unpublish via PATCH plus batch delete via DELETE.
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
  /** 'content' = routable page; 'module' = reusable website-template fragment;
   *  'app' = mobile app page (enables App Mode in the editor). */
  kind: 'content' | 'module' | 'app'
  published: boolean
  workflowState: string | null
  content: unknown
  seo: PageSeo | null
  sitemap: PageSitemapSettings | null
  search: PageSearchSettings | null
  pimcoreId: string | null
  path: string | null
  websiteId: string | null
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

export async function fetchPages(baseUrl: string, websiteId?: string): Promise<WhoobeOnePage[]> {
  const params = websiteId ? `?websiteId=${encodeURIComponent(websiteId)}` : ''
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/pages${params}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.pages
}

export async function fetchPageById(baseUrl: string, id: string): Promise<WhoobeOnePage> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/pages/${id}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.page
}

// Renders a page's content to standalone email markup (DAM images
// resolved, Tailwind inlined, no `{namespace.field}` substitution - see
// core-api's own /whoobe-one/pages/:id/render for why) - the content
// source BrevoCampaignModal.vue uses when sending a page as a Brevo
// campaign rather than a full Mail Template.
export async function renderPageContent(baseUrl: string, id: string, embedImages = true): Promise<{ html: string; text: string }> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/pages/${id}/render`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embedImages }),
  })
  return parseJsonOrThrow(res)
}

export async function updatePageById(
  baseUrl: string,
  id: string,
  input: {
    slug?: string
    title?: string
    category?: string
    kind?: 'content' | 'module' | 'app'
    published?: boolean
    workflowState?: string | null
    locale?: string
    path?: string | null
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
    kind?: 'content' | 'module' | 'app'
    content: unknown
    websiteId?: string | null
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

export async function deletePageById(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/pages/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  await parseJsonOrThrow(res)
}

// --- Staged migration review (docs/plans/cms/documents-migration.md §3
// Phase 1 / Option B) ---

/** A row from whoobe_pages_staging - a converted document awaiting review
 *  before promote copies it into whoobe_pages. Same shape as WhoobeOnePage
 *  plus `stagedAt`. */
export interface StagedWhoobePage {
  id: string
  translationGroupId: string
  locale: string
  slug: string
  title: string
  category: string
  kind: 'content' | 'module' | 'app'
  published: boolean
  workflowState: string | null
  content: unknown
  seo: PageSeo | null
  sitemap: PageSitemapSettings | null
  search: PageSearchSettings | null
  pimcoreId: string | null
  path: string | null
  websiteId: string | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  stagedAt: string
}

export async function fetchStagedPages(baseUrl: string): Promise<StagedWhoobePage[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/pages/staged`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.pages
}

export async function deleteStagedPageById(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/pages/staged/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  await parseJsonOrThrow(res)
}

export interface PromoteStagedResult {
  succeeded: number
  failed: number
  errors: { item: string; message: string }[]
}

/** Copies every whoobe_pages_staging row into whoobe_pages (idempotent by
 *  pimcore_id). `clear: true` deletes promoted staging rows. */
export async function promoteStagedPages(
  baseUrl: string,
  input: { dryRun?: boolean; clear?: boolean }
): Promise<PromoteStagedResult> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/pages/staged/promote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.result
}

/** Copies ONE whoobe_pages_staging row into whoobe_pages - the per-row
 *  Promote action. Never touches the other staged rows. */
export async function promoteStagedPageById(
  baseUrl: string,
  id: string,
  input: { dryRun?: boolean; clear?: boolean }
): Promise<PromoteStagedResult> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/pages/staged/${id}/promote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.result
}
