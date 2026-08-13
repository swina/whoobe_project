<template>
  <div class="flex flex-col gap-2">
    <label v-if="isCheckbox" class="flex items-center gap-1.5 text-xs text-gray-600">
      <input type="checkbox" v-model="checked" />
      Checked by default
    </label>

    <template v-if="isOptionsField">
      <div class="flex flex-col gap-1">
        <div v-for="(opt, i) in options" :key="i" class="flex items-center gap-1">
          <input v-model="opt.label" type="text" placeholder="label" class="text-xs border rounded px-1.5 py-1 flex-1 min-w-0" />
          <input v-model="opt.value" type="text" placeholder="value" class="text-xs border rounded px-1.5 py-1 flex-1 min-w-0" />
          <button type="button" class="text-gray-400 hover:text-rose-500 shrink-0" title="Remove option" @click="removeOption(i)">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
        <button type="button" class="flex items-center gap-1 text-xs text-indigo-600 self-start" @click="addOption">
          <Plus class="w-3.5 h-3.5" /> Add option
        </button>
      </div>
      <p v-if="isRadioGroup" class="text-[10px] text-gray-400">
        Every radio input in this group shares the "name" attribute below (Advanced &gt; Attributes) - required for them to behave as one mutually-exclusive choice.
      </p>
    </template>

    <p v-if="!isCheckbox && !isOptionsField" class="text-[10px] text-gray-400 italic">Nothing to configure for this field.</p>
  </div>
</template>

<script setup lang="ts">
// Sidebar control for AdvancedPanel.vue's conditional "Field" section -
// only shown for a checkbox input or an options-driven field (Select/
// RadioGroup, see ElementsClass.js). Same direct-mutate-editor.current
// convention as AttributesControl.vue/AlpineControl.vue.
import { computed } from 'vue'
import { Plus, X } from '@lucide/vue'
import { useEditorStore } from '../../store/editor'
import type { FieldOption } from '../../scripts/ElementsClass.js'

defineProps<{ attr?: string; title?: string }>()

const editor = useEditorStore()

const isCheckbox = computed(() => (editor.current as any)?.tag === 'input' && (editor.current as any)?.type === 'checkbox')
const isRadioGroup = computed(() => (editor.current as any)?.tag === 'radiogroup')
const isOptionsField = computed(() => (editor.current as any)?.tag === 'select' || isRadioGroup.value)

const checked = computed<boolean>({
  get: () => !!(editor.current as any)?.data?.attributes?.checked,
  set: (value) => {
    const attrs = (editor.current as any)?.data?.attributes
    if (attrs) attrs.checked = value
  },
})

// Backfills an empty list in place for a field saved before options existed
// (or a fresh RadioGroup/Select, which already ship with defaults) - same
// "mutate a real default into place, not just an optional read" treatment
// FormConfigControl.vue's own `notify` backfill uses. Also migrates a
// Select saved before this control existed, back when InputSelect() still
// shipped a flat string[] (value === label) - each row here needs a real
// {label,value} object in place, not just at render time (helpers.ts's
// renderSelectOptionsHtml() tolerates the old shape too, but v-model="opt.
// label" below needs an actual object to bind into).
const options = computed<FieldOption[]>(() => {
  const data = (editor.current as any)?.data
  if (!data) return []
  if (!data.options) data.options = []
  for (let i = 0; i < data.options.length; i++) {
    if (typeof data.options[i] === 'string') {
      data.options[i] = { label: data.options[i], value: data.options[i] }
    }
  }
  return data.options
})

function addOption() {
  const n = options.value.length + 1
  options.value.push({ label: `Option ${n}`, value: `option-${n}` })
}

function removeOption(i: number) {
  options.value.splice(i, 1)
}
</script>
