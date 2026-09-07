<template>
  <!-- Collapsed via FloatingToolbar.vue's "Hide content" toggle - see
       store/editor.ts's collapsedIds. Replaces the whole subtree (children
       AND the tag badges above) with a small placeholder showing just the
       real HTML tag, clearing the exact screen footprint a layered/
       absolutely-positioned container (e.g. a dropdown panel) was
       covering, so whatever's underneath it becomes clickable/droppable
       again. Clicking the placeholder restores it and selects it. -->
  <button
    v-if="isCollapsedNode"
    type="button"
    :id="doc.id"
    :data-id="doc.id"
    data-type="container"
    class="inline-flex items-center gap-1 m-0.5 px-1.5 py-0.5 rounded border border-dashed border-gray-400 bg-gray-200 text-gray-500 text-[10px] font-mono hover:border-indigo-400 hover:text-indigo-600"
    title="Hidden - click to show content again"
    @click="showAgain"
  >
    &lt;{{ semantic }}&gt;
  </button>
  <component
    v-else
    :is="semantic"
    :id="doc.id"
    :class="[classe, 'dragula-container', groupClass]"
    :style="stile"
    data-type="container"
    :data-id="doc.id"
    v-bind="containerAttrs"
    @click.self="onSelect"
    @submit.prevent
  >
    <button
      type="button"
      class="absolute -top-2.5 -left-2.5 z-50 px-1.5 py-0.5 rounded text-[10px] leading-none font-semibold text-white transition-opacity"
      :class="[tagOpacityClass, tagBgClass]"
      @click.stop="onSelect"
    >
      {{ doc.tag || 'container' }}
      <span v-if="(doc as any).dataBinding" class="text-[9px] opacity-80 ml-1">{{ ((doc as any).dataBinding?.className || '?') }}</span>
    </button>
    <button
      v-if="(doc as any).semantic"
      type="button"
      class="absolute -top-2.5 -right-2.5 z-50 px-1.5 py-0.5 rounded text-[10px] leading-none font-semibold text-white bg-slate-500 transition-opacity"
      :class="tagOpacityClass"
      @click.stop="onSelect"
    >
      &lt;{{ (doc as any).semantic }}&gt;
    </button>
    <template v-if="collectionResolved.length">
      <template v-for="(obj, index) in pagedItems" :key="index">
        <template v-for="child in doc.blocks" :key="child.id">
          <BlockSlider v-if="child.tag === 'slider'" :doc="child" :level="level + 1" :data-context="obj" />
          <BlockContainer v-else-if="child.type === 'container'" :doc="child" :level="level + 1" :data-context="obj" />
          <BlockIFrame v-else-if="child.tag === 'youtube' || child.tag === 'vimeo'" :element="child" :level="level + 1" />
          <BlockElement v-else :element="child" :level="level + 1" :data-context="obj" />
        </template>
      </template>
      <div
        v-if="rowsPerPage > 0 && collectionResolved.length > rowsPerPage"
        :class="paginationContainerClass"
      >
        <div v-if="paginationMode === 'standard'" class="flex items-center justify-center gap-2 text-[10px] text-gray-400 py-1.5 border-t border-dashed border-gray-200 mt-1">
          <button type="button" class="px-1.5 py-0.5 rounded border disabled:opacity-30" :disabled="currentPage <= 1" @click.stop="currentPage = Math.max(1, currentPage - 1)">‹</button>
          <span>Page {{ currentPage }} / {{ totalPages }}</span>
          <button type="button" class="px-1.5 py-0.5 rounded border disabled:opacity-30" :disabled="currentPage >= totalPages" @click.stop="currentPage = Math.min(totalPages, currentPage + 1)">›</button>
        </div>
        <div v-else class="flex flex-col items-center gap-1 text-[10px] text-gray-400 py-1.5 border-t border-dashed border-gray-200 mt-1">
          <span>{{ visibleCount }} / {{ collectionResolved.length }}</span>
          <button
            v-if="visibleCount < collectionResolved.length"
            type="button"
            :class="loadMoreButtonClass"
            @click.stop="loadMoreMore"
          >{{ loadMoreButtonText }}</button>
        </div>
      </div>
    </template>
    <template v-else>
      <template v-for="child in doc.blocks" :key="child.id">
        <BlockSlider v-if="child.tag === 'slider'" :doc="child" :level="level + 1" :data-context="childContext" />
        <BlockContainer v-else-if="child.type === 'container'" :doc="child" :level="level + 1" :data-context="childContext" />
        <BlockIFrame v-else-if="child.tag === 'youtube' || child.tag === 'vimeo'" :element="child" :level="level + 1" />
        <BlockElement v-else :element="child" :level="level + 1" :data-context="childContext" />
      </template>
    </template>
  </component>
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
//
// A real bug, fixed here: every container used the same plain, unqualified
// `group` class, and Tailwind's `.group:hover .group-hover:opacity-100`
// selector matches *every* matching descendant of *every* currently-
// hovered `.group`, at any depth - not just the nearest one. Since the
// document's own outermost container is a `.group` too, and it's "hovered"
// (in the CSS sense) essentially any time the mouse is anywhere over the
// canvas at all, its own selector match alone made *every* nested
// container's corner tag visible simultaneously, all the time - in
// practice indistinguishable from "always shown", the exact opposite of
// the intended hover-only behavior. Fixed with Tailwind's *named* group
// variant (`group/<name>`, `group-hover/<name>:...`) keyed on each node's
// own id - the same mechanism BlockElementsPalette.vue's own snippet-chip
// delete button already uses (`group/chip`), just with a per-instance
// name instead of a shared literal one, since containers (unlike palette
// chips) nest inside each other and a shared name is exactly what let one
// container's hover state leak into every other one's visibility. Hovering
// a container now only affects that container's own tag (and, correctly,
// still shows it while hovering anywhere within its own descendants - that
// part was never the bug, "you're inside me" is accurate information) -
// it no longer leaks to unrelated siblings or nested children elsewhere in
// the tree.
import { computed, ref, watch } from 'vue'
import type Element from '../scripts/ElementsClass.js'
import { useEditorStore } from '../store/editor'
import { resolveDisplayUrl } from '../resolve-display-url'
import type { DataObjectRecord } from '../data-objects-api'
import BlockElement from './BlockElement.vue'
import BlockIFrame from './BlockIFrame.vue'
import BlockSlider from './BlockSlider.vue'
import { customAttrs } from '../helpers'

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  doc: WhoobeElement
  level: number
  dataContext?: DataObjectRecord | null
}>()

