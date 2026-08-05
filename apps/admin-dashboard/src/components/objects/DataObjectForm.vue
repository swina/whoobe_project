<template>
  <div v-if="sections.length > 0" class="space-y-4">
    <div class="flex items-center gap-1 border-b border-slate-800 light:border-slate-200 flex-wrap">
      <button
        v-for="(section, index) in sections"
        :key="section.title"
        @click="activeSectionIndex = index"
        type="button"
        :class="[
          'px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px transition',
          activeSectionIndex === index ? 'border-indigo-500 text-indigo-300' : 'border-transparent text-slate-500 hover:text-slate-300 light:text-slate-700'
        ]"
      >
        {{ section.title }}
      </button>
    </div>
    <div class="space-y-4">
      <DataObjectFieldControl
        v-for="field in sections[activeSectionIndex]?.fields ?? []"
        :key="field.name"
        :field="field"
        :model-value="modelValue[field.name]"
        @update:model-value="(value) => updateField(field.name, value)"
      />
    </div>
  </div>

  <div v-else class="space-y-4">
    <DataObjectFieldControl
      v-for="field in fields"
      :key="field.name"
      :field="field"
      :model-value="modelValue[field.name]"
      @update:model-value="(value) => updateField(field.name, value)"
    />
  </div>
</template>

<script setup lang="ts">
// The dynamic object-detail form - one control per field, keyed by
// fieldType (docs/plans/datamodel/advanced-data-modeling-plan.md §6.3,
// Phase 2). This component just iterates the field list and manages the
// attributes object; DataObjectFieldControl.vue does the actual per-type
// rendering (and recurses back into this same component for `block`
// fields' repeatable rows).
//
// Optional grouped rendering (native-class-authoring-plan.md §3.3, Phase
// 3; reworked into real tabs per docs/plans/UI/editing-object-class.md's
// own "a tab for each defined section" instruction - previously stacked,
// headed groups): when the class carries a `viewConfig.detailSections`
// layout, each section becomes a tab; any field not assigned to a named
// section still renders, under a trailing "Other fields" tab, so nothing
// a class defines can be silently hidden by a stale/incomplete layout.
// Absent `viewConfig`, this is identical to the original flat rendering -
// the `v-else` branch below, kept rather than unified with the tabbed
// branch so an unconfigured class (the common case, every migrated class
// today) isn't paying for a one-tab indirection it doesn't need.
import { ref, computed, watch } from 'vue'
import type { ClassFieldDefinition, ClassViewConfig } from '@pimcore-custom/core'
import DataObjectFieldControl from './DataObjectFieldControl.vue'

const props = defineProps<{
  fields: ClassFieldDefinition[]
  modelValue: Record<string, unknown>
  viewConfig?: ClassViewConfig | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>]
}>()

const sections = computed(() => {
  const named = props.viewConfig?.detailSections ?? []
  if (named.length === 0) return []
  const assigned = new Set(named.flatMap((s) => s.fields))
  const result = named
    .map((s) => ({ title: s.title, fields: props.fields.filter((f) => s.fields.includes(f.name)) }))
    .filter((s) => s.fields.length > 0)
  const other = props.fields.filter((f) => !assigned.has(f.name))
  if (other.length > 0) result.push({ title: 'Other fields', fields: other })
  return result
})

const activeSectionIndex = ref(0)

// Keeps the active tab in range if the class's own section count changes
// out from under this form (e.g. this component instance is reused for a
// different class's object without remounting) - not a reset on every
// render, so switching locale sub-tabs for the same record/class doesn't
// jump the user back to the first tab.
watch(sections, (value) => {
  if (activeSectionIndex.value >= value.length) activeSectionIndex.value = 0
})

function updateField(name: string, value: unknown) {
  emit('update:modelValue', { ...props.modelValue, [name]: value })
}
</script>
