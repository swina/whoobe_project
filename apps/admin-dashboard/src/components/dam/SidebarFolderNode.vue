<template>
  <div class="space-y-1">
    <!-- Folder Row -->
    <div
      @click="onSelectFolder"
      :class="[
        'flex items-center px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition select-none group',
        currentPath === folder.path
          ? 'bg-indigo-600/30 text-indigo-200 light:bg-indigo-600/30 light:text-indigo-800 border border-indigo-500/40 font-bold shadow-sm'
          : 'text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 hover:bg-slate-800/40 light:bg-slate-100/40'
      ]"
      :style="{ paddingLeft: `${depth * 12 + 8}px` }"
    >
      <!-- Expand/Collapse Chevron -->
      <button
        v-if="hasChildren"
        @click.stop="isOpen = !isOpen"
        class="p-0.5 rounded text-slate-500 hover:text-slate-200 light:text-slate-800 transition mr-1 shrink-0"
      >
        <ChevronDown v-if="isOpen" class="w-3 h-3 text-indigo-400" />
        <ChevronRight v-else class="w-3 h-3 text-slate-500" />
      </button>
      <span v-else class="w-4 mr-1 shrink-0"></span>

      <!-- Folder Icon -->
      <component
        :is="isOpen && hasChildren ? FolderOpen : Folder"
        :class="[
          'w-3.5 h-3.5 mr-1.5 shrink-0 transition-colors',
          currentPath === folder.path ? 'text-indigo-400' : 'text-slate-400 light:text-slate-600 group-hover:text-indigo-300'
        ]"
      />

      <!-- Folder Name -->
      <span class="truncate flex-1" :title="folder.name">{{ folder.name }}</span>

      <!-- Visibility Dot Indicator -->
      <span
        :class="[
          'w-1.5 h-1.5 rounded-full shrink-0 ml-1',
          folder.isPublic ? 'bg-emerald-400' : 'bg-amber-400'
        ]"
        :title="folder.isPublic ? 'PUBLIC Folder' : 'PRIVATE Folder'"
      ></span>
    </div>

    <!-- Child Subfolders -->
    <div v-if="isOpen && hasChildren" class="space-y-1">
      <SidebarFolderNode
        v-for="child in children"
        :key="child.path"
        :folder="child"
        :all-folders="allFolders"
        :current-path="currentPath"
        :depth="depth + 1"
        @select="(path) => $emit('select', path)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Folder, FolderOpen, ChevronRight, ChevronDown } from '@lucide/vue'
import { FolderItem } from '../../stores/damStore'

const props = withDefaults(
  defineProps<{
    folder: FolderItem
    allFolders: FolderItem[]
    currentPath: string
    depth?: number
  }>(),
  {
    depth: 0
  }
)

const emit = defineEmits<{
  (e: 'select', path: string): void
}>()

const isOpen = ref(true)

const children = computed(() => {
  return props.allFolders.filter((f) => f.parentPath === props.folder.path)
})

const hasChildren = computed(() => children.value.length > 0)

function onSelectFolder() {
  emit('select', props.folder.path)
}
</script>
