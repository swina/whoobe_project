<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-4">
    <div>
      <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">Data Object Classes</h3>
      <p class="text-xs text-slate-500 mt-1">
        Define classes and their fields from scratch - no Pimcore migration required. docs/plans/datamodel/native-class-authoring-plan.md §3.1.
      </p>
    </div>

    <!-- Class list - editing opens a real main-strip tab (MasterClassTab.vue)
         rather than expanding inline here, matching how an object/asset/
         document/page each get their own tab. -->
    <div class="space-y-2">
      <div v-if="dataClassesStore.isLoading" class="text-xs text-slate-500">Loading…</div>
      <div v-else-if="dataClassesStore.classes.length === 0" class="text-xs text-slate-500">No classes yet.</div>
      <div
        v-for="dataClass in dataClassesStore.classes"
        :key="dataClass.id"
        class="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-white/40"
      >
        <div>
          <div class="text-sm text-slate-200 light:text-slate-800">{{ dataClass.label }}</div>
          <div class="text-xs text-slate-500">{{ dataClass.name }} · {{ dataClass.fields.length }} field(s)</div>
        </div>
        <div class="flex items-center gap-3">
          <button @click="tabsStore.openClass(dataClass.id)" type="button" class="btn btn-link">Edit</button>
          <button @click="emptyTarget = dataClass" type="button" class="btn btn-link-danger" data-testid="class-empty-data">Empty data</button>
          <button @click="handleDelete(dataClass)" type="button" class="btn btn-link-danger">Delete</button>
        </div>
      </div>

      <div class="flex items-center gap-4">
        <button @click="handleCreate" type="button" class="btn btn-link">+ New class</button>
        <button @click="showWizard = true" type="button" class="btn btn-link" data-testid="class-from-template">+ From template</button>
        <button @click="showFileWizard = true" type="button" class="btn btn-link" data-testid="class-from-file">+ From file (JSON, CSV, Excel)</button>
      </div>
      <EmptyClassModal v-if="emptyTarget" :data-class="emptyTarget" @close="emptyTarget = null" />
      <ClassPresetWizard v-if="showWizard" @close="showWizard = false" @created="onWizardCreated" />
      <ClassFromFileWizard v-if="showFileWizard" @close="showFileWizard = false" @created="(id: string) => { showFileWizard = false; tabsStore.openClass(id) }" />
    </div>
  </div>
</template>

<script setup lang="ts">
// Class Builder - docs/plans/datamodel/native-class-authoring-plan.md
// §3.1/Phase 1. The list/create/delete surface only - the editor itself
// (name/label/Fields/View Layout) lives in MasterClassTab.vue, opened as
// a real main-strip tab (tabsStore.openClass), mirroring how Data Objects
// already open as tabs rather than an inline expand-in-place form.
import type { DataClass } from '../../utils/data-classes-api'
import { useDataClassesStore } from '../../stores/dataClassesStore'
import { useTabsStore } from '../../stores/tabsStore'
import { useToastStore } from '../../stores/toastStore'
import { ref } from 'vue'
import ClassPresetWizard from './ClassPresetWizard.vue'
import ClassFromFileWizard from './ClassFromFileWizard.vue'
import EmptyClassModal from './EmptyClassModal.vue'
import { randomUUID } from '../../utils/random-id'

const dataClassesStore = useDataClassesStore()
const tabsStore = useTabsStore()
const toastStore = useToastStore()

const emptyTarget = ref<DataClass | null>(null)
const showWizard = ref(false)
const showFileWizard = ref(false)
function onWizardCreated(id: string) {
  showWizard.value = false
  tabsStore.openClass(id)
}

function handleCreate() {
  tabsStore.openClass(`new:${randomUUID()}`)
}

async function handleDelete(dataClass: DataClass) {
  if (!confirm(`Delete class "${dataClass.label}"? This only succeeds if it has no objects.`)) return
  try {
    await dataClassesStore.deleteDataClass(dataClass.id)
    toastStore.show('Class deleted')
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to delete class')
  }
}
</script>
