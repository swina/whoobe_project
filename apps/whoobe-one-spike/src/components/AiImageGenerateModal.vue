<template>
  <div class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center" @click.self="$emit('close')">
    <div class="bg-slate-900 border border-slate-800 rounded-lg shadow-xl w-full max-w-lg flex flex-col overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <span class="text-sm font-semibold text-slate-200">AI Image Generate</span>
        <button class="text-slate-400 hover:text-slate-200" @click="$emit('close')"><X class="w-4 h-4" /></button>
      </div>

      <!-- Step 1: Generate -->
      <template v-if="step === 'generate'">
        <div class="p-4 space-y-3">
          <div v-if="info" class="inline-flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800 rounded px-2 py-1">
            <Sparkles class="w-3 h-3 text-indigo-400" />
            <template v-if="info.settings?.hasApiKey">
              Provider: <span class="font-medium text-slate-200">{{ info.settings.provider }}</span>
              <span class="text-slate-600">·</span>
              Model: <span class="font-medium text-slate-200">{{ info.settings.model }}</span>
            </template>
            <span v-else class="text-amber-400">Not configured yet</span>
          </div>

          <textarea
            v-model="prompt"
            rows="4"
            required
            placeholder="Describe the image you want to generate…"
            class="w-full text-sm border rounded-lg px-3 py-2 bg-slate-800 border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500 placeholder-slate-500"
          />

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-slate-400 mb-1">Size</label>
              <select v-model="size" class="w-full text-xs rounded px-2 py-1.5 bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500">
                <option value="256x256">256×256</option>
                <option value="512x512">512×512</option>
                <option value="1024x1024" selected>1024×1024</option>
                <option value="1792x1024">1792×1024</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-slate-400 mb-1">Images</label>
              <select v-model="n" class="w-full text-xs rounded px-2 py-1.5 bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500">
                <option v-for="i in 4" :key="i" :value="i">{{ i }}</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-slate-400 mb-1">Style</label>
              <div class="flex rounded border border-slate-700 overflow-hidden">
                <button
                  type="button"
                  class="flex-1 py-1 text-xs font-medium"
                  :class="style === 'vivid' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'"
                  @click="style = 'vivid'"
                >Vivid</button>
                <button
                  type="button"
                  class="flex-1 py-1 text-xs font-medium"
                  :class="style === 'natural' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'"
                  @click="style = 'natural'"
                >Natural</button>
              </div>
            </div>
            <div>
              <label class="block text-xs text-slate-400 mb-1">Quality</label>
              <div class="flex rounded border border-slate-700 overflow-hidden">
                <button
                  type="button"
                  class="flex-1 py-1 text-xs font-medium"
                  :class="quality === 'standard' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'"
                  @click="quality = 'standard'"
                >Standard</button>
                <button
                  type="button"
                  class="flex-1 py-1 text-xs font-medium"
                  :class="quality === 'hd' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'"
                  @click="quality = 'hd'"
                >HD</button>
              </div>
            </div>
          </div>

          <div v-if="error" class="text-xs text-rose-400">{{ error }}</div>

          <div class="flex items-center justify-between pt-1">
            <span v-if="generating" class="text-xs text-slate-400 inline-flex items-center gap-2">
              <Loader2 class="w-3.5 h-3.5 animate-spin" /> Generating…
            </span>
            <div v-else class="flex items-center gap-2 ml-auto">
              <button type="button" class="text-xs px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800" @click="$emit('close')">Cancel</button>
              <button
                type="button"
                class="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
                :disabled="!prompt.trim() || generating"
                @click="generate"
              >Generate</button>
            </div>
          </div>
        </div>
      </template>

      <!-- Step 2: Preview -->
      <template v-if="step === 'preview'">
        <div class="p-4 space-y-3">
          <div v-if="generating" class="flex items-center justify-center py-8">
            <Loader2 class="w-6 h-6 animate-spin text-indigo-400" />
          </div>
          <template v-else>
            <div class="flex flex-wrap gap-3">
              <div v-for="(img, i) in generatedImages" :key="i" class="flex flex-col items-center gap-2 bg-slate-800 rounded-lg p-2 border border-slate-700">
                <img :src="img.damUrl" class="w-48 h-48 object-cover rounded" />
                <p v-if="img.revisedPrompt && img.revisedPrompt !== prompt" class="text-[10px] text-slate-500 text-center max-w-48 line-clamp-2">{{ img.revisedPrompt }}</p>
                <button
                  type="button"
                  class="text-xs px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500"
                  @click="selectImage(img)"
                >Use this image</button>
              </div>
            </div>
            <div class="flex justify-between pt-1">
              <button type="button" class="text-xs px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800" @click="step = 'generate'">Back</button>
              <button type="button" class="text-xs px-3 py-1.5 rounded text-slate-400 hover:text-slate-200" @click="$emit('close')">Close</button>
            </div>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { X, Loader2, Sparkles } from '@lucide/vue'
import { generateImage, fetchAiImageInfo, AiApiError, type AiImageInfo } from '../ai-api'

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

onMounted(async () => {
  info.value = await fetchAiImageInfo()
})

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