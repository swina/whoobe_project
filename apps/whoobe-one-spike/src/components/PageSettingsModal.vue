<template>
  <div class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center" @click.self="$emit('close')">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[85vh]">
      <div class="flex items-center justify-between px-4 py-2.5 border-b shrink-0">
        <span class="text-sm font-semibold text-gray-700">Page Settings</span>
        <button class="flex items-center gap-1 text-gray-400 hover:text-gray-700 text-xs" @click="$emit('close')"><X class="w-3.5 h-3.5" /> Close</button>
      </div>

      <div class="flex border-b text-xs shrink-0">
        <button
          v-for="tab in tabs" :key="tab.key"
          class="flex-1 px-3 py-2 font-semibold"
          :class="activeTab === tab.key ? 'text-indigo-600 border-b-2 border-indigo-600 -mb-px' : 'text-gray-400 hover:text-gray-600'"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-4 text-xs space-y-4">
        <!-- General -->
        <template v-if="activeTab === 'general'">
          <div>
            <label class="block font-semibold text-gray-600 mb-1">Title</label>
            <input v-model="form.title" type="text" class="w-full px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label class="block font-semibold text-gray-600 mb-1">Slug</label>
            <input v-model="form.slug" type="text" class="w-full px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500 font-mono" />
          </div>
          <div>
            <label class="block font-semibold text-gray-600 mb-1">Category</label>
            <input v-model="form.category" type="text" class="w-full px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500" />
          </div>
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" v-model="form.published" class="rounded" />
              <span class="font-semibold text-gray-600">Published</span>
            </label>
          </div>
          <div>
            <label class="block font-semibold text-gray-600 mb-1">Workflow State</label>
            <input v-model="form.workflowState" type="text" placeholder="e.g. draft, review, approved" class="w-full px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block font-semibold text-gray-600 mb-1">Locale</label>
              <input :value="pageMeta?.locale ?? ''" type="text" disabled class="w-full px-2 py-1.5 rounded-md border border-gray-200 bg-gray-50 text-gray-400" />
            </div>
            <div>
              <label class="block font-semibold text-gray-600 mb-1">Translation Group</label>
              <input :value="pageMeta?.translationGroupId ?? ''" type="text" disabled class="w-full px-2 py-1.5 rounded-md border border-gray-200 bg-gray-50 text-gray-400 font-mono text-[10px]" />
            </div>
          </div>
        </template>

        <!-- SEO -->
        <template v-if="activeTab === 'seo'">
          <div>
            <label class="block font-semibold text-gray-600 mb-1">Meta Title</label>
            <input v-model="form.seo.metaTitle" type="text" class="w-full px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label class="block font-semibold text-gray-600 mb-1">Meta Description</label>
            <textarea v-model="form.seo.metaDescription" rows="3" class="w-full px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500 resize-none"></textarea>
          </div>
          <div>
            <label class="block font-semibold text-gray-600 mb-1">Canonical URL</label>
            <input v-model="form.seo.canonicalUrl" type="text" class="w-full px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500 font-mono" />
          </div>
          <div class="flex items-center gap-4">
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" :checked="form.seo.robots?.index ?? true" @change="form.seo.robots = { ...(form.seo.robots ?? { index: true, follow: true }), index: ($event.target as HTMLInputElement).checked }" class="rounded" />
              <span class="font-semibold text-gray-600">Allow indexing</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" :checked="form.seo.robots?.follow ?? true" @change="form.seo.robots = { ...(form.seo.robots ?? { index: true, follow: true }), follow: ($event.target as HTMLInputElement).checked }" class="rounded" />
              <span class="font-semibold text-gray-600">Follow links</span>
            </label>
          </div>
          <div class="border-t pt-3 space-y-3">
            <span class="font-semibold text-gray-600 text-[11px] uppercase tracking-wider">Open Graph</span>
            <div>
              <label class="block font-semibold text-gray-600 mb-1">OG Title</label>
              <input v-model="form.seo.ogTitle" type="text" class="w-full px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label class="block font-semibold text-gray-600 mb-1">OG Description</label>
              <textarea v-model="form.seo.ogDescription" rows="2" class="w-full px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500 resize-none"></textarea>
            </div>
            <div>
              <label class="block font-semibold text-gray-600 mb-1">OG Image URL</label>
              <input v-model="form.seo.ogImage" type="text" class="w-full px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500 font-mono" />
            </div>
          </div>
          <div>
            <label class="block font-semibold text-gray-600 mb-1">Structured Data (JSON-LD)</label>
            <textarea v-model="structuredDataText" rows="5" class="w-full px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500 font-mono text-[10px] resize-none" placeholder="{}"></textarea>
          </div>
        </template>

        <!-- Sitemap -->
        <template v-if="activeTab === 'sitemap'">
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" v-model="form.sitemap.included" class="rounded" />
              <span class="font-semibold text-gray-600">Include in sitemap</span>
            </label>
          </div>
          <div>
            <label class="block font-semibold text-gray-600 mb-1">Priority</label>
            <select v-model="form.sitemap.priority" class="w-full px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500">
              <option :value="null">Auto</option>
              <option v-for="p in [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]" :key="p" :value="p">{{ p.toFixed(1) }}</option>
            </select>
          </div>
          <div>
            <label class="block font-semibold text-gray-600 mb-1">Change Frequency</label>
            <select v-model="form.sitemap.changefreq" class="w-full px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500">
              <option :value="null">Auto</option>
              <option value="always">Always</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="never">Never</option>
            </select>
          </div>
        </template>

        <!-- Search -->
        <template v-if="activeTab === 'search'">
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" v-model="form.search.indexable" class="rounded" />
              <span class="font-semibold text-gray-600">Indexable by search engines</span>
            </label>
          </div>
          <div>
            <label class="block font-semibold text-gray-600 mb-1">Keywords</label>
            <div class="flex flex-wrap gap-1.5 mb-2">
              <span
                v-for="(kw, i) in form.search.keywords ?? []"
                :key="i"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-semibold"
              >
                {{ kw }}
                <button type="button" class="hover:text-indigo-900" @click="removeKeyword(i)">&times;</button>
              </span>
            </div>
            <div class="flex gap-1">
              <input
                v-model="newKeyword"
                type="text"
                placeholder="Type a keyword and press Enter"
                class="flex-1 px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500"
                @keydown.enter.prevent="addKeyword"
              />
              <button type="button" class="px-2 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-50" :disabled="!newKeyword.trim()" @click="addKeyword">Add</button>
            </div>
          </div>
        </template>

        <div v-if="error" class="px-2 py-1.5 rounded-md bg-rose-50 border border-rose-200 text-rose-600">{{ error }}</div>
      </div>

      <div class="flex justify-end gap-2 px-4 py-2.5 border-t shrink-0">
        <button type="button" class="px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold text-xs" @click="$emit('close')">
          Cancel
        </button>
        <button
          type="button"
          :disabled="saving"
          class="px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs disabled:opacity-50"
          @click="save"
        >
          {{ saving ? 'Saving…' : 'Save Settings' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import { useEditorStore } from '../store/editor'
import { updatePageMeta } from '../scripts/database-actions'
import type { WhoobeOnePage, PageSeo, PageSitemapSettings, PageSearchSettings } from '../pages-api'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', page: WhoobeOnePage): void
}>()

const editor = useEditorStore()

const tabs = [
  { key: 'general', label: 'General' },
  { key: 'seo', label: 'SEO' },
  { key: 'sitemap', label: 'Sitemap' },
  { key: 'search', label: 'Search' },
]

const activeTab = ref('general')
const error = ref('')
const saving = ref(false)
const newKeyword = ref('')

function emptySeo(): PageSeo {
  return { metaTitle: null, metaDescription: null, canonicalUrl: null, robots: { index: true, follow: true }, ogTitle: null, ogDescription: null, ogImage: null, structuredData: null }
}

function emptySitemap(): PageSitemapSettings {
  return { included: true, priority: null, changefreq: null }
}

function emptySearch(): PageSearchSettings {
  return { indexable: true, keywords: [] }
}

const pageMeta = ref<WhoobeOnePage | null>(null)

const form = reactive({
  title: '',
  slug: '',
  category: '',
  published: false,
  workflowState: '',
  seo: emptySeo(),
  sitemap: emptySitemap(),
  search: emptySearch(),
})

const structuredDataText = ref('')

onMounted(() => {
  if (editor.pageMeta) {
    pageMeta.value = editor.pageMeta
    const m = editor.pageMeta
    form.title = m.title
    form.slug = m.slug
    form.category = m.category
    form.published = m.published
    form.workflowState = m.workflowState ?? ''
    form.seo = m.seo ? { ...emptySeo(), ...m.seo, robots: { index: true, follow: true, ...(m.seo.robots ?? {}) } } : emptySeo()
    form.sitemap = m.sitemap ? { ...emptySitemap(), ...m.sitemap } : emptySitemap()
    form.search = m.search ? { ...emptySearch(), ...m.search, keywords: m.search.keywords ?? [] } : emptySearch()
    structuredDataText.value = form.seo.structuredData ? JSON.stringify(form.seo.structuredData, null, 2) : ''
  } else if (editor.page) {
    form.title = editor.page.name || ''
    form.category = editor.page.category || ''
    form.slug = ((editor.page as any).path || '').replace(/^\//, '')
  }
})

function addKeyword() {
  const kw = newKeyword.value.trim()
  if (!form.search.keywords) form.search.keywords = []
  if (kw && !form.search.keywords.includes(kw)) {
    form.search.keywords.push(kw)
  }
  newKeyword.value = ''
}

function removeKeyword(index: number) {
  if (form.search.keywords) form.search.keywords.splice(index, 1)
}

function parseStructuredData(): Record<string, unknown> | null {
  const text = structuredDataText.value.trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function save() {
  error.value = ''

  const pid = editor.page?.id
  if (!pid) {
    error.value = 'No page loaded'
    return
  }

  const slug = form.slug.startsWith('/') ? form.slug : '/' + form.slug

  const structuredData = parseStructuredData()
  if (structuredDataText.value.trim() && !structuredData) {
    error.value = 'Invalid JSON in Structured Data'
    return
  }

  saving.value = true
  try {
    await updatePageMeta(String(pid), {
      title: form.title,
      slug,
      category: form.category,
      published: form.published,
      workflowState: form.workflowState || null,
      seo: {
        metaTitle: form.seo.metaTitle || null,
        metaDescription: form.seo.metaDescription || null,
        canonicalUrl: form.seo.canonicalUrl || null,
        robots: form.seo.robots ?? { index: true, follow: true },
        ogTitle: form.seo.ogTitle || null,
        ogDescription: form.seo.ogDescription || null,
        ogImage: form.seo.ogImage || null,
        structuredData: structuredData,
      },
      sitemap: form.sitemap,
      search: { ...form.search, keywords: form.search.keywords ?? [] },
    })

    if (editor.page) {
      editor.page.name = form.title
      editor.page.category = form.category
      ;(editor.page as any).path = slug
    }

    if (editor.pageMeta) {
      editor.setPageMeta({ ...editor.pageMeta, title: form.title, slug, category: form.category, published: form.published, workflowState: form.workflowState || null })
    }

    emit('saved', editor.pageMeta ?? undefined as any)
    emit('close')
  } catch (e: any) {
    error.value = e?.message || 'Failed to save page settings'
  } finally {
    saving.value = false
  }
}
</script>