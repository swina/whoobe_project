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
              <select v-model="f.field" class="text-xs border rounded px-2 py-1 min-w-[7rem]">
                <option v-for="field in filterFields" :key="field.name" :value="field.name">{{ field.title || field.name }}</option>
              </select>
              <select v-model="f.operator" class="text-xs border rounded px-2 py-1">
                <option value="eq">=</option>
                <option value="neq">≠</option>
                <option value="in">in</option>
                <option value="contains">contains</option>
                <option value="gt">&gt;</option>
                <option value="lt">&lt;</option>
              </select>
              <!-- Field-type-aware filter value input -->
              <template v-if="filterInputType(f.field) === 'checkbox'">
                <select v-model="f.value" class="text-xs border rounded px-2 py-1">
                  <option :value="true">true</option>
                  <option :value="false">false</option>
                </select>
              </template>
              <template v-else-if="filterInputType(f.field) === 'select'">
                <select v-model="f.value" class="text-xs border rounded px-2 py-1 flex-1">
                  <option value="">Any</option>
                  <option v-for="opt in filterFieldOptions(f.field)" :key="opt" :value="opt">{{ opt }}</option>
                </select>
              </template>
              <template v-else-if="filterInputType(f.field) === 'number'">
                <input v-model.number="f.value" type="number" class="text-xs border rounded px-2 py-1 flex-1" placeholder="value" />
              </template>
              <template v-else-if="filterInputType(f.field) === 'date'">
                <input v-model="f.value" type="date" class="text-xs border rounded px-2 py-1 flex-1" />
              </template>
              <template v-else>
                <input v-model="f.value" type="text" class="text-xs border rounded px-2 py-1 flex-1" placeholder="value" />
              </template>
              <button class="text-gray-400 hover:text-rose-500 shrink-0" @click="filters.splice(i, 1)"><Trash2 class="w-3.5 h-3.5" /></button>
            </div>
            <button class="flex items-center gap-1 text-xs text-indigo-600" @click="addFilter"><Plus class="w-3.5 h-3.5" /> Add filter</button>

            <div class="pt-3 border-t border-gray-100 mt-3 space-y-2">
              <div>
                <div class="text-[10px] text-gray-400 mb-1">Order by</div>
                <div class="flex items-center gap-2">
                  <select v-model="orderByField" class="text-xs border rounded px-2 py-1 flex-1">
                    <option value="">Default (newest first)</option>
                    <option v-for="field in filterFields" :key="field.name" :value="field.name">{{ field.title || field.name }}</option>
                  </select>
                  <select v-model="orderByDirection" class="text-xs border rounded px-2 py-1" :disabled="!orderByField">
                    <option value="desc">Descending</option>
                    <option value="asc">Ascending</option>
                  </select>
                </div>
              </div>

              <div class="grid grid-cols-3 gap-2">
                <div>
                  <div class="text-[10px] text-gray-400 mb-1">Offset</div>
                  <input v-model.number="offset" type="number" min="0" class="text-xs border rounded px-2 py-1 w-full" placeholder="0" />
                </div>
                <div>
                  <div class="text-[10px] text-gray-400 mb-1">Limit</div>
                  <input v-model.number="limit" type="number" min="0" class="text-xs border rounded px-2 py-1 w-full" placeholder="No limit" />
                </div>
                <div>
                  <div class="text-[10px] text-gray-400 mb-1">Rows per page</div>
                  <select v-model.number="rowsPerPage" class="text-xs border rounded px-2 py-1 w-full">
                    <option :value="0">No pagination</option>
                    <option v-for="size in [5, 10, 25, 50]" :key="size" :value="size">{{ size }}</option>
                  </select>
                </div>
              </div>

              <button
                class="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"
                :disabled="testLoading"
                @click="testQuery"
              >
                <Play class="w-3 h-3" /> {{ testLoading ? 'Testing…' : 'Test query' }}
              </button>

              <div v-if="testError" class="mt-2 text-xs text-rose-600">{{ testError }}</div>

              <div v-else-if="testResults !== null" class="mt-2 space-y-1">
                <div class="text-xs" :class="testResults.length === 0 ? 'text-amber-600' : 'text-emerald-600'">
                  {{ testResults.length }} record(s) found
                </div>
                <div v-if="testResults.length > 0" class="max-h-28 overflow-y-auto space-y-1">
                  <div
                    v-for="obj in testResults.slice(0, TEST_DISPLAY_CAP)"
                    :key="obj.id"
                    class="flex items-center justify-between text-[10px] text-gray-600 bg-gray-50 rounded px-2 py-1"
                  >
                    <span class="truncate font-mono">{{ objectLabel(obj) }}</span>
                    <span class="text-gray-400 shrink-0 ml-2">{{ obj.locale }}</span>
                  </div>
                  <div v-if="testResults.length > TEST_DISPLAY_CAP" class="text-[10px] text-gray-400 italic">
                    Showing first {{ TEST_DISPLAY_CAP }} of {{ testResults.length }} results
                  </div>
                </div>
              </div>
            </div>
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
import { ChevronLeft, Layers, Play, Plus, Trash2, Unlink, X } from '@lucide/vue'
import { listDataClasses, listDataObjects, queryDataObjects, type ClassFieldDefinition, type DataClassRecord, type DataObjectRecord, type DataObjectQueryFilter } from '../data-objects-api'
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

