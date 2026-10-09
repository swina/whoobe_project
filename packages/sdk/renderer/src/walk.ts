// The core tree-walker (docs/plans/cms/headless-sdk-plan.md §2) - pure TS,
// no framework imports. Walks a Whoobe element tree and emits a flat-ready
// tree of RenderDescriptors with data/image/link resolution applied. Async
// because object/query data bindings hit the public API.

import { parsePageContent, escapeHtml, type WhoobeElementNode } from '@whoobe-cms/schema'
import type { RenderDescriptor } from './descriptor.js'
import { normalizeKind, resolveTag } from './kind.js'
import { resolveImageUrl } from './url.js'
import { resolveDynamicLinkPath } from './path-pattern.js'
import { formatBoundContent, resolveDataBinding, resolveFieldValue, resolveRecordField, resolveGatewayBinding, resolveGatewayFieldValue, resolveFieldFromRecord } from './resolve.js'
import type { RenderApi } from './api-client.js'

/** The data in scope for relative bindings - a consumer supplies the page's
 *  record (currentPage/parent) or form values; the walker sets `record` as
 *  it descends into bound containers. */
export interface WalkContext {
  record?: Record<string, unknown> | null
  form?: Record<string, unknown>
  /** Resolved gateway response for the current container scope, so child
   *  elements can read fields without re-fetching. */
  gatewayResponse?: unknown
  /** The current page's own matched dynamic-slug params (e.g. `{id: '123'}`
   *  for a page routed at `/product/{id}`), as returned alongside `page` by
   *  the public pages lookup. Lets a `{name}`-placeholder dataBinding filter
   *  value or gatewayBinding param resolve to the record the visitor
   *  actually requested - see resolve.ts's substituteUrlParam(). */
  urlParams?: Record<string, string>
  [key: string]: unknown
}

export interface RenderOptions {
  /** Public API client (or a mock) for object/query bindings. */
  api: RenderApi
  /** Base URL of the DAM asset proxy (e.g. http://host:3002/dam-asset). */
  assetBaseUrl?: string
  /** S3 key prefix applied to DAM path references. */
  keyPrefix?: string
  /** ref -> CDN mirror URL, from the public page-serving API's own response
   *  (apps/core-api/src/server.ts's `cdnMirrors` field) - takes priority
   *  over assetBaseUrl when a reference has one. */
  cdnMirrors?: Record<string, string>
  /** Resolves a dynamicLink's target page by id to its slug pattern +
   *  locale; when absent, dynamic links resolve to '#'. */
  resolveTargetPage?: (id: string) => Promise<{ slug: string; locale: string } | null>
  /** Resolves a DAM asset UUID to a public URL. When present, UUID image
   *  references are resolved via this callback instead of being dropped. */
  resolveAssetUuid?: (uuid: string) => Promise<string | null>
  /** The website's CMS-internal `rootPath` (e.g. '/aura-network'). When set,
   *  stripped from the front of any stored `node.link` href that starts
   *  with it - see WhoobeAdapterOptions.rootPath for why. */
  rootPath?: string
}

/** Strips a website's CMS-internal `rootPath` prefix from a stored link
 *  href, when present - see RenderOptions.rootPath. Leaves the href alone
 *  otherwise (external URLs, hashes, links already relative to the site
 *  root, or when no rootPath is configured for this render). */
function stripRootPath(href: string, rootPath?: string): string {
  if (!rootPath || !href.startsWith(rootPath)) return href
  return href.slice(rootPath.length) || '/'
}

function buildStyle(node: WhoobeElementNode): string {
  let style = ''
  if (node.font) style += `font-family:"${node.font.replaceAll('+', ' ')}";`
  if (node.style) style += node.style
  return style
}

function buildAttributes(node: WhoobeElementNode): Record<string, unknown> {
  const attrs = node.data?.attributes
  const base: Record<string, unknown> = attrs && typeof attrs === 'object' ? { ...(attrs as Record<string, unknown>) } : {}
  // Merge Alpine.js directives from the node's native `alpine` field,
  // safely coercing non-string values to empty string so Alpine never
  // receives `x-data="[object Object]"`.
  if (node.alpine && typeof node.alpine === 'object') {
    for (const [k, v] of Object.entries(node.alpine)) {
      base[k] = typeof v === 'string' ? v : ''
    }
  }
  // The id of an Upload field travels in the DOM so the page can name it when it asks for an upload (form-values.ts)
  if (base.type === 'file' && node.element === 'input') base['data-whoobe-upload'] = node.id
  return base
}

