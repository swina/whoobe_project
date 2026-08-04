<template>
  <component
    :is="component"
    :class="classe"
    :style="stile"
    :src="element.element === 'img' ? resolveDisplayUrl(imageURL(element.image)) : undefined"
    :alt="element.element === 'img' ? element.image?.alt || undefined : undefined"
    :placeholder="element.placeholder"
    v-html="element.content"
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

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  element: WhoobeElement
}>()

const component = computed(() => {
  const el = props.element as any
  if ('level' in el && el.level) return 'h' + el.level
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
