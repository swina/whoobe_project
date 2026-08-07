<template>
  <component
    :is="component"
    :class="classe"
    :style="stile"
    :src="displaySrc"
    :alt="displayAlt"
    :placeholder="element.placeholder"
    v-html="displayContent"
  ></component>
</template>

<script setup lang="ts">
// Read-only counterpart of ../BlockElement.vue, for DocumentPreview.vue -
// port of whoobe-one-studio's src/components/blocks/preview/BlockElement.
// vue, trimmed to what this spike actually exercises (no Alpine attribute
// binding, no display/hide event-bus toggling - neither is wired up
// anywhere else in this app either, see the README's "not ported" list).
// Same rendering computeds as the editing version, minus everything that
// only makes sense while editing: no contenteditable, no click-to-select,
// no data-id/data-type markers, no selection ring.
//
// `alt` (real `<img>` elements only) is set from FloatingToolbar.vue's
// Image popover - unlike the source's own fallback (`element.image.alt ||
// element.element`, i.e. falling back to the literal string "img"), this
// just omits the attribute entirely when unset. A fallback of the literal
// tag name isn't meaningfully more accessible than no alt attribute at
// all, so it wasn't worth carrying over.
import { computed } from 'vue'
import type Element from '../../scripts/ElementsClass.js'
import { imageURL } from '../../helpers'
import { resolveDisplayUrl } from '../../resolve-display-url'
import { useEditorStore } from '../../store/editor'
import { resolveFieldValue } from '../../scripts/data-resolver'
import type { DataObjectRecord } from '../../data-objects-api'

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  element: WhoobeElement
  dataContext?: DataObjectRecord | null
}>()

const editor = useEditorStore()

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
  if (el.dataBinding && resolvedData.value !== null) {
    return String(resolvedData.value ?? '')
  }
  return el.content
})

const displaySrc = computed(() => {
  const el = props.element as any
  if (el.dataBinding && resolvedData.value !== null) {
    return String(resolvedData.value)
  }
  if (el.element === 'img') return resolveDisplayUrl(imageURL(el.image))
  return undefined
})

const displayAlt = computed(() => {
  const el = props.element as any
  if (el.dataBinding && resolvedData.value !== null) {
    return String(resolvedData.value)
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
  return `${el.css.css} ${el.css.container}`
})

const stile = computed(() => {
  const el = props.element as any
  let st = ''
  const bgUrl = resolveDisplayUrl(el.image?.url)
  if (bgUrl) st += `background-image:url(${bgUrl});`
  if (el.font) st += `font-family:"${el.font.replace('+', ' ')}";`
  return st + (el.style ?? '')
})
</script>