async function resolveNodeLink(
  node: WhoobeElementNode,
  scope: { ctx: WalkContext; api: RenderApi },
  options: RenderOptions,
): Promise<RenderDescriptor['link']> {
  if (node.link) return { href: stripRootPath(node.link, options.rootPath), target: node.linkTarget ?? undefined }
  if (node.dynamicLink) {
    if (options.resolveTargetPage) {
      const target = await options.resolveTargetPage(node.dynamicLink.targetPageId)
      const value = scope.ctx.record
        ? node.dynamicLink.source === 'gateway'
          ? resolveFieldFromRecord(scope.ctx.record, node.dynamicLink.valueField)
          : resolveRecordField(scope.ctx.record, node.dynamicLink.valueField)
        : undefined
      if (target && value != null) {
        const href = resolveDynamicLinkPath(target.slug, String(value))
        if (href) return { href, target: node.linkTarget ?? undefined, dynamic: node.dynamicLink }
      }
    }
    return { href: '#', dynamic: node.dynamicLink }
  }
  return null
}

async function resolveNodeImage(
  node: WhoobeElementNode,
  scope: { ctx: WalkContext; api: RenderApi },
  options: RenderOptions,
): Promise<{ url: string; alt?: string | null } | null> {
  // img, audio and the Download element (tag 'file'): each keeps its source (a DAM asset or a URL) in `image.url`
  if (node.element !== 'img' && node.element !== 'audio' && node.tag !== 'file') return null
  let url: string | null = null
  let alt: string | undefined
  if (node.dataBinding?.field) {
    const value = await resolveFieldValue(node.dataBinding, scope)
    if (typeof value === 'string') url = resolveImageUrl(value, options.assetBaseUrl, options.keyPrefix, options.cdnMirrors)
  } else if (node.image?.url) {
    url = resolveImageUrl(node.image.url, options.assetBaseUrl, options.keyPrefix, options.cdnMirrors)
    // UUID references need the asset resolver callback
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!url && UUID_RE.test(node.image.url) && options.resolveAssetUuid) {
      url = await options.resolveAssetUuid(node.image.url)
    }
  }
  if (!url) return null
  alt = node.image?.alt ?? undefined
  if (alt == null && node.dataBinding?.field) {
    const value = await resolveFieldValue(node.dataBinding, scope)
    if (typeof value === 'string') alt = value
  }
  return { url, alt }
}

async function walkChildren(node: WhoobeElementNode, ctx: WalkContext, options: RenderOptions): Promise<RenderDescriptor[]> {
  const scope = { ctx, api: options.api }
  const children: RenderDescriptor[] = []

  // A container with a dataBinding selects the record(s) its children bind
  // against - a `query` binding is a repeater (children per record), any
  // other mode provides a single record (or the context's own).
  if (node.type === 'container' && node.dataBinding) {
    const resolved = await resolveDataBinding(node.dataBinding, scope)
    if (resolved.records && resolved.records.length > 0) {
      for (const record of resolved.records) {
        for (const child of node.blocks ?? []) {
          children.push(await walkNode(child, { ...ctx, record }, options))
        }
      }
      return children
    }
    const record = resolved.record
    for (const child of node.blocks ?? []) {
      children.push(await walkNode(child, record ? { ...ctx, record } : ctx, options))
    }
    return children
  }

  // A container with a gatewayBinding resolves the endpoint and repeats
  // children for each item if the result is an array, or sets the context
  // record to the resolved value for child field bindings.
  if (node.type === 'container' && node.gatewayBinding) {
    const gatewayUrl = options.api.gatewayUrl || 'http://localhost:3001'
    const resolved = await resolveGatewayBinding(node.gatewayBinding, gatewayUrl, ctx.urlParams, options.api.gatewaySiteAuth)
    if (Array.isArray(resolved)) {
      for (const item of resolved) {
        for (const child of node.blocks ?? []) {
          const record = typeof item === 'object' && item ? (item as Record<string, unknown>) : undefined
          children.push(await walkNode(child, { ...ctx, record, gatewayResponse: resolved }, options))
        }
      }
      return children
    }
    if (typeof resolved === 'object' && resolved) {
      const record = resolved as Record<string, unknown>
      for (const child of node.blocks ?? []) {
        children.push(await walkNode(child, { ...ctx, record, gatewayResponse: resolved }, options))
      }
      return children
    }
  }

  for (const child of node.blocks ?? []) {
    children.push(await walkNode(child, ctx, options))
  }
  return children
}

