// The Vue adapter for the headless SDK (docs/plans/cms/headless-sdk-svelte-
// vue-plan.md). Consumes @whoobe-cms/renderer's RenderDescriptors and maps
// node `kind`s to Vue components via a registry (falling back to built-in
// primitives). Components are plain `defineComponent` + `h()` render
// functions, so the package builds with plain `tsc` - no Vite/SFC step.
//
// The registry contract: a component receives a `descriptor` prop (the
// RenderDescriptor) and an optional `children` prop (VNodes for its resolved
// children). Consumers override `registry[kind]` to map a node to their own
// design-system component.

import type { Component, DefineComponent, InjectionKey, PropType, VNode } from 'vue'
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

/** A registry component: renders one descriptor, plus its resolved children
 *  passed as VNodes. */
export type NodeComponent = DefineComponent<{ descriptor: RenderDescriptor; children?: VNode[] }>

export type Registry = Partial<Record<string, NodeComponent>>

export interface WhoobeContext {
  registry: Registry
  api: WhoobeApi
  options: WhoobeAdapterOptions
}

export const WHOOBE_KEY: InjectionKey<WhoobeContext> = Symbol.for('whoobe')

/** Flattens a descriptor into plain render props (class/style/attrs/content/
 *  image/link) - handy for consumers who render primitives themselves. */
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
