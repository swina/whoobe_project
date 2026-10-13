// Typed client for Whoobe's public API (docs/plans/cms/headless-sdk-plan.md
// §2). Framework-agnostic: an injectable `fetch` works in Node 18+, browsers,
// and RSC/server components. No window/document at module scope - fully SSR-safe.

import { FormUploadError } from './form-values.js'
import { sanitizeOutcome } from './form-result.js'
import type { DataBindingFilter, DataBindingOrderBy } from '@whoobe-cms/schema'
import type { PublicLayout } from './compose-layout.js'

/** The minimal API surface the renderer depends on - implemented by
 *  ApiClient and easy to mock in tests/adapters. */
/** Present only when a caller runs server-side and holds the site's real
 *  Gateway API key (docs/plans/api-gateway/gateway-auth-authz.md) - e.g.
 *  Next.js's getPageData() during SSR. Never constructed from a browser-
 *  visible env var (a NEXT_PUBLIC_ one, or Nuxt's public runtimeConfig), or
 *  the "secret" is just handed to every visitor. */
export interface GatewaySiteAuth {
  siteId: string
  siteKey: string
}

export interface RenderApi {
  getObject(id: string): Promise<Record<string, unknown> | null>
  queryObjects(params: QueryObjectsParams): Promise<Record<string, unknown>[]>
  /** Base URL of the API Gateway for gateway binding resolution. */
  gatewayUrl?: string
  /** Site key sent directly as headers when calling the gateway - only ever
   *  set server-side (see GatewaySiteAuth). */
  gatewaySiteAuth?: GatewaySiteAuth
  /** When set, ApiClient.submitForm() posts to this SAME-ORIGIN relative
   *  path instead of calling the gateway directly - the published site's own
   *  server-side proxy route (packages/publish/src/cli.ts's generated
   *  app/api/whoobe-gateway-submit or server/api/whoobe-gateway-submit.post)
   *  then attaches the real site key from a server-only env var. This is
   *  what actually happens in a browser-triggered submit (useForm), where
   *  gatewaySiteAuth above would otherwise have to be shipped to the client. */
  gatewaySubmitProxyPath?: string
  /** The same for the resolution of a binding that depends on a selection in the visitor's browser (`resolveDynamicChildren`): a SAME-ORIGIN
   *  path of the published site's server, which adds the site key; the browser never holds it. */
  gatewayResolveProxyPath?: string
}

export interface QueryObjectsParams {
  class: string
  filters?: DataBindingFilter[]
  orderBy?: DataBindingOrderBy | null
  offset?: number | null
  limit?: number | null
  locale?: string | null
}

export interface PublicPageRecord {
  id: string
  locale: string
  slug: string
  title: string
  published: boolean
  content: unknown
  seo: Record<string, unknown> | null
  [key: string]: unknown
}

export interface PublicPageLookup {
  page: PublicPageRecord
  params: Record<string, string>
  /** Website-template composition (website-templates.md) - present only when
   *  the website has a template for this path. */
  layout?: PublicLayout | null
  /** ref -> CDN mirror URL for this page's image references that have one
   *  (docs/plans/assets/assets-cdn.md) - pass through to walkTree()'s
   *  RenderOptions.cdnMirrors so resolveImageUrl() prefers it. */
  cdnMirrors?: Record<string, string>
}

export interface SearchParams {
  q?: string
  type?: 'page' | 'object' | 'asset'
  class?: string
  locale?: string
  limit?: number
  offset?: number
}

export interface ApiClientOptions {
  gatewaySiteAuth?: GatewaySiteAuth
  gatewaySubmitProxyPath?: string
  gatewayResolveProxyPath?: string
}

export class ApiClient implements RenderApi {
  private readonly base: string
  gatewayUrl?: string
  gatewaySiteAuth?: GatewaySiteAuth
  gatewaySubmitProxyPath?: string
  gatewayResolveProxyPath?: string

