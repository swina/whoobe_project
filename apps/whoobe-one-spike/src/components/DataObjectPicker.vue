<template>
  <div class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center" @click.self="$emit('close')">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-3xl h-[34rem] flex flex-col overflow-hidden">
      <div class="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <span class="text-xs font-semibold text-gray-600">Bind to data object</span>
        <span class="text-xs text-gray-400 font-mono">{{ className || 'no class' }}</span>
        <div class="flex-1"></div>
        <button class="flex items-center gap-1 text-gray-400 hover:text-gray-700 text-xs" @click="$emit('close')">
          <X class="w-3.5 h-3.5" /> Close
        </button>
      </div>

      <div v-if="!className" class="flex-1 min-h-0 overflow-y-auto p-3">
        <div v-if="loading" class="text-xs text-gray-400 text-center py-10">Loading…</div>
        <div v-else-if="error" class="text-xs text-rose-500 text-center py-10 px-4">
          {{ error }}
          <p class="text-gray-400 mt-2">
            This needs an active session with the backend - make sure you're already logged into the admin dashboard
            in this same browser, reached via the same hostname.
          </p>
        </div>
        <div v-else-if="!classes.length" class="text-xs text-gray-400 text-center py-10">No data classes defined yet.</div>
        <div v-else class="grid grid-cols-3 gap-3">
          <button
            v-for="cls in classes"
            :key="cls.id"
            type="button"
            class="flex flex-col gap-1 border rounded-md p-3 hover:border-indigo-400 text-left relative"
            @click="selectClass(cls)"
          >
            <span class="text-sm font-medium text-gray-700">{{ cls.label || cls.name }}</span>
            <span class="text-[10px] text-gray-400 font-mono">{{ cls.name }}</span>
            <span class="text-[10px] text-gray-400">{{ cls.fields.length }} fields</span>
            <button
              type="button"
              title="Generate template from this class"
              class="absolute top-1 right-1 text-[9px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500 hover:bg-indigo-100 border border-indigo-200"
              @click.stop="emit('generateTemplate', cls.id)"
            >
              <Layers class="w-3 h-3 inline-block" /> Template
            </button>
          </button>
        </div>
      </div>

      <div v-else class="flex-1 min-h-0 flex flex-col">
        <div class="flex items-center gap-2 px-3 py-2 border-b shrink-0">
          <button class="text-gray-400 hover:text-gray-700" title="Back to classes" @click="className = ''">
            <ChevronLeft class="w-4 h-4" />
          </button>
          <span class="text-xs text-gray-500">{{ classLabel }}</span>
          <div class="flex-1"></div>
          <div class="flex rounded-md overflow-hidden border text-xs">
            <button
              class="px-3 py-1"
              :class="mode === 'explicit' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'"
              @click="mode = 'explicit'"
            >
              Select one
            </button>
            <button
              class="px-3 py-1"
              :class="mode === 'query' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'"
              @click="mode = 'query'"
            >
              Dynamic query
            </button>
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto p-3">
          <template v-if="mode === 'explicit'">
            <div v-if="loading" class="text-xs text-gray-400 text-center py-10">Loading…</div>
            <div v-else-if="error" class="text-xs text-rose-500 text-center py-10 px-4">{{ error }}</div>
            <div v-else-if="!objects.length && !(allowRelative || (initial && !initial.objectId))" class="text-xs text-gray-400 text-center py-10">No objects of this class yet.</div>
            <div v-if="allowRelative || (initial && !initial.objectId)" class="text-[10px] text-indigo-500 mb-2">
              Object inherited from parent container — select a specific object to override, or skip to keep it relative.
            </div>
            <button
              v-for="obj in objects"
              :key="obj.id"
              type="button"
              class="flex items-center justify-between w-full border rounded-md px-3 py-2 mb-2 text-left hover:border-indigo-400"
              :class="selectedObjectId === obj.id ? 'border-indigo-500 bg-indigo-50' : ''"
              @click="selectedObjectId = obj.id"
            >
              <div class="min-w-0">
                <div class="text-sm text-gray-700 truncate">{{ objectLabel(obj) }}</div>
                <div class="text-[10px] text-gray-400 font-mono truncate">{{ obj.key }}</div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span v-if="!obj.published" class="text-[10px] text-amber-600 border border-amber-300 rounded px-1">draft</span>
                <span class="text-[10px] text-gray-400">{{ obj.locale }}</span>
              </div>
            </button>
          </template>

          <template v-else>
            <div class="text-[10px] text-gray-400 mb-1">Filters (all must match)</div>
            <div v-if="!filters.length" class="text-xs text-gray-400 text-center py-4">
              No filters - resolves to all objects of this class.
            </div>
            <div v-for="(f, i) in filters" :key="i" class="flex items-center gap-2 mb-2">
              <select v-model="f.field" class="text-xs border rounded px-2 py-1">
                <option v-for="field in fields" :key="field.name" :value="field.name">{{ field.title || field.name }}</option>
              </select>
              <select v-model="f.operator" class="text-xs border rounded px-2 py-1">
                <option value="eq">=</option>
                <option value="neq">≠</option>
                <option value="in">in</option>
                <option value="contains">contains</option>
                <option value="gt">&gt;</option>
                <option value="lt">&lt;</option>
              </select>
              <input v-model="f.value" type="text" class="text-xs border rounded px-2 py-1 flex-1" placeholder="value" />
              <button class="text-gray-400 hover:text-rose-500" @click="filters.splice(i, 1)"><Trash2 class="w-3.5 h-3.5" /></button>
            </div>
            <button class="flex items-center gap-1 text-xs text-indigo-600" @click="addFilter"><Plus class="w-3.5 h-3.5" /> Add filter</button>
          </template>
        </div>

        <div class="px-3 py-2 border-t shrink-0">
          <div class="text-[10px] text-gray-400 mb-1">Bind to field</div>
          <div class="grid grid-cols-3 gap-2 max-h-28 overflow-y-auto">
            <button
              v-for="field in bindableFields"
              :key="field.name"
              type="button"
              class="text-xs border rounded px-2 py-1.5 text-left truncate"
              :class="selectedField === field.name ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:border-indigo-300'"
              @click="selectedField = selectedField === field.name ? null : field.name"
            >
              {{ field.title || field.name }}
              <span class="text-[9px] text-gray-400 font-mono">{{ field.fieldType }}</span>
            </button>
            <button
              type="button"
              class="text-xs border rounded px-2 py-1.5 text-left truncate"
              :class="selectedField === null ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:border-indigo-300'"
              @click="selectedField = null"
            >
              Whole object
            </button>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between px-3 py-2 border-t shrink-0">
        <button
          v-if="initial"
          class="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700"
          @click="$emit('clear')"
        >
          <Unlink class="w-3.5 h-3.5" /> Unbind
        </button>
        <div v-else></div>
        <div class="flex items-center gap-2">
          <button class="text-xs px-3 py-1.5 rounded border text-gray-500 hover:bg-gray-50" @click="$emit('close')">Cancel</button>
          <button
            class="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white disabled:opacity-40"
            :disabled="!canConfirm"
            @click="confirm"
          >
            Bind
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Not a port - no equivalent picker exists in the source app. This binds an
// editor Element to this monorepo's own Data Objects backend (apps/core-api):
// pick a data class, then either a specific object or a dynamic query, then
// the class field the element should display. Emits a complete
// ElementDataBinding (ElementsClass.d.ts) that render-time resolution
// (data-resolver.ts) later resolves to real values.
//
// Modal pattern mirrors MediaPickerModal.vue (fixed overlay, backdrop-close,
// white card). Step flow is deliberately shallow: class pick → object/query
// pick → field pick, all on one screen with the class step as the only
// "back" transition.
import { computed, ref, watch } from 'vue'
import { ChevronLeft, Layers, Plus, Trash2, Unlink, X } from '@lucide/vue'
import { listDataClasses, listDataObjects, type ClassFieldDefinition, type DataClassRecord, type DataObjectRecord } from '../data-objects-api'
import type { DataBindingFilter, ElementDataBinding } from '../scripts/ElementsClass.js'

