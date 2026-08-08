<template>
  <div class="space-y-1">
    <div class="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-950/60 light:bg-white/60 border border-slate-800/60 light:border-slate-200/60 group" :style="{ marginLeft: depth * 16 + 'px' }">
      <button @click="editing = !editing" class="text-[10px] text-slate-500 hover:text-slate-300 shrink-0 w-4 text-center">{{ editing ? '▼' : '▶' }}</button>
      <span class="text-xs text-slate-300 light:text-slate-700 min-w-0 flex-1 truncate">{{ item.label }}</span>
      <span v-if="item.pageId" class="text-[10px] text-indigo-400 font-mono shrink-0">page</span>
      <span v-else-if="item.url" class="text-[10px] text-amber-400 font-mono shrink-0">url</span>
      <div class="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
        <button @click="moveUp" :disabled="index === 0" class="text-[10px] text-slate-500 hover:text-slate-300 disabled:opacity-30 px-0.5">▲</button>
        <button @click="moveDown" :disabled="index === items.length - 1" class="text-[10px] text-slate-500 hover:text-slate-300 disabled:opacity-30 px-0.5">▼</button>
        <button @click="$emit('add-child')" class="text-[10px] text-indigo-400 hover:text-indigo-300 px-0.5">+</button>
        <button @click="$emit('remove')" class="text-[10px] text-rose-400 hover:text-rose-300 px-0.5">✕</button>
      </div>
    </div>

    <!-- Inline editor -->
    <div v-if="editing" class="ml-6 p-2 rounded-md bg-slate-950/30 light:bg-white/30 border border-slate-800/40 light:border-slate-200/40 space-y-2 text-xs">
      <div>
        <label class="block text-[10px] font-semibold text-slate-500 mb-0.5">Label</label>
        <input v-model="editItem.label" type="text" class="w-full px-2 py-1 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
      </div>
      <div class="flex gap-2">
        <div class="flex-1">
          <label class="block text-[10px] font-semibold text-slate-500 mb-0.5">Linked Page ID (optional)</label>
          <input v-model="editItem.pageId" type="text" placeholder="page-uuid" class="w-full px-2 py-1 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 font-mono text-[10px]" />
        </div>
        <div class="flex-1">
          <label class="block text-[10px] font-semibold text-slate-500 mb-0.5">External URL (optional)</label>
          <input v-model="editItem.url" type="text" placeholder="https://..." class="w-full px-2 py-1 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 font-mono text-[10px]" />
        </div>
      </div>
      <div class="flex justify-end gap-1">
        <button @click="editing = false" class="px-2 py-0.5 rounded text-[10px] font-semibold text-slate-400 hover:text-slate-200">Cancel</button>
        <button @click="saveEdit" class="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white">Save</button>
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
        @update="handleChildUpdate"
        @remove="handleChildRemove(ci)"
        @add-child="handleAddChild"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { MenuItem } from '../../utils/menus-api'

const props = defineProps<{
  item: MenuItem
  depth: number
  index: number
  items: MenuItem[]
}>()

const emit = defineEmits<{
  (e: 'update', payload: { index: number; item: MenuItem }): void
  (e: 'remove'): void
  (e: 'add-child'): void
}>()

const editing = ref(false)
const editItem = ref<MenuItem>({ ...props.item, children: [...(props.item.children || [])] })

function saveEdit() {
  emit('update', { index: props.index, item: { ...editItem.value, children: editItem.value.children } })
  editing.value = false
}

function moveUp() {
  if (props.index === 0) return
  const items = [...props.items]
  const temp = items[props.index]
  items[props.index] = items[props.index - 1]
  items[props.index - 1] = temp
  // Trigger a full reorder by emitting the change to the parent
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

function handleAddChild() {
  const children = [...(editItem.value.children || []), { label: 'New Item', children: [] }]
  editItem.value = { ...editItem.value, children }
  emit('update', { index: props.index, item: editItem.value })
}
</script>