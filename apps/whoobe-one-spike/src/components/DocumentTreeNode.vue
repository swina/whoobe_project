<template>
  <div role="treeitem" :aria-expanded="isContainer ? open : undefined" :aria-selected="isSelected">
    <div
      ref="rowEl"
      :data-tree-id="node.id"
      :draggable="depth > 0"
      tabindex="0"
      class="group w-full flex items-center gap-1 py-1 pr-2 text-left select-none outline-none focus-visible:ring-1 focus-visible:ring-indigo-400"
      :class="[isSelected ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:bg-gray-200', depth > 0 ? 'cursor-grab active:cursor-grabbing' : '', dropClass, dragging ? 'opacity-40' : '']"
      :style="{ paddingLeft: `${0.5 + depth * 0.75}rem` }"
      @click.stop="select"
      @keydown="onKey"
      @dragstart="onDragStart"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
      @dragend="clearTreeDrag"
    >
      <span v-if="isContainer" class="w-3 shrink-0 text-gray-400 flex items-center cursor-pointer" @click.stop="toggleOpen">
        <ChevronDown v-if="open" class="w-3 h-3" />
        <ChevronRight v-else class="w-3 h-3" />
      </span>
      <span v-else class="w-3 shrink-0"></span>
      <span class="capitalize truncate" @dblclick.stop="renameElement">{{ label }}</span>
      <span
        v-if="(node as any).semantic"
        class="shrink-0 ml-auto font-mono text-[9px] px-1 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200"
        :title="`Rendered as &lt;${(node as any).semantic}&gt;`"
      >
        &lt;{{ (node as any).semantic }}&gt;
      </span>
      <!-- the same moves as the keyboard, for the selected row: up, down, out of its container, into the previous one -->
      <span v-if="isSelected && depth > 0" class="shrink-0 flex items-center gap-0.5" :class="(node as any).semantic ? '' : 'ml-auto'" data-testid="tree-move-buttons">
        <button type="button" class="tree-move" title="Move up (Alt+↑)" aria-label="Move up" @click.stop="move('up')"><ArrowUp class="w-3 h-3" /></button>
        <button type="button" class="tree-move" title="Move down (Alt+↓)" aria-label="Move down" @click.stop="move('down')"><ArrowDown class="w-3 h-3" /></button>
        <button type="button" class="tree-move" title="Move out of the container (Alt+←)" aria-label="Move out" @click.stop="move('outdent')"><ArrowLeft class="w-3 h-3" /></button>
        <button type="button" class="tree-move" title="Move into the previous container (Alt+→)" aria-label="Move in" @click.stop="move('indent')"><ArrowRight class="w-3 h-3" /></button>
      </span>
    </div>
    <div v-if="isContainer && open" role="group">
      <div
        v-if="!node.blocks.length"
        class="text-gray-300 italic text-[11px] select-none"
        :style="{ paddingLeft: `${0.5 + (depth + 1) * 0.75}rem` }"
      >
        empty - drop here
      </div>
      <DocumentTreeNode v-for="child in node.blocks" :key="child.id" :node="child" :depth="depth + 1" />
    </div>
  </div>
</template>

<script setup lang="ts">
// A row of the element tree (the sidebar's "Tree" tab): select, rename (double click), open/close, and MOVE.
//
// Moving used to ride on the canvas's dragula instance: every row was a dragula item and every children list a dragula container,
// with the rows of nested containers flat siblings and the indentation only padding. What a drop meant then depended on which
// container dragula believed was under the pointer, so putting something INTO a container, or at a precise place among rows of
// different depths, often landed elsewhere or did nothing. Here a drop is always "this node, before / inside / after that node",
// decided by where the pointer is in the row (top quarter / middle / bottom quarter of a container; upper / lower half of a
// leaf) and shown while dragging with a line above or below the row, or a highlight for "inside". The rules (no drop into
// itself, off-by-one when moving down in the same list ...) are `moveNode` in @whoobe-cms/core, tested without a browser.
// Alt+Arrow keys and four small buttons on the selected row make the same moves one step at a time (no mouse needed).
//
// What the tree no longer does: take part in the canvas's dragula (dropping a palette item onto a tree row, or dragging a
// tree row onto the canvas). The palette still adds to the canvas, and the canvas still moves its own elements.
//
// Labels: `friendlyElementName()` (helpers.ts) reconstructs the builder's name (createElement() never stores it) from the fields
// that really distinguish the builders; a node with `semantic` set shows a small <tag> chip. `isContainer` is
// `node.type === 'container'` (BlockContainer.vue's own dispatch condition), so an empty Flexbox/Grid is a valid drop target.
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ChevronRight } from '@lucide/vue'
import { dropPositionAt, moveNode, siblingMove, canDrop, type DropPosition, type SiblingMove, type TreeAdapter } from '@whoobe-cms/core'
import type Element from '../scripts/ElementsClass.js'
import { useEditorStore } from '../store/editor'
import { editorBus } from '../bus'
import { friendlyElementName } from '../helpers'
import { clearTreeDrag, treeDrag } from '../tree-drag'

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  node: WhoobeElement
  depth: number
}>()

const editor = useEditorStore()

const adapter: TreeAdapter<WhoobeElement> = {
  id: (n) => (n as any).id,
  children: (n) => ((n as any).type === 'container' ? ((n as any).blocks as WhoobeElement[]) : null),
}

const open = ref(true)
const rowEl = ref<HTMLElement | null>(null)
const isContainer = computed(() => (props.node as any).type === 'container')
const isSelected = computed(() => editor.current?.id === props.node.id)
const label = computed(() => friendlyElementName(props.node))
const dragging = computed(() => treeDrag.id === props.node.id)

