<template>
  <div>
    <div
      v-if="node.kind !== 'root'"
      :data-nav-id="node.id"
      :data-testid="`nav-row-${label}`"
      draggable="true"
      tabindex="0"
      class="group flex items-center gap-1.5 pr-2 py-1 rounded outline-none select-none cursor-grab active:cursor-grabbing focus-visible:ring-1 focus-visible:ring-indigo-400"
      :class="[ctx.selectedId.value === node.id ? 'bg-indigo-500/20' : 'hover:bg-slate-800/60 light:hover:bg-slate-100', dropClass, dragging ? 'opacity-40' : '']"
      :style="{ paddingLeft: `${0.4 + depth * 1}rem` }"
      @click.stop="ctx.select(node.id)"
      @dblclick.stop="startEdit"
      @keydown="onKey"
      @dragstart="onDragStart"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
      @dragend="clearNavDrag"
    >
      <span v-if="node.kind === 'section'" class="w-3 shrink-0 text-slate-500 cursor-pointer" @click.stop="open = !open">
        <ChevronDown v-if="open" class="w-3 h-3" /><ChevronRight v-else class="w-3 h-3" />
      </span>
      <span v-else class="w-3 shrink-0"></span>
      <FolderOpen v-if="node.kind === 'section'" class="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <ExternalLink v-else-if="node.kind === 'link'" class="w-3.5 h-3.5 text-sky-400 shrink-0" />
      <FileText v-else class="w-3.5 h-3.5 text-slate-400 shrink-0" />

      <input v-if="editing" ref="field" v-model="draft" class="flex-1 min-w-0 rounded bg-slate-950 light:bg-white border border-indigo-500 text-sm px-1.5 py-0.5 text-slate-100 light:text-slate-900 outline-none"
        @click.stop @keydown.enter.prevent="commit" @keydown.esc.prevent="editing = false" @blur="commit" />
      <template v-else>
        <span class="text-sm truncate" :class="node.kind === 'section' ? 'font-semibold text-slate-100 light:text-slate-900' : 'text-slate-300 light:text-slate-700'">{{ label }}</span>
        <span v-if="node.kind === 'doc'" class="text-[10px] font-mono text-slate-600 truncate">{{ node.path }}</span>
        <span v-else-if="node.kind === 'link'" class="text-[10px] font-mono text-slate-600 truncate">{{ node.href }}</span>
        <span v-if="node.kind === 'doc' && node.custom" class="text-[9px] uppercase tracking-wider px-1 rounded bg-indigo-500/20 text-indigo-300" title="The title is changed in the index">custom</span>
      </template>

      <span class="ml-auto shrink-0 flex items-center gap-0.5" :class="ctx.selectedId.value === node.id ? '' : 'opacity-0 group-hover:opacity-100'" data-testid="nav-actions">
        <button type="button" class="nav-btn" title="Move up (Alt+↑)" aria-label="Move up" @click.stop="ctx.move(node.id, 'up')"><ArrowUp class="w-3 h-3" /></button>
        <button type="button" class="nav-btn" title="Move down (Alt+↓)" aria-label="Move down" @click.stop="ctx.move(node.id, 'down')"><ArrowDown class="w-3 h-3" /></button>
        <button type="button" class="nav-btn" title="Move out of the section (Alt+←)" aria-label="Move out" @click.stop="ctx.move(node.id, 'outdent')"><ArrowLeft class="w-3 h-3" /></button>
        <button type="button" class="nav-btn" title="Move into the section above (Alt+→)" aria-label="Move in" @click.stop="ctx.move(node.id, 'indent')"><ArrowRight class="w-3 h-3" /></button>
        <button type="button" class="nav-btn" title="Rename" aria-label="Rename" @click.stop="startEdit"><Pencil class="w-3 h-3" /></button>
        <button type="button" class="nav-btn text-rose-400" :title="node.kind === 'section' ? 'Remove the section (its documents go back to the list)' : 'Take out of the index'" aria-label="Remove" @click.stop="ctx.remove(node.id)"><X class="w-3 h-3" /></button>
      </span>
    </div>
    <div v-if="node.kind === 'root' || (node.kind === 'section' && open)">
      <div v-if="(node.kind === 'root' || node.kind === 'section') && node.items.length === 0" class="text-[11px] italic text-slate-600 py-1 select-none" :style="{ paddingLeft: `${0.4 + (depth + 1) * 1}rem` }">
        {{ node.kind === 'root' ? 'The index is empty: drag documents here, or add a section.' : 'Empty section - drop documents here' }}
      </div>
      <DocsNavNode v-for="child in (node.kind === 'root' || node.kind === 'section' ? node.items : [])" :key="child.id" :node="child" :depth="node.kind === 'root' ? 0 : depth + 1" />
    </div>
  </div>
</template>

