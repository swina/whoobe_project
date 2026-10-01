<template>
  <div class="space-y-6 max-w-xl">
    <div>
      <h3 class="text-lg font-bold text-slate-100 light:text-slate-900">New Page</h3>
      <p class="text-xs text-slate-500">Create a new page with a title and slug. The editor will open automatically after creation.</p>
    </div>

    <form class="space-y-5" @submit.prevent="create">
      <div>
        <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Title <span class="text-rose-400">*</span></label>
        <input
          v-model="title"
          type="text"
          required
          placeholder="e.g. About Us"
          class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
          @input="autoSlug"
        />
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Slug <span class="text-rose-400">*</span></label>
        <input
          v-model="slug"
          type="text"
          required
          placeholder="/about-us"
          class="w-full px-3 py-2 text-sm font-mono bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
        />
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Category</label>
        <input
          v-model="category"
          type="text"
          placeholder="e.g. Landing page"
          class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Page Type</label>
        <div class="flex gap-2">
          <label class="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs"
            :class="kind === 'content' ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300' : 'border-slate-700 hover:border-slate-500 text-slate-400'">
            <input type="radio" v-model="kind" value="content" class="sr-only" />
            <FileText class="w-4 h-4" />
            <span>Standard Page</span>
          </label>
          <label class="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs"
            :class="kind === 'app' ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300' : 'border-slate-700 hover:border-slate-500 text-slate-400'">
            <input type="radio" v-model="kind" value="app" class="sr-only" />
            <Smartphone class="w-4 h-4" />
            <span>Mobile App</span>
          </label>
        </div>
      </div>

      <div v-if="error" class="px-3 py-2 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs">{{ error }}</div>

      <div class="flex justify-end gap-2 pt-2">
        <button type="button" class="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:bg-slate-200 text-slate-200 light:text-slate-800 disabled:opacity-50" @click="$emit('cancel')">
          Cancel
        </button>
        <button type="submit" :disabled="creating" class="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50">
          {{ creating ? 'Creating…' : 'Create Page' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { FileText, Smartphone } from '@lucide/vue'
import { usePagesStore } from '../../stores/pagesStore'
import type { WhoobeOnePage } from '../../utils/pages-api'
import { slugify } from '../../utils/slugify'

const emit = defineEmits<{
  (e: 'created', page: WhoobeOnePage): void
  (e: 'cancel'): void
}>()

const pagesStore = usePagesStore()

const title = ref('')
const slug = ref('')
const category = ref('')
const kind = ref<'content' | 'app'>('content')
const error = ref('')
const creating = ref(false)

function autoSlug() {
  if (slug.value && slug.value !== '/' + slugify(title.value)) return
  slug.value = '/' + slugify(title.value)
}

async function create() {
  error.value = ''
  const finalSlug = slug.value.startsWith('/') ? slug.value : '/' + slug.value
  if (!finalSlug || finalSlug === '/') {
    error.value = 'A valid slug is required'
    return
  }

  creating.value = true
  try {
    const page = await pagesStore.createPage({
      title: title.value.trim(),
      slug: finalSlug,
      category: category.value.trim() || undefined,
      kind: kind.value,
      content: { id: 'whoobe-' + Math.random().toString(36).substr(2, 5), tag: 'document', type: 'container', element: 'div', css: { css: '', container: '' }, blocks: [] },
    })
    emit('created', page)
  } catch (e: any) {
    error.value = e?.message || 'Failed to create page'
  } finally {
    creating.value = false
  }
}
</script>