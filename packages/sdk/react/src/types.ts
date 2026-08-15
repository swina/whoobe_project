// Shared types for the React adapter (docs/plans/cms/headless-sdk-plan.md §3).
// The registry contract is identical to the Vue/Svelte adapters: a component
// receives the RenderDescriptor and renders its resolved children.

import type { ComponentType, ReactNode } from 'react'
import type { RenderDescriptor } from '@whoobe-cms/renderer'

export interface WhoobeAdapterOptions {
  assetBaseUrl?: string
  keyPrefix?: string
  resolveTargetPage?: (id: string) => Promise<{ slug: string; locale: string } | null>
}

export interface WhoobeApi {
  getPage(locale: string, path: string, websiteId?: string): Promise<{ page: { content: unknown }; params: Record<string, string> }>
  getObject(id: string): Promise<Record<string, unknown> | null>
  queryObjects(params: {
    class: string
    filters?: unknown[]
    orderBy?: unknown
    offset?: number | null
    limit?: number | null
    locale?: string | null
  }): Promise<Record<string, unknown>[]>
  search(params: Record<string, unknown>): Promise<Record<string, unknown>>
  submitForm(classId: string, attributes: Record<string, unknown>, formConfig?: unknown): Promise<{ success: boolean }>
}

/** A registry component: renders one descriptor and its resolved children. */
export type NodeComponent = ComponentType<{ descriptor: RenderDescriptor; children?: ReactNode }>

export type Registry = Record<string, NodeComponent>

export interface WhoobeContextValue {
  registry: Registry
  api: WhoobeApi
  options: WhoobeAdapterOptions
}

/** Flattens a descriptor into plain render props for consumers who render
 *  primitives themselves. */
export function descriptorToProps(d: RenderDescriptor): {
  className: string
  style: string
  attributes: Record<string, unknown>
  content: string
  image: { url: string; alt?: string | null } | null
  link: RenderDescriptor['link']
} {
  return {
    className: d.className,
    style: d.style,
    attributes: d.attributes,
    content: d.content,
    image: d.image,
    link: d.link,
  }
}
