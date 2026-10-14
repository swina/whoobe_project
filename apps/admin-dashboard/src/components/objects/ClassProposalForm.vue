<template>
  <div class="space-y-4">
    <div class="grid grid-cols-2 gap-2">
      <div>
        <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Name (identifier)</label>
        <input v-model="name" type="text" class="field w-full" :class="{ 'border-rose-500': nameTaken }" />
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Label</label>
        <input v-model="label" type="text" class="field w-full" />
      </div>
    </div>
    <p v-if="nameTaken" class="text-xs text-rose-400">A class named "{{ name.trim() }}" already exists.</p>

    <div class="rounded-lg border border-slate-800 light:border-slate-200 divide-y divide-slate-800 light:divide-slate-200" data-testid="class-file-fields">
      <div v-for="f in fields" :key="f.column" class="grid grid-cols-[auto_1fr_1fr_9rem] items-center gap-2 px-2 py-1.5" :class="{ 'opacity-50': !f.include }">
        <input v-model="f.include" type="checkbox" class="w-3.5 h-3.5 rounded" />
        <div class="min-w-0">
          <input v-model="f.title" type="text" class="field w-full" :title="`Column: ${f.column}`" />
          <div class="text-[10px] text-slate-500 truncate" :title="f.samples.join(' · ')">{{ f.samples.join(' · ') }}</div>
        </div>
        <input v-model="f.name" type="text" class="field w-full font-mono" />
        <select v-model="f.fieldType" class="field w-full">
          <option v-for="t in FILE_FIELD_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
      </div>
    </div>
    <p v-if="problem" class="text-xs text-amber-400">{{ problem }}</p>

    <div class="space-y-1" data-testid="class-file-mode">
      <label class="flex items-center gap-2 text-sm text-slate-300 light:text-slate-700">
        <input v-model="importData" type="radio" :value="false" /> Schema only
      </label>
      <label class="flex items-center gap-2 text-sm text-slate-300 light:text-slate-700">
        <input v-model="importData" type="radio" :value="true" /> Schema + data: import the {{ rowCount }} row(s) as Data Objects (drafts)
      </label>
    </div>
    <div v-if="importData" class="flex items-center gap-2 text-xs text-slate-400">
      <span class="shrink-0">Object key</span>
      <select v-model="keyColumn" class="field flex-1" data-testid="class-import-key">
        <option value="">Generated for each object</option>
        <option v-for="f in fields.filter((x) => x.include)" :key="f.column" :value="f.column">The value of "{{ f.title || f.name }}"</option>
      </select>
    </div>
    <div v-if="progress && progress.total" class="text-xs text-slate-400" data-testid="class-file-progress">Importing {{ progress.done }} / {{ progress.total }}…</div>
    <p class="text-xs text-slate-500">Types are guessed from the values: check them, you can also change everything later in the class editor.</p>
  </div>
</template>

<script setup lang="ts">
// The part of "new class from a file / an integration" that is the same for both (ClassFromFileWizard.vue, MasterIntegrationImportTab.vue):
// name and label, one line per column (include, title, field name, type) and the choice between schema only and schema + data.
import { computed, watchEffect } from 'vue'
import { useDataClassesStore } from '../../stores/dataClassesStore'
import { FILE_FIELD_TYPES, proposalProblem, type ProposedField } from '../../utils/class-from-file'

const props = defineProps<{ rowCount: number; progress?: { done: number; total: number } | null }>()
const name = defineModel<string>('name', { required: true })
const label = defineModel<string>('label', { required: true })
const fields = defineModel<ProposedField[]>('fields', { required: true })
const importData = defineModel<boolean>('importData', { required: true })
const valid = defineModel<boolean>('valid', { default: false })
const keyColumn = defineModel<string>('keyColumn', { default: '' })

const dataClassesStore = useDataClassesStore()
const nameTaken = computed(() => dataClassesStore.classes.some((c) => c.name.toLowerCase() === name.value.trim().toLowerCase()))
const problem = computed(() => proposalProblem(fields.value))
const isValid = computed(() => !problem.value && !nameTaken.value && /^[A-Za-z][A-Za-z0-9_]*$/.test(name.value.trim()) && !!label.value.trim() && props.rowCount > 0)
watchEffect(() => { valid.value = isValid.value })
</script>
