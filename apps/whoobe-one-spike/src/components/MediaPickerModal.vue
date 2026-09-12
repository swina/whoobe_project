<template>
  <div class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center" @click.self="$emit('close')">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[36rem] flex flex-col overflow-hidden">
      <div class="flex items-center gap-2 px-4 py-3 border-b shrink-0">
        <ImageIcon class="w-4 h-4 text-indigo-500 shrink-0" />
        <span class="text-sm font-semibold text-gray-700">Browse assets</span>
        <span class="text-xs text-gray-400 font-mono truncate hidden sm:inline">{{ currentFolderPath }}</span>
        <div class="flex-1"></div>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search assets..."
          class="w-44 text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 border border-gray-300 text-gray-700 placeholder-gray-400 focus:outline-none focus:border-indigo-400"
        />
        <button
          @click="viewMode = viewMode === 'grid' ? 'list' : 'grid'"
          class="p-1.5 rounded-lg text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-600 border border-gray-300 transition"
          :title="viewMode === 'grid' ? 'List view' : 'Grid view'"
        >
          <component :is="viewMode === 'grid' ? List : Grid" class="w-4 h-4" />
        </button>
        <button class="flex items-center gap-1 text-gray-400 hover:text-gray-700 text-xs" @click="$emit('close')"><X class="w-3.5 h-3.5" /> Close</button>
      </div>

      <div class="flex-1 min-h-0 flex flex-row-reverse">
        <div class="w-48 shrink-0 border-l border-gray-200 overflow-y-auto p-2 space-y-1 bg-gray-50/50">
          <div
            @click="currentFolderPath = '/'"
            class="flex items-center px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition select-none text-gray-500 hover:text-gray-800 hover:bg-gray-200/60"
            :class="currentFolderPath === '/' ? 'bg-indigo-100 text-indigo-700 font-semibold' : ''"
          >
            <Folder class="w-3.5 h-3.5 mr-1.5 text-indigo-400 shrink-0" />
            <span class="truncate">/ (Root)</span>
          </div>
          <div
            v-for="item in folderTree"
            :key="item.path"
            :style="{ paddingLeft: `${item.depth * 14 + 8}px` }"
            class="flex items-center gap-0.5"
          >
            <button
              v-if="item.hasChildren"
              @click.stop="toggleExpanded(item.path)"
              class="p-0.5 rounded text-gray-400 hover:text-gray-700 shrink-0"
            >
              <ChevronDown v-if="isExpanded(item.path)" class="w-3 h-3" />
              <ChevronRight v-else class="w-3 h-3" />
            </button>
            <span v-else class="w-4 shrink-0"></span>
            <div
              @click="currentFolderPath = item.path"
              class="flex items-center flex-1 min-w-0 px-1 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition select-none text-gray-500 hover:text-gray-800 hover:bg-gray-200/60"
              :class="currentFolderPath === item.path ? 'bg-indigo-100 text-indigo-700 font-semibold' : ''"
              :title="item.path"
            >
              <Folder class="w-3 h-3 mr-1.5 text-gray-400 shrink-0" />
              <span class="truncate">{{ item.name }}</span>
            </div>
          </div>
        </div>

        <div class="flex-1 min-w-0 flex flex-col">
          <div v-if="loading" class="text-xs text-gray-400 text-center py-10">Loading…</div>
          <div v-else-if="error" class="text-xs text-rose-500 text-center py-10 px-4">
            {{ error }}
          </div>
          <template v-else>
            <div v-if="!filteredAssets.length && !pageSubfolders.length" class="text-xs text-gray-400 text-center py-10">
              Nothing in this folder.
            </div>

            <!-- Grid view -->
            <div v-if="viewMode === 'grid'" class="flex-1 min-h-0 overflow-y-auto p-3">
              <div v-if="filteredAssets.length" class="grid grid-cols-5 gap-3">
                <button
                  v-for="asset in filteredAssets"
                  :key="asset.pimcorePath"
                  type="button"
                  class="flex flex-col gap-1 border rounded-md p-1.5 hover:border-indigo-400 text-left"
                  :title="asset.pimcorePath"
                  @click="$emit('select', asset.pimcorePath)"
                >
                  <div class="w-full h-20 rounded bg-gray-100 flex items-center justify-center overflow-hidden">
                    <img v-if="hasPreview(asset)" :src="asset.thumbnailUrl" :alt="asset.filename" class="w-full h-full object-cover" />
                    <FileText v-else class="w-8 h-8 text-gray-300" />
                  </div>
                  <span class="text-[10px] text-gray-500 truncate">{{ asset.filename }}</span>
                  <span class="text-[9px] text-gray-400">{{ formatSize(asset.sizeBytes) }}</span>
                </button>
              </div>
            </div>

            <!-- List view -->
            <div v-if="viewMode === 'list'" class="flex-1 min-h-0 overflow-y-auto p-3">
              <div class="space-y-1">
                <button
                  v-for="asset in filteredAssets"
                  :key="asset.pimcorePath"
                  type="button"
                  class="flex items-center gap-3 w-full px-3 py-2 rounded-lg border border-transparent hover:border-gray-300 hover:bg-gray-50 transition text-left"
                  @click="$emit('select', asset.pimcorePath)"
                >
                  <div class="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden shrink-0 border border-gray-200">
                    <img v-if="hasPreview(asset)" :src="asset.thumbnailUrl" :alt="asset.filename" class="w-full h-full object-cover" />
                    <FileText v-else class="w-5 h-5 text-gray-300" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="text-xs font-medium text-gray-800 truncate">{{ asset.filename }}</div>
                    <div class="text-[10px] text-gray-400 flex items-center gap-2">
                      <span>{{ asset.mimeType }}</span>
                      <span>{{ formatSize(asset.sizeBytes) }}</span>
                    </div>
                  </div>
                  <div class="text-[10px] text-gray-400 font-mono truncate shrink-0 max-w-[200px] hidden md:block">{{ asset.pimcorePath }}</div>
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Folder, Image as ImageIcon, Grid, List, X, ChevronDown, ChevronRight, FileText } from '@lucide/vue'
import { listDamAssets, listDamFolders, type DamAssetRecord, type DamFolderRecord } from '../dam-api'

