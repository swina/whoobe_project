<template>
  <div class="flex flex-col gap-2">
    <button
      type="button"
      class="text-xs border rounded px-2 py-1.5 w-full bg-white flex items-center justify-between hover:border-indigo-400"
      @click="openModal"
    >
      <span class="truncate">{{ summaryLabel }}</span>
      <span class="text-indigo-600 font-semibold shrink-0 ml-2">Edit</span>
    </button>

    <Teleport to="body">
      <div v-if="showModal" class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center" @click.self="cancel">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
          <div class="flex items-center justify-between px-3 py-2 border-b shrink-0">
            <span class="text-xs font-semibold text-gray-600">Format bound value</span>
            <button type="button" class="text-gray-400 hover:text-gray-700" @click="cancel"><X class="w-4 h-4" /></button>
          </div>

          <div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            <select
              :value="draftType"
              @change="onTypeChange(($event.target as HTMLSelectElement).value as TransformType | 'none')"
              class="text-xs border rounded px-2 py-1 w-full bg-white"
            >
              <option value="none">No transform (show raw value)</option>
              <option v-for="t in availableTransformers" :key="t.type" :value="t.type">{{ t.label }}</option>
            </select>

            <div v-if="draftType === 'date'" class="flex items-center gap-2 flex-wrap">
              <select v-model="draftOptions.dateStyle" class="text-xs border rounded px-1.5 py-1">
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="long">Long</option>
                <option value="full">Full</option>
              </select>
              <label class="flex items-center gap-1 text-xs text-gray-600">
                <input type="checkbox" v-model="draftOptions.includeTime" /> Include time
              </label>
            </div>

            <div v-else-if="draftType === 'url'" class="flex flex-col gap-1.5">
              <select v-model="draftOptions.linkText" class="text-xs border rounded px-1.5 py-1">
                <option value="value">Use field value as link text</option>
                <option value="custom">Custom link text</option>
              </select>
              <input
                v-if="draftOptions.linkText === 'custom'"
                v-model="draftOptions.customText"
                type="text"
                placeholder="Link text"
                class="text-xs border rounded px-1.5 py-1"
              />
              <label class="flex items-center gap-1 text-xs text-gray-600">
                <input type="checkbox" v-model="draftOptions.openInNewTab" /> Open in new tab
              </label>
            </div>

            <div v-else-if="draftType === 'number'" class="flex items-center gap-2 flex-wrap">
              <select v-model="draftOptions.style" class="text-xs border rounded px-1.5 py-1">
                <option value="decimal">Decimal</option>
                <option value="currency">Currency</option>
                <option value="percent">Percent</option>
              </select>
              <input
                v-if="draftOptions.style === 'currency'"
                v-model="draftOptions.currency"
                type="text"
                placeholder="USD"
                maxlength="3"
                class="text-xs border rounded px-1.5 py-1 w-16"
              />
              <label class="flex items-center gap-1 text-xs text-gray-600">
                <input type="checkbox" v-model="draftOptions.useGrouping" /> Thousands separator
              </label>
            </div>

            <div v-else-if="draftType === 'truncate'" class="flex items-center gap-2">
              <input v-model.number="draftOptions.maxLength" type="number" min="1" class="text-xs border rounded px-1.5 py-1 w-20" />
              <span class="text-[10px] text-gray-400">chars</span>
              <input v-model="draftOptions.ellipsis" type="text" class="text-xs border rounded px-1.5 py-1 w-14" />
            </div>

            <div v-else-if="draftType === 'valueMap'" class="flex flex-col gap-1.5">
              <div v-for="(rule, i) in draftOptions.rules" :key="i" class="flex items-center gap-1">
                <select v-model="rule.operator" class="text-xs border rounded px-1 py-1 shrink-0" title="Condition">
                  <option value="=">=</option>
                  <option value="<">&lt;</option>
                  <option value=">">&gt;</option>
                </select>
                <input v-model="rule.match" type="text" placeholder="value" class="text-xs border rounded px-1.5 py-1 w-24" />
                <span class="text-[10px] text-gray-400">→</span>
                <input v-model="rule.label" type="text" placeholder="label" class="text-xs border rounded px-1.5 py-1 w-24" />
                <input v-model="rule.className" type="text" placeholder="css class" class="text-xs border rounded px-1.5 py-1 flex-1" />
                <button type="button" class="text-gray-400 hover:text-rose-500 shrink-0" @click="draftOptions.rules.splice(i, 1)">
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
              <button type="button" class="flex items-center gap-1 text-xs text-indigo-600 self-start" @click="addValueMapRule">
                <Plus class="w-3.5 h-3.5" /> Add rule
              </button>
              <div class="flex items-center gap-1 pt-1 border-t">
                <span class="text-[10px] text-gray-400 shrink-0">Else</span>
                <input v-model="draftOptions.fallbackLabel" type="text" placeholder="label (default: raw value)" class="text-xs border rounded px-1.5 py-1 w-28" />
                <input v-model="draftOptions.fallbackClassName" type="text" placeholder="css class" class="text-xs border rounded px-1.5 py-1 flex-1" />
              </div>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2 px-3 py-2 border-t shrink-0">
            <button type="button" class="text-xs px-3 py-1.5 rounded border text-gray-600 hover:bg-gray-100" @click="cancel">Cancel</button>
            <button type="button" class="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-500" @click="apply">Apply</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
