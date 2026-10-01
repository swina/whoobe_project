<template>
  <!-- LucideIcon renders a real icon component resolved from its own text
       content - v-html can't be applied on the same tag (it would wipe out
       the icon's own SVG children the moment it runs), so this is a
       separate branch rather than a conditional v-html value. iconComponent
       resolves asynchronously (see helpers.ts's resolveLucideIcon) - this
       placeholder <span> covers the brief gap before the lazily-loaded
       icon chunk resolves, rather than falling through to the v-else
       branch (which would render this node as a plain text element, icon
       name and all, for a moment). -->
  <component v-if="element.tag === 'lucideicon' && iconComponent" :is="iconComponent" :id="element.id" ref="rootEl" :class="classe" :style="stile" v-bind="extraAttrs"></component>
  <span v-else-if="element.tag === 'lucideicon'" :id="element.id" ref="rootEl" :class="classe" :style="stile"></span>
  <SearchElement
    v-else-if="element.tag === 'search'"
    :id="element.id"
    ref="rootEl"
    :config="(element as any).searchConfig"
    :placeholder="element.placeholder"
    :class="classe"
    :style="stile"
  />
<component
  v-else-if="element.tag === 'button' || element.tag === 'submit' || element.tag === 'reset'"
  :is="component"
  :id="element.id"
  ref="rootEl"
  :class="classe"
  :style="stile"
  v-bind="extraAttrs"
>
  <span v-if="buttonIconComponent && buttonIconPosition !== 'after'" class="inline-flex items-center mr-1.5"><component :is="buttonIconComponent" :style="getButtonIconStyle()" /></span>
  <span v-html="renderedContent"></span>
  <span v-if="buttonIconComponent && buttonIconPosition === 'after'" class="inline-flex items-center ml-1.5"><component :is="buttonIconComponent" :style="getButtonIconStyle()" /></span>
</component>
<video
  v-else-if="element.element === 'video'"
  :id="element.id"
  ref="rootEl"
  :class="classe"
  :style="stile"
  v-bind="extraAttrs"
  controls
>
  <source :src="displaySrc" type="video/mp4" />
</video>
<component
  v-else
  :is="component"
  :id="element.id"
  ref="rootEl"
  :class="classe"
  :style="stile"
  :src="displaySrc"
  :alt="displayAlt"
  :placeholder="element.placeholder"
  v-bind="extraAttrs"
  v-html="renderedContent"
></component>
</template>

<script setup lang="ts">
// Read-only counterpart of ../BlockElement.vue, for DocumentPreview.vue -
// port of whoobe-one-studio's src/components/blocks/preview/BlockElement.
// vue. Same rendering computeds as the editing version, minus everything
// that only makes sense while editing: no contenteditable, no click-to-
// select, no data-id/data-type markers, no selection ring.
//
// Custom attributes/AlpineJS directives/GSAP scroll-triggered animation
// (docs/plans/cms/whoobe-one-spike-missing-features.md) are applied here,
// not in ../BlockElement.vue - matches the source, which only ever binds
// Alpine/plays $animation in its own read-only preview tree, never the
// editable canvas.
//
// `alt` (real `<img>` elements only) is set from FloatingToolbar.vue's
// Image popover - unlike the source's own fallback (`element.image.alt ||
// element.element`, i.e. falling back to the literal string "img"), this
// just omits the attribute entirely when unset. A fallback of the literal
// tag name isn't meaningfully more accessible than no alt attribute at
// all, so it wasn't worth carrying over.
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import type { Component } from 'vue'
import type Element from '../../scripts/ElementsClass.js'
import { customAttrs, imageURL, resolveLucideIcon, renderSelectOptionsHtml, renderRadioGroupHtml, safeAlpineValue } from '../../helpers'
import { resolveDisplayUrl } from '../../resolve-display-url'
import { useEditorStore } from '../../store/editor'
import { resolveFieldValue, resolveFieldFromRecord } from '../../scripts/data-resolver'
import type { DataObjectRecord } from '../../data-objects-api'
import { applyTransform, escapeHtml, renderMarkdown, stripHtmlComments } from '../../scripts/field-transforms'
import { mountAnimation } from '../../scripts/gsap-actions'

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  element: WhoobeElement
  dataContext?: DataObjectRecord | null
}>()

const editor = useEditorStore()

