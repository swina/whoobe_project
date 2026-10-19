<template>
  <div class="space-y-1">
    <div
      class="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-950/60 light:bg-white/60 border border-slate-800/60 light:border-slate-200/60 group justify-between"
      :style="{ marginLeft: depth * 16 + 'px' }"
      draggable="true"
      @dragstart="onDragStart"
      @dragover.prevent="onDragOver"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
      :class="{ 'ring-2 ring-indigo-500/50': isDragOver }"
    >
      <div class="flex justify-start min-w-0 gap-2 w-1/2">
        <button @click="editing = !editing" class="btn btn-link-muted shrink-0 w-4 text-center">{{ editing ? '▼' : '▶' }}</button>
        <div class="flex items-center gap-1.5 w-[200px]" @click="editing = !editing">
          <span class="text-[14px] text-slate-300 light:text-slate-700 truncate">{{ item.label }}</span>
          <span v-if="item.pageId" :class="['inline-block w-1.5 h-1.5 rounded-full shrink-0', pagePublished ? 'bg-emerald-400' : 'bg-amber-400']" :title="pagePublished ? 'Published' : 'Draft'"></span>
        </div>
        <div class="text-[14px] text-slate-500 font-mono truncate" @click="editing = !editing">/{{ displayPath }}</div>
        <span v-if="resolvedTemplateName" class="text-[10px] font-mono text-indigo-400 light:text-indigo-700 truncate shrink-0" title="Website template for this route">{{ resolvedTemplateName }}</span>
      </div>
      <div class="flex items-center gap-2 w-1/2 justify-start" @click="openLinkPage">
        <span v-if="item.pageId" class="text-[12px] w-[120px] text-indigo-400 font-mono shrink-0" :title="'ID: ' + item.pageId">
          {{ pageTitle || 'page' }}
        </span>
        <template v-if="linkedPage">
          <span class="text-slate-500 text-[11px] bg-sky-200 rounded-lg px-2 uppercase">{{ linkedPage.locale }}</span>
          <span class="text-slate-500 text-[11px]">{{ pageUpdatedText }}</span>
        </template>
      <span v-else-if="item.url" class="text-[12px] text-amber-400 font-mono shrink-0">url</span>
      <span v-else class="text-[12px] text-slate-600 font-mono shrink-0">unlinked</span>
      </div>
      <div class="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition cursor-pointer">
        <a v-if="previewUrl" :href="previewUrl" target="_blank" rel="noopener noreferrer" title="Preview this path" class="text-[16px] text-emerald-400 hover:text-emerald-300 px-0.5 no-underline">👁</a>
        <button v-if="item.pageId" @click.stop="editLinkedPage" class="btn btn-link" title="Edit the linked page" aria-label="Edit the linked page" data-testid="path-edit-page">✎</button>
        <button @click="openLinkPage" class="btn btn-link" title="Link a page">🔗</button>
        <button @click="moveUp" :disabled="index === 0" class="btn btn-link-muted">▲</button>
        <button @click="moveDown" :disabled="index === items.length - 1" class="btn btn-link-muted">▼</button>
        <button @click="emitInsertBelow" class="btn btn-link">+</button>
        <button @click="$emit('remove')" class="btn btn-link-danger">✕</button>
      </div>
    </div>

    <!-- Inline editor -->
<div v-if="editing" class="ml-6 p-2 rounded-md bg-slate-950/30 light:bg-white/30 border border-slate-800/40 light:border-slate-200/40 space-y-2 text-xs">
        <div>
          <label class="block text-[12px] font-semibold text-slate-500 mb-0.5">Label</label>
          <input v-model="editItem.label" type="text" class="field w-full" />
        </div>
        <div>
          <label class="block text-[12px] font-semibold text-slate-500 mb-0.5">Path</label>
          <div v-if="editItem.pageId" class="flex items-center gap-1">
            <span class="text-[12px] text-slate-500 font-mono shrink-0">/</span>
            <span class="flex-1 px-2 py-1 bg-slate-900 light:bg-slate-100 border border-slate-800 light:border-slate-200 rounded text-slate-400 light:text-slate-600 font-mono text-[12px]">{{ linkedPageSlug || '—' }}</span>
          </div>
          <div v-else class="flex items-center gap-1">
            <span class="text-[12px] text-slate-500 font-mono shrink-0">/</span>
            <input v-model="editItem.path" type="text" placeholder="my-page-path" class="field flex-1 font-mono" @input="validatePathUniqueness" />
          </div>
          <div v-if="editItem.pageId" class="text-[11px] text-slate-500 mt-0.5">Set automatically from the linked page's own URL - unlink the page to set a custom path.</div>
          <div v-if="pathConflict" class="text-[12px] text-rose-400 mt-0.5">Path already used within this group</div>
        </div>
        <div v-if="editItem.pageId" class="flex items-center gap-2">
          <span class="text-[12px] text-indigo-400 font-mono">Linked page: {{ editItem.pageId }}</span>
          <button @click="editItem.pageId = undefined; editItem.url = undefined; userUnlinked = true" class="btn btn-link-danger">Unlink</button>
        </div>
        <div class="flex gap-2">
          <div class="flex-1">
            <label class="block text-[12px] font-semibold text-slate-500 mb-0.5">External URL (optional)</label>
            <input v-model="editItem.url" type="text" placeholder="https://..." class="field w-full font-mono" />
          </div>
        </div>
        <div class="flex justify-end gap-1">
          <button @click="editing = false" class="btn btn-link-muted">Cancel</button>
          <button @click="saveEdit" :disabled="pathConflict" class="btn btn-primary btn-sm">Save</button>
        </div>
      </div>

    <!-- Children -->
    <div v-if="item.children?.length" class="space-y-1">
      <MenuItemRow
        v-for="(child, ci) in item.children"
        :key="ci"
        :item="child"
        :depth="depth + 1"
        :index="ci"
        :items="item.children"
        :item-path="[...props.itemPath, props.index]"
        :website-id="websiteId"
        :website-locale="websiteLocale"
        :resolve-template-for-item="resolveTemplateForItem"
        @update="handleChildUpdate"
        @remove="handleChildRemove(ci)"
        @insert-below="(path: number[]) => emit('insert-below', path)"
        @link-page="(path: number[]) => emit('link-page', path)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { usePagesStore } from '../../stores/pagesStore'