  constructor(
    baseUrl: string,
    // .bind(globalThis), not the bare reference - native fetch requires its
    // receiver to be the real global object; stored as a plain instance
    // property and later invoked as `this.fetchImpl(...)`, the receiver is
    // the ApiClient instance instead, and real browsers (unlike Node/
    // undici, which tolerate it) throw "Failed to execute 'fetch' on
    // 'Window': Illegal invocation" - found live, client-side, on a route
    // that happens to construct its own ApiClient directly instead of
    // going through getPageData()'s bare top-level `fetch(...)` call.
    private readonly fetchImpl: typeof fetch = globalThis.fetch?.bind(globalThis),
    gatewayUrl?: string,
    options?: ApiClientOptions,
  ) {
    this.base = baseUrl.replace(/\/+$/, '')
    this.gatewayUrl = gatewayUrl
    this.gatewaySiteAuth = options?.gatewaySiteAuth
    this.gatewaySubmitProxyPath = options?.gatewaySubmitProxyPath
    this.gatewayResolveProxyPath = options?.gatewayResolveProxyPath
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.base}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
    if (!res.ok) {
      let message = `Whoobe API ${res.status}`
      try {
        const body = await res.json()
        if (body?.error) message = body.error
      } catch {
        // Keep the generic message.
      }
      throw new Error(message)
    }
    return res.json() as Promise<T>
  }

  /** GET /public/pages/:locale/* - the published page for a path. */
  async getPage(locale: string, path: string, websiteId?: string): Promise<PublicPageLookup> {
    const qs = websiteId ? `?websiteId=${encodeURIComponent(websiteId)}` : ''
    const p = path.startsWith('/') ? path : `/${path}`
    return this.request<PublicPageLookup>(`/public/pages/${encodeURIComponent(locale)}${p}${qs}`)
  }

  /** GET /public/data-objects/:id - a published object, or null. */
  async getObject(id: string): Promise<Record<string, unknown> | null> {
    const body = await this.request<{ object: Record<string, unknown> | null }>(`/public/data-objects/${encodeURIComponent(id)}`)
    return body.object ?? null
  }

  /** POST /public/data-objects/query - filtered published objects. */
  async queryObjects(params: QueryObjectsParams): Promise<Record<string, unknown>[]> {
    const body = await this.request<{ objects: Record<string, unknown>[] }>('/public/data-objects/query', {
      method: 'POST',
      body: JSON.stringify({
        class: params.class,
        filters: params.filters,
        orderBy: params.orderBy,
        offset: params.offset,
        limit: params.limit,
        locale: params.locale,
      }),
    })
    return body.objects ?? []
  }

  /** GET /public/search - site search results. */
  async search(params: SearchParams): Promise<Record<string, unknown>> {
    const qs = new URLSearchParams()
    if (params.q) qs.set('q', params.q)
    if (params.type) qs.set('type', params.type)
    if (params.class) qs.set('class', params.class)
    if (params.locale) qs.set('locale', params.locale)
    if (params.limit != null) qs.set('limit', String(params.limit))
    if (params.offset != null) qs.set('offset', String(params.offset))
    return this.request<Record<string, unknown>>(`/public/search?${qs.toString()}`)
  }

  /** POST /public/forms/:classId/submit - submits a form element's values.
   *  When `formConfig.gatewayBindingId` is set (server-resolved at page-save
   *  time, core-api's bind-page-content.ts - see docs/plans/api-gateway/
   *  gateway-auth-authz.md), `classId` is ignored and the values are
   *  forwarded to the Gateway's public submit endpoint instead (a write to
   *  a third-party API/ERP rather than a Data Object). Prefers
   *  `gatewaySubmitProxyPath` (a same-origin route on the published site's
   *  own server, which holds the real site key) over calling the gateway
   *  directly - this method runs in the visitor's browser (useForm/
   *  mountFormSubmit), so it must never itself hold a secret. */
  async submitForm(
    classId: string,
    attributes: Record<string, unknown>,
    formConfig?: { gatewayBindingId?: string } & Record<string, unknown>,
  ): Promise<{ success: boolean; outcome?: string }> {
    if (formConfig?.gatewayBindingId) {
      const bindingId = formConfig.gatewayBindingId
      const useProxy = !!this.gatewaySubmitProxyPath
      const url = useProxy
        ? this.gatewaySubmitProxyPath!
        : `${(this.gatewayUrl || 'http://localhost:3001').replace(/\/+$/, '')}/api/v1/gateway/submit`
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (!useProxy && this.gatewaySiteAuth) {
        headers['X-Whoobe-Site-Id'] = this.gatewaySiteAuth.siteId
        headers['X-Whoobe-Site-Key'] = this.gatewaySiteAuth.siteKey
      }
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ bindingId, attributes }),
      })
      if (!res.ok) {
        let message = `Gateway submit ${res.status}`
        try {
          const body = await res.json()
          if (body?.error) message = body.error
        } catch {
          // Keep the generic message.
        }
        throw new Error(message)
      }
      // Only the outcome key of the service's reply is kept (see form-result.ts); the rest of the body is not passed on.
      const reply = (await res.json()) as { success: boolean; outcome?: unknown }
      const outcome = sanitizeOutcome(reply?.outcome)
      return outcome ? { success: reply.success, outcome } : { success: reply.success }
    }

    return this.request<{ success: boolean; outcome?: string }>(`/public/forms/${encodeURIComponent(classId)}/submit`, {
      method: 'POST',
      body: JSON.stringify({ attributes, formConfig }),
    })
  }

  /** Uploads one file for a form's Upload field: the server approves it (`/public/uploads/intent`: the website's limits), then the
   *  bytes go to the address it returns. Resolves to the id the form submission carries in place of the file. The server's own
   *  message is kept in the error (too large, type not allowed ...), as it is meant for the visitor. */
  async uploadFile(fieldId: string, file: { name: string; size: number } & Record<string, unknown>): Promise<{ uploadId: string }> {
    let intent: { uploadId: string; uploadUrl: string }
    try {
      intent = await this.request<{ uploadId: string; uploadUrl: string }>('/public/uploads/intent', {
        method: 'POST',
        body: JSON.stringify({ fieldId, filename: file.name, size: file.size }),
      })
    } catch (err) {
      throw new FormUploadError(err instanceof Error ? err.message : 'The file could not be uploaded')
    }
    const res = await this.fetchImpl(intent.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: file as any })
    if (!res.ok) {
      let message = `The file could not be uploaded (${res.status})`
      try {
        const body = await res.json()
        if (body?.error) message = body.error
      } catch {
        // keep the generic message
      }
      throw new FormUploadError(message)
    }
    return { uploadId: intent.uploadId }
  }

  /** GET /public/pages?websiteId=... - all published pages for a website. */
  async listPages(websiteId?: string): Promise<PublicPageRecord[]> {
    const qs = websiteId ? `?websiteId=${encodeURIComponent(websiteId)}` : ''
    const body = await this.request<{ pages: PublicPageRecord[] }>(`/public/pages${qs}`)
    return body.pages ?? []
  }

  /** GET /public/websites/:id - website info including themes. */
  async getWebsite(id: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/public/websites/${encodeURIComponent(id)}`)
  }
}