// Empty-value entries are dropped (matches the reference's own `if
// (element.data.alpine[attr])` check in preview/BlockElement.vue) so an
// added-then-cleared directive doesn't leave a stray `x-show=""` attribute
// behind.
const alpineAttrs = computed(() => {
  const alpine = (props.element as any).alpine as Record<string, string> | undefined
  if (!alpine) return {}
  const result: Record<string, string> = {}
  for (const key of Object.keys(alpine)) {
    result[key] = alpine[key] ? safeAlpineValue(alpine[key]) : ''
  }
  return result
})

const extraAttrs = computed(() => ({
  ...customAttrs((props.element as any).data?.attributes),
  ...alpineAttrs.value,
}))

// A real DOM handle via template ref, NOT document.getElementById(element.
// id) - that lookup is ambiguous and was a real bug: DocumentPreview.vue's
// modal renders this preview tree on TOP of the still-mounted editing
// canvas (BlockElement.vue sets the identical :id on its own node, never
// unmounted while the preview modal is open), and getElementById always
// returns the FIRST matching node in document order - the hidden canvas
// element, not this one - so ScrollTrigger/the hover listeners ended up
// attached to a node that never actually scrolls into view. The same
// ambiguity also breaks a data-bound repeater rendering the same child
// element N times (N identical ids, one real match found for all of them).
// A template ref is scoped to this exact component instance and has
// neither problem.
const rootEl = ref<HTMLElement | null>(null)

let stopAnimation: (() => void) | null = null

onMounted(() => {
  if (rootEl.value) stopAnimation = mountAnimation(props.element, rootEl.value)
  if (rootEl.value && (window as any).Alpine) {
    nextTick(() => (window as any).Alpine.initTree(rootEl.value))
  }
})

onUnmounted(() => {
  stopAnimation?.()
})

// Directives are applied via reactive v-bind (extraAttrs above), not the
// reference's one-time setAttribute() in mounted() - Alpine's own
// MutationObserver may not re-scan an attribute-only change on an
// already-initialized node, so re-run Alpine's own tree scan explicitly
// whenever the directive set actually changes.
watch(
  () => (props.element as any).alpine,
  () => {
    nextTick(() => {
      if (rootEl.value && (window as any).Alpine) (window as any).Alpine.initTree(rootEl.value)
    })
  },
  { deep: true }
)

const resolvedData = computed(() => {
  const el = props.element as any
  const db = el.dataBinding
  if (db) {
    // If the binding has an explicit objectId, use the store's resolved data
    // (fetched by data-resolver.ts). Otherwise, use the dataContext from the
    // nearest collection ancestor (for relative bindings inside a repeater).
    if (db.objectId) {
      const resolved = editor.resolvedData[el.id]
      if (!resolved) return null
      return resolveFieldValue(resolved, db)
    }
    if (props.dataContext && db.field) {
      return (props.dataContext.attributes as any)?.[db.field]
    }
    if (props.dataContext && !db.field) {
      return props.dataContext
    }
    const resolved = editor.resolvedData[el.id]
    return resolved || null
  }
  // Gateway binding: resolve from dataContext (repeater item) or store
  const gb = el.gatewayBinding
  if (gb) {
    if (props.dataContext && gb.fieldPath) {
      return resolveFieldFromRecord(props.dataContext, gb.fieldPath)
    }
    if (props.dataContext && !gb.fieldPath) {
      return props.dataContext
    }
    const resolved = editor.resolvedData[el.id]
    return resolved || null
  }
  return null
})

// Computed once and reused by displayContent/transformClassName below,
// rather than calling applyTransform twice per render.
const transformResult = computed(() => {
  const el = props.element as any
  if (resolvedData.value === null) return null
  if (el.dataBinding) return applyTransform(resolvedData.value, el.dataBinding.transform, editor.page?.locale)
  // Only applied for gatewayBinding when a real transform is configured -
  // unlike dataBinding, an unconfigured gateway binding falls through to
  // displayContent's own JSON.stringify fallback below (a gateway response
  // field has no Data-Class-quality "this is text/none" default the way a
  // dataBinding field does).
  if (el.gatewayBinding?.transform && el.gatewayBinding.transform.type !== 'none') {
    return applyTransform(resolvedData.value, el.gatewayBinding.transform, editor.page?.locale)
  }
  return null
})

