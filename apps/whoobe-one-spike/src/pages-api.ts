// Client for this monorepo's real backend page store (apps/core-api),
// following the exact same pattern as templates-api.ts/kits-api.ts/
// snippets-api.ts: no login flow of its own in this app, so these calls
// only succeed with an existing session cookie for the current hostname.
//
// Replaces templates-api.ts as of the CMS integration plan (docs/plans/
// cms/whoobe-one-editor-integration-plan.md §4/Phase 1) - a "page" here is
// the CMS's real, published website page (SEO/sitemap/search/multilanguage
// metadata, a publish gate), not the reusable-starting-point "template"
// concept whoobe_one_templates/templates-api.ts still is. That table/API
// is left in place, unaffected - it's a different concept now, not a
// renamed one.
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
  /** 'content' = routable page; 'module' = reusable template fragment
   *  (website-templates.md). */
  kind: 'content' | 'module' | 'app'
  published: boolean
  workflowState: string | null
  content: unknown
  seo: PageSeo | null
  sitemap: PageSitemapSettings | null
  search: PageSearchSettings | null
  pimcoreId: string | null
  websiteId: string | null
  themeId: string | null
  publishedAt: string | null
  createdAt: string
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

export async function listPages(): Promise<WhoobeOnePage[]> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/pages`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.pages
}

export async function getPage(id: string): Promise<WhoobeOnePage> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/pages/${id}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.page
}

export interface PublicPageLookup {
  page: WhoobeOnePage
  params: Record<string, string>
  /** Website-template composition (website-templates.md) - the resolved
   *  template's header/aside/main/footer/404 module pages + slot styling. */
  layout?: {
    template: { id: string; name: string }
    header?: { className: string; style: string; alpine?: Record<string, string>; pages: { id: string; title: string; content: unknown }[] } | null
    aside?: { className: string; style: string; alpine?: Record<string, string>; pages: { id: string; title: string; content: unknown }[] } | null
    main?: { className: string; style: string; alpine?: Record<string, string>; pages: { id: string; title: string; content: unknown }[] } | null
    footer?: { className: string; style: string; alpine?: Record<string, string>; pages: { id: string; title: string; content: unknown }[] } | null
    body?: { className: string; style: string; alpine?: Record<string, string>; pages: { id: string; title: string; content: unknown }[] } | null
    notFound404?: { className: string; style: string; alpine?: Record<string, string>; pages: { id: string; title: string; content: unknown }[] } | null
  } | null
}

/** Public, unauthenticated lookup by locale + full path (static slug or a
 *  dynamic pattern match) - see docs/plans/website/website-paths.md and
 *  apps/core-api/src/server.ts's `GET /public/pages/:locale/*` route.
 *  `path` must start with '/'. `params` holds any {placeholder} values
 *  extracted from a dynamic-pattern match (empty for a static page). */
export async function getPublicPage(locale: string, path: string, rootPath?: string, editor?: boolean): Promise<PublicPageLookup> {
  const query = rootPath ? `?rootPath=${encodeURIComponent(rootPath)}` : ''
  const suffix = editor ? `${rootPath ? '&' : '?'}editor=true` : ''
  const res = await fetch(`${getDefaultCoreApiUrl()}/public/pages/${encodeURIComponent(locale)}${path}${query}${suffix}`, { credentials: 'include' })
  return parseJsonOrThrow(res)
}

/** SEO-friendly public page lookup — no locale in the URL. Resolves
 *  /{rootPath}/{slug} (Website > Paths preview links) by detecting rootPath
 *  from the first path segment on the server, which returns the page with
 *  its own locale. Matches apps/core-api/src/server.ts's `GET /public/page/*`. */
export async function getPublicPageByPath(path: string, editor?: boolean): Promise<PublicPageLookup> {
  const suffix = editor ? (path.includes('?') ? '&' : '?') + 'editor=true' : ''
  const res = await fetch(`${getDefaultCoreApiUrl()}/public/page${path}${suffix}`, { credentials: 'include' })
  return parseJsonOrThrow(res)
}

export interface PageLayoutBody {
  body: { className: string; style: string; alpine?: Record<string, string> } | null
}

/** Authenticated counterpart of `getPublicPage`'s `layout.body` - resolves
 *  just the website template's body slot (className/style) for the given
 *  page, so the editor's canvas/preview can default to matching the live
 *  site's body wrapper. See apps/core-api/src/server.ts's
 *  `GET /whoobe-one/pages/:id/layout`. */
export async function getPageLayoutBody(id: string): Promise<PageLayoutBody> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/pages/${id}/layout`, { credentials: 'include' })
  return parseJsonOrThrow(res)
}

export async function listPageTranslations(id: string): Promise<WhoobeOnePage[]> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/pages/${id}/translations`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.translations
}

export async function createPage(input: {
  translationGroupId?: string
  locale?: string
  slug: string
  title: string
  category?: string
  kind?: 'content' | 'module' | 'app'
  content: unknown
  seo?: PageSeo | null
  sitemap?: PageSitemapSettings | null
  search?: PageSearchSettings | null
  pimcoreId?: string | null
  themeId?: string | null
}): Promise<WhoobeOnePage> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/pages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.page
}

export async function updatePage(
  id: string,
  input: {
    slug?: string
    title?: string
    category?: string
    kind?: 'content' | 'module' | 'app'
    published?: boolean
    workflowState?: string | null
    content?: unknown
    seo?: PageSeo | null
    sitemap?: PageSitemapSettings | null
    search?: PageSearchSettings | null
    themeId?: string | null
  }
): Promise<WhoobeOnePage> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/pages/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.page
}

/** Translates a page into a new locale via the configured AI provider
 *  (apps/core-api's `POST /whoobe-one/pages/:id/translate`) and creates it
 *  as a new, unpublished page in the same translation group - a draft for
 *  a human editor to review before publishing, not a live swap. */
export async function translatePage(id: string, locale: string): Promise<WhoobeOnePage> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/pages/${id}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale }),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.page
}

export interface ContentVersionSummary {
  id: string
  label: string | null
  createdAt: string
}

export interface ContentVersion extends ContentVersionSummary {
  content: unknown
}

/** Up to the 10 most recent prior states of this page's content - see
 *  apps/core-api/src/server.ts's `GET /whoobe-one/pages/:id/versions`. */
export async function listPageVersions(id: string): Promise<ContentVersionSummary[]> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/pages/${id}/versions`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.versions
}

export async function getPageVersion(id: string, versionId: string): Promise<ContentVersion> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/pages/${id}/versions/${versionId}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.version
}

export async function deletePage(id: string): Promise<void> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/pages/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  await parseJsonOrThrow(res)
}
