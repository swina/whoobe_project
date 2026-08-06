<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-4">
    <div>
      <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">Components</h3>
      <p class="text-xs text-slate-500 mt-1">
        Reusable structured field lists a "Components (repeatable)" class field can hold a mix of - docs/plans/datamodel/component-fields-plan.md.
        This is the same concept Pimcore calls a Field Collection, under a name that doesn't assume any Pimcore background.
      </p>
    </div>

    <!-- Component list -->
    <div v-if="!editorOpen" class="space-y-2">
      <div v-if="componentsStore.isLoading" class="text-xs text-slate-500">Loading…</div>
      <div v-else-if="componentsStore.components.length === 0" class="text-xs text-slate-500">No components yet.</div>
      <div
        v-for="component in componentsStore.components"
        :key="component.id"
        class="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-white/40"
      >
        <div>
          <div class="text-sm text-slate-200 light:text-slate-800">{{ component.label }}</div>
          <div class="text-xs text-slate-500">{{ component.name }} · {{ component.fields.length }} field(s)</div>
        </div>
        <div class="flex items-center gap-3">
          <button @click="openEditor(component)" type="button" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300">Edit</button>
          <button @click="handleDelete(component)" type="button" class="text-xs font-semibold text-rose-400 hover:text-rose-300">Delete</button>
        </div>
      </div>

      <button @click="openEditor(null)" type="button" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300 pt-1">+ New component</button>
    </div>

    <!-- Component editor -->
    <div v-else class="space-y-4">
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Name (identifier)</label>
          <input
            v-model="name"
            :disabled="!isNew"
            type="text"
            placeholder="e.g. Banner"
            class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Label</label>
          <input
            v-model="label"
            type="text"
            placeholder="e.g. Banner"
            class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <!-- Real in-use check - component-fields-plan.md §2.5/Phase 4. -->
      <p v-if="!isNew && inUse" class="text-xs text-amber-400">
        This component is referenced by at least one existing object - a field's name or type can't be changed while that's true, and it
        can't be deleted; adding new fields or editing title/mandatory/localized/options is fine.
      </p>

      <!-- allow-field-collections=false: nesting a Component inside
           another Component is untested territory - component-fields-
           plan.md §5's own open question, not silently allowed here. -->
      <FieldListEditor v-model="fields" :allow-field-collections="false" />

      <div class="flex items-center justify-between pt-2">
        <button @click="closeEditor" type="button" class="text-xs font-semibold text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800">Cancel</button>
        <button
          @click="handleSave"
          :disabled="isSaving || !name.trim() || !label.trim()"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
        >
          {{ isSaving ? 'Saving…' : 'Save Component' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Component Type authoring - docs/plans/datamodel/component-fields-
// plan.md §2.4/Phase 3 (editor) + §2.5/Phase 4 (real in-use guardrail).
// Structurally near-identical to ClassSettingsCard.vue's own class editor
// (name/label/field list/save/delete) - a Component Type is, on purpose,
// "a class with no object instances of its own" (§2.1's own framing) -
// minus the View Layout tab (Components have no detail-form layout
// concept of their own in v1). The in-use check itself (`inUse` below)
// mirrors ClassSettingsCard.vue's own `objectCount`, just backed by a
// genuinely different query (data-components-records.ts's own
// isDataComponentInUse - a Component has no direct `classId`-shaped
// column to check against, it's referenced by name from inside arbitrary
// JSONB).
import { ref } from 'vue'
import type { ClassFieldDefinition } from '@pimcore-custom/core'
import { useComponentsStore } from '../../stores/componentsStore'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { fetchDataComponentUsage, type DataComponent } from '../../utils/data-components-api'
import FieldListEditor from './FieldListEditor.vue'

const componentsStore = useComponentsStore()
const authStore = useAuthStore()
const toastStore = useToastStore()

const editorOpen = ref(false)
const isNew = ref(true)
const isSaving = ref(false)
const editingId = ref<string | null>(null)
const inUse = ref(false)

const name = ref('')
const label = ref('')
const fields = ref<ClassFieldDefinition[]>([])

function openEditor(component: DataComponent | null) {
  isNew.value = !component
  editingId.value = component?.id ?? null
  name.value = component?.name ?? ''
  label.value = component?.label ?? ''
  fields.value = component ? component.fields.map((f) => ({ ...f })) : []
  inUse.value = false
  editorOpen.value = true
  if (component) {
    fetchDataComponentUsage(authStore.config.coreApiUrl, component.id)
      .then((value) => (inUse.value = value))
      .catch(() => {})
  }
}

function closeEditor() {
  editorOpen.value = false
}

async function handleSave() {
  isSaving.value = true
  try {
    if (isNew.value) {
      await componentsStore.createComponent({ name: name.value.trim(), label: label.value.trim(), fields: fields.value })
    } else {
      await componentsStore.updateComponent(editingId.value as string, { label: label.value.trim(), fields: fields.value })
    }
    toastStore.show('Component saved')
    editorOpen.value = false
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to save component')
  } finally {
    isSaving.value = false
  }
}

async function handleDelete(component: DataComponent) {
  if (!confirm(`Delete component "${component.label}"? This only succeeds if no existing object still references it.`)) return
  try {
    await componentsStore.deleteComponent(component.id)
    toastStore.show('Component deleted')
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to delete component')
  }
}
</script>
