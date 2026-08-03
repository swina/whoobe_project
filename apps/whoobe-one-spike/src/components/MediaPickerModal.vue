<template>
  <div class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center" @click.self="$emit('close')">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-3xl h-[32rem] flex flex-col overflow-hidden">
      <div class="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <button v-if="pathStack.length > 1" class="text-gray-400 hover:text-gray-700 text-xs" title="Back" @click="goBack">⬅</button>
        <span class="text-xs font-semibold text-gray-600">Browse assets</span>
        <span class="text-xs text-gray-400 font-mono truncate">{{ currentPath }}</span>
        <div class="flex-1"></div>
        <button class="text-gray-400 hover:text-gray-700 text-xs" @click="$emit('close')">✕ Close</button>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto p-3">
        <div v-if="loading" class="text-xs text-gray-400 text-center py-10">Loading…</div>
        <div v-else-if="error" class="text-xs text-rose-500 text-center py-10 px-4">
          {{ error }}
          <p class="text-gray-400 mt-2">
            This needs an active session with the backend - make sure you're already logged into the admin dashboard
            in this same browser, reached via the same hostname.
          </p>
        </div>
        <template v-else>
          <div v-if="subfolders.length" class="grid grid-cols-6 gap-3 mb-4">
            <button
              v-for="folder in subfolders"
              :key="folder.path"
              type="button"
              class="flex flex-col items-center gap-1 border rounded-md p-2 hover:border-indigo-400 text-center"
              :title="folder.path"
              @click="enterFolder(folder.path)"
            >
              <span class="text-2xl leading-none">📁</span>
              <span class="text-[10px] text-gray-500 truncate w-full">{{ folder.name }}</span>
            </button>
          </div>

          <div v-if="!assets.length && !subfolders.length" class="text-xs text-gray-400 text-center py-10">
            Nothing in this folder.
          </div>
          <div v-else-if="assets.length" class="grid grid-cols-5 gap-3">
            <button
              v-for="asset in assets"
              :key="asset.pimcorePath"
              type="button"
              class="flex flex-col gap-1 border rounded-md p-1.5 hover:border-indigo-400 text-left"
              :title="asset.pimcorePath"
              @click="$emit('select', asset.pimcorePath)"
            >
              <img :src="asset.thumbnailUrl" :alt="asset.filename" class="w-full h-20 object-cover rounded bg-gray-100" />
              <span class="text-[10px] text-gray-500 truncate">{{ asset.filename }}</span>
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Not a port - no equivalent picker exists in the source app (its own
// media/Media.vue/pixabay.vue browse a Pixabay stock-photo search and a
// FeathersJS-backed library, neither applicable here). This browses this
// monorepo's own real asset library instead (apps/asset-processor's
// GET /api/v1/dam/assets + GET /api/v1/dam/folders, see dam-api.ts's
// header for the auth precondition this depends on).
//
// Folder navigation: GET /api/v1/dam/folders returns *every* folder flat,
// not scoped to a parent - grouped here client-side by filtering on each
// folder's own `parentPath` as the user navigates in/out. `pathStack`
// tracks the full navigation history (not just the current path) so
// "back" doesn't need to look anything up - it just pops. GET /api/v1/dam/
// assets's own `folderPath` filter is an *exact* match (confirmed from the
// route's own implementation, not a "this folder or any descendant" one),
// so a folder's own asset grid only ever shows what's directly in it -
// exactly the normal file-browser expectation.
//
// Emits the asset's stable `pimcorePath`, never the `url` shown for the
// thumbnail preview - see resolve-display-url.ts for why a resolved URL
// is never what gets stored on a node.
import { computed, ref, watch } from 'vue'
import { listDamAssets, listDamFolders, type DamAssetRecord, type DamFolderRecord } from '../dam-api'

defineEmits<{
  (e: 'select', pimcorePath: string): void
  (e: 'close'): void
}>()

const folders = ref<DamFolderRecord[]>([])
const assets = ref<DamAssetRecord[]>([])
const pathStack = ref<string[]>(['/'])
const loading = ref(true)
const error = ref('')

const currentPath = computed(() => pathStack.value[pathStack.value.length - 1])
const subfolders = computed(() => folders.value.filter((f) => f.parentPath === currentPath.value))

async function loadAssetsForCurrentPath() {
  assets.value = await listDamAssets(currentPath.value === '/' ? undefined : currentPath.value)
}

async function init() {
  loading.value = true
  error.value = ''
  try {
    folders.value = await listDamFolders()
    await loadAssetsForCurrentPath()
  } catch (e: any) {
    error.value = e?.message || 'Failed to load assets'
  } finally {
    loading.value = false
  }
}

function enterFolder(path: string) {
  pathStack.value.push(path)
}

function goBack() {
  if (pathStack.value.length > 1) pathStack.value.pop()
}

watch(currentPath, async () => {
  loading.value = true
  error.value = ''
  try {
    await loadAssetsForCurrentPath()
  } catch (e: any) {
    error.value = e?.message || 'Failed to load assets'
  } finally {
    loading.value = false
  }
})

init()
</script>
