<template>
  <div class="grid md:grid-cols-[16rem_1fr] gap-4 items-start">
    <!-- Left: field list - fixed height with its own internal scroll, so a
         long field list never pushes the editor card below the fold. -->
    <div class="rounded-lg border border-slate-800 light:border-slate-200 overflow-hidden h-[32rem] flex flex-col">
      <div class="flex items-center justify-between px-3 py-2 border-b border-slate-800/60 light:border-slate-200/60 shrink-0">
        <span class="text-xs font-semibold text-slate-400 light:text-slate-600">
          Fields <span class="text-slate-600 light:text-slate-400">({{ modelValue.length }})</span>
        </span>
        <button @click="addField" type="button" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300">+ Add field</button>
      </div>

      <div v-if="modelValue.length === 0" class="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center">
        <p class="text-xs text-slate-600 light:text-slate-400">No fields yet.</p>
        <button @click="addField" type="button" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white">+ Add field</button>
      </div>

      <ul v-else class="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-800/60 light:divide-slate-200/60">
        <li
          v-for="(field, index) in modelValue"
          :key="index"
          :class="[
            'group flex items-center gap-2 px-3 py-2 cursor-pointer transition',
            index === selectedIndex ? 'bg-indigo-500/10 border-l-2 border-indigo-500' : 'border-l-2 border-transparent hover:bg-slate-800/40 light:hover:bg-slate-50'
          ]"
          @click="selectedIndex = index"
        >
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 min-w-0">
              <component
                :is="fieldTypeIcon(field.fieldType)"
                class="w-3.5 h-3.5 shrink-0"
                :class="index === selectedIndex ? 'text-indigo-400' : 'text-slate-500'"
              />
              <span class="text-xs font-semibold text-slate-200 light:text-slate-800 truncate">{{ field.title || field.name || '(unnamed field)' }}</span>
            </div>
            <div class="text-[10px] text-slate-500 truncate pl-6">{{ fieldTypeLabel(field.fieldType) }}</div>
          </div>
          <div class="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition">
            <button
              @click.stop="moveField(index, -1)"
              type="button"
              :disabled="index === 0"
              class="p-1 text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 disabled:opacity-30"
              title="Move up"
            >↑</button>
            <button
              @click.stop="moveField(index, 1)"
              type="button"
              :disabled="index === modelValue.length - 1"
              class="p-1 text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 disabled:opacity-30"
              title="Move down"
            >↓</button>
            <button
              @click.stop="removeField(index)"
              type="button"
              class="p-1 text-slate-400 light:text-slate-600 hover:text-rose-400"
              title="Remove field"
            >✕</button>
          </div>
        </li>
      </ul>
    </div>

    <!-- Right: settings for the selected field - sticks to the top of the
         scroll container while the left list scrolls independently. -->
    <div class="rounded-lg border border-slate-800 light:border-slate-200 p-4 min-h-[24rem] md:sticky md:top-0">
      <div v-if="modelValue.length === 0" class="h-full flex flex-col items-center justify-center gap-2 text-center">
        <p class="text-sm text-slate-600 light:text-slate-400">Add a field to start defining this class's attributes.</p>
      </div>

      <div v-else-if="!selectedField" class="h-full flex items-center justify-center">
        <p class="text-xs text-slate-600 light:text-slate-400 italic">Select a field on the left to edit its settings.</p>
      </div>

      <template v-else>
        <div class="flex items-center gap-2 pb-3 mb-3 border-b border-slate-800/60 light:border-slate-200/60">
          <component :is="fieldTypeIcon(selectedField.fieldType)" class="w-4 h-4 text-indigo-400 shrink-0" />
          <span class="text-sm font-semibold text-slate-200 light:text-slate-800 truncate">
            {{ selectedField.title || selectedField.name || '(unnamed field)' }}
          </span>
          <span class="text-[10px] text-slate-500 shrink-0">{{ fieldTypeLabel(selectedField.fieldType) }}</span>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <div class="flex flex-col gap-1">
          <span class="text-xs text-slate-400 light:text-slate-600">Name</span>
          <input
            v-model="selectedField.name"
            type="text"
            placeholder="name (attribute key)"
            class="px-2 py-1.5 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
          />
          </div>
          <div class="flex flex-col gap-1">
          <span class="text-xs text-slate-400 light:text-slate-600">Title</span>
          <input
            v-model="selectedField.title"
            type="text"
            placeholder="Title (display label)"
            class="px-2 py-1.5 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
          />
          </div>
          <div class="flex flex-col gap-1">
          <span class="text-xs text-slate-400 light:text-slate-600">Type</span>
          <select
            v-model="selectedField.fieldType"
            class="px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
          >
            <option v-for="ft in fieldTypes" :key="ft.value" :value="ft.value">{{ ft.label }}</option>
          </select>
          </div>
        </div>

        <div class="flex items-center gap-3 px-1 mt-2">
          <label class="flex items-center gap-1.5 text-sm text-slate-400 light:text-slate-600">
            <input
              type="checkbox"
              :checked="selectedField.mandatory === true"
              @change="selectedField.mandatory = ($event.target as HTMLInputElement).checked"
              class="w-3.5 h-3.5 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600"
            />
            required
          </label>
          <label class="flex items-center gap-1.5 text-sm text-slate-400 light:text-slate-600">
            <input
              type="checkbox"
              :checked="selectedField.localized === true"
              @change="selectedField.localized = ($event.target as HTMLInputElement).checked"
              class="w-3.5 h-3.5 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600"
            />
            localized
          </label>
        </div>

        <input
          v-if="selectedField.fieldType === 'select' || selectedField.fieldType === 'multiselect'"
          :value="(selectedField.options ?? []).join(', ')"
          @input="selectedField.options = splitList(($event.target as HTMLInputElement).value)"
          type="text"
          placeholder="options (comma-separated)"
          class="w-full px-2 py-1.5 text-xs mt-2 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
        />

        <select
          v-if="selectedField.fieldType === 'manyToOneRelation' || selectedField.fieldType === 'manyToManyRelation'"
          v-model="selectedField.relationTarget"
          class="w-full px-2 py-1.5 text-xs mt-2 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
        >
          <option value="">Relates to…</option>
          <option v-for="dataClass in dataClassesStore.classes" :key="dataClass.id" :value="dataClass.name">{{ dataClass.label }}</option>
        </select>

        <select
          v-if="selectedField.fieldType === 'asset'"
          v-model="selectedField.assetFilter"
          class="w-full px-2 py-1.5 text-xs mt-2 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
        >
          <option v-for="opt in ASSET_FILTER_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>

        <!-- Allowed Components - docs/plans/datamodel/component-fields-
             plan.md §2.4. Only offered when fieldType is 'fieldcollections',
             which itself is only offered at all when `allowFieldCollections`
             is true (Components' own field editor passes false - nesting a
             Component inside another Component is untested territory per
             that plan's own §5, not silently allowed here). -->
        <div v-if="selectedField.fieldType === 'fieldcollections'" class="space-y-1 mt-2">
          <span class="text-[11px] font-semibold text-slate-500 uppercase">Allowed components</span>
          <div class="flex flex-wrap gap-3">
            <label v-for="component in componentsStore.components" :key="component.id" class="flex items-center gap-1.5 text-xs text-slate-400 light:text-slate-600">
              <input
                type="checkbox"
                :checked="(selectedField.allowedComponentTypes ?? []).includes(component.name)"
                @change="toggleAllowedComponent(selectedField, component.name)"
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
          v-model="selectedField.className"
          type="text"
          placeholder="Custom classes for this field's control (e.g. col-span-2, bg-slate-50, p-3) - optional"
          class="w-full px-2 py-1.5 text-[11px] font-mono mt-2 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
        />

        <div class="flex items-center justify-between pt-3 mt-2 border-t border-slate-800/60 light:border-slate-200/60">
          <div class="flex items-center gap-2">
            <button @click="moveField(selectedIndex, -1)" type="button" :disabled="selectedIndex === 0" class="text-xs text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 disabled:opacity-30">↑ Move up</button>
            <button @click="moveField(selectedIndex, 1)" type="button" :disabled="selectedIndex === modelValue.length - 1" class="text-xs text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 disabled:opacity-30">Move down ↓</button>
          </div>
          <button @click="removeField(selectedIndex)" type="button" class="text-xs text-rose-400 hover:text-rose-300">Remove field</button>
        </div>
      </template>
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
//
// Master-detail layout: the left column lists the fields (click to select,
// reorder via the hover arrows), the right column holds every setting of
// the selected field. Edits mutate the field objects in place (v-model on
// the same objects the parent owns), so only add/remove/move re-emit the
// array - same contract as the old stacked-card layout.
import { computed, ref, watch } from 'vue'
import type { ClassFieldDefinition } from '@whoobe-cms/core'
import { fieldTypeIcon } from '../../utils/list-columns'
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

const selectedIndex = ref(0)
const selectedField = computed(() => props.modelValue[selectedIndex.value] ?? null)

// Keep the selection valid when the list shrinks from outside (or the
// initial prop arrives already filled).
watch(
  () => props.modelValue.length,
  (length) => {
    if (selectedIndex.value >= length) selectedIndex.value = Math.max(0, length - 1)
  }
)

function fieldTypeLabel(fieldType: string): string {
  return ALL_FIELD_TYPES.find((ft) => ft.value === fieldType)?.label ?? fieldType
}

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
  selectedIndex.value = props.modelValue.length
}

function removeField(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index))
  if (index < selectedIndex.value) selectedIndex.value--
  else if (index === selectedIndex.value) selectedIndex.value = Math.max(0, index - 1)
}

function moveField(index: number, direction: 1 | -1) {
  const target = index + direction
  if (target < 0 || target >= props.modelValue.length) return
  const next = [...props.modelValue]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved)
  emit('update:modelValue', next)
  selectedIndex.value = target
}
</script>
