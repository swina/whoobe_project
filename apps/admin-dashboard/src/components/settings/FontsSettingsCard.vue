<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-4" data-testid="fonts-card">
    <div>
      <h3 class="text-xs font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider">Custom fonts</h3>
      <p class="text-xs text-slate-500 mt-1">
        Fonts of your own (woff2), shared by every website of this workspace. The file is kept in the DAM, in a public folder, and travels with the
        published site, so it works with no connection to Google. Upload only fonts you hold a web licence for.
      </p>
    </div>

    <form class="grid grid-cols-6 gap-3 items-end" @submit.prevent="add">
      <label class="flex flex-col gap-1 text-xs text-slate-400 col-span-2">
        Family
        <input v-model="form.family" placeholder="e.g. Acme Sans" maxlength="64" data-testid="font-family" :class="field" />
      </label>
      <label class="flex flex-col gap-1 text-xs text-slate-400">
        Weight
        <select v-model.number="form.weight" data-testid="font-weight" :class="field">
          <option v-for="w in weights" :key="w" :value="w">{{ w }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1 text-xs text-slate-400">
        Style
        <select v-model="form.style" data-testid="font-style" :class="field">
          <option value="normal">normal</option>
          <option value="italic">italic</option>
        </select>
      </label>
      <label class="flex flex-col gap-1 text-xs text-slate-400 col-span-2">
        File (.woff2)
        <input type="file" accept=".woff2,font/woff2" data-testid="font-file" class="text-xs text-slate-300" @change="onFile" />
      </label>
      <div class="col-span-6 flex items-center gap-3">
        <button type="submit" :disabled="busy || !file || !form.family.trim()" class="btn btn-primary" data-testid="font-add">{{ busy ? 'Uploading...' : 'Add font' }}</button>
        <span v-if="error" class="text-xs text-rose-400" data-testid="font-error">{{ error }}</span>
      </div>
    </form>

    <div v-if="loading" class="text-xs text-slate-500 text-center py-4">Loading...</div>
    <div v-else-if="!fonts.length" class="text-xs text-slate-500 py-2">No custom fonts yet.</div>
    <ul v-else class="divide-y divide-slate-800 light:divide-slate-200" data-testid="font-list">
      <li v-for="f in fonts" :key="f.id" class="py-2 flex items-center gap-4">
        <div class="min-w-0 flex-1">
          <div class="text-xs text-slate-200 light:text-slate-800">{{ f.family }} <span class="text-slate-500">{{ f.weight }} {{ f.style }}</span></div>
          <div class="text-[10px] text-slate-500 font-mono truncate">{{ f.assetPath }}</div>
          <div v-if="f.available" class="text-lg text-slate-300 light:text-slate-700 truncate" :style="{ fontFamily: `'${f.family}'`, fontWeight: f.weight, fontStyle: f.style }">The quick brown fox jumps over the lazy dog</div>
          <div v-else class="text-[11px] text-amber-400">The file is missing, private or not a woff2 any more: pages cannot use this font.</div>
        </div>
        <button type="button" class="btn btn-secondary" :data-testid="`font-remove-${f.id}`" @click="remove(f)">Remove</button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { fontFaceCss } from '@whoobe-cms/core'
import { useAuthStore } from '../../stores/authStore'
import { useDamStore } from '../../stores/damStore'
import { createFont, deleteFont, fetchFonts, type CustomFont } from '../../utils/fonts-api'

// where the font files go: a public folder, so a published website can read them
const FONT_FOLDER = '/public/fonts'
const weights = [100, 200, 300, 400, 500, 600, 700, 800, 900]
const field = 'w-full bg-slate-800 light:bg-white border border-slate-600 light:border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-200 light:text-slate-800'

const authStore = useAuthStore()
const damStore = useDamStore()
const fonts = ref<CustomFont[]>([])
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const file = ref<File | null>(null)
const form = reactive<{ family: string; weight: number; style: 'normal' | 'italic' }>({ family: '', weight: 400, style: 'normal' })

// The list shows each font in its own face: the rules are written into a <style> of this page, with the files read from the DAM server.
const styleEl = document.createElement('style')
styleEl.dataset.customFontsPreview = ''
document.head.appendChild(styleEl)
const previewCss = computed(() => fontFaceCss(fonts.value.filter((f) => f.available && f.url).map((f) => ({ family: f.family, weight: f.weight, style: f.style, url: `${damStore.config.assetProcessorUrl.replace(/\/+$/, '')}${f.url}` }))))
watch(previewCss, (css) => { styleEl.textContent = css }, { immediate: true })
onBeforeUnmount(() => styleEl.remove())

async function load() {
  try {
    fonts.value = await fetchFonts(authStore.config.coreApiUrl)
  } catch (e: any) {
    error.value = e?.message || 'Failed to load the fonts'
  } finally {
    loading.value = false
  }
}
onMounted(load)

function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0] ?? null
  error.value = ''
  if (f && !/\.woff2$/i.test(f.name)) { error.value = 'Only woff2 files are accepted'; file.value = null; return }
  file.value = f
}

async function add() {
  if (!file.value) return
  busy.value = true
  error.value = ''
  try {
    const asset = await damStore.uploadAsset(file.value, FONT_FOLDER, true)
    await createFont(authStore.config.coreApiUrl, { family: form.family.trim(), weight: form.weight, style: form.style, assetPath: asset.pimcorePath })
    form.family = ''
    file.value = null
    const input = document.querySelector<HTMLInputElement>('[data-testid="font-file"]')
    if (input) input.value = ''
    await load()
  } catch (e: any) {
    error.value = e?.message || 'Failed to add the font'
  } finally {
    busy.value = false
  }
}

async function remove(f: CustomFont) {
  if (!window.confirm(`Remove ${f.family} ${f.weight} ${f.style}? Pages that use it fall back to another font. The file stays in the DAM.`)) return
  error.value = ''
  try {
    await deleteFont(authStore.config.coreApiUrl, f.id)
    await load()
  } catch (e: any) {
    error.value = e?.message || 'Failed to remove the font'
  }
}
</script>
