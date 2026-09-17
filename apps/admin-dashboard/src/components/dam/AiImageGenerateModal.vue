<template>
  <div v-if="isOpen" class="fixed inset-0 bg-slate-950/80 light:bg-white/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <div class="bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-bold text-slate-100 light:text-slate-900 flex items-center gap-2">
          <Sparkles class="w-4 h-4 text-indigo-400" />
          Generate Image with AI
        </h3>
        <button @click="close" class="text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 transition text-sm">✕</button>
      </div>

      <!-- Step 1: Prompt & options -->
      <template v-if="step === 'generate'">
        <div class="p-2.5 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-xs text-slate-400 light:text-slate-600 flex items-center justify-between">
          <span>Will be saved to:</span>
          <code class="font-mono text-indigo-300">{{ folderPath }}</code>
        </div>

        <div v-if="info" class="inline-flex items-center gap-1.5 text-xs text-slate-400 light:text-slate-600 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg px-2.5 py-1.5">
          <template v-if="info.settings?.hasApiKey">
            <span>Provider: <span class="font-medium text-slate-200 light:text-slate-800">{{ info.settings.provider }}</span></span>
            <span class="text-slate-600">·</span>
            <span>Model: <span class="font-medium text-slate-200 light:text-slate-800">{{ info.settings.model }}</span></span>
          </template>
          <span v-else class="text-amber-400">No AI image provider configured — set one in Settings → AI Image Generation.</span>
        </div>

        <textarea
          v-model="prompt"
          rows="4"
          required
          placeholder="Describe the image you want to generate…"
          class="w-full text-sm rounded-xl px-3 py-2 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 placeholder-slate-500"
        />

        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1 text-xs text-slate-400 light:text-slate-600">
            Size
            <select v-model="size" class="px-2.5 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 text-xs">
              <option value="256x256">256×256</option>
              <option value="512x512">512×512</option>
              <option value="1024x1024">1024×1024</option>
              <option value="1792x1024">1792×1024</option>
            </select>
          </label>
          <label class="flex flex-col gap-1 text-xs text-slate-400 light:text-slate-600">
            Images
            <select v-model="n" class="px-2.5 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 text-xs">
              <option v-for="i in 4" :key="i" :value="i">{{ i }}</option>
            </select>
          </label>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-slate-400 light:text-slate-600 mb-1">Style (DALL·E only)</label>
            <div class="flex rounded-lg border border-slate-800 light:border-slate-200 overflow-hidden">
              <button type="button" class="flex-1 py-1.5 text-xs font-medium transition"
                :class="style === 'vivid' ? 'bg-indigo-600 text-white' : 'bg-slate-950 light:bg-slate-50 text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800'"
                @click="style = 'vivid'">Vivid</button>
              <button type="button" class="flex-1 py-1.5 text-xs font-medium transition"
                :class="style === 'natural' ? 'bg-indigo-600 text-white' : 'bg-slate-950 light:bg-slate-50 text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800'"
                @click="style = 'natural'">Natural</button>
            </div>
          </div>
          <div>
            <label class="block text-xs text-slate-400 light:text-slate-600 mb-1">Quality (DALL·E only)</label>
            <div class="flex rounded-lg border border-slate-800 light:border-slate-200 overflow-hidden">
              <button type="button" class="flex-1 py-1.5 text-xs font-medium transition"
                :class="quality === 'standard' ? 'bg-indigo-600 text-white' : 'bg-slate-950 light:bg-slate-50 text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800'"
                @click="quality = 'standard'">Standard</button>
              <button type="button" class="flex-1 py-1.5 text-xs font-medium transition"
                :class="quality === 'hd' ? 'bg-indigo-600 text-white' : 'bg-slate-950 light:bg-slate-50 text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800'"
                @click="quality = 'hd'">HD</button>
            </div>
          </div>
        </div>

        <div v-if="error" class="text-xs text-rose-400 bg-rose-400/10 border border-rose-400/30 rounded-lg px-3 py-2">{{ error }}</div>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-800 light:border-slate-200">
          <button @click="close" class="px-4 py-2 text-xs font-medium rounded-xl text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 transition">
            Cancel
          </button>
          <button
            @click="generate"
            :disabled="!prompt.trim() || generating"
            class="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition disabled:opacity-50 flex items-center gap-1.5"
          >
            <Loader2 v-if="generating" class="w-3.5 h-3.5 animate-spin" />
            <span>{{ generating ? 'Generating…' : 'Generate' }}</span>
          </button>
        </div>
      </template>

      <!-- Step 2: Preview -->
      <template v-else>
        <div class="flex flex-wrap gap-3">
          <div v-for="(img, i) in generatedImages" :key="i" class="flex flex-col items-center gap-1.5 bg-slate-950 light:bg-slate-50 rounded-xl p-2 border border-slate-800 light:border-slate-200">
            <img :src="assetPreviewUrl(img.damUrl)" class="w-40 h-40 object-cover rounded-lg" />
            <p v-if="img.revisedPrompt && img.revisedPrompt !== prompt" class="text-[10px] text-slate-500 text-center max-w-40 line-clamp-2">{{ img.revisedPrompt }}</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 light:text-slate-600">Saved to <code class="font-mono text-indigo-300">{{ folderPath }}</code>.</p>
        <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-800 light:border-slate-200">
          <button @click="step = 'generate'" class="px-4 py-2 text-xs font-medium rounded-xl text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 transition">
            Generate more
          </button>
          <button @click="close" class="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition">
            Done
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Sparkles, Loader2 } from '@lucide/vue'
import { useAuthStore } from '../../stores/authStore'
import { useDamStore } from '../../stores/damStore'
import { fetchAiImageSettings, generateAiImage, type AiGeneratedImage } from '../../utils/ai-settings-api'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const authStore = useAuthStore()
const damStore = useDamStore()

