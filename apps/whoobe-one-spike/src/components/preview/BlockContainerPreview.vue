<template>
  <component :is="semantic" :class="classe" :style="stile">
    <template v-for="child in doc.blocks" :key="child.id">
      <BlockContainerPreview v-if="child.type === 'container'" :doc="child" />
      <BlockIFramePreview v-else-if="child.tag === 'youtube' || child.tag === 'vimeo'" :element="child" />
      <BlockElementPreview v-else :element="child" />
    </template>
  </component>
</template>

<script setup lang="ts">
// Read-only counterpart of ../BlockContainer.vue, for DocumentPreview.vue -
// port of whoobe-one-studio's src/components/blocks/preview/BlockContainer.
// vue. No dragula-container class, no click-to-select, no corner tag
// button/selection border/empty-container size floor - none of that is
// editing chrome a real preview should ever show. Renders the container's
// own `semantic` tag (e.g. "section"/"nav") when set, falling back to a
// plain div exactly like the source does, rather than always rendering a
// div the way the editing BlockContainer.vue does (semantic tags don't
// matter for the editing canvas, but they do for a preview meant to
// resemble real output).
import { computed } from 'vue'
import type Element from '../../scripts/ElementsClass.js'
import { resolveDisplayUrl } from '../../resolve-display-url'
import BlockElementPreview from './BlockElementPreview.vue'
import BlockIFramePreview from './BlockIFramePreview.vue'

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  doc: WhoobeElement
}>()

const semantic = computed(() => (props.doc as any).semantic || 'div')

const classe = computed(() => {
  const doc = props.doc as any
  return `${doc.css.css ?? ''} ${doc.css.container ?? ''}`.trim()
})

const stile = computed(() => {
  const doc = props.doc as any
  let st = ''
  const bgUrl = resolveDisplayUrl(doc.image?.url)
  if (bgUrl) st += `background-image:url(${bgUrl});`
  if (doc.font) st += `font-family:"${doc.font.replace('+', ' ')}";`
  return st + (doc.style ?? '')
})
</script>
