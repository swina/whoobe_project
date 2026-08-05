<template>
  <div v-if="dataClass" class="h-full flex flex-col">
    <div class="shrink-0 px-6 pt-6 pb-3 space-y-3">
      <div class="flex items-center gap-2">
        <h3 class="text-lg font-bold text-slate-100">{{ key || `New ${dataClass.label}` }}</h3>
        <span class="px-2 py-0.5 text-xs bg-slate-800 rounded font-mono text-indigo-300">{{ dataClass.label }}</span>
        <span
          v-if="currentRow"
          :class="[
            'px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase',
            currentRow.published ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
          ]"
        >
          {{ currentRow.published ? 'published' : (currentRow.workflowState || 'draft') }}
        </span>
        <div class="flex-1"></div>
        <button
          @click="save(false)"
          :disabled="!!isSaving || !key.trim()"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50"
        >
          {{ isSaving === 'draft' ? 'Saving…' : 'Save as Draft' }}
        </button>
        <button
          @click="save(true)"
          :disabled="!!isSaving || !key.trim()"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
        >
          {{ isSaving === 'published' ? 'Publishing…' : 'Save and Publish' }}
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
          :class="['px-3 py-1.5 rounded-lg transition uppercase', activeLocale === locale ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800']"
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
            class="px-2 py-1.5 text-xs bg-slate-950 border border-dashed border-slate-700 rounded-lg text-indigo-400 focus:outline-none focus:border-indigo-500"
          >
            <option value="" disabled>+ Add locale…</option>
            <option v-for="locale in availableNewLocales" :key="locale" :value="locale">{{ locale }}</option>
          </select>
        </div>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto px-6 pb-6 space-y-4">
      <div>
        <label class="block text-xs font-semibold text-slate-400 mb-1">Key<span class="text-rose-400"> *</span></label>
        <input
          v-model="key"
          type="text"
          placeholder="e.g. san-benedetto"
          class="w-full max-w-md px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
        />
      </div>

      <DataObjectForm :fields="dataClass.fields" v-model="attributes" />

      <!-- Workflow (object-publish-workflow-plan.md §2.4/§5) -->
      <div v-if="currentRow && workflow" class="pt-2 border-t border-slate-800 space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold text-slate-400">Workflow state:</span>
          <span class="px-2 py-0.5 text-[10px] font-bold rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 uppercase">{{ workflowPlace }}</span>
        </div>
        <div v-if="validTransitions.length === 0" class="text-xs text-slate-600 italic">No transitions available from this place.</div>
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

      <!-- Preview links (object-publish-workflow-plan.md §2.3/§5) -->
      <div v-if="currentRow" class="pt-2 border-t border-slate-800 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-400">Preview Links</span>
          <button @click="generateLink" :disabled="isGeneratingLink" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300 disabled:opacity-50">
            {{ isGeneratingLink ? 'Generating…' : '+ Generate Preview Link' }}
          </button>
        </div>
        <div v-if="previewLinks.length === 0" class="text-xs text-slate-600 italic">No preview links yet.</div>
        <div v-for="link in previewLinks" :key="link.token" class="flex items-center justify-between gap-2 rounded-lg bg-slate-950/40 border border-slate-800 px-3 py-2">
          <div class="min-w-0">
            <div class="text-xs font-mono text-slate-300 truncate">{{ previewUrl(link.token) }}</div>
            <div class="text-[10px] text-slate-500">
              {{ link.revokedAt ? 'Revoked' : `Expires ${new Date(link.expiresAt).toLocaleString()}` }} · {{ link.viewCount }} view(s)
            </div>
          </div>
          <button v-if="!link.revokedAt" @click="revokeLink(link.token)" class="text-[10px] font-semibold text-rose-400 hover:text-rose-300 shrink-0">Revoke</button>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="p-6 text-center text-xs text-slate-500">Loading class…</div>
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
import { isTransitionValid, type WorkflowTransitionDefinition } from '@pimcore-custom/core'
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
  transitionDataObject,
  type DataObject,
  type PreviewToken,
} from '../../utils/data-objects-api'
import { fetchWorkflowDefinition, type WorkflowDefinition } from '../../utils/data-classes-api'
import DataObjectForm from './DataObjectForm.vue'

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
  if (isPlaceholderGroupId) return
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
const isSaving = ref<'draft' | 'published' | null>(null)

watch(
  currentRow,
  (row) => {
    key.value = row?.key ?? translations.value[0]?.key ?? ''
    attributes.value = { ...(row?.attributes ?? {}) }
  },
  { immediate: true }
)

function refreshTabLabel() {
  if (key.value) tabsStore.setTabLabel(objectTabId(props.translationGroupId), key.value)
}

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

onMounted(async () => {
  await loadTranslations()
  refreshTabLabel()
  await Promise.all([loadPreviewLinks(), loadWorkflow()])
})
</script>
