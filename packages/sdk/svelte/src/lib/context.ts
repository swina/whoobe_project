// Context + shared types for the Svelte adapter (docs/plans/cms/headless-sdk-
// svelte-vue-plan.md).

import { getContext, setContext } from 'svelte'
import type { PublicLayout } from '@whoobe-cms/renderer'

export const WHOOBE_KEY = Symbol('whoobe')

export interface WhoobeAdapterOptions {
  assetBaseUrl?: string
  keyPrefix?: string
  /** Most rows a Table keeps from its list (default 1000). */
  tableMaxRows?: number
  resolveTargetPage?: (id: string) => Promise<{ slug: string; locale: string } | null>
}

export interface WhoobeApi {
  getPage(locale: string, path: string, websiteId?: string): Promise<{ page: { content: unknown }; params: Record<string, string>; layout?: PublicLayout | null }>
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
  submitForm(classId: string, attributes: Record<string, unknown>, formConfig?: unknown): Promise<{ success: boolean; outcome?: string }>
  /** uploads one file of a form's Upload field; the form then carries `{ uploadId }` (ApiClient implements it) */
  uploadFile?(fieldId: string, file: any): Promise<{ uploadId: string }>
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
