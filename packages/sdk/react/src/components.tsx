"use client"
// Core React components: WhoobeNode (recursive descriptor renderer) and
// WhoobePage (fetch + walk + render, or a pre-walked descriptor for SSR).

import { ApiClient, walkTree, composeLayout, type RenderDescriptor, type ComposedLayout } from '@whoobe-cms/renderer'
import { WhoobeProvider, useWhoobe } from './context.js'
import { defaults } from './defaults.js'
import { usePage } from './hooks.js'
import type { WhoobeApi } from './types.js'
import type { ReactNode } from 'react'

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
  /** Pre-composed website-template shell (SSR path) - see composeLayout. */
  layout?: ComposedLayout | null
}

/** Fetches a page, validates + walks it, and renders the root node (or the
 *  header/aside/main/footer shell when the website has a template). */
export function WhoobePage({ locale, path, websiteId, descriptor: initial, layout: initialLayout }: WhoobePageProps) {
  const { status, data, layout, error } = usePage(locale, path, websiteId, initial)
  if (status === 'error') return <div className="whoobe-error">{error}</div>
  if (!data) return <div className="whoobe-loading">Loading…</div>

  const resolvedLayout = layout ?? initialLayout
  if (!resolvedLayout) return <WhoobeNode descriptor={data} />

  const region = (d: RenderDescriptor | null): ReactNode => (d ? <WhoobeNode descriptor={d} /> : null)
  return (
    <div className="whoobe-page">
      {region(resolvedLayout.header)}
      {region(resolvedLayout.aside)}
      <main className="whoobe-page-body">
        <WhoobeNode descriptor={data} />
      </main>
      {region(resolvedLayout.footer)}
    </div>
  )
}

/** Convenience: build an ApiClient from a base URL and use it as `api`. */
export function createWhoobeApi(baseUrl: string, gatewayUrl?: string): WhoobeApi {
  return new ApiClient(baseUrl, undefined, gatewayUrl) as unknown as WhoobeApi
}
