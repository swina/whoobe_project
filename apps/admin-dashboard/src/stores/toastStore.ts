import { defineStore } from 'pinia'
import { ref } from 'vue'

// Small cross-component toast so notifications work the same way whether
// triggered from a section view (AssetsView) or a master-item tab
// (MasterAssetTab), which live as siblings under DashboardLayout.
export const useToastStore = defineStore('toast', () => {
  const message = ref('')
  let timer: ReturnType<typeof setTimeout> | null = null

  function show(msg: string, durationMs = 3500) {
    message.value = msg
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      message.value = ''
    }, durationMs)
  }

  return { message, show }
})