defineEmits<{
  (e: 'select', pimcorePath: string): void
  (e: 'close'): void
}>()

const FOLDER_KEY = 'whoobe:media-picker-last-folder'

const allFolders = ref<DamFolderRecord[]>([])
const pageAssets = ref<DamAssetRecord[]>([])
const savedFolder = localStorage.getItem(FOLDER_KEY)
const currentFolderPath = ref(savedFolder && savedFolder !== 'null' ? savedFolder : '/')
const loading = ref(true)
const error = ref('')
const viewMode = ref<'grid' | 'list'>('grid')
const expandedPaths = ref<Set<string>>(new Set())
const searchQuery = ref('')

const pageSubfolders = computed(() => allFolders.value.filter((f) => f.parentPath === currentFolderPath.value))

const filteredAssets = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return pageAssets.value
  return pageAssets.value.filter((a) => a.filename.toLowerCase().includes(q))
})

interface FolderTreeNode {
  path: string
  name: string
  parentPath: string
  depth: number
  hasChildren: boolean
}

const folderTree = computed(() => {
  const result: FolderTreeNode[] = []
  function walk(parentPath: string, depth: number) {
    for (const f of allFolders.value.filter((x) => x.parentPath === parentPath)) {
      const children = allFolders.value.filter((x) => x.parentPath === f.path)
      const hasChildren = children.length > 0
      result.push({ path: f.path, name: f.name, parentPath: f.parentPath, depth, hasChildren })
      if (expandedPaths.value.has(f.path)) {
        walk(f.path, depth + 1)
      }
    }
  }
  walk('/', 0)
  return result
})

function isExpanded(path: string): boolean {
  return expandedPaths.value.has(path)
}

function toggleExpanded(path: string) {
  const next = new Set(expandedPaths.value)
  if (next.has(path)) {
    next.delete(path)
  } else {
    next.add(path)
  }
  expandedPaths.value = next
}

function hasPreview(asset: DamAssetRecord): boolean {
  if (!asset.thumbnailUrl) return false
  const ext = asset.filename.split('.').pop()?.toLowerCase()
  return ext ? ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'svg', 'bmp', 'tiff', 'tif'].includes(ext) : false
}

function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(1)) + ' ' + units[i]
}

async function loadAssetsForPath(path: string) {
  pageAssets.value = await listDamAssets(path === '/' ? undefined : path)
}

async function init() {
  loading.value = true
  error.value = ''
  try {
    allFolders.value = await listDamFolders()
    await loadAssetsForPath(currentFolderPath.value)
  } catch (e: any) {
    error.value = e?.message || 'Failed to load assets'
  } finally {
    loading.value = false
  }
}

watch(currentFolderPath, async (path) => {
  try { localStorage.setItem(FOLDER_KEY, path) } catch { /* ignore */ }
  loading.value = true
  error.value = ''
  try {
    await loadAssetsForPath(currentFolderPath.value)
  } catch (e: any) {
    error.value = e?.message || 'Failed to load assets'
  } finally {
    loading.value = false
  }
})

init()
</script>