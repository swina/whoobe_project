<template>
  <div class="flex flex-col gap-2 font-mono text-xs">
    <!-- Presets: named sets of directives defined once by an administrator and applied to any element. Applying COPIES
         the directives into this element, so published pages never depend on the catalog. -->
    <div class="flex flex-col gap-1 border border-indigo-200 rounded bg-indigo-50/50 p-1.5">
      <div class="flex items-center gap-1">
        <span class="font-semibold text-indigo-700">Presets</span>
        <span class="flex-1"></span>
        <button v-if="presets.length" type="button" class="text-[10px] text-indigo-600 hover:underline" @click="showManage = !showManage">
          {{ showManage ? 'Done' : 'Manage' }}
        </button>
      </div>
      <div class="flex gap-1">
        <select v-model="selectedPreset" class="flex-1 min-w-0 text-xs border rounded px-1.5 py-1 bg-white" :disabled="!presets.length">
          <option value="">{{ presets.length ? 'apply a preset...' : 'no presets yet' }}</option>
          <option v-for="p in presets" :key="p.name" :value="p.name">{{ p.name }}{{ isApplied(p) ? '  \u2713' : '' }}</option>
        </select>
        <button type="button" class="text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40" :disabled="!selectedPreset || !editor.current" @click="applySelected">Apply</button>
      </div>
      <p v-if="selected" class="text-[10px] text-gray-500">
        {{ selected.description || 'No description' }} &middot; {{ Object.keys(selected.directives).length }} directive(s)
      </p>
      <div class="flex gap-1">
        <input v-model="newPresetName" type="text" maxlength="40" placeholder="preset name" class="flex-1 min-w-0 text-xs border rounded px-1.5 py-1 bg-white" @keydown.enter="saveCurrent" />
        <button type="button" class="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-40" :disabled="!canSave || busy" @click="saveCurrent">Save as preset</button>
      </div>
      <p v-if="message" class="text-[10px]" :class="messageIsError ? 'text-rose-600' : 'text-emerald-700'">{{ message }}</p>

      <div v-if="showManage" class="flex flex-col gap-1 border-t border-indigo-200 pt-1">
        <div v-for="p in presets" :key="p.name" class="flex flex-col gap-0.5 border rounded bg-white p-1">
          <div class="flex items-center gap-1">
            <span class="flex-1 truncate text-indigo-700" :title="p.description">{{ p.name }}</span>
            <span class="text-[10px] text-gray-400">{{ Object.keys(p.directives).length }}</span>
            <button type="button" class="text-[10px] text-gray-500 hover:text-indigo-600" title="Replace this preset's directives with the ones of the selected element" :disabled="!hasCurrentDirectives || busy" @click="overwriteWithCurrent(p)">use current</button>
            <button type="button" class="text-[10px] text-gray-500 hover:text-indigo-600" @click="toggleEdit(p)">{{ editing === p.name ? 'close' : 'edit' }}</button>
            <button type="button" class="text-gray-400 hover:text-rose-500 shrink-0" title="Delete this preset (pages that used it keep their directives)" :disabled="busy" @click="removePreset(p)"><X class="w-3 h-3" /></button>
          </div>
          <div v-if="editing === p.name" class="flex flex-col gap-1">
            <input v-model="editDescription" type="text" maxlength="200" placeholder="description" class="w-full text-xs border rounded px-1.5 py-1" />
            <textarea v-model="editText" class="w-full text-xs font-mono border rounded p-1 h-28 resize-y" spellcheck="false"></textarea>
            <button type="button" class="text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500 self-start disabled:opacity-40" :disabled="busy" @click="saveEdit(p)">Save</button>
          </div>
        </div>
      </div>
      <p class="text-[10px] text-gray-400">
        A transition needs <code>x-show</code> on the same element and an <code>x-data</code> scope on it or a parent. Pages keep the directives they were given: editing or deleting a preset does not change them.
      </p>
    </div>

    <!-- Alpine runs a transition only on the element that carries x-show; a parent or a child does not count. -->
    <p v-if="transitionWithoutShow" class="text-[10px] text-amber-800 bg-amber-50 border border-amber-300 rounded p-1.5">
      This element has <code>x-transition</code> directives but no <code>x-show</code>, so nothing will animate. A
      transition runs only on the element that has <code>x-show</code> itself (not on its parent or its children): add
      <code>x-show</code> here, or apply these directives to the element that has it.
    </p>
    <div v-if="rows.length" class="flex flex-col gap-1">
      <div v-for="row in rows" :key="row.name" class="flex flex-col gap-0.5 border rounded bg-white p-1.5">
        <div class="flex items-center gap-1">
          <span class="flex-1 truncate font-mono text-indigo-600">{{ row.name }}</span>
          <button type="button" class="text-gray-400 hover:text-rose-500 shrink-0" title="Remove" @click="removeDirective(row.name)">
            <X class="w-3 h-3" />
          </button>
        </div>
        <textarea
          class="w-full text-xs font-mono border rounded p-1 h-12 resize-y"
          :value="row.value"
          @change="setDirective(row.name, ($event.target as HTMLTextAreaElement).value)"
        ></textarea>
      </div>
    </div>
    <div class="flex flex-col gap-1">
      <select v-model="newDirective" class="w-full text-xs border rounded px-1.5 py-1">
        <option value="">custom directive...</option>
        <option v-for="d in DIRECTIVES" :key="d" :value="d">{{ d }}</option>
      </select>
      <input v-if="!newDirective" v-model="customDirective" type="text" placeholder="e.g. x-on:click.outside" class="w-full text-xs border rounded px-1.5 py-1" />
      <textarea v-model="newValue" placeholder="directive value" class="w-full text-xs font-mono border rounded p-1 h-12 resize-y"></textarea>
      <button type="button" class="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 self-start" @click="addDirective">+ Add directive</button>
    </div>
    <p class="text-[10px] text-gray-400">
      AlpineJS directives, applied on the published/preview page only (not the editing canvas).
    </p>
  </div>
