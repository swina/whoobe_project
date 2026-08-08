<template>
  <div class="fixed inset-0 z-[10001] bg-black/40 flex items-center justify-center" @click.self="$emit('close')">
    <div class="bg-slate-900 light:bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[85vh] border border-slate-800 light:border-slate-200">
      <div class="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 light:border-slate-200 shrink-0">
        <div>
          <span class="text-sm font-semibold text-slate-200 light:text-slate-800">Menus — {{ websiteName }}</span>
          <p class="text-[10px] text-slate-500 mt-0.5">Create and manage navigation menus for this website.</p>
        </div>
        <button class="text-xs text-slate-400 hover:text-slate-200" @click="$emit('close')">✕</button>
      </div>

      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <div v-if="menusStore.isLoading && menusStore.menus.length === 0" class="text-xs text-slate-500 text-center py-4">Loading menus…</div>

        <div v-else-if="menusStore.menus.length === 0" class="text-xs text-slate-500 text-center py-4 italic">No menus yet for this website.</div>

        <div v-for="menu in menusStore.menus" :key="menu.id" class="rounded-lg border border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-white/40 overflow-hidden">
          <div class="flex items-center justify-between px-3 py-2 border-b border-slate-800/60 light:border-slate-200/60 bg-slate-950/60 light:bg-white/60">
            <span class="text-xs font-semibold text-slate-200 light:text-slate-800">{{ menu.name }}</span>
            <div class="flex items-center gap-2">
              <button @click="addRootItem(menu)" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300">+ Add item</button>
              <button @click="renameMenu(menu)" class="text-xs text-slate-400 hover:text-slate-200">Rename</button>
              <button @click="deleteMenu(menu)" class="text-xs font-semibold text-rose-400 hover:text-rose-300">Delete</button>
            </div>
          </div>
          <div v-if="menu.items.length" class="p-2 space-y-1">
            <MenuItemRow
              v-for="(item, i) in menu.items"
              :key="i"
              :item="item"
              :depth="0"
              :index="i"
              :items="menu.items"
              @update="updateItem(menu, $event)"
              @remove="removeItem(menu, i)"
              @add-child="addChildItem(menu, i)"
            />
          </div>
          <div v-else class="p-4 text-center text-[10px] text-slate-600 italic">No items. Click "+ Add item" to create one.</div>
        </div>

        <div class="flex justify-center pt-2">
          <button @click="createMenu" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white">+ New Menu</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useMenusStore } from '../../stores/menusStore'
import type { MenuItem, MenuRecord } from '../../utils/menus-api'
import MenuItemRow from './MenuItemRow.vue'

const props = defineProps<{
  websiteId: string
  websiteName: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const menusStore = useMenusStore()

onMounted(() => menusStore.refreshMenus(props.websiteId))

async function createMenu() {
  const name = prompt('Menu name:', 'Main Menu')
  if (!name?.trim()) return
  try {
    await menusStore.create({ websiteId: props.websiteId, name: name.trim() })
  } catch (e: any) {
    alert(e?.message || 'Failed to create menu')
  }
}

async function renameMenu(menu: MenuRecord) {
  const name = prompt('Rename menu:', menu.name)
  if (!name?.trim() || name.trim() === menu.name) return
  try {
    await menusStore.update(menu.id, { name: name.trim() })
  } catch (e: any) {
    alert(e?.message || 'Failed to rename menu')
  }
}

async function deleteMenu(menu: MenuRecord) {
  if (!confirm(`Delete menu "${menu.name}"?`)) return
  try {
    await menusStore.remove(menu.id)
  } catch (e: any) {
    alert(e?.message || 'Failed to delete menu')
  }
}

function addRootItem(menu: MenuRecord) {
  const items = [...menu.items, { label: 'New Item', children: [] }]
  updateMenuItems(menu, items)
}

function addChildItem(menu: MenuRecord, parentIndex: number) {
  const items = [...menu.items]
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
  updateMenuItems(menu, items)
}

function updateItem(menu: MenuRecord, payload: { index: number; item: MenuItem }) {
  const items = [...menu.items]
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
  updateMenuItems(menu, items)
}

function removeItem(menu: MenuRecord, index: number) {
  const items = [...menu.items]
  items.splice(index, 1)
  updateMenuItems(menu, items)
}

async function updateMenuItems(menu: MenuRecord, items: MenuItem[]) {
  try {
    await menusStore.update(menu.id, { items })
  } catch (e: any) {
    alert(e?.message || 'Failed to update menu')
  }
}
</script>