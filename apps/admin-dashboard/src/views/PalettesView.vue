<template>
  <div class="flex flex-col h-full gap-4" data-testid="palettes-view">
    <div class="flex items-start justify-between gap-4 shrink-0">
      <div>
        <h2 class="text-xl font-bold text-slate-100 light:text-slate-900">Palettes</h2>
        <p class="text-xs text-slate-400 light:text-slate-600 mt-1 max-w-3xl">The colour palettes the Generate Website Wizard offers, next to its four built-in ones. Make, change, copy and delete your own here.</p>
      </div>
      <button type="button" class="btn btn-secondary flex items-center gap-1.5 shrink-0" data-testid="palettes-refresh" :disabled="loading" @click="load()">
        <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': loading }" /> Refresh
      </button>
    </div>
    <div v-if="error" class="text-sm text-rose-300 shrink-0">{{ error }}</div>
    <div v-else-if="!options" class="text-sm text-slate-500 shrink-0">Loading…</div>
    <div v-else class="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-5">
      <PalettesManager :options="options" @changed="load()" />
    </div>
  </div>
</template>

<script setup lang="ts">
// The section Palettes of the main menu (after Themes): the management of the palettes of the Generate Website Wizard, as a main tab.
import { onMounted, ref } from 'vue'
import { RefreshCw } from '@lucide/vue'
import PalettesManager from '../components/websites/PalettesManager.vue'
import { useAuthStore } from '../stores/authStore'
import { fetchWizardOptions, type WizardOptions } from '../utils/site-wizard-api'

const auth = useAuthStore()
const options = ref<WizardOptions | null>(null)
const loading = ref(false)
const error = ref('')

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    options.value = await fetchWizardOptions(auth.config.coreApiUrl)
  } catch (e: any) {
    error.value = e?.message || 'Could not load the palettes'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
