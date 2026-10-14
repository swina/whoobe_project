<template>
  <div class="flex-1 min-h-0 overflow-y-auto flex flex-col text-[10px] font-normal">
    <div v-if="!editor.current" class="p-3 text-gray-400">Select an element to see and edit its data binding</div>
    <template v-else>
      <div class="p-2 flex flex-col gap-1.5 border-b border-slate-300" data-testid="data-panel-current">
        <div class="font-semibold text-gray-600">Current binding</div>
        <div v-if="!db && !gb" class="text-gray-400">This element is not bound to any data.</div>
        <div v-if="db" class="flex items-start justify-between gap-2 border rounded bg-white p-1.5">
          <div class="min-w-0">
            <div class="font-semibold text-indigo-600">Data Object</div>
            <div class="truncate" :title="dbLabel">{{ dbLabel }}</div>
            <div class="text-gray-400">target: {{ db.target }}</div>
            <div class="mt-1 text-gray-500">Schema</div>
            <div v-if="dbFields === null" class="text-gray-400">Loading...</div>
            <div v-else-if="!dbFields.length" class="text-gray-400">No schema available.</div>
            <ul v-else class="max-h-40 overflow-y-auto border rounded divide-y bg-gray-50" data-testid="data-panel-db-schema">
              <li v-for="f in dbFields" :key="f.name" class="px-1.5 py-0.5 flex items-center gap-1.5" :class="f.name === db.field ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600'">
                <span class="font-mono truncate">{{ f.name }}</span>
                <span class="ml-auto text-[9px] text-gray-400 font-mono shrink-0">{{ f.fieldType }}</span>
              </li>
            </ul>
          </div>
          <div class="shrink-0 flex flex-col items-end gap-0.5">
            <button type="button" class="text-indigo-600 font-semibold hover:underline" @click="editorBus.emit('openDataPicker')">Edit</button>
            <button type="button" class="text-gray-400 hover:text-rose-500" @click="clear('dataBinding')">Remove</button>
          </div>
        </div>
        <div v-if="gb" class="flex items-start justify-between gap-2 border rounded bg-white p-1.5">
          <div class="min-w-0">
            <div class="font-semibold text-amber-600">Integration</div>
            <div class="truncate" :title="gbLabel">{{ gbLabel }}</div>
            <div class="mt-1 text-gray-500">Schema</div>
            <div v-if="gb.scope === 'item'" class="text-gray-400">Part of the item of the list above: its fields are those of that list.</div>
            <div v-else-if="gbFields === null" class="text-gray-400">Loading...</div>
            <div v-else-if="!gbFields.length" class="text-gray-400">No schema yet. Test the route in Integrations to see its fields.</div>
            <ul v-else class="max-h-40 overflow-y-auto border rounded divide-y bg-gray-50" data-testid="data-panel-gateway-schema">
              <li v-for="f in gbFields" :key="f.path" class="px-1.5 py-0.5 flex items-center gap-1.5" :class="isBoundPath(f.path) ? 'bg-amber-50 text-amber-700 font-semibold' : 'text-gray-600'">
                <span class="font-mono truncate">{{ f.path }}</span>
                <span class="ml-auto text-[9px] text-gray-400 font-mono shrink-0">{{ f.type }}</span>
              </li>
            </ul>
          </div>
          <div class="shrink-0 flex flex-col items-end gap-0.5">
            <button type="button" class="text-amber-600 font-semibold hover:underline" @click="editorBus.emit('openGatewayPicker')">Edit</button>
            <button type="button" class="text-gray-400 hover:text-rose-500" @click="clear('gatewayBinding')">Remove</button>
          </div>
        </div>
        <div class="flex gap-1.5">
          <button v-if="!db" type="button" class="flex-1 border rounded px-1.5 py-1 bg-white hover:border-indigo-400" @click="editorBus.emit('openDataPicker')">Bind to a Data Object</button>
          <button v-if="!gb" type="button" class="flex-1 border rounded px-1.5 py-1 bg-white hover:border-amber-400" @click="editorBus.emit('openGatewayPicker')">Bind to an Integration</button>
        </div>
      </div>

      <div v-if="listCtx" class="p-2 flex flex-col gap-1 border-b border-slate-300" data-testid="data-panel-list-fields">
        <div class="font-semibold text-gray-600">Fields of the list this element sits in</div>
        <div class="truncate text-gray-400" :title="listCtx.label">{{ listCtx.label }}</div>
        <div v-if="listFields === null" class="text-gray-400">Loading...</div>
        <div v-else-if="!listFields.length" class="text-gray-400">No schema available{{ listCtx.kind === 'gateway' ? ' yet. Test the route in Integrations to see its fields.' : '.' }}</div>
        <div v-else class="max-h-56 overflow-y-auto border rounded bg-white py-0.5">
          <div
            v-for="f in listFields"
            :key="f.path"
            :draggable="listCtx.kind === 'gateway'"
            class="flex items-center gap-1.5 px-2 py-1 select-none hover:bg-indigo-50 hover:text-indigo-700"
            :class="[listCtx.kind === 'gateway' ? 'cursor-grab' : 'cursor-pointer', isListFieldBound(f) ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600']"
            title="Click to bind the selected element to this field"
            @dragstart="onFieldDragStart($event, f)"
            @click="bindListField(f)"
          >
            <GripVertical class="w-3 h-3 text-gray-300 shrink-0" />
            <span class="font-mono truncate">{{ f.path }}</span>
            <span class="ml-auto text-[9px] text-gray-400 font-mono shrink-0">{{ f.type }}</span>
          </div>
        </div>
      </div>

      <template v-for="section in sections" :key="section.key">
        <button
          type="button"
          class="w-full flex items-center justify-between px-3 py-1.5 font-semibold text-gray-600 hover:bg-violet-500 hover:text-white border-b border-slate-300" :class="{ 'bg-violet-500 text-white': openSection === section.key }"
          @click="openSection = openSection === section.key ? null : section.key"
        >
          {{ section.label }}
          <ChevronDown v-if="openSection === section.key" class="w-3.5 h-3.5 text-gray-400" />
          <ChevronRight v-else class="w-3.5 h-3.5 text-gray-400" />
        </button>
        <div v-if="openSection === section.key" class="p-2 border-b border-slate-300 bg-gray-200">
          <component :is="section.component" />
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
// Sidebar tab body for the "Data" tab (BlockEditor.vue): everything about the data of the selected element in one place - its current
// binding (Data Object or Integration, with Edit/Remove: the pickers themselves live in FloatingToolbar.vue and are opened through
// editorBus), the format of the bound value (data binding transform), the Nested list settings and the Linked bindings of a bound list. These used to be
// sections of the Advanced panel and keep the same visibility conditions.
import { computed, ref, watch } from 'vue'
import { ChevronDown, ChevronRight, GripVertical } from '@lucide/vue'
import { useEditorStore } from '../store/editor'
import { editorBus } from '../bus'
import { resolveDocumentData } from '../scripts/data-resolver'
import { listDataClasses } from '../data-objects-api'
import { ancestorsOf, listLevels, dataScopeOf, fieldsInScope, toRelativeGatewayBinding } from '../scripts/nested-binding-author'
import { bindingTargetOf } from '../scripts/binding-target'
import { GATEWAY_FIELD_DRAG_MIME_TYPE, type GatewayFieldDragPayload } from '../utils/gateway-drag'
import { flattenSchemaFields, type FlatSchemaField } from '../utils/gateway-schema-walk'
import NestedListControl from './advanced/NestedListControl.vue'
import SelectionControl from './advanced/SelectionControl.vue'
import DataBindingTransformControl from './tailwind-controls/DataBindingTransformControl.vue'

