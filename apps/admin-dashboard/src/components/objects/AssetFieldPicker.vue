<template>
  <div class="flex flex-col items-start justify-start gap-3">
    <template v-if="selectedAsset">
      <div class="shrink-0 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 flex items-center justify-center overflow-hidden" :class="props.class" style="max-height:20rem;">
        <img
          v-if="PREVIEWABLE_IMAGE_TYPES.includes(selectedAsset.fileType)"
          :src="selectedAsset.dataUrl || selectedAsset.thumbnailUrl || selectedAsset.url"
          :alt="selectedAsset.filename"
          class="w-full h-full min-w-full min-h-full object-cover max-w-none max-h-none"
        />
        <component :is="getIconForFileType(selectedAsset.fileType)" v-else class="w-5 h-5 text-slate-500" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-xs text-slate-200 light:text-slate-800 truncate">{{ selectedAsset.filename }}</div>
        <div class="text-[10px] text-slate-500 font-mono truncate">{{ selectedAsset.pimcorePath }}</div>
      </div>
    </template>
    <div v-else-if="modelValue" class="min-w-0 flex-1 text-xs text-amber-400 italic">
      Asset {{ modelValue.assetId }} not found (deleted, or not loaded yet)
    </div>
    <div v-else class="min-w-0 flex-1 text-xs text-slate-500 italic">No asset selected</div>

    <div class="flex items-center gap-2 shrink-0">
      <button @click="isPickerOpen = true" type="button" class="btn btn-link">
        {{ modelValue ? 'Change' : '+ Choose Asset' }}
      </button>
      <button v-if="modelValue" @click="emit('update:modelValue', null)" type="button" class="btn btn-link-danger">Remove</button>
    </div>

    <AssetPickerModal
      :is-open="isPickerOpen"
      :filter="filter"
      @close="isPickerOpen = false"
      @select="handleSelect"
    />
  </div>
</template>

<script setup lang="ts">
// Compact "current asset + change/remove" control for asset/image/video
// Data Object fields - opens AssetPickerModal.vue to actually browse/pick.
// Looks the selected asset up directly from damStore.assets (already the
// *complete* asset list, not folder-scoped - damStore.refreshAssets()
// fetches every asset up front, see that store's own comment) rather than
// issuing a dedicated fetch, so a preview renders correctly even for an
// asset that lives in a folder the user hasn't browsed to in this session.
import { ref, computed } from 'vue'
import { useDamStore } from '../../stores/damStore'
import { PREVIEWABLE_IMAGE_TYPES, getIconForFileType } from '../../utils/asset-file-icons'
import type { AssetCategoryFilter } from '../../utils/asset-category'
import AssetPickerModal from '../dam/AssetPickerModal.vue'
import type { AssetItem } from '../../stores/damStore'

const props = defineProps<{
  modelValue: { assetId: string } | null
  filter?: AssetCategoryFilter 
  class?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: { assetId: string } | null]
}>()

const damStore = useDamStore()
const isPickerOpen = ref(false)

const selectedAsset = computed(() => (props.modelValue ? damStore.assets.find((a) => a.id === props.modelValue!.assetId) : undefined))

function handleSelect(asset: AssetItem) {
  emit('update:modelValue', { assetId: asset.id })
  isPickerOpen.value = false
}
</script>
