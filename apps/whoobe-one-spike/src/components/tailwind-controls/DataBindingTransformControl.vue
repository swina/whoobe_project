<template>
  <div class="flex flex-col gap-2">
    <select
      :value="transformType"
      @change="onTypeChange(($event.target as HTMLSelectElement).value as TransformType | 'none')"
      class="text-xs border rounded px-2 py-1 w-full bg-white"
    >
      <option value="none">No transform (show raw value)</option>
      <option v-for="t in availableTransformers" :key="t.type" :value="t.type">{{ t.label }}</option>
    </select>

    <div v-if="transformType === 'date'" class="flex items-center gap-2 flex-wrap">
      <select v-model="options.dateStyle" class="text-xs border rounded px-1.5 py-1">
        <option value="short">Short</option>
        <option value="medium">Medium</option>
        <option value="long">Long</option>
        <option value="full">Full</option>
      </select>
      <label class="flex items-center gap-1 text-xs text-gray-600">
        <input type="checkbox" v-model="options.includeTime" /> Include time
      </label>
    </div>

    <div v-else-if="transformType === 'url'" class="flex flex-col gap-1.5">
      <select v-model="options.linkText" class="text-xs border rounded px-1.5 py-1">
        <option value="value">Use field value as link text</option>
        <option value="custom">Custom link text</option>
      </select>
      <input
        v-if="options.linkText === 'custom'"
        v-model="options.customText"
        type="text"
        placeholder="Link text"
        class="text-xs border rounded px-1.5 py-1"
      />
      <label class="flex items-center gap-1 text-xs text-gray-600">
        <input type="checkbox" v-model="options.openInNewTab" /> Open in new tab
      </label>
    </div>

    <div v-else-if="transformType === 'number'" class="flex items-center gap-2 flex-wrap">
      <select v-model="options.style" class="text-xs border rounded px-1.5 py-1">
        <option value="decimal">Decimal</option>
        <option value="currency">Currency</option>
        <option value="percent">Percent</option>
      </select>
      <input
        v-if="options.style === 'currency'"
        v-model="options.currency"
        type="text"
        placeholder="USD"
        maxlength="3"
        class="text-xs border rounded px-1.5 py-1 w-16"
      />
      <label class="flex items-center gap-1 text-xs text-gray-600">
        <input type="checkbox" v-model="options.useGrouping" /> Thousands separator
      </label>
    </div>

    <div v-else-if="transformType === 'truncate'" class="flex items-center gap-2">
      <input v-model.number="options.maxLength" type="number" min="1" class="text-xs border rounded px-1.5 py-1 w-20" />
      <span class="text-[10px] text-gray-400">chars</span>
      <input v-model="options.ellipsis" type="text" class="text-xs border rounded px-1.5 py-1 w-14" />
    </div>
  </div>
</template>

<script setup lang="ts">
// Sidebar control for TailwindCustomizer.vue's "data binding" group - same
// shape as SemanticControl.vue/CustomClassesControl.vue (reads/writes a
// field on editor.current directly, no local form state, no modal). Only
// shown once an element has a data binding whose fieldType has at least
// one applicable transformer - see TailwindCustomizer.vue's visibleGroups.
import { computed } from 'vue'
import { useEditorStore } from '../../store/editor'
import { TRANSFORMERS, transformersForFieldType, type TransformType } from '../../scripts/field-transforms'
import { useEffectiveFieldType } from '../../scripts/resolve-binding-field-type'

// attr/title aren't used directly (same reasoning as CustomClassesControl.
// vue's own identical props) - declared only so TailwindCustomizer.vue's
// uniform :attr/:title bindings don't fall through as stray attributes.
defineProps<{ attr?: string; title?: string }>()

const editor = useEditorStore()

const dataBinding = computed(() => (editor.current as any)?.dataBinding ?? null)
// Falls back to a Data Class lookup for bindings saved before fieldType was
// denormalized onto them - see resolve-binding-field-type.ts's own header.
const effectiveFieldType = useEffectiveFieldType(dataBinding)
const availableTransformers = computed(() => transformersForFieldType(effectiveFieldType.value))
const transformType = computed<TransformType | 'none'>(() => dataBinding.value?.transform?.type ?? 'none')

// Returns the live options object (not a copy) when a real transform is
// selected, so v-model="options.xxx" above mutates it in place - same
// nested-mutation pattern CustomClassesControl.vue's `editor.current.css.
// css = ...` already relies on working through Pinia's reactive `current`.
const options = computed<Record<string, any>>(() =>
  dataBinding.value?.transform && dataBinding.value.transform.type !== 'none' ? (dataBinding.value.transform as any).options : {}
)

function onTypeChange(newType: TransformType | 'none') {
  if (!dataBinding.value) return
  dataBinding.value.transform =
    newType === 'none' ? { type: 'none' } : { type: newType, options: { ...(TRANSFORMERS as any)[newType].defaultOptions } }
}
</script>