import { useWebsitesStore } from '../../stores/websitesStore'
import { useTabsStore } from '../../stores/tabsStore'
import type { MenuItem } from '../../utils/menus-api'
import { getSitePreviewBaseUrl } from '../../utils/editor-urls'

const props = withDefaults(defineProps<{
  item: MenuItem
  depth: number
  index: number
  items: MenuItem[]
  itemPath?: number[]
  websiteId?: string
  websiteLocale?: string
  /** Resolves the website template that applies to an item's path (set by
   *  MasterWebsiteTab); absent = no per-route template shown. */
  resolveTemplateForItem?: (item: MenuItem) => string | null
}>(), {
  websiteId: '',
  websiteLocale: 'en',
  itemPath: () => [],
})

const emit = defineEmits<{
  (e: 'update', payload: { index: number; item: MenuItem }): void
  (e: 'remove'): void
  (e: 'link-page', path: number[]): void
  (e: 'insert-below', path: number[]): void
}>()

const pagesStore = usePagesStore()
const websitesStore = useWebsitesStore()
const tabsStore = useTabsStore()

/** Opens the linked page in its own tab, on the editor. */
function editLinkedPage() {
  if (props.item.pageId) tabsStore.openPage(props.item.pageId, 'editor')
}
const editing = ref(false)
const editItem = ref<MenuItem>({ ...props.item, path: props.item.path ?? '', children: [...(props.item.children || [])] })
const isDragOver = ref(false)
const dragSourceIndex = ref<number | null>(null)
const pathConflict = ref(false)
const userUnlinked = ref(false)

watch(() => props.item, (newItem) => {
  if (!editing.value) {
    editItem.value = { ...newItem, path: newItem.path ?? '', children: [...(newItem.children || [])] }
  }
}, { deep: true })

watch(editing, (isEditing) => {
  if (isEditing) userUnlinked.value = false
})

const pagePublished = computed(() => {
  if (!props.item.pageId) return false
  const page = pagesStore.pages.find((p) => p.id === props.item.pageId)
  return page?.published ?? false
})

const pageTitle = computed(() => {
  if (!props.item.pageId) return ''
  const page = pagesStore.pages.find((p) => p.id === props.item.pageId)
  return page?.title || ''
})

// The linked page itself (a specific locale row) - shows the page's locale
// and last-modified date alongside the title in the row.
const linkedPage = computed(() => {
  if (!props.item.pageId) return null
  return pagesStore.pages.find((p) => p.id === props.item.pageId) ?? null
})

const pageUpdatedText = computed(() => {
  if (!linkedPage.value?.updatedAt) return ''
  return new Date(linkedPage.value.updatedAt).toLocaleDateString()
})

