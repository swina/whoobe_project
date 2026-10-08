// Documentation sites (docs/plans/docs-sites/docs-site-plan.md), as the editor application shows them at a website's root path.
// Editors (a session with the asset permissions) get the preview endpoints, private documents included; anybody else the public ones.
import { getDefaultCoreApiUrl } from './core-api-url'

export type NavNode =
  | { type: 'doc'; title: string; path: string; route: string }
  | { type: 'section'; title: string; items: NavNode[]; path?: string; route?: string }
  | { type: 'link'; title: string; href: string }

export interface DocsPage {
  title: string
  description: string | null
  html: string
  headings: { depth: number; text: string; id: string }[]
  breadcrumbs: { title: string; route?: string }[]
  prev: { title: string; route: string } | null
  next: { title: string; route: string } | null
  route: string
  path: string
  updatedAt: string | null
  warnings?: string[]
}

export interface DocsView {
  siteTitle: string
  nav: NavNode[]
  page: DocsPage
  /** true when the session may see private documents (the preview endpoints answered). */
  draft: boolean
}

export interface DocsSiteRef { websiteId: string; rootPath: string; title: string }

const base = () => getDefaultCoreApiUrl().replace(/\/+$/, '')

/** Which documentation site answers at the first segment of the address; null for an ordinary page. */
export async function findDocsSite(segment: string): Promise<DocsSiteRef | null> {
  if (!/^[a-z0-9_-]{1,64}$/.test(segment)) return null
  try {
    const res = await fetch(`${base()}/public/docs-site/${segment}`, { credentials: 'include' })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

const encodeRoute = (route: string) => route.split('/').filter(Boolean).map(encodeURIComponent).join('/')

/** `route` is the address inside the site ("/guide/install", "" for home). Throws an Error with `status` 404 when there is no such document. */
export async function loadDocsView(site: DocsSiteRef, route: string): Promise<DocsView> {
  const tail = encodeRoute(route)
  const id = encodeURIComponent(site.websiteId)
  const draftRes = await fetch(`${base()}/docs-sites/${id}/preview/${tail}`, { credentials: 'include' })
  if (draftRes.ok) {
    const body = await draftRes.json()
    return { siteTitle: body.site.title, nav: body.nav, page: body.page, draft: true }
  }
  if (draftRes.status === 404) throw Object.assign(new Error('Document not found'), { status: 404 })
  // not signed in, or without the asset permissions: the public site
  const [pageRes, navRes] = await Promise.all([
    fetch(`${base()}/public/docs/${id}/page/${tail}`),
    fetch(`${base()}/public/docs/${id}/nav`),
  ])
  if (pageRes.status === 404) throw Object.assign(new Error('Document not found'), { status: 404 })
  if (!pageRes.ok || !navRes.ok) throw Object.assign(new Error('The documentation could not be loaded'), { status: pageRes.status })
  const page = await pageRes.json()
  const nav = await navRes.json()
  return { siteTitle: page.site.title, nav: nav.nav, page: page.page, draft: false }
}