const displayContent = computed(() => {
  const el = props.element as any
  if (el.dataBinding || el.gatewayBinding) {
    const result = transformResult.value
    if (result) {
      if (result.kind === 'link') {
        const targetAttr = result.target ? ` target="${result.target}" rel="noopener noreferrer"` : ''
        return `<a href="${escapeHtml(result.href)}"${targetAttr}>${escapeHtml(result.text)}</a>`
      }
      // A `markdown`-type field with no explicit transform configured -
      // convert its raw Markdown source to HTML, the same "already real
      // markup" treatment a `wysiwyg` field's value gets for free (it's
      // stored as HTML already). A configured transform (truncate,
      // valueMap, ...) still wins - it already produced result.text above.
      const isUntransformed = !el.dataBinding?.transform || el.dataBinding.transform.type === 'none'
      if (el.dataBinding?.fieldType === 'markdown' && isUntransformed) {
        return renderMarkdown(resolvedData.value)
      }
      return result.text
    }
    if (el.dataBinding) return ''
    // gatewayBinding with no transform configured - same raw/JSON fallback
    // as before, but escaped: this is rendered via v-html, and an
    // unescaped external API response string here would be an XSS hole.
    return escapeHtml(typeof resolvedData.value === 'string' ? resolvedData.value : JSON.stringify(resolvedData.value ?? ''))
  }
  // See ../BlockElement.vue's identical branch - a select/radio group's
  // options list (FormFieldControl.vue) generates real markup instead of
  // the always-empty static `content` field.
  if (el.tag === 'select') return renderSelectOptionsHtml(el.data?.options)
  if (el.tag === 'radiogroup') return renderRadioGroupHtml(el.data?.options, el.data?.attributes?.name)
  return el.content
})

// Settings > General "Remove HTML Comments in Page Preview" - applied here
// rather than baked into displayContent so displayContent's own watcher
// (Alpine re-init below) still fires off the same raw value regardless of
// the toggle.
const renderedContent = computed(() => (
  editor.stripHtmlComments && typeof displayContent.value === 'string'
    ? stripHtmlComments(displayContent.value)
    : displayContent.value
))

// 'valueMap' transform's per-value className (e.g. a status badge's
// background color) - applied via native :class below instead of baking
// it into the v-html string, so it updates correctly across pagination
// even when the DOM node/component instance is reused (see the comment
// on field-transforms.ts's valueMapTransformer for why this replaced the
// original Alpine-based approach).
const transformClassName = computed(() => {
  const result = transformResult.value
  return result && result.kind === 'text' ? result.className : undefined
})

// Same MutationObserver gap as above, but for v-html'd content rather than
// the alpine attribute map: a data-bound repeater (BlockContainerPreview.
// vue's paginated list) reuses this component instance/DOM node across
// pages (positional v-for :key), so v-html only ever patches innerHTML on
// an already-initialized node instead of creating a fresh one Alpine's
// observer would pick up on its own. Any x-data markup baked into the
// bound field's own HTML value needs the same explicit re-scan whenever
// the resolved content changes - which includes paging to a different
// record, not just editing the field.
watch(displayContent, () => {
  nextTick(() => {
    if (rootEl.value && (window as any).Alpine) (window as any).Alpine.initTree(rootEl.value)
  })
})

// Reuses displayContent's own resolution (data-binding-aware, falling back
// to the raw `content` text when unbound) rather than reading `element.
// content` directly - so an icon name can be data-bound to a field the
// same way any other text content can (FloatingToolbar.vue's bindingTarget
// already special-cases `tag === 'lucideicon'` -> 'icon' for exactly this).
// A ref, not a computed - resolveLucideIcon is async (see its own comment
// in helpers.ts on why: the full @lucide/vue icon set is lazily code-split
// rather than bundled into every page's main chunk), so this starts null
// and is filled in once the lookup resolves. Guarded against a stale
// resolution landing after the icon name has already changed again (fast
// retyping while data-bound, or content resolving via a slow field
// transform) by only committing the result if the name it was resolved
// for is still the current one.
const iconComponent = shallowRef<Component | null>(null)
watch(
  () => (props.element.tag === 'lucideicon' ? displayContent.value : null),
  (name) => {
    iconComponent.value = null
    if (name === null) return
    resolveLucideIcon(name).then((resolved) => {
      if ((props.element.tag === 'lucideicon' ? displayContent.value : null) === name) {
        iconComponent.value = resolved
      }
    })
  },
  { immediate: true }
)

