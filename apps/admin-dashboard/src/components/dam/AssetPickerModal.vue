<template>
  <div v-if="isOpen" class="fixed inset-0 bg-slate-950/80 light:bg-white/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <div class="bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 rounded-2xl w-full max-w-3xl h-[32rem] flex flex-col shadow-2xl">
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-800 light:border-slate-200 shrink-0">
        <h3 class="text-base font-bold text-slate-100 light:text-slate-900 flex items-center gap-2">
          <ImageIcon class="w-4 h-4 text-indigo-400" />
          Choose Asset
          <span v-if="filter && filter !== 'any'" class="px-2 py-0.5 text-[10px] font-bold rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 uppercase">{{ ASSET_CATEGORY_LABELS[filter] }}</span>
        </h3>
        <button @click="emit('close')" class="text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 transition text-sm">✕</button>
      </div>

      <div class="flex-1 min-h-0 flex">
        <!-- Folder tree -->
        <div class="w-48 shrink-0 border-r border-slate-800 light:border-slate-200 overflow-y-auto p-2 space-y-1">
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

        <!-- Search + asset grid -->
        <div class="flex-1 min-w-0 flex flex-col">
          <div class="p-3 border-b border-slate-800 light:border-slate-200 shrink-0">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search by filename..."
              class="w-full px-3 py-1.5 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div class="flex-1 min-h-0 overflow-y-auto p-3">
            <div v-if="visibleAssets.length === 0" class="text-xs text-slate-500 italic p-4 text-center">
              No matching assets in this folder.
            </div>
            <div v-else class="grid grid-cols-4 gap-3">
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
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// A compact "pick one DAM asset" modal for asset/image/video Data Object
// fields (DataObjectFieldControl.vue via AssetFieldPicker.vue). Reuses
// SidebarFolderNode.vue directly (self-contained, no AssetsView coupling)
// for the folder tree; the thumbnail/icon-fallback grid pattern is
// adapted from AssetsView.vue's own main grid. Browses its own local
// `browsePath`, deliberately independent of damStore.currentFolderPath -
// AssetsView.vue may already be open as a background tab (DashboardLayout
// keeps every tab mounted), and driving the shared store's folder
// position from here would silently move that tab's view too.
import { ref, computed } from 'vue'
import { Folder, Image as ImageIcon } from '@lucide/vue'
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

const rootSubfolders = computed(() => damStore.folders.filter((f) => f.parentPath === '/'))

const visibleAssets = computed(() => {
  const inFolder = damStore.assets.filter((a) => a.folderPath === browsePath.value)
  const byCategory = filterAssetsByCategory(inFolder, props.filter)
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return byCategory
  return byCategory.filter((a) => a.filename.toLowerCase().includes(query))
})
</script>
