<template>
  <component
    :is="component"
    :id="element.id"
    :class="classe"
    :style="stile"
    :src="displaySrc"
    :alt="displayAlt"
    :placeholder="element.placeholder"
    v-bind="extraAttrs"
    v-html="displayContent"
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
import { computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import type Element from '../../scripts/ElementsClass.js'
import { customAttrs, imageURL } from '../../helpers'
import { resolveDisplayUrl } from '../../resolve-display-url'
import { useEditorStore } from '../../store/editor'
import { resolveFieldValue } from '../../scripts/data-resolver'
import type { DataObjectRecord } from '../../data-objects-api'
import { applyTransform, escapeHtml } from '../../scripts/field-transforms'
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
    if (alpine[key]) result[key] = alpine[key]
  }
  return result
})

const extraAttrs = computed(() => ({
  ...customAttrs((props.element as any).data?.attributes),
  ...alpineAttrs.value,
}))

let stopAnimation: (() => void) | null = null

onMounted(() => {
  const el = document.getElementById(props.element.id)
  if (el) stopAnimation = mountAnimation(props.element, el)
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
      const el = document.getElementById(props.element.id)
      if (el && (window as any).Alpine) (window as any).Alpine.initTree(el)
    })
  },
  { deep: true }
)

const resolvedData = computed(() => {
  const el = props.element as any
  const db = el.dataBinding
  if (!db) return null
  // If the binding has an explicit objectId, use the store's resolved data
  // (fetched by data-resolver.ts). Otherwise, use the dataContext from the
  // nearest collection ancestor (for relative bindings inside a repeater).
  if (db.objectId) {
    const resolved = editor.resolvedData[el.id]
    if (!resolved) return null
    return resolveFieldValue(resolved, db)
  }
  // Relative binding: resolve against the dataContext prop.
  if (props.dataContext && db.field) {
    return (props.dataContext.attributes as any)?.[db.field]
  }
  if (props.dataContext && !db.field) {
    return props.dataContext
  }
  return null
})

const displayContent = computed(() => {
  const el = props.element as any
  if (el.dataBinding) {
    if (resolvedData.value === null) return ''
    const result = applyTransform(resolvedData.value, el.dataBinding.transform)
    if (result.kind === 'link') {
      const targetAttr = result.target ? ` target="${result.target}" rel="noopener noreferrer"` : ''
      return `<a href="${escapeHtml(result.href)}"${targetAttr}>${escapeHtml(result.text)}</a>`
    }
    return result.text
  }
  return el.content
})

// A UUID (asset reference) is not a URL - resolved via resolveDisplayUrl.

const displaySrc = computed(() => {
  const el = props.element as any
  if (el.dataBinding && resolvedData.value !== null) {
    const v = resolvedData.value
    // Image/asset field values can be { assetId: '...' } / { url: '...' }
    // objects, or a plain URL string. Pass through resolveDisplayUrl which
    // handles both Pimcore paths and asset-record UUIDs via the DAM API.
    if (typeof v === 'string') return resolveDisplayUrl(v)
    if (v && typeof v === 'object') {
      if (typeof (v as any).url === 'string') return (v as any).url
      if (typeof (v as any).assetId === 'string') return resolveDisplayUrl((v as any).assetId)
    }
    return undefined
  }
  if (el.element === 'img') return resolveDisplayUrl(imageURL(el.image))
  return undefined
})

const displayAlt = computed(() => {
  const el = props.element as any
  if (el.dataBinding && resolvedData.value !== null) {
    const v = resolvedData.value
    if (el.dataBinding.transform && el.dataBinding.transform.type !== 'none') {
      const text = applyTransform(v, el.dataBinding.transform).text
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
  return el.element === 'grid' ? 'div' : el.element
})

const classe = computed(() => {
  const el = props.element as any
  let cls = `${el.css.css} ${el.css.container}`
  if (el.dataBinding && !el.content && el.element !== 'img') cls += ' min-h-8'
  return cls
})

const stile = computed(() => {
  const el = props.element as any
  let st = ''
  // When this element is data-bound with a resolved src, don't layer the
  // editor's placeholder SVG on as a background - the real resolved image
  // (or the broken-image state) is what should show.
  const showBg = !(el.dataBinding && el.dataBinding.target === 'src' && resolvedData.value !== null)
  if (showBg) {
    const bgUrl = resolveDisplayUrl(el.image?.url)
    if (bgUrl) st += `background-image:url(${bgUrl});`
  }
  if (el.font) st += `font-family:"${el.font.replace('+', ' ')}";`
  return st + (el.style ?? '')
})
</script>
