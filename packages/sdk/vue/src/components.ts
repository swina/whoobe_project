// Core Vue components: WhoobeProvider (provides registry + api + options),
// WhoobeNode (recursive descriptor renderer), WhoobePage (fetch + walk +
// render). Plain defineComponent + h() so the package builds with tsc.

import { defineComponent, h, inject, provide, ref, type PropType } from 'vue'
import { walkTree, ApiClient, type RenderDescriptor } from '@whoobe-cms/renderer'
import { WHOOBE_KEY, type NodeComponent, type Registry, type WhoobeAdapterOptions, type WhoobeApi } from './types.js'
import { defaults } from './defaults.js'

/** Provides the registry + api + options to the subtree via provide/inject. */
export const WhoobeProvider = defineComponent({
  name: 'WhoobeProvider',
  props: {
    registry: { type: Object as PropType<Registry>, default: () => ({}) },
    api: { type: Object as PropType<WhoobeApi>, required: true },
    assetBaseUrl: { type: String, default: undefined },
    keyPrefix: { type: String, default: undefined },
    resolveTargetPage: { type: Function as PropType<WhoobeAdapterOptions['resolveTargetPage']>, default: undefined },
  },
  setup(props, { slots }) {
    provide(WHOOBE_KEY, {
      registry: props.registry,
      api: props.api,
      options: {
        assetBaseUrl: props.assetBaseUrl,
        keyPrefix: props.keyPrefix,
        resolveTargetPage: props.resolveTargetPage,
      },
    })
    return () => (slots.default ? slots.default() : null)
  },
})

/** Recursively renders one descriptor through the registry (or defaults). */
export const WhoobeNode: NodeComponent = defineComponent({
  name: 'WhoobeNode',
  props: {
    descriptor: { type: Object as PropType<RenderDescriptor>, required: true },
  },
  setup(props) {
    const ctx = inject(WHOOBE_KEY)
    return () => {
      const d = props.descriptor
      const comp: NodeComponent = ctx?.registry[d.kind] ?? defaults[d.kind] ?? defaults.container
      const children = d.children.map((child) => h(WhoobeNode, { descriptor: child }))
      return h(comp, { descriptor: d, children })
    }
  },
})

/** Fetches a page, validates + walks it, and renders the root node. Accepts
 *  a pre-walked `descriptor` prop for the SSR path (walk once server-side,
 *  hydrate from the descriptor). */
export const WhoobePage = defineComponent({
  name: 'WhoobePage',
  props: {
    locale: { type: String, default: undefined },
    path: { type: String, default: undefined },
    websiteId: { type: String, default: undefined },
    descriptor: { type: Object as PropType<RenderDescriptor>, default: undefined },
  },
  setup(props) {
    const ctx = inject(WHOOBE_KEY)!
    const descriptor = ref<RenderDescriptor | null>(props.descriptor ?? null)
    const status = ref<'loading' | 'ready' | 'error'>('loading')
    const error = ref<string | null>(null)

    async function load() {
      if (props.descriptor) {
        status.value = 'ready'
        return
      }
      if (!props.locale || !props.path) {
        status.value = 'error'
        error.value = 'locale and path are required'
        return
      }
      status.value = 'loading'
      try {
        const lookup = await ctx.api.getPage(props.locale, props.path, props.websiteId)
        descriptor.value = await walkTree(lookup.page.content, {}, {
          api: ctx.api as never,
          assetBaseUrl: ctx.options.assetBaseUrl,
          keyPrefix: ctx.options.keyPrefix,
          resolveTargetPage: ctx.options.resolveTargetPage,
        })
        status.value = 'ready'
      } catch (e: any) {
        status.value = 'error'
        error.value = e?.message ?? 'Failed to load page'
      }
    }

    if (!props.descriptor) void load()

    return () => {
      if (status.value === 'error') return h('div', { class: 'whoobe-error' }, error.value ?? 'Failed to load page')
      if (!descriptor.value) return h('div', { class: 'whoobe-loading' }, 'Loading…')
      return h(WhoobeNode, { descriptor: descriptor.value })
    }
  },
})

/** Convenience: build an ApiClient from a base URL and pass it as `api`. */
export function createWhoobeApi(baseUrl: string): WhoobeApi {
  const client = new ApiClient(baseUrl)
  return client as WhoobeApi
}