// Button icon: resolves the Lucide icon name set on button/submit/reset elements.
const buttonIconComponent = shallowRef<Component | null>(null)
watch(
  () => (props.element as any).buttonIcon,
  (name) => {
    buttonIconComponent.value = null
    if (!name) return
    resolveLucideIcon(name).then((resolved) => {
      buttonIconComponent.value = resolved
    })
  },
  { immediate: true }
)
function getButtonIconStyle(): Record<string, string> {
  return {
    width: ((props.element as any)?.buttonIconWidth ?? 16) + 'px',
    height: ((props.element as any)?.buttonIconHeight ?? 16) + 'px',
  }
}
const buttonIconPosition = computed(() => (props.element as any)?.buttonIconPosition ?? 'before')

// A UUID (asset reference) is not a URL - resolved via resolveDisplayUrl.

const displaySrc = computed(() => {
  const el = props.element as any
  const resolved = resolvedData.value
  if (resolved !== null && (el.dataBinding || el.gatewayBinding)) {
    const v = resolved
    if (typeof v === 'string') return resolveDisplayUrl(v)
    if (v && typeof v === 'object') {
      if (typeof (v as any).url === 'string') return (v as any).url
      if (typeof (v as any).assetId === 'string') return resolveDisplayUrl((v as any).assetId)
    }
    return undefined
  }
  if (el.element === 'img' || el.element === 'video') return resolveDisplayUrl(imageURL(el.image))
  return undefined
})

// resolveDisplayUrl() resolves asset references asynchronously - displaySrc
// is undefined on first render and only picks up the real URL once the
// fetch lands (see resolve-display-url.ts). Vue reactively patches the
// <source> child's src attribute when that happens, but a <video> only
// re-reads its <source> children on initial parse or an explicit .load()
// call - without this, the element sits on its first (sourceless) load
// forever: controls render, but play does nothing because nothing was ever
// actually loaded.
watch(displaySrc, (src) => {
  if (props.element.element === 'video' && src && rootEl.value instanceof HTMLVideoElement) {
    rootEl.value.load()
  }
})

const displayAlt = computed(() => {
  const el = props.element as any
  if (resolvedData.value !== null && (el.dataBinding || el.gatewayBinding)) {
    const v = resolvedData.value
    const transform = el.dataBinding?.transform ?? el.gatewayBinding?.transform
    if (transform && transform.type !== 'none') {
      const text = applyTransform(v, transform, editor.page?.locale).text
      return text || undefined
    }
    if (typeof v === 'string') return v
    if (v && typeof v === 'object' && typeof (v as any).alt === 'string') return (v as any).alt
    return undefined
  }
  return el.element === 'img' ? el.image?.alt || undefined : undefined
})

const component = computed(() => {
  const el = props.element as any
  if ('level' in el && el.level) {
    // Same corrupted-snippet-data guard as BlockElement.vue's own
    // `component` computed - a bad `level` (e.g. `{}` from a pre-fix
    // palette bug baked into an old saved snippet) renders as h1 instead
    // of crashing document.createElement().
    const level = Number(el.level)
    return 'h' + (Number.isInteger(level) && level >= 1 && level <= 6 ? level : 1)
  }
  return el.element === 'grid' ? 'div' : el.element === 'search' ? 'SearchElement' : el.element
})

const classe = computed(() => {
  const el = props.element as any
  let cls = `${el.css?.css ?? ''} ${el.css?.container ?? ''}`
  if (transformClassName.value) cls += ` ${transformClassName.value}`
  return cls
})

const stile = computed(() => {
  const el = props.element as any
  let st = ''
  // When this element is data-bound with a resolved src, don't layer the
  // editor's placeholder SVG on as a background - the real resolved image
  // (or the broken-image state) is what should show.
  const showBg = el.element !== 'img' && !((el.dataBinding || el.gatewayBinding) && resolvedData.value !== null)
  if (showBg) {
    const bgUrl = resolveDisplayUrl(el.image?.url)
    if (bgUrl) st += `background-image:url(${bgUrl});`
  }
  if (el.font) st += `font-family:"${el.font.replaceAll('+', ' ')}";`
  return st + (el.style ?? '')
})
</script>
