<template>
  <div class="space-y-1" :class="(field.fieldType != 'image' && field.fieldType != 'video' && field.fieldType != 'asset') ? fieldLayout.class : ''">
    <label class="block text-xs font-semibold text-slate-400 light:text-slate-600">
      {{ field.title }}<span v-if="field.mandatory" class="text-rose-400"> *</span>
    </label>

    <!-- field.className (docs/plans/UI/editing-object-class.md) is applied
         to the actual control in every branch below - never to the outer
         label+control wrapper above, which only exists for that vertical
         stacking. Real consequence, stated rather than glossed over: a
         grid-placement utility like col-span-2 needs to sit on a real
         grid *item* to do anything - since that's this wrapper, not the
         control inside it, col-span-2 typed into a field's className has
         no effect once applied here. Custom classes/styles - background,
         padding, borders, sizing - visibly landing on the control itself
         is what was actually asked for; grid placement for a field within
         a section's own grid layout doesn't have a supported mechanism
         right now (a real, separate gap, not silently pretended away). -->

    <!-- Rich text - docs/plans/datamodel/wysiwyg-field-editor-plan.md -->
    <WysiwygEditor
      v-if="field.fieldType === 'wysiwyg'"
      :model-value="(modelValue as string) ?? ''"
      :class="fieldLayout.class"
      :style="fieldLayout.style"
      @update:model-value="emitUpdate"
    />
    <!-- Markdown - raw source stored, converted to HTML only in the
         editor's own Preview tab (MarkdownEditor.vue), not here. -->
    <MarkdownEditor
      v-else-if="field.fieldType === 'markdown'"
      :model-value="(modelValue as string) ?? ''"
      :class="fieldLayout.class"
      :style="fieldLayout.style"
      @update:model-value="emitUpdate"
    />
    <!-- Plain text-ish types -->
    <textarea
      v-else-if="field.fieldType === 'textarea'"
      :value="(modelValue as string) ?? ''"
      @input="emitUpdate(($event.target as HTMLTextAreaElement).value)"
      rows="4"
      :class="['w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500', fieldLayout.class]"
      :style="fieldLayout.style"
    />
    <!-- urlSlug: a trailing "Generate" button slugifies whatever's already
         typed here into a friendly URL slug - docs/plans/UI/editing-
         object-class.md has no concept of a per-class "title source field"
         to auto-derive from, so (same as Pages > Slug's own Generate
         button when its Title is empty) this cleans up the field's own
         current text rather than pulling from a sibling field. -->
    <div v-else-if="field.fieldType === 'urlSlug'" :class="['flex gap-2', fieldLayout.class]" :style="fieldLayout.style">
      <input
        :value="(modelValue as string) ?? ''"
        @input="emitUpdate(($event.target as HTMLInputElement).value)"
        type="text"
        class="flex-1 min-w-0 px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
      />
      <button
        type="button"
        title="Generate a friendly slug from this text"
        class="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:hover:bg-slate-200 text-slate-300 light:text-slate-700 flex items-center gap-1.5"
        @click="emitUpdate(slugify((modelValue as string) ?? ''))"
      >
        <Wand2 class="w-3.5 h-3.5" /> Generate
      </button>
    </div>
    <!-- array: a list of strings typed as one ";"-separated line. The raw
         text is kept locally (arrayText) so a trailing ";" or space survives
         while typing; only the parsed list is emitted. -->
    <div v-else-if="field.fieldType === 'array'" :class="['space-y-1', fieldLayout.class]" :style="fieldLayout.style">
      <input
        :value="arrayText"
        @input="onArrayInput(($event.target as HTMLInputElement).value)"
        type="text"
        placeholder="item 1; item 2; item 3"
        class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
      />
      <p class="text-[10px] text-slate-500">Separate items with ";" - {{ arrayCount }} item(s)</p>
    </div>
    <!-- json: an object/array as JSON text. Validated as you type; while the
         text doesn't parse, the last valid value stays what gets saved. -->
    <div v-else-if="field.fieldType === 'json'" :class="['space-y-1', fieldLayout.class]" :style="fieldLayout.style">
      <textarea
        :value="jsonText"
        @input="onJsonInput(($event.target as HTMLTextAreaElement).value)"
        rows="8"
        spellcheck="false"
        placeholder='{ "key": "value" }'
        :class="['w-full px-3 py-2 text-xs font-mono bg-slate-950 light:bg-slate-50 border rounded-lg text-slate-200 light:text-slate-800 focus:outline-none', jsonError ? 'border-rose-500 focus:border-rose-500' : 'border-slate-800 light:border-slate-400 focus:border-indigo-500']"
      />
      <p v-if="jsonError" class="text-[11px] text-rose-400">{{ jsonError }} - not applied until it parses; the last valid value is kept.</p>
      <p v-else-if="jsonText.trim()" class="text-[11px] text-emerald-500">Valid JSON</p>
    </div>
    <input
      v-else-if="['input', 'country', 'email'].includes(field.fieldType)"
      :value="(modelValue as string) ?? ''"
      @input="emitUpdate(($event.target as HTMLInputElement).value)"
      type="text"
      :class="['w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500', fieldLayout.class]"
      :style="fieldLayout.style"
    />
    <input
      v-else-if="field.fieldType === 'numeric'"
      :value="(modelValue as number) ?? ''"
      @input="emitUpdate(($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value))"
      type="number"
      :class="['w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500', fieldLayout.class]"
      :style="fieldLayout.style"
    />
    <input
      v-else-if="field.fieldType === 'checkbox'"
      :checked="!!modelValue"
      @change="emitUpdate(($event.target as HTMLInputElement).checked)"
      type="checkbox"
      :class="['w-4 h-4 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600', fieldLayout.class]"
      :style="fieldLayout.style"
    />
    <input
      v-else-if="field.fieldType === 'date'"
      :value="dateInputValue"
      @input="emitUpdate(($event.target as HTMLInputElement).value ? new Date(($event.target as HTMLInputElement).value) : null)"
      type="date"
      :class="['w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500', fieldLayout.class]"
      :style="fieldLayout.style"
    />

    <!-- select: relation-flavored (relationTarget) vs plain fixed options -->
    <select
      v-else-if="field.fieldType === 'select' && field.relationTarget"
      :value="relationSelectedId"
      @change="emitUpdate(relationValueFromId(($event.target as HTMLSelectElement).value))"
      :class="['w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500', fieldLayout.class]"
      :style="fieldLayout.style"
    >
      <option value="">—</option>
      <option v-for="opt in relationOptions" :key="opt.id" :value="opt.id">{{ relationOptionLabel(opt) }}</option>
    </select>
    <select
      v-else-if="field.fieldType === 'select'"
      :value="(modelValue as string) ?? ''"
      @change="emitUpdate(($event.target as HTMLSelectElement).value)"
      :class="['w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500', fieldLayout.class]"
      :style="fieldLayout.style"
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
      :class="['w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500', fieldLayout.class]"
      :style="fieldLayout.style"
    />

    <!-- manyToOneRelation: object relation (relationTarget) vs an asset reference -->
    <select
      v-else-if="field.fieldType === 'manyToOneRelation' && field.relationTarget"
      :value="relationSelectedId"
      @change="emitUpdate(relationValueFromId(($event.target as HTMLSelectElement).value))"
      :class="['w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500', fieldLayout.class]"
      :style="fieldLayout.style"
    >
      <option value="">—</option>
      <option v-for="opt in relationOptions" :key="opt.id" :value="opt.id">{{ relationOptionLabel(opt) }}</option>
    </select>
    <AssetFieldPicker
      v-else-if="['manyToOneRelation', 'video', 'image', 'asset'].includes(field.fieldType)"
      :model-value="assetRefValue"
      :filter="assetPickerFilter"
      :class="fieldLayout.class"
      :style="fieldLayout.style"
      @update:model-value="emitUpdate"
    />

    <!-- multi-relation family -->
    <select
      v-else-if="['manyToManyRelation', 'manyToManyObjectRelation', 'advancedManyToManyRelation'].includes(field.fieldType)"
      multiple
      :value="multiRelationIds"
      @change="emitUpdate(Array.from(($event.target as HTMLSelectElement).selectedOptions).map((o) => ({ id: o.value })))"
      :class="['w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500', fieldLayout.class]"
      :style="fieldLayout.style"
      size="4"
    >
      <option v-for="opt in relationOptions" :key="opt.id" :value="opt.id">{{ relationOptionLabel(opt) }}</option>
    </select>

    <!-- link: grouped path/text/target - className lands on the group, not
         one of the three individual inputs, since none of them alone is
         "the control" for this field type. -->
    <div v-else-if="field.fieldType === 'link'" :class="['grid grid-cols-3 gap-2', fieldLayout.class]" :style="fieldLayout.style">
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
    <div v-else-if="field.fieldType === 'block'" :class="['space-y-2 rounded-lg border border-slate-800 light:border-slate-400 p-3 bg-slate-950/40 light:bg-white/40', fieldLayout.class]" :style="fieldLayout.style">
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
    <div
      v-else-if="field.fieldType === 'fieldcollections' && field.collectionTypes && field.collectionTypes.length > 0"
      :class="['space-y-2 rounded-lg border border-slate-800 light:border-slate-200 p-3 bg-slate-950/40 light:bg-white/40', fieldLayout.class]"
      :style="fieldLayout.style"
    >
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
    <div
      v-else-if="field.fieldType === 'fieldcollections'"
      :class="['px-3 py-2 text-xs text-slate-500 italic bg-slate-950/40 light:bg-white/40 border border-slate-800 light:border-slate-200 rounded-lg', fieldLayout.class]"
      :style="fieldLayout.style"
    >
      Field Collection editor not available - this class has no real collection-type info (only classes migrated via `migrate-classes` have it).
      ({{ ((modelValue as unknown[]) ?? []).length }} item(s) stored)
    </div>

    <!-- Unrecognized field type - shown plainly, not silently dropped -->
    <div
      v-else
      :class="['px-3 py-2 text-xs text-slate-500 italic bg-slate-950/40 light:bg-white/40 border border-slate-800 light:border-slate-200 rounded-lg', fieldLayout.class]"
      :style="fieldLayout.style"
    >
      Unsupported field type "{{ field.fieldType }}": {{ JSON.stringify(modelValue) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Wand2 } from '@lucide/vue'
import type { ClassFieldDefinition } from '@whoobe-cms/core'
import { useRelationOptions } from '../../composables/useRelationOptions'
import { resolveCustomClasses } from '../../utils/custom-classes'
import { slugify } from '../../utils/slugify'
import type { AssetCategoryFilter } from '../../utils/asset-category'
import DataObjectForm from './DataObjectForm.vue'
import WysiwygEditor from './WysiwygEditor.vue'
import MarkdownEditor from './MarkdownEditor.vue'
import AssetFieldPicker from './AssetFieldPicker.vue'

const props = defineProps<{
  field: ClassFieldDefinition
  modelValue: unknown
}>()

// field.className (docs/plans/UI/editing-object-class.md) - appended
// alongside the field's own always-on `space-y-1` label/control stacking,
// not a replacement for it (unlike a section's own containerClass, which
// genuinely replaces the section's layout mode - a field's internal
// label-above-control structure isn't something a grid-placement class
// like col-span-2 should ever remove). Same arbitrary-bracket-value
// handling as containerClass - see that util's own comment.
const fieldLayout = computed(() => resolveCustomClasses(props.field.className))

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

// Human-readable label for a related object - the field's own
// `relationDisplayField` (authored in the class editor's View Layout /
// List Layout tabs) wins, falling back to the object's `key`.
function relationOptionLabel(opt: { id: string; key: string; attributes?: Record<string, unknown> | null }): string {
  const displayField = props.field.relationDisplayField
  if (displayField) {
    const value = opt.attributes?.[displayField]
    if (value != null && value !== '') return String(value)
  }
  return opt.key
}

// Pulled out of the template as named computeds - Vue's template
// expression parser trips over inline `as { ... }` object-literal type
// casts (confirmed: vue-tsc errors on them directly in the template but
// not on simpler casts like `as string`/`as string[]`), so any object-
// shaped cast lives here instead.
// array / json: raw text kept locally while typing, parsed value emitted.
// `lastEmitted` lets the watcher tell its own echo (the parent passing back
// what was just emitted) from a genuine outside change (switching locale,
// reload), which is the only time the text is reset.
const arrayText = ref(Array.isArray(props.modelValue) ? (props.modelValue as string[]).join('; ') : '')
const jsonText = ref(props.modelValue == null ? '' : JSON.stringify(props.modelValue, null, 2))
const jsonError = ref('')
let lastEmitted = JSON.stringify(props.modelValue ?? null)

const arrayCount = computed(() => parseArrayText(arrayText.value).length)

function parseArrayText(text: string): string[] {
  return text.split(';').map((s) => s.trim()).filter(Boolean)
}

function onArrayInput(text: string) {
  arrayText.value = text
  const list = parseArrayText(text)
  lastEmitted = JSON.stringify(list)
  emitUpdate(list)
}

function onJsonInput(text: string) {
  jsonText.value = text
  if (!text.trim()) {
    jsonError.value = ''
    lastEmitted = 'null'
    emitUpdate(null)
    return
  }
  try {
    const parsed = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object') {
      jsonError.value = 'Must be a JSON object or array'
      return
    }
    jsonError.value = ''
    lastEmitted = JSON.stringify(parsed)
    emitUpdate(parsed)
  } catch (e) {
    jsonError.value = e instanceof Error ? e.message : 'Invalid JSON'
  }
}

watch(
  () => props.modelValue,
  (value) => {
    const incoming = JSON.stringify(value ?? null)
    if (incoming === lastEmitted) return
    lastEmitted = incoming
    jsonError.value = ''
    arrayText.value = Array.isArray(value) ? (value as string[]).join('; ') : ''
    jsonText.value = value == null ? '' : JSON.stringify(value, null, 2)
  }
)

const relationSelectedId = computed(() => (props.modelValue as { id: string } | null)?.id ?? '')
const multiRelationIds = computed(() => ((props.modelValue as { id: string }[]) ?? []).map((r) => r.id))
const assetRefValue = computed(() => (props.modelValue as { assetId: string } | null) ?? null)

// image/video's own name already implies the picker's filter; a plain
// asset-flavored manyToOneRelation (no relationTarget) has no filter
// concept at all today, so it stays permissive.
const assetPickerFilter = computed<AssetCategoryFilter>(() => {
  if (props.field.fieldType === 'image') return 'image'
  if (props.field.fieldType === 'video') return 'video'
  if (props.field.fieldType === 'asset') return props.field.assetFilter ?? 'any'
  return 'any'
})

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
