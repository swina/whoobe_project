<template>
  <div v-if="website" class="h-full flex flex-col">
    <div class="flex shrink-0 px-6 pt-2 pb-2 space-y-1 gap-6">
      <div class="flex items-center gap-2">
        <h4 class="text-lg font-bold text-slate-100 light:text-slate-900">{{ website.name }}</h4>
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-mono">
        <span>default: {{ website.defaultLocale }}</span>
        <span>locales: {{ website.supportedLocales.join(', ') }}</span>
        <span v-if="website.domains.length">domains: {{ website.domains.join(', ') }}</span>
        <span>updated: {{ new Date(website.updatedAt).toLocaleString() }}</span>
      </div>
    </div>

    <div class="flex shrink-0 items-center gap-2 px-6 text-xs font-semibold">
      <button
        v-for="tab in subTabs" :key="tab.key"
        @click="setSubTab(tab.key)"
        :class="['px-3 py-1.5 rounded-lg transition flex items-center gap-1.5', activeSubTab === tab.key ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200']"
      >
        <span>{{ tab.label }}</span>
      </button>
    </div>

    <div class="flex-1 min-h-0 px-2 pb-2 pt-2">
      <div v-show="activeSubTab === 'settings'" class="h-full overflow-y-auto rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 px-6 py-4">
        <form class="space-y-4 text-xs max-w-lg" @submit.prevent="save">
          <div>
            <label class="block font-semibold text-slate-400 light:text-slate-600 mb-1">Name <span class="text-rose-400">*</span></label>
            <input v-model="form.name" type="text" required class="w-full px-3 py-2 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label class="block font-semibold text-slate-400 light:text-slate-600 mb-1">Root preview path <span class="text-rose-400">*</span></label>
            <input v-model="form.rootPath" type="text" required pattern="^\/[a-z0-9_-]+$" placeholder="/default" title="Must start with / and contain only lowercase letters, digits, hyphens, or underscores" class="w-full px-3 py-2 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 font-mono" />
            <p class="text-[10px] text-slate-500 mt-0.5">All pages from this website are previewed under this path (e.g. /default/about-us). Changing it will break existing bookmarked preview URLs.</p>
          </div>
          <div>
            <label class="block font-semibold text-slate-400 light:text-slate-600 mb-1">Domains (one per line)</label>
            <textarea v-model="form.domainsText" rows="3" placeholder="example.com&#10;www.example.com" class="w-full px-3 py-2 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 font-mono resize-none"></textarea>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block font-semibold text-slate-400 light:text-slate-600 mb-1">Default Locale</label>
              <input v-model="form.defaultLocale" type="text" placeholder="en" class="w-full px-3 py-2 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label class="block font-semibold text-slate-400 light:text-slate-600 mb-1">Supported Locales (comma separated)</label>
              <input v-model="form.supportedLocalesText" type="text" placeholder="en, it, de" class="w-full px-3 py-2 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
          <div>
            <label class="block font-semibold text-slate-400 light:text-slate-600 mb-1">Theme</label>
            <select v-model="form.themeId" class="w-full px-3 py-2 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500">
              <option value="">No theme</option>
              <option v-for="t in themeOptions" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </div>
          <div v-if="error" class="px-3 py-2 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-300">{{ error }}</div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="submit" :disabled="saving" class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-50">{{ saving ? 'Saving…' : 'Save' }}</button>
          </div>
        </form>
      </div>
      <div v-show="activeSubTab === 'paths'" class="h-full overflow-y-auto rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-4">
        <div v-if="pathsLoading && websitePaths.length === 0" class="text-xs text-slate-500 text-center py-4">Loading paths…</div>

        <div v-else-if="websitePaths.length === 0" class="text-xs text-slate-500 text-center py-4 italic">No path groups yet for this website.</div>

        <div v-for="pg in websitePaths" :key="pg.id" class="rounded-lg border border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-white/40 overflow-hidden mb-4">
          <div class="flex items-center justify-between px-3 py-2 border-b border-slate-800/60 light:border-slate-200/60 bg-slate-950/60 light:bg-white/60">
            <div class="min-w-0">
              <span class="text-xs font-semibold text-slate-200 light:text-slate-800">{{ pg.name }}</span>
              <div class="text-[10px] text-slate-500 mt-0.5">
                <template v-if="groupTemplates.get(pg.id)?.length">
                  template:
                  <template v-for="(t, i) in groupTemplates.get(pg.id)" :key="t.id">
                    <span class="font-mono text-indigo-300 light:text-indigo-700">{{ t.name }}</span><span v-if="t.isDefault"> (default)</span><template v-if="i < (groupTemplates.get(pg.id)!.length ?? 0) - 1">, </template>
                  </template>
                </template>
                <span v-else class="italic">no website template</span>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0 ml-3">
              <button @click="addRootItem(pg)" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300">+ Add item</button>
              <button @click="renamePathGroup(pg)" class="text-xs text-slate-400 hover:text-slate-200">Rename</button>
              <button @click="deletePathGroup(pg)" class="text-xs font-semibold text-rose-400 hover:text-rose-300">Delete</button>
            </div>
          </div>
          <div v-if="pg.items.length" class="p-2 space-y-1">
            <MenuItemRow
              v-for="(item, i) in pg.items"
              :key="i"
              :item="item"
              :depth="0"
              :index="i"
              :items="pg.items"
              :item-path="[]"
              :website-id="websiteId"
              :website-locale="website?.defaultLocale ?? 'en'"
              :resolve-template-for-item="resolveTemplateForItem"
              @update="updateItem(pg, $event)"
              @remove="removeItem(pg, i)"
              @insert-below="onInsertBelow(pg, $event)"
              @link-page="(path: number[]) => openPagePicker(pg, path)"
            />
          </div>
          <div v-else class="p-4 text-center text-[10px] text-slate-600 italic">No items. Click "+ Add item" to create one.</div>
        </div>

        <div class="flex justify-center pt-2">
          <button @click="createPathGroup" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white">+ New Path Group</button>
        </div>
      </div>

      <div v-show="activeSubTab === 'templates'" class="h-full overflow-y-auto rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-4">
        <WebsiteTemplatesManager :website-id="websiteId" />
      </div>
    </div>

    <!-- Page Picker Drawer -->
    <PagePickerDrawer
      v-if="showPagePicker"
      :website-id="websiteId"
      :locale="website?.defaultLocale ?? 'en'"
      @select="onPageSelected"
      @close="showPagePicker = false"
    />
  </div>

  <div v-else-if="isLoading" class="p-6 text-center text-xs text-slate-500">Loading website…</div>

  <div v-else class="p-6">
    <div class="rounded-2xl bg-slate-900/40 light:bg-white/40 border border-slate-800/80 light:border-slate-200/80 p-12 text-center text-xs text-slate-500">
      This website is no longer available.
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useWebsitesStore } from '../../stores/websitesStore'
import { usePathStore } from '../../stores/menusStore'
import { useTabsStore, type WebsiteSubTab, websiteTabId } from '../../stores/tabsStore'
import { getDefaultCoreApiUrl } from '../../utils/auth-api'
import type { WebsiteRecord } from '../../utils/websites-api'
import { fetchWebsitePaths, type MenuItem, type WebsitePathRecord } from '../../utils/menus-api'
import { fetchPages, type WhoobeOnePage } from '../../utils/pages-api'
import { fetchWebsiteTemplates, type WebsiteTemplate } from '../../utils/website-templates-api'
import { fetchThemes, type ThemeRecord } from '../../utils/themes-api'
import MenuItemRow from '../settings/MenuItemRow.vue'
import PagePickerDrawer from './PagePickerDrawer.vue'
import WebsiteTemplatesManager from './WebsiteTemplatesManager.vue'

