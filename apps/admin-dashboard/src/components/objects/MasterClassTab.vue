<template>
  <div v-if="!isPlaceholder && !existingClass && dataClassesStore.isLoading" class="p-6 text-center text-xs text-slate-500">Loading class…</div>
  <div v-else class="h-full flex flex-col ">
    <div class="shrink-0 px-6 pt-6 pb-3 space-y-3 border-b border-slate-800 light:border-slate-200">
      <div class="flex items-center gap-2">
        <h3 class="text-lg font-bold text-slate-100 light:text-slate-900">{{ isNew ? 'New Class' : (label || name) }}</h3>
        <span v-if="!isNew" class="px-2 py-0.5 text-xs bg-slate-800 light:bg-slate-100 rounded font-mono text-indigo-300">{{ name }}</span>
        <div class="flex-1"></div>
        <button
          @click="handleSave"
          :disabled="isSaving || !name.trim() || !label.trim()"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
        >
          {{ isSaving ? 'Saving…' : 'Save Class' }}
        </button>
      </div>

      <div class="grid grid-cols-2 gap-2 max-w-2xl">
        <div>
          <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Name (identifier)</label>
          <input
            v-model="name"
            :disabled="!isNew"
            type="text"
            placeholder="e.g. Product"
            class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Label</label>
          <input
            v-model="label"
            type="text"
            placeholder="e.g. Product"
            class="w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>
      <p v-if="!isNew && objectCount > 0" class="text-xs text-amber-400">
        {{ objectCount }} existing object(s) - a field's name or type can't be changed while they exist; adding new fields or editing
        title/mandatory/localized/options is fine.
      </p>

      <!-- Editor subtabs - docs/plans/UI/editing-object-class.md: the View
           Layout editor gets its own subtab rather than living inline
           under the field list. -->
      <div class="flex items-center gap-1">
        <button
          v-for="tab in editorTabs"
          :key="tab.key"
          @click="editorTab = tab.key"
          type="button"
          :class="[
            'px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition',
            editorTab === tab.key ? 'border-indigo-500 text-indigo-300' : 'border-transparent text-slate-500 hover:text-slate-300 light:text-slate-700'
          ]"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4 max-w-[70rem]">
      <!-- Fields - docs/plans/datamodel/component-fields-plan.md §2.4:
           extracted into FieldListEditor.vue, shared with
           ComponentSettingsCard.vue's own field list. -->
      <FieldListEditor v-if="editorTab === 'fields'" v-model="fields" />

      <!-- View Layout: sections/fields as a tree - docs/plans/UI/editing-
           object-class.md. Optional; an empty tree keeps this class on
           the generic flat detail form exactly as before. Reassigning a
           field moves it between tree nodes (no drag-and-drop, matching
           this codebase's own recurring precedent for admin editors). -->
      <div v-if="editorTab === 'viewLayout'" class="space-y-3">        <div class="flex items-center justify-between">
          <p class="text-[11px] text-slate-500">
            Group fields into sections - each becomes its own tab on the object edit form. Fields left ungrouped still show, under an
            "Other fields" tab.
          </p>
          <button @click="addSection" type="button" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300 shrink-0 ml-3">+ Add section</button>
        </div>

        <p v-if="namedFields.length === 0" class="text-xs text-slate-600 light:text-slate-400 italic">Add fields on the Fields tab first.</p>

        <div v-else class="space-y-1.5">
          <!-- Ungrouped fields -->
          <div class="rounded-lg border border-slate-800/60 light:border-slate-200/60">
            <button @click="toggleExpanded('__ungrouped__')" type="button" class="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-slate-400 light:text-slate-600 text-left">
              <component :is="isExpanded('__ungrouped__') ? ChevronDown : ChevronRight" class="w-3.5 h-3.5 shrink-0 text-slate-500" />
              Ungrouped fields
              <span class="text-slate-600 light:text-slate-400">({{ ungroupedFields.length }})</span>
            </button>
            <div v-if="isExpanded('__ungrouped__')" class="pl-6 pb-2 pr-2 space-y-1 border-t border-slate-800/60 light:border-slate-200/60 pt-1.5">
              <div v-for="field in ungroupedFields" :key="field.name" class="flex flex-col gap-1 text-xs text-slate-400 light:text-slate-600 py-0.5">
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate">{{ field.title || field.name }}</span>
                  <select
                    :value="''"
                    @change="assignFieldToSection(field.name, ($event.target as HTMLSelectElement).value)"
                    class="px-1.5 py-1 text-[11px] bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500 shrink-0"
                  >
                    <option value="">Ungrouped</option>
                    <option v-for="(section, i) in viewConfig.detailSections" :key="i" :value="i">→ {{ section.title || `Section ${i + 1}` }}</option>
                  </select>
                </div>
                <select
                  v-if="relationDisplayOptions(field)"
                  :value="field.relationDisplayField ?? ''"
                  @change="setRelationDisplayField(field, ($event.target as HTMLSelectElement).value)"
                  class="w-52 px-1.5 py-1 text-[11px] bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Show: Key (default)</option>
                  <option v-for="f in relationDisplayOptions(field)" :key="f.name" :value="f.name">{{ f.title || f.name }}</option>
                </select>
              </div>
              <p v-if="ungroupedFields.length === 0" class="text-slate-600 light:text-slate-400 italic">All fields are assigned to a section.</p>
            </div>
          </div>

          <!-- Sections -->
          <div v-for="(section, sectionIndex) in viewConfig.detailSections" :key="sectionIndex" class="rounded-lg border border-slate-800 light:border-slate-200">
            <div class="flex items-center gap-1.5 px-2 py-1.5">
              <button @click="toggleExpanded(sectionIndex)" type="button" class="shrink-0">
                <component :is="isExpanded(sectionIndex) ? ChevronDown : ChevronRight" class="w-3.5 h-3.5 text-slate-500" />
              </button>
              <input
                v-model="section.title"
                type="text"
                placeholder="Section title (e.g. Pricing)"
                class="flex-1 px-2 py-1 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
              />
              <span class="text-[10px] text-slate-600 light:text-slate-400 shrink-0">({{ sectionFields(sectionIndex).length }})</span>
              <button @click="moveSection(sectionIndex, -1)" type="button" :disabled="sectionIndex === 0" class="text-xs text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 disabled:opacity-30 shrink-0">↑</button>
              <button @click="moveSection(sectionIndex, 1)" type="button" :disabled="sectionIndex === viewConfig.detailSections.length - 1" class="text-xs text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 disabled:opacity-30 shrink-0">↓</button>
              <button @click="removeSection(sectionIndex)" type="button" class="text-xs text-rose-400 hover:text-rose-300 shrink-0">Remove</button>
            </div>
            <div v-if="isExpanded(sectionIndex)" class="pl-6 pb-2 pr-2 space-y-2 border-t border-slate-800/60 light:border-slate-200/60 pt-1.5">
              <div class="space-y-1">
                <input
                  v-model="section.containerClass"
                  type="text"
                  placeholder="Custom container classes (e.g. grid grid-cols-2 gap-4)"
                  class="w-full px-2 py-1 text-[11px] font-mono bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
                />
                <p class="text-[10px] text-slate-600 light:text-slate-400 italic">
                  Optional Tailwind classes applied to this section's field container on the object edit form - replaces the default
                  vertical stack (e.g. for a grid layout). Named utilities work directly: grid, grid-cols-4, gap-5, p-4, bg-slate-100,
                  rounded-lg, max-w-lg, and most other common Tailwind classes. For an exact value, use bracket syntax -
                  w-[640px], bg-[#f5f5f5] - not fraction shorthand (max-w-2/3 isn't a real Tailwind utility, only w-2/3 etc. are).
                </p>
              </div>
              <div
                v-for="(field, fieldIndex) in sectionFields(sectionIndex)"
                :key="field.name"
                class="flex flex-col gap-1 text-xs text-slate-400 light:text-slate-600 py-0.5"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate">{{ field.title || field.name }}</span>
                  <div class="flex items-center gap-1 shrink-0">
                    <button
                      @click="moveFieldInSection(sectionIndex, field.name, -1)"
                      type="button"
                      :disabled="fieldIndex === 0"
                      class="text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 disabled:opacity-30"
                    >↑</button>
                    <button
                      @click="moveFieldInSection(sectionIndex, field.name, 1)"
                      type="button"
                      :disabled="fieldIndex === sectionFields(sectionIndex).length - 1"
                      class="text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 disabled:opacity-30"
                    >↓</button>
                    <select
                      :value="String(sectionIndex)"
                      @change="assignFieldToSection(field.name, ($event.target as HTMLSelectElement).value)"
                      class="px-1.5 py-1 text-[11px] bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">Ungrouped</option>
                      <option v-for="(s, i) in viewConfig.detailSections" :key="i" :value="i">→ {{ s.title || `Section ${i + 1}` }}</option>
                    </select>
                  </div>
                </div>
                <select
                  v-if="relationDisplayOptions(field)"
                  :value="field.relationDisplayField ?? ''"
                  @change="setRelationDisplayField(field, ($event.target as HTMLSelectElement).value)"
                  class="w-52 px-1.5 py-1 text-[11px] bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Show: Key (default)</option>
                  <option v-for="f in relationDisplayOptions(field)" :key="f.name" :value="f.name">{{ f.title || f.name }}</option>
                </select>
              </div>
              <p v-if="sectionFields(sectionIndex).length === 0" class="text-slate-600 light:text-slate-400 italic">No fields yet - move some in from Ungrouped.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- List Layout: the class's default listing columns for the
           Objects tab - docs/plans/UI/editing-object-class.md. Optional;
           an empty list keeps the listing's existing "all columns"
           behavior. Column rows are admin-reorderable and removable, new
           ones are picked from the class's named fields + the system
           columns, and a custom title overrides the header label. -->
      <div v-if="editorTab === 'listLayout'" class="space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-[11px] text-slate-500">
            Define the default columns for this class's object listing. Any saved view (the listing's own View ▾ menu) overrides these;
            otherwise they apply whenever this class is selected.
          </p>
          <button
            v-if="listColumns.length > 0"
            @click="listColumns = []"
            type="button"
            class="text-xs font-semibold text-rose-400 hover:text-rose-300 shrink-0 ml-3"
          >Clear all</button>
        </div>

        <p v-if="namedFields.length === 0" class="text-xs text-slate-600 light:text-slate-400 italic">Add fields on the Fields tab first.</p>

        <template v-else>
          <div v-if="listColumns.length === 0" class="rounded-lg border border-dashed border-slate-800 light:border-slate-200 p-4 text-xs text-slate-600 light:text-slate-400 italic">
            No columns configured - the listing shows every field. Pick columns below to define a fixed layout.
          </div>

          <div v-else class="rounded-lg border border-slate-800 light:border-slate-200 overflow-hidden">
            <div
              v-for="(column, columnIndex) in listColumns"
              :key="column.name"
              class="flex items-center gap-2 px-2 py-1.5 text-xs border-b border-slate-800/60 light:border-slate-200/60 last:border-b-0"
            >
              <component :is="listColumnIcon(column.name, classFieldType(column.name))" class="w-3.5 h-3.5 shrink-0 text-slate-500" />
              <div class="flex flex-col flex-1 min-w-0 gap-0.5">
                <span class="text-slate-300 light:text-slate-700 truncate">{{ columnTitle(column.name) }}</span>
                <input
                  v-model="column.title"
                  type="text"
                  placeholder="Custom header (optional)"
                  class="px-2 py-0.5 text-[11px] bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
                />
                <select
                  v-if="relationDisplayOptions(classFieldByName(column.name))"
                  :value="classFieldByName(column.name)?.relationDisplayField ?? ''"
                  @change="setRelationDisplayField(classFieldByName(column.name)!, ($event.target as HTMLSelectElement).value)"
                  class="px-2 py-0.5 text-[11px] bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Show: Key (default)</option>
                  <option v-for="f in relationDisplayOptions(classFieldByName(column.name))" :key="f.name" :value="f.name">{{ f.title || f.name }}</option>
                </select>
              </div>
              <button @click="moveListColumn(columnIndex, -1)" type="button" :disabled="columnIndex === 0" class="text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 disabled:opacity-30 shrink-0">↑</button>
              <button @click="moveListColumn(columnIndex, 1)" type="button" :disabled="columnIndex === listColumns.length - 1" class="text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 disabled:opacity-30 shrink-0">↓</button>
              <button @click="removeListColumn(columnIndex)" type="button" class="text-xs text-rose-400 hover:text-rose-300 shrink-0">✕</button>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <select
              v-model="pendingColumnName"
              class="flex-1 px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="" disabled>Pick a column to add…</option>
              <optgroup v-if="availableSystemColumns.length > 0" label="System">
                <option v-for="col in availableSystemColumns" :key="col.name" :value="col.name">{{ col.title }}</option>
              </optgroup>
              <optgroup label="Fields">
                <option v-for="field in availableFieldColumns" :key="field.name" :value="field.name">{{ field.title || field.name }}</option>
              </optgroup>
            </select>
            <button
              @click="addListColumn"
              :disabled="!pendingColumnName"
              type="button"
              class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 shrink-0"
            >+ Add</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// A class opens as a real tab, not the inline expand-in-place editor
// ClassSettingsCard.vue used to hold directly - matching MasterObjectTab.
// vue's/MasterPageTab.vue's own "master item gets exactly one tab in the
// main strip" convention (tabsStore.ts's own file-level comment). Content
// is otherwise a straight lift of ClassSettingsCard.vue's former inline
// editor - see that file's git history for the pre-tab version.
import { ref, reactive, computed, watch } from 'vue'
import { ChevronDown, ChevronRight } from '@lucide/vue'
import type { ClassFieldDefinition, ClassViewConfig } from '@whoobe-cms/core'
import { useDataClassesStore } from '../../stores/dataClassesStore'
import { useTabsStore, classTabId } from '../../stores/tabsStore'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { fetchDataObjects } from '../../utils/data-objects-api'
import { SYSTEM_LIST_COLUMNS, listColumnIcon } from '../../utils/list-columns'
import FieldListEditor from './FieldListEditor.vue'

const props = defineProps<{ classId: string }>()

const dataClassesStore = useDataClassesStore()
const tabsStore = useTabsStore()
const authStore = useAuthStore()
const toastStore = useToastStore()

// ClassSettingsCard.vue's "+ New class" mints a client-side `new:<uuid>`
// tab id (ObjectsView.vue's handleCreate() does the same for objects) -
// `id` is a real Postgres `uuid` column, so that placeholder must never
// reach an API call.
const isPlaceholder = props.classId.startsWith('new:')
const existingClass = computed(() => dataClassesStore.classes.find((c) => c.id === props.classId))

const editingId = ref<string | null>(isPlaceholder ? null : props.classId)
const isNew = computed(() => editingId.value === null)
const isSaving = ref(false)
const objectCount = ref(0)
const hydrated = ref(false)

const editorTabs: { key: 'fields' | 'viewLayout' | 'listLayout'; label: string }[] = [
  { key: 'fields', label: 'Fields' },
  { key: 'viewLayout', label: 'View Layout' },
  { key: 'listLayout', label: 'List Layout' },
]
const editorTab = ref<'fields' | 'viewLayout' | 'listLayout'>('fields')

const name = ref('')
const label = ref('')
const fields = ref<ClassFieldDefinition[]>([])
const viewConfig = ref<{ detailSections: { title: string; fields: string[]; containerClass?: string }[] }>({
  detailSections: [],
})
const listColumns = ref<{ name: string; title?: string }[]>([])
const pendingColumnName = ref('')

// Seeds the editable draft from the loaded class exactly once - further
// store refreshes (e.g. this same save re-triggering refreshDataClasses())
// must not clobber in-progress edits.
watch(
  existingClass,
  (dataClass) => {
    if (!dataClass || hydrated.value) return
    name.value = dataClass.name
    label.value = dataClass.label
    fields.value = dataClass.fields.map((f) => ({ ...f }))
    viewConfig.value = {
      detailSections: (dataClass.viewConfig?.detailSections ?? []).map((s) => ({ title: s.title, fields: [...s.fields], containerClass: s.containerClass ?? '' })),
    }
    listColumns.value = (dataClass.viewConfig?.listColumns ?? []).map((c) => ({ name: c.name, ...(c.title ? { title: c.title } : {}) }))
    hydrated.value = true
    fetchDataObjects(authStore.config.coreApiUrl, dataClass.id)
      .then((objects) => (objectCount.value = objects.length))
      .catch(() => {})
  },
  { immediate: true }
)

// Fields with a real `name` typed in yet - the View Layout tree keys
// everything off `name`, so a blank in-progress field row (just added,
// not filled in) would otherwise show as an unusable empty tree node.
const namedFields = computed(() => fields.value.filter((f) => f.name.trim() !== ''))

// View Layout tree - docs/plans/UI/editing-object-class.md. Expand state
// keyed by section index (as a string) or the '__ungrouped__' sentinel;
// everything starts expanded (a handful of sections/fields at most, per
// this codebase's own small-scale admin-editor precedent elsewhere).
const expandedKeys = reactive<Record<string, boolean>>({ __ungrouped__: true })

function isExpanded(key: string | number): boolean {
  const k = String(key)
  return expandedKeys[k] ?? true
}

function toggleExpanded(key: string | number) {
  const k = String(key)
  expandedKeys[k] = !isExpanded(k)
}

const ungroupedFields = computed(() => {
  const assigned = new Set(viewConfig.value.detailSections.flatMap((s) => s.fields))
  return namedFields.value.filter((f) => !assigned.has(f.name))
})

// Order follows the section's own `fields` array (admin-reorderable via
// moveFieldInSection below), not the class's overall field-definition
// order - a `.map`, not a `.filter` over `namedFields`.
function sectionFields(sectionIndex: number): ClassFieldDefinition[] {
  const names = viewConfig.value.detailSections[sectionIndex]?.fields ?? []
  const byName = new Map(namedFields.value.map((f) => [f.name, f]))
  return names.map((n) => byName.get(n)).filter((f): f is ClassFieldDefinition => !!f)
}

function moveFieldInSection(sectionIndex: number, fieldName: string, direction: 1 | -1) {
  const arr = viewConfig.value.detailSections[sectionIndex].fields
  const index = arr.indexOf(fieldName)
  const target = index + direction
  if (index === -1 || target < 0 || target >= arr.length) return
  const [moved] = arr.splice(index, 1)
  arr.splice(target, 0, moved)
}

function addSection() {
  viewConfig.value.detailSections.push({ title: '', fields: [], containerClass: '' })
}

function removeSection(index: number) {
  viewConfig.value.detailSections.splice(index, 1)
}

function moveSection(index: number, direction: 1 | -1) {
  const sections = viewConfig.value.detailSections
  const target = index + direction
  if (target < 0 || target >= sections.length) return
  const [moved] = sections.splice(index, 1)
  sections.splice(target, 0, moved)
  // Expand/collapse state is keyed by index, not identity - re-key it
  // along with the move so a section's own expanded/collapsed state
  // travels with it instead of staying pinned to its old position.
  const a = expandedKeys[String(index)]
  const b = expandedKeys[String(target)]
  expandedKeys[String(index)] = b ?? true
  expandedKeys[String(target)] = a ?? true
}

// Moves a field to the section at `targetValue` (its index as a string),
// or back to Ungrouped when `targetValue` is empty - the tree's
// reassignment control (no drag-and-drop, matching this codebase's own
// recurring precedent for admin editors elsewhere). Appends to the end of
// the target section's own order rather than re-sorting the whole section
// back to class-field-definition order - that used to happen here, which
// silently discarded any manual reordering (moveFieldInSection) every
// time a field was reassigned into an already-ordered section.
function assignFieldToSection(fieldName: string, targetValue: string) {
  const sections = viewConfig.value.detailSections
  for (const s of sections) s.fields = s.fields.filter((f) => f !== fieldName)
  if (targetValue !== '') {
    sections[Number(targetValue)].fields.push(fieldName)
  }
}

// List Layout - the class's default listing columns. Picks come from the
// class's named fields plus the system columns (shared vocabulary with
// ObjectsView.vue via utils/list-columns.ts); `title` is an optional
// custom header that overrides the column's natural label.
const systemColumnTitles = new Map(SYSTEM_LIST_COLUMNS.map((c) => [c.name, c.title]))

function classFieldByName(name: string): ClassFieldDefinition | undefined {
  return namedFields.value.find((f) => f.name === name)
}

function classFieldType(name: string): string | undefined {
  return classFieldByName(name)?.fieldType
}

function columnTitle(name: string): string {
  return classFieldByName(name)?.title || classFieldByName(name)?.name || systemColumnTitles.get(name) || name
}

const availableSystemColumns = computed(() =>
  SYSTEM_LIST_COLUMNS.filter((c) => !listColumns.value.some((lc) => lc.name === c.name))
)
const availableFieldColumns = computed(() =>
  namedFields.value.filter((f) => !listColumns.value.some((lc) => lc.name === f.name))
)

function addListColumn() {
  const name = pendingColumnName.value
  if (!name || listColumns.value.some((lc) => lc.name === name)) return
  listColumns.value.push({ name })
  pendingColumnName.value = ''
}

function removeListColumn(index: number) {
  listColumns.value.splice(index, 1)
}

function moveListColumn(index: number, direction: 1 | -1) {
  const target = index + direction
  if (target < 0 || target >= listColumns.value.length) return
  const [moved] = listColumns.value.splice(index, 1)
  listColumns.value.splice(target, 0, moved)
}

// Relation display fields - shared by the List Layout and View Layout
// tabs. A relation-flavored field (relationTarget set) gets a picker of
// the related class's fields; the chosen one becomes
// `relationDisplayField` on the field definition itself (like
// relationTarget), so the listing columns and the form's relation pickers
// both show it - one source of truth, no per-config duplication.
function relationDisplayOptions(field: ClassFieldDefinition | undefined): ClassFieldDefinition[] | null {
  if (!field?.relationTarget) return null
  const targetClass = dataClassesStore.classes.find((c) => c.name === field.relationTarget)
  return targetClass?.fields ?? null
}

function setRelationDisplayField(field: ClassFieldDefinition, value: string) {
  if (value === '') delete field.relationDisplayField
  else field.relationDisplayField = value
}

// Drops anything authored, then abandoned - a field removed/renamed
// mid-edit, or a section left with no title/fields - and collapses back
// to `null` when nothing real is configured, so a class nobody touched
// this section for keeps rendering with the plain fallback (§3.3).
function buildViewConfigPayload(): ClassViewConfig | null {
  const validNames = new Set(namedFields.value.map((f) => f.name))
  const detailSections = viewConfig.value.detailSections
    .map((s) => {
      const containerClass = s.containerClass?.trim();
      return { title: s.title.trim(), fields: s.fields.filter((n) => validNames.has(n)), ...(containerClass ? { containerClass } : {}) };
    })
    .filter((s) => s.title !== '' && s.fields.length > 0)
  // List columns may also reference system columns - only field names are
  // validated against the class itself. Custom titles survive; blank ones
  // are dropped.
  const validListColumns = listColumns.value
    .map((c) => (c.title?.trim() ? { name: c.name, title: c.title.trim() } : { name: c.name }))
    .filter((c) => validNames.has(c.name) || systemColumnTitles.has(c.name))
  if (detailSections.length === 0 && validListColumns.length === 0) return null
  return {
    ...(detailSections.length > 0 ? { detailSections } : {}),
    ...(validListColumns.length > 0 ? { listColumns: validListColumns } : {}),
  }
}

function refreshTabLabel() {
  if (label.value) tabsStore.setTabLabel(classTabId(props.classId), label.value)
}

async function handleSave() {
  isSaving.value = true
  try {
    const viewConfigPayload = buildViewConfigPayload()
    if (isNew.value) {
      const created = await dataClassesStore.createDataClass({
        name: name.value.trim(),
        label: label.value.trim(),
        fields: fields.value,
        viewConfig: viewConfigPayload,
      })
      editingId.value = created.id
    } else {
      await dataClassesStore.updateDataClass(editingId.value as string, {
        label: label.value.trim(),
        fields: fields.value,
        viewConfig: viewConfigPayload,
      })
    }
    refreshTabLabel()
    toastStore.show('Class saved')
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to save class')
  } finally {
    isSaving.value = false
  }
}
</script>
