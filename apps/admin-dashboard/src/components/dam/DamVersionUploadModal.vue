<template>
  <div v-if="isOpen && asset" class="fixed inset-0 bg-slate-950/80 light:bg-white/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <div class="bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-bold text-slate-100 light:text-slate-900 flex items-center gap-2">
          <RefreshCw class="w-4 h-4 text-indigo-400" />
          Upload New Version (v{{ asset.version + 1 }})
        </h3>
        <button @click="emit('close')" class="text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 transition text-sm">✕</button>
      </div>

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

      <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-800 light:border-slate-200">
        <button
          @click="emit('close')"
          class="px-4 py-2 text-xs font-medium rounded-xl text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 transition"
        >
          Cancel
        </button>
        <button
          @click="submitUploadNewVersion"
          :disabled="!versionFile || isUploading"
          class="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition disabled:opacity-50"
        >
          Upload Version v{{ asset.version + 1 }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
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