/** The line / highlight that says where a drop would land. */
const dropClass = computed(() => {
  if (treeDrag.overId !== props.node.id || !treeDrag.position) return ''
  if (treeDrag.position === 'before') return 'shadow-[inset_0_2px_0_0_#6366f1]'
  if (treeDrag.position === 'after') return 'shadow-[inset_0_-2px_0_0_#6366f1]'
  return 'bg-indigo-100 ring-1 ring-inset ring-indigo-400'
})

function select() {
  editor.setCurrent(props.node)
}

function toggleOpen() {
  open.value = !open.value
}

function renameElement() {
  const currentName = (props.node as any).name || ''
  const next = window.prompt('Element name', currentName)
  if (next === null) return
  ;(props.node as any).name = next.trim() || ''
}

function say(message: string) { editorBus.emit('editorMessage', message) }

const REASONS: Record<string, string> = {
  'into-itself': 'Cannot move an element into itself',
  'not-a-container': 'That element cannot contain others',
  root: 'That element cannot be moved there',
  missing: 'Could not find the element',
}

function apply(result: ReturnType<typeof moveNode>, done: string) {
  if (!result.ok) { say(REASONS[result.reason] ?? 'Cannot move there'); return }
  if (result.moved) say(done)
}

function move(how: SiblingMove) {
  if (!editor.document || props.depth === 0) return
  const id = props.node.id
  apply(siblingMove(editor.document as WhoobeElement, adapter, id, how), 'Block moved')
  // the row is re-created when it changes parent: put the focus back on it, so Alt+arrows can be pressed again
  void nextTick(() => document.querySelector<HTMLElement>(`[data-tree-id="${id}"]`)?.focus({ preventScroll: true }))
}

function onKey(e: KeyboardEvent) {
  if (!e.altKey || e.ctrlKey || e.metaKey) return
  const how: Record<string, SiblingMove> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'outdent', ArrowRight: 'indent' }
  const m = how[e.key]
  if (!m) return
  e.preventDefault()
  e.stopPropagation()
  move(m)
}

// ---- drag and drop ----------------------------------------------------------------------------------------

function onDragStart(e: DragEvent) {
  if (props.depth === 0 || !e.dataTransfer) { e.preventDefault(); return }
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', props.node.id)
  treeDrag.id = props.node.id
  // no select() here: selecting a container used to re-root the tree on it, which removed the dragged row from under the pointer
}

/** Where a drop on this row would go; the displayed root only takes things inside (nothing can sit beside it in this view). */
function positionFor(e: DragEvent): DropPosition {
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const pos = dropPositionAt(e.clientY - rect.top, rect.height, isContainer.value)
  return props.depth === 0 ? 'inside' : pos
}

let openTimer: ReturnType<typeof setTimeout> | null = null
function stopOpenTimer() { if (openTimer) { clearTimeout(openTimer); openTimer = null } }
onBeforeUnmount(stopOpenTimer)

function onDragOver(e: DragEvent) {
  const dragId = treeDrag.id
  if (!dragId || !editor.document) return                     // not a drag of the tree (a palette item, a gateway field ...)
  const pos = positionFor(e)
  if (!canDrop(editor.document as WhoobeElement, adapter, dragId, props.node.id, pos)) {
    if (treeDrag.overId === props.node.id) { treeDrag.overId = null; treeDrag.position = null }
    stopOpenTimer()
    return
  }
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  treeDrag.overId = props.node.id
  treeDrag.position = pos
  // hovering over a closed container opens it, so what is inside can be reached
  if (pos === 'inside' && isContainer.value && !open.value) {
    if (!openTimer) openTimer = setTimeout(() => { open.value = true; openTimer = null }, 600)
  } else stopOpenTimer()
}

function onDragLeave(e: DragEvent) {
  const el = e.currentTarget as HTMLElement
  if (e.relatedTarget && el.contains(e.relatedTarget as Node)) return
  stopOpenTimer()
  if (treeDrag.overId === props.node.id) { treeDrag.overId = null; treeDrag.position = null }
}

function onDrop(e: DragEvent) {
  const dragId = treeDrag.id
  stopOpenTimer()
  if (!dragId || !editor.document) return
  e.preventDefault()
  e.stopPropagation()
  const pos = treeDrag.overId === props.node.id && treeDrag.position ? treeDrag.position : positionFor(e)
  clearTreeDrag()
  const result = moveNode(editor.document as WhoobeElement, adapter, dragId, props.node.id, pos)
  apply(result, 'Block moved')
  if (result.ok && pos === 'inside') open.value = true
}

// a node that is selected elsewhere (the canvas) and sits in a closed branch stays reachable: nothing to do here; but when a
// move puts the selected node under this one, show it
watch(() => (props.node as any).blocks?.length, () => { if (isContainer.value && !open.value && treeDrag.id === null && isSelectedInside()) open.value = true })
// the selection (made on the canvas or here) is always reachable: the branches above it open, and its row scrolls into view
watch(() => editor.current?.id, (id) => {
  if (!id) return
  if (isContainer.value && !open.value && isSelectedInside()) open.value = true
  if (id === props.node.id) void nextTick(() => rowEl.value?.scrollIntoView({ block: 'nearest' }))
}, { immediate: true })
function isSelectedInside(): boolean {
  const cur = editor.current as any
  if (!cur || !isContainer.value) return false
  const stack = [...((props.node as any).blocks ?? [])]
  while (stack.length) { const n = stack.pop(); if (n.id === cur.id) return true; if (n.blocks) stack.push(...n.blocks) }
  return false
}
</script>

<style scoped>
.tree-move { width: 1.1rem; height: 1.1rem; display: inline-flex; align-items: center; justify-content: center; border-radius: .2rem; color: #6366f1; }
.tree-move:hover { background: #e0e7ff; }
</style>
