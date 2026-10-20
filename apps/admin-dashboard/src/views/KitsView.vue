<template>
  <div class="flex flex-col h-full gap-6" data-testid="kits-view">
    <div class="shrink-0 flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold text-slate-100 light:text-slate-900">Kits</h2>
        <p class="text-xs text-slate-400 light:text-slate-600">
          Template bundles for the Whoobe One editor (Kits panel). Shipped kits are read-only: duplicate one to edit the copy. Download a kit as a zip before deleting it.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="selectedIds.size > 0" class="text-xs text-slate-400 light:text-slate-600">{{ selectedIds.size }} selected</span>
        <button class="btn btn-secondary" :disabled="exportTargets.length === 0" data-testid="kits-export" @click="exportZip(exportTargets)">
          {{ selectedIds.size > 0 ? `Export selected (${selectedIds.size})` : 'Export all' }}
        </button>
        <button v-if="deletableSelected.length > 0" class="btn btn-danger" data-testid="kits-delete-selected" @click="askDelete(deletableSelected)">
          Delete selected ({{ deletableSelected.length }})
        </button>
        <button class="btn btn-success" data-testid="kits-import" @click="fileInput?.click()">Import</button>
        <input ref="fileInput" type="file" accept=".zip,.json" class="hidden" @change="importFile" />
      </div>
    </div>

    <div v-if="importResult" class="shrink-0 p-3 rounded-xl text-xs" :class="importResult.errors.length ? 'bg-amber-900/40 border border-amber-700/50 text-amber-200' : 'bg-emerald-900/40 border border-emerald-700/50 text-emerald-200'">
      <strong>Import complete:</strong> {{ importResult.created }} created.
      <ul v-if="importResult.errors.length" class="mt-1 list-disc list-inside text-amber-300">
        <li v-for="err in importResult.errors" :key="err">{{ err }}</li>
      </ul>
    </div>

    <div class="shrink-0 flex flex-col sm:flex-row gap-4 p-4 rounded-xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200">
      <input v-model="search" type="text" placeholder="Search by name..." class="field flex-1" />
      <select v-model="categoryFilter" class="field sm:w-auto">
        <option value="">All categories</option>
        <option v-for="c in categories" :key="c" :value="c" class="capitalize">{{ c }}</option>
      </select>
      <select v-model="originFilter" class="field sm:w-auto">
        <option value="">All kits</option>
        <option value="shipped">Shipped (read-only)</option>
        <option value="user">Mine</option>
      </select>
    </div>

    <div v-if="loading && kits.length === 0" class="shrink-0 p-12 text-center text-xs text-slate-500">Loading kits…</div>
    <div v-else-if="error" class="shrink-0 p-3 rounded-xl text-xs bg-rose-900/40 border border-rose-700/50 text-rose-200">{{ error }}</div>
    <div v-else-if="filtered.length === 0" class="shrink-0 rounded-2xl bg-slate-900/40 light:bg-white/40 border border-slate-800/80 light:border-slate-200/80 p-12 text-center text-xs text-slate-500">
      <template v-if="kits.length === 0">No kits yet. Add a template to a kit from the Whoobe One editor, or import a kit.</template>
      <template v-else>No kits match the current filters.</template>
    </div>

    <div v-else class="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200">
      <table class="w-full text-left text-xs text-slate-300 light:text-slate-700">
        <thead class="sticky top-0 z-10 bg-slate-950/80 light:bg-white/80 border-b border-slate-800 light:border-slate-200 text-[11px] font-semibold text-slate-400 light:text-slate-600 uppercase tracking-wider backdrop-blur-sm">
          <tr>
            <th class="py-3 px-4 w-10">
              <input type="checkbox" :checked="allSelected" :indeterminate="selectedIds.size > 0 && !allSelected" class="w-4 h-4 cursor-pointer" aria-label="Select all" @change="toggleAll" />
            </th>
            <th class="py-3 px-4">Name</th>
            <th class="py-3 px-4">Category</th>
            <th class="py-3 px-4">Origin</th>
            <th class="py-3 px-4">Templates</th>
            <th class="py-3 px-4">Updated</th>
            <th class="py-3 px-4">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/60 light:divide-slate-200/60">
          <tr v-for="kit in filtered" :key="kit.id" class="hover:bg-slate-800/90 light:bg-slate-100/50 transition" :data-testid="`kit-row-${kit.id}`">
            <td class="py-2.5 px-4 w-10">
              <input type="checkbox" :checked="selectedIds.has(kit.id)" class="w-4 h-4 cursor-pointer" :aria-label="`Select ${kit.name}`" @change="toggle(kit.id)" />
            </td>
            <td class="py-2.5 px-4">
              <span class="font-semibold text-slate-100 light:text-slate-900 inline-flex items-center gap-2"><Library class="w-4 h-4 text-teal-400 inline" /> {{ kit.name }}</span>
              <div v-if="kit.forkedFrom" class="text-[10px] text-slate-500">copy of {{ nameOf(kit.forkedFrom) }}</div>
              <div v-if="kit.description" class="text-[10px] text-slate-500 truncate max-w-md" :title="kit.description">{{ kit.description }}</div>
            </td>
            <td class="py-2.5 px-4 text-slate-400 light:text-slate-600 capitalize">{{ kit.category || '—' }}</td>
            <td class="py-2.5 px-4">
              <span v-if="kit.origin === 'user'" class="text-slate-400 light:text-slate-600">Mine</span>
              <span v-else class="inline-flex items-center gap-1 text-amber-400" title="Read-only: duplicate it to edit"><Lock class="w-3 h-3" /> {{ kit.origin === 'bundled' ? 'Shipped' : 'Catalogue' }} v{{ kit.version }}</span>
            </td>
            <td class="py-2.5 px-4 text-slate-400 light:text-slate-600">{{ kit.templates.length }}</td>
            <td class="py-2.5 px-4 text-slate-400 light:text-slate-600">{{ new Date(kit.updatedAt).toLocaleString() }}</td>
            <td class="py-2.5 px-4 whitespace-nowrap">
              <button class="btn btn-link mr-3" title="Preview the templates; edit a copy" :data-testid="`kit-preview-${kit.id}`" @click="previewing = kit"><Eye class="w-4 h-4" /></button>
              <button v-if="kit.origin === 'user'" class="btn btn-link mr-3" title="Edit name, category, description" :data-testid="`kit-edit-${kit.id}`" @click="startEdit(kit)"><Pencil class="w-4 h-4" /></button>
              <button class="btn btn-link mr-3" title="Duplicate to an editable copy" :data-testid="`kit-duplicate-${kit.id}`" @click="duplicate(kit)"><Copy class="w-4 h-4" /></button>
              <button class="btn btn-link mr-3" title="Download as zip" :data-testid="`kit-export-${kit.id}`" @click="exportZip([kit])"><Download class="w-4 h-4" /></button>
              <button v-if="kit.origin === 'user'" class="btn btn-link-danger" title="Delete kit" :data-testid="`kit-delete-${kit.id}`" @click="askDelete([kit])"><Trash class="w-4 h-4" /></button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- The kit's templates (the editor's own kit page in an iframe): Preview, Edit, Edit a copy. Closing refreshes the list. -->
    <div v-if="previewing" class="fixed inset-0 z-[10000] bg-slate-950 flex flex-col" data-testid="kit-preview-overlay">
      <div class="shrink-0 flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800">
        <span class="text-sm font-semibold text-slate-100 truncate">{{ previewing.name }}</span>
        <div class="flex items-center gap-2">
          <span class="text-xs text-slate-500 hidden sm:inline">A shipped kit is never changed: Edit a copy works on a duplicate.</span>
          <button type="button" class="btn btn-secondary" data-testid="kit-preview-close" @click="closePreview">Close</button>
        </div>
      </div>
      <iframe :src="previewSrc" class="flex-1 min-h-0 w-full border-0 bg-white" :title="`Kit ${previewing.name}`"></iframe>
    </div>

    <BaseModal v-if="editing" :open="true" size="md" title="Edit kit" @close="editing = null">
      <div class="space-y-3">
        <div><label class="field-label" for="kit-name">Name</label><input id="kit-name" v-model="editing.name" class="field" data-autofocus /></div>
        <div><label class="field-label" for="kit-category">Category</label><input id="kit-category" v-model="editing.category" class="field" /></div>
        <div><label class="field-label" for="kit-description">Description</label><textarea id="kit-description" v-model="editing.description" class="field" rows="3"></textarea></div>
        <p v-if="editError" class="text-xs text-rose-400">{{ editError }}</p>
      </div>
      <template #footer>
        <button class="btn btn-ghost" @click="editing = null">Cancel</button>
        <button class="btn btn-primary" :disabled="!editing.name.trim()" data-testid="kit-edit-save" @click="saveEdit">Save</button>
      </template>
    </BaseModal>

    <BaseModal v-if="deleting" :open="true" size="md" :title="deleting.length === 1 ? `Delete “${deleting[0].name}”?` : `Delete ${deleting.length} kits?`" @close="deleting = null">
      <p class="text-sm">A deleted kit cannot be brought back. Download it as a zip first if you may want it later: the zip can be imported again.</p>
      <ul v-if="deleting.length > 1" class="mt-2 text-xs list-disc list-inside text-slate-400">
        <li v-for="k in deleting" :key="k.id">{{ k.name }} ({{ k.templates.length }} templates)</li>
      </ul>
      <p v-if="deleteError" class="mt-2 text-xs text-rose-400">{{ deleteError }}</p>
      <template #footer>
        <button class="btn btn-ghost" @click="deleting = null">Cancel</button>
        <button class="btn btn-danger" data-testid="kit-delete-only" @click="confirmDelete(false)">Delete</button>
        <button class="btn btn-primary" data-testid="kit-delete-with-zip" @click="confirmDelete(true)">Download zip, then delete</button>
      </template>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import JSZip from 'jszip'
