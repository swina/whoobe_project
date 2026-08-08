<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">Websites</h3>
        <p class="text-xs text-slate-500 mt-1">Manage websites, domains, and supported locales. Each website can have its own set of pages and menus.</p>
      </div>
      <button @click="openEditor(null)" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white">+ New Website</button>
    </div>

    <div v-if="websitesStore.isLoading && websitesStore.websites.length === 0" class="text-xs text-slate-500 text-center py-4">Loading websites…</div>

    <div v-else-if="websitesStore.websites.length === 0" class="text-xs text-slate-500 text-center py-4 italic">No websites configured yet. Create one to get started.</div>

    <div v-else class="space-y-2">
      <div v-for="website in websitesStore.websites" :key="website.id" class="flex items-center justify-between px-3 py-2.5 rounded-lg border border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-white/40">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-slate-200 light:text-slate-800">{{ website.name }}</span>
          </div>
          <div class="text-xs text-slate-500 font-mono mt-0.5 space-x-3">
            <span>default: {{ website.defaultLocale }}</span>
            <span>locales: {{ website.supportedLocales.join(', ') }}</span>
            <span v-if="website.domains.length">domains: {{ website.domains.join(', ') }}</span>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0 ml-3">
          <button @click="openMenus(website)" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300">Menus</button>
          <button @click="openEditor(website)" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300">Edit</button>
          <button @click="handleDelete(website)" class="text-xs font-semibold text-rose-400 hover:text-rose-300">Delete</button>
        </div>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="editorOpen" class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center" @click.self="closeEditor">
      <div class="bg-slate-900 light:bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden max-h-[85vh] border border-slate-800 light:border-slate-200">
        <div class="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 light:border-slate-200 shrink-0">
          <span class="text-sm font-semibold text-slate-200 light:text-slate-800">{{ editingWebsite ? 'Edit Website' : 'New Website' }}</span>
          <button class="text-xs text-slate-400 hover:text-slate-200" @click="closeEditor">✕</button>
        </div>
        <form class="p-4 space-y-4 text-xs overflow-y-auto" @submit.prevent="save">
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
            <button type="button" class="px-3 py-1.5 rounded-lg bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:bg-slate-200 text-slate-200 light:text-slate-800 font-semibold" @click="closeEditor">Cancel</button>
            <button type="submit" :disabled="saving" class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-50">{{ saving ? 'Saving…' : 'Save' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Menu Editor Modal -->
    <MenuEditor
      v-if="menuEditorWebsite"
      :website-id="menuEditorWebsite.id"
      :website-name="menuEditorWebsite.name"
      @close="menuEditorWebsite = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useWebsitesStore } from '../../stores/websitesStore'
import type { WebsiteRecord } from '../../utils/websites-api'
import MenuEditor from './MenuEditor.vue'

const websitesStore = useWebsitesStore()

const editorOpen = ref(false)
const editingWebsite = ref<WebsiteRecord | null>(null)
const saving = ref(false)
const error = ref('')
const menuEditorWebsite = ref<WebsiteRecord | null>(null)

const form = ref({
  name: '',
  domainsText: '',
  defaultLocale: 'en',
  supportedLocalesText: 'en',
})

function openEditor(website: WebsiteRecord | null) {
  editingWebsite.value = website
  if (website) {
    form.value = {
      name: website.name,
      domainsText: website.domains.join('\n'),
      defaultLocale: website.defaultLocale,
      supportedLocalesText: website.supportedLocales.join(', '),
    }
  } else {
    form.value = { name: '', domainsText: '', defaultLocale: 'en', supportedLocalesText: 'en' }
  }
  error.value = ''
  editorOpen.value = true
}

function closeEditor() {
  editorOpen.value = false
  editingWebsite.value = null
}

function openMenus(website: WebsiteRecord) {
  menuEditorWebsite.value = website
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
    if (editingWebsite.value) {
      await websitesStore.update(editingWebsite.value.id, input)
    } else {
      await websitesStore.create(input)
    }
    closeEditor()
  } catch (e: any) {
    error.value = e?.message || 'Failed to save website'
  } finally {
    saving.value = false
  }
}

async function handleDelete(website: WebsiteRecord) {
  if (!confirm(`Delete website "${website.name}"? This will also delete its menus and unlink its pages.`)) return
  try {
    await websitesStore.remove(website.id)
  } catch (e: any) {
    error.value = e?.message || 'Failed to delete website'
  }
}

onMounted(() => websitesStore.refreshWebsites())
</script>