const editor = useEditorStore()
const openSection = ref<string | null>('dataBinding')

const db = computed(() => (editor.current as any)?.dataBinding ?? null)
const gb = computed(() => (editor.current as any)?.gatewayBinding ?? null)

const dbLabel = computed(() => {
  const d = db.value
  if (!d) return ''
  const what = d.field ? `${d.className}.${d.field}` : d.className
  return d.resolveMode === 'explicit' && d.objectId ? `${what} (one object)` : what
})
const gbLabel = computed(() => {
  const g = gb.value
  if (!g) return ''
  if (g.scope === 'item') return `item › ${g.fieldPath}`
  const where = [g.endpointName, g.routePath].filter(Boolean).join(' ')
  return `${where}${g.fieldPath ? ` › ${g.fieldPath}` : ' (whole response)'}`
})

// Schema of what the element is bound to: the fields of the Data Class, or the inferred schema of the gateway route (the same one the
// binding pickers list). null = loading.
const dbFields = ref<{ name: string; fieldType: string }[] | null>(null)
const gbFields = ref<FlatSchemaField[] | null>(null)

watch(() => db.value?.className, async (name) => {
  if (!name) { dbFields.value = []; return }
  dbFields.value = null
  try {
    const cls = (await listDataClasses()).find((c) => c.name === name)
    if (db.value?.className === name) dbFields.value = (cls?.fields ?? []) as any
  } catch { if (db.value?.className === name) dbFields.value = [] }
}, { immediate: true })

