// Built-in default components for every primitive node kind, so a page
// renders with an empty registry. Consumers override any kind via the
// registry to map it to their own design-system component.

import { defineComponent, h, inject, ref, computed, shallowRef, onMounted, onUnmounted, type PropType, type VNode } from 'vue'
import type { RenderDescriptor } from '@whoobe-cms/renderer'
import { WHOOBE_KEY, type NodeComponent, type WhoobeApi } from './types.js'

const descriptorProp = { descriptor: { type: Object as PropType<RenderDescriptor>, required: true } }
const childrenProp = { children: { type: Array as PropType<VNode[]>, default: () => [] } }

/** class/style + the node's own data.attributes, omitting empty values so
 *  SSR output stays clean. */
function elementProps(d: RenderDescriptor): Record<string, unknown> {
  const props: Record<string, unknown> = { ...(d.attributes as Record<string, unknown>) }
  if (d.className) props.class = d.className
  if (d.style) props.style = d.style
  return props
}

/** Container (grid/flex/section/...): renders the resolved tag + class/style
 *  and the resolved children. */
export const DefaultContainer: NodeComponent = defineComponent({
  name: 'WhoobeContainer',
  props: { ...descriptorProp, ...childrenProp },
  setup(props) {
    return () => {
      const d = props.descriptor
      const attrs = elementProps(d)
      const children = props.children?.length ? props.children : undefined
      if (!children && d.content) {
        attrs.innerHTML = d.content
      }
      return h(d.tag, attrs, children)
    }
  },
})

/** Text nodes (heading/paragraph/span/blockquote/code): safe HTML content. */
export function makeTextComponent(name: string): NodeComponent {
  return defineComponent({
    name,
    props: { ...descriptorProp, ...childrenProp },
    setup(props) {
      return () => {
        const d = props.descriptor
        const p = elementProps(d)
        if (d.content) p.innerHTML = d.content
        return h(d.tag, p)
      }
    },
  })
}

export const DefaultHeading = makeTextComponent('WhoobeHeading')
export const DefaultParagraph = makeTextComponent('WhoobeParagraph')
export const DefaultSpan = makeTextComponent('WhoobeSpan')
export const DefaultBlockquote = makeTextComponent('WhoobeBlockquote')
export const DefaultCode = makeTextComponent('WhoobeCode')
export const DefaultIcon: NodeComponent = defineComponent({
  name: 'WhoobeIcon',
  props: { ...descriptorProp },
  setup(props) {
    const iconComponent = shallowRef<ReturnType<typeof defineComponent> | null>(null)

    function kebabToPascal(name: string): string {
      return name.split(/[-_]/).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('')
    }

    function loadIcon(name: string) {
      import('@lucide/vue').then(mod => {
        const comp = (mod as Record<string, ReturnType<typeof defineComponent>>)[kebabToPascal(name)]
        if (comp) iconComponent.value = comp
      }).catch(() => {
        /* keep fallback */
      })
    }

    onMounted(() => {
      const name = props.descriptor.content
      if (name) loadIcon(name)
    })

    return () => {
      const d = props.descriptor
      const p = elementProps(d)
      if (iconComponent.value) {
        return h(iconComponent.value, { ...p, size: 16 } as any)
      }
      if (d.content) p.innerHTML = d.content
      return h(d.tag === 'lucideicon' ? 'span' : d.tag, p)
    }
  },
})

/** Image: resolved src/alt from the descriptor (DAM references already
 *  resolved by the renderer). */
export const DefaultImage: NodeComponent = defineComponent({
  name: 'WhoobeImage',
  props: { ...descriptorProp },
  setup(props) {
    return () => {
      const d = props.descriptor
      if (!d.image) return null
      return h('img', { src: d.image.url, alt: d.image.alt ?? '', ...elementProps(d) })
    }
  },
})

/** Link: wraps children in the resolved href/target. */
export const DefaultLink: NodeComponent = defineComponent({
  name: 'WhoobeLink',
  props: { ...descriptorProp, ...childrenProp },
  setup(props) {
    return () => {
      const d = props.descriptor
      if (d.link) return h('a', { href: d.link.href, target: d.link.target, ...elementProps(d) }, props.children)
      return h('span', elementProps(d), props.children)
    }
  },
})

