<template>
  <div class="fixed inset-0 z-[9000] bg-black/60 flex items-center justify-center p-6" @click.self="emit('close')">
    <div class="w-full max-w-2xl max-h-[85vh] flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
      <div class="shrink-0 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h3 class="text-sm font-bold text-slate-100">{{ isCreate ? `New ${dataClass.label}` : dataObject!.key }}</h3>
          <p class="text-xs text-slate-500 font-mono">{{ dataClass.label }}</p>
        </div>
        <button @click="emit('close')" class="text-slate-500 hover:text-slate-300 text-lg leading-none">✕</button>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
        <div>
          <label class="block text-xs font-semibold text-slate-400 mb-1">Key<span class="text-rose-400"> *</span></label>
          <input
            v-model="key"
            type="text"
            placeholder="e.g. san-benedetto"
            class="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <DataObjectForm :fields="dataClass.fields" v-model="attributes" />

        <!-- Workflow (object-publish-workflow-plan.md §2.4/§5) - only shown
             once the object exists and its class actually has a workflow
             defined (most classes won't - they just get the plain
             Draft/Published toggle below). -->
        <div v-if="!isCreate && workflow" class="pt-2 border-t border-slate-800 space-y-2">
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-slate-400">Workflow state:</span>
            <span class="px-2 py-0.5 text-[10px] font-bold rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 uppercase">{{ currentPlace }}</span>
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

        <!-- Preview links (object-publish-workflow-plan.md §2.3/§5) - only
             once the object exists for real, since a link resolves a real id. -->
        <div v-if="!isCreate" class="pt-2 border-t border-slate-800 space-y-2">
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

      <div class="shrink-0 px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-2">
        <button @click="emit('close')" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200">
          Cancel
        </button>
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { isTransitionValid, type WorkflowTransitionDefinition } from '@pimcore-custom/core'
import { useDataObjectsStore } from '../../stores/dataObjectsStore'
import { useToastStore } from '../../stores/toastStore'
import { useAuthStore } from '../../stores/authStore'
import {
  createPreviewLink,
  fetchPreviewLinks,
  revokePreviewLink,
  transitionDataObject,
  type PreviewToken,
} from '../../utils/data-objects-api'
import { fetchWorkflowDefinition, type WorkflowDefinition } from '../../utils/data-classes-api'
import type { DataClass } from '../../utils/data-classes-api'
import type { DataObject } from '../../utils/data-objects-api'
import DataObjectForm from './DataObjectForm.vue'

const props = defineProps<{
  dataClass: DataClass
  dataObject?: DataObject | null
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const dataObjectsStore = useDataObjectsStore()
const toastStore = useToastStore()
const authStore = useAuthStore()

const isCreate = !props.dataObject
const key = ref(props.dataObject?.key ?? '')
const attributes = ref<Record<string, unknown>>({ ...(props.dataObject?.attributes ?? {}) })
const isSaving = ref<'draft' | 'published' | null>(null)

const previewLinks = ref<PreviewToken[]>([])
const isGeneratingLink = ref(false)

function previewUrl(token: string): string {
  return `${authStore.config.coreApiUrl}/preview/objects/${token}`
}

async function loadPreviewLinks() {
  if (isCreate) return
  try {
    previewLinks.value = await fetchPreviewLinks(authStore.config.coreApiUrl, props.dataObject!.id)
  } catch (e: any) {
    console.warn('Could not load preview links:', e)
  }
}

async function generateLink() {
  isGeneratingLink.value = true
  try {
    await createPreviewLink(authStore.config.coreApiUrl, props.dataObject!.id)
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

const workflow = ref<WorkflowDefinition | null>(null)
const currentPlace = ref('')
const isTransitioning = ref(false)

async function loadWorkflow() {
  if (isCreate) return
  try {
    workflow.value = await fetchWorkflowDefinition(authStore.config.coreApiUrl, props.dataClass.id)
    if (workflow.value) currentPlace.value = props.dataObject!.workflowState ?? workflow.value.initialPlace
  } catch (e: any) {
    console.warn('Could not load workflow definition:', e)
  }
}

// Computed the same way core-api's own /transition route validates a
// transition (isTransitionValid, real shared logic from
// @pimcore-custom/core - not a hand-duplicated check) - the server still
// re-validates on submit regardless, this is just so the UI doesn't
// offer a button that's certain to be rejected.
const validTransitions = computed<WorkflowTransitionDefinition[]>(() => {
  if (!workflow.value) return []
  return workflow.value.transitions.filter((t) => isTransitionValid(workflow.value!, currentPlace.value, t.name))
})

function canUseTransition(transition: WorkflowTransitionDefinition): boolean {
  if (!transition.allowedPermissions || transition.allowedPermissions.length === 0) return true
  return transition.allowedPermissions.some((p) => authStore.can(p))
}

async function applyTransition(transitionName: string) {
  isTransitioning.value = true
  try {
    const updated = await transitionDataObject(authStore.config.coreApiUrl, props.dataObject!.id, transitionName)
    currentPlace.value = updated.workflowState ?? workflow.value!.initialPlace
    emit('saved')
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to apply transition')
  } finally {
    isTransitioning.value = false
  }
}

onMounted(() => {
  loadPreviewLinks()
  loadWorkflow()
})

async function save(publish: boolean) {
  isSaving.value = publish ? 'published' : 'draft'
  try {
    if (isCreate) {
      const created = await dataObjectsStore.createDataObject({
        classId: props.dataClass.id,
        key: key.value.trim(),
        attributes: attributes.value,
      })
      // The create route has no `published` field of its own (matching
      // createWhoobePage's identical shape) - a second call flips it,
      // same as updating any other existing object.
      if (publish) await dataObjectsStore.updateDataObject(created.id, { published: true })
    } else {
      await dataObjectsStore.updateDataObject(props.dataObject!.id, {
        key: key.value.trim(),
        attributes: attributes.value,
        published: publish,
      })
    }
    emit('saved')
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to save object')
  } finally {
    isSaving.value = null
  }
}
</script>
