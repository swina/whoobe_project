<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <span class="text-xs font-semibold text-slate-400 light:text-slate-600">Fields</span>
      <button @click="addField" type="button" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300">+ Add field</button>
    </div>

    <div v-for="(field, index) in modelValue" :key="index" class="rounded-lg border border-slate-800 light:border-slate-200 p-3 space-y-2">
      <div class="grid grid-cols-4 gap-2">
        <input
          v-model="field.name"
          type="text"
          placeholder="name (attribute key)"
          class="px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
        />
        <input
          v-model="field.title"
          type="text"
          placeholder="Title (display label)"
          class="px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
        />
        <select
          v-model="field.fieldType"
          class="px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
        >
          <option v-for="ft in fieldTypes" :key="ft.value" :value="ft.value">{{ ft.label }}</option>
        </select>
        <div class="flex items-center gap-3 px-1">
          <label class="flex items-center gap-1.5 text-xs text-slate-400 light:text-slate-600">
            <input
              type="checkbox"
              :checked="field.mandatory === true"
              @change="field.mandatory = ($event.target as HTMLInputElement).checked"
              class="w-3.5 h-3.5 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600"
            />
            required
          </label>
          <label class="flex items-center gap-1.5 text-xs text-slate-400 light:text-slate-600">
            <input
              type="checkbox"
              :checked="field.localized === true"
              @change="field.localized = ($event.target as HTMLInputElement).checked"
              class="w-3.5 h-3.5 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600"
            />
            localized
          </label>
        </div>
      </div>

      <input
        v-if="field.fieldType === 'select' || field.fieldType === 'multiselect'"
        :value="(field.options ?? []).join(', ')"
        @input="field.options = splitList(($event.target as HTMLInputElement).value)"
        type="text"
        placeholder="options (comma-separated)"
        class="w-full px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
      />

      <select
        v-if="field.fieldType === 'manyToOneRelation' || field.fieldType === 'manyToManyRelation'"
        v-model="field.relationTarget"
        class="w-full px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
      >
        <option value="">Relates to…</option>
        <option v-for="dataClass in dataClassesStore.classes" :key="dataClass.id" :value="dataClass.name">{{ dataClass.label }}</option>
      </select>

      <select
        v-if="field.fieldType === 'asset'"
        v-model="field.assetFilter"
        class="w-full px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
      >
        <option v-for="opt in ASSET_FILTER_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>

      <!-- Allowed Components - docs/plans/datamodel/component-fields-
           plan.md §2.4. Only offered when fieldType is 'fieldcollections',
           which itself is only offered at all when `allowFieldCollections`
           is true (Components' own field editor passes false - nesting a
           Component inside another Component is untested territory per
           that plan's own §5, not silently allowed here). -->
      <div v-if="field.fieldType === 'fieldcollections'" class="space-y-1">
        <span class="text-[11px] font-semibold text-slate-500 uppercase">Allowed components</span>
        <div class="flex flex-wrap gap-3">
          <label v-for="component in componentsStore.components" :key="component.id" class="flex items-center gap-1.5 text-xs text-slate-400 light:text-slate-600">
            <input
              type="checkbox"
              :checked="(field.allowedComponentTypes ?? []).includes(component.name)"
              @change="toggleAllowedComponent(field, component.name)"
              class="w-3.5 h-3.5 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600"
            />
            {{ component.label }}
          </label>
          <span v-if="componentsStore.components.length === 0" class="text-xs text-slate-600 light:text-slate-400 italic">
            No components defined yet - create one under Settings → Components first.
          </span>
        </div>
      </div>

      <input
        v-model="field.className"
        type="text"
        placeholder="Custom classes for this field's control (e.g. col-span-2, bg-slate-50, p-3) - optional"
        class="w-full px-2 py-1.5 text-[11px] font-mono bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
      />

      <div class="flex items-center justify-between pt-1">
        <div class="flex items-center gap-2">
          <button @click="moveField(index, -1)" type="button" :disabled="index === 0" class="text-xs text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 disabled:opacity-30">↑</button>
          <button @click="moveField(index, 1)" type="button" :disabled="index === modelValue.length - 1" class="text-xs text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 disabled:opacity-30">↓</button>
        </div>
        <button @click="removeField(index)" type="button" class="text-xs text-rose-400 hover:text-rose-300">Remove field</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Shared field-list editor - docs/plans/datamodel/component-fields-
// plan.md §2.4. Extracted out of ClassSettingsCard.vue (native-class-
// authoring-plan.md §3.1/Phase 1's original home for this editor), since
// a Component Type needs field-for-field the exact same editor a class's
// own Fields tab already had - not a second, independently-maintained
// near-copy that quietly drifts from this one over time.
import type { ClassFieldDefinition } from '@pimcore-custom/core'
import { useDataClassesStore } from '../../stores/dataClassesStore'
import { useComponentsStore } from '../../stores/componentsStore'
import type { AssetCategoryFilter } from '../../utils/asset-category'

const props = withDefaults(
  defineProps<{
    modelValue: ClassFieldDefinition[]
    // Components' own field editor passes false - see the template's own
    // comment on why nesting isn't offered.
    allowFieldCollections?: boolean
  }>(),
  { allowFieldCollections: true }
)

const emit = defineEmits<{
  'update:modelValue': [value: ClassFieldDefinition[]]
}>()

const dataClassesStore = useDataClassesStore()
const componentsStore = useComponentsStore()

// v1 field-type list (native-class-authoring-plan.md §3.1) - `block`
// authoring is deliberately excluded (native-class-authoring-plan.md §5's
// open question), though a field carrying it from migration still renders
// fine via the existing dynamic form; this editor just doesn't offer
// creating it fresh yet. `asset`/`image`/`video` reach the real DAM
// picker (AssetFieldPicker.vue); `fieldcollections` reaches the real
// Component editor (DataObjectFieldControl.vue, resolved via
// DataObjectForm.vue - component-fields-plan.md §2.3), gated by
// `allowFieldCollections`.
const ALL_FIELD_TYPES = [
  { value: 'input', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'wysiwyg', label: 'Rich text' },
  { value: 'numeric', label: 'Number' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'date', label: 'Date' },
  { value: 'email', label: 'Email' },
  { value: 'country', label: 'Country' },
  { value: 'select', label: 'Select (single)' },
  { value: 'multiselect', label: 'Select (multiple)' },
  { value: 'manyToOneRelation', label: 'Relation (single)' },
  { value: 'manyToManyRelation', label: 'Relation (multiple)' },
  { value: 'link', label: 'Link' },
  { value: 'asset', label: 'Asset (any DAM file)' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'fieldcollections', label: 'Components (repeatable)' },
]

const fieldTypes = props.allowFieldCollections ? ALL_FIELD_TYPES : ALL_FIELD_TYPES.filter((ft) => ft.value !== 'fieldcollections')

const ASSET_FILTER_OPTIONS: { value: AssetCategoryFilter; label: string }[] = [
  { value: 'any', label: 'Any file type' },
  { value: 'image', label: 'Images only' },
  { value: 'video', label: 'Videos only' },
  { value: 'document', label: 'Documents only' },
  { value: 'archive', label: 'Archives only' },
]

function splitList(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean)
}

function toggleAllowedComponent(field: ClassFieldDefinition, name: string) {
  const current = new Set(field.allowedComponentTypes ?? [])
  if (current.has(name)) current.delete(name)
  else current.add(name)
  field.allowedComponentTypes = [...current]
}

function addField() {
  emit('update:modelValue', [...props.modelValue, { name: '', title: '', fieldType: 'input' }])
}

function removeField(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index))
}

function moveField(index: number, direction: 1 | -1) {
  const target = index + direction
  if (target < 0 || target >= props.modelValue.length) return
  const next = [...props.modelValue]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved)
  emit('update:modelValue', next)
}
</script>
