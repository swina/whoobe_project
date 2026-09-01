// Client for the headless public search endpoint of apps/core-api
// (GET /public/search - see docs/plans/search-engine/search-engine-plan.md
// §7). Deliberately auth-free: the public endpoint only serves published
// rows, so the spike website can call it directly, unlike the admin
// endpoints used by templates/kits/snippets api clients.
export type SearchDocumentType = 'page' | 'object' | 'class' | 'asset'

export interface SearchOptions {
  q: string
  locale?: string
  websiteId?: string | null
  /** One type or several (comma-separated on the wire) - the search
   *  element lets a site scope its box to pages/assets/objects. */
  type?: SearchDocumentType | SearchDocumentType[] | null
  classId?: string | null
  page?: number
  pageSize?: number
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

import { getDefaultCoreApiUrl } from './core-api-url'

export async function searchContent(options: SearchOptions): Promise<SearchResults> {
  const params = new URLSearchParams()
  params.set('q', options.q)
  if (options.locale) params.set('locale', options.locale)
  if (options.websiteId) params.set('websiteId', options.websiteId)
  if (options.type) params.set('type', Array.isArray(options.type) ? options.type.join(',') : options.type)
  if (options.classId) params.set('classId', options.classId)
  if (options.page && options.page > 1) params.set('page', String(options.page))
  if (options.pageSize) params.set('pageSize', String(options.pageSize))
  if (options.sort && options.sort !== 'relevance') params.set('sort', options.sort)

  const res = await fetch(`${getDefaultCoreApiUrl()}/public/search?${params.toString()}`)
  if (!res.ok) {
    let message = `Search failed with status ${res.status}`
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