const step = ref<'generate' | 'preview'>('generate')
const prompt = ref('')
const size = ref('1024x1024')
const style = ref('vivid')
const quality = ref('standard')
const n = ref(1)
const generating = ref(false)
const error = ref('')
const info = ref<Awaited<ReturnType<typeof fetchAiImageSettings>> | null>(null)
const generatedImages = ref<AiGeneratedImage[]>([])

const folderPath = ref(damStore.currentFolderPath)

const assetProcessorBase = computed(() => damStore.config.assetProcessorUrl.replace(/\/+$/, ''))

function assetPreviewUrl(damUrl: string): string {
  try {
    const u = new URL(damUrl)
    const parts = u.pathname.split('/')
    // S3 URL format: /{bucket}/{s3Key} — strip the bucket prefix
    const s3Key = parts.slice(2).join('/')
    if (!s3Key) return damUrl
    return `${assetProcessorBase.value}/dam-asset/${s3Key}`
  } catch {
    return damUrl
  }
}

async function loadInfo() {
  try {
    info.value = await fetchAiImageSettings(authStore.config.coreApiUrl)
  } catch {
    info.value = null
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return
    step.value = 'generate'
    prompt.value = ''
    error.value = ''
    generatedImages.value = []
    folderPath.value = damStore.currentFolderPath
    loadInfo()
  }
)

onMounted(loadInfo)

async function generate() {
  if (!prompt.value.trim() || generating.value) return
  generating.value = true
  error.value = ''
  try {
    const result = await generateAiImage(authStore.config.coreApiUrl, prompt.value.trim(), {
      n: n.value,
      size: size.value,
      quality: quality.value,
      style: style.value,
      folderPath: folderPath.value,
    })
    generatedImages.value = result.images
    step.value = 'preview'
    await damStore.refreshAssets()
  } catch (e: any) {
    error.value = e?.message || 'Image generation failed'
  } finally {
    generating.value = false
  }
}

function close() {
  emit('close')
}
</script>
