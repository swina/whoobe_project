<template>
  <!-- Semantic -->
  <component :is="semantic" :class="classe" :style="stile">
    <!-- Children-->
    <template v-for="child in doc.blocks" :key="child.id">
      <a v-if="(child as any).link" :href="(child as any).link" :target="(child as any).linkTarget || undefined">
        <component :is="childComponent(child)" v-bind="childProps(child)" />
      </a>
      <!-- Child-->
      <component v-else :is="childComponent(child)" v-bind="childProps(child)" />
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
//
// A real bug, fixed here: the source wraps a linked child in its own
// <a :href="block.link"> right in this same per-child loop (see this
// file's own history in the source repo) - that wrapping was missed
// entirely when this preview tree was first ported, so `element.link`
// was stored by the editor but never actually rendered anywhere, in any
// document. Fixed by dispatching each child through one dynamic
// `<component :is>` (childComponent()/childProps() below) instead of the
// three-way v-if/else-if chain this used to be, so the <a> wrapper only
// has to be written once instead of duplicated across all three branches.
// `target` is new, not in the source at all (its own <a> never sets one) -
// see FloatingToolbar.vue's Link popover.
import { computed } from 'vue'
import type { Component } from 'vue'
import type Element from '../../scripts/ElementsClass.js'
import { resolveDisplayUrl } from '../../resolve-display-url'
import BlockElementPreview from './BlockElementPreview.vue'
import BlockIFramePreview from './BlockIFramePreview.vue'
import BlockSliderPreview from './BlockSliderPreview.vue'
// Self-import: <script setup>'s auto-recursion (referencing a component by
// its own inferred name) only works inside the *template*, not plain
// script code - childComponent() below needs a real value to return, so
// this file imports itself. Vite/Vue resolve this circular reference fine
// for SFCs (the recursive reference is only ever needed at render time,
// well after this module has finished evaluating).
import BlockContainerPreview from './BlockContainerPreview.vue'

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  doc: WhoobeElement
}>()

function childComponent(child: WhoobeElement): Component {
  const c = child as any
  // Checked before the generic `type === 'container'` case below - a
  // slider *is* a container (its slides are just its `.blocks`, see
  // ElementsClass.js's Slider() builder comment), but needs its own real
  // one-at-a-time/autoplay/nav rendering instead of the plain "show every
  // child stacked" behavior every other container gets.
  if (c.tag === 'slider') return BlockSliderPreview as unknown as Component
  if (c.type === 'container') return BlockContainerPreview as unknown as Component
  if (c.tag === 'youtube' || c.tag === 'vimeo') return BlockIFramePreview as unknown as Component
  return BlockElementPreview as unknown as Component
}

function childProps(child: WhoobeElement): Record<string, unknown> {
  const c = child as any
  if (c.tag === 'slider' || c.type === 'container') return { doc: child }
  return { element: child }
}

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
