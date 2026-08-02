<template>
  <div v-if="asset" class="h-full flex flex-col">
    <!-- Sub-tab nav for this master item: fixed, never scrolls -->
    <div class="shrink-0 flex items-center gap-2 text-xs font-semibold px-6 pt-6 pb-3">
      <button
        @click="setSubTab('preview')"
        :class="['px-3 py-1.5 rounded-lg transition flex items-center gap-1.5', activeSubTab === 'preview' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800']"
      >
        <Eye class="w-3.5 h-3.5" />
        <span>Preview</span>
      </button>
      <button
        v-if="isEditableImage"
        @click="setSubTab('editor')"
        :class="['px-3 py-1.5 rounded-lg transition flex items-center gap-1.5', activeSubTab === 'editor' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800']"
      >
        <span>⚡</span>
        <span>Edit Image</span>
      </button>
      <button
        @click="setSubTab('metadata')"
        :class="['px-3 py-1.5 rounded-lg transition flex items-center gap-1.5', activeSubTab === 'metadata' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800']"
      >
        <span>🏷️</span>
        <span>Metadata</span>
      </button>
      <button
        v-if="isEditableImage"
        @click="setSubTab('thumbnails')"
        :class="['px-3 py-1.5 rounded-lg transition flex items-center gap-1.5', activeSubTab === 'thumbnails' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800']"
      >
        <ImageIcon class="w-3.5 h-3.5" />
        <span>Thumbnails</span>
      </button>
    </div>

    <!-- Sub-tab content: independently scrollable; all mounted (v-show) so unsaved edits survive switching -->
    <div class="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
      <div class="rounded-2xl bg-slate-900/60 border border-slate-800 p-6">
        <div v-show="activeSubTab === 'preview'">
          <DamAssetPreviewPanel
            :asset="asset"
            @open-edit="setSubTab('editor')"
            @open-metadata="setSubTab('metadata')"
            @open-version="showVersionModal = true"
            @deleted="handleDeleted"
            @toast="toastStore.show"
          />
        </div>
        <div v-if="isEditableImage" v-show="activeSubTab === 'editor'">
          <DamAssetEditorPanel
            :asset="asset"
            @saved="toastStore.show('Image asset transformed and saved successfully!')"
          />
        </div>
        <div v-show="activeSubTab === 'metadata'">
          <DamMetadataPanel
            :asset="asset"
            @saved="toastStore.show('Asset metatags updated successfully!')"
          />
        </div>
        <div v-if="isEditableImage" v-show="activeSubTab === 'thumbnails'">
          <DamThumbnailsPanel
            :asset="asset"
            @toast="toastStore.show"
          />
        </div>
      </div>
    </div>

    <DamVersionUploadModal
      :is-open="showVersionModal"
      :asset="asset"
      @close="showVersionModal = false"
    />
  </div>

  <div v-else class="p-6">
    <div class="rounded-2xl bg-slate-900/40 border border-slate-800/80 p-12 text-center text-xs text-slate-500">
      This asset is no longer available.
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Eye, ImageIcon } from '@lucide/vue'
import { useDamStore } from '../../stores/damStore'
import { useTabsStore, AssetSubTab } from '../../stores/tabsStore'
import { useToastStore } from '../../stores/toastStore'
import { PREVIEWABLE_IMAGE_TYPES } from '../../utils/asset-file-icons'
import DamAssetPreviewPanel from './DamAssetPreviewPanel.vue'
import DamAssetEditorPanel from './DamAssetEditorPanel.vue'
import DamMetadataPanel from './DamMetadataPanel.vue'
import DamThumbnailsPanel from './DamThumbnailsPanel.vue'
import DamVersionUploadModal from './DamVersionUploadModal.vue'

const props = defineProps<{
  assetId: string
}>()

const damStore = useDamStore()
const tabsStore = useTabsStore()
const toastStore = useToastStore()

const asset = computed(() => damStore.assets.find((a) => a.id === props.assetId))

const isEditableImage = computed(() => !!asset.value && PREVIEWABLE_IMAGE_TYPES.includes(asset.value.fileType))

const currentTab = computed(() => tabsStore.tabs.find((t) => t.itemKind === 'asset' && t.itemId === props.assetId))
const activeSubTab = computed<AssetSubTab>(() => currentTab.value?.assetSubTab ?? 'preview')

function setSubTab(tab: AssetSubTab) {
  tabsStore.setAssetSubTab(props.assetId, tab)
}

const showVersionModal = ref(false)

function handleDeleted() {
  tabsStore.closeAssetTab(props.assetId)
}
</script>
