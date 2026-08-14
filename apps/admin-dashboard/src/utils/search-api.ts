// Thin HTTP client for apps/core-api's /whoobe-one/search endpoints -
// session-gated (OBJECTS_READ) admin search over the same Postgres
// tsvector index the public /public/search endpoint serves, plus the
// full-rebuild POST. Follows pages-api.ts's own shape: baseUrl comes from
// authStore.config so it obeys the same configurable core-api URL as the
// rest of the dashboard.
import { getDefaultCoreApiUrl } from './auth-api'

export type SearchDocumentType = 'page' | 'object' | 'class' | 'asset'

export interface SearchOptions {
  q: string
  locale?: string
  type?: SearchDocumentType | SearchDocumentType[] | null
  classId?: string | null
  page?: number
  pageSize?: number
  includeUnpublished?: boolean
  sort?: 'relevance' | 'date'
}

export interface SearchResult {
  id: string
  type: SearchDocumentType
  title: string
  path: string
  excerpt: string
  score: number
  category: string
  locale: string
  publishedAt: string | null
  payload: {
    key?: string
    slug?: string
    classId?: string
    className?: string
    websiteId?: string
    translationGroupId?: string
  } | null
  url: string | null
}

export interface SearchResults {
  query: string
  total: number
  page: number
  pageSize: number
  tookMs: number
  results: SearchResult[]
}

export interface ReindexCounts {
  pages: number
  objects: number
  classes: number
  assets: number
}

async function request<T>(path: string, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  const res = await fetch(`${getDefaultCoreApiUrl()}${path}`, {
    method,
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
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

export async function adminSearch(options: SearchOptions): Promise<SearchResults> {
  const params = new URLSearchParams()
  params.set('q', options.q)
  if (options.locale) params.set('locale', options.locale)
  if (options.type) params.set('type', Array.isArray(options.type) ? options.type.join(',') : options.type)
  if (options.classId) params.set('classId', options.classId)
  if (options.page && options.page > 1) params.set('page', String(options.page))
  if (options.pageSize) params.set('pageSize', String(options.pageSize))
  if (options.includeUnpublished) params.set('includeUnpublished', 'true')
  if (options.sort && options.sort !== 'relevance') params.set('sort', options.sort)
  return request(`/whoobe-one/search?${params.toString()}`)
}

export async function reindexSearchIndex(): Promise<ReindexCounts> {
  return request('/whoobe-one/search/reindex', 'POST')
}
