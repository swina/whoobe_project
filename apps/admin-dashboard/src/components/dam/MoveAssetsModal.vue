<template>
  <BaseModal v-if="isOpen" :open="true" size="md" persistent @close="close">
    <template #header>
      <h2 class="ui-modal-title flex items-center gap-2"><FolderInput class="w-4 h-4 text-indigo-400" />
    Move {{ assetCount }} Asset{{ assetCount === 1 ? '' : 's' }}</h2>
    </template>
    <div class="space-y-4">
        <div>
        <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1.5">Destination folder</label>
        <div class="max-h-64 overflow-y-auto rounded-xl border border-slate-800 light:border-slate-200 divide-y divide-slate-800/60 light:divide-slate-200/60">
          <button
            type="button"
            @click="targetFolderPath = '/'"
            :class="['w-full text-left px-3 py-2 text-xs font-mono flex items-center gap-1.5 transition',
              targetFolderPath === '/' ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-300 light:text-slate-700 hover:bg-slate-800/60 light:bg-slate-100']"
          >
            <Folder class="w-3.5 h-3.5 shrink-0" />
            <span>/ (Root)</span>
          </button>
          <button
            v-for="f in sortedFolders"
            :key="f.path"
            type="button"
            @click="targetFolderPath = f.path"
            :class="['w-full text-left px-3 py-2 text-xs font-mono flex items-center gap-1.5 transition',
              targetFolderPath === f.path ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-300 light:text-slate-700 hover:bg-slate-800/60 light:bg-slate-100']"
          >
            <Folder class="w-3.5 h-3.5 shrink-0" />
            <span class="truncate">{{ f.path }}</span>
          </button>
        </div>
      </div>

      <div v-if="error" class="text-xs text-rose-400 bg-rose-400/10 border border-rose-400/30 rounded-lg px-3 py-2 whitespace-pre-line">{{ error }}</div>
      <div v-if="moving" class="text-xs text-slate-400 light:text-slate-600 flex items-center gap-2">
        <Loader2 class="w-3.5 h-3.5 animate-spin" />
        Moving {{ progress.current }} / {{ progress.total }}…
      </div>


    </div>
    <template #footer>
        <button @click="close" :disabled="moving" class="btn btn-link-muted">
        Cancel
      </button>
      <button
        @click="move"
        :disabled="!targetFolderPath || moving"
        class="btn btn-primary"
      >
        {{ moving ? 'Moving…' : `Move to ${targetFolderPath || '…'}` }}
      </button>

    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseModal from '../ui/BaseModal.vue'
import { computed, ref, watch } from 'vue'
import { FolderInput, Folder, Loader2 } from '@lucide/vue'
import { useDamStore } from '../../stores/damStore'
import { useToastStore } from '../../stores/toastStore'

const props = defineProps<{
  isOpen: boolean
  assetIds: string[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'moved'): void
}>()

const damStore = useDamStore()
const toastStore = useToastStore()

const targetFolderPath = ref('/')
const moving = ref(false)
const error = ref('')
const progress = ref({ current: 0, total: 0 })

const assetCount = computed(() => props.assetIds.length)

const sortedFolders = computed(() =>
  [...damStore.folders].sort((a, b) => a.path.localeCompare(b.path))
)

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return
    targetFolderPath.value = damStore.currentFolderPath === '/' ? '/' : damStore.currentFolderPath
    error.value = ''
    progress.value = { current: 0, total: 0 }
  }
)

async function move() {
  if (!targetFolderPath.value || moving.value || props.assetIds.length === 0) return
  moving.value = true
  error.value = ''
  const failures: string[] = []
  progress.value = { current: 0, total: props.assetIds.length }

  for (const assetId of props.assetIds) {
    const asset = damStore.assets.find((a) => a.id === assetId)
    try {
      await damStore.moveAsset(assetId, targetFolderPath.value)
    } catch (e: any) {
      failures.push(`${asset?.filename ?? assetId}: ${e?.message || 'move failed'}`)
    }
    progress.value = { current: progress.value.current + 1, total: props.assetIds.length }
  }

  moving.value = false
  if (failures.length > 0) {
    error.value = failures.join('\n')
  }
  const succeeded = props.assetIds.length - failures.length
  if (succeeded > 0) {
    toastStore.show(`Moved ${succeeded} asset${succeeded === 1 ? '' : 's'} to ${targetFolderPath.value}`)
    emit('moved')
  }
  if (failures.length === 0) {
    emit('close')
  }
}

function close() {
  if (moving.value) return
  emit('close')
}
</script>
