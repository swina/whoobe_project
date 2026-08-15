// Context + shared types for the Svelte adapter (docs/plans/cms/headless-sdk-
// svelte-vue-plan.md).

import { getContext, setContext } from 'svelte'

export const WHOOBE_KEY = Symbol('whoobe')

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

export interface WhoobeContext {
  registry: Record<string, any>
  api: WhoobeApi
  options: WhoobeAdapterOptions
}

/** Must be called during component initialisation (like any Svelte context). */
export function setWhoobeContext(ctx: WhoobeContext): void {
  setContext(WHOOBE_KEY, ctx)
}

export function getWhoobeContext(): WhoobeContext | undefined {
  return getContext<WhoobeContext | undefined>(WHOOBE_KEY)
}
