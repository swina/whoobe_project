// Svelte stores wrapping the renderer/api for async data loading. Factories
// take an explicit api+options (context isn't reachable outside component
// init), matching the Vue adapter's usePage/useObject/useQuery.

import { writable } from 'svelte/store'
import { walkTree, ApiClient } from '@whoobe-cms/renderer'
import type { WhoobeAdapterOptions, WhoobeApi } from './context.js'

export interface AsyncStore<T> {
  subscribe: ReturnType<typeof writable<{ status: 'loading' | 'ready' | 'error'; data: T | null; error: string | null }>>['subscribe']
  reload: () => Promise<void>
}

function makeStore<T>(load: () => Promise<T>) {
  const store = writable<{ status: 'loading' | 'ready' | 'error'; data: T | null; error: string | null }>({
    status: 'loading',
    data: null,
    error: null,
  })
  async function reload() {
    store.set({ status: 'loading', data: storeValue(store).data, error: null })
    try {
      store.set({ status: 'ready', data: await load(), error: null })
    } catch (e: any) {
      store.set({ status: 'error', data: null, error: e?.message ?? 'Failed to load' })
    }
  }
  reload()
  return { subscribe: store.subscribe, reload }
}

function storeValue<T>(store: { subscribe: (fn: (v: T) => void) => () => void }): T {
  let value!: T
  const unsub = store.subscribe((v) => (value = v))
  unsub()
  return value
}

/** Loads + walks a published page by locale/path. */
export function createPageStore(api: WhoobeApi, options: WhoobeAdapterOptions, locale: string, path: string, websiteId?: string) {
  return makeStore<ReturnType<typeof walkTree> extends Promise<infer R> ? R : never>(async () => {
    const lookup = await api.getPage(locale, path, websiteId)
    return walkTree(lookup.page.content, { urlParams: lookup.params }, {
      api: api as never,
      assetBaseUrl: options.assetBaseUrl,
      keyPrefix: options.keyPrefix,
      resolveTargetPage: options.resolveTargetPage,
    })
  })
}

export function createObjectStore(api: WhoobeApi, id: string) {
  return makeStore<Record<string, unknown>>(() => api.getObject(id).then((o) => o ?? {}))
}

export function createQueryStore(
  api: WhoobeApi,
  params: { class: string; filters?: unknown[]; orderBy?: unknown; offset?: number | null; limit?: number | null; locale?: string | null },
) {
  return makeStore<Record<string, unknown>[]>(() => api.queryObjects(params))
}

/** Convenience: an ApiClient over a base URL satisfies the WhoobeApi shape. */
export function createWhoobeApi(baseUrl: string): WhoobeApi {
  return new ApiClient(baseUrl) as unknown as WhoobeApi
}