// Sidebar control for TailwindCustomizer.vue's "data binding" group. Unlike
// SemanticControl.vue/CustomClassesControl.vue's live read/write-through-
// the-store pattern, this edits a local draft (draftType/draftOptions) in a
// modal and only writes back to editor.current.dataBinding.transform on
// "Apply" - each keystroke in a valueMap rule used to mutate the live
// reactive binding directly (v-model straight into dataBinding.value.
// transform.options), applying to the canvas on every keystroke; requested
// as a modal + explicit Apply step instead, same "stage changes, confirm
// once" shape as DataObjectPicker.vue's own confirm()/close.
import { computed, ref } from 'vue'
import { Plus, Trash2, X } from '@lucide/vue'
import { useEditorStore } from '../../store/editor'
import { TRANSFORMERS, transformersForFieldType, type TransformType } from '../../scripts/field-transforms'
import { useEffectiveFieldType } from '../../scripts/resolve-binding-field-type'

// attr/title aren't used directly (same reasoning as CustomClassesControl.
// vue's own identical props) - declared only so TailwindCustomizer.vue's
// uniform :attr/:title bindings don't fall through as stray attributes.
defineProps<{ attr?: string; title?: string }>()

const editor = useEditorStore()

const dataBinding = computed(() => (editor.current as any)?.dataBinding ?? null)
const gatewayBinding = computed(() => (editor.current as any)?.gatewayBinding ?? null)
// Whichever kind of binding is active on the selected element - mutually
// exclusive per element in practice (a node has either dataBinding or
// gatewayBinding, never both), Data Object binding checked first as the
// more established/common case.
const activeBinding = computed(() => dataBinding.value ?? gatewayBinding.value)

// Falls back to a Data Class lookup for bindings saved before fieldType was
// denormalized onto them - see resolve-binding-field-type.ts's own header.
// Gateway bindings have no equivalent Data-Class-quality field type
// metadata (only the gateway's own loosely-inferred JSON response type, not
// surfaced here), so every transformer is offered for them rather than
// type-gating like Data Object bindings do.
const effectiveFieldType = useEffectiveFieldType(dataBinding)
const availableTransformers = computed(() =>
  gatewayBinding.value ? Object.values(TRANSFORMERS) : transformersForFieldType(effectiveFieldType.value)
)
const transformType = computed<TransformType | 'none'>(() => activeBinding.value?.transform?.type ?? 'none')

const summaryLabel = computed(() => {
  const t = transformType.value
  if (t === 'none') return 'No transform (show raw value)'
  return (TRANSFORMERS as any)[t]?.label ?? t
})

const showModal = ref(false)
const draftType = ref<TransformType | 'none'>('none')
const draftOptions = ref<Record<string, any>>({})

function cloneOptions(o: unknown): Record<string, any> {
  return o ? JSON.parse(JSON.stringify(o)) : {}
}

function openModal() {
  draftType.value = transformType.value
  draftOptions.value =
    activeBinding.value?.transform && activeBinding.value.transform.type !== 'none'
      ? cloneOptions((activeBinding.value.transform as any).options)
      : {}
  // A rule saved before the operator field existed has no `operator` at
  // all - default it to '=' explicitly here so the select shows the right
  // option immediately, rather than relying on every rule getting re-saved
  // before it displays correctly (applyTransform already treats a missing
  // operator as '=', this is purely about the edit UI reflecting that).
  if (draftType.value === 'valueMap' && Array.isArray(draftOptions.value.rules)) {
    for (const rule of draftOptions.value.rules) {
      if (!rule.operator) rule.operator = '='
    }
  }
  showModal.value = true
}

function cancel() {
  showModal.value = false
}

function apply() {
  if (!activeBinding.value) return
  activeBinding.value.transform =
    draftType.value === 'none' ? { type: 'none' } : { type: draftType.value, options: draftOptions.value }
  showModal.value = false
}

// Switching the transform type resets to that type's own default options -
// same behavior as the previous live-editing version, just against the
// draft instead of the real binding.
function onTypeChange(newType: TransformType | 'none') {
  draftType.value = newType
  draftOptions.value = newType === 'none' ? {} : cloneOptions((TRANSFORMERS as any)[newType].defaultOptions)
}

function addValueMapRule() {
  if (!draftOptions.value.rules) draftOptions.value.rules = []
  draftOptions.value.rules.push({ match: '', label: '', className: '', operator: '=' })
}
</script>