import { Library, Lock, Pencil, Copy, Download, Trash, Eye } from '@lucide/vue'
import BaseModal from '../components/ui/BaseModal.vue'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'
import { fetchKits, createKit, updateKit, duplicateKit, deleteKit, type WhoobeKit } from '../utils/kits-api'
import { slugify } from '../utils/slugify'
import { getWhoobeOneSpikeUrl } from '../utils/editor-urls'

const authStore = useAuthStore()
const toastStore = useToastStore()

const kits = ref<WhoobeKit[]>([])
const loading = ref(false)
const error = ref('')
const search = ref('')
const categoryFilter = ref('')
const originFilter = ref('')
const selectedIds = ref<Set<string>>(new Set())
const fileInput = ref<HTMLInputElement | null>(null)
const importResult = ref<{ created: number; errors: string[] } | null>(null)

const editing = ref<{ id: string; name: string; category: string; description: string } | null>(null)
const editError = ref('')
const deleting = ref<WhoobeKit[] | null>(null)
const deleteError = ref('')
const previewing = ref<WhoobeKit | null>(null)

const previewSrc = computed(() => {
  if (!previewing.value) return ''
  const params = new URLSearchParams({ kitId: previewing.value.id, parentOrigin: window.location.origin })
  return `${getWhoobeOneSpikeUrl()}/kit-preview?${params.toString()}`
})

