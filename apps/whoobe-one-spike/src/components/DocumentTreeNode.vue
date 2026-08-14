<template>
  <button
    type="button"
    data-type="element"
    :data-id="node.id"
    class="w-full flex items-center gap-1 py-1 pr-2 text-left truncate cursor-grab"
    :class="isSelected ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:bg-gray-200'"
    :style="{ paddingLeft: `${0.5 + depth * 0.75}rem` }"
    @click.stop="select"
  >
    <span v-if="isContainer" class="w-3 shrink-0 text-gray-400 flex items-center" @click.stop="toggleOpen">
      <ChevronDown v-if="open" class="w-3 h-3" />
      <ChevronRight v-else class="w-3 h-3" />
    </span>
    <span v-else class="w-3 shrink-0"></span>
    <span class="capitalize truncate">{{ label }}</span>
    <span
      v-if="(node as any).semantic"
      class="shrink-0 ml-auto font-mono text-[9px] px-1 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200"
      :title="`Rendered as &lt;${(node as any).semantic}&gt;`"
    >
      &lt;{{ (node as any).semantic }}&gt;
    </span>
  </button>
  <div v-if="isContainer && open" class="dragula-container" :data-id="node.id">
    <div
      v-if="!node.blocks.length"
      class="text-gray-300 italic text-[11px]"
      :style="{ paddingLeft: `${0.5 + (depth + 1) * 0.75}rem` }"
    >
      empty - drop here
    </div>
    <DocumentTreeNode v-for="child in node.blocks" :key="child.id" :node="child" :depth="depth + 1" />
  </div>
</template>

<script setup lang="ts">
// Port of whoobe-one-studio's src/components/blocks/components/BlockTree.
// vue - a structural outline of the document; clicking any row selects
// that node, same `editor.current` the canvas/floating toolbar/Tailwind
// customizer all already read from and react to.
//
// One real bug fixed, not reproduced: the source's own row click handler
// dispatches `setCurrent(current)` - "current" being the *prop* passed
// into that recursion level (i.e. always the nearest ancestor container),
// never the row's own clicked node. Combined with plain (non-stopped)
// click bubbling through every ancestor row's own handler on the way up,
// clicking any leaf in the source ends up re-selecting whichever ancestor
// row's handler happens to run last - never the actual node clicked, which
// defeats the entire point of a tree picker. Fixed here by selecting
// `node` itself (this row's own prop) and using @click.stop, so a click
// only ever selects the exact row it landed on.
//
// Self-recursive with no explicit import: Vue 3 SFCs using <script setup>
// can reference themselves in the template by their inferred (filename-
// derived) component name - the source's Options-API equivalent needed an
// explicit `name: 'BlockTree'` option for the same recursion to work.
//
// Not a port - two things the source's read-only BlockTree.vue never had
// to solve:
//
// 1. Labels used to show `tag`/`element` directly - technically accurate,
//    but six different text builders (Heading/Paragraph/InlineText/Span/
//    Blockquote/Code) all leave `tag` at the base constructor's own
//    default ("element"), so the tree showed the literal word "element"
//    for all six alike, and otherwise showed a raw HTML tag name ("p",
//    "span", "h") instead of anything resembling the palette's own builder
//    names. `friendlyElementName()` (helpers.ts) reconstructs the actual
//    builder name (createElement()'s own dispatch never stores it on the
//    instance) from the combination of fields that really distinguish one
//    builder from another - verified directly against all 27 real
//    builders in ElementsClass.js, not just reasoned about.
//
// 2. Drag-to-reposition: `data-type="element"`/`data-id` on each row and
//    `dragula-container`/`data-id` on each container's own children
//    wrapper are the *exact same* conventions BlockContainer.vue/
//    BlockElementsPalette.vue already use - BlockEditor.vue's single
//    shared dragula instance recognizes them wherever they appear in the
//    document (its own `isContainer`/`moves`/`accepts` are all plain
//    class/attribute predicates, not a fixed, pre-registered container
//    list - confirmed directly from dragula's own source, not assumed),
//    and its existing 'drop' handler already does exactly "move the node
//    at this data-id into the container at that data-id" - so dragging a
//    row in the tree needs no new dragula instance and no changes to that
//    handler at all, just these same attributes showing up here too.
//    Reordering a *sibling* into a precise position isn't supported here,
//    same limitation the canvas itself already has (drop always appends,
//    see BlockEditor.vue's own comment) - not something this adds.
//
//    (That last paragraph predates the drop-handler rework in
//    BlockEditor.vue - same-container drops are now accepted and land at
//    the exact DOM drop index, so in-tree sibling reordering works.)
//
// 3. Semantic tags: a node with `semantic` set (setSemantic(), e.g. a
//    migrated <section>/<nav> or a re-tagged container) renders a small
//    <tag> chip on the row, in addition to its friendly builder name.
//
// The recursive nesting is deliberately flatter than it looks: each
// container's own `dragula-container` div is what dragula must see as the
// *direct* parent of every child row for those rows to register as
// draggable/droppable at all (same "direct child of a recognized
// container" requirement BlockElementsPalette.vue's own history already
// documents) - true here because Vue 3's fragment support lets each
// recursive DocumentTreeNode instance render two root siblings (its own
// row button, then its own children div) directly inside its *parent's*
// container div, rather than one wrapping element nesting them together.
// Indentation is purely visual (`depth * 0.75rem` padding), not real DOM
// nesting depth.
//
// `isContainer` checks `node.type === 'container'` (matching
// BlockContainer.vue's own dispatch condition exactly) rather than the
// previous `!!node.blocks?.length` - a real distinction, not just a
// rename: every Element, container or leaf, starts with an empty `blocks`
// array in the base constructor, so the old check also happened to expand
// leaf rows with zero children (harmless, since leaves never get any) but
// never showed an expand arrow *or* a valid drop target for an empty
// container - a real, common case (a freshly added, still-empty Flexbox/
// Grid) that needs to be reachable to drag anything into at all.
import { computed, ref } from 'vue'
import { ChevronDown, ChevronRight } from '@lucide/vue'
import type Element from '../scripts/ElementsClass.js'
import { useEditorStore } from '../store/editor'
import { friendlyElementName } from '../helpers'

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  node: WhoobeElement
  depth: number
}>()

const editor = useEditorStore()

const open = ref(true)
const isContainer = computed(() => (props.node as any).type === 'container')
const isSelected = computed(() => editor.current?.id === props.node.id)
const label = computed(() => friendlyElementName(props.node))

function select() {
  editor.setCurrent(props.node)
}

function toggleOpen() {
  open.value = !open.value
}
</script>