const emit = defineEmits<{
  (e: 'select', binding: ElementDataBinding): void
  (e: 'generateTemplate', classId: string): void
  (e: 'clear'): void
  (e: 'close'): void
}>()

const props = withDefaults(
  defineProps<{
    target?: string
    initial?: ElementDataBinding | null
    allowRelative?: boolean
  }>(),
  { target: 'content', initial: null, allowRelative: false }
)

const classes = ref<DataClassRecord[]>([])
const className = ref<string>(props.initial?.className ?? '')
const objects = ref<DataObjectRecord[]>([])
const selectedObjectId = ref<string | null>(props.initial?.objectId ?? null)
const mode = ref<'explicit' | 'query'>(props.initial?.resolveMode === 'query' ? 'query' : 'explicit')
const filters = ref<DataBindingFilter[]>(props.initial?.filters ? JSON.parse(JSON.stringify(props.initial.filters)) : [])
const selectedField = ref<string | null>(props.initial?.field ?? null)
const loading = ref(true)
const error = ref('')

const currentClass = computed(() => classes.value.find((c) => c.name === className.value) ?? null)
const classLabel = computed(() => currentClass.value?.label || className.value)
const fields = computed(() => currentClass.value?.fields ?? [])
const bindableFields = computed(() => fields.value.filter((f) => fieldCompatibleWithTarget(f, props.target)))
const canConfirm = computed(() => {
  if (!className.value) return false
  if (mode.value === 'query') return true
  // Relative bindings (child of a bound container): the object comes from
  // the container's dataContext at render time, so no objectId is needed.
  if (props.allowRelative || (props.initial && !props.initial.objectId)) return true
  return Boolean(selectedObjectId.value)
})

