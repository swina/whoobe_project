"use client"
// React hooks wrapping the renderer/api (usePage/useObject/useQuery/useForm).

import { useCallback, useEffect, useState } from 'react'
import { walkTree, composeLayout, type RenderDescriptor, type ComposedLayout } from '@whoobe-cms/renderer'
import { useWhoobe } from './context.js'

export type AsyncStatus = 'loading' | 'ready' | 'error'

export interface AsyncState<T> {
  status: AsyncStatus
  data: T | null
  error: string | null
  reload: () => void
}

/** Loads + walks a published page by locale/path. Accepts an optional
 *  pre-walked descriptor (SSR) to skip the client-side fetch. */
export function usePage(
  locale?: string,
  path?: string,
  websiteId?: string,
  initial?: RenderDescriptor,
): AsyncState<RenderDescriptor> & { layout: ComposedLayout | null } {
  const ctx = useWhoobe()
  const [status, setStatus] = useState<AsyncStatus>(initial ? 'ready' : 'loading')
  const [data, setData] = useState<RenderDescriptor | null>(initial ?? null)
  const [layout, setLayout] = useState<ComposedLayout | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!locale || !path) {
      setStatus('error')
      setError('locale and path are required')
      return
    }
    setStatus('loading')
    setError(null)
    try {
      const lookup = await ctx.api.getPage(locale, path, websiteId)
      const walkOptions = {
        api: ctx.api as never,
        assetBaseUrl: ctx.options.assetBaseUrl,
        keyPrefix: ctx.options.keyPrefix,
        resolveTargetPage: ctx.options.resolveTargetPage,
      }
      const descriptor = await walkTree(lookup.page.content, { urlParams: lookup.params }, walkOptions)
      setData(descriptor)
      setLayout(lookup.layout ? await composeLayout(descriptor, lookup.layout, walkOptions) : null)
      setStatus('ready')
    } catch (e: any) {
      setStatus('error')
      setError(e?.message ?? 'Failed to load page')
    }
  }, [ctx, locale, path, websiteId])

  useEffect(() => {
    if (!initial) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load])

  return { status, data, layout, error, reload: load }
}

/** Loads a published data object by id (raw record). */
export function useObject(id?: string): AsyncState<Record<string, unknown>> {
  const ctx = useWhoobe()
  const [status, setStatus] = useState<AsyncStatus>('loading')
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setStatus('loading')
    try {
      setData(await ctx.api.getObject(id))
      setStatus('ready')
    } catch (e: any) {
      setStatus('error')
      setError(e?.message ?? 'Failed to load object')
    }
  }, [ctx, id])

  useEffect(() => {
    void load()
  }, [load])

  return { status, data, error, reload: load }
}

export interface QueryParams {
  class: string
  filters?: unknown[]
  orderBy?: unknown
  offset?: number | null
  limit?: number | null
  locale?: string | null
}

/** Queries published data objects by class + filters. */
export function useQuery(params: QueryParams): AsyncState<Record<string, unknown>[]> {
  const ctx = useWhoobe()
  const [status, setStatus] = useState<AsyncStatus>('loading')
  const [data, setData] = useState<Record<string, unknown>[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      setData(await ctx.api.queryObjects(params))
      setStatus('ready')
    } catch (e: any) {
      setStatus('error')
      setError(e?.message ?? 'Failed to query objects')
    }
  }, [ctx, params])

  useEffect(() => {
    void load()
  }, [load])

  return { status, data, error, reload: load }
}

/** Form submission helper mirroring DefaultForm's behavior. */
export function useForm(formConfig: { targetClassId: string; gatewayBindingId?: string; successMessage?: string; errorMessage?: string; notify?: unknown }) {
  const ctx = useWhoobe()
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function submit(attributes: Record<string, unknown>, formEl?: HTMLFormElement) {
    setSubmitting(true)
    setResult(null)
    try {
      await ctx.api.submitForm(formConfig.targetClassId, attributes, {
        notify: formConfig.notify,
        gatewayBindingId: formConfig.gatewayBindingId,
      })
      formEl?.reset()
      setResult({ ok: true, message: formConfig.successMessage || 'Submitted.' })
      return { ok: true as const }
    } catch {
      setResult({ ok: false, message: formConfig.errorMessage || 'Something went wrong, please try again.' })
      return { ok: false as const }
    } finally {
      setSubmitting(false)
    }
  }

  return { submitting, result, submit }
}
