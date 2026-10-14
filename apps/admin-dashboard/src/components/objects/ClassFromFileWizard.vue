<template>
  <BaseModal :open="true" size="lg" @close="$emit('close')">
    <template #header><h2 class="ui-modal-title">New class from a file</h2></template>

    <div class="space-y-4">
      <div>
        <input type="file" accept=".json,.csv,.tsv,.xlsx,.xls,.ods" class="text-xs text-slate-400" data-testid="class-file-input" @change="onFile" />
        <p class="text-xs text-slate-500 mt-1">JSON (an array of objects), CSV or Excel. The first row holds the column names. The columns become the fields of the class; you can also import the rows as objects.</p>
        <p v-if="error" class="text-xs text-rose-400 mt-1" data-testid="class-file-error">{{ error }}</p>
      </div>

      <template v-if="parsed">
        <div v-if="parsed.tables.length > 1">
          <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Sheet / list</label>
          <select v-model="tableIndex" class="field w-full" @change="loadTable">
            <option v-for="(t, i) in parsed.tables" :key="t.name" :value="i">{{ t.name }} ({{ t.rows.length }} rows)</option>
          </select>
        </div>
        <ClassProposalForm v-model:name="name" v-model:label="label" v-model:fields="fields" v-model:import-data="importData" v-model:valid="valid" v-model:key-column="keyColumn" :row-count="rowCount" :progress="busy ? progress : null" />
      </template>
    </div>

    <template #footer>
      <button type="button" class="btn btn-link-muted" @click="$emit('close')">Cancel</button>
      <button type="button" class="btn btn-primary" :disabled="busy || !parsed || !valid" data-testid="class-file-create" @click="create">{{ busy ? 'Creating…' : importData ? 'Create class and import' : 'Create class' }}</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
// Wizard behind "+ From file" (ClassSettingsCard.vue); the reading and guessing are in utils/class-from-file.ts.
import { computed, ref } from 'vue'
import BaseModal from '../ui/BaseModal.vue'
import ClassProposalForm from './ClassProposalForm.vue'
import { useDataClassesStore } from '../../stores/dataClassesStore'
import { useToastStore } from '../../stores/toastStore'
import { useAuthStore } from '../../stores/authStore'
import { fieldsOfProposal, parseFile, pascalOf, proposeFields, type ParsedFile, type ProposedField } from '../../utils/class-from-file'
import { importRows, importSummary, type ImportResult } from '../../utils/class-import'

const emit = defineEmits<{ (e: 'close'): void; (e: 'created', id: string): void }>()

const dataClassesStore = useDataClassesStore()
const toastStore = useToastStore()
const authStore = useAuthStore()

const parsed = ref<ParsedFile | null>(null)
const fileBase = ref('')
const tableIndex = ref(0)
const fields = ref<ProposedField[]>([])
const name = ref('')
const label = ref('')
const error = ref('')
const busy = ref(false)
const importData = ref(false)
const valid = ref(false)
const keyColumn = ref('')
const progress = ref({ done: 0, total: 0 })
const rowCount = computed(() => parsed.value?.tables[tableIndex.value]?.rows.length ?? 0)

function loadTable() {
  const t = parsed.value?.tables[tableIndex.value]
  fields.value = t ? proposeFields(t.rows) : []
  // several sheets: name the class after the sheet, a single table: after the file
  const base = parsed.value && parsed.value.tables.length > 1 ? t?.name ?? fileBase.value : fileBase.value
  name.value = pascalOf(base) || 'Imported'
  label.value = base.replace(/[_-]+/g, ' ').trim()
  label.value = label.value.charAt(0).toUpperCase() + label.value.slice(1)
}

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  error.value = ''
  parsed.value = null
  fields.value = []
  try {
    parsed.value = await parseFile(file)
    fileBase.value = file.name.replace(/\.[^.]+$/, '')
    tableIndex.value = 0
    loadTable()
  } catch (err: any) {
    error.value = err?.message || 'Could not read this file.'
  }
}

async function create() {
  if (!valid.value) return
  busy.value = true
  try {
    const f = fieldsOfProposal(fields.value)
    const created = await dataClassesStore.createDataClass({
      name: name.value.trim(),
      label: label.value.trim(),
      fields: f,
      viewConfig: { listColumns: f.slice(0, 5).map((x) => ({ name: x.name })) },
    })
    let result: ImportResult | null = null
    if (importData.value) {
      result = await importRows(authStore.config.coreApiUrl, created.id, parsed.value?.tables[tableIndex.value]?.rows ?? [], fields.value, (done, total) => { progress.value = { done, total } }, keyColumn.value)
    }
    toastStore.show(importSummary(created.label, result))
    emit('created', created.id)
  } catch (err: any) {
    toastStore.show(err?.message || 'Failed to create class')
  } finally {
    busy.value = false
  }
}
</script>
