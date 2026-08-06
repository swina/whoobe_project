<template>
  <div v-if="sections.length > 0" class="space-y-2">
    <div class="flex items-center gap-1 border-b border-slate-800 light:border-slate-200 flex-wrap">
      <button
        v-for="(section, index) in sections"
        :key="section.title"
        @click="activeSectionIndex = index"
        type="button"
        :class="[
          'px-3 py-1.5 text-xs font-semibold border-b-4 -mb-px transition cursor-pointer',
          activeSectionIndex === index ? 'border-indigo-500 font-bold text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-500 light:text-slate-700'
        ]"
      >
        {{ section.title }}
      </button>
    </div>
    <div :class="activeContainerLayout.class || 'space-y-4'" :style="activeContainerLayout.style">
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
      v-for="field in resolvedFields"
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
import { resolveCustomClasses } from '../../utils/custom-classes'
import { useComponentsStore } from '../../stores/componentsStore'

const props = defineProps<{
  fields: ClassFieldDefinition[]
  modelValue: Record<string, unknown>
  viewConfig?: ClassViewConfig | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>]
}>()

const componentsStore = useComponentsStore()

// Resolves a natively-authored `fieldcollections` field's own
// `allowedComponentTypes` (names) against the live Components library
// into the exact `collectionTypes`-shaped array DataObjectFieldControl
// .vue's existing editor already expects - docs/plans/datamodel/
// component-fields-plan.md §2.3. Migrated fields (real `collectionTypes`
// already embedded) pass through completely untouched; this only fills
// the gap for a field that has none. Everything downstream (`sections`
// below, the flat `v-else` fallback in the template) reads from this
// instead of `props.fields` directly, so both rendering paths pick up
// resolved Components the same way.
const resolvedFields = computed(() =>
  props.fields.map((f) => {
    if (f.fieldType !== 'fieldcollections' || f.collectionTypes || !f.allowedComponentTypes?.length) return f
    const collectionTypes = f.allowedComponentTypes
      .map((name) => componentsStore.components.find((c) => c.name === name))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ name: c.name, label: c.label, fields: c.fields }))
    return collectionTypes.length > 0 ? { ...f, collectionTypes } : f
  })
)

const sections = computed(() => {
  const named = props.viewConfig?.detailSections ?? []
  if (named.length === 0) return []
  const assigned = new Set(named.flatMap((s) => s.fields))
  const byName = new Map(resolvedFields.value.map((f) => [f.name, f]))
  // Field order within a section follows `s.fields`' own order (admin-
  // reorderable in ClassSettingsCard.vue), not the class's overall field-
  // definition order - a `.map` over `s.fields`, not a `.filter` over
  // `resolvedFields`, so a field's position in the section survives
  // independently of where it sits in the Fields tab.
  const result = named
    .map((s) => ({
      title: s.title,
      fields: s.fields.map((name) => byName.get(name)).filter((f): f is ClassFieldDefinition => !!f),
      containerClass: s.containerClass,
    }))
    .filter((s) => s.fields.length > 0)
  const other = resolvedFields.value.filter((f) => !assigned.has(f.name))
  if (other.length > 0) result.push({ title: 'Other fields', fields: other, containerClass: undefined })
  return result
})

const activeSectionIndex = ref(0)

// Named utilities (grid, gap-5, bg-slate-100, ...) go through :class as
// normal - only arbitrary bracket-value tokens (w-[640px], bg-[#fff],
// ...) get pulled out into real inline style (utils/custom-classes.ts's
// own comment explains why: Tailwind can't compile a class it never
// scanned from literal source, and an admin-typed value from the API
// never is).
const activeContainerLayout = computed(() => resolveCustomClasses(sections.value[activeSectionIndex.value]?.containerClass))

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
