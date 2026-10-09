<template>
  <div class="h-full min-h-0 grid md:grid-cols-[minmax(0,1fr)_16rem] gap-4" data-testid="docs-nav-editor">
    <div class="min-w-0 min-h-0 flex flex-col gap-2">
      <div class="shrink-0 flex items-center gap-2 flex-wrap">
        <button class="btn btn-secondary btn-sm" data-testid="nav-add-section" @click="addSection">+ Section</button>
        <button class="btn btn-secondary btn-sm" data-testid="nav-add-link" @click="addLink">+ Link</button>
        <span class="text-[11px] text-slate-500">Drag rows to reorder or to move them into a section. Keyboard: Alt+arrows move, F2 renames, Delete takes out.</span>
      </div>
      <div class="rounded-lg border border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-slate-50 p-1.5 flex-1 min-h-[8rem] overflow-y-auto" role="tree" data-testid="nav-tree"
        @dragover="onRootOver" @drop="onRootDrop">
        <DocsNavNode :node="root" :depth="-1" />
      </div>
      <p v-if="message" class="shrink-0 text-xs text-amber-300">{{ message }}</p>
    </div>

    <div class="min-h-0 flex flex-col gap-2">
      <div class="shrink-0 text-xs font-semibold text-slate-300">Not in the index <span class="text-slate-500 font-normal">({{ unlisted.length }})</span></div>
      <p class="shrink-0 text-[11px] text-slate-500">Drag a document into the tree. Documents missing from the index are listed at the end, under “Other”, when the site is read.</p>
      <div class="rounded-lg border border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-slate-50 p-1.5 flex-1 min-h-[8rem] overflow-y-auto space-y-0.5" data-testid="nav-unlisted">
        <div v-if="unlisted.length === 0" class="text-[11px] italic text-slate-600 p-2">Every document is in the index.</div>
        <div v-for="d in unlisted" :key="d.path" draggable="true" :data-testid="`nav-unlisted-${d.path}`"
          class="flex items-center gap-1.5 px-2 py-1 rounded cursor-grab active:cursor-grabbing select-none hover:bg-slate-800/60 light:hover:bg-slate-100"
          :class="navDrag.kind === 'doc' && navDrag.id === d.path ? 'opacity-40' : ''"
          @dragstart="onDocDragStart($event, d.path)" @dragend="clearNavDrag" @dblclick="addToEnd(d)">
          <FileText class="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <div class="min-w-0 flex-1">
            <div class="text-sm text-slate-300 light:text-slate-700 truncate">{{ d.title }}</div>
            <div class="text-[10px] font-mono text-slate-600 truncate">{{ d.path }}</div>
          </div>
          <button type="button" class="btn btn-link shrink-0" title="Add at the end of the index" @click="addToEnd(d)">Add</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// The visual editor of the index (`_nav.yml`): the tree on the left, the documents that are not in it on the right. The tree is
// edited in place; the parent reads it with `editToYaml()`.
import { computed, nextTick, provide, ref, toRef } from 'vue'
import { FileText } from '@lucide/vue'
import { moveNode, siblingMove, type DropPosition, type SiblingMove } from '@whoobe-cms/core'
import { docNode, editAdapter, newEditId, unlistedDocuments, type EditNode } from '../../utils/docs-nav-edit'
import { clearNavDrag, navDrag } from '../../utils/docs-nav-drag'
import type { DocsDocument } from '../../utils/docs-sites-api'
import DocsNavNode from './DocsNavNode.vue'
import { navEditorKey } from './docs-nav-context'

const props = defineProps<{ root: EditNode; documents: DocsDocument[] }>()
const emit = defineEmits<{ change: [] }>()

const rootRef = toRef(props, 'root')
const selectedId = ref<string | null>(null)
const message = ref('')
const unlisted = computed(() => unlistedDocuments(props.root, props.documents))

const REASONS: Record<string, string> = {
  'into-itself': 'A section cannot be moved into itself.',
  'not-a-container': 'Only a section can contain other entries.',
  root: 'That cannot be moved there.',
  missing: 'Could not find the entry.',
}
function report(result: ReturnType<typeof moveNode>): boolean {
  if (!result.ok) { message.value = REASONS[result.reason] ?? 'Cannot move there.'; return false }
  message.value = ''
  if (result.moved) emit('change')
  return true
}

