import { walkTree, composeLayout, ApiClient, type RenderDescriptor, type ComposedLayout } from '@whoobe-cms/renderer'
import type { WhoobeApi, WhoobeAdapterOptions } from '@whoobe-cms/vue'

export interface WhoobeNuxtOptions extends WhoobeAdapterOptions {
  /** Base URL of the Whoobe public API (e.g. https://cms.example.com). */
  baseUrl: string
  websiteId?: string
}

export interface PublicPageRecord {
  id: string
  locale: string
  slug: string
  title: string
  content: unknown
  seo: Record<string, unknown> | null
  [key: string]: unknown
}

export async function getPageData(
  locale: string,
  path: string,
  options: WhoobeNuxtOptions,
): Promise<{
  page: PublicPageRecord
  params: Record<string, string>
  descriptor: RenderDescriptor
  layout: ComposedLayout | null
}> {
  const base = options.baseUrl.replace(/\/+$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  const qs = options.websiteId ? `?websiteId=${encodeURIComponent(options.websiteId)}` : ''
  const res = await fetch(`${base}/public/pages/${encodeURIComponent(locale)}${p}${qs}`)
  if (!res.ok) throw new Error(`Whoobe API ${res.status}`)
  const { page, params, layout: publicLayout, cdnMirrors } = await res.json() as {
    page: PublicPageRecord
    params: Record<string, string>
    layout: { template: { id: string; name: string }; header?: any; aside?: any; footer?: any } | null
    cdnMirrors?: Record<string, string>
  }
  const walkOptions = {
    api: new ApiClient(base, undefined, options.gatewayUrl),
    assetBaseUrl: options.assetBaseUrl,
    keyPrefix: options.keyPrefix,
    resolveTargetPage: options.resolveTargetPage,
    resolveAssetUuid: options.resolveAssetUuid,
    cdnMirrors,
  }
  const descriptor = await walkTree(page.content, { urlParams: params }, walkOptions)
  const layout = publicLayout ? await composeLayout(descriptor, publicLayout, walkOptions) : null
  return { page, params, descriptor, layout }
}

export async function getObjectData(id: string, options: WhoobeNuxtOptions): Promise<Record<string, unknown> | null> {
  const base = options.baseUrl.replace(/\/+$/, '')
  const res = await fetch(`${base}/public/data-objects/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(`Whoobe API ${res.status}`)
  const body = await res.json() as { object: Record<string, unknown> | null }
  return body.object ?? null
}

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

export function staticParamsForSlugs(slugs: string[], locale: string): { locale: string; slug: string }[] {
  return slugs.map((slug) => ({ locale, slug }))
}

export function staticParamsForRecords(records: Record<string, unknown>[], field: string, locale: string): { locale: string; slug: string }[] {
  return records
    .map((r) => {
      const attrs = r.attributes as Record<string, unknown> | undefined
      const value = attrs?.[field] ?? r[field]
      return value != null ? { locale, slug: String(value) } : null
    })
    .filter((v): v is { locale: string; slug: string } => v !== null)
}

export function whoobeApi(baseUrl: string, gatewayUrl?: string): WhoobeApi {
  return new ApiClient(baseUrl, undefined, gatewayUrl) as unknown as WhoobeApi
}

export {
  WhoobeProvider,
  WhoobeNode,
  WhoobePage,
  useWhoobe,
  usePage,
  useObject,
  useQuery,
  useForm,
  createWhoobeApi,
  defaults,
  descriptorToProps,
} from '@whoobe-cms/vue'
export type { Registry, NodeComponent, WhoobeApi } from '@whoobe-cms/vue'