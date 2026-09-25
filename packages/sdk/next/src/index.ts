// Next.js helpers for the headless SDK (docs/plans/cms/headless-sdk-plan.md
// §4). Server-only utilities meant for App Router RSC / route handlers:
// they fetch through Next's patched `fetch` so `revalidate` gives you ISR,
// then walk the tree server-side into a serializable descriptor for the
// client-side <WhoobePage descriptor={...} /> to hydrate from.
//
// No `next` package dependency: the revalidate option is passed through to
// the global fetch that Next patches; `generateMetadataFromPage` returns a
// plain object shaped like Next's Metadata.

import { walkTree, composeLayout, ApiClient, type RenderDescriptor, type ComposedLayout } from '@whoobe-cms/renderer'
import type { WhoobeApi, WhoobeAdapterOptions } from '@whoobe-cms/react'

export interface WhoobeNextOptions extends WhoobeAdapterOptions {
  /** Base URL of the Whoobe public API (e.g. https://cms.example.com). */
  baseUrl: string
  websiteId?: string
  /** ISR revalidate seconds - omit for no-store (always fresh). */
  revalidate?: number
}

type NextFetchInit = RequestInit & { next?: { revalidate?: number } }

export interface PublicPageRecord {
  id: string
  locale: string
  slug: string
  title: string
  content: unknown
  seo: Record<string, unknown> | null
  [key: string]: unknown
}

async function fetchJson<T>(url: string, init: NextFetchInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`Whoobe API ${res.status}`)
  return res.json() as Promise<T>
}

function fetchInit(options: WhoobeNextOptions): NextFetchInit {
  return options.revalidate != null ? { next: { revalidate: options.revalidate } } : { cache: 'no-store' }
}

/** Fetches a published page (with optional ISR) and walks it into a
 *  descriptor, composing the website-template shell when the site has one.
 *  Use in `generateStaticParams`/`generateMetadata` loaders and pass the
 *  descriptor (+ `layout`) to <WhoobePage descriptor={...} layout={...} />. */
export async function getPageData(
  locale: string,
  path: string,
  options: WhoobeNextOptions,
): Promise<{
  page: PublicPageRecord
  params: Record<string, string>
  descriptor: RenderDescriptor
  layout: ComposedLayout | null
}> {
  const base = options.baseUrl.replace(/\/+$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  const qs = options.websiteId ? `?websiteId=${encodeURIComponent(options.websiteId)}` : ''
  const { page, params, layout: publicLayout, cdnMirrors } = await fetchJson<{
    page: PublicPageRecord
    params: Record<string, string>
    layout: { template: { id: string; name: string }; header?: any; aside?: any; footer?: any } | null
    cdnMirrors?: Record<string, string>
  }>(`${base}/public/pages/${encodeURIComponent(locale)}${p}${qs}`, fetchInit(options))
  const walkOptions = {
    api: new ApiClient(base, undefined, options.gatewayUrl),
    assetBaseUrl: options.assetBaseUrl,
    keyPrefix: options.keyPrefix,
    resolveTargetPage: options.resolveTargetPage,
    cdnMirrors,
  }
  const descriptor = await walkTree(page.content, { urlParams: params }, walkOptions)
  const layout = publicLayout ? await composeLayout(descriptor, publicLayout, walkOptions) : null
  return { page, params, descriptor, layout }
}

/** Fetches a published data object by id (with optional ISR). */
export async function getObjectData(id: string, options: WhoobeNextOptions): Promise<Record<string, unknown> | null> {
  const base = options.baseUrl.replace(/\/+$/, '')
  const body = await fetchJson<{ object: Record<string, unknown> | null }>(
    `${base}/public/data-objects/${encodeURIComponent(id)}`,
    fetchInit(options),
  )
  return body.object ?? null
}

/** Builds Next `Metadata` from a page's `seo` (loose object - no next dep).
 *  `baseUrl` is used to absolutize relative open-graph images. */
export function generateMetadataFromPage(page: PublicPageRecord, baseUrl?: string): Record<string, unknown> {
  const seo = (page.seo ?? {}) as Record<string, unknown>
  const title = (seo.metaTitle as string) ?? page.title
  const description = (seo.metaDescription as string) ?? undefined
  const ogTitle = (seo.ogTitle as string) ?? title
  const ogDescription = (seo.ogDescription as string) ?? description
  let ogImage: unknown
  if (seo.ogImage) {
    const url = String(seo.ogImage)
    ogImage = [{ url: url.startsWith('http') ? url : `${(baseUrl ?? '').replace(/\/+$/, '')}${url}` }]
  }
  const robots = seo.robots as { index?: boolean; follow?: boolean } | undefined
  return {
    title,
    description,
    openGraph: { title: ogTitle, description: ogDescription, images: ogImage },
    robots:
      robots && (robots.index === false || robots.follow === false)
        ? { index: robots.index !== false, follow: robots.follow !== false }
        : undefined,
  }
}

/** generateStaticParams rows for a list of slugs (static pages). */
export function staticParamsForSlugs(slugs: string[], locale: string): { locale: string; slug: string }[] {
  return slugs.map((slug) => ({ locale, slug }))
}

/** generateStaticParams rows for a dynamic page, built from the records that
 *  back the `{slug}` placeholder (query them with ApiClient/queryObjects). */
export function staticParamsForRecords(records: Record<string, unknown>[], field: string, locale: string): { locale: string; slug: string }[] {
  return records
    .map((r) => {
      const attrs = r.attributes as Record<string, unknown> | undefined
      const value = attrs?.[field] ?? r[field]
      return value != null ? { locale, slug: String(value) } : null
    })
    .filter((v): v is { locale: string; slug: string } => v !== null)
}

/** Convenience: an ApiClient over a base URL (use in route handlers /
 *  client components instead of the server helpers). */
export function whoobeApi(baseUrl: string, gatewayUrl?: string): WhoobeApi {
  return new ApiClient(baseUrl, undefined, gatewayUrl) as unknown as WhoobeApi
}

export {
  WhoobeProvider,
  WhoobeNode,
  WhoobePage,
  usePage,
  useObject,
  useQuery,
  useForm,
  createWhoobeApi,
  defaults,
  descriptorToProps,
} from '@whoobe-cms/react'
export type { Registry, NodeComponent, WhoobeApi } from '@whoobe-cms/react'