// --- form fields ---

const fieldProps = { descriptor: { type: Object as PropType<RenderDescriptor>, required: true } }
const fieldAttrs = (d: RenderDescriptor) => elementProps(d)

export const DefaultInput: NodeComponent = defineComponent({
  name: 'WhoobeInput',
  props: fieldProps,
  setup(props) {
    return () => h('input', fieldAttrs(props.descriptor))
  },
})

export const DefaultTextarea: NodeComponent = defineComponent({
  name: 'WhoobeTextarea',
  props: fieldProps,
  setup(props) {
    return () => h('textarea', fieldAttrs(props.descriptor), props.descriptor.content || undefined)
  },
})

export const DefaultSelect: NodeComponent = defineComponent({
  name: 'WhoobeSelect',
  props: fieldProps,
  setup(props) {
    return () =>
      h(
        'select',
        fieldAttrs(props.descriptor),
        (props.descriptor.options ?? []).map((o) => h('option', { value: o.value }, o.label)),
      )
  },
})

export const DefaultRadioGroup: NodeComponent = defineComponent({
  name: 'WhoobeRadioGroup',
  props: fieldProps,
  setup(props) {
    return () => {
      const d = props.descriptor
      const name = (d.attributes.name as string) ?? ''
      return h(
        'div',
        elementProps(d),
        (d.options ?? []).map((o) =>
          h('label', { class: 'flex items-center gap-1' }, [
            h('input', { type: 'radio', name, value: o.value }),
            o.label,
          ]),
        ),
      )
    }
  },
})

export const DefaultButton: NodeComponent = defineComponent({
  name: 'WhoobeButton',
  props: fieldProps,
  setup(props) {
    return () => h('button', { ...fieldAttrs(props.descriptor), type: 'button' }, props.descriptor.content)
  },
})

export const DefaultSubmit: NodeComponent = defineComponent({
  name: 'WhoobeSubmit',
  props: fieldProps,
  setup(props) {
    return () => h('button', { ...fieldAttrs(props.descriptor), type: 'submit' }, props.descriptor.content || 'Submit')
  },
})

export const DefaultReset: NodeComponent = defineComponent({
  name: 'WhoobeReset',
  props: fieldProps,
  setup(props) {
    return () => h('button', { ...fieldAttrs(props.descriptor), type: 'reset' }, props.descriptor.content || 'Reset')
  },
})

/** Form: renders its fields inside a <form>, wires submission to
 *  POST /public/forms/:classId/submit via the injected api, injects the
 *  honeypot, resets on success and shows a click-to-close result popup. */
export const DefaultForm: NodeComponent = defineComponent({
  name: 'WhoobeForm',
  props: { ...descriptorProp, ...childrenProp },
  setup(props) {
    const ctx = inject(WHOOBE_KEY)!
    const result = ref<{ ok: boolean; message: string } | null>(null)

    async function onSubmit(e: Event) {
      e.preventDefault()
      const fc = props.descriptor.formConfig
      if (!fc) return
      const formEl = e.currentTarget as HTMLFormElement
      const attributes = Object.fromEntries(new FormData(formEl).entries())
      try {
        await (ctx.api as WhoobeApi).submitForm(fc.targetClassId, attributes, { notify: fc.notify })
        formEl.reset()
        result.value = { ok: true, message: fc.successMessage || 'Submitted.' }
      } catch {
        result.value = { ok: false, message: fc.errorMessage || 'Something went wrong, please try again.' }
      }
    }

    return () => {
      const d = props.descriptor
      const honeypot = h('input', {
        name: '_hp',
        type: 'text',
        tabindex: -1,
        'aria-hidden': 'true',
        style: 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;',
      })
      const popup = result.value
        ? h(
            'div',
            {
              class: 'fixed inset-0 z-[100000] bg-black/60 flex items-center justify-center p-4 cursor-pointer',
              onClick: () => (result.value = null),
            },
            [
              h(
                'div',
                { class: `bg-white rounded-xl shadow-2xl max-w-md w-full p-6 text-sm ${result.value.ok ? 'text-emerald-700' : 'text-rose-700'}` },
                result.value.message,
              ),
            ],
          )
        : null
      return h('form', { ...elementProps(d), onSubmit }, [
        honeypot,
        ...(props.children ?? []),
        popup,
      ])
    }
  },
})