const props = defineProps<{
  websiteId: string
}>()

const websitesStore = useWebsitesStore()
const pathsStore = usePathStore()
const tabsStore = useTabsStore()
const website = ref<WebsiteRecord | null>(null)
const isLoading = ref(true)
const saving = ref(false)
const error = ref('')

// Per-tab paths and pages (avoids shared-store race when multiple website
// tabs are open — each MasterWebsiteTab instance fetches its own data).
const websitePaths = ref<WebsitePathRecord[]>([])
const websitePages = ref<WhoobeOnePage[]>([])
const pathsLoading = ref(false)

const form = ref({
  name: '',
  rootPath: '',
  domainsText: '',
  defaultLocale: 'en',
  supportedLocalesText: 'en',
  themeId: '',
})

const themeOptions = ref<ThemeRecord[]>([])

const subTabs: { key: WebsiteSubTab; label: string }[] = [
  { key: 'settings', label: 'Settings' },
  { key: 'paths', label: 'Paths' },
  { key: 'templates', label: 'Templates' },
]

const currentTab = computed(() => tabsStore.tabs.find((t) => t.itemKind === 'website' && t.itemId === props.websiteId))
const activeSubTab = computed<WebsiteSubTab>(() => currentTab.value?.websiteSubTab ?? 'settings')

