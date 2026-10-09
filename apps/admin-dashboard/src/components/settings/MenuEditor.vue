<template>
  <BaseModal :open="true" size="lg" @close="$emit('close')">
    <template #header>
      <div class="min-w-0">
      <h2 class="ui-modal-title">Path Groups — {{ websiteName }}</h2>
      <p class="ui-modal-subtitle">Create and manage navigation path groups for this website.</p>
    </div>
    </template>
    <div class="space-y-4">
        <div class="space-y-4">
        <div v-if="pathsStore.isLoading && pathsStore.paths.length === 0" class="text-xs text-slate-500 text-center py-4">Loading path groups…</div>

        <div v-else-if="pathsStore.paths.length === 0" class="text-xs text-slate-500 text-center py-4 italic">No path groups yet for this website.</div>

        <div v-for="pg in pathsStore.paths" :key="pg.id" class="rounded-lg border border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-white/40 overflow-hidden">
          <div class="flex items-center justify-between px-3 py-2 border-b border-slate-800/60 light:border-slate-200/60 bg-slate-950/60 light:bg-white/60">
            <span class="text-xs font-semibold text-slate-200 light:text-slate-800">{{ pg.name }}</span>
            <div class="flex items-center gap-2">
              <button @click="addRootItem(pg)" class="btn btn-link">+ Add item</button>
              <button @click="renamePathGroup(pg)" class="btn btn-link-muted">Rename</button>
              <button @click="deletePathGroup(pg)" class="btn btn-link-danger">Delete</button>
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
          <button @click="createPathGroup" class="btn btn-primary">+ New Path Group</button>
        </div>
      </div>

    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseModal from '../ui/BaseModal.vue'
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