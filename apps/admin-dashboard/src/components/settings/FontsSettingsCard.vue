<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-4" data-testid="fonts-card">
    <div>
      <h3 class="text-xs font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider">Custom fonts</h3>
      <p class="text-xs text-slate-500 mt-1">
        Fonts of your own (woff2), shared by every website of this workspace. The file is kept in the DAM, in a public folder, and travels with the
        published site, so it works with no connection to Google. Upload only fonts you hold a web licence for.
      </p>
    </div>

    <form class="space-y-3" @submit.prevent="add">
      <label class="flex flex-col gap-1 text-xs text-slate-400">
        Files (.woff2): choose all the files of a family together
        <input type="file" accept=".woff2,font/woff2" multiple data-testid="font-file" class="text-xs text-slate-300" @change="onFiles" />
      </label>

      <template v-if="rows.length">
        <label class="flex flex-col gap-1 text-xs text-slate-400 max-w-xs">
          Family
          <input v-model="family" placeholder="e.g. Acme Sans" maxlength="64" data-testid="font-family" :class="field" @input="familyTouched = true" />
        </label>
        <table class="text-xs text-slate-300 w-full" data-testid="font-rows">
          <thead><tr class="text-left text-slate-500"><th class="py-1 pr-3 font-normal">File</th><th class="pr-3 font-normal">Weight</th><th class="pr-3 font-normal">Style</th><th></th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in rows" :key="r.file.name + i">
              <td class="py-1 pr-3 font-mono truncate max-w-[16rem]">{{ r.file.name }}</td>
              <td class="pr-3"><select v-model.number="r.weight" data-testid="font-weight" :class="field"><option v-for="w in weights" :key="w" :value="w">{{ w }}</option></select></td>
              <td class="pr-3"><select v-model="r.style" data-testid="font-style" :class="field"><option value="normal">normal</option><option value="italic">italic</option></select></td>
              <td class="text-rose-400">{{ r.error }}</td>
            </tr>
          </tbody>
        </table>
        <p class="text-[10px] text-slate-500">Family, weight and style are guessed from the file names: check them before adding.</p>
      </template>

      <div class="flex items-center gap-3">
        <button type="submit" :disabled="busy || !rows.length || !family.trim()" class="btn btn-primary" data-testid="font-add">{{ busy ? 'Uploading...' : rows.length > 1 ? `Add ${rows.length} fonts` : 'Add font' }}</button>
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fontFaceCss, guessFontFace } from '@whoobe-cms/core'
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
interface Row { file: File; weight: number; style: 'normal' | 'italic'; error: string }
const rows = ref<Row[]>([])
const family = ref('')
const familyTouched = ref(false)

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

function onFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const picked = Array.from(input.files ?? [])
  error.value = ''
  const good = picked.filter((f) => /\.woff2$/i.test(f.name))
  if (good.length < picked.length) error.value = `Only woff2 files are accepted (skipped: ${picked.filter((f) => !good.includes(f)).map((f) => f.name).join(', ')})`
  rows.value = good.map((file) => {
    const g = guessFontFace(file.name)
    return { file, weight: g.weight, style: g.style, error: '' }
  })
  if (good.length && !familyTouched.value) family.value = guessFontFace(good[0].name).family
}

async function add() {
  if (!rows.value.length) return
  busy.value = true
  error.value = ''
  const failed: Row[] = []
  for (const r of rows.value) {
    r.error = ''
    try {
      const asset = await damStore.uploadAsset(r.file, FONT_FOLDER, true)
      await createFont(authStore.config.coreApiUrl, { family: family.value.trim(), weight: r.weight, style: r.style, assetPath: asset.pimcorePath })
    } catch (e: any) {
      r.error = e?.message || 'Failed'
      failed.push(r)
    }
  }
  // what was added leaves the form; what failed stays, with its reason
  rows.value = failed
  if (!failed.length) {
    family.value = ''
    familyTouched.value = false
    const input = document.querySelector<HTMLInputElement>('[data-testid="font-file"]')
    if (input) input.value = ''
  } else {
    error.value = `${failed.length} of the files were not added`
  }
  busy.value = false
  await load()
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