const showPagePicker = ref(false)
const pendingPagePicker = ref<{ pathGroup: WebsitePathRecord; itemPath: number[] } | null>(null)

// --- Website Templates (assigned to paths) ---
const websiteTemplates = ref<WebsiteTemplate[]>([])

async function loadTemplates() {
  try {
    websiteTemplates.value = await fetchWebsiteTemplates(getDefaultCoreApiUrl(), props.websiteId)
  } catch {
    websiteTemplates.value = []
  }
}

/** Glob → RegExp, matching the server's path-pattern resolution. */
function pathPatternToRegExp(pattern: string): RegExp {
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
    .replace(/\/$/, '(/|$)')
  return new RegExp(`^${source}$`)
}

/** The template that applies to a request path: longest path-pattern match
 *  wins, else the website's default. */
function templateForPath(path: string): WebsiteTemplate | null {
  if (websiteTemplates.value.length === 0) return null
  let best: WebsiteTemplate | null = null
  let bestLen = -1
  for (const t of websiteTemplates.value) {
    for (const pattern of t.pathPatterns) {
      if (pathPatternToRegExp(pattern).test(path) && pattern.length > bestLen) {
        best = t
        bestLen = pattern.length
      }
    }
  }
  return best ?? websiteTemplates.value.find((t) => t.isDefault) ?? null
}

/** A menu item's effective request path: its own path, else its page's slug
 *  (best effort via the loaded pages), else its raw URL. Normalized to a
 *  leading slash so it matches template patterns like `/it/*` (menu paths
 *  are stored relative, e.g. `it/magazine`). */
function itemPath(item: MenuItem): string | null {
  const raw =
    item.path?.trim() ||
    (item.pageId ? websitePages.value.find((p) => p.id === item.pageId)?.slug ?? '' : '') ||
    item.url ||
    ''
  if (!raw || raw === '/') return null
  return raw.startsWith('/') ? raw : '/' + raw
}

/** Per-route template label for a menu item (shown in each row). */
function resolveTemplateForItem(item: MenuItem): string | null {
  const p = itemPath(item)
  if (!p) return null
  const t = templateForPath(p)
  return t ? (t.isDefault ? `${t.name} (default)` : t.name) : null
}

function collectItemPaths(items: MenuItem[]): string[] {
  const out: string[] = []
  for (const item of items) {
    const p = itemPath(item)
    if (p) out.push(p)
    if (item.children?.length) out.push(...collectItemPaths(item.children))
  }
  return out
}

const defaultTemplate = computed(() => websiteTemplates.value.find((t) => t.isDefault) ?? null)

/** Templates that apply to a path group's items (path-pattern overrides,
 *  plus the website's default which applies to every route without one). */