/** Search: input + submit wired to the public /public/search endpoint. */
export const DefaultSearch: NodeComponent = defineComponent({
  name: 'WhoobeSearch',
  props: { ...descriptorProp },
  setup(props) {
    const ctx = inject(WHOOBE_KEY)!
    const q = ref('')
    const results = ref<Record<string, unknown>[]>([])

    async function run(e: Event) {
      e.preventDefault()
      const res = await (ctx.api as WhoobeApi).search({ q: q.value })
      results.value = ((res as { results?: Record<string, unknown>[] }).results ?? []) as Record<string, unknown>[]
    }

    return () => {
      const d = props.descriptor
      return h('form', { ...elementProps(d), onSubmit: run }, [
        h('input', {
          ...(d.attributes as Record<string, unknown>),
          value: q.value,
          onInput: (e: Event) => (q.value = (e.target as HTMLInputElement).value),
        }),
        h('button', { type: 'submit' }, d.searchConfig?.buttonLabel || 'Search'),
        ...(results.value.length
          ? [
              h(
                'ul',
                { class: d.searchConfig?.dropdownClass },
                results.value.map((r) =>
                  h('li', {}, String((r.title ?? r.name ?? r.id) as string)),
                ),
              ),
            ]
          : []),
      ])
    }
  },
})

// --- media (light built-ins; consumers usually map these) ---

export const DefaultVideo: NodeComponent = defineComponent({
  name: 'WhoobeVideo',
  props: { ...descriptorProp },
  setup(props) {
    return () => {
      const d = props.descriptor
      return h('video', { ...fieldAttrs(d), src: d.node.src ?? undefined, controls: true })
    }
  },
})

export const DefaultYoutube: NodeComponent = defineComponent({
  name: 'WhoobeYoutube',
  props: { ...descriptorProp },
  setup(props) {
    return () => {
      const d = props.descriptor
      return h('div', { ...elementProps(d), 'data-embed': 'youtube' }, d.content || 'YouTube')
    }
  },
})

export const DefaultVimeo: NodeComponent = defineComponent({
  name: 'WhoobeVimeo',
  props: { ...descriptorProp },
  setup(props) {
    return () => {
      const d = props.descriptor
      return h('div', { ...elementProps(d), 'data-embed': 'vimeo' }, d.content || 'Vimeo')
    }
  },
})

