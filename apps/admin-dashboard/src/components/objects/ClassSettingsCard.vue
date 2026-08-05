<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-4">
    <div>
      <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">Data Object Classes</h3>
      <p class="text-xs text-slate-500 mt-1">
        Define classes and their fields from scratch - no Pimcore migration required. docs/plans/datamodel/native-class-authoring-plan.md §3.1.
      </p>
    </div>

    <!-- Class list -->
    <div v-if="!editorOpen" class="space-y-2">
      <div v-if="dataClassesStore.isLoading" class="text-xs text-slate-500">Loading…</div>
      <div v-else-if="dataClassesStore.classes.length === 0" class="text-xs text-slate-500">No classes yet.</div>
      <div
        v-for="dataClass in dataClassesStore.classes"
        :key="dataClass.id"
        class="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-white/40"
      >
        <div>
          <div class="text-sm text-slate-200 light:text-slate-800">{{ dataClass.label }}</div>
          <div class="text-xs text-slate-500">{{ dataClass.name }} · {{ dataClass.fields.length }} field(s)</div>
        </div>
        <div class="flex items-center gap-3">
          <button @click="openEditor(dataClass)" type="button" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300">Edit</button>
          <button @click="handleDelete(dataClass)" type="button" class="text-xs font-semibold text-rose-400 hover:text-rose-300">Delete</button>
        </div>
      </div>

      <button @click="openEditor(null)" type="button" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300 pt-1">+ New class</button>
    </div>

    <!-- Class editor -->
    <div v-else class="space-y-4">
      <div class="grid grid-cols-2 gap-2">
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
      <div class="flex items-center gap-1 border-b border-slate-800 light:border-slate-200">
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

      <!-- Fields -->
      <div v-if="editorTab === 'fields'" class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-400 light:text-slate-600">Fields</span>
          <button @click="addField" type="button" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300">+ Add field</button>
        </div>

        <div v-for="(field, index) in fields" :key="index" class="rounded-lg border border-slate-800 light:border-slate-200 p-3 space-y-2">
          <div class="grid grid-cols-4 gap-2">
            <input
              v-model="field.name"
              type="text"
              placeholder="name (attribute key)"
              class="px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
            />
            <input
              v-model="field.title"
              type="text"
              placeholder="Title (display label)"
              class="px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
            />
            <select
              v-model="field.fieldType"
              class="px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
            >
              <option v-for="ft in FIELD_TYPES" :key="ft.value" :value="ft.value">{{ ft.label }}</option>
            </select>
            <div class="flex items-center gap-3 px-1">
              <label class="flex items-center gap-1.5 text-xs text-slate-400 light:text-slate-600">
                <input
                  type="checkbox"
                  :checked="field.mandatory === true"
                  @change="field.mandatory = ($event.target as HTMLInputElement).checked"
                  class="w-3.5 h-3.5 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600"
                />
                required
              </label>
              <label class="flex items-center gap-1.5 text-xs text-slate-400 light:text-slate-600">
                <input
                  type="checkbox"
                  :checked="field.localized === true"
                  @change="field.localized = ($event.target as HTMLInputElement).checked"
                  class="w-3.5 h-3.5 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600"
                />
                localized
              </label>
            </div>
          </div>

          <input
            v-if="field.fieldType === 'select' || field.fieldType === 'multiselect'"
            :value="(field.options ?? []).join(', ')"
            @input="field.options = splitList(($event.target as HTMLInputElement).value)"
            type="text"
            placeholder="options (comma-separated)"
            class="w-full px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
          />

          <select
            v-if="field.fieldType === 'manyToOneRelation' || field.fieldType === 'manyToManyRelation'"
            v-model="field.relationTarget"
            class="w-full px-2 py-1.5 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
          >
            <option value="">Relates to…</option>
            <option v-for="dataClass in dataClassesStore.classes" :key="dataClass.id" :value="dataClass.name">{{ dataClass.label }}</option>
          </select>

          <input
            v-model="field.className"
            type="text"
            placeholder="Custom classes for this field's control (e.g. col-span-2, bg-slate-50, p-3) - optional"
            class="w-full px-2 py-1.5 text-[11px] font-mono bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500"
          />

          <div class="flex items-center justify-between pt-1">
            <div class="flex items-center gap-2">
              <button @click="moveField(index, -1)" type="button" :disabled="index === 0" class="text-xs text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 disabled:opacity-30">↑</button>
              <button @click="moveField(index, 1)" type="button" :disabled="index === fields.length - 1" class="text-xs text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 disabled:opacity-30">↓</button>
            </div>
            <button @click="removeField(index)" type="button" class="text-xs text-rose-400 hover:text-rose-300">Remove field</button>
          </div>
        </div>
      </div>

      <!-- View Layout: sections/fields as a tree - docs/plans/UI/editing-
           object-class.md. Optional; an empty tree keeps this class on
           the generic flat detail form exactly as before. Reassigning a
           field moves it between tree nodes (no drag-and-drop, matching
           this codebase's own recurring precedent for admin editors). -->
      <div v-if="editorTab === 'viewLayout'" class="space-y-3">
        <div class="flex items-center justify-between">
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
              <div v-for="field in ungroupedFields" :key="field.name" class="flex items-center justify-between gap-2 text-xs text-slate-400 light:text-slate-600 py-0.5">
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
                class="flex items-center justify-between gap-2 text-xs text-slate-400 light:text-slate-600 py-0.5"
              >
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
              <p v-if="sectionFields(sectionIndex).length === 0" class="text-slate-600 light:text-slate-400 italic">No fields yet - move some in from Ungrouped.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between pt-2">
        <button @click="closeEditor" type="button" class="text-xs font-semibold text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800">Cancel</button>
        <button
          @click="handleSave"
          :disabled="isSaving || !name.trim() || !label.trim()"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
        >
          {{ isSaving ? 'Saving…' : 'Save Class' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Class Builder - docs/plans/datamodel/native-class-authoring-plan.md
// §3.1/Phase 1. A plain form editor (add/remove/reorder fields via ↑↓),
// matching WorkflowSettingsCard.vue's/the Field-Collection editor's own
// "not required for v1, no drag-and-drop" precedent rather than building
// a new interaction pattern for this one card.
import { ref, reactive, computed } from 'vue'
import { ChevronDown, ChevronRight } from '@lucide/vue'
import type { ClassFieldDefinition, ClassViewConfig } from '@pimcore-custom/core'
import { useDataClassesStore } from '../../stores/dataClassesStore'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { fetchDataObjects } from '../../utils/data-objects-api'
import type { DataClass } from '../../utils/data-classes-api'

// v1 field-type list (native-class-authoring-plan.md §3.1) - `block` and
// `fieldcollections`/collection-type authoring are deliberately excluded
// (§5's open question), though classes carrying them from migration still
// render fine via the existing dynamic form; this editor just doesn't
// offer creating them fresh yet.
const FIELD_TYPES = [
  { value: 'input', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'wysiwyg', label: 'Rich text' },
  { value: 'numeric', label: 'Number' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'date', label: 'Date' },
  { value: 'email', label: 'Email' },
  { value: 'country', label: 'Country' },
  { value: 'select', label: 'Select (single)' },
  { value: 'multiselect', label: 'Select (multiple)' },
  { value: 'manyToOneRelation', label: 'Relation (single)' },
  { value: 'manyToManyRelation', label: 'Relation (multiple)' },
  { value: 'link', label: 'Link' },
]

const dataClassesStore = useDataClassesStore()
const authStore = useAuthStore()
const toastStore = useToastStore()

const editorOpen = ref(false)
const isNew = ref(true)
const isSaving = ref(false)
const editingId = ref<string | null>(null)
const objectCount = ref(0)

const editorTabs: { key: 'fields' | 'viewLayout'; label: string }[] = [
  { key: 'fields', label: 'Fields' },
  { key: 'viewLayout', label: 'View Layout' },
]
const editorTab = ref<'fields' | 'viewLayout'>('fields')

const name = ref('')
const label = ref('')
const fields = ref<ClassFieldDefinition[]>([])
const viewConfig = ref<{ detailSections: { title: string; fields: string[]; containerClass?: string }[] }>({
  detailSections: [],
})

// Fields with a real `name` typed in yet - the View Layout tree keys
// everything off `name`, so a blank in-progress field row (just added,
// not filled in) would otherwise show as an unusable empty tree node.
const namedFields = computed(() => fields.value.filter((f) => f.name.trim() !== ''))

function splitList(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean)
}

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
  if (detailSections.length === 0) return null
  return { detailSections }
}

function openEditor(dataClass: DataClass | null) {
  isNew.value = !dataClass
  editingId.value = dataClass?.id ?? null
  name.value = dataClass?.name ?? ''
  label.value = dataClass?.label ?? ''
  fields.value = dataClass ? dataClass.fields.map((f) => ({ ...f })) : []
  viewConfig.value = {
    detailSections: (dataClass?.viewConfig?.detailSections ?? []).map((s) => ({ title: s.title, fields: [...s.fields], containerClass: s.containerClass ?? '' })),
  }
  editorTab.value = 'fields'
  for (const key of Object.keys(expandedKeys)) delete expandedKeys[key]
  expandedKeys.__ungrouped__ = true
  objectCount.value = 0
  editorOpen.value = true
  if (dataClass) {
    fetchDataObjects(authStore.config.coreApiUrl, dataClass.id)
      .then((objects) => (objectCount.value = objects.length))
      .catch(() => {})
  }
}

function closeEditor() {
  editorOpen.value = false
}

function addField() {
  fields.value.push({ name: '', title: '', fieldType: 'input' })
}

function removeField(index: number) {
  fields.value.splice(index, 1)
}

function moveField(index: number, direction: 1 | -1) {
  const target = index + direction
  if (target < 0 || target >= fields.value.length) return
  const [moved] = fields.value.splice(index, 1)
  fields.value.splice(target, 0, moved)
}

async function handleSave() {
  isSaving.value = true
  try {
    const viewConfigPayload = buildViewConfigPayload()
    if (isNew.value) {
      await dataClassesStore.createDataClass({
        name: name.value.trim(),
        label: label.value.trim(),
        fields: fields.value,
        viewConfig: viewConfigPayload,
      })
    } else {
      await dataClassesStore.updateDataClass(editingId.value as string, {
        label: label.value.trim(),
        fields: fields.value,
        viewConfig: viewConfigPayload,
      })
    }
    toastStore.show('Class saved')
    editorOpen.value = false
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to save class')
  } finally {
    isSaving.value = false
  }
}

async function handleDelete(dataClass: DataClass) {
  if (!confirm(`Delete class "${dataClass.label}"? This only succeeds if it has no objects.`)) return
  try {
    await dataClassesStore.deleteDataClass(dataClass.id)
    toastStore.show('Class deleted')
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to delete class')
  }
}
</script>
