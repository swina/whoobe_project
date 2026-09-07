<template>
  <div v-if="isOpen" class="fixed inset-0 bg-slate-950/80 light:bg-white/80 backdrop-blur-sm flex items-center justify-center p-4 z-50" @click.self="emit('close')">
    <div class="bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-800 light:border-slate-200 shrink-0">
        <h3 class="text-base font-bold text-slate-100 light:text-slate-900 flex items-center gap-2">
          <Sparkles class="w-4 h-4 text-indigo-400" />
          AI Website Wizard
        </h3>
        <button @click="emit('close')" class="text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 transition text-sm">✕</button>
      </div>

      <div class="flex-1 overflow-y-auto p-5 space-y-4">
        <div v-if="step === 'prompt'">
          <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-2">Describe the website you want to create</label>
          <textarea
            v-model="prompt"
            rows="5"
            placeholder="e.g. A corporate website for a tech company with homepage, about, services, blog, and contact pages. Include a hero banner, feature grid, and testimonial carousel snippets."
            class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 placeholder-slate-500"
          ></textarea>
          <p class="text-xs text-slate-500 mt-1">Be as specific as possible about the pages, sections, and style you want.</p>
        </div>

        <div v-if="step === 'generating'" class="text-center py-10 space-y-3">
          <div class="animate-spin w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full mx-auto"></div>
          <p class="text-sm text-slate-300 light:text-slate-700">Generating website structure...</p>
          <p class="text-xs text-slate-500">This may take 30–60 seconds.</p>
        </div>

        <div v-if="step === 'error'" class="text-center py-6 space-y-3">
          <div class="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center mx-auto">
            <AlertCircle class="w-6 h-6 text-rose-400" />
          </div>
          <p class="text-sm text-rose-300">Generation failed</p>
          <p class="text-xs text-slate-400">{{ errorMessage }}</p>
          <button @click="step = 'prompt'" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:hover:bg-slate-200 text-slate-200 light:text-slate-800 border border-slate-700 light:border-slate-300 transition">Try again</button>
        </div>

        <div v-if="step === 'preview'" class="space-y-4">
          <div class="rounded-xl bg-slate-950/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-4 space-y-3">
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-semibold text-slate-200 light:text-slate-800">Website</h4>
              <span class="text-xs font-mono text-indigo-300">{{ structure?.website?.name }}</span>
            </div>
            <div class="text-xs text-slate-500">
              <span>Default locale: {{ structure?.website?.defaultLocale }}</span>
              <span v-if="structure?.website?.settings?.description" class="ml-3">— {{ structure.website.settings.description }}</span>
            </div>
          </div>

          <div class="rounded-xl bg-slate-950/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-4 space-y-2">
            <h4 class="text-sm font-semibold text-slate-200 light:text-slate-800">Pages ({{ structure?.pages?.length ?? 0 }})</h4>
            <div class="space-y-1.5 max-h-40 overflow-y-auto">
              <div v-for="page in structure?.pages ?? []" :key="page.slug" class="flex items-center gap-2 text-xs">
                <FileText class="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span class="text-slate-300 light:text-slate-700 font-medium">{{ page.title }}</span>
                <span class="text-slate-500 font-mono">/{{ page.slug }}</span>
              </div>
            </div>
          </div>

          <div class="rounded-xl bg-slate-950/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-4 space-y-2">
            <h4 class="text-sm font-semibold text-slate-200 light:text-slate-800">Snippets ({{ structure?.snippets?.length ?? 0 }})</h4>
            <div class="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              <span v-for="snip in structure?.snippets ?? []" :key="snip.name" class="px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-800 light:bg-slate-100 text-slate-300 light:text-slate-700 border border-slate-700 light:border-slate-300">
                {{ snip.name }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="step === 'creating'" class="text-center py-10 space-y-3">
          <div class="animate-spin w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full mx-auto"></div>
          <p class="text-sm text-slate-300 light:text-slate-700">Creating website...</p>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-800 light:border-slate-200 shrink-0">
        <button v-if="step === 'prompt'" @click="emit('close')" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:hover:bg-slate-200 text-slate-300 light:text-slate-700 border border-slate-700 light:border-slate-300 transition">Cancel</button>
        <button v-if="step === 'prompt'" @click="handleGenerate" :disabled="!prompt.trim()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition">Generate</button>
        <button v-if="step === 'preview'" @click="step = 'prompt'" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:hover:bg-slate-200 text-slate-300 light:text-slate-700 border border-slate-700 light:border-slate-300 transition">Back</button>
        <button v-if="step === 'preview'" @click="handleCreate" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition">Create Website</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Sparkles, AlertCircle, FileText } from '@lucide/vue'
import { useWebsitesStore } from '../../stores/websitesStore'
import { useTabsStore } from '../../stores/tabsStore'
import { useToastStore } from '../../stores/toastStore'
import type { AiWebsiteStructure } from '../../utils/websites-api'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const websitesStore = useWebsitesStore()
const tabsStore = useTabsStore()
const toastStore = useToastStore()

const prompt = ref('')
const step = ref<'prompt' | 'generating' | 'error' | 'preview' | 'creating'>('prompt')
const errorMessage = ref('')
const structure = ref<AiWebsiteStructure | null>(null)

async function handleGenerate() {
  step.value = 'generating'
  errorMessage.value = ''
  try {
    structure.value = await websitesStore.generateStructure(prompt.value.trim())
    step.value = 'preview'
  } catch (e: any) {
    errorMessage.value = e?.message || 'Failed to generate website structure'
    step.value = 'error'
  }
}

async function handleCreate() {
  if (!structure.value) return
  step.value = 'creating'
  try {
    const result = await websitesStore.createFromAiStructure(structure.value)
    toastStore.show(`Website "${result.website.name}" created with ${result.pages.length} pages and ${result.snippets.length} snippets`)
    tabsStore.openWebsite(result.website.id)
    emit('close')
  } catch (e: any) {
    errorMessage.value = e?.message || 'Failed to create website'
    step.value = 'error'
  }
}
</script>