// If this container has a whole-object binding (no field), its resolved
// object becomes the dataContext for all children - they inherit it
// instead of resolving independently.
const resolvedContext = computed<DataObjectRecord | null>(() => {
  const editor = useEditorStore()
  const db = (props.doc as any).dataBinding
  if (!db || db.field) return null
  const resolved = editor.resolvedData[props.doc.id]
  if (!resolved || Array.isArray(resolved)) return null
  return resolved as DataObjectRecord
})

const childContext = computed(() => props.dataContext ?? resolvedContext.value)

// A container with a collection/query data binding (whole-object, no
// field) whose resolved value is an array - previously discarded entirely
// (rendered with no data context at all) since resolvedContext above bails
// out on arrays; this is the live-canvas counterpart of BlockContainerPreview.
// vue's own collectionResolved/repeater, so a bound list is visible and
// editable while building the page, not just in Preview.
const collectionResolved = computed<DataObjectRecord[]>(() => {
  const editor = useEditorStore()
  const db = (props.doc as any).dataBinding
  if (!db || db.field) return []
  const resolved = editor.resolvedData[props.doc.id]
  return Array.isArray(resolved) ? resolved : []
})

// Client-side pagination over collectionResolved - same pattern as
// BlockContainerPreview.vue's own rowsPerPage/currentPage/totalPages/
// pagedItems (kept duplicated rather than a shared composable, matching
// this exact file pair's existing extensive duplication), plus the
// lazyload variant.
const rowsPerPage = computed(() => Number((props.doc as any).dataBinding?.rowsPerPage) || 0)
const paginationMode = computed<'standard' | 'lazyload'>(() =>
  (props.doc as any).dataBinding?.paginationMode === 'lazyload' ? 'lazyload' : 'standard'
)
const currentPage = ref(1)
const totalPages = computed(() =>
  rowsPerPage.value > 0 ? Math.max(1, Math.ceil(collectionResolved.value.length / rowsPerPage.value)) : 1
)
const visibleCount = ref(rowsPerPage.value || 0)
const loadMoreButtonText = computed(() => (props.doc as any).dataBinding?.loadMoreText?.trim() || 'More')
const loadMoreButtonClass = computed(() => {
  const cls = (props.doc as any).dataBinding?.loadMoreClass?.trim()
  return cls || 'px-3 py-1 rounded border border-gray-300 text-xs text-gray-500 hover:bg-gray-100'
})
const paginationContainerClass = computed(() => {
  const cls = (props.doc as any).dataBinding?.paginationContainerClass?.trim()
  return cls || 'w-full'
})
const pagedItems = computed(() => {
  if (!rowsPerPage.value) return collectionResolved.value
  if (paginationMode.value === 'lazyload') {
    return collectionResolved.value.slice(0, visibleCount.value)
  }
  const start = (currentPage.value - 1) * rowsPerPage.value
  return collectionResolved.value.slice(start, start + rowsPerPage.value)
})
function loadMoreMore() {
  visibleCount.value = Math.min(visibleCount.value + rowsPerPage.value, collectionResolved.value.length)
}
watch(collectionResolved, () => {
  currentPage.value = 1
  visibleCount.value = rowsPerPage.value
})
watch(rowsPerPage, (n) => {
  visibleCount.value = n || 0
})
watch(totalPages, (p) => {
  if (currentPage.value > p) currentPage.value = p
})