// A linked item's real, reachable path is always the linked page's own
// current slug (see previewUrl below, and GET /public/page/* server-side) -
// resolved live here, in the picker's onPageSelected, and in this row's own
// drag-drop handler, rather than trusted from a possibly-stale item.path,
// which self-heals a page whose slug changed after it was linked.
const linkedPageSlug = computed(() => {
  const slug = props.item.pageId ? pagesStore.pages.find((p) => p.id === props.item.pageId)?.slug : null
  return slug ? slug.replace(/^\//, '') : ''
})

const displayPath = computed(() => (props.item.pageId ? (linkedPageSlug.value || props.item.path) : props.item.path))

const resolvedTemplateName = computed(() => (props.resolveTemplateForItem ? props.resolveTemplateForItem(props.item) : null))

function emitInsertBelow() {
  emit('insert-below', [...props.itemPath, props.index])
}

// Preview opens the path in whoobe-one-spike's public renderer. A linked
// page's routable slug is preferred; otherwise the menu path, prefixed
// with '/'. Clean /{rootPath}/{slug} format — no query params (SEO-friendly).
// The server auto-detects rootPath from the first path segment and resolves
// the page's locale from the DB record.
const previewUrl = computed(() => {
  let target: string | null = null
  if (props.item.pageId) {
    const slug = pagesStore.pages.find((p) => p.id === props.item.pageId)?.slug
    if (slug) target = slug.startsWith('/') ? slug : '/' + slug
  }
  if (!target) {
    const path = props.item.path?.trim()
    if (!path) return null
    target = path.startsWith('/') ? path : '/' + path
  }
  const website = props.websiteId ? websitesStore.websites.find((w) => w.id === props.websiteId) : undefined
  const rootPath = website?.rootPath || ''
  // Root page (slug '/') maps to just /{rootPath}
  const url = target === '/'
    ? `${getSitePreviewBaseUrl()}${rootPath || '/'}`
    : `${getSitePreviewBaseUrl()}${rootPath}${target}`
  return url
})

function openLinkPage() {
  // Close any pending inline edit to avoid saveEdit() racing with the
  // page-linking optimistic update that runs after the picker closes.
  editing.value = false
  emit('link-page', [...props.itemPath, props.index])
}

function validatePathUniqueness() {
  pathConflict.value = false
  const newPath = editItem.value.path?.trim()
  if (!newPath) return
  const checkNodes = (nodes: MenuItem[]): boolean => {
    for (let i = 0; i < nodes.length; i++) {
      if (i !== props.index && nodes[i].path?.trim() === newPath) return true
      if (nodes[i].children?.length && checkNodes(nodes[i].children!)) return true
    }
    return false
  }
  pathConflict.value = checkNodes(props.items)
}

function saveEdit() {
  const item = { ...editItem.value, children: editItem.value.children }
  item.path = item.path?.trim() || undefined
  if (!userUnlinked.value) {
    if (props.item.pageId && !item.pageId) item.pageId = props.item.pageId
    if (props.item.url && !item.url) item.url = props.item.url
  }
  // The path field is read-only in the editor while linked (see template),
  // but re-derive it here too rather than trust whatever was last stored -
  // self-heals a linked page whose slug changed since this item was linked.
  if (item.pageId && linkedPageSlug.value) {
    item.path = linkedPageSlug.value
  }
  emit('update', { index: props.index, item })
  editing.value = false
}

function moveUp() {
  if (props.index === 0) return
  const items = [...props.items]
  const temp = items[props.index]
  items[props.index] = items[props.index - 1]
  items[props.index - 1] = temp
  items.forEach((item, i) => {
    emit('update', { index: i, item })
  })
}

function moveDown() {
  if (props.index >= props.items.length - 1) return
  const items = [...props.items]
  const temp = items[props.index]
  items[props.index] = items[props.index + 1]
  items[props.index + 1] = temp
  items.forEach((item, i) => {
    emit('update', { index: i, item })
  })
}

function handleChildUpdate(payload: { index: number; item: MenuItem }) {
  const children = [...(editItem.value.children || [])]
  children[payload.index] = payload.item
  editItem.value = { ...editItem.value, children }
  if (!editing.value) {
    emit('update', { index: props.index, item: editItem.value })
  }
}

function handleChildRemove(index: number) {
  const children = [...(editItem.value.children || [])]
  children.splice(index, 1)
  editItem.value = { ...editItem.value, children }
  emit('update', { index: props.index, item: editItem.value })
}

// --- Drag and drop ---
function onDragStart(e: DragEvent) {
  if (!e.dataTransfer) return
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(props.index))
  e.dataTransfer.setData('application/menu-depth', String(props.depth))
  dragSourceIndex.value = props.index
}

function onDragOver(e: DragEvent) {
  if (dragSourceIndex.value === null) return
  isDragOver.value = true
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function onDragLeave() {
  isDragOver.value = false
}

function onDrop(e: DragEvent) {
  isDragOver.value = false
  if (!e.dataTransfer) {
    dragSourceIndex.value = null
    return
  }

  // Check if this is a page being dropped from the picker
  const pageId = e.dataTransfer.getData('application/page-id')
  if (pageId) {
    const pageTitle = e.dataTransfer.getData('application/page-title') || 'Linked Page'
    const pageSlug = e.dataTransfer.getData('application/page-slug') || ''
    const updatedItem = { ...props.item, pageId, label: pageTitle, path: pageSlug ? pageSlug.replace(/^\//, '') : props.item.path }
    emit('update', { index: props.index, item: updatedItem })
    dragSourceIndex.value = null
    return
  }

  // Otherwise, it's a tree reorder
  const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10)
  if (isNaN(fromIndex) || fromIndex === props.index) {
    dragSourceIndex.value = null
    return
  }
  const items = [...props.items]
  const [moved] = items.splice(fromIndex, 1)
  items.splice(props.index, 0, moved)
  items.forEach((item, i) => {
    emit('update', { index: i, item })
  })
  dragSourceIndex.value = null
}
</script>