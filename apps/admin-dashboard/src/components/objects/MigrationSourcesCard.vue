<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-4">
    <div>
      <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">Pimcore Migration Sources</h3>
      <p class="text-xs text-slate-500 mt-1">
        Configure a source Pimcore install, then import its classes/objects on demand - no shell or CLI access needed.
        docs/plans/datamodel/native-class-authoring-plan.md §3.4.
      </p>
    </div>

    <!-- Source list -->
    <div v-if="!editorOpen" class="space-y-3">
      <div v-if="store.isLoading" class="text-xs text-slate-500">Loading…</div>
      <div v-else-if="store.sources.length === 0" class="text-xs text-slate-500">No sources configured yet.</div>

      <div v-for="source in store.sources" :key="source.id" class="rounded-lg border border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-white/40 p-3 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm text-slate-200 light:text-slate-800">{{ source.label }}</div>
            <div class="text-xs text-slate-500 font-mono">{{ source.dbUser }}@{{ source.dbHost }}:{{ source.dbPort }}/{{ source.dbName }}</div>
            <div class="text-xs text-slate-600 light:text-slate-400 font-mono">{{ source.classesPath }}</div>
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <button @click="openEditor(source)" type="button" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300">Edit</button>
            <button @click="handleDelete(source)" type="button" class="text-xs font-semibold text-rose-400 hover:text-rose-300">Delete</button>
          </div>
        </div>

        <!-- Import classes: reads var/classes/*.php from classesPath, no DB needed -->
        <div class="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-800/60 light:border-slate-200/60">
          <input
            v-model="classNameFilter[source.id]"
            type="text"
            placeholder="Class name (blank = all)"
            class="flex-1 min-w-[10rem] px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
          />
          <label class="flex items-center gap-1.5 text-xs text-slate-400 light:text-slate-600">
            <input type="checkbox" v-model="dryRunClasses[source.id]" class="w-3.5 h-3.5 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600" />
            dry-run
          </label>
          <button
            @click="handleImportClasses(source)"
            :disabled="runningClasses === source.id"
            type="button"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:bg-slate-200 text-slate-200 light:text-slate-800 disabled:opacity-50"
          >
            {{ runningClasses === source.id ? 'Importing…' : 'Import Classes' }}
          </button>
        </div>

        <!-- Import objects: requires the target class already migrated (has a pimcoreId) -->
        <div class="flex items-center gap-2 flex-wrap">
          <select
            v-model="objectClassName[source.id]"
            class="px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
          >
            <option value="">Class…</option>
            <option v-for="c in migratedClasses" :key="c.id" :value="c.name">{{ c.label }}</option>
          </select>
          <input
            v-model.number="limitByClass[source.id]"
            type="number"
            min="1"
            placeholder="limit"
            class="w-20 px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
          />
          <label class="flex items-center gap-1.5 text-xs text-slate-400 light:text-slate-600">
            <input type="checkbox" v-model="dryRunObjects[source.id]" class="w-3.5 h-3.5 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600" />
            dry-run
          </label>
          <label class="flex items-center gap-1.5 text-xs text-slate-400 light:text-slate-600">
            <input type="checkbox" v-model="clearObjects[source.id]" class="w-3.5 h-3.5 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-rose-600" />
            clear
          </label>
          <button
            @click="handleImportObjects(source)"
            :disabled="runningObjects === source.id || !objectClassName[source.id]"
            type="button"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:bg-slate-200 text-slate-200 light:text-slate-800 disabled:opacity-50"
          >
            {{ runningObjects === source.id ? 'Importing…' : 'Import Objects' }}
          </button>
          <span v-if="migratedClasses.length === 0" class="text-xs text-slate-600 light:text-slate-400 italic">Import classes first.</span>
        </div>

        <!-- Import documents: convert Pimcore pages into whoobe_pages (or stage them first) -->
        <div class="flex items-center gap-2 flex-wrap">
          <input
            v-model.number="documentLimit[source.id]"
            type="number"
            min="1"
            placeholder="limit"
            class="w-20 px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
          />
          <label class="flex items-center gap-1.5 text-xs text-slate-400 light:text-slate-600">
            <input type="checkbox" v-model="dryRunDocuments[source.id]" class="w-3.5 h-3.5 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600" />
            dry-run
          </label>
          <label class="flex items-center gap-1.5 text-xs text-slate-400 light:text-slate-600">
            <input type="checkbox" v-model="stageDocuments[source.id]" class="w-3.5 h-3.5 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-amber-600" />
            stage
          </label>
          <button
            @click="handleImportDocuments(source)"
            :disabled="runningDocuments === source.id"
            type="button"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:bg-slate-200 text-slate-200 light:text-slate-800 disabled:opacity-50"
          >
            {{ runningDocuments === source.id ? 'Importing…' : 'Import Documents' }}
          </button>
        </div>

        <!-- Promote staging: copy whoobe_pages_staging into whoobe_pages -->
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs text-slate-500">Staged migration:</span>
          <label class="flex items-center gap-1.5 text-xs text-slate-400 light:text-slate-600">
            <input type="checkbox" v-model="dryRunPromote[source.id]" class="w-3.5 h-3.5 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600" />
            dry-run
          </label>
          <label class="flex items-center gap-1.5 text-xs text-slate-400 light:text-slate-600">
            <input type="checkbox" v-model="clearAfterPromote[source.id]" class="w-3.5 h-3.5 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-rose-600" />
            clear
          </label>
          <button
            @click="handlePromoteDocuments(source)"
            :disabled="runningPromote === source.id"
            type="button"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:bg-slate-200 text-slate-200 light:text-slate-800 disabled:opacity-50"
          >
            {{ runningPromote === source.id ? 'Promoting…' : 'Promote Staging' }}
          </button>
        </div>

        <!-- Extract Components: convert embedded collectionTypes into data_components -->
        <div class="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-800/60 light:border-slate-200/60">
          <span class="text-xs text-slate-500">Components:</span>
          <input
            v-model="classNameExtract[source.id]"
            type="text"
            placeholder="Class name (blank = all)"
            class="flex-1 min-w-[10rem] px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
          />
          <label class="flex items-center gap-1.5 text-xs text-slate-400 light:text-slate-600">
            <input type="checkbox" v-model="dryRunExtract[source.id]" class="w-3.5 h-3.5 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600" />
            dry-run
          </label>
          <label class="flex items-center gap-1.5 text-xs text-slate-400 light:text-slate-600">
            <input type="checkbox" v-model="clearExtract[source.id]" class="w-3.5 h-3.5 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-rose-600" />
            clear
          </label>
          <button
            @click="handleExtractComponents(source)"
            :disabled="runningExtract === source.id"
            type="button"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:bg-slate-200 text-slate-200 light:text-slate-800 disabled:opacity-50"
          >
            {{ runningExtract === source.id ? 'Extracting…' : 'Extract Components' }}
          </button>
        </div>

        <!-- Last run result -->
        <div v-if="results[source.id]" class="text-xs pt-1">
          <span class="text-emerald-400 font-semibold">{{ results[source.id].succeeded }} succeeded</span>
          <span v-if="results[source.id].failed > 0" class="text-rose-400 font-semibold ml-2">{{ results[source.id].failed }} failed</span>
          <ul v-if="results[source.id].failed > 0" class="mt-1 space-y-0.5 text-rose-300/80">
            <li v-for="(err, i) in results[source.id].errors" :key="i">{{ err.item }}: {{ err.message }}</li>
          </ul>
        </div>
      </div>

      <button @click="openEditor(null)" type="button" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300 pt-1">+ New source</button>
    </div>

    <!-- Source editor -->
    <div v-else class="space-y-3">
      <div class="grid grid-cols-2 gap-2">
        <input v-model="label" type="text" placeholder="Label (e.g. Sanbenedetto Pimcore 10)" class="col-span-2 px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
        <input v-model="dbHost" type="text" placeholder="DB host" class="px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
        <input v-model.number="dbPort" type="number" placeholder="DB port (3306)" class="px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
        <input v-model="dbUser" type="text" placeholder="DB user" class="px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
        <input v-model="dbPassword" type="password" :placeholder="isNew ? 'DB password' : 'DB password (blank = keep current)'" class="px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
        <input v-model="dbName" type="text" placeholder="DB name" class="px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
        <input v-model="classesPath" type="text" placeholder="Filesystem path to var/classes" class="px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
      </div>
      <p class="text-[11px] text-slate-600 light:text-slate-400 italic">
        The classes path must be readable by this server's own process (a shared filesystem/mount with the source Pimcore install) - not something this form can verify.
      </p>

      <div class="flex items-center justify-between pt-2">
        <button @click="closeEditor" type="button" class="text-xs font-semibold text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800">Cancel</button>
        <button
          @click="handleSave"
          :disabled="isSaving || !label.trim() || !dbHost.trim() || !dbUser.trim() || !dbName.trim() || !classesPath.trim() || (isNew && !dbPassword.trim())"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
        >
          {{ isSaving ? 'Saving…' : 'Save Source' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Admin-triggered on-demand Pimcore import - docs/plans/datamodel/native-
// class-authoring-plan.md §3.4/Phase 4. A separate settings card rather
// than folding these actions into ClassSettingsCard.vue, following this
// codebase's own established "one card per concern, cross-reference
// dataClassesStore for the class picker" pattern (WorkflowSettingsCard.vue
// already does the same for per-class workflows rather than living inside
// the class editor itself).
import { reactive, ref, computed } from 'vue'
import { useMigrationSourcesStore } from '../../stores/migrationSourcesStore'
import { useDataClassesStore } from '../../stores/dataClassesStore'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { importClassesFromPimcore, importObjectsFromPimcore, importDocumentsFromPimcore, promoteDocumentsFromStaging, extractComponentsFromClasses, type MigrationSource, type MigrationRunResult } from '../../utils/migration-sources-api'

const store = useMigrationSourcesStore()
const dataClassesStore = useDataClassesStore()
const authStore = useAuthStore()
const toastStore = useToastStore()

// Only classes migrate-objects can actually target (runObjectMigration
// requires a real pimcoreId) - filtering the picker to valid choices here
// is real UX, not the "validate what can't happen" over-caution this
// codebase otherwise avoids; the alternative is a 500 the admin can't
// interpret without reading server logs.
const migratedClasses = computed(() => dataClassesStore.classes.filter((c) => !!c.pimcoreId))

// Per-source-id form state for the two inline import actions - plain
// reactive objects (not pre-seeded per source) since Vue 3's reactive()
// proxies property access regardless of whether the key existed yet.
const classNameFilter = reactive<Record<string, string>>({})
const dryRunClasses = reactive<Record<string, boolean>>({})
const objectClassName = reactive<Record<string, string>>({})
const limitByClass = reactive<Record<string, number | undefined>>({})
const dryRunObjects = reactive<Record<string, boolean>>({})
const clearObjects = reactive<Record<string, boolean>>({})
const documentLimit = reactive<Record<string, number | undefined>>({})
const dryRunDocuments = reactive<Record<string, boolean>>({})
const stageDocuments = reactive<Record<string, boolean>>({})
const dryRunPromote = reactive<Record<string, boolean>>({})
const clearAfterPromote = reactive<Record<string, boolean>>({})
const dryRunExtract = reactive<Record<string, boolean>>({})
const classNameExtract = reactive<Record<string, string>>({})
const clearExtract = reactive<Record<string, boolean>>({})
const results = reactive<Record<string, MigrationRunResult>>({})
const runningClasses = ref<string | null>(null)
const runningObjects = ref<string | null>(null)
const runningDocuments = ref<string | null>(null)
const runningPromote = ref<string | null>(null)
const runningExtract = ref<string | null>(null)

async function handleImportClasses(source: MigrationSource) {
  runningClasses.value = source.id
  try {
    const result = await importClassesFromPimcore(authStore.config.coreApiUrl, source.id, {
      dryRun: !!dryRunClasses[source.id],
      className: classNameFilter[source.id] || undefined,
    })
    results[source.id] = result
    toastStore.show(`${result.succeeded} class(es) imported, ${result.failed} failed`)
    await dataClassesStore.refreshDataClasses()
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to import classes')
  } finally {
    runningClasses.value = null
  }
}

async function handleImportObjects(source: MigrationSource) {
  const className = objectClassName[source.id]
  if (!className) return
  runningObjects.value = source.id
  try {
    const result = await importObjectsFromPimcore(authStore.config.coreApiUrl, source.id, {
      className,
      dryRun: !!dryRunObjects[source.id],
      clear: !!clearObjects[source.id],
      limit: limitByClass[source.id],
    })
    results[source.id] = result
    toastStore.show(`${result.succeeded} object(s) imported, ${result.failed} failed`)
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to import objects')
  } finally {
    runningObjects.value = null
  }
}

async function handleImportDocuments(source: MigrationSource) {
  runningDocuments.value = source.id
  try {
    const result = await importDocumentsFromPimcore(authStore.config.coreApiUrl, source.id, {
      dryRun: !!dryRunDocuments[source.id],
      limit: documentLimit[source.id],
      staging: !!stageDocuments[source.id],
    })
    results[source.id] = result
    toastStore.show(
      stageDocuments[source.id]
        ? `${result.succeeded} document(s) staged, ${result.failed} failed`
        : `${result.succeeded} document(s) imported, ${result.failed} failed`
    )
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to import documents')
  } finally {
    runningDocuments.value = null
  }
}

async function handlePromoteDocuments(source: MigrationSource) {
  runningPromote.value = source.id
  try {
    const result = await promoteDocumentsFromStaging(authStore.config.coreApiUrl, source.id, {
      dryRun: !!dryRunPromote[source.id],
      clear: !!clearAfterPromote[source.id],
    })
    results[source.id] = result
    toastStore.show(`${result.succeeded} staged page(s) promoted, ${result.failed} failed`)
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to promote staged documents')
  } finally {
    runningPromote.value = null
  }
}

async function handleExtractComponents(source: MigrationSource) {
  runningExtract.value = source.id
  try {
    const result = await extractComponentsFromClasses(authStore.config.coreApiUrl, source.id, {
      dryRun: !!dryRunExtract[source.id],
      className: classNameExtract[source.id] || undefined,
      clear: !!clearExtract[source.id],
    })
    results[source.id] = result
    toastStore.show(`${result.succeeded} component(s) extracted, ${result.failed} failed`)
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to extract components')
  } finally {
    runningExtract.value = null
  }
}

// Source editor
const editorOpen = ref(false)
const isNew = ref(true)
const isSaving = ref(false)
const editingId = ref<string | null>(null)

const label = ref('')
const dbHost = ref('')
const dbPort = ref(3306)
const dbUser = ref('')
const dbPassword = ref('')
const dbName = ref('')
const classesPath = ref('')

function openEditor(source: MigrationSource | null) {
  isNew.value = !source
  editingId.value = source?.id ?? null
  label.value = source?.label ?? ''
  dbHost.value = source?.dbHost ?? ''
  dbPort.value = source?.dbPort ?? 3306
  dbUser.value = source?.dbUser ?? ''
  dbPassword.value = ''
  dbName.value = source?.dbName ?? ''
  classesPath.value = source?.classesPath ?? ''
  editorOpen.value = true
}

function closeEditor() {
  editorOpen.value = false
}

async function handleSave() {
  isSaving.value = true
  try {
    const base = {
      label: label.value.trim(),
      dbHost: dbHost.value.trim(),
      dbPort: dbPort.value,
      dbUser: dbUser.value.trim(),
      dbName: dbName.value.trim(),
      classesPath: classesPath.value.trim(),
    }
    if (isNew.value) {
      await store.createMigrationSource({ ...base, dbPassword: dbPassword.value })
    } else {
      await store.updateMigrationSource(editingId.value as string, {
        ...base,
        // Blank means "keep the currently-stored password" - omitted
        // entirely rather than sent as an empty string, matching the
        // backend route's own convention (server.ts).
        ...(dbPassword.value ? { dbPassword: dbPassword.value } : {}),
      })
    }
    toastStore.show('Migration source saved')
    editorOpen.value = false
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to save migration source')
  } finally {
    isSaving.value = false
  }
}

async function handleDelete(source: MigrationSource) {
  if (!confirm(`Delete migration source "${source.label}"?`)) return
  try {
    await store.deleteMigrationSource(source.id)
    toastStore.show('Migration source deleted')
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to delete migration source')
  }
}
</script>