</template>

<script setup lang="ts">
// Port of the reference's BlockAlpine.vue, adapted to this app's store
// (useEditorStore() instead of Vuex) and its own root-level
// `element.alpine` field (ElementsClass.d.ts:164) rather than the
// reference's `element.data.alpine` - `alpine` was already declared as a
// dedicated field here, so there's no reason to nest it under the generic
// `data` bag the way the reference does. Directives are read by the
// alpineAttrs computed in BlockElementPreview.vue/BlockContainerPreview.vue/
// BlockSliderPreview.vue, v-bind-spread onto the rendered node.
import { computed, ref } from 'vue'
import { X } from '@lucide/vue'
import { useEditorStore } from '../../store/editor'
import { saveAlpinePresets, type AlpinePreset } from '../../alpine-presets-api'

const DIRECTIVES = [
  'x-data', 'x-init', 'x-show', 'x-collapse', 'x-collapse.duration' , 'x-bind', 'x-bind:class', 'x-bind:autoplay', 'x-on', 'x-on:click',
  'x-text', 'x-html', 'x-model', 'x-for', 'x-transition', 'x-transition:enter',
  'x-transition:enter-start', 'x-transition:enter-end', 'x-transition:leave',
  'x-transition:leave-start', 'x-transition:leave-end', 'x-effect', 'x-ignore',
  'x-ref', 'x-cloak', 'x-if',
]

const editor = useEditorStore()
const newDirective = ref('')
const customDirective = ref('')
const newValue = ref('')

// ---- Presets (catalog in the installation settings, see alpine-presets-api.ts) -------------------------------------
const presets = computed(() => editor.alpinePresets)
const selectedPreset = ref('')
const newPresetName = ref('')
const showManage = ref(false)
const editing = ref<string | null>(null)
const editText = ref('')
const editDescription = ref('')
const busy = ref(false)
const message = ref('')
const messageIsError = ref(false)

const selected = computed(() => presets.value.find((p) => p.name === selectedPreset.value) ?? null)
const currentDirectives = computed<Record<string, string>>(() => ({ ...((editor.current as any)?.alpine ?? {}) }))
const hasCurrentDirectives = computed(() => Object.keys(currentDirectives.value).length > 0)
const canSave = computed(() => !!editor.current && hasCurrentDirectives.value && newPresetName.value.trim().length > 0)

const transitionWithoutShow = computed(() => {
  const names = Object.keys(currentDirectives.value)
  return names.some((n) => n === 'x-transition' || n.startsWith('x-transition:') || n.startsWith('x-transition.')) && !names.includes('x-show')
})

function say(text: string, isError = false) { message.value = text; messageIsError.value = isError }

// A preset counts as applied when every one of its directives is on the element with the same value.
function isApplied(p: AlpinePreset): boolean {
  const alpine = (editor.current as any)?.alpine as Record<string, string> | undefined
  if (!alpine) return false
  return Object.entries(p.directives).every(([k, v]) => alpine[k] === v)
}

function applySelected() {
  const p = selected.value
  const current = editor.current as any
  if (!p || !current) return
  if (!current.alpine) current.alpine = {}
  for (const [name, value] of Object.entries(p.directives)) current.alpine[name] = value
  say(`Applied "${p.name}" (${Object.keys(p.directives).length} directives)`)
}

// The whole catalog is replaced on every change: it is small, and the server validates it as a unit.
async function persist(next: AlpinePreset[], okMessage: string): Promise<boolean> {
  busy.value = true
  try {
    editor.setAlpinePresets(await saveAlpinePresets(next))
    say(okMessage)
    return true
  } catch (e: any) {
    say(e?.message || 'Could not save the presets', true)
    return false
  } finally {
    busy.value = false
  }
}

async function saveCurrent() {
  if (!canSave.value) return
  const name = newPresetName.value.trim()
  const existing = presets.value.find((p) => p.name.toLowerCase() === name.toLowerCase())
  const entry: AlpinePreset = { name: existing?.name ?? name, description: existing?.description ?? '', directives: currentDirectives.value }
  const next = existing ? presets.value.map((p) => (p === existing ? entry : p)) : [...presets.value, entry]
  if (await persist(next, existing ? `Updated "${entry.name}"` : `Saved "${entry.name}"`)) {
    selectedPreset.value = entry.name
    newPresetName.value = ''
  }
}

async function overwriteWithCurrent(p: AlpinePreset) {
  if (!hasCurrentDirectives.value) return
  await persist(presets.value.map((x) => (x === p ? { ...x, directives: currentDirectives.value } : x)), `Updated "${p.name}" from the selected element`)
}

async function removePreset(p: AlpinePreset) {
  if (!window.confirm(`Delete the preset "${p.name}"? Pages that used it keep their directives.`)) return
  if (await persist(presets.value.filter((x) => x !== p), `Deleted "${p.name}"`) && selectedPreset.value === p.name) selectedPreset.value = ''
}

function toggleEdit(p: AlpinePreset) {
  if (editing.value === p.name) { editing.value = null; return }
  editing.value = p.name
  editDescription.value = p.description
  editText.value = JSON.stringify(p.directives, null, 2)
}

async function saveEdit(p: AlpinePreset) {
  let directives: unknown
  try { directives = JSON.parse(editText.value) } catch { say('The directives are not valid JSON', true); return }
  if (!directives || typeof directives !== 'object' || Array.isArray(directives)) { say('The directives must be a JSON object: { "x-show": "open", ... }', true); return }
  if (await persist(presets.value.map((x) => (x === p ? { ...x, description: editDescription.value, directives: directives as Record<string, string> } : x)), `Saved "${p.name}"`)) editing.value = null
}

const rows = computed(() => {
  const alpine = (editor.current as any)?.alpine as Record<string, string> | undefined
  if (!alpine) return []
  return Object.keys(alpine)
    .map((name) => ({ name, value: alpine[name] }))
})

function addDirective() {
  if (!editor.current) return
  const name = (newDirective.value || customDirective.value).trim()
  if (!name) return
  const current = editor.current as any
  if (!current.alpine) current.alpine = {}
  const key = name === 'x-collapse.duration' && newValue.value
    ? `x-collapse.duration.${newValue.value}`
    : name
  current.alpine[key] = newValue.value
  newDirective.value = ''
  customDirective.value = ''
  newValue.value = ''
}

function setDirective(name: string, value: string) {
  const current = editor.current as any
  if (!current?.alpine) return
  if (name === 'x-collapse.duration') {
    current.alpine[`x-collapse.duration.${value}`] = value
    delete current.alpine[name]
  } else {
    current.alpine[name] = value
  }
}

function removeDirective(name: string) {
  const current = editor.current as any
  if (!current?.alpine) return
  delete current.alpine[name]
}
</script>