<script setup lang="ts">
// A row of the index editor: select, rename (double click), remove, move (drag; Alt+arrows; four buttons). A drop is always
// "this node before / inside / after that node", decided by where the pointer is in the row and shown while dragging - the rules
// are `moveNode` in @whoobe-cms/core (the same as in the editor's element tree).
import { computed, inject, nextTick, onBeforeUnmount, ref } from 'vue'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ChevronRight, ExternalLink, FileText, FolderOpen, Pencil, X } from '@lucide/vue'
import { canDrop, dropPositionAt, type DropPosition, type SiblingMove } from '@whoobe-cms/core'
import { editAdapter, type EditNode } from '../../utils/docs-nav-edit'
import { clearNavDrag, navDrag } from '../../utils/docs-nav-drag'
import { navEditorKey } from './docs-nav-context'

defineOptions({ name: 'DocsNavNode' })
const props = defineProps<{ node: EditNode; depth: number }>()
const ctx = inject(navEditorKey)!

const open = ref(true)
const editing = ref(false)
const draft = ref('')
const field = ref<HTMLInputElement | null>(null)

const label = computed(() => (props.node.kind === 'doc' || props.node.kind === 'link' || props.node.kind === 'section' ? props.node.title || '(no title)' : ''))
const dragging = computed(() => navDrag.kind === 'node' && navDrag.id === props.node.id)
const dropClass = computed(() => {
  if (navDrag.overId !== props.node.id || !navDrag.position) return ''
  if (navDrag.position === 'before') return 'shadow-[inset_0_2px_0_0_#6366f1]'
  if (navDrag.position === 'after') return 'shadow-[inset_0_-2px_0_0_#6366f1]'
  return 'bg-indigo-500/25 ring-1 ring-inset ring-indigo-400'
})

function startEdit() {
  if (props.node.kind === 'root') return
  draft.value = props.node.kind === 'link' || props.node.kind === 'doc' || props.node.kind === 'section' ? props.node.title : ''
  editing.value = true
  void nextTick(() => { field.value?.focus(); field.value?.select() })
}
function commit() {
  if (!editing.value) return
  editing.value = false
  ctx.rename(props.node.id, draft.value)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'F2') { e.preventDefault(); startEdit(); return }
  if (e.key === 'Delete') { e.preventDefault(); ctx.remove(props.node.id); return }
  if (!e.altKey || e.ctrlKey || e.metaKey) return
  const how: Record<string, SiblingMove> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'outdent', ArrowRight: 'indent' }
  const m = how[e.key]
  if (!m) return
  e.preventDefault(); e.stopPropagation()
  ctx.move(props.node.id, m)
}

// ---- drag and drop ----------------------------------------------------------------------------------------

function onDragStart(e: DragEvent) {
  if (!e.dataTransfer) return
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', props.node.id)
  navDrag.kind = 'node'
  navDrag.id = props.node.id
  ctx.select(props.node.id)
}

function positionFor(e: DragEvent): DropPosition {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  return dropPositionAt(e.clientY - rect.top, rect.height, props.node.kind === 'section')
}

let openTimer: ReturnType<typeof setTimeout> | null = null
const stopTimer = () => { if (openTimer) { clearTimeout(openTimer); openTimer = null } }
onBeforeUnmount(stopTimer)

function allowed(pos: DropPosition): boolean {
  if (navDrag.kind === 'node' && navDrag.id) return canDrop(ctx.root.value, editAdapter, navDrag.id, props.node.id, pos)
  if (navDrag.kind === 'doc') return pos === 'inside' ? props.node.kind === 'section' : true      // a document from the list goes anywhere a node can sit
  return false
}

function onDragOver(e: DragEvent) {
  if (!navDrag.kind) return
  const pos = positionFor(e)
  if (!allowed(pos)) {
    if (navDrag.overId === props.node.id) { navDrag.overId = null; navDrag.position = null }
    stopTimer()
    return
  }
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  navDrag.overId = props.node.id
  navDrag.position = pos
  if (pos === 'inside' && props.node.kind === 'section' && !open.value) { if (!openTimer) openTimer = setTimeout(() => { open.value = true; openTimer = null }, 600) } else stopTimer()
}

function onDragLeave(e: DragEvent) {
  if (e.relatedTarget && (e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return
  stopTimer()
  if (navDrag.overId === props.node.id) { navDrag.overId = null; navDrag.position = null }
}

function onDrop(e: DragEvent) {
  stopTimer()
  if (!navDrag.kind || !navDrag.id) return
  e.preventDefault(); e.stopPropagation()
  const pos = navDrag.overId === props.node.id && navDrag.position ? navDrag.position : positionFor(e)
  const kind = navDrag.kind
  const id = navDrag.id
  clearNavDrag()
  if (kind === 'node') ctx.dropNode(id, props.node.id, pos)
  else ctx.dropDocument(id, props.node.id, pos)
  if (pos === 'inside') open.value = true
}
</script>

<style scoped>
.nav-btn { width: 1.15rem; height: 1.15rem; display: inline-flex; align-items: center; justify-content: center; border-radius: .2rem; color: #818cf8; }
.nav-btn:hover { background: rgba(99, 102, 241, .25); }
</style>
