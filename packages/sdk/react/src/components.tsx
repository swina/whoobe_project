// Core React components: WhoobeNode (recursive descriptor renderer) and
// WhoobePage (fetch + walk + render, or a pre-walked descriptor for SSR).

import { ApiClient, walkTree, type RenderDescriptor } from '@whoobe-cms/renderer'
import { WhoobeProvider, useWhoobe } from './context.js'
import { defaults } from './defaults.js'
import { usePage } from './hooks.js'
import type { WhoobeApi } from './types.js'

/** Recursively renders one descriptor through the registry (or defaults). */
export function WhoobeNode({ descriptor }: { descriptor: RenderDescriptor }) {
  const ctx = useWhoobe()
  const Comp = ctx.registry[descriptor.kind] ?? defaults[descriptor.kind] ?? defaults.container
  const children = descriptor.children.map((child) => <WhoobeNode key={child.id} descriptor={child} />)
  return <Comp descriptor={descriptor}>{children}</Comp>
}

export interface WhoobePageProps {
  locale?: string
  path?: string
  websiteId?: string
  /** Pre-walked descriptor (SSR path) - when present, no fetch happens. */
  descriptor?: RenderDescriptor
}

/** Fetches a page, validates + walks it, and renders the root node. */
export function WhoobePage({ locale, path, websiteId, descriptor: initial }: WhoobePageProps) {
  const { status, data, error } = usePage(locale, path, websiteId, initial)
  if (status === 'error') return <div className="whoobe-error">{error}</div>
  if (!data) return <div className="whoobe-loading">Loading…</div>
  return <WhoobeNode descriptor={data} />
}

/** Convenience: build an ApiClient from a base URL and use it as `api`. */
export function createWhoobeApi(baseUrl: string): WhoobeApi {
  return new ApiClient(baseUrl) as unknown as WhoobeApi
}

export { WhoobeProvider }
