<template>
  <div class="fixed inset-0 z-[10000] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" @click.self="$emit('close')">
    <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl flex flex-col overflow-hidden relative">
      <div class="flex items-center justify-between px-6 pt-6">
        <h3 class="text-base font-bold text-slate-100 flex items-center gap-2">
          <Sparkles class="w-4 h-4 text-indigo-400" />
          Generate Image with AI
        </h3>
        <button class="text-slate-400 hover:text-slate-200 transition text-sm" @click="$emit('close')"><X class="w-4 h-4" /></button>
      </div>

      <!-- Step 1: Prompt & options -->
      <template v-if="step === 'generate'">
        <div class="p-6 space-y-3">
          <div>
            <label class="block text-xs text-slate-400 mb-1">Save to DAM folder</label>
            <div class="flex gap-2">
              <input v-model="folderPath" type="text" placeholder="/ai-generated"
                class="flex-1 text-xs rounded-lg px-2.5 py-1.5 bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono" />
              <button type="button" class="text-xs px-2.5 py-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200" @click="loadFolders(); showFolderPicker = true">Browse</button>
            </div>
          </div>

          <div v-if="info" class="inline-flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5">
            <template v-if="info.settings?.hasApiKey">
              <span>Provider: <span class="font-medium text-slate-200">{{ info.settings.provider }}</span></span>
              <span class="text-slate-600">·</span>
              <span>Model: <span class="font-medium text-slate-200">{{ info.settings.model }}</span></span>
            </template>
            <span v-else class="text-amber-400">No AI image provider configured — set one in Settings → AI Image Generation.</span>
          </div>

          <textarea
            v-model="prompt"
            rows="4"
            required
            placeholder="Describe the image you want to generate…"
            class="w-full text-sm rounded-xl px-3 py-2 bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500 placeholder-slate-500"
          />

          <div class="grid grid-cols-2 gap-3">
            <label class="flex flex-col gap-1 text-xs text-slate-400">
              Size
              <select v-model="size" class="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-indigo-500">
                <option value="256x256">256×256</option>
                <option value="512x512">512×512</option>
                <option value="1024x1024">1024×1024</option>
                <option value="1792x1024">1792×1024</option>
              </select>
            </label>
            <label class="flex flex-col gap-1 text-xs text-slate-400">
              Images
              <select v-model="n" class="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-indigo-500">
                <option v-for="i in 4" :key="i" :value="i">{{ i }}</option>
              </select>
            </label>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-slate-400 mb-1">Style (DALL·E only)</label>
              <div class="flex rounded-lg border border-slate-800 overflow-hidden">
                <button type="button" class="flex-1 py-1.5 text-xs font-medium transition"
                  :class="style === 'vivid' ? 'bg-indigo-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-slate-200'"
                  @click="style = 'vivid'">Vivid</button>
                <button type="button" class="flex-1 py-1.5 text-xs font-medium transition"
                  :class="style === 'natural' ? 'bg-indigo-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-slate-200'"
                  @click="style = 'natural'">Natural</button>
              </div>
            </div>
            <div>
              <label class="block text-xs text-slate-400 mb-1">Quality (DALL·E only)</label>
              <div class="flex rounded-lg border border-slate-800 overflow-hidden">
                <button type="button" class="flex-1 py-1.5 text-xs font-medium transition"
                  :class="quality === 'standard' ? 'bg-indigo-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-slate-200'"
                  @click="quality = 'standard'">Standard</button>
                <button type="button" class="flex-1 py-1.5 text-xs font-medium transition"
                  :class="quality === 'hd' ? 'bg-indigo-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-slate-200'"
                  @click="quality = 'hd'">HD</button>
              </div>
            </div>
          </div>

          <div v-if="error" class="text-xs text-rose-400 bg-rose-400/10 border border-rose-400/30 rounded-lg px-3 py-2">{{ error }}</div>

          <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button type="button" class="px-4 py-2 text-xs font-medium rounded-xl text-slate-400 hover:text-slate-200 transition" @click="$emit('close')">
              Cancel
            </button>
            <button
              type="button"
              :disabled="!prompt.trim() || generating"
              class="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition disabled:opacity-50 flex items-center gap-1.5"
              @click="generate"
            >
              <Loader2 v-if="generating" class="w-3.5 h-3.5 animate-spin" />
              <span>{{ generating ? 'Generating…' : 'Generate' }}</span>
            </button>
          </div>
        </div>
      </template>

      <!-- Folder picker overlay -->
      <div v-if="showFolderPicker" class="absolute inset-0 z-10 bg-slate-900/95 flex flex-col" @click.self="showFolderPicker = false">
        <div class="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
          <span class="text-xs font-semibold text-slate-200">Select DAM folder</span>
          <button class="text-slate-400 hover:text-slate-200" @click="showFolderPicker = false"><X class="w-4 h-4" /></button>
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-1">
          <div v-if="foldersLoading" class="text-xs text-slate-500 text-center py-4">Loading folders…</div>
          <div v-else-if="damFolders.length === 0" class="text-xs text-slate-500 text-center py-4 italic">No folders found</div>
          <button
            v-for="f in damFolders" :key="f.path"
            class="block w-full text-left text-xs px-3 py-2 rounded hover:bg-slate-800 text-slate-300 hover:text-slate-200 font-mono"
            @click="pickFolder(f)"
          >{{ f.path }}</button>
        </div>
      </div>

      <!-- Step 2: Preview -->
      <template v-if="step === 'preview'">
        <div class="p-6 space-y-3">
          <div v-if="generating" class="flex items-center justify-center py-8">
            <Loader2 class="w-6 h-6 animate-spin text-indigo-400" />
          </div>
          <template v-else>
            <div class="flex flex-wrap gap-3">
              <div v-for="(img, i) in generatedImages" :key="i" class="flex flex-col items-center gap-1.5 bg-slate-950 rounded-xl p-2 border border-slate-800">
                <img :src="assetPreviewUrl(img.damUrl)" class="w-40 h-40 object-cover rounded-lg" />
                <p v-if="img.revisedPrompt && img.revisedPrompt !== prompt" class="text-[10px] text-slate-500 text-center max-w-40 line-clamp-2">{{ img.revisedPrompt }}</p>
                <button
                  type="button"
                  class="text-xs px-3 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 font-semibold"
                  @click="selectImage(img)"
                >Select This</button>
              </div>
            </div>
            <p class="text-xs text-slate-400">Saved to <code class="font-mono text-indigo-300">{{ folderPath }}</code>.</p>
            <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button type="button" class="px-4 py-2 text-xs font-medium rounded-xl text-slate-400 hover:text-slate-200 transition" @click="step = 'generate'">
                Generate more
              </button>
              <button type="button" class="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition" @click="$emit('close')">
                Done
              </button>
            </div>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
