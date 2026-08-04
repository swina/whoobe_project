<template>
  <div class="space-y-4">
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
import type { ClassFieldDefinition } from '@pimcore-custom/core'
import DataObjectFieldControl from './DataObjectFieldControl.vue'

const props = defineProps<{
  fields: ClassFieldDefinition[]
  modelValue: Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>]
}>()

function updateField(name: string, value: unknown) {
  emit('update:modelValue', { ...props.modelValue, [name]: value })
}
</script>
