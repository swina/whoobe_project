<template>
  <div class="space-y-6">
    <div>
      <h3 class="text-lg font-bold text-slate-100 light:text-slate-900">Page Settings</h3>
      <p class="text-xs text-slate-500">Metadata, SEO, sitemap, and search configuration for this page.</p>
    </div>

    <div class="flex gap-1 border-b border-slate-800 light:border-slate-200">
      <button
        v-for="tab in settingsTabs" :key="tab.key"
        class="px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition"
        :class="activeTab === tab.key ? 'border-indigo-500 text-indigo-300' : 'border-transparent text-slate-500 hover:text-slate-300 light:text-slate-700'"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <form class="space-y-5" @submit.prevent="save">
      <template v-if="activeTab === 'general'">
        <div>
          <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Title</label>
          <input v-model="form.title" type="text" class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Slug</label>
          <input v-model="form.slug" type="text" class="w-full px-3 py-2 text-sm font-mono bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Category</label>
          <input v-model="form.category" type="text" class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Kind</label>
          <select v-model="form.kind" class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500">
            <option value="content">Content (routable page)</option>
            <option value="module">Module (website template fragment)</option>
          </select>
          <p v-if="form.kind === 'module'" class="text-[10px] text-slate-500 mt-0.5">
            Modules fill a website template's header/aside/footer slots. They are not routable and are excluded from sitemaps.
          </p>
        </div>
        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" v-model="form.published" class="rounded border-slate-700 bg-slate-900" />
            <span class="text-xs font-semibold text-slate-300 light:text-slate-700">Published</span>
          </label>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Workflow State</label>
          <input v-model="form.workflowState" type="text" placeholder="e.g. draft, review, approved" class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Locale</label>
            <select
              v-if="selectedWebsite && selectedWebsite.supportedLocales.length > 0"
              v-model="form.locale"
              class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
            >
              <option v-for="l in localeOptions" :key="l" :value="l">{{ l }}</option>
            </select>
            <input
              v-else
              v-model="form.locale"
              type="text"
              placeholder="e.g. en, it, de"
              class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
            />
            <p v-if="selectedWebsite && selectedWebsite.supportedLocales.length > 0 && !selectedWebsite.supportedLocales.includes(form.locale)" class="text-[10px] text-amber-400 mt-0.5">
              "{{ form.locale }}" isn't in {{ selectedWebsite.name }}'s supported locales.
            </p>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Website</label>
            <select v-model="form.websiteId" class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500">
              <option value="">None (single-site)</option>
              <option v-for="w in websites" :key="w.id" :value="w.id">{{ w.name }}</option>
            </select>
          </div>
        </div>
      </template>

      <template v-if="activeTab === 'seo'">
        <div>
          <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Meta Title</label>
          <input v-model="form.seo.metaTitle" type="text" :placeholder="`Uses page title: ${form.title}`" class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
          <p v-if="!form.seo.metaTitle?.trim()" class="text-[10px] text-slate-500 mt-0.5">
            Empty - will use the page title: <span class="text-indigo-400">{{ form.title }}</span>
          </p>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Meta Description</label>
          <textarea v-model="form.seo.metaDescription" rows="3" class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 resize-none"></textarea>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Canonical URL</label>
          <input v-model="form.seo.canonicalUrl" type="text" class="w-full px-3 py-2 text-sm font-mono bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
        </div>
        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" :checked="form.seo.robots?.index ?? true" @change="form.seo.robots = { ...(form.seo.robots ?? { index: true, follow: true }), index: ($event.target as HTMLInputElement).checked }" class="rounded border-slate-700 bg-slate-900" />
            <span class="text-xs font-semibold text-slate-300 light:text-slate-700">Allow indexing</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" :checked="form.seo.robots?.follow ?? true" @change="form.seo.robots = { ...(form.seo.robots ?? { index: true, follow: true }), follow: ($event.target as HTMLInputElement).checked }" class="rounded border-slate-700 bg-slate-900" />
            <span class="text-xs font-semibold text-slate-300 light:text-slate-700">Follow links</span>
          </label>
        </div>
        <div class="space-y-4 pt-2 border-t border-slate-800 light:border-slate-200">
          <span class="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Open Graph</span>
          <div>
            <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">OG Title</label>
            <input v-model="form.seo.ogTitle" type="text" class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">OG Description</label>
            <textarea v-model="form.seo.ogDescription" rows="2" class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 resize-none"></textarea>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">OG Image URL</label>
            <input v-model="form.seo.ogImage" type="text" class="w-full px-3 py-2 text-sm font-mono bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
          </div>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Structured Data (JSON-LD)</label>
          <textarea v-model="structuredDataText" rows="5" class="w-full px-3 py-2 text-sm font-mono bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 resize-none" placeholder="{}"></textarea>
        </div>
      </template>

      <template v-if="activeTab === 'sitemap'">
        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" v-model="form.sitemap.included" class="rounded border-slate-700 bg-slate-900" />
            <span class="text-xs font-semibold text-slate-300 light:text-slate-700">Include in sitemap</span>
          </label>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Priority</label>
          <select v-model="form.sitemap.priority" class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500">
            <option :value="null">Auto</option>
            <option v-for="p in [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]" :key="p" :value="p">{{ p.toFixed(1) }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Change Frequency</label>
          <select v-model="form.sitemap.changefreq" class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500">
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

      <template v-if="activeTab === 'search'">
        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" v-model="form.search.indexable" class="rounded border-slate-700 bg-slate-900" />
            <span class="text-xs font-semibold text-slate-300 light:text-slate-700">Indexable by search engines</span>
          </label>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Keywords</label>
          <div class="flex flex-wrap gap-1.5 mb-2">
            <span
              v-for="(kw, i) in form.search.keywords ?? []"
              :key="i"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-semibold"
            >
              {{ kw }}
              <button type="button" class="hover:text-indigo-100 leading-none" @click="removeKeyword(i)">&times;</button>
            </span>
          </div>
          <div class="flex gap-2">
            <input
              v-model="newKeyword"
              type="text"
              placeholder="Type a keyword and press Enter"
              class="flex-1 px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
              @keydown.enter.prevent="addKeyword"
            />
            <button type="button" class="px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50" :disabled="!newKeyword.trim()" @click="addKeyword">Add</button>
          </div>
        </div>
      </template>

      <div v-if="error" class="px-3 py-2 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs">{{ error }}</div>
      <div v-if="success" class="px-3 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs">{{ success }}</div>

      <div class="flex justify-end gap-2 pt-2">
        <button type="submit" :disabled="saving" class="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50">
          {{ saving ? 'Saving…' : 'Save Settings' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { usePagesStore } from '../../stores/pagesStore'
import { useWebsitesStore } from '../../stores/websitesStore'
import type { WhoobeOnePage, PageSeo, PageSitemapSettings, PageSearchSettings } from '../../utils/pages-api'
import type { WebsiteRecord } from '../../utils/websites-api'

const props = defineProps<{
  pageId: string
}>()

const emit = defineEmits<{
  (e: 'saved', page: WhoobeOnePage): void
}>()

const pagesStore = usePagesStore()
const websitesStore = useWebsitesStore()

const settingsTabs = [
  { key: 'general', label: 'General' },
  { key: 'seo', label: 'SEO' },
  { key: 'sitemap', label: 'Sitemap' },
  { key: 'search', label: 'Search' },
]

const activeTab = ref('general')
const error = ref('')
const success = ref('')
const saving = ref(false)
const newKeyword = ref('')
const page = ref<WhoobeOnePage | null>(null)
const websites = ref<WebsiteRecord[]>([])

function emptySeo(): PageSeo {
  return { metaTitle: null, metaDescription: null, canonicalUrl: null, robots: { index: true, follow: true }, ogTitle: null, ogDescription: null, ogImage: null, structuredData: null }
}

function emptySitemap(): PageSitemapSettings {
  return { included: true, priority: null, changefreq: null }
}

function emptySearch(): PageSearchSettings {
  return { indexable: true, keywords: [] }
}

const form = reactive({
  title: '',
  slug: '',
  category: '',
  kind: 'content' as 'content' | 'module' | 'app',
  published: false,
  workflowState: '',
  locale: '',
  websiteId: '',
  seo: emptySeo(),
  sitemap: emptySitemap(),
  search: emptySearch(),
})

const structuredDataText = ref('')

// Locale is a selection of the selected website's supported languages
// (falling back to a free-text input when the page has no website, i.e.
// single-site mode). The current page locale is always kept selectable
// even if it isn't in the website's list, so opening a legacy page never
// silently drops its value.
const selectedWebsite = computed(() => websites.value.find((w) => w.id === form.websiteId) ?? null)
const localeOptions = computed<string[]>(() => {
  const list = selectedWebsite.value ? [...selectedWebsite.value.supportedLocales] : []
  if (form.locale && !list.includes(form.locale)) list.push(form.locale)
  return list
})

// Only adopt the (new) website's default locale when the admin actually
// switches websites - never on initial form population, so opening a legacy
// page whose locale isn't in the list keeps its real value (the amber
// warning + localeOptions above handle that case instead).
let hydrated = false
watch(
  () => form.websiteId,
  (websiteId) => {
    if (!hydrated) return
    const website = websites.value.find((w) => w.id === websiteId)
    if (website && website.supportedLocales.length > 0 && !website.supportedLocales.includes(form.locale)) {
      form.locale = website.defaultLocale
    }
  }
)

onMounted(async () => {
  try {
    const [pageData, websiteList] = await Promise.all([
      pagesStore.getPage(props.pageId),
      websitesStore.refreshWebsites(),
    ])
    websites.value = websitesStore.websites
    if (pageData) {
      page.value = pageData
      form.title = pageData.title
      form.slug = pageData.slug
      form.category = pageData.category
      form.kind = pageData.kind ?? 'content'
      form.published = pageData.published
      form.workflowState = pageData.workflowState ?? ''
      form.locale = pageData.locale
      form.websiteId = (pageData as any).websiteId ?? ''
      form.seo = pageData.seo ? { ...emptySeo(), ...pageData.seo, robots: { index: true, follow: true, ...(pageData.seo.robots ?? {}) } } : emptySeo()
      form.sitemap = pageData.sitemap ? { ...emptySitemap(), ...pageData.sitemap } : emptySitemap()
      form.search = pageData.search ? { ...emptySearch(), ...pageData.search, keywords: pageData.search.keywords ?? [] } : emptySearch()
      structuredDataText.value = form.seo.structuredData ? JSON.stringify(form.seo.structuredData, null, 2) : ''
      hydrated = true
    }
  } catch (e) {
    error.value = 'Failed to load page data'
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
  success.value = ''

  const slug = form.slug.startsWith('/') ? form.slug : '/' + form.slug

  const structuredData = parseStructuredData()
  if (structuredDataText.value.trim() && !structuredData) {
    error.value = 'Invalid JSON in Structured Data'
    return
  }

  saving.value = true
  try {
    const updated = await pagesStore.updatePage(props.pageId, {
      title: form.title,
      slug,
      category: form.category,
      kind: form.kind,
      published: form.published,
      workflowState: form.workflowState || null,
      locale: form.locale || undefined,
      websiteId: form.websiteId || undefined,
      seo: {
        metaTitle: form.seo.metaTitle?.trim() || form.title.trim() || null,
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
    page.value = updated
    success.value = 'Settings saved'
    emit('saved', updated)
  } catch (e: any) {
    error.value = e?.message || 'Failed to save page settings'
  } finally {
    saving.value = false
  }
}
</script>