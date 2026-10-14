<template>
  <BaseModal :open="true" size="xl" @close="$emit('close')">
    <template #header><h2 class="ui-modal-title">Import classes: choose fields and types</h2></template>

    <div v-if="loading" class="text-xs text-slate-500">Reading the class definitions…</div>
    <p v-else-if="error" class="text-xs text-rose-400">{{ error }}</p>
    <div v-else class="space-y-3" data-testid="pimcore-mapping">
      <p class="text-xs text-slate-500">
        Tick the classes and the fields to bring over and change the type where the proposed one does not fit. A field left out is not imported
        (its values are not read from the objects either). Types of Pimcore plugins are proposed as the closest plain type, or left out when none fits.
      </p>
      <div class="flex gap-3 text-xs">
        <button type="button" class="btn btn-link" @click="setAll(true)">Select all classes</button>
        <button type="button" class="btn btn-link-muted" @click="setAll(false)">None</button>
      </div>

      <div v-for="c in classes" :key="c.name" class="rounded-lg border border-slate-800 light:border-slate-200">
        <div class="flex items-center gap-2 px-3 py-2">
          <input v-model="c.include" type="checkbox" class="w-3.5 h-3.5 rounded" :disabled="!!c.error" />
          <button type="button" class="flex-1 text-left" @click="c.open = !c.open">
            <span class="text-sm text-slate-200 light:text-slate-800">{{ c.name }}</span>
            <span class="text-xs text-slate-500 ml-2">{{ c.error ? 'cannot be read' : `${c.fields.filter((f) => f.include).length} of ${c.fields.length} field(s)` }}</span>
          </button>
          <span class="text-xs text-slate-500">{{ c.open ? '▾' : '▸' }}</span>
        </div>
        <p v-if="c.error" class="px-3 pb-2 text-xs text-rose-400">{{ c.error }}</p>
        <div v-if="c.open && !c.error" class="border-t border-slate-800 light:border-slate-200 divide-y divide-slate-800/60 light:divide-slate-200/60">
          <div class="flex gap-3 px-3 py-1 text-xs">
            <button type="button" class="btn btn-link" @click="c.fields.forEach((f) => (f.include = true))">All fields</button>
            <button type="button" class="btn btn-link-muted" @click="c.fields.forEach((f) => (f.include = false))">None</button>
          </div>
          <div v-for="f in c.fields" :key="f.def.name" class="grid grid-cols-[auto_1fr_11rem] items-center gap-2 px-3 py-1" :class="{ 'opacity-50': !f.include }">
            <input v-model="f.include" type="checkbox" class="w-3.5 h-3.5 rounded" />
            <div class="min-w-0">
              <div class="text-sm font-mono text-slate-300 light:text-slate-700 truncate">{{ f.def.name }}<span v-if="f.def.relationTarget" class="text-xs text-slate-500"> → {{ f.def.relationTarget }}</span></div>
              <div class="text-[10px] text-slate-500 truncate">Pimcore: {{ f.original }}<template v-if="f.note"> · {{ f.note }}</template></div>
            </div>
            <select v-model="f.def.fieldType" class="field w-full">
              <option v-if="!isMappable(f.original)" :value="f.original">{{ f.original }} (as in Pimcore)</option>
              <option v-for="t in MAPPABLE_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <span v-if="running" class="text-xs text-slate-400 mr-auto">Importing {{ done }} / {{ selected.length }}…</span>
      <button type="button" class="btn btn-link-muted" @click="$emit('close')">Cancel</button>
      <button type="button" class="btn btn-primary" :disabled="running || loading || !selected.length" data-testid="pimcore-mapping-import" @click="run">{{ running ? 'Importing…' : `Import ${selected.length} class(es)` }}</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
// "Review & import classes" of a Pimcore migration source (MigrationSourcesCard.vue): reads the class files (preview-classes), lets the user
// pick the classes and fields and the type of each, then imports each chosen class with exactly those fields (import-classes `overrides`).
import { computed, onMounted, ref } from 'vue'
import type { ClassFieldDefinition } from '@whoobe-cms/core'
import BaseModal from '../ui/BaseModal.vue'
import { useAuthStore } from '../../stores/authStore'
import { useDataClassesStore } from '../../stores/dataClassesStore'
import { useToastStore } from '../../stores/toastStore'
import { importClassesFromPimcore, previewPimcoreClasses, type MigrationRunResult, type MigrationSource } from '../../utils/migration-sources-api'
import { MAPPABLE_TYPES, suggestMapping } from '../../utils/pimcore-field-mapping'

const props = defineProps<{ source: MigrationSource; /** Show only this class (from the object import's warning). */ onlyClass?: string }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'done', result: MigrationRunResult): void }>()

const authStore = useAuthStore()
const dataClassesStore = useDataClassesStore()
const toastStore = useToastStore()

interface FieldRow { def: ClassFieldDefinition; original: string; include: boolean; note?: string }
interface ClassRow { name: string; error?: string; include: boolean; open: boolean; fields: FieldRow[] }

const classes = ref<ClassRow[]>([])
const loading = ref(true)
const error = ref('')
const running = ref(false)
const done = ref(0)

const isMappable = (t: string) => MAPPABLE_TYPES.some((m) => m.value === t)
const selected = computed(() => classes.value.filter((c) => c.include && !c.error))
const setAll = (on: boolean) => classes.value.forEach((c) => { if (!c.error) c.include = on })

onMounted(async () => {
  try {
    const previews = await previewPimcoreClasses(authStore.config.coreApiUrl, props.source.id)
    classes.value = previews.filter((p) => !props.onlyClass || p.name === props.onlyClass).map((p) => ({
      name: p.name,
      error: p.error,
      include: !p.error,
      open: !!props.onlyClass || previews.length === 1,
      fields: p.fields.map((def) => {
        const s = suggestMapping(def.fieldType)
        return { def: { ...def, fieldType: s.fieldType }, original: def.fieldType, include: s.include, note: s.note }
      }),
    }))
  } catch (e: any) {
    error.value = e?.message || 'Could not read the class definitions.'
  } finally {
    loading.value = false
  }
})

async function run() {
  running.value = true
  done.value = 0
  const total: MigrationRunResult = { succeeded: 0, failed: 0, errors: [] }
  for (const c of selected.value) {
    try {
      const fields = c.fields.filter((f) => f.include).map((f) => ({ ...f.def }))
      const r = await importClassesFromPimcore(authStore.config.coreApiUrl, props.source.id, { className: c.name, overrides: { [c.name]: fields } })
      total.succeeded += r.succeeded
      total.failed += r.failed
      total.errors.push(...r.errors)
    } catch (e: any) {
      total.failed++
      total.errors.push({ item: c.name, message: e?.message || 'failed' })
    }
    done.value++
  }
  running.value = false
  await dataClassesStore.refreshDataClasses()
  toastStore.show(`${total.succeeded} class(es) imported, ${total.failed} failed`)
  emit('done', total)
  if (!total.failed) emit('close')
}
</script>
