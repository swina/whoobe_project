// Vue composables for the headless SDK: access the injected provider and
// wrap the renderer/api in reactive async helpers.

import { inject, ref, type Ref } from 'vue'
import { walkTree, composeLayout, type RenderDescriptor, type ComposedLayout } from '@whoobe-cms/renderer'
import { WHOOBE_KEY, type WhoobeContext } from './types.js'

export function useWhoobe(): WhoobeContext {
  const ctx = inject(WHOOBE_KEY)
  if (!ctx) throw new Error('[whoobe] useWhoobe() requires a <WhoobeProvider> ancestor')
  return ctx
}

export interface AsyncState<T> {
  status: Ref<'loading' | 'ready' | 'error'>
  data: Ref<T | null>
  error: Ref<string | null>
  reload: () => Promise<void>
}

/** Loads + walks a published page by locale/path. */
export function usePage(locale: Ref<string> | string, path: Ref<string> | string, websiteId?: Ref<string> | string): AsyncState<RenderDescriptor> & { layout: Ref<ComposedLayout | null> } {
  const ctx = useWhoobe()
  const status = ref<'loading' | 'ready' | 'error'>('loading')
  const data = ref<RenderDescriptor | null>(null)
  const layout = ref<ComposedLayout | null>(null)
  const error = ref<string | null>(null)

  async function load() {
    status.value = 'loading'
    error.value = null
    try {
      const l = typeof locale === 'string' ? locale : locale.value
      const p = typeof path === 'string' ? path : path.value
      const w = websiteId ? (typeof websiteId === 'string' ? websiteId : websiteId.value) : undefined
      const lookup = await ctx.api.getPage(l, p, w)
      const walkOptions = {
        api: ctx.api as never,
        assetBaseUrl: ctx.options.assetBaseUrl,
        keyPrefix: ctx.options.keyPrefix,
        resolveTargetPage: ctx.options.resolveTargetPage,
      }
      const descriptor = await walkTree(lookup.page.content, { urlParams: lookup.params }, walkOptions)
      data.value = descriptor
      layout.value = lookup.layout ? await composeLayout(descriptor, lookup.layout, walkOptions) : null
      status.value = 'ready'
    } catch (e: any) {
      status.value = 'error'
      error.value = e?.message ?? 'Failed to load page'
    }
  }

  void load()
  return { status, data, layout, error, reload: load }
}

/** Loads a published data object by id (raw record). */
export function useObject(id: Ref<string> | string): AsyncState<Record<string, unknown>> {
  const ctx = useWhoobe()
  const status = ref<'loading' | 'ready' | 'error'>('loading')
  const data = ref<Record<string, unknown> | null>(null)
  const error = ref<string | null>(null)

  async function load() {
    status.value = 'loading'
    try {
      data.value = await ctx.api.getObject(typeof id === 'string' ? id : id.value)
      status.value = 'ready'
    } catch (e: any) {
      status.value = 'error'
      error.value = e?.message ?? 'Failed to load object'
    }
  }

  void load()
  return { status, data, error, reload: load }
}

/** Queries published data objects by class + filters. */
export function useQuery(params: { class: string; filters?: unknown[]; orderBy?: unknown; offset?: number | null; limit?: number | null; locale?: string | null }): AsyncState<Record<string, unknown>[]> {
  const ctx = useWhoobe()
  const status = ref<'loading' | 'ready' | 'error'>('loading')
  const data = ref<Record<string, unknown>[] | null>(null)
  const error = ref<string | null>(null)

  async function load() {
    status.value = 'loading'
    try {
      data.value = await ctx.api.queryObjects(params)
      status.value = 'ready'
    } catch (e: any) {
      status.value = 'error'
      error.value = e?.message ?? 'Failed to query objects'
    }
  }

  void load()
  return { status, data, error, reload: load }
}

/** Form submission helper mirroring DefaultForm's behavior: resets on
 *  success, keeps values on error, exposes the result popup state. */
export function useForm(formConfig: { targetClassId: string; gatewayEndpointName?: string; gatewayRoutePath?: string; successMessage?: string; errorMessage?: string; notify?: unknown }) {
  const ctx = useWhoobe()
  const submitting = ref(false)
  const result = ref<{ ok: boolean; message: string } | null>(null)

  async function submit(attributes: Record<string, unknown>, formEl?: HTMLFormElement): Promise<{ ok: boolean }> {
    submitting.value = true
    result.value = null
    try {
      await ctx.api.submitForm(formConfig.targetClassId, attributes, {
        notify: formConfig.notify,
        gatewayEndpointName: formConfig.gatewayEndpointName,
        gatewayRoutePath: formConfig.gatewayRoutePath,
      })
      formEl?.reset()
      result.value = { ok: true, message: formConfig.successMessage || 'Submitted.' }
      return { ok: true }
    } catch {
      result.value = { ok: false, message: formConfig.errorMessage || 'Something went wrong, please try again.' }
      return { ok: false }
    } finally {
      submitting.value = false
    }
  }

  return { submitting, result, submit }
}