const groupTemplates = computed(() => {
  const map = new Map<string, WebsiteTemplate[]>()
  for (const pg of websitePaths.value) {
    const tpls: WebsiteTemplate[] = []
    const seen = new Set<string>()
    for (const p of collectItemPaths(pg.items)) {
      const t = templateForPath(p)
      if (t && !seen.has(t.id)) {
        seen.add(t.id)
        tpls.push(t)
      }
    }
    if (defaultTemplate.value && !seen.has(defaultTemplate.value.id)) {
      seen.add(defaultTemplate.value.id)
      tpls.unshift(defaultTemplate.value)
    }
    map.set(pg.id, tpls)
  }
  return map
})

function setSubTab(tab: WebsiteSubTab) {
  tabsStore.setWebsiteSubTab(props.websiteId, tab)
}

async function load() {
  isLoading.value = true
  try {
    const [websiteData] = await Promise.all([
      websitesStore.getWebsite(props.websiteId),
      loadPages(),
    ])
    website.value = websiteData
    form.value = {
      name: website.value.name,
      rootPath: website.value.rootPath || '',
      domainsText: website.value.domains.join('\n'),
      defaultLocale: website.value.defaultLocale,
      supportedLocalesText: website.value.supportedLocales.join(', '),
      themeId: website.value.themeId ?? '',
    }
  } catch (e) {
    console.warn('Failed to load website:', e)
    website.value = null
  } finally {
    isLoading.value = false
  }
}

async function loadThemeOptions() {
  try {
    themeOptions.value = await fetchThemes(getDefaultCoreApiUrl())
  } catch {
    themeOptions.value = []
  }
}

async function loadPaths() {
  pathsLoading.value = true
  try {
    websitePaths.value = await fetchWebsitePaths(getDefaultCoreApiUrl(), props.websiteId)
  } catch {
    websitePaths.value = []
  } finally {
    pathsLoading.value = false
  }
}

async function loadPages() {
  try {
    websitePages.value = await fetchPages(getDefaultCoreApiUrl(), props.websiteId)
  } catch {
    websitePages.value = []
  }
}

async function save() {
  error.value = ''
  saving.value = true
  try {
    const input = {
      name: form.value.name.trim(),
      rootPath: form.value.rootPath.trim(),
      domains: form.value.domainsText.split('\n').map((d) => d.trim()).filter(Boolean),
      defaultLocale: form.value.defaultLocale.trim() || 'en',
      supportedLocales: form.value.supportedLocalesText.split(',').map((l) => l.trim()).filter(Boolean),
      themeId: form.value.themeId || null,
    }
    const updated = await websitesStore.update(props.websiteId, input)
    website.value = updated
  } catch (e: any) {
    error.value = e?.message || 'Failed to save website'
  } finally {
    saving.value = false
  }
}

// --- Page Picker ---

function openPagePicker(pathGroup: WebsitePathRecord, itemPath: number[]) {
  pendingPagePicker.value = { pathGroup, itemPath }
  showPagePicker.value = true
}

function getItemByPath(items: MenuItem[], path: number[]): MenuItem | null {
  let node: MenuItem | undefined
  let current = items
  for (const idx of path) {
    node = current[idx]
    if (!node) return null
    current = node.children || []
  }
  return node ?? null
}

function setItemByPath(items: MenuItem[], path: number[], updater: (item: MenuItem) => MenuItem): boolean {
  if (path.length === 0) return false
  let current = items
  for (let i = 0; i < path.length - 1; i++) {
    const node = current[path[i]]
    if (!node) return false
    current = node.children || []
  }
  const lastIdx = path[path.length - 1]
  if (lastIdx < 0 || lastIdx >= current.length) return false
  current[lastIdx] = updater(current[lastIdx])
  return true
}

