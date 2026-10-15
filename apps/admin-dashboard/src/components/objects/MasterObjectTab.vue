<template>
  <div v-if="dataClass" class="h-full flex flex-col">
    <div class="shrink-0 px-6 pt-6 pb-3 space-y-3">
      <div class="flex items-center gap-2">
        <h3 class="min-w-0 truncate text-lg font-bold text-slate-100 light:text-slate-900" :title="displayTitle">{{ displayTitle }}</h3>
        <span class="shrink-0 px-2 py-0.5 text-xs bg-slate-800 light:bg-slate-100 rounded font-mono text-indigo-300">{{ dataClass.label }}</span>
        <span
          v-if="currentRow"
          :class="[
            'shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase',
            currentRow.published ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
          ]"
        >
          {{ currentRow.published ? 'published' : (currentRow.workflowState || 'draft') }}
        </span>
        <!-- Key: generated automatically (a UUID) for a new object, kept in
             the header after the status badge; still editable. -->
        <label class="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-slate-500 uppercase" title="Object key - generated automatically, editable">
          Key<span class="text-rose-400">*</span>
          <input
            v-model="key"
            type="text"
            class="field w-72 max-w-[40vw] font-mono normal-case"
          />
        </label>
        <div class="flex-1"></div>
        <!-- Reload the record from the server (somebody else saved it, an import ran, a workflow step changed it) -->
        <button type="button" class="btn btn-ghost" data-testid="object-refresh" :disabled="!!isSaving || isLoadingTranslations || !canRefresh"
          :title="canRefresh ? 'Reload this record from the server' : 'Nothing to reload: this record has not been saved yet'" @click="refresh">
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isLoadingTranslations }" /> Refresh
        </button>
        <button
          @click="save(false)"
          :disabled="!!isSaving || !key.trim()"
          class="btn btn-secondary"
        >
          {{ isSaving === 'draft' ? 'Saving…' : 'Save as Draft' }}
        </button>
        <button
          @click="save(true)"
          :disabled="!!isSaving || !key.trim()"
          class="btn btn-primary"
        >
          {{ isSaving === 'published' ? 'Publishing…' : 'Save and Publish' }}
        </button>
      </div>

      <!-- Preview links (object-publish-workflow-plan.md §2.3/§5) - the
           list lives in a modal; this row, under the title, opens it. -->
      <div v-if="currentRow" class="flex items-center gap-3">
        <button type="button" class="btn btn-link" @click="previewLinksOpen = true">
          Preview Links ({{ activePreviewLinkCount }})
        </button>
        <button @click="generateLink" :disabled="isGeneratingLink" class="btn btn-link">
          {{ isGeneratingLink ? 'Generating…' : '+ Generate Preview Link' }}
        </button>
      </div>

      <!-- Locale sub-tabs - one per real translation, plus a "+" for any
           locale not yet present. Pimcore-imported multi-locale records
           (same translationGroupId) are "the same record" per docs/plans/
           datamodel/data-objects-views-editing.md - this is that
           sub-tab system, not a separate tab per language. -->
      <div class="flex items-center gap-2 text-xs font-semibold pt-1">
        <button
          v-for="locale in translations.map((t) => t.locale)"
          :key="locale"
          @click="setLocale(locale)"
          :class="['px-3 py-1.5 rounded-lg transition uppercase', activeLocale === locale ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200']"
        >
          {{ locale }}
        </button>
        <div v-if="!currentRow && activeLocale" class="px-3 py-1.5 rounded-lg bg-indigo-600/40 text-indigo-200 uppercase border border-indigo-500/40">
          {{ activeLocale }} (new)
        </div>
        <div class="relative">
          <select
            :value="''"
            @change="setLocale(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''"
            class="field"
          >
            <option value="" disabled>+ Add locale…</option>
            <option v-for="locale in availableNewLocales" :key="locale" :value="locale">{{ locale }}</option>
          </select>
        </div>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto px-6 pb-6 space-y-4">
      <DataObjectForm :fields="dataClass.fields" :view-config="dataClass.viewConfig" v-model="attributes" />

      <!-- Workflow (object-publish-workflow-plan.md §2.4/§5) -->
      <div v-if="currentRow && workflow" class="pt-2 border-t border-slate-800 light:border-slate-200 space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold text-slate-400 light:text-slate-600">Workflow state:</span>
          <span class="px-2 py-0.5 text-[10px] font-bold rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 uppercase">{{ workflowPlace }}</span>
        </div>
        <div v-if="validTransitions.length === 0" class="text-xs text-slate-600 light:text-slate-400 italic">No transitions available from this place.</div>
        <div v-else class="flex flex-wrap gap-2">
          <button
            v-for="transition in validTransitions"
            :key="transition.name"
            @click="applyTransition(transition.name)"
            :disabled="isTransitioning || !canUseTransition(transition)"
            :title="!canUseTransition(transition) ? 'You lack the permission for this transition' : ''"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600/80 hover:bg-violet-500 text-white disabled:opacity-40"
          >
            {{ transition.name }} → {{ transition.to }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="p-6 text-center text-xs text-slate-500">Loading class…</div>

  <PreviewLinksModal
    v-if="previewLinksOpen && currentRow"
    :links="previewLinks"
    :generating="isGeneratingLink"
    :url-for="previewUrl"
    @close="previewLinksOpen = false"
    @generate="generateLink"
    @revoke="revokeLink"
    @delete="deleteLink"
  />
</template>

<script setup lang="ts">
// A Data Object opens as a real tab, not a modal, and Pimcore-imported
// multi-locale records (same translationGroupId) are "the same record"
// edited via a locale sub-tab system inside this one tab - see
// docs/plans/datamodel/data-objects-views-editing.md. Deliberately does
// NOT read/write through dataObjectsStore's own shared `objects` list
// (that list belongs to whichever class ObjectsView.vue's filter
// currently shows, and could be re-pointed at a different class while
// this tab stays open in the background) - calls the API client
// directly instead, the same way MasterPageTab.vue/WhoobeOneEmbed.vue
// already do for their own real API clients.
import { ref, computed, watch, onMounted } from 'vue'
import { RefreshCw } from '@lucide/vue'
import { isTransitionValid, type WorkflowTransitionDefinition } from '@whoobe-cms/core'
import { useTabsStore, objectTabId } from '../../stores/tabsStore'
import { useDataClassesStore } from '../../stores/dataClassesStore'
import { useToastStore } from '../../stores/toastStore'
import { useAuthStore } from '../../stores/authStore'
import {
  fetchDataObjectTranslationsByGroup,
  createDataObject,
  updateDataObject,
  createPreviewLink,
  fetchPreviewLinks,
  revokePreviewLink,
  deletePreviewLink,
  transitionDataObject,
  type DataObject,
  type PreviewToken,
} from '../../utils/data-objects-api'
import { fetchWorkflowDefinition, type WorkflowDefinition } from '../../utils/data-classes-api'
import DataObjectForm from './DataObjectForm.vue'
import PreviewLinksModal from './PreviewLinksModal.vue'
import { randomUUID } from '../../utils/random-id'

const props = defineProps<{
  translationGroupId: string
  classId: string
}>()

const tabsStore = useTabsStore()
const dataClassesStore = useDataClassesStore()
const toastStore = useToastStore()
const authStore = useAuthStore()

const dataClass = computed(() => dataClassesStore.classes.find((c) => c.id === props.classId))

// The real backend translationGroupId, once known - starts as whatever
// was passed in (a real id for an existing record, a client-generated
// placeholder for a brand-new one) and is replaced by the real one the
// server mints on this tab's first-ever save, so later "+ Add locale"
// saves in the same session join the correct real group.
const realTranslationGroupId = ref(props.translationGroupId)

// ObjectsView.vue's handleCreate() mints a client-side placeholder id
// (`new:<uuid>`) for a brand-new record's tab, since `translationGroupId`
// is a real Postgres `uuid` column - passing that placeholder straight to
// the backend would 500 on invalid uuid input, so it must never reach an
// API call. It's replaced by the server's real id on first save (below).
const isPlaceholderGroupId = props.translationGroupId.startsWith('new:')

const translations = ref<DataObject[]>([])
const isLoadingTranslations = ref(!isPlaceholderGroupId)

const ALL_LOCALES = ['en', 'it']

async function loadTranslations() {
  // the placeholder id is replaced by the real one on the first save: from then on the record can be loaded
  if (realTranslationGroupId.value.startsWith('new:')) return
  isLoadingTranslations.value = true
  try {
    translations.value = await fetchDataObjectTranslationsByGroup(authStore.config.coreApiUrl, realTranslationGroupId.value)
  } catch (e) {
    console.warn('Could not load object translations:', e)
  } finally {
    isLoadingTranslations.value = false
  }
}

const currentTab = computed(() => tabsStore.tabs.find((t) => t.itemKind === 'object' && t.itemId === props.translationGroupId))
const activeLocale = computed(() => currentTab.value?.objectSubTab ?? translations.value[0]?.locale ?? 'en')

function setLocale(locale: string) {
  tabsStore.setObjectSubTab(props.translationGroupId, locale)
}

const availableNewLocales = computed(() => ALL_LOCALES.filter((l) => !translations.value.some((t) => t.locale === l)))

const currentRow = computed(() => translations.value.find((t) => t.locale === activeLocale.value) ?? null)

const key = ref('')
const attributes = ref<Record<string, unknown>>({})

// Header title: the key is now an auto-generated UUID, so show the object's
// own title/name when it has one (any such text field, by conventional name),
// falling back to the key for a saved object and "New <class>" before the
// first save.
const displayTitle = computed(() => {
  for (const name of ['title', 'name', 'label']) {
    const v = attributes.value[name]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return currentRow.value ? key.value : `New ${dataClass.value?.label ?? ''}`.trim()
})
const isSaving = ref<'draft' | 'published' | null>(null)

watch(
  currentRow,
  (row) => {
    // A brand-new object gets a generated key (UUID); a new locale of an
    // existing object keeps the group's key.
    key.value = row?.key ?? translations.value[0]?.key ?? randomUUID()
    if (row) {
      attributes.value = { ...row.attributes }
    } else {
      // A brand-new locale for an object that already has sibling locale
      // rows - seed non-localized fields from an existing sibling so a
      // "not localized" field (e.g. a shared asset/image) shows up
      // immediately in this tab too, not just blank until the first save
      // (data-objects-records.ts's own create/updateDataObject sync
      // handles the reverse direction - this row's own values propagating
      // back out to siblings once saved).
      const sibling = translations.value[0]
      if (sibling && dataClass.value) {
        const nonLocalizedNames = new Set(dataClass.value.fields.filter((f) => !f.localized).map((f) => f.name))
        attributes.value = Object.fromEntries(Object.entries(sibling.attributes).filter(([name]) => nonLocalizedNames.has(name)))
      } else {
        attributes.value = {}
      }
    }
  },
  { immediate: true }
)

// The tab shows the object's title (same text as the header), not its UUID
// key - kept in sync as the title is edited; the tab strip truncates it.
function refreshTabLabel() {
  if (displayTitle.value) tabsStore.setTabLabel(objectTabId(props.translationGroupId), displayTitle.value)
}
watch(displayTitle, refreshTabLabel)

async function save(publish: boolean) {
  if (!dataClass.value) return
  isSaving.value = publish ? 'published' : 'draft'
  try {
    if (currentRow.value) {
      const updated = await updateDataObject(authStore.config.coreApiUrl, currentRow.value.id, {
        key: key.value.trim(),
        attributes: attributes.value,
        published: publish,
      })
      const index = translations.value.findIndex((t) => t.id === updated.id)
      if (index >= 0) translations.value[index] = updated
    } else {
      const created = await createDataObject(authStore.config.coreApiUrl, {
        classId: dataClass.value.id,
        key: key.value.trim(),
        locale: activeLocale.value,
        // Omitted entirely for this tab's very first save (no real group
        // yet) - the backend's own column default mints a fresh one,
        // captured below for any further locale this tab adds.
        translationGroupId: translations.value.length > 0 ? realTranslationGroupId.value : undefined,
        attributes: attributes.value,
      })
      realTranslationGroupId.value = created.translationGroupId
      translations.value.push(created)
      if (publish) {
        const republished = await updateDataObject(authStore.config.coreApiUrl, created.id, { published: true })
        const index = translations.value.findIndex((t) => t.id === republished.id)
        if (index >= 0) translations.value[index] = republished
      }
    }
    refreshTabLabel()
    toastStore.show('Saved')
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to save object')
  } finally {
    isSaving.value = null
  }
}

// Preview links
const previewLinks = ref<PreviewToken[]>([])
const isGeneratingLink = ref(false)
const previewLinksOpen = ref(false)

// Links that still work (neither revoked nor expired) - the count on the button.
const activePreviewLinkCount = computed(
  () => previewLinks.value.filter((l) => !l.revokedAt && new Date(l.expiresAt).getTime() > Date.now()).length
)

function previewUrl(token: string): string {
  return `${authStore.config.coreApiUrl}/preview/objects/${token}`
}

async function loadPreviewLinks() {
  if (!currentRow.value) return
  try {
    previewLinks.value = await fetchPreviewLinks(authStore.config.coreApiUrl, currentRow.value.id)
  } catch (e: any) {
    console.warn('Could not load preview links:', e)
  }
}

async function generateLink() {
  if (!currentRow.value) return
  isGeneratingLink.value = true
  try {
    await createPreviewLink(authStore.config.coreApiUrl, currentRow.value.id)
    await loadPreviewLinks()
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to generate preview link')
  } finally {
    isGeneratingLink.value = false
  }
}

async function revokeLink(token: string) {
  try {
    await revokePreviewLink(authStore.config.coreApiUrl, token)
    await loadPreviewLinks()
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to revoke preview link')
  }
}

async function deleteLink(token: string) {
  if (!confirm('Delete this revoked preview link permanently?')) return
  try {
    await deletePreviewLink(authStore.config.coreApiUrl, token)
    await loadPreviewLinks()
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to delete preview link')
  }
}

watch(currentRow, () => loadPreviewLinks())

// Workflow
const workflow = ref<WorkflowDefinition | null>(null)
const workflowPlace = ref('')
const isTransitioning = ref(false)

async function loadWorkflow() {
  if (!dataClass.value) return
  try {
    workflow.value = await fetchWorkflowDefinition(authStore.config.coreApiUrl, dataClass.value.id)
  } catch (e: any) {
    console.warn('Could not load workflow definition:', e)
  }
}

watch(
  [currentRow, workflow],
  () => {
    if (workflow.value) workflowPlace.value = currentRow.value?.workflowState ?? workflow.value.initialPlace
  },
  { immediate: true }
)

const validTransitions = computed<WorkflowTransitionDefinition[]>(() => {
  if (!workflow.value) return []
  return workflow.value.transitions.filter((t) => isTransitionValid(workflow.value!, workflowPlace.value, t.name))
})

function canUseTransition(transition: WorkflowTransitionDefinition): boolean {
  if (!transition.allowedPermissions || transition.allowedPermissions.length === 0) return true
  return transition.allowedPermissions.some((p) => authStore.can(p))
}

async function applyTransition(transitionName: string) {
  if (!currentRow.value) return
  isTransitioning.value = true
  try {
    const updated = await transitionDataObject(authStore.config.coreApiUrl, currentRow.value.id, transitionName)
    const index = translations.value.findIndex((t) => t.id === updated.id)
    if (index >= 0) translations.value[index] = updated
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to apply transition')
  } finally {
    isTransitioning.value = false
  }
}

// Unsaved edits: the form differs from the row it was filled from.
function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v))
}
const isDirty = computed(() => {
  const row = currentRow.value
  return !!row && (key.value !== row.key || stable(attributes.value) !== stable(row.attributes ?? {}))
})
const canRefresh = computed(() => !realTranslationGroupId.value.startsWith('new:'))

async function refresh() {
  if (!canRefresh.value || isSaving.value) return
  if (isDirty.value && !confirm('Discard your unsaved changes and reload this record from the server?')) return
  // the form is refilled by the watcher on currentRow, which sees the freshly loaded rows
  await loadTranslations()
  refreshTabLabel()
  await Promise.all([loadPreviewLinks(), loadWorkflow()])
  toastStore.show('Record reloaded')
}

onMounted(async () => {
  await loadTranslations()
  refreshTabLabel()
  await Promise.all([loadPreviewLinks(), loadWorkflow()])
})
</script>
