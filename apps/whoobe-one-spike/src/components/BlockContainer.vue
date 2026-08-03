<template>
  <div
    :id="doc.id"
    :class="[classe, 'dragula-container', 'group']"
    :style="stile"
    data-type="container"
    :data-id="doc.id"
    @click.self="onSelect"
  >
    <button
      type="button"
      class="absolute -top-2.5 -left-2.5 z-50 px-1.5 py-0.5 rounded text-[10px] leading-none font-semibold bg-red-500 text-white transition-opacity"
      :class="isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
      @click.stop="onSelect"
    >
      {{ doc.tag || 'container' }}
    </button>
    <template v-for="child in doc.blocks" :key="child.id">
      <BlockContainer v-if="child.type === 'container'" :doc="child" :level="level + 1" />
      <BlockIFrame v-else-if="child.tag === 'youtube' || child.tag === 'vimeo'" :element="child" :level="level + 1" />
      <BlockElement v-else :element="child" :level="level + 1" />
    </template>
  </div>
</template>

<script setup lang="ts">
// Port of whoobe-one-studio's src/components/blocks/BlockContainer.vue -
// the recursive container renderer. The dragula instance itself lives one
// level up, in BlockEditor.vue (see its comment for why: the original
// creates one dragula() instance PER BlockContainer, all sharing the exact
// same document-wide `isContainer` predicate - functionally redundant N
// instances managing the same global set of ".dragula-container" elements,
// not a per-subtree scoping. A single shared instance is both simpler and
// closer to how dragula is actually meant to be used).
//
// Deviation from the original (see port plan §2 item 3): `doc`/`level` are
// real declared props, not `this.$attrs.doc`/`this.$attrs.level`.
//
// Selection uses @click.self instead of the original's z-index-ladder +
// absolute-overlay hit-testing trick (BlockElement.vue's `classe` computed
// added `z-` + level+1 specifically so element clicks would out-rank the
// container's own click-catching overlay div). @click.self only fires when
// the event's target IS this exact div, not a bubbled-up descendant click -
// a native, simpler way to get the same "clicked container background vs.
// clicked a child" distinction without maintaining a z-index scheme by hand.
//
// @click.self alone isn't enough, though: it only ever fires when a click
// lands on genuine unobstructed container background, which doesn't exist
// at all once children fill the available space (a real, common case, not
// an edge case - e.g. two full-width flex children with no gap). The
// corner tag button below is a guaranteed-always-clickable fallback that
// doesn't depend on any exposed background pixels existing, matching how
// real page-builder UIs (Webflow, Framer, etc.) solve the same problem -
// shown on hover of the whole container (Tailwind's `group`/`group-hover`),
// or permanently once selected.
import { computed } from 'vue'
import type Element from '../scripts/ElementsClass.js'
import { useEditorStore } from '../store/editor'
import { resolveDisplayUrl } from '../resolve-display-url'
import BlockElement from './BlockElement.vue'
import BlockIFrame from './BlockIFrame.vue'

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  doc: WhoobeElement
  level: number
}>()

const editor = useEditorStore()

const isSelected = computed(() => editor.current?.id === props.doc.id)

const classe = computed(() => {
  const doc = props.doc as any
  let cls = `${doc.css.css ?? ''} ${doc.css.container ?? ''} relative cursor-pointer p-1`
  cls += isSelected.value ? ' border-2 border-red-400' : ' border border-dashed border-transparent hover:border-red-300'
  // An empty container (no children yet, e.g. one just added from the
  // palette) has nothing to give it visible size - without a floor here
  // it collapses to a sliver a few px tall, making it practically
  // impossible to see, hover (for the corner tag) or drop into.
  if (!doc.blocks?.length) cls += ' min-h-12 min-w-12'
  return cls
})

const stile = computed(() => {
  const doc = props.doc as any
  let st = ''
  const bgUrl = resolveDisplayUrl(doc.image?.url)
  if (bgUrl) st += `background-image:url(${bgUrl});`
  if (doc.font) st += `font-family:"${doc.font.replace('+', ' ')}";`
  return st + (doc.style ?? '')
})

function onSelect() {
  editor.setCurrent(isSelected.value ? null : props.doc)
}
</script>