async function onPageSelected(page: WhoobeOnePage) {
  if (!pendingPagePicker.value) return
  const { pathGroup, itemPath } = pendingPagePicker.value
  const fresh = websitePaths.value.find((p) => p.id === pathGroup.id)
  if (!fresh) {
    showPagePicker.value = false
    pendingPagePicker.value = null
    return
  }
  const items = JSON.parse(JSON.stringify(fresh.items))
  const updated = setItemByPath(items, itemPath, (item) => ({
    ...item,
    pageId: page.id,
    label: page.title,
    path: page.slug ? page.slug.replace(/^\//, '') : item.path,
  }))
  if (!updated) {
    console.warn('Could not find item at path', itemPath)
    showPagePicker.value = false
    pendingPagePicker.value = null
    return
  }
  await updatePathItems(fresh, items, true)
  showPagePicker.value = false
  pendingPagePicker.value = null
}

// --- Path Group CRUD ---

async function createPathGroup() {
  const name = prompt('Path group name:', 'Main Navigation')
  if (!name?.trim()) return
  try {
    await pathsStore.create({ websiteId: props.websiteId, name: name.trim() })
  } catch (e: any) {
    alert(e?.message || 'Failed to create path group')
  }
}

async function renamePathGroup(pathGroup: WebsitePathRecord) {
  const name = prompt('Rename path group:', pathGroup.name)
  if (!name?.trim() || name.trim() === pathGroup.name) return
  try {
    await pathsStore.update(pathGroup.id, { name: name.trim() })
  } catch (e: any) {
    alert(e?.message || 'Failed to rename path group')
  }
}

async function deletePathGroup(pathGroup: WebsitePathRecord) {
  if (!confirm(`Delete path group "${pathGroup.name}"?`)) return
  try {
    await pathsStore.remove(pathGroup.id)
  } catch (e: any) {
    alert(e?.message || 'Failed to delete path group')
  }
}

function addRootItem(pathGroup: WebsitePathRecord) {
  const label = 'New Item'
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const items = [...pathGroup.items, { label, path: `/${slug}`, children: [] }]
  updatePathItems(pathGroup, items, true)
}

function onInsertBelow(pathGroup: WebsitePathRecord, itemPath: number[]) {
  if (itemPath.length === 0) return
  const items = JSON.parse(JSON.stringify(pathGroup.items))
  let current = items
  for (let i = 0; i < itemPath.length - 1; i++) {
    const node = current[itemPath[i]]
    if (!node) return
    current = node.children || []
  }
  const insertIdx = itemPath[itemPath.length - 1]
  if (insertIdx < 0 || insertIdx > current.length) return

  const clickedItem = current[insertIdx]
  const label = 'New Item'
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const newPath = clickedItem.path ? `${clickedItem.path}/${slug}` : `/${slug}`

  current.splice(insertIdx + 1, 0, { label, path: newPath, children: [] })
  updatePathItems(pathGroup, items, true)
}

function updateItem(pathGroup: WebsitePathRecord, payload: { index: number; item: MenuItem }) {
  const items = [...pathGroup.items]
  if (payload.index >= 0 && payload.index < items.length) {
    items[payload.index] = payload.item
  }
  updatePathItems(pathGroup, items, true)
}

function removeItem(pathGroup: WebsitePathRecord, index: number) {
  const items = [...pathGroup.items]
  if (index >= 0 && index < items.length) {
    items.splice(index, 1)
  }
  updatePathItems(pathGroup, items, true)
}

async function updatePathItems(pathGroup: WebsitePathRecord, items: MenuItem[], optimistic = false) {
  if (optimistic) {
    const pg = websitePaths.value.find((p) => p.id === pathGroup.id)
    if (pg) pg.items = items
  }
  try {
    await pathsStore.update(pathGroup.id, { items })
  } catch (e: any) {
    alert(e?.message || 'Failed to update path group')
    if (optimistic) loadPaths()
  }
}

onMounted(() => {
  load()
  loadTemplates()
  loadThemeOptions()
  loadPaths()
})

watch(() => props.websiteId, () => {
  load()
  loadTemplates()
  loadThemeOptions()
  loadPaths()
})

// Re-fetch templates when entering the Paths tab, so a template created or
// edited in the Templates tab shows its association without a tab reload.
watch(activeSubTab, (tab) => {
  if (tab === 'paths') {
    loadTemplates()
    loadPaths()
  }
})
</script>