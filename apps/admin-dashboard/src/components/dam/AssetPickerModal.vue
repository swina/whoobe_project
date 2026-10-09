<template>
  <div v-if="isOpen" class="fixed inset-0 bg-slate-950/80 light:bg-white/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <div class="bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 rounded-2xl w-full max-w-4xl h-[36rem] flex flex-col shadow-2xl">
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-800 light:border-slate-200 shrink-0">
        <h3 class="text-base font-bold text-slate-100 light:text-slate-900 flex items-center gap-2">
          <ImageIcon class="w-4 h-4 text-indigo-400" />
          Choose Asset
          <span v-if="filter && filter !== 'any'" class="px-2 py-0.5 text-[10px] font-bold rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 uppercase">{{ ASSET_CATEGORY_LABELS[filter] }}</span>
        </h3>
        <div class="flex items-center gap-2">
          <button @click="viewMode = viewMode === 'grid' ? 'list' : 'grid'" class="btn btn-secondary light:hover:bg-slate-200" :title="viewMode === 'grid' ? 'List view' : 'Grid view'">
            <component :is="viewMode === 'grid' ? List : Grid" class="w-4 h-4" />
          </button>
          <button @click="emit('close')" class="btn btn-link-muted">✕</button>
        </div>
      </div>

      <div class="flex-1 min-h-0 flex flex-row-reverse">
        <!-- Folder tree (right panel) -->
        <div class="w-52 shrink-0 border-l border-slate-800 light:border-slate-200 overflow-y-auto p-3 space-y-1">
          <div
            @click="browsePath = '/'"
            :class="[
              'flex items-center px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition select-none',
              browsePath === '/'
                ? 'bg-indigo-600/30 text-indigo-200 light:text-indigo-700 border border-indigo-500/40 font-bold shadow-sm'
                : 'text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 hover:bg-slate-800/40 light:hover:bg-slate-100/40'
            ]"
          >
            <Folder class="w-3.5 h-3.5 mr-1.5 text-indigo-400 shrink-0" />
            <span class="truncate">/ (Root)</span>
          </div>
          <SidebarFolderNode
            v-for="folder in rootSubfolders"
            :key="folder.path"
            :folder="folder"
            :all-folders="damStore.folders"
            :current-path="browsePath"
            @select="(path) => (browsePath = path)"
          />
        </div>

        <!-- Search + asset grid/list (left panel, main area) -->
        <div class="flex-1 min-w-0 flex flex-col">
          <div class="p-3 border-b border-slate-800 light:border-slate-200 shrink-0">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search by filename..."
              class="field w-full"
            />
          </div>
          <div class="flex-1 min-h-0 overflow-y-auto p-3">
            <div v-if="visibleAssets.length === 0" class="text-xs text-slate-500 italic p-4 text-center">
              No matching assets in this folder.
            </div>

            <!-- Grid view -->
            <div v-else-if="viewMode === 'grid'" class="grid grid-cols-4 gap-3">
              <button
                v-for="asset in visibleAssets"
                :key="asset.id"
                type="button"
                @click="emit('select', asset)"
                class="group flex flex-col items-center gap-1.5 p-2 rounded-lg border border-slate-800 light:border-slate-200 hover:border-indigo-500 transition text-left"
              >
                <div class="w-full aspect-square rounded-md bg-slate-950 light:bg-slate-50 flex items-center justify-center overflow-hidden">
                  <img
                    v-if="PREVIEWABLE_IMAGE_TYPES.includes(asset.fileType)"
                    :src="asset.dataUrl || asset.thumbnailUrl || asset.url"
                    :alt="asset.filename"
                    class="w-full h-full object-cover"
                  />
                  <component :is="getIconForFileType(asset.fileType)" v-else class="w-6 h-6 text-slate-500 group-hover:text-indigo-400 transition" />
                </div>
                <span class="text-[11px] text-slate-400 light:text-slate-600 group-hover:text-slate-200 light:group-hover:text-slate-800 truncate w-full text-center">{{ asset.filename }}</span>
              </button>
            </div>

            <!-- List view -->
            <div v-else class="space-y-1">
              <button
                v-for="asset in visibleAssets"
                :key="asset.id"
                type="button"
                @click="emit('select', asset)"
                class="group flex items-center gap-3 w-full px-3 py-2 rounded-lg border border-transparent hover:border-slate-700 light:hover:border-slate-300 hover:bg-slate-800/40 light:hover:bg-slate-100/40 transition text-left"
              >
                <div class="w-10 h-10 rounded-lg bg-slate-950 light:bg-slate-50 flex items-center justify-center overflow-hidden shrink-0 border border-slate-800 light:border-slate-200">
                  <img
                    v-if="PREVIEWABLE_IMAGE_TYPES.includes(asset.fileType)"
                    :src="asset.dataUrl || asset.thumbnailUrl || asset.url"
                    :alt="asset.filename"
                    class="w-full h-full object-cover"
                  />
                  <component :is="getIconForFileType(asset.fileType)" v-else class="w-4 h-4 text-slate-500" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-xs font-medium text-slate-200 light:text-slate-800 truncate">{{ asset.filename }}</div>
                  <div class="text-[10px] text-slate-500 flex items-center gap-2">
                    <span>{{ asset.fileType }}</span>
                    <span>{{ asset.sizeFormatted }}</span>
                  </div>
                </div>
                <div class="text-[10px] text-slate-500 font-mono shrink-0">{{ asset.pimcorePath }}</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Folder, Image as ImageIcon, Grid, List } from '@lucide/vue'
import { useDamStore, type AssetItem } from '../../stores/damStore'
import { PREVIEWABLE_IMAGE_TYPES, getIconForFileType } from '../../utils/asset-file-icons'
import { filterAssetsByCategory, ASSET_CATEGORY_LABELS, type AssetCategoryFilter } from '../../utils/asset-category'
import SidebarFolderNode from './SidebarFolderNode.vue'

const props = defineProps<{
  isOpen: boolean
  filter?: AssetCategoryFilter
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', asset: AssetItem): void
}>()

const damStore = useDamStore()
const browsePath = ref('/')
const searchQuery = ref('')
const viewMode = ref<'grid' | 'list'>('grid')

const rootSubfolders = computed(() => damStore.folders.filter((f) => f.parentPath === '/'))

const visibleAssets = computed(() => {
  const inFolder = damStore.assets.filter((a) => a.folderPath === browsePath.value)
  const byCategory = filterAssetsByCategory(inFolder, props.filter)
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return byCategory
  return byCategory.filter((a) => a.filename.toLowerCase().includes(query))
})
</script>