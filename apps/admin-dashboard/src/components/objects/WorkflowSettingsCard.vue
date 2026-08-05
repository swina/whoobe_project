<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-4">
    <div>
      <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">Data Object Workflows</h3>
      <p class="text-xs text-slate-500 mt-1">
        Author an admin-defined workflow (places + transitions) for one class - docs/plans/backend/object-publish-workflow-plan.md §2.4. A class
        with no workflow just gets the plain Draft/Published toggle.
      </p>
    </div>

    <select
      v-model="selectedClassId"
      @change="loadWorkflow"
      class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
    >
      <option value="">Select a class…</option>
      <option v-for="dataClass in dataClassesStore.classes" :key="dataClass.id" :value="dataClass.id">{{ dataClass.label }}</option>
    </select>

    <div v-if="selectedClassId" class="space-y-4">
      <div v-if="isLoading" class="text-xs text-slate-500">Loading…</div>

      <template v-else>
        <!-- Places -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-slate-400 light:text-slate-600">Places</span>
            <button @click="addPlace" type="button" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300">+ Add place</button>
          </div>
          <div v-for="(place, index) in places" :key="index" class="flex items-center gap-2">
            <input v-model="place.name" type="text" placeholder="name (e.g. draft)" class="flex-1 px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
            <input v-model="place.label" type="text" placeholder="Label" class="flex-1 px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
            <button @click="removePlace(index)" type="button" class="text-xs text-rose-400 hover:text-rose-300 shrink-0">Remove</button>
          </div>
        </div>

        <!-- Initial place -->
        <div>
          <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Initial place</label>
          <select v-model="initialPlace" class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500">
            <option value="">—</option>
            <option v-for="place in places" :key="place.name" :value="place.name">{{ place.name }}</option>
          </select>
        </div>

        <!-- Transitions -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-slate-400 light:text-slate-600">Transitions</span>
            <button @click="addTransition" type="button" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300">+ Add transition</button>
          </div>
          <div v-for="(transition, index) in transitions" :key="index" class="rounded-lg border border-slate-800 light:border-slate-200 p-3 space-y-2">
            <div class="grid grid-cols-3 gap-2">
              <input v-model="transition.name" type="text" placeholder="name (e.g. approve)" class="px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
              <input :value="transition.from.join(', ')" @input="transition.from = splitList(($event.target as HTMLInputElement).value)" type="text" placeholder="from (comma-separated places)" class="px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
              <select v-model="transition.to" class="px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500">
                <option value="">to place…</option>
                <option v-for="place in places" :key="place.name" :value="place.name">{{ place.name }}</option>
              </select>
            </div>
            <div class="grid grid-cols-3 gap-2 items-center">
              <input :value="(transition.allowedPermissions ?? []).join(', ')" @input="transition.allowedPermissions = splitList(($event.target as HTMLInputElement).value)" type="text" placeholder="allowed permissions (comma-separated)" class="col-span-2 px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
              <label class="flex items-center gap-1.5 text-xs text-slate-400 light:text-slate-600">
                <input type="checkbox" :checked="transition.setPublished === true" @change="transition.setPublished = ($event.target as HTMLInputElement).checked" class="w-3.5 h-3.5 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600" />
                sets Published
              </label>
            </div>
            <button @click="removeTransition(index)" type="button" class="text-xs text-rose-400 hover:text-rose-300">Remove transition</button>
          </div>
        </div>

        <div class="flex items-center justify-between pt-2">
          <button v-if="hasExistingWorkflow" @click="handleDelete" type="button" class="text-xs font-semibold text-rose-400 hover:text-rose-300">
            Remove workflow (revert to plain Draft/Published)
          </button>
          <div v-else></div>
          <button
            @click="handleSave"
            :disabled="isSaving || !initialPlace || places.length === 0"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
          >
            {{ isSaving ? 'Saving…' : 'Save Workflow' }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
// Settings sub-page for authoring per-class workflows - docs/plans/
// backend/object-publish-workflow-plan.md §5/§7 Phase 4. A plain
// form editor (add/remove places/transitions) - a graphical drag-and-
// drop editor is explicitly "nice-to-have, not required for v1" per
// that plan's own §5, so not attempted here.
import { ref } from 'vue'
import type { WorkflowPlace, WorkflowTransitionDefinition } from '@pimcore-custom/core'
import { useDataClassesStore } from '../../stores/dataClassesStore'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { fetchWorkflowDefinition, saveWorkflowDefinition, deleteWorkflowDefinition } from '../../utils/data-classes-api'

const dataClassesStore = useDataClassesStore()
const authStore = useAuthStore()
const toastStore = useToastStore()

const selectedClassId = ref('')
const isLoading = ref(false)
const isSaving = ref(false)
const hasExistingWorkflow = ref(false)

const places = ref<WorkflowPlace[]>([])
const initialPlace = ref('')
const transitions = ref<WorkflowTransitionDefinition[]>([])

function splitList(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean)
}

function addPlace() {
  places.value.push({ name: '', label: '' })
}

function removePlace(index: number) {
  places.value.splice(index, 1)
}

function addTransition() {
  transitions.value.push({ name: '', from: [], to: '' })
}

function removeTransition(index: number) {
  transitions.value.splice(index, 1)
}

async function loadWorkflow() {
  if (!selectedClassId.value) return
  isLoading.value = true
  try {
    const workflow = await fetchWorkflowDefinition(authStore.config.coreApiUrl, selectedClassId.value)
    hasExistingWorkflow.value = !!workflow
    places.value = workflow?.places ?? []
    initialPlace.value = workflow?.initialPlace ?? ''
    transitions.value = workflow?.transitions ?? []
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to load workflow')
  } finally {
    isLoading.value = false
  }
}

async function handleSave() {
  isSaving.value = true
  try {
    await saveWorkflowDefinition(authStore.config.coreApiUrl, selectedClassId.value, {
      initialPlace: initialPlace.value,
      places: places.value,
      transitions: transitions.value,
    })
    hasExistingWorkflow.value = true
    toastStore.show('Workflow saved')
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to save workflow')
  } finally {
    isSaving.value = false
  }
}

async function handleDelete() {
  if (!confirm('Remove this class\'s workflow? Objects revert to the plain Draft/Published toggle.')) return
  try {
    await deleteWorkflowDefinition(authStore.config.coreApiUrl, selectedClassId.value)
    hasExistingWorkflow.value = false
    places.value = []
    transitions.value = []
    initialPlace.value = ''
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to remove workflow')
  }
}
</script>