// Order by / offset / limit / rows-per-page ('query' mode only)
const orderByField = ref<string>(props.initial?.orderBy?.field ?? '')
const orderByDirection = ref<'asc' | 'desc'>(props.initial?.orderBy?.direction ?? 'desc')
const offset = ref<number | null>(props.initial?.offset ?? null)
const limit = ref<number | null>(props.initial?.limit ?? null)
const rowsPerPage = ref<number>(props.initial?.rowsPerPage ?? 0)

// Query test state
const testLoading = ref(false)
const testResults = ref<DataObjectRecord[] | null>(null)
const testError = ref('')
const TEST_DISPLAY_CAP = 50

const currentClass = computed(() => classes.value.find((c) => c.name === className.value) ?? null)
const classLabel = computed(() => currentClass.value?.label || className.value)
const fields = computed(() => currentClass.value?.fields ?? [])
const filterFields = computed(() => [
  { name: 'key', title: 'Key', fieldType: 'input' },
  { name: 'path', title: 'Path', fieldType: 'input' },
  { name: 'locale', title: 'Locale', fieldType: 'input' },
  ...fields.value,
])

/** Quick lookup: field name → ClassFieldDefinition for filter type inference. */
const fieldMap = computed(() => {
  const map = new Map<string, ClassFieldDefinition>()
  for (const f of filterFields.value) map.set(f.name, f)
  return map
})

/** Determine the suitable HTML input type for a filter value based on its
 *  field's data type. Returns 'text', 'number', 'date', 'checkbox', or
 *  'select' (the latter only for select fields with predefined options). */
function filterInputType(fieldName: string): 'text' | 'number' | 'date' | 'checkbox' | 'select' {
  const field = fieldMap.value.get(fieldName)
  if (!field) return 'text'
  const ft = field.fieldType
  if (ft === 'numeric' || ft === 'slider' || ft === 'range') return 'number'
  if (ft === 'date' || ft === 'datetime') return 'date'
  if (ft === 'checkbox') return 'checkbox'
  if (ft === 'select' && field.options && field.options.length > 0) return 'select'
  return 'text'
}

function filterFieldOptions(fieldName: string): string[] {
  return fieldMap.value.get(fieldName)?.options ?? []
}

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

async function testQuery() {
  testLoading.value = true
  testError.value = ''
  testResults.value = null
  try {
    const qf: DataObjectQueryFilter[] = filters.value.map((f) => ({
      field: f.field,
      operator: f.operator as DataObjectQueryFilter['operator'],
      value: f.value,
    }))
    const results = await queryDataObjects(className.value, {
      filters: qf,
      orderBy: orderByField.value ? { field: orderByField.value, direction: orderByDirection.value } : undefined,
      offset: offset.value ?? undefined,
      limit: limit.value ?? undefined,
    })
    testResults.value = results
  } catch (e: any) {
    testError.value = e?.message || 'Query failed'
  } finally {
    testLoading.value = false
  }
}

function confirm() {
  const fieldType = selectedField.value ? fieldMap.value.get(selectedField.value)?.fieldType ?? null : null
  // Transform config lives in the sidebar (DataBindingTransformControl.vue),
  // not this modal - preserve it only when rebinding to the SAME field
  // (a different field's transform options would be nonsensical, since
  // they're field-type-specific).
  const transform: ElementDataBinding['transform'] =
    selectedField.value && selectedField.value === props.initial?.field
      ? props.initial?.transform ?? { type: 'none' }
      : { type: 'none' }

  const binding: ElementDataBinding = {
    className: className.value,
    objectId: mode.value === 'explicit' ? selectedObjectId.value : null,
    field: selectedField.value,
    fieldType,
    target: props.target,
    resolveMode: mode.value,
    filters: mode.value === 'query' ? filters.value : undefined,
    orderBy:
      mode.value === 'query' && orderByField.value
        ? { field: orderByField.value, direction: orderByDirection.value }
        : undefined,
    // Nullish (not truthy) checks - offset=0 is a real, meaningful value
    // ("skip nothing"), not the same as "no offset set" here; a `? :`
    // truthy check would silently drop it back to undefined.
    offset: mode.value === 'query' && offset.value != null ? offset.value : undefined,
    limit: mode.value === 'query' && limit.value != null ? limit.value : undefined,
    rowsPerPage: mode.value === 'query' && rowsPerPage.value ? rowsPerPage.value : undefined,
    transform,
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