export const DefaultSlider: NodeComponent = defineComponent({
  name: 'WhoobeSlider',
  props: { ...descriptorProp, ...childrenProp },
  setup(props) {
    const current = ref(0)
    let timer: ReturnType<typeof setInterval> | null = null

    const settings = computed(() => ({
      autoplay: false,
      interval: 5000,
      loop: true,
      showNav: true,
      showDots: true,
      mode: 'standard',
      tabsPosition: 'below',
      tabClass: 'px-2.5 py-1 rounded-full text-xs font-medium transition-colors border bg-white text-gray-600 border-gray-300',
      activeTabClass: 'px-2.5 py-1 rounded-full text-xs font-medium transition-colors border bg-indigo-600 text-white border-indigo-600',
      navClass: 'flex items-center justify-center gap-1.5 px-2 py-1',
      arrowClass: 'w-8 h-8 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white',
      homeClass: 'w-7 h-7 p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white',
      arrowIcon: 'chevron',
      homeIcon: 'home',
      tabContainerClass: 'flex items-center justify-center gap-2',
      dotClass: 'w-2.5 h-2.5 rounded-full bg-gray-300 hover:bg-gray-400 transition-colors',
      activeDotClass: 'w-2.5 h-2.5 rounded-full bg-indigo-600 transition-colors',
      dotContainerClass: 'flex items-center justify-center gap-2 pt-3',
      ...(props.descriptor.slider ?? {}),
    }))

    function goTo(i: number) {
      const total = (props.children ?? []).length
      if (settings.value.loop) {
        current.value = ((i % total) + total) % total
      } else {
        current.value = Math.max(0, Math.min(i, total - 1))
      }
      startAutoplay()
    }

    function next() { goTo(current.value + 1) }
    function prev() { goTo(current.value - 1) }

    function startAutoplay() {
      stopAutoplay()
      const s = settings.value
      if (s.autoplay && (props.children ?? []).length > 1) {
        timer = setInterval(() => {
          const total = (props.children ?? []).length
          if (current.value < total - 1) current.value++
          else if (s.loop) current.value = 0
        }, Math.max(500, s.interval || 5000))
      }
    }

    function stopAutoplay() {
      if (timer !== null) { clearInterval(timer); timer = null }
    }

    onMounted(startAutoplay)
    onUnmounted(stopAutoplay)

    return () => {
      const d = props.descriptor
      const slides = props.children ?? []
      const s = settings.value
      const total = slides.length

      if (total === 0) return h('div', elementProps(d))

      const slideNodes = slides.map((child, i) =>
        h('div', { key: (child as any)?.key ?? i, style: { minWidth: '100%', boxSizing: 'border-box' } }, child)
      )

      const track = h('div', {
        style: { display: 'flex', transition: 'transform 0.5s ease', transform: `translateX(-${current.value * 100}%)` },
      }, slideNodes)

      const viewport = h('div', { style: { overflow: 'hidden', position: 'relative' } }, track)

      let dots = null
      if (s.showDots && total > 1) {
        dots = h('div', {
          class: s.dotContainerClass,
        }, slides.map((_, i) =>
          h('button', {
            key: i,
            type: 'button',
            'aria-label': `Go to slide ${i + 1}`,
            class: i === current.value ? s.activeDotClass : s.dotClass,
            onClick: () => goTo(i),
          })
        ))
      }

      let nav = null
      if (s.mode !== 'tabs' && s.showNav && total > 1) {
        nav = h('div', {
          class: s.navClass,
        }, [
          h('button', { type: 'button', class: s.arrowClass, onClick: prev, 'aria-label': 'Previous' }, '‹'),
          h('button', { type: 'button', class: s.arrowClass, onClick: next, 'aria-label': 'Next' }, '›'),
        ])
      }

      let tabsAbove = null
      if (s.mode === 'tabs' && s.tabsPosition === 'above' && total > 1) {
        tabsAbove = h('div', { class: s.tabContainerClass },
          slides.map((_, i) =>
            h('button', { key: i, type: 'button', class: i === current.value ? s.activeTabClass : s.tabClass, onClick: () => goTo(i) })
          )
        )
      }

      let tabsBelow = null
      if (s.mode === 'tabs' && s.tabsPosition !== 'above' && total > 1) {
        tabsBelow = h('div', { class: s.tabContainerClass },
          slides.map((_, i) =>
            h('button', { key: i, type: 'button', class: i === current.value ? s.activeTabClass : s.tabClass, onClick: () => goTo(i) })
          )
        )
      }

      const children = [tabsAbove, viewport, nav, dots, tabsBelow].filter(Boolean)
      return h('div', { ...elementProps(d), 'data-slider': 'true' }, children)
    }
  },
})

export const defaults: Record<string, NodeComponent> = {
  container: DefaultContainer,
  heading: DefaultHeading,
  paragraph: DefaultParagraph,
  span: DefaultSpan,
  blockquote: DefaultBlockquote,
  code: DefaultCode,
  icon: DefaultIcon,
  image: DefaultImage,
  link: DefaultLink,
  input: DefaultInput,
  textarea: DefaultTextarea,
  select: DefaultSelect,
  radiogroup: DefaultRadioGroup,
  button: DefaultButton,
  submit: DefaultSubmit,
  reset: DefaultReset,
  form: DefaultForm,
  search: DefaultSearch,
  video: DefaultVideo,
  youtube: DefaultYoutube,
  vimeo: DefaultVimeo,
  slider: DefaultSlider,
}
