<template>
  <div class="fixed inset-0 z-[10001] bg-black/40 flex items-center justify-center" @click.self="$emit('close')">
    <div class="bg-slate-900 light:bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[85vh] border border-slate-800 light:border-slate-200">
      <div class="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 light:border-slate-200 shrink-0">
        <div>
          <span class="text-sm font-semibold text-slate-200 light:text-slate-800">Path Groups — {{ websiteName }}</span>
          <p class="text-[10px] text-slate-500 mt-0.5">Create and manage navigation path groups for this website.</p>
        </div>
        <button class="text-xs text-slate-400 hover:text-slate-200" @click="$emit('close')">✕</button>
      </div>

      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <div v-if="pathsStore.isLoading && pathsStore.paths.length === 0" class="text-xs text-slate-500 text-center py-4">Loading path groups…</div>

        <div v-else-if="pathsStore.paths.length === 0" class="text-xs text-slate-500 text-center py-4 italic">No path groups yet for this website.</div>

        <div v-for="pg in pathsStore.paths" :key="pg.id" class="rounded-lg border border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-white/40 overflow-hidden">
          <div class="flex items-center justify-between px-3 py-2 border-b border-slate-800/60 light:border-slate-200/60 bg-slate-950/60 light:bg-white/60">
            <span class="text-xs font-semibold text-slate-200 light:text-slate-800">{{ pg.name }}</span>
            <div class="flex items-center gap-2">
              <button @click="addRootItem(pg)" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300">+ Add item</button>
              <button @click="renamePathGroup(pg)" class="text-xs text-slate-400 hover:text-slate-200">Rename</button>
              <button @click="deletePathGroup(pg)" class="text-xs font-semibold text-rose-400 hover:text-rose-300">Delete</button>
            </div>
          </div>
          <div v-if="pg.items.length" class="p-2 space-y-1">
            <MenuItemRow
              v-for="(item, i) in pg.items"
              :key="i"
              :item="item"
              :depth="0"
              :index="i"
              :items="pg.items"
              @update="updateItem(pg, $event)"
              @remove="removeItem(pg, i)"
              @add-child="addChildItem(pg, i)"
            />
          </div>
          <div v-else class="p-4 text-center text-[10px] text-slate-600 italic">No items. Click "+ Add item" to create one.</div>
        </div>

        <div class="flex justify-center pt-2">
          <button @click="createPathGroup" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white">+ New Path Group</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { usePathStore } from '../../stores/menusStore'
import type { MenuItem, WebsitePathRecord } from '../../utils/menus-api'
import MenuItemRow from './MenuItemRow.vue'

const props = defineProps<{
  websiteId: string
  websiteName: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const pathsStore = usePathStore()

onMounted(() => pathsStore.refreshPaths(props.websiteId))

async function createPathGroup() {
  const name = prompt('Path group name:', 'Main Navigation')
  if (!name?.trim()) return
  try {
    await pathsStore.create({ websiteId: props.websiteId, name: name.trim() })
  } catch (e: any) {
    alert(e?.message || 'Failed to create path group')
  }
}

async function renamePathGroup(pathGroup: WebsitePathRecord) {
  const name = prompt('Rename path group:', pathGroup.name)
  if (!name?.trim() || name.trim() === pathGroup.name) return
  try {
    await pathsStore.update(pathGroup.id, { name: name.trim() })
  } catch (e: any) {
    alert(e?.message || 'Failed to rename path group')
  }
}

async function deletePathGroup(pathGroup: WebsitePathRecord) {
  if (!confirm(`Delete path group "${pathGroup.name}"?`)) return
  try {
    await pathsStore.remove(pathGroup.id)
  } catch (e: any) {
    alert(e?.message || 'Failed to delete path group')
  }
}

function addRootItem(pathGroup: WebsitePathRecord) {
  const items = [...pathGroup.items, { label: 'New Item', children: [] }]
  updatePathItems(pathGroup, items)
}

function addChildItem(pathGroup: WebsitePathRecord, parentIndex: number) {
  const items = [...pathGroup.items]
  const addChild = (nodes: MenuItem[], idx: number): boolean => {
    if (idx === 0) {
      nodes.push({ label: 'New Item', children: [] })
      return true
    }
    const [head, ...rest] = nodes
    if (rest.length > 0) return addChild(rest, idx - 1)
    return false
  }
  addChild(items, parentIndex)
  updatePathItems(pathGroup, items)
}

function updateItem(pathGroup: WebsitePathRecord, payload: { index: number; item: MenuItem }) {
  const items = [...pathGroup.items]
  const updateRecursive = (nodes: MenuItem[], idx: number): boolean => {
    if (idx === 0) {
      nodes.splice(0, 1, payload.item)
      return true
    }
    const [head, ...rest] = nodes
    if (rest.length > 0) return updateRecursive(rest, idx - 1)
    return false
  }
  updateRecursive(items, payload.index)
  updatePathItems(pathGroup, items)
}

function removeItem(pathGroup: WebsitePathRecord, index: number) {
  const items = [...pathGroup.items]
  items.splice(index, 1)
  updatePathItems(pathGroup, items)
}

async function updatePathItems(pathGroup: WebsitePathRecord, items: MenuItem[]) {
  try {
    await pathsStore.update(pathGroup.id, { items })
  } catch (e: any) {
    alert(e?.message || 'Failed to update path group')
  }
}
</script>