function closePreview() {
  previewing.value = null
  refresh()
}

const baseUrl = () => authStore.config.coreApiUrl

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    kits.value = await fetchKits(baseUrl())
    // forget a selection that no longer exists
    selectedIds.value = new Set([...selectedIds.value].filter((id) => kits.value.some((k) => k.id === id)))
  } catch (e: any) {
    error.value = e?.message || 'Failed to load kits'
  } finally {
    loading.value = false
  }
}

const categories = computed(() => [...new Set(kits.value.map((k) => k.category).filter(Boolean))].sort())

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return kits.value.filter((k) => {
    if (q && !k.name.toLowerCase().includes(q)) return false
    if (categoryFilter.value && k.category !== categoryFilter.value) return false
    if (originFilter.value === 'user' && k.origin !== 'user') return false
    if (originFilter.value === 'shipped' && k.origin === 'user') return false
    return true
  })
})

const allSelected = computed(() => filtered.value.length > 0 && filtered.value.every((k) => selectedIds.value.has(k.id)))
const selectedKits = computed(() => kits.value.filter((k) => selectedIds.value.has(k.id)))
const exportTargets = computed(() => (selectedKits.value.length ? selectedKits.value : filtered.value))
// shipped kits cannot be deleted (the distribution would bring them back)
const deletableSelected = computed(() => selectedKits.value.filter((k) => k.origin === 'user'))

