<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2">
      <p class="text-xs text-slate-500 bg-sky-950 light:bg-slate-300 border border-slate-800 light:border-slate-200 p-2 rounded-lg">
        Reusable page compositions for this website. Each slot is filled with <b>snippets</b>; the routed page is always the body.
      </p>
      <button type="button" @click="startNew" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shrink-0">+ New template</button>
    </div>

    <div v-if="loading" class="text-xs text-slate-500 text-center py-4">Loading…</div>
    <div v-else-if="error" class="text-xs text-rose-400">{{ error }}</div>

    <!-- Edit panel -->
    <div v-else-if="editingId !== '' || creating" class="rounded-xl border border-slate-800 light:border-slate-200 p-4 space-y-3">
      <div class="flex items-center justify-between">
        <h4 class="text-xs font-semibold text-slate-200 light:text-slate-800">{{ editingId ? 'Edit template' : 'New template' }}</h4>
        <div class="flex items-center gap-3 pt-1">
          <span v-if="saveOk" class="text-xs text-emerald-400">Saved.</span>
          <span v-if="saveError" class="text-xs text-rose-400">{{ saveError }}</span>
          <button type="button" :disabled="saving" class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white" @click="save">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
          
          <button type="button" class="text-slate-500 hover:text-slate-300 text-3xl leading-none " @click="closeEditor">×</button>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <label class="flex flex-col gap-1 text-xs text-slate-400 col-span-2">
          Name
          <input v-model="form.name" type="text" class="px-2 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
        </label>
        <label class="flex flex-col gap-1 text-xs text-slate-400 col-span-2">
          Description
          <input v-model="form.description" type="text" class="px-2 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
        </label>
        <label class="flex flex-col gap-1 text-xs text-slate-400 col-span-2">
          Path patterns (one per line, glob: /it/news/*) - routes this template applies to, overriding the default
          <textarea v-model="form.pathPatternsText" rows="3" class="w-full px-3 py-2 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800 resize-none font-mono" placeholder="/it/news/*"></textarea>
        </label>
        <label class="flex items-center gap-2 text-xs text-slate-400 col-span-2">
          <input v-model="form.isDefault" type="checkbox" class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 light:bg-slate-50 border-slate-800 light:border-slate-200" />
          Default template for this website (applied when no path pattern matches)
        </label>
      </div>

      <div v-for="slotKey in (['header', 'aside', 'footer'] as const)" :key="slotKey" class="border border-slate-800 light:border-slate-200 rounded-lg p-2 space-y-2">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{{ slotKey }}</div>
        <!-- <div class="flex flex-wrap items-center gap-1.5">
          <template v-if="assignedModules(slotKey).length">
            <span
              v-for="p in assignedModules(slotKey)"
              :key="p.id"
              class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-indigo-600/15 border border-indigo-600/30 text-xs text-indigo-200 light:text-indigo-800"
            >
              {{ p.title }}
              <button type="button" class="text-indigo-300 hover:text-white light:hover:text-black" title="Remove module" @click="removeSlotPage(slotKey, p.id)">×</button>
            </span>
          </template>
          <span v-else class="text-[11px] text-slate-500 italic">No modules assigned.</span>
          <button type="button" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300" @click="openSlotPicker(slotKey)">+ Add module</button>
        </div> -->
        <div class="flex flex-wrap items-center gap-1.5">
          <template v-if="assignedSnippets(slotKey).length">
            <span
              v-for="s in assignedSnippets(slotKey)"
              :key="s.id"
              class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-teal-600/15 border border-teal-600/30 text-xs text-teal-200 light:text-teal-800"
            >
              {{ s.name }}
              <button type="button" class="text-teal-300 hover:text-white light:hover:text-black" title="Remove snippet" @click="removeSnippet(slotKey, s.id)">×</button>
            </span>
          </template>
          <span v-else class="text-[11px] text-slate-500 italic">No snippets assigned.</span>
          <button type="button" class="text-xs font-semibold text-teal-400 hover:text-teal-300" @click="snippetPicker = slotKey">+ Add snippet</button>
        </div>
        <div class="flex items-center gap-3 pt-1 w-full">
        <label class="flex flex-col gap-1 w-1/2 text-xs text-slate-400">
          Wrapper classes (Tailwind)
          <input
            :value="slotClassName(slotKey)"
            @input="slotClassNameSet(slotKey, ($event.target as HTMLInputElement).value)"
            type="text"
            class="px-2 py-1 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-xs text-slate-200 light:text-slate-800 font-mono"
            placeholder="sticky top-0 z-40"
          />
        </label>
        <label class="flex flex-col gap-1 w-1/2 text-xs text-slate-400">
          Wrapper style
          <input
            :value="slotStyle(slotKey)"
            @input="slotStyleSet(slotKey, ($event.target as HTMLInputElement).value)"
            type="text"
            class="px-2 py-1 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-xs text-slate-200 light:text-slate-800 font-mono"
            placeholder="background: #fff"
          />
        </label>
        </div>
        <label class="flex flex-col gap-1 text-xs text-slate-400">
          Custom elements (JSON - an Element tree from the Whoobe One editor, or an array of them)
          <textarea
            :value="slotContentText[slotKey]"
            @input="slotContentText[slotKey] = ($event.target as HTMLTextAreaElement).value"
            rows="3"
            class="w-full px-2 py-1 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-xs text-slate-200 light:text-slate-800 font-mono resize-none"
            placeholder='{ "id": "logo", "type": "element", "element": "img", "image": { "url": "/logo.png" } }'
          ></textarea>
        </label>
      </div>

      <div class="flex items-center gap-3 pt-1">
        <button type="button" :disabled="saving" class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white" @click="save">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <span v-if="saveOk" class="text-xs text-emerald-400">Saved.</span>
        <span v-if="saveError" class="text-xs text-rose-400">{{ saveError }}</span>
      </div>
    </div>

    <!-- List -->
    <div v-else-if="templates.length === 0" class="text-xs text-slate-500 text-center py-4">
      No templates yet for this website. Create one to compose header/footer modules around pages.
    </div>
    <div v-else class="space-y-2">
      <div v-for="t in templates" :key="t.id" class="flex items-center justify-between px-3 py-2.5 rounded-lg border border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-white/40">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-slate-200 light:text-slate-800">{{ t.name }}</span>
            <span v-if="t.isDefault" class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">default</span>
          </div>
          <div class="text-xs text-slate-500 font-mono mt-0.5 space-x-3">
            <span v-if="t.pathPatterns.length">paths: {{ t.pathPatterns.join(', ') }}</span>
            <span>header: {{ slotSummary(t.layout.header) }}</span>
            <span>footer: {{ slotSummary(t.layout.footer) }}</span>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0 ml-3">
          <button @click="editTemplate(t)" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300">Edit</button>
          <button @click="remove(t)" class="text-xs font-semibold text-rose-400 hover:text-rose-300">Delete</button>
        </div>
      </div>
    </div>

    <!-- Module picker: click a module to add (or remove) it from the slot -->
    <div v-if="slotPicker" class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center" @click.self="slotPicker = null">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[70vh] flex flex-col overflow-hidden">
        <div class="flex items-center justify-between px-3 py-2 border-b shrink-0">
          <span class="text-xs font-semibold text-gray-600">Add module to {{ slotPicker }}</span>
          <button type="button" class="text-gray-400 hover:text-gray-700" @click="slotPicker = null"><X class="w-4 h-4" /></button>
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
          <div v-if="modulePages.length === 0" class="text-xs text-gray-400 text-center py-6">
            No module pages yet - mark a page as <b>Module</b> in its Settings to make it available here.
          </div>
          <button
            v-for="p in modulePages"
            :key="p.id"
            type="button"
            class="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-sm hover:bg-gray-50"
            @click="toggleSlotPage(slotPicker, p.id)"
          >
            <span class="text-gray-700">{{ p.title }}</span>
            <Check v-if="slotPageIds(slotPicker).includes(p.id)" class="w-4 h-4 text-indigo-600" />
          </button>
        </div>
        <div class="flex justify-end px-3 py-2 border-t shrink-0">
          <button type="button" class="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-500" @click="slotPicker = null">Done</button>
        </div>
      </div>
    </div>

    <!-- Snippet picker: click a snippet to add (or remove) it from the slot -->
    <div v-if="snippetPicker" class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center" @click.self="snippetPicker = null">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[70vh] flex flex-col overflow-hidden">
        <div class="flex items-center justify-between px-3 py-2 border-b shrink-0">
          <span class="text-xs font-semibold text-gray-600">Add snippet to {{ snippetPicker }}</span>
          <button type="button" class="text-gray-400 hover:text-gray-700" @click="snippetPicker = null"><X class="w-4 h-4" /></button>
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
          <div v-if="snippets.length === 0" class="text-xs text-gray-400 text-center py-6">
            No snippets yet - save a reusable element from the Whoobe One editor to use it here.
          </div>
          <template v-else>
            <div class="flex items-center gap-2 pb-1">
              <input
                v-model="snippetSearch"
                type="text"
                placeholder="Search by name…"
                class="flex-1 px-2 py-1 text-xs border rounded bg-gray-50 focus:outline-none focus:border-indigo-400"
              />
              <select v-model="snippetCategory" class="px-2 py-1 text-xs border rounded bg-gray-50 focus:outline-none focus:border-indigo-400">
                <option value="">All categories</option>
                <option v-for="cat in snippetCategories" :key="cat" :value="cat">{{ cat }}</option>
              </select>
            </div>
            <div v-if="filteredSnippets.length === 0" class="text-xs text-gray-400 text-center py-6">No snippets match.</div>
            <button
              v-for="s in filteredSnippets"
              :key="s.id"
              type="button"
              class="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-sm hover:bg-gray-50"
              @click="toggleSnippet(snippetPicker, s.id)"
            >
              <span class="text-gray-700">
                {{ s.name }}
                <span v-if="s.category" class="text-[10px] text-gray-400 ml-1">{{ s.category }}</span>
              </span>
              <Check v-if="slotSnippetIds(snippetPicker).includes(s.id)" class="w-4 h-4 text-teal-600" />
            </button>
          </template>
        </div>
        <div class="flex justify-end px-3 py-2 border-t shrink-0">
          <button type="button" class="text-xs px-3 py-1.5 rounded bg-teal-600 text-white hover:bg-teal-500" @click="snippetPicker = null">Done</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { X, Check } from '@lucide/vue'
import { getDefaultCoreApiUrl } from '../../utils/auth-api'
import { fetchPages, type WhoobeOnePage } from '../../utils/pages-api'
import {
  fetchWebsiteTemplates,
  createWebsiteTemplate,
  updateWebsiteTemplate,
  deleteWebsiteTemplate,
  type WebsiteTemplate,
  type WebsiteTemplateLayout,
  type TemplateSlot,
} from '../../utils/website-templates-api'
import { fetchSnippets, type WhoobeSnippet } from '../../utils/snippets-api'

const props = defineProps<{ websiteId: string }>()

type SlotKey = 'header' | 'aside' | 'footer'

const templates = ref<WebsiteTemplate[]>([])
const modulePages = ref<WhoobeOnePage[]>([])
const snippets = ref<WhoobeSnippet[]>([])
const loading = ref(true)
const error = ref('')
const editingId = ref('')
const creating = ref(false)
const saving = ref(false)
const saveOk = ref(false)
const saveError = ref('')
const slotPicker = ref<SlotKey | null>(null)
const snippetPicker = ref<SlotKey | null>(null)
const snippetSearch = ref('')
const snippetCategory = ref('')

const snippetCategories = computed(() => {
  const cats = new Set(snippets.value.map((s) => s.category).filter(Boolean))
  return [...cats]
})

const filteredSnippets = computed(() => {
  const q = snippetSearch.value.trim().toLowerCase()
  return snippets.value.filter((s) => {
    if (q && !s.name.toLowerCase().includes(q)) return false
    if (snippetCategory.value && s.category !== snippetCategory.value) return false
    return true
  })
})

// Directly-authored slot elements, kept as JSON text per slot (validated on
// save, mirroring whoobe-studio's raw-JSON editing pattern).
const slotContentText = reactive<Record<SlotKey, string>>({ header: '', aside: '', footer: '' })

function contentToText(content: unknown): string {
  return content != null ? JSON.stringify(content, null, 2) : ''
}

function parseSlotContent(slot: SlotKey): unknown {
  const text = slotContentText[slot].trim()
  return text ? JSON.parse(text) : null
}

const form = reactive({
  name: '',
  description: '',
  pathPatternsText: '',
  isDefault: false,
  layout: { header: { pageIds: [] as string[], className: '', style: '' }, aside: null as TemplateSlot | null, footer: { pageIds: [] as string[], className: '', style: '' } } as WebsiteTemplateLayout,
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const base = getDefaultCoreApiUrl()
    const [tpls, pages, snips] = await Promise.all([
      fetchWebsiteTemplates(base, props.websiteId),
      fetchPages(base, props.websiteId),
      fetchSnippets(base),
    ])
    templates.value = tpls
    modulePages.value = pages.filter((p) => p.kind === 'module')
    snippets.value = snips
  } catch (e: any) {
    error.value = e?.message || 'Failed to load website templates'
  } finally {
    loading.value = false
  }
}

function startNew() {
  creating.value = true
  editingId.value = ''
  form.name = ''
  form.description = ''
  form.pathPatternsText = ''
  form.isDefault = false
  form.layout = {
    header: { pageIds: [], snippetIds: [], className: '', style: '' },
    aside: null,
    footer: { pageIds: [], snippetIds: [], className: '', style: '' },
  }
  slotContentText.header = ''
  slotContentText.aside = ''
  slotContentText.footer = ''
  saveOk.value = false
  saveError.value = ''
}

function editTemplate(t: WebsiteTemplate) {
  creating.value = false
  editingId.value = t.id
  form.name = t.name
  form.description = t.description ?? ''
  form.pathPatternsText = (t.pathPatterns ?? []).join('\n')
  form.isDefault = t.isDefault
  const blank = (s: TemplateSlot | null | undefined): TemplateSlot => ({
    pageIds: s?.pageIds ?? [],
    snippetIds: s?.snippetIds ?? [],
    className: s?.className ?? '',
    style: s?.style ?? '',
  })
  form.layout = {
    header: blank(t.layout.header),
    aside: t.layout.aside ? blank(t.layout.aside) : null,
    footer: blank(t.layout.footer),
  }
  slotContentText.header = contentToText(t.layout.header?.content)
  slotContentText.aside = contentToText(t.layout.aside?.content)
  slotContentText.footer = contentToText(t.layout.footer?.content)
  saveOk.value = false
  saveError.value = ''
}

function closeEditor() {
  editingId.value = ''
  creating.value = false
  load()
}

function slotPageIds(slot: SlotKey): string[] {
  return form.layout[slot]?.pageIds ?? []
}

/** The module pages assigned to a slot, for the removable chips. */
function assignedModules(slot: SlotKey): WhoobeOnePage[] {
  return modulePages.value.filter((p) => slotPageIds(slot).includes(p.id))
}

function ensureSlot(slot: SlotKey): TemplateSlot {
  if (!form.layout[slot]) {
    form.layout[slot] = { pageIds: [], snippetIds: [], className: '', style: '' }
  }
  return form.layout[slot]!
}

function openSlotPicker(slot: SlotKey) {
  slotPicker.value = slot
}

function toggleSlotPage(slot: SlotKey, pageId: string) {
  const s = ensureSlot(slot)
  const next = new Set(s.pageIds)
  if (next.has(pageId)) next.delete(pageId)
  else next.add(pageId)
  s.pageIds = [...next]
}

function removeSlotPage(slot: SlotKey, pageId: string) {
  const s = ensureSlot(slot)
  s.pageIds = s.pageIds.filter((id) => id !== pageId)
}

// --- Snippets (reusable editor elements) ---

function slotSnippetIds(slot: SlotKey): string[] {
  return form.layout[slot]?.snippetIds ?? []
}

function assignedSnippets(slot: SlotKey): WhoobeSnippet[] {
  return snippets.value.filter((s) => slotSnippetIds(slot).includes(s.id))
}

function toggleSnippet(slot: SlotKey, snippetId: string) {
  const s = ensureSlot(slot)
  const next = new Set(s.snippetIds ?? [])
  if (next.has(snippetId)) next.delete(snippetId)
  else next.add(snippetId)
  s.snippetIds = [...next]
}

function removeSnippet(slot: SlotKey, snippetId: string) {
  const s = ensureSlot(slot)
  s.snippetIds = (s.snippetIds ?? []).filter((id) => id !== snippetId)
}

function slotClassName(slot: SlotKey): string {
  return form.layout[slot]?.className ?? ''
}

function slotStyle(slot: SlotKey): string {
  return form.layout[slot]?.style ?? ''
}

function slotClassNameSet(slot: SlotKey, v: string) {
  ensureSlot(slot).className = v
}

function slotStyleSet(slot: SlotKey, v: string) {
  ensureSlot(slot).style = v
}

async function save() {
  if (!form.name.trim()) {
    saveError.value = 'Name is required'
    return
  }
  // Validate the custom-elements JSON before hitting the API.
  let headerContent: unknown
  let asideContent: unknown
  let footerContent: unknown
  try {
    headerContent = parseSlotContent('header')
    asideContent = parseSlotContent('aside')
    footerContent = parseSlotContent('footer')
  } catch (e: any) {
    saveError.value = 'Invalid JSON in custom elements: ' + (e?.message ?? 'invalid')
    return
  }

  const buildSlot = (slot: SlotKey, content: unknown): TemplateSlot | null => {
    const existing = form.layout[slot]
    if (!existing && content == null) return null
    const base = existing ?? { pageIds: [], snippetIds: [], className: '', style: '' }
    return { ...base, content: content ?? null }
  }

  saving.value = true
  saveOk.value = false
  saveError.value = ''
  try {
    const base = getDefaultCoreApiUrl()
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      pathPatterns: form.pathPatternsText.split('\n').map((p) => p.trim()).filter(Boolean),
      isDefault: form.isDefault,
      layout: {
        header: buildSlot('header', headerContent),
        aside: buildSlot('aside', asideContent),
        footer: buildSlot('footer', footerContent),
      },
    }
    if (editingId.value) {
      await updateWebsiteTemplate(base, props.websiteId, editingId.value, payload)
    } else {
      await createWebsiteTemplate(base, props.websiteId, payload)
    }
    saveOk.value = true
    load()
  } catch (e: any) {
    saveError.value = e?.message || 'Failed to save website template'
  } finally {
    saving.value = false
  }
}

async function remove(t: WebsiteTemplate) {
  if (!window.confirm(`Delete website template "${t.name}"?`)) return
  try {
    await deleteWebsiteTemplate(getDefaultCoreApiUrl(), props.websiteId, t.id)
    if (editingId.value === t.id) {
      editingId.value = ''
      creating.value = false
    }
    load()
  } catch (e: any) {
    error.value = e?.message || 'Failed to delete website template'
  }
}

function slotSummary(slot: TemplateSlot | null | undefined): string {
  if (!slot || slot.pageIds.length === 0) return '—'
  return modulePages.value.filter((p) => slot.pageIds.includes(p.id)).map((p) => p.title).join(', ') || `${slot.pageIds.length} page(s)`
}

onMounted(load)
</script>