function find(id: string, node: EditNode = props.root): { node: EditNode; parent: EditNode | null } | null {
  if (node.id === id) return { node, parent: null }
  if (node.kind === 'root' || node.kind === 'section') {
    for (const c of node.items) {
      if (c.id === id) return { node: c, parent: node }
      const deeper = find(id, c)
      if (deeper) return deeper
    }
  }
  return null
}

provide(navEditorKey, {
  root: rootRef,
  selectedId,
  select: (id) => { selectedId.value = id },
  rename(id, title) {
    const f = find(id)
    if (!f) return
    const n = f.node
    const t = title.trim()
    if (n.kind === 'doc') { n.title = t; n.custom = true }
    else if (n.kind === 'section' || n.kind === 'link') n.title = t
    emit('change')
  },
  remove(id) {
    const f = find(id)
    if (!f?.parent || !(f.parent.kind === 'root' || f.parent.kind === 'section')) return
    f.parent.items.splice(f.parent.items.findIndex((c) => c.id === id), 1)
    if (selectedId.value === id) selectedId.value = null
    emit('change')
  },
  move(id, how: SiblingMove) {
    report(siblingMove(props.root, editAdapter, id, how))
    // the row is re-created when it changes parent: put the focus back on it, so Alt+arrows can be pressed again
    void nextTick(() => document.querySelector<HTMLElement>(`[data-nav-id="${id}"]`)?.focus({ preventScroll: true }))
  },
  dropNode(id, targetId, pos: DropPosition) { report(moveNode(props.root, editAdapter, id, targetId, pos)) },
  dropDocument(path, targetId, pos: DropPosition) {
    const d = props.documents.find((x) => x.path === path)
    if (!d || props.root.kind !== 'root') return
    const node = docNode(d)
    props.root.items.push(node)                 // then placed like any other move; undone if it cannot go there
    const result = moveNode(props.root, editAdapter, node.id, targetId, pos)
    if (!report(result)) props.root.items.pop()
    else selectedId.value = node.id
  },
})

function onDocDragStart(e: DragEvent, path: string) {
  if (!e.dataTransfer) return
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', path)
  navDrag.kind = 'doc'
  navDrag.id = path
}

// the empty area below the rows: dropping there puts the entry at the end of the index
function onRootOver(e: DragEvent) {
  if (!navDrag.kind || (e.target as HTMLElement).closest('[data-nav-id]')) return
  e.preventDefault()
}
function onRootDrop(e: DragEvent) {
  if (!navDrag.kind || !navDrag.id || (e.target as HTMLElement).closest('[data-nav-id]')) return
  e.preventDefault()
  const kind = navDrag.kind
  const id = navDrag.id
  clearNavDrag()
  if (kind === 'node') report(moveNode(props.root, editAdapter, id, props.root.id, 'inside'))
  else { const d = props.documents.find((x) => x.path === id); if (d) addToEnd(d) }
}

function addToEnd(d: DocsDocument) {
  if (props.root.kind !== 'root') return
  const node = docNode(d)
  props.root.items.push(node)
  selectedId.value = node.id
  emit('change')
}

function insertionTarget(): EditNode & { items: EditNode[] } {
  const sel = selectedId.value ? find(selectedId.value)?.node : null
  if (sel && sel.kind === 'section') return sel
  return props.root as EditNode & { items: EditNode[] }
}

function addSection() {
  const title = prompt('Name of the section:', '')
  if (!title?.trim()) return
  const node: EditNode = { id: newEditId(), kind: 'section', title: title.trim(), items: [] }
  insertionTarget().items.push(node)
  selectedId.value = node.id
  emit('change')
}

function addLink() {
  const href = prompt('Address of the link (https://…):', 'https://')
  if (!href || !/^https?:\/\/\S+$/i.test(href.trim())) { if (href) message.value = 'A link must start with http:// or https://.'; return }
  const title = prompt('Text of the link:', href.trim()) ?? href.trim()
  const node: EditNode = { id: newEditId(), kind: 'link', href: href.trim(), title: title.trim() || href.trim() }
  insertionTarget().items.push(node)
  selectedId.value = node.id
  emit('change')
}
</script>
