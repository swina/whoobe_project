<template>
  <BaseModal v-if="isOpen && asset" :open="true" size="md" persistent @close="emit('close')">
    <template #header>
      <h2 class="ui-modal-title flex items-center gap-2"><RefreshCw class="w-4 h-4 text-indigo-400" />
    Upload New Version (v{{ asset.version + 1 }})</h2>
    </template>
    <div class="space-y-4">
        <div class="p-3 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 space-y-1.5 text-xs">
        <div class="text-slate-400 light:text-slate-600">Target Asset: <strong class="text-slate-200 light:text-slate-800 font-mono">{{ asset.filename }}</strong></div>
        <div class="flex items-center justify-between text-[11px] text-slate-500">
          <span>Current Version: v{{ asset.version }}</span>
          <span>Path: {{ asset.pimcorePath }}</span>
        </div>
      </div>

      <div>
        <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Select Replacement File</label>
        <input
          type="file"
          @change="handleVersionFileSelect"
          class="w-full text-xs text-slate-400 light:text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-800 light:bg-slate-100 file:text-indigo-300 hover:file:bg-slate-700 light:bg-slate-200"
        />
      </div>


    </div>
    <template #footer>
        <button
        @click="emit('close')"
        class="btn btn-link-muted"
      >
        Cancel
      </button>
      <button
        @click="submitUploadNewVersion"
        :disabled="!versionFile || isUploading"
        class="btn btn-primary"
      >
        Upload Version v{{ asset.version + 1 }}
      </button>

    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseModal from '../ui/BaseModal.vue'
import { ref, watch } from 'vue'
import { RefreshCw } from '@lucide/vue'
import { AssetItem, useDamStore } from '../../stores/damStore'
import { useToastStore } from '../../stores/toastStore'

const props = defineProps<{
  isOpen: boolean
  asset: AssetItem | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const damStore = useDamStore()
const toastStore = useToastStore()

const versionFile = ref<File | null>(null)
const isUploading = ref(false)

function handleVersionFileSelect(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (files && files.length > 0) {
    versionFile.value = files[0]
  }
}

async function submitUploadNewVersion() {
  if (!props.asset || !versionFile.value) return
  isUploading.value = true
  try {
    const updated = await damStore.uploadNewVersion(props.asset.id, versionFile.value)
    toastStore.show(`Uploaded version v${updated.version} for ${updated.filename}`)
    emit('close')
  } catch (err: any) {
    alert(err.message)
  } finally {
    isUploading.value = false
  }
}

watch(() => props.isOpen, (open) => {
  if (open) versionFile.value = null
})
</script>
