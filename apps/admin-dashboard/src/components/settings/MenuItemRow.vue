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
        <button @click="editing = !editing" class="text-[16px] text-slate-500 hover:text-slate-300 shrink-0 w-4 text-center">{{ editing ? '▼' : '▶' }}</button>
        <div class="flex items-center gap-1.5 w-[200px]" @click="editing = !editing">
          <span class="text-[14px] text-slate-300 light:text-slate-700 truncate">{{ item.label }}</span>
          <span v-if="item.pageId" :class="['inline-block w-1.5 h-1.5 rounded-full shrink-0', pagePublished ? 'bg-emerald-400' : 'bg-amber-400']" :title="pagePublished ? 'Published' : 'Draft'"></span>
        </div>
        <div class="text-[14px] text-slate-500 font-mono truncate" @click="editing = !editing">/{{ item.path }}</div>
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
        <button @click="openLinkPage" class="text-[16px] text-indigo-400 hover:text-indigo-300 px-0.5" title="Link a page">🔗</button>
        <button @click="moveUp" :disabled="index === 0" class="text-[16px] text-slate-500 hover:text-slate-300 disabled:opacity-30 px-0.5">▲</button>
        <button @click="moveDown" :disabled="index === items.length - 1" class="text-[16px] text-slate-500 hover:text-slate-300 disabled:opacity-30 px-0.5">▼</button>
        <button @click="emitInsertBelow" class="text-[16px] text-indigo-400 hover:text-indigo-300 px-0.5">+</button>
        <button @click="$emit('remove')" class="text-[16px] text-rose-400 hover:text-rose-300 px-0.5">✕</button>
      </div>
    </div>

    <!-- Inline editor -->
<div v-if="editing" class="ml-6 p-2 rounded-md bg-slate-950/30 light:bg-white/30 border border-slate-800/40 light:border-slate-200/40 space-y-2 text-xs">
        <div>
          <label class="block text-[12px] font-semibold text-slate-500 mb-0.5">Label</label>
          <input v-model="editItem.label" type="text" class="w-full px-2 py-1 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
        </div>
        <div>
          <label class="block text-[12px] font-semibold text-slate-500 mb-0.5">Path</label>
          <div class="flex items-center gap-1">
            <span class="text-[12px] text-slate-500 font-mono shrink-0">/</span>
            <input v-model="editItem.path" type="text" placeholder="my-page-path" class="flex-1 px-2 py-1 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 font-mono text-[12px]" @input="validatePathUniqueness" />
          </div>
          <div v-if="pathConflict" class="text-[12px] text-rose-400 mt-0.5">Path already used within this group</div>
        </div>
        <div v-if="editItem.pageId" class="flex items-center gap-2">
          <span class="text-[12px] text-indigo-400 font-mono">Linked page: {{ editItem.pageId }}</span>
          <button @click="editItem.pageId = undefined; editItem.url = undefined" class="text-[12px] text-rose-400 hover:text-rose-300">Unlink</button>
        </div>
        <div class="flex gap-2">
          <div class="flex-1">
            <label class="block text-[12px] font-semibold text-slate-500 mb-0.5">External URL (optional)</label>
            <input v-model="editItem.url" type="text" placeholder="https://..." class="w-full px-2 py-1 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 font-mono text-[12px]" />
          </div>
        </div>
        <div class="flex justify-end gap-1">
          <button @click="editing = false" class="px-2 py-0.5 rounded text-[12px] font-semibold text-slate-400 hover:text-slate-200">Cancel</button>
          <button @click="saveEdit" :disabled="pathConflict" class="px-2 py-0.5 rounded text-[12px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50">Save</button>
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
import type { MenuItem } from '../../utils/menus-api'

const props = withDefaults(defineProps<{
  item: MenuItem
  depth: number
  index: number
  items: MenuItem[]
  itemPath?: number[]
  websiteId?: string
  websiteLocale?: string
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
const editing = ref(false)
const editItem = ref<MenuItem>({ ...props.item, path: props.item.path ?? '', children: [...(props.item.children || [])] })
const isDragOver = ref(false)
const dragSourceIndex = ref<number | null>(null)
const pathConflict = ref(false)

watch(() => props.item, (newItem) => {
  if (!editing.value) {
    editItem.value = { ...newItem, path: newItem.path ?? '', children: [...(newItem.children || [])] }
  }
}, { deep: true })

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

function emitInsertBelow() {
  emit('insert-below', [...props.itemPath, props.index])
}

function openLinkPage() {
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
    const updatedItem = { ...props.item, pageId, label: pageTitle }
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