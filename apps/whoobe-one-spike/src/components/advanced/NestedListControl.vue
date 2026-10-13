<template>
  <div class="flex flex-col gap-2 text-xs">
    <!-- An Integrations list inside an item (made by binding a field chip): limit and filters -->
    <div v-if="isGatewayList" class="flex flex-col gap-1 border rounded bg-white p-1.5">
      <div class="font-semibold text-gray-700">List <code>{{ current.gatewayBinding.fieldPath }}</code> of the item above</div>
      <label class="flex flex-col gap-0.5">
        <span class="text-gray-500">At most (items)</span>
        <input type="number" min="1" class="w-full text-xs border rounded px-1.5 py-1" :value="current.gatewayBinding.limit ?? ''" @change="setGatewayLimit(($event.target as HTMLInputElement).value)" />
      </label>
      <div class="text-gray-500">Only items where (all must match)</div>
      <div v-for="(f, i) in (current.gatewayBinding.filters ?? [])" :key="i" class="flex items-center gap-1">
        <input type="text" class="min-w-0 flex-1 text-xs border rounded px-1 py-0.5 font-mono" :value="f.field" placeholder="field of one item" @change="setFilter(i, 'field', ($event.target as HTMLInputElement).value)" />
        <select class="text-xs border rounded px-1 py-0.5" :value="f.operator" @change="setFilter(i, 'operator', ($event.target as HTMLSelectElement).value)">
          <option value="eq">=</option><option value="neq">≠</option><option value="contains">contains</option><option value="gt">&gt;</option><option value="lt">&lt;</option><option value="in">in</option>
        </select>
        <input type="text" class="min-w-0 flex-1 text-xs border rounded px-1 py-0.5" :value="f.value" @change="setFilter(i, 'value', ($event.target as HTMLInputElement).value)" />
        <button type="button" class="text-gray-400 hover:text-rose-500" @click="removeFilter(i)">×</button>
      </div>
      <button type="button" class="text-[10px] text-indigo-600 self-start hover:underline" @click="addFilter">+ add a filter</button>
    </div>
    <p v-if="!scope && !isGatewayList" class="text-[10px] text-gray-500">
      A nested list repeats over a list that is part of the object it sits in (a block or a field collection). Put this container inside a container bound to a Data Class first.
    </p>
    <template v-else-if="scope">
      <label class="flex flex-col gap-0.5">
        <span class="text-gray-500">Repeat over the list held by (class <code>{{ scope.className }}</code>)</span>
        <select class="w-full text-xs border rounded px-1.5 py-1" :value="current?.dataBinding?.target === 'list' ? current.dataBinding.field : ''" @change="setField(($event.target as HTMLSelectElement).value)">
          <option value="">not a nested list</option>
          <option v-for="f in listFields" :key="f.name" :value="f.name">{{ f.title || f.name }} ({{ f.fieldType }})</option>
        </select>
      </label>
      <p v-if="!listFields.length" class="text-[10px] text-amber-700">This {{ scope.listField ? 'list item' : 'class' }} has no block or field collection field.</p>
      <label v-if="isList" class="flex flex-col gap-0.5">
        <span class="text-gray-500">At most (items)</span>
        <input type="number" min="1" class="w-full text-xs border rounded px-1.5 py-1" :value="current.dataBinding.limit ?? ''" @change="setLimit(($event.target as HTMLInputElement).value)" />
      </label>
      <p class="text-[10px] text-gray-400">
        Nothing is fetched: the list comes with the object. Inside, bind elements to the fields of the item with the data binding button;
        <code>^.field</code> reads a field of the object above.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
// "Nested list" (docs/plans/cms/nested-bindings.md): a container inside a Data Object repeater that repeats over a block / field collection of
// that object. Sets `dataBinding = { resolveMode: 'parent', target: 'list', field }` (Integrations lists are made by binding the field chip).
import { computed, ref, watch } from 'vue'
import { useEditorStore } from '../../store/editor'
import { listDataClasses, type DataClassRecord } from '../../data-objects-api'
import { dataScopeOf, fieldsInScope } from '../../scripts/nested-binding-author'

const editor = useEditorStore()
const classes = ref<DataClassRecord[]>([])
watch(() => editor.current?.id, async () => {
  if (!classes.value.length) { try { classes.value = await listDataClasses() } catch { /* the select stays empty */ } }
}, { immediate: true })

const current = computed(() => editor.current as any)
// the scope of the PARENT: this container's own binding is not part of it
const scope = computed(() => (current.value && current.value.type === 'container' && editor.document ? dataScopeOf(editor.document, current.value.id) : null))
const isList = computed(() => current.value?.dataBinding?.target === 'list')
const isGatewayList = computed(() => current.value?.type === 'container' && current.value?.gatewayBinding?.scope === 'item')
function setGatewayLimit(v: string): void {
  const n = Number(v)
  current.value.gatewayBinding.limit = Number.isInteger(n) && n > 0 ? n : null
}
function addFilter(): void {
  const gb = current.value.gatewayBinding
  gb.filters = [...(gb.filters ?? []), { field: '', operator: 'eq', value: '' }]
}
function setFilter(i: number, key: 'field' | 'operator' | 'value', value: string): void {
  const gb = current.value.gatewayBinding
  gb.filters = (gb.filters ?? []).map((f: any, j: number) => (j === i ? { ...f, [key]: value } : f))
  gb.filters = gb.filters.filter((f: any) => f.field)
}
function removeFilter(i: number): void {
  const gb = current.value.gatewayBinding
  gb.filters = (gb.filters ?? []).filter((_: unknown, j: number) => j !== i)
}
const listFields = computed(() => {
  const s = scope.value
  if (!s || !editor.document) return []
  const cls = classes.value.find((c) => c.name === s.className)
  return fieldsInScope(editor.document, current.value.id, (cls?.fields ?? []) as any).filter((f) => f.fieldType === 'block' || f.fieldType === 'fieldcollections')
})

function setField(name: string): void {
  const c = current.value
  const s = scope.value
  if (!c || !s) return
  if (!name) { if (c.dataBinding?.target === 'list') c.dataBinding = null; return }
  const def = listFields.value.find((f) => f.name === name)
  c.dataBinding = { className: s.className, objectId: null, field: name, fieldType: def?.fieldType ?? null, target: 'list', resolveMode: 'parent', ...(c.dataBinding?.target === 'list' && c.dataBinding.limit ? { limit: c.dataBinding.limit } : {}) }
}
function setLimit(v: string): void {
  const n = Number(v)
  current.value.dataBinding.limit = Number.isInteger(n) && n > 0 ? n : null
}
</script>
