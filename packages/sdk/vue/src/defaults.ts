// Built-in default components for every primitive node kind, so a page
// renders with an empty registry. Consumers override any kind via the
// registry to map it to their own design-system component.

import { defineComponent, h, inject, ref, type PropType, type VNode } from 'vue'
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
      return h(d.tag, elementProps(d), props.children)
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
export const DefaultIcon = makeTextComponent('WhoobeIcon')

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
    return () => {
      const d = props.descriptor
      return h('div', { ...elementProps(d), 'data-slider': 'true' }, props.children)
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
