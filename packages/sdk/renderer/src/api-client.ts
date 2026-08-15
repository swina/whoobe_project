// Typed client for Whoobe's public API (docs/plans/cms/headless-sdk-plan.md
// §2). Framework-agnostic: an injectable `fetch` works in Node 18+, browsers,
// and RSC/server components. No window/document at module scope - fully SSR-safe.

import type { DataBindingFilter, DataBindingOrderBy } from '@whoobe-cms/schema'
import type { PublicLayout } from './compose-layout.js'

/** The minimal API surface the renderer depends on - implemented by
 *  ApiClient and easy to mock in tests/adapters. */
export interface RenderApi {
  getObject(id: string): Promise<Record<string, unknown> | null>
  queryObjects(params: QueryObjectsParams): Promise<Record<string, unknown>[]>
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
}

export interface SearchParams {
  q?: string
  type?: 'page' | 'object' | 'asset'
  class?: string
  locale?: string
  limit?: number
  offset?: number
}

export class ApiClient implements RenderApi {
  private readonly base: string

  constructor(
    baseUrl: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {
    this.base = baseUrl.replace(/\/+$/, '')
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

  /** POST /public/forms/:classId/submit - submits a form element's values. */
  async submitForm(
    classId: string,
    attributes: Record<string, unknown>,
    formConfig?: unknown,
  ): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/public/forms/${encodeURIComponent(classId)}/submit`, {
      method: 'POST',
      body: JSON.stringify({ attributes, formConfig }),
    })
  }
}
