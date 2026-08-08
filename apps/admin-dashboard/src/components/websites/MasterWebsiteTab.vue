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
          <div v-if="error" class="px-3 py-2 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-300">{{ error }}</div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="submit" :disabled="saving" class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-50">{{ saving ? 'Saving…' : 'Save' }}</button>
          </div>
        </form>
      </div>
      <div v-show="activeSubTab === 'menus'" class="h-full overflow-y-auto rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-4">
        <div v-if="menusStore.isLoading && menusStore.menus.length === 0" class="text-xs text-slate-500 text-center py-4">Loading menus…</div>

        <div v-else-if="menusStore.menus.length === 0" class="text-xs text-slate-500 text-center py-4 italic">No menus yet for this website.</div>

        <div v-for="menu in menusStore.menus" :key="menu.id" class="rounded-lg border border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-white/40 overflow-hidden mb-4">
          <div class="flex items-center justify-between px-3 py-2 border-b border-slate-800/60 light:border-slate-200/60 bg-slate-950/60 light:bg-white/60">
            <span class="text-xs font-semibold text-slate-200 light:text-slate-800">{{ menu.name }}</span>
            <div class="flex items-center gap-2">
              <button @click="addRootItem(menu)" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300">+ Add item</button>
              <button @click="renameMenu(menu)" class="text-xs text-slate-400 hover:text-slate-200">Rename</button>
              <button @click="deleteMenu(menu)" class="text-xs font-semibold text-rose-400 hover:text-rose-300">Delete</button>
            </div>
          </div>
          <div v-if="menu.items.length" class="p-2 space-y-1">
            <MenuItemRow
              v-for="(item, i) in menu.items"
              :key="i"
              :item="item"
              :depth="0"
              :index="i"
              :items="menu.items"
              @update="updateItem(menu, $event)"
              @remove="removeItem(menu, i)"
              @add-child="addChildItem(menu, i)"
            />
          </div>
          <div v-else class="p-4 text-center text-[10px] text-slate-600 italic">No items. Click "+ Add item" to create one.</div>
        </div>

        <div class="flex justify-center pt-2">
          <button @click="createMenuAction" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white">+ New Menu</button>
        </div>
      </div>
    </div>
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
import { useMenusStore } from '../../stores/menusStore'
import { useTabsStore, type WebsiteSubTab, websiteTabId } from '../../stores/tabsStore'
import type { WebsiteRecord } from '../../utils/websites-api'
import type { MenuItem, MenuRecord } from '../../utils/menus-api'
import MenuItemRow from '../settings/MenuItemRow.vue'

const props = defineProps<{
  websiteId: string
}>()

const websitesStore = useWebsitesStore()
const menusStore = useMenusStore()
const tabsStore = useTabsStore()
const website = ref<WebsiteRecord | null>(null)
const isLoading = ref(true)
const saving = ref(false)
const error = ref('')

const form = ref({
  name: '',
  domainsText: '',
  defaultLocale: 'en',
  supportedLocalesText: 'en',
})

const subTabs: { key: WebsiteSubTab; label: string }[] = [
  { key: 'settings', label: 'Settings' },
  { key: 'menus', label: 'Menus' },
]

const currentTab = computed(() => tabsStore.tabs.find((t) => t.itemKind === 'website' && t.itemId === props.websiteId))
const activeSubTab = computed<WebsiteSubTab>(() => currentTab.value?.websiteSubTab ?? 'settings')

function setSubTab(tab: WebsiteSubTab) {
  tabsStore.setWebsiteSubTab(props.websiteId, tab)
}

async function load() {
  isLoading.value = true
  try {
    website.value = await websitesStore.getWebsite(props.websiteId)
    form.value = {
      name: website.value.name,
      domainsText: website.value.domains.join('\n'),
      defaultLocale: website.value.defaultLocale,
      supportedLocalesText: website.value.supportedLocales.join(', '),
    }
  } catch (e) {
    console.warn('Failed to load website:', e)
    website.value = null
  } finally {
    isLoading.value = false
  }
}

async function save() {
  error.value = ''
  saving.value = true
  try {
    const input = {
      name: form.value.name.trim(),
      domains: form.value.domainsText.split('\n').map((d) => d.trim()).filter(Boolean),
      defaultLocale: form.value.defaultLocale.trim() || 'en',
      supportedLocales: form.value.supportedLocalesText.split(',').map((l) => l.trim()).filter(Boolean),
    }
    const updated = await websitesStore.update(props.websiteId, input)
    website.value = updated
  } catch (e: any) {
    error.value = e?.message || 'Failed to save website'
  } finally {
    saving.value = false
  }
}

// Menu functions (adapted from MenuEditor.vue)
async function createMenuAction() {
  const name = prompt('Menu name:', 'Main Menu')
  if (!name?.trim()) return
  try {
    await menusStore.create({ websiteId: props.websiteId, name: name.trim() })
  } catch (e: any) {
    alert(e?.message || 'Failed to create menu')
  }
}

async function renameMenu(menu: MenuRecord) {
  const name = prompt('Rename menu:', menu.name)
  if (!name?.trim() || name.trim() === menu.name) return
  try {
    await menusStore.update(menu.id, { name: name.trim() })
  } catch (e: any) {
    alert(e?.message || 'Failed to rename menu')
  }
}

async function deleteMenu(menu: MenuRecord) {
  if (!confirm(`Delete menu "${menu.name}"?`)) return
  try {
    await menusStore.remove(menu.id)
  } catch (e: any) {
    alert(e?.message || 'Failed to delete menu')
  }
}

function addRootItem(menu: MenuRecord) {
  const items = [...menu.items, { label: 'New Item', children: [] }]
  updateMenuItems(menu, items)
}

function addChildItem(menu: MenuRecord, parentIndex: number) {
  const items = [...menu.items]
  const addChild = (nodes: MenuItem[], idx: number): boolean => {
    if (idx === 0) {
      nodes.push({ label: 'New Item', children: [] })
      return true
    }
    const [head, ...rest] = nodes
    if (rest.length > 0) return addChild(rest, idx - 1)
    return false
  }
  addChild(items, parentIndex)
  updateMenuItems(menu, items)
}

function updateItem(menu: MenuRecord, payload: { index: number; item: MenuItem }) {
  const items = [...menu.items]
  const updateRecursive = (nodes: MenuItem[], idx: number): boolean => {
    if (idx === 0) {
      nodes.splice(0, 1, payload.item)
      return true
    }
    const [head, ...rest] = nodes
    if (rest.length > 0) return updateRecursive(rest, idx - 1)
    return false
  }
  updateRecursive(items, payload.index)
  updateMenuItems(menu, items)
}

function removeItem(menu: MenuRecord, index: number) {
  const items = [...menu.items]
  items.splice(index, 1)
  updateMenuItems(menu, items)
}

async function updateMenuItems(menu: MenuRecord, items: MenuItem[]) {
  try {
    await menusStore.update(menu.id, { items })
  } catch (e: any) {
    alert(e?.message || 'Failed to update menu')
  }
}

onMounted(() => {
  load()
  menusStore.refreshMenus(props.websiteId)
})
watch(() => props.websiteId, () => {
  load()
  menusStore.refreshMenus(props.websiteId)
})
</script>