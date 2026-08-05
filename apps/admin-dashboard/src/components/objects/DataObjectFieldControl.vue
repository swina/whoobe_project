<template>
  <div class="space-y-1">
    <label class="block text-xs font-semibold text-slate-400 light:text-slate-600">
      {{ field.title }}<span v-if="field.mandatory" class="text-rose-400"> *</span>
    </label>

    <!-- Plain text-ish types -->
    <textarea
      v-if="field.fieldType === 'wysiwyg' || field.fieldType === 'textarea'"
      :value="(modelValue as string) ?? ''"
      @input="emitUpdate(($event.target as HTMLTextAreaElement).value)"
      rows="4"
      class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
    />
    <input
      v-else-if="['input', 'urlSlug', 'country', 'email'].includes(field.fieldType)"
      :value="(modelValue as string) ?? ''"
      @input="emitUpdate(($event.target as HTMLInputElement).value)"
      type="text"
      class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
    />
    <input
      v-else-if="field.fieldType === 'numeric'"
      :value="(modelValue as number) ?? ''"
      @input="emitUpdate(($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value))"
      type="number"
      class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
    />
    <input
      v-else-if="field.fieldType === 'checkbox'"
      :checked="!!modelValue"
      @change="emitUpdate(($event.target as HTMLInputElement).checked)"
      type="checkbox"
      class="w-4 h-4 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600"
    />
    <input
      v-else-if="field.fieldType === 'date'"
      :value="dateInputValue"
      @input="emitUpdate(($event.target as HTMLInputElement).value ? new Date(($event.target as HTMLInputElement).value) : null)"
      type="date"
      class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
    />

    <!-- select: relation-flavored (relationTarget) vs plain fixed options -->
    <select
      v-else-if="field.fieldType === 'select' && field.relationTarget"
      :value="relationSelectedId"
      @change="emitUpdate(relationValueFromId(($event.target as HTMLSelectElement).value))"
      class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
    >
      <option value="">—</option>
      <option v-for="opt in relationOptions" :key="opt.id" :value="opt.id">{{ opt.key }}</option>
    </select>
    <select
      v-else-if="field.fieldType === 'select'"
      :value="(modelValue as string) ?? ''"
      @change="emitUpdate(($event.target as HTMLSelectElement).value)"
      class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
    >
      <option value="">—</option>
      <option v-for="opt in field.options ?? []" :key="opt" :value="opt">{{ opt }}</option>
    </select>

    <!-- multiselect: comma-separated, simplest honest control for Phase 2 -->
    <input
      v-else-if="field.fieldType === 'multiselect'"
      :value="((modelValue as string[]) ?? []).join(', ')"
      @input="emitUpdate(($event.target as HTMLInputElement).value.split(',').map((s) => s.trim()).filter(Boolean))"
      type="text"
      placeholder="comma, separated, values"
      class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
    />

    <!-- manyToOneRelation: object relation (relationTarget) vs an asset reference -->
    <select
      v-else-if="field.fieldType === 'manyToOneRelation' && field.relationTarget"
      :value="relationSelectedId"
      @change="emitUpdate(relationValueFromId(($event.target as HTMLSelectElement).value))"
      class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
    >
      <option value="">—</option>
      <option v-for="opt in relationOptions" :key="opt.id" :value="opt.id">{{ opt.key }}</option>
    </select>
    <input
      v-else-if="field.fieldType === 'manyToOneRelation' || field.fieldType === 'video'"
      :value="assetIdValue"
      @input="emitUpdate(($event.target as HTMLInputElement).value ? { assetId: ($event.target as HTMLInputElement).value } : null)"
      type="text"
      placeholder="Asset ID / path"
      class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
    />

    <!-- multi-relation family -->
    <select
      v-else-if="['manyToManyRelation', 'manyToManyObjectRelation', 'advancedManyToManyRelation'].includes(field.fieldType)"
      multiple
      :value="multiRelationIds"
      @change="emitUpdate(Array.from(($event.target as HTMLSelectElement).selectedOptions).map((o) => ({ id: o.value })))"
      class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
      size="4"
    >
      <option v-for="opt in relationOptions" :key="opt.id" :value="opt.id">{{ opt.key }}</option>
    </select>

    <!-- link: grouped path/text/target -->
    <div v-else-if="field.fieldType === 'link'" class="grid grid-cols-3 gap-2">
      <input
        :value="linkValue.path ?? ''"
        @input="emitUpdate({ ...linkValue, path: ($event.target as HTMLInputElement).value || null })"
        type="text"
        placeholder="Path/URL"
        class="px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
      />
      <input
        :value="linkValue.text ?? ''"
        @input="emitUpdate({ ...linkValue, text: ($event.target as HTMLInputElement).value || null })"
        type="text"
        placeholder="Text"
        class="px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
      />
      <input
        :value="linkValue.target ?? ''"
        @input="emitUpdate({ ...linkValue, target: ($event.target as HTMLInputElement).value || null })"
        type="text"
        placeholder="Target (_self, _blank...)"
        class="px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
      />
    </div>

    <!-- block: a repeatable-row nested form, recursing through DataObjectForm -->
    <div v-else-if="field.fieldType === 'block'" class="space-y-2 rounded-lg border border-slate-800 light:border-slate-400 p-3 bg-slate-950/40 light:bg-white/40">
      <div v-for="(row, index) in blockRows" :key="index" class="rounded-lg border border-slate-800/80 light:border-slate-200/80 p-3 space-y-2 relative">
        <button
          @click="removeBlockRow(index)"
          type="button"
          class="absolute top-2 right-2 text-[10px] text-rose-400 hover:text-rose-300"
        >
          Remove
        </button>
        <DataObjectForm :fields="field.blockFields ?? []" :model-value="row" @update:model-value="(v) => updateBlockRow(index, v)" />
      </div>
      <button @click="addBlockRow" type="button" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300">+ Add row</button>
    </div>

    <!-- fieldcollections: a real repeatable-row editor across several
         *named* collection types (§6, Phase 6) - each item tagged by its
         own collectionType, rendered via that type's own field list.
         Falls back to a plain "not available" note when the class has
         no real collectionTypes info at all (hand-authored, never
         migrated). -->
    <div v-else-if="field.fieldType === 'fieldcollections' && field.collectionTypes && field.collectionTypes.length > 0" class="space-y-2 rounded-lg border border-slate-800 light:border-slate-200 p-3 bg-slate-950/40 light:bg-white/40">
      <div v-for="(item, index) in collectionItems" :key="index" class="rounded-lg border border-slate-800/80 light:border-slate-200/80 p-3 space-y-2 relative">
        <div class="flex items-center justify-between">
          <span class="px-2 py-0.5 text-[10px] font-bold rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 uppercase">{{ item.collectionType }}</span>
          <div class="flex items-center gap-2">
            <button v-if="index > 0" @click="moveCollectionItem(index, -1)" type="button" class="text-[10px] text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800">↑</button>
            <button v-if="index < collectionItems.length - 1" @click="moveCollectionItem(index, 1)" type="button" class="text-[10px] text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800">↓</button>
            <button @click="removeCollectionItem(index)" type="button" class="text-[10px] text-rose-400 hover:text-rose-300">Remove</button>
          </div>
        </div>
        <DataObjectForm
          :fields="collectionTypeFields(item.collectionType)"
          :model-value="item"
          @update:model-value="(v) => updateCollectionItem(index, v)"
        />
      </div>
      <div class="relative">
        <select
          :value="''"
          @change="addCollectionItem(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''"
          class="w-full px-3 py-2 text-xs bg-slate-900 light:bg-white border border-dashed border-slate-700 light:border-slate-300 rounded-lg text-indigo-400 focus:outline-none focus:border-indigo-500"
        >
          <option value="" disabled>+ Add block…</option>
          <option v-for="type in field.collectionTypes" :key="type.name" :value="type.name">{{ type.label }}</option>
        </select>
      </div>
    </div>
    <div v-else-if="field.fieldType === 'fieldcollections'" class="px-3 py-2 text-xs text-slate-500 italic bg-slate-950/40 light:bg-white/40 border border-slate-800 light:border-slate-200 rounded-lg">
      Field Collection editor not available - this class has no real collection-type info (only classes migrated via `migrate-classes` have it).
      ({{ ((modelValue as unknown[]) ?? []).length }} item(s) stored)
    </div>

    <!-- Unrecognized field type - shown plainly, not silently dropped -->
    <div v-else class="px-3 py-2 text-xs text-slate-500 italic bg-slate-950/40 light:bg-white/40 border border-slate-800 light:border-slate-200 rounded-lg">
      Unsupported field type "{{ field.fieldType }}": {{ JSON.stringify(modelValue) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ClassFieldDefinition } from '@pimcore-custom/core'
import { useRelationOptions } from '../../composables/useRelationOptions'
import DataObjectForm from './DataObjectForm.vue'

const props = defineProps<{
  field: ClassFieldDefinition
  modelValue: unknown
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

function emitUpdate(value: unknown) {
  emit('update:modelValue', value)
}

// Only actually fetches when the field is relation-flavored - safe to call
// unconditionally here since useRelationOptions is a no-op cache lookup
// for an empty/irrelevant className otherwise.
const relationOptions = props.field.relationTarget ? useRelationOptions(props.field.relationTarget) : computed(() => [])

function relationValueFromId(id: string): { id: string } | null {
  return id ? { id } : null
}

// Pulled out of the template as named computeds - Vue's template
// expression parser trips over inline `as { ... }` object-literal type
// casts (confirmed: vue-tsc errors on them directly in the template but
// not on simpler casts like `as string`/`as string[]`), so any object-
// shaped cast lives here instead.
const relationSelectedId = computed(() => (props.modelValue as { id: string } | null)?.id ?? '')
const assetIdValue = computed(() => (props.modelValue as { assetId: string } | null)?.assetId ?? '')
const multiRelationIds = computed(() => ((props.modelValue as { id: string }[]) ?? []).map((r) => r.id))

const dateInputValue = computed(() => {
  const value = props.modelValue as Date | string | null
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
})

const linkValue = computed(() => (props.modelValue as { path: string | null; text: string | null; target: string | null }) ?? { path: null, text: null, target: null })

const blockRows = computed(() => (props.modelValue as Record<string, unknown>[]) ?? [])

function addBlockRow() {
  emitUpdate([...blockRows.value, {}])
}

function removeBlockRow(index: number) {
  emitUpdate(blockRows.value.filter((_, i) => i !== index))
}

function updateBlockRow(index: number, value: Record<string, unknown>) {
  const next = [...blockRows.value]
  next[index] = value
  emitUpdate(next)
}

// fieldcollections - a real, tagged-union repeatable list (§6, Phase 6):
// each item carries its own `collectionType` name, matched against
// `field.collectionTypes` to find that specific type's own field list.
const collectionItems = computed(() => (props.modelValue as Record<string, unknown>[]) ?? [])

function collectionTypeFields(collectionType: unknown): ClassFieldDefinition[] {
  return props.field.collectionTypes?.find((t) => t.name === collectionType)?.fields ?? []
}

function addCollectionItem(typeName: string) {
  if (!typeName) return
  emitUpdate([...collectionItems.value, { collectionType: typeName }])
}

function removeCollectionItem(index: number) {
  emitUpdate(collectionItems.value.filter((_, i) => i !== index))
}

function updateCollectionItem(index: number, value: Record<string, unknown>) {
  const next = [...collectionItems.value]
  next[index] = value
  emitUpdate(next)
}

function moveCollectionItem(index: number, direction: -1 | 1) {
  const next = [...collectionItems.value]
  const target = index + direction
  if (target < 0 || target >= next.length) return
  ;[next[index], next[target]] = [next[target], next[index]]
  emitUpdate(next)
}
</script>