/** Walks one validated node into a RenderDescriptor. */
export async function walkNode(node: WhoobeElementNode, ctx: WalkContext, options: RenderOptions): Promise<RenderDescriptor> {
  const scope = { ctx, api: options.api }

  let content = ''
  let contentIsHtml = false
  let transformClassName: string | undefined

  if (node.dataBinding?.field) {
    const value = await resolveFieldValue(node.dataBinding, scope)
    const formatted = formatBoundContent(value, node.dataBinding.transform)
    content = formatted.content
    contentIsHtml = true
    transformClassName = formatted.className
  } else if (node.gatewayBinding?.fieldPath) {
    const transform = node.gatewayBinding.transform
    const format = (value: unknown) => {
      if (transform && transform.type !== 'none') {
        const formatted = formatBoundContent(value, transform)
        content = formatted.content
        transformClassName = formatted.className
      } else {
        // No transform configured - same raw/JSON fallback as a "no
        // transform" dataBinding would get from formatBoundContent, escaped
        // (this is emitted as HTML) since an unformatted gateway response
        // value is untrusted external content, not authored HTML.
        content = escapeHtml(typeof value === 'string' ? value : value !== undefined ? JSON.stringify(value) : '')
      }
      contentIsHtml = true
    }
    // If we're inside a container repeater, resolve the field from the
    // context record instead of hitting the gateway again.
    if (ctx.record) {
      format(resolveFieldFromRecord(ctx.record, node.gatewayBinding.fieldPath))
    } else {
      try {
        const gatewayUrl = options.api.gatewayUrl || 'http://localhost:3001'
        const value = await resolveGatewayBinding(node.gatewayBinding, gatewayUrl, ctx.urlParams, options.api.gatewaySiteAuth)
        format(value)
      } catch {
        content = ''
        contentIsHtml = true
      }
    }
  } else if (typeof node.content === 'string') {
    content = node.content
    contentIsHtml = true // static content is authored HTML
  }

  const [resolvedImage, resolvedLink] = await Promise.all([
    resolveNodeImage(node, scope, options),
    resolveNodeLink(node, scope, options),
  ])
  // A Download element is a link to its file (an asset of the library or a URL), saved rather than opened. Without a
  // source it stays an inert button. "Open in a new tab" (linkTarget _blank) means open it, so no `download` then.
  // Without a file chosen it stays an inert button: nothing to download, nothing to link to.
  const isDownload = node.tag === 'file'
  const image = isDownload ? null : resolvedImage
  const link = isDownload
    ? (resolvedImage ? { href: resolvedImage.url, target: node.linkTarget ?? undefined, download: node.linkTarget !== '_blank' } : null)
    : resolvedLink

  const className = [node.css?.css ?? '', node.css?.container ?? '', transformClassName ?? ''].filter(Boolean).join(' ')

  const kind = normalizeKind(node)

  const optionsData = node.data?.options
  const optionsList = Array.isArray(optionsData) ? (optionsData as Array<{ label: string; value: string }>) : null

  return {
    id: node.id,
    kind,
    tag: resolveTag(node),
    node,
    className,
    style: buildStyle(node),
    attributes: buildAttributes(node),
    data: node.data ?? null,
    content,
    contentIsHtml,
    image,
    link,
    ...(kind === 'heading' && node.level != null ? { headingLevel: Number(node.level) } : {}),
    children: await walkChildren(node, ctx, options),
    formConfig: node.formConfig ?? null,
    searchConfig: node.searchConfig ?? null,
    slider: node.slider ?? null,
    dataBinding: node.dataBinding ?? null,
    options: optionsList,
    ...(node.gsap ? { gsap: node.gsap } : {}),
  }
}

/** Walks a (raw) element tree or page content into render descriptors.
 *  The tree is validated against @whoobe-cms/schema first; throws a ZodError
 *  with a clear path on malformed input. */
export async function walkTree(root: WhoobeElementNode | unknown, ctx: WalkContext, options: RenderOptions): Promise<RenderDescriptor> {
  const node = parsePageContent(root)
  if (!node) {
    throw new Error('Invalid Whoobe element tree - failed schema validation')
  }
  return walkNode(node, ctx, options)
}
