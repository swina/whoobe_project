// The core tree-walker (docs/plans/cms/headless-sdk-plan.md §2) - pure TS,
// no framework imports. Walks a Whoobe element tree and emits a flat-ready
// tree of RenderDescriptors with data/image/link resolution applied. Async
// because object/query data bindings hit the public API.

import { parsePageContent, escapeHtml, isSelectionName, selectionKeys, encodeSelectionKeys, readItemPath, nestedGatewayList, nestedDataList, withParent, bindingSelectionNames, type WhoobeElementNode } from '@whoobe-cms/schema'
import type { RenderDescriptor } from './descriptor.js'
import { normalizeKind, resolveTag } from './kind.js'
import { resolveImageUrl } from './url.js'
import { resolveDynamicLinkPath } from './path-pattern.js'
import { buildTableDescriptor } from './table.js'
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
  /** Most rows a Table keeps from its list (default 1000); the rest are left out and the table says so. */
  tableMaxRows?: number
}

/** Strips a website's CMS-internal `rootPath` prefix from a stored link
 *  href, when present - see RenderOptions.rootPath. Leaves the href alone
 *  otherwise (external URLs, hashes, links already relative to the site
 *  root, or when no rootPath is configured for this render). */
function stripRootPath(href: string, rootPath?: string): string {
  if (!rootPath || !href.startsWith(rootPath)) return href
  return href.slice(rootPath.length) || '/'
}

/** A CSS-safe form of a resolved image address for `url(...)`, or null: the value ends up in an inline style, so anything that could close
 *  the url, the declaration or the attribute is refused (no quotes, parentheses, semicolons, backslashes, angle brackets, whitespace);
 *  a data: URL only for raster images in base64. */