function fieldCompatibleWithTarget(field: ClassFieldDefinition, target: string): boolean {
  const TEXT = ['input', 'textarea', 'wysiwyg', 'numeric', 'urlSlug', 'email', 'country', 'select', 'multiselect']
  const IMAGE = ['image', 'asset']
  const VIDEO = ['video']
  const LINK = ['link', 'manyToOneRelation', 'manyToManyRelation']
  switch (target) {
    case 'content': return TEXT.includes(field.fieldType)
    case 'alt': return TEXT.includes(field.fieldType)
    case 'icon': return ['input', 'select', 'multiselect'].includes(field.fieldType)
    case 'src': return [...IMAGE, ...VIDEO].includes(field.fieldType)
    case 'href': return [...LINK, 'input', 'urlSlug'].includes(field.fieldType)
    default: return true
  }
}

function objectLabel(obj: DataObjectRecord): string {
  const name = obj.attributes?.name ?? obj.attributes?.title ?? obj.attributes?.label
  return typeof name === 'string' && name ? name : obj.key
}

function selectClass(cls: DataClassRecord) {
  className.value = cls.name
  selectedObjectId.value = null
  selectedField.value = null
}

function addFilter() {
  filters.value.push({ field: fields.value[0]?.name ?? '', operator: 'eq', value: '' })
}

function confirm() {
  const binding: ElementDataBinding = {
    className: className.value,
    objectId: mode.value === 'explicit' ? selectedObjectId.value : null,
    field: selectedField.value,
    target: props.target,
    resolveMode: mode.value,
    filters: mode.value === 'query' ? filters.value : undefined,
  }
  emit('select', binding)
}

watch(className, async () => {
  if (!className.value) return
  loading.value = true
  error.value = ''
  try {
    objects.value = await listDataObjects(currentClass.value?.id)
  } catch (e: any) {
    error.value = e?.message || 'Failed to load objects'
  } finally {
    loading.value = false
  }
})

init()

async function init() {
  loading.value = true
  error.value = ''
  try {
    classes.value = await listDataClasses()
    if (className.value) {
      objects.value = await listDataObjects(currentClass.value?.id)
    }
  } catch (e: any) {
    error.value = e?.message || 'Failed to load data classes'
  } finally {
    loading.value = false
  }
}
</script>