const editor = useEditorStore()

const isSelected = computed(() => editor.current?.id === props.doc.id)
const groupClass = computed(() => `group/${props.doc.id}`)
const tagOpacityClass = computed(() => (isSelected.value ? 'opacity-100' : `opacity-0 group-hover/${props.doc.id}:opacity-100`))

// Was a literal <div> - real, reported limitation, surfaced while
// retargeting the Pimcore migration pipeline at whoobe-one-spike (docs/
// plans/cms/whoobe-one-editor-integration-plan.md, Phase 2): every
// container rendered as a div regardless of any tag/element field, so
// real semantic markup (a migrated brick's own <section>/<aside>/
// <header>, or just wanting a <nav>/<main>/<article> while building a
// page from scratch) had nowhere to go. `semantic` itself isn't new -
// `Element.setSemantic()` (ElementsClass.js) and the `semantic?: string`
// field (ElementsClass.d.ts) already existed, already used by `Form()`'s
// own builder, and preview/BlockContainerPreview.vue already reads it
// (`:is="semantic"`) - only the *editing* canvas here never did, so a
// form (the one built-in case already using this) always LOOKED like a
// div while being edited even though it correctly rendered as a real
// <form> in preview. FloatingToolbar.vue's new "Semantic tag" control is
// what actually lets a user set this for any container now, not just
// Form()'s own builder default.
const semantic = computed(() => (props.doc as any).semantic || 'div')
const isCollapsedNode = computed(() => editor.isCollapsed(props.doc.id))
function showAgain() {
  editor.toggleCollapsed(props.doc.id)
  editor.setCurrent(props.doc)
}

const containerAttrs = computed(() => customAttrs((props.doc as any).data?.attributes))

// A Form() element renders as a real <form> here too (semantic above) -
// @submit.prevent on the template's root <component> is defense-in-depth
// alongside BlockElement.vue's onClick preventDefault() (docs/plans/forms/
// cms-forms.md): that stops a Submit button's own click from firing, but
// pressing Enter inside a text input submits the *form*, not the button,
// bypassing that guard entirely. Edit mode never actually submits.

// Not from the source - a quick "does this container carry any of its own
// styling" signal, requested directly. `css.container` doesn't qualify on
// its own: every container already has *some* css.container from its own
// builder (Flexbox's own `flex flex-col`, etc.), so treating it as "custom"
// would make this violet almost always, regardless of whether the user
// actually changed anything. `css.css` starts empty for a freshly-built
// container/element and is the one field every structured Tailwind control
// *and* the free-text Custom Classes escape hatch both write into - there's
// no way to tell which of those two produced a given class (they share the
// same string), so "has css.css content at all" is the most honest signal
// this data model can actually support. Inline `style` (set by the Fill/
// Text color pickers' native <input type="color">, not their swatch grids -
// see FloatingToolbar.vue's pickFillColor()/pickTextColor()) counts too -
// about as direct a form of "custom CSS" as there is.
const tagBgClass = computed(() => {
  const doc = props.doc as any
  const hasCustomCss = !!(doc.css?.css?.trim() || doc.style?.trim())
  return hasCustomCss ? 'bg-violet-500' : 'bg-red-500'
})

const classe = computed(() => {
  const doc = props.doc as any
  let cls = `${doc.css.css ?? ''} ${doc.css.container ?? ''} relative cursor-pointer p-2`
  cls += isSelected.value ? ' border-2 border-red-400' : ' border border-dashed border-transparent hover:border-red-300'
  // An empty container (no children yet, e.g. one just added from the
  // palette) has nothing to give it visible size - without a floor here
  // it collapses to a sliver a few px tall, making it practically
  // impossible to see, hover (for the corner tag) or drop into.
  if (!doc.blocks?.length) cls += ' min-h-12 min-w-12'
  // The document root gets a canvas floor (min-height) as an EDITOR-ONLY
  // affordance - it is not part of the stored content, so it never renders
  // in preview/public (the old baked-in `min-h-[600px]` class did).
  if (doc.tag === 'document') cls += ' whoobe-canvas-root'
  return cls
})

const stile = computed(() => {
  const doc = props.doc as any
  let st = ''
  const bgUrl = resolveDisplayUrl(doc.image?.url)
  if (bgUrl) st += `background-image:url(${bgUrl});`
  if (doc.font) st += `font-family:"${doc.font.replaceAll('+', ' ')}";`
  return st + (doc.style ?? '')
})

function onSelect() {
  editor.setCurrent(isSelected.value ? null : props.doc)
}
</script>