// Aligned with apps/admin-dashboard/src/components/dam/AiImageGenerateModal.
// vue's layout/copy/step flow (same "Generate" / "Preview" two-step shape,
// same field labels and button wording) - see that file's own header for
// the generation options. Two real differences stay, both required by this
// app running standalone with no admin-dashboard store context: the DAM
// destination folder is a plain editable/browsable input here (rather than
// a read-only chip sourced from damStore.currentFolderPath, which doesn't
// exist in this app), and 401s get an explicit "log into the admin
// dashboard first" message (ai-api.ts/dam-api.ts's session-cookie
// dependency, documented in their own header comments). The one capability
// admin-dashboard's modal doesn't need at all - picking a generated image
// back into the caller - is this file's `select` emit/"Select This" button,
// wired by FloatingToolbar.vue's onAiImageSelected (sets the selected
// element's image.url) and BlockEditor.vue's onAiGeneratedImport/
// insertImageAtCurrent (inserts a new Image element).
//
// Saving the generated image into the DAM itself is NOT done here at all -
// core-api's POST /ai/generate-image route (apps/core-api/src/server.ts)
// downloads the provider's image and calls saveAiImageToDam() server-side
// on every request regardless of which frontend called it, so both this
// modal and admin-dashboard's already get that "auto-save" for free from
// the same backend route.
import { onMounted, ref } from 'vue'
import { X, Loader2, Sparkles } from '@lucide/vue'
import { generateImage, fetchAiImageInfo, AiApiError, type AiImageInfo } from '../ai-api'
import { listDamFolders, type DamFolderRecord } from '../dam-api'
import { getDefaultAssetProcessorUrl } from '../dam-api'

const emit = defineEmits<{
  close: []
  select: [value: { damUrl: string; assetId: string; revisedPrompt?: string }]
}>()

const step = ref<'generate' | 'preview'>('generate')
const prompt = ref('')
const size = ref('1024x1024')
const style = ref('vivid')
const quality = ref('standard')
const n = ref(1)
const generating = ref(false)
const error = ref('')
const info = ref<AiImageInfo | null>(null)
const generatedImages = ref<{ damUrl: string; assetId: string; revisedPrompt?: string }[]>([])
const folderPath = ref('/ai-generated')
const proxyBase = getDefaultAssetProcessorUrl().replace(/\/+$/, '')

function assetPreviewUrl(damUrl: string): string {
  try {
    const u = new URL(damUrl)
    const parts = u.pathname.split('/')
    const s3Key = parts.slice(2).join('/')
    if (!s3Key) return damUrl
    return `${proxyBase}/dam-asset/${s3Key}`
  } catch {
    return damUrl
  }
}
const showFolderPicker = ref(false)
const damFolders = ref<DamFolderRecord[]>([])
const foldersLoading = ref(false)

onMounted(async () => {
  info.value = await fetchAiImageInfo()
})

function pickFolder(f: DamFolderRecord) {
  folderPath.value = f.path
  showFolderPicker.value = false
}

async function loadFolders() {
  if (damFolders.value.length) return
  foldersLoading.value = true
  try {
    damFolders.value = await listDamFolders()
  } catch { damFolders.value = [] }
  finally { foldersLoading.value = false }
}

async function generate() {
  if (!prompt.value.trim() || generating.value) return
  generating.value = true
  error.value = ''
  step.value = 'preview'
  try {
    const result = await generateImage(prompt.value.trim(), {
      n: n.value,
      size: size.value,
      quality: quality.value,
      style: style.value,
      folderPath: folderPath.value,
    })
    generatedImages.value = result.images
  } catch (e: any) {
    if (e instanceof AiApiError && e.status === 401) {
      error.value = 'Not authenticated — log into the admin dashboard in this browser first, then try again.'
    } else {
      error.value = e?.message || 'Image generation failed'
    }
    step.value = 'generate'
  } finally {
    generating.value = false
  }
}

function selectImage(img: { damUrl: string; assetId: string; revisedPrompt?: string }) {
  emit('select', img)
}
</script>