function toggle(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function toggleAll() {
  selectedIds.value = allSelected.value ? new Set() : new Set(filtered.value.map((k) => k.id))
}

function nameOf(id: string): string {
  return kits.value.find((k) => k.id === id)?.name ?? 'a deleted kit'
}

function startEdit(kit: WhoobeKit) {
  editError.value = ''
  editing.value = { id: kit.id, name: kit.name, category: kit.category, description: kit.description ?? '' }
}

async function saveEdit() {
  if (!editing.value) return
  try {
    await updateKit(baseUrl(), editing.value.id, { name: editing.value.name, category: editing.value.category, description: editing.value.description })
    editing.value = null
    await refresh()
  } catch (e: any) {
    editError.value = e?.message || 'Failed to save the kit'
  }
}

async function duplicate(kit: WhoobeKit) {
  try {
    const copy = await duplicateKit(baseUrl(), kit.id)
    toastStore.show(`Created “${copy.name}”.`)
    await refresh()
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to duplicate the kit')
  }
}

// What a kit file holds: the same shape the distribution's kit files (packages/core/seed-data/kits) and the import use.
function kitFile(kit: WhoobeKit) {
  return { name: kit.name, slug: kit.slug ?? undefined, version: kit.version, description: kit.description ?? '', category: kit.category, templates: kit.templates }
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function exportZip(targets: WhoobeKit[]) {
  if (targets.length === 0) return
  const zip = new JSZip()
  const used = new Set<string>()
  for (const kit of targets) {
    const base = slugify(kit.slug || kit.name) || 'kit'
    let file = `${base}.json`
    for (let i = 2; used.has(file); i++) file = `${base}-${i}.json`
    used.add(file)
    zip.file(file, JSON.stringify(kitFile(kit), null, 2))
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  const name = targets.length === 1 ? `${slugify(targets[0].name) || 'kit'}-kit` : `whoobe-kits-${new Date().toISOString().slice(0, 10)}`
  download(blob, `${name}.zip`)
}

function askDelete(targets: WhoobeKit[]) {
  deleteError.value = ''
  deleting.value = targets.filter((k) => k.origin === 'user')
}

async function confirmDelete(withZip: boolean) {
  const targets = deleting.value
  if (!targets?.length) return
  try {
    // the zip comes first: if it cannot be made nothing is deleted
    if (withZip) await exportZip(targets)
    for (const kit of targets) await deleteKit(baseUrl(), kit.id)
    deleting.value = null
    selectedIds.value = new Set()
    toastStore.show(`${targets.length} kit(s) deleted.`)
    await refresh()
  } catch (e: any) {
    deleteError.value = e?.message || 'Failed to delete'
    await refresh()
  }
}

function asKitFile(raw: any): { name: string; description: string | null; category: string; templates: any[] } | null {
  if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string' || !raw.name.trim() || !Array.isArray(raw.templates)) return null
  return { name: raw.name, description: typeof raw.description === 'string' ? raw.description : null, category: typeof raw.category === 'string' ? raw.category : '', templates: raw.templates }
}

async function importFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const errors: string[] = []
  let created = 0
  try {
    const parts: { label: string; data: any }[] = []
    if (file.name.toLowerCase().endsWith('.zip')) {
      const zip = await JSZip.loadAsync(file)
      for (const entry of Object.values(zip.files)) {
        if (entry.dir || !entry.name.toLowerCase().endsWith('.json')) continue
        try {
          parts.push({ label: entry.name, data: JSON.parse(await entry.async('string')) })
        } catch {
          errors.push(`${entry.name}: not valid JSON`)
        }
      }
    } else {
      parts.push({ label: file.name, data: JSON.parse(await file.text()) })
    }
    for (const part of parts) {
      for (const raw of Array.isArray(part.data) ? part.data : [part.data]) {
        const kit = asKitFile(raw)
        if (!kit) {
          errors.push(`${part.label}: expected a kit with a name and a list of templates`)
          continue
        }
        try {
          await createKit(baseUrl(), kit)
          created++
        } catch (e: any) {
          errors.push(`${kit.name}: ${e?.message || 'failed'}`)
        }
      }
    }
  } catch (e: any) {
    errors.push(`${file.name}: ${e?.message || 'cannot be read'}`)
  } finally {
    input.value = ''
  }
  importResult.value = { created, errors }
  await refresh()
}

onMounted(refresh)
</script>