function cssBackgroundUrl(url: string | null): string | null {
  if (!url) return null
  if (/^data:/i.test(url)) return /^data:image\/(png|jpe?g|gif|webp|avif);base64,[A-Za-z0-9+/=]+$/i.test(url) ? url : null
  return /^[^\s"'()\\<>;]+$/.test(url) ? url : null
}

/** Elements whose `image.url` is their own source (img, video, audio, Download); on every other element it is a CSS background image
 *  (the editor draws it that way, and so does the mail renderer). */
function imageIsBackground(node: WhoobeElementNode): boolean {
  return node.element !== 'img' && node.element !== 'video' && node.element !== 'audio' && node.tag !== 'file'
}

function buildStyle(node: WhoobeElementNode, background: string | null): string {
  let style = ''
  if (background) style += `background-image:url(${background});`
  if (node.font) style += `font-family:"${node.font.replaceAll('+', ' ')}";`
  if (node.style) style += node.style
  return style
}

const BLOCK_HTML_RE = /<(?:p|div|ul|ol|li|h[1-6]|blockquote|pre|table|section|article|figure|hr|form)\b/i

/** A paragraph cannot contain block elements: an authored `<p>` whose rich text already holds `<p>` or a list would be split by the HTML
 *  parser on the server, so the browser and the framework disagree about the page (React refuses to hydrate it). Such a text is rendered in a
 *  `div` instead; the look comes from the classes, which do not depend on the tag. */
function htmlSafeTag(tag: string, content: unknown, contentIsHtml: boolean): string {
  return tag === 'p' && contentIsHtml && typeof content === 'string' && BLOCK_HTML_RE.test(content) ? 'div' : tag
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
  // Alpine's shorthands cannot be attribute names everywhere (`@click` is refused by the DOM and dropped by React): the long forms mean the same
  for (const k of Object.keys(base)) {
    const long = k.startsWith('@') ? `x-on:${k.slice(1)}` : k.startsWith(':') ? `x-bind:${k.slice(1)}` : null
    if (long && !(long in base)) { base[long] = base[k]; delete base[k] }
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
  // img, video, audio and the Download element (tag 'file'): each keeps its source (a DAM asset or a URL) in `image.url`
  if (node.element !== 'img' && node.element !== 'video' && node.element !== 'audio' && node.tag !== 'file') return null
  let url: string | null = null
  let alt: string | undefined
  if (node.dataBinding?.field && !(node.type === 'container' && node.dataBinding.target === 'list')) {
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

/** Linked bindings (docs/plans/cms/linked-bindings.md): the attributes that make one repeated item publish a selection when it is clicked and/or
 *  listen to one. The browser part is selection.ts. A listening item is rendered hidden: with nothing selected (the server knows no URL
 *  query) it is not shown, and the page does not flash the whole list before the script runs. */
function withSelection(node: WhoobeElementNode, item: RenderDescriptor, record: Record<string, unknown> | null | undefined, gateway: boolean): RenderDescriptor {
  const sel = node.selection
  if (!sel || (!sel.publish && !sel.listen)) return item
  const read = (field: string): unknown => (record ? (gateway ? resolveFieldFromRecord(record, field) : resolveRecordField(record, field)) : undefined)
  const attributes: Record<string, unknown> = { ...item.attributes }
  let style = item.style
  if (sel.publish && isSelectionName(sel.publish.name)) {
    attributes['data-whoobe-select'] = sel.publish.name
    attributes['data-whoobe-value'] = selectionKeys(read(sel.publish.field))[0] ?? ''
  }
  if (sel.listen && isSelectionName(sel.listen.name)) {
    attributes['data-whoobe-listen'] = sel.listen.name
    attributes['data-whoobe-key'] = encodeSelectionKeys(selectionKeys(read(sel.listen.field)))
    if (sel.listen.whenEmpty === 'all') attributes['data-whoobe-when-empty'] = 'all'
    else style = `${style}display:none!important;`
  }
  return { ...item, attributes, style }
}

/** The children of a container bound to an Integrations value: repeated for each item of a list, or once with the object as the record.
 *  null when the value is neither (the container then renders its children unbound). Shared with the browser-side refresh of a dynamic list. */
export async function walkGatewayValue(node: WhoobeElementNode, resolved: unknown, ctx: WalkContext, options: RenderOptions): Promise<RenderDescriptor[] | null> {
  const children: RenderDescriptor[] = []
  if (Array.isArray(resolved)) {
    for (const item of resolved) {
      const record = typeof item === 'object' && item ? (item as Record<string, unknown>) : undefined
      for (const child of node.blocks ?? []) {
        children.push(withSelection(node, await walkNode(child, { ...ctx, record, gatewayResponse: resolved }, options), record, true))
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
  return null
}

async function walkChildren(node: WhoobeElementNode, ctx: WalkContext, options: RenderOptions): Promise<RenderDescriptor[]> {
  const scope = { ctx, api: options.api }
  const children: RenderDescriptor[] = []

  // Nested lists (docs/plans/cms/nested-bindings.md): a container inside a repeated item that repeats over a list that is PART OF that item.
  // The data came with the parent item, so nothing is fetched. A path that holds one object (not a list) is a single record for the children.
  const nestedData = node.type === 'container' && node.dataBinding?.resolveMode === 'parent' && node.dataBinding.target === 'list' && node.dataBinding.field ? node.dataBinding : null
  const nestedGateway = node.type === 'container' && node.gatewayBinding?.scope === 'item' ? node.gatewayBinding : null
  if (nestedData || nestedGateway) {
    const opts = { limit: (nestedData ?? nestedGateway)?.limit, filters: nestedData?.filters ?? nestedGateway?.filters }
    const parent = ctx.record
    if (parent) {
      const items = nestedData ? nestedDataList(parent, nestedData.field!, opts) : nestedGatewayList(parent, nestedGateway!.fieldPath, opts)
      if (items) {
        for (const record of items as Record<string, unknown>[]) {
          for (const child of node.blocks ?? []) {
            children.push(withSelection(node, await walkNode(child, { ...ctx, record }, options), record, !nestedData))
          }
        }
        return children
      }
      const single = nestedGateway ? readItemPath(parent, nestedGateway.fieldPath) : undefined
      if (single && typeof single === 'object' && !Array.isArray(single)) {
        const record = withParent(single as Record<string, unknown>, parent)
        for (const child of node.blocks ?? []) children.push(await walkNode(child, { ...ctx, record }, options))
      }
    }
    return children // no item in scope, or nothing at that path: an empty list, not a failed page
  }

  // A container with a dataBinding selects the record(s) its children bind
  // against - a `query` binding is a repeater (children per record), any
  // other mode provides a single record (or the context's own).
  if (node.type === 'container' && node.dataBinding) {
    const resolved = await resolveDataBinding(node.dataBinding, scope)
    if (resolved.records && resolved.records.length > 0) {
      for (const record of resolved.records) {
        for (const child of node.blocks ?? []) {
          children.push(withSelection(node, await walkNode(child, { ...ctx, record }, options), record, false))
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
    // Its parameters take a value the visitor chooses in another list (`{selection.x}`): nothing to fetch on the server, the adapter fills the
    // container in the browser when the selection is made (dynamic-list.ts)
    if (bindingSelectionNames(node.gatewayBinding.params).length) return children
    const gatewayUrl = options.api.gatewayUrl || 'http://localhost:3001'
    // a failing gateway (401 without a site key, unreachable, ...) must not abort the whole page: like the field and table bindings, the container then renders its children unbound
    let resolved: unknown
    try {
      resolved = await resolveGatewayBinding(node.gatewayBinding, gatewayUrl, ctx.urlParams, options.api.gatewaySiteAuth)
    } catch (err) {
      console.warn(`[whoobe] container ${node.id ?? ''}: gateway binding failed, rendering it unbound:`, err instanceof Error ? err.message : err)
    }
    const walked = await walkGatewayValue(node, resolved, ctx, options)
    if (walked) return walked
  }

  for (const child of node.blocks ?? []) {
    children.push(await walkNode(child, ctx, options))
  }
  return children
}

/** Walks one validated node into a RenderDescriptor. */
export async function walkNode(node: WhoobeElementNode, ctx: WalkContext, options: RenderOptions): Promise<RenderDescriptor> {
  const scope = { ctx, api: options.api }

  const kind = normalizeKind(node)

  let content = ''
  let contentIsHtml = false
  let transformClassName: string | undefined

  if (node.dataBinding?.field) {
    const value = await resolveFieldValue(node.dataBinding, scope)
    const formatted = formatBoundContent(value, node.dataBinding.transform, node.dataBinding.fieldType)
    content = formatted.content
    contentIsHtml = true
    transformClassName = formatted.className
  } else if (node.gatewayBinding?.scope === 'item') {
    // a field of the item this element sits in (or `^.field` of the item above): read from the record, never fetched
    if (node.type !== 'container' && kind !== 'table') {
      const value = ctx.record ? readItemPath(ctx.record, node.gatewayBinding.fieldPath) : undefined
      const transform = node.gatewayBinding.transform
      if (transform && transform.type !== 'none') {
        const formatted = formatBoundContent(value, transform)
        content = formatted.content
        transformClassName = formatted.className
      } else {
        content = escapeHtml(typeof value === 'string' ? value : value !== undefined && value !== null ? (typeof value === 'object' ? JSON.stringify(value) : String(value)) : '')
      }
      contentIsHtml = true
    }
  } else if (node.gatewayBinding?.fieldPath && kind !== 'table' && !(node.type === 'container' && bindingSelectionNames(node.gatewayBinding.params).length)) {
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
  // an editor-set background image of a container or a leaf: resolved to the DAM address like any other asset
  const background = imageIsBackground(node) && typeof node.image?.url === 'string'
    ? cssBackgroundUrl(resolveImageUrl(node.image.url, options.assetBaseUrl, options.keyPrefix, options.cdnMirrors))
    : null
  // A Download element is a link to its file (an asset of the library or a URL), saved rather than opened. Without a
  // source it stays an inert button. "Open in a new tab" (linkTarget _blank) means open it, so no `download` then.
  // Without a file chosen it stays an inert button: nothing to download, nothing to link to.
  const isDownload = node.tag === 'file'
  const image = isDownload ? null : resolvedImage
  const ownLink = isDownload
    ? (resolvedImage ? { href: resolvedImage.url, target: node.linkTarget ?? undefined, download: node.linkTarget !== '_blank' } : null)
    : resolvedLink
  // An anchor cannot contain another anchor (the HTML parser closes the outer one, so server and browser disagree and React refuses to
  // hydrate): inside a linked element an inner link is dropped, the outer one keeps the whole area clickable.
  const link = ctx.insideLink ? null : ownLink

  const className = [node.css?.css ?? '', node.css?.container ?? '', transformClassName ?? ''].filter(Boolean).join(' ')

  const optionsData = node.data?.options
  const optionsList = Array.isArray(optionsData) ? (optionsData as Array<{ label: string; value: string }>) : null

  return {
    id: node.id,
    kind,
    tag: htmlSafeTag(resolveTag(node), content, contentIsHtml),
    node,
    className,
    style: buildStyle(node, background),
    attributes: buildAttributes(node),
    data: node.data ?? null,
    content,
    contentIsHtml,
    image,
    link,
    ...(kind === 'heading' && node.level != null ? { headingLevel: Number(node.level) } : {}),
    children: await walkChildren(node, link ? { ...ctx, insideLink: true } : ctx, options),
    formConfig: node.formConfig ?? null,
    searchConfig: node.searchConfig ?? null,
    slider: node.slider ?? null,
    table: kind === 'table'
      ? await buildTableDescriptor(node, scope, { maxRows: options.tableMaxRows, gatewayUrl: options.api.gatewayUrl, urlParams: ctx.urlParams, gatewaySiteAuth: options.api.gatewaySiteAuth })
      : null,
    dataBinding: node.dataBinding ?? null,
    options: optionsList,
    ...(node.gsap ? { gsap: node.gsap } : {}),
    ...(node.type === 'container' && node.gatewayBinding && node.gatewayBinding.scope !== 'item' && bindingSelectionNames(node.gatewayBinding.params).length
      ? { dynamicList: { selections: bindingSelectionNames(node.gatewayBinding.params), ...(ctx.urlParams ? { urlParams: ctx.urlParams } : {}) } }
      : {}),
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