const gatewaySchemaCache = new Map<string, Promise<FlatSchemaField[]>>()
function loadGatewayFields(endpointName: string, routePath: string): Promise<FlatSchemaField[]> {
  const key = `${endpointName}\n${routePath}`
  let p = gatewaySchemaCache.get(key)
  if (!p) {
    p = (async () => {
      const api = await import('../gateway-api')
      const endpoint = (await api.listEndpoints()).find((e) => e.name === endpointName)
      const route = endpoint && (await api.listRoutes(endpoint.id)).find((r) => r.path === routePath)
      const schema = route && (await api.getRouteSchema(route.id))
      return flattenSchemaFields(schema?.schema as any)
    })().catch(() => { gatewaySchemaCache.delete(key); return [] })
    gatewaySchemaCache.set(key, p)
  }
  return p
}

watch(() => [gb.value?.endpointName, gb.value?.routePath, gb.value?.scope] as const, async ([endpointName, routePath, scope]) => {
  if (!endpointName || !routePath || scope === 'item') { gbFields.value = []; return }
  gbFields.value = null
  const fields = await loadGatewayFields(endpointName, routePath)
  if (gb.value?.endpointName === endpointName && gb.value?.routePath === routePath) gbFields.value = fields
}, { immediate: true })

// the bound field itself and, for a list, the fields inside it
const isBoundPath = (path: string) => !!gb.value?.fieldPath && (path === gb.value.fieldPath || path.startsWith(`${gb.value.fieldPath}.`))

// The nearest bound list above the selected element (a container with a Data Class query / nested list, or an Integrations list): its
// item fields are what the element can be bound to without opening a picker. Same relative bindings the pickers and the canvas drop make.
interface ListField { path: string; type: string; absPath?: string }
type ListCtx =
  | { kind: 'gateway'; label: string; endpointName: string; routePath: string; basePath: string }
  | { kind: 'data'; label: string; className: string }

const listCtx = computed<ListCtx | null>(() => {
  const cur = editor.current as any
  if (!cur || !editor.document) return null
  const ancestors = ancestorsOf(editor.document, cur.id)
  if (!ancestors) return null
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i]
    if (a.type !== 'container') continue
    if (a.gatewayBinding) {
      const level = listLevels(ancestors.slice(0, i + 1)).pop()
      if (!level?.endpointName || !level.routePath) return null
      return { kind: 'gateway', label: `${level.endpointName} ${level.routePath}${level.path ? ` › ${level.path}` : ''}`, endpointName: level.endpointName, routePath: level.routePath, basePath: level.path }
    }
    const d = a.dataBinding
    if (d && (!d.field || d.target === 'list')) {
      const scope = dataScopeOf(editor.document, cur.id)
      return scope ? { kind: 'data', label: scope.listField ? `${scope.className} › ${scope.listField}` : scope.className, className: scope.className } : null
    }
  }
  return null
})

const listFields = ref<ListField[] | null>(null)
watch(listCtx, async (ctx) => {
  if (!ctx) { listFields.value = []; return }
  listFields.value = null
  const same = () => JSON.stringify(listCtx.value) === JSON.stringify(ctx)
  if (ctx.kind === 'gateway') {
    const prefix = ctx.basePath ? `${ctx.basePath}.` : ''
    const all = await loadGatewayFields(ctx.endpointName, ctx.routePath)
    if (same()) listFields.value = all.filter((f) => f.path.startsWith(prefix)).map((f) => ({ path: f.path.slice(prefix.length), type: f.type, absPath: f.path }))
    return
  }
  try {
    const cls = (await listDataClasses()).find((c) => c.name === ctx.className)
    const fields = cls && editor.document && editor.current ? fieldsInScope(editor.document, (editor.current as any).id, cls.fields as any) : []
    if (same()) listFields.value = fields.map((f) => ({ path: f.name, type: f.fieldType }))
  } catch { if (same()) listFields.value = [] }
}, { immediate: true })

function isListFieldBound(f: ListField) {
  if (listCtx.value?.kind === 'data') return db.value?.field === f.path && !db.value?.objectId
  const g = gb.value
  return !!g && g.scope === 'item' && g.fieldPath === f.path
}

function bindListField(f: ListField) {
  const cur = editor.current as any
  const ctx = listCtx.value
  if (!cur || !ctx || !editor.document) return
  if (ctx.kind === 'data') {
    cur.dataBinding = { className: ctx.className, objectId: null, field: f.path, fieldType: f.type, target: bindingTargetOf(cur), resolveMode: 'explicit' }
  } else {
    cur.gatewayBinding = toRelativeGatewayBinding(editor.document, cur.id, { endpointName: ctx.endpointName, routePath: ctx.routePath, fieldPath: f.absPath ?? f.path, params: null, transform: null })
  }
  resolveDocumentData(editor.document)
}

function onFieldDragStart(e: DragEvent, f: ListField) {
  const ctx = listCtx.value
  if (!ctx || ctx.kind !== 'gateway' || !e.dataTransfer) return
  const payload: GatewayFieldDragPayload = { endpointName: ctx.endpointName, routePath: ctx.routePath, fieldPath: f.absPath ?? f.path }
  e.dataTransfer.setData(GATEWAY_FIELD_DRAG_MIME_TYPE, JSON.stringify(payload))
  e.dataTransfer.effectAllowed = 'copy'
}

function clear(key: 'dataBinding' | 'gatewayBinding') {
  if (!editor.current) return
  ;(editor.current as any)[key] = null
  if (editor.document) resolveDocumentData(editor.document)
}

const sections = computed(() => {
  const current = editor.current as any
  const d = db.value
  const isImgSrcBinding = d?.target === 'src' && current?.element === 'img'
  const showDataObjectBinding = d && (d.target === 'content' || isImgSrcBinding)
  // no single value to format for a "Whole response" gateway binding
  const showDataBinding = showDataObjectBinding || Boolean(gb.value && gb.value.fieldPath)
  // a container bound to a list (Data Class query, or an Integrations list): the only kind of element that can publish or listen to a selection
  const isBoundList = current?.type === 'container' && Boolean((d && (!d.field || d.target === 'list')) || gb.value)
  return [
    ...(showDataBinding ? [{ key: 'dataBinding', label: 'Data binding transform', component: DataBindingTransformControl }] : []),
    ...(current?.type === 'container' && !(gb.value && gb.value.scope !== 'item') ? [{ key: 'nestedList', label: 'Nested list', component: NestedListControl }] : []),
    ...(isBoundList ? [{ key: 'selection', label: 'Linked bindings', component: SelectionControl }] : []),
  ]
})
</script>
