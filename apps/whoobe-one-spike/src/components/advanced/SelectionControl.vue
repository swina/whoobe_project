<template>
  <div class="flex flex-col gap-2 text-xs">
    <p v-if="!isList" class="text-[10px] text-gray-500">
      Linked bindings need a container bound to a list (a Data Class query or an Integrations list). Select that container.
    </p>
    <template v-else>
      <div class="flex flex-col gap-1 border rounded bg-white p-1.5">
        <label class="flex items-center gap-1.5 font-semibold text-gray-700">
          <input type="checkbox" :checked="!!sel.publish" @change="togglePublish(($event.target as HTMLInputElement).checked)" />
          When an item is clicked, select it
        </label>
        <template v-if="sel.publish">
          <label class="flex flex-col gap-0.5">
            <span class="text-gray-500">Selection name <span class="text-gray-400">(also the URL parameter)</span></span>
            <input type="text" maxlength="32" list="whoobe-selection-names" class="w-full text-xs border rounded px-1.5 py-1 font-mono" :class="{ 'border-rose-400': !nameOk(sel.publish.name) }" :value="sel.publish.name" @change="setPart('publish', 'name', ($event.target as HTMLInputElement).value)" />
          </label>
          <label class="flex flex-col gap-0.5">
            <span class="text-gray-500">Value to pass (a field of the item)</span>
            <input type="text" list="whoobe-selection-fields" class="w-full text-xs border rounded px-1.5 py-1 font-mono" :value="sel.publish.field" @change="setPart('publish', 'field', ($event.target as HTMLInputElement).value)" />
          </label>
        </template>
      </div>

      <div class="flex flex-col gap-1 border rounded bg-white p-1.5">
        <label class="flex items-center gap-1.5 font-semibold text-gray-700">
          <input type="checkbox" :checked="!!sel.listen" @change="toggleListen(($event.target as HTMLInputElement).checked)" />
          Show only the items that match a selection
        </label>
        <template v-if="sel.listen">
          <label class="flex flex-col gap-0.5">
            <span class="text-gray-500">Selection name</span>
            <input type="text" maxlength="32" list="whoobe-selection-names" class="w-full text-xs border rounded px-1.5 py-1 font-mono" :class="{ 'border-rose-400': !nameOk(sel.listen.name) }" :value="sel.listen.name" @change="setPart('listen', 'name', ($event.target as HTMLInputElement).value)" />
          </label>
          <label class="flex flex-col gap-0.5">
            <span class="text-gray-500">Field that must equal the selection (a field of the item)</span>
            <input type="text" list="whoobe-selection-fields" class="w-full text-xs border rounded px-1.5 py-1 font-mono" :value="sel.listen.field" @change="setPart('listen', 'field', ($event.target as HTMLInputElement).value)" />
          </label>
          <label class="flex flex-col gap-0.5">
            <span class="text-gray-500">While nothing is selected</span>
            <select class="w-full text-xs border rounded px-1.5 py-1" :value="sel.listen.whenEmpty ?? 'none'" @change="setPart('listen', 'whenEmpty', ($event.target as HTMLSelectElement).value)">
              <option value="none">show no item</option>
              <option value="all">show every item</option>
            </select>
          </label>
        </template>
      </div>

      <datalist id="whoobe-selection-names"><option v-for="n in knownNames" :key="n" :value="n" /></datalist>
      <datalist id="whoobe-selection-fields"><option v-for="f in fieldNames" :key="f" :value="f" /></datalist>

      <p v-if="invalid" class="text-[10px] text-rose-600">A name starts with a letter and has letters, digits, "-" or "_" (up to 32 characters).</p>
      <p v-else-if="incomplete" class="text-[10px] text-amber-700">Not active yet: it needs a name and a field.</p>
      <p class="text-[10px] text-gray-400">
        The other list publishes the same name and this one listens to it (or the other way round). The choice is kept in the URL
        (<code>?{{ sel.publish?.name || sel.listen?.name || 'name' }}=...</code>), clicking the chosen item again clears it, and the chosen item gets
        <code>data-whoobe-selected="true"</code> to style it (<code>data-[whoobe-selected=true]:ring-2</code>). It works in Preview and on the published
        site; the edit canvas shows every item. A list that listens should keep its limit at 100 or less.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
// "Linked bindings" (docs/plans/cms/linked-bindings.md): `selection` on a container bound to a list. One list publishes a named
// selection when its items are clicked, another list shows only the items whose field equals it. Edits editor.current.selection
// directly, like AnimationControl.vue does with gsap.
import { computed, reactive, ref, watch } from 'vue'
import { isSelectionName, type ElementSelection } from '@whoobe-cms/schema'
import { useEditorStore } from '../../store/editor'
import { getDataClassByName } from '../../data-objects-api'

const editor = useEditorStore()
const invalid = ref(false)
const nameOk = (n: string) => isSelectionName(n)

const current = computed(() => editor.current as any)
const isList = computed(() => {
  const c = current.value
  return Boolean(c && c.type === 'container' && ((c.dataBinding && (!c.dataBinding.field || c.dataBinding.target === 'list')) || c.gatewayBinding))
})
// What the author is typing. Only a complete part (valid name and a field) is written to the element, so a page never carries a half-filled
// selection; toggling a part off removes it.
type Part = { name: string; field: string; whenEmpty?: 'none' | 'all' }
const sel = reactive<{ publish: Part | null; listen: Part | null }>({ publish: null, listen: null })
function load(): void {
  const s = (current.value?.selection ?? {}) as ElementSelection
  sel.publish = s.publish ? { ...s.publish } : null
  sel.listen = s.listen ? { ...s.listen, whenEmpty: s.listen.whenEmpty ?? 'none' } : null
}
watch(() => current.value?.id, load, { immediate: true })
const complete = (p: Part | null): boolean => !!p && isSelectionName(p.name) && p.field.trim() !== ''
const incomplete = computed(() => (!!sel.publish && !complete(sel.publish)) || (!!sel.listen && !complete(sel.listen)))
function commit(): void {
  const c = current.value
  if (!c) return
  const next: ElementSelection = {}
  if (complete(sel.publish)) next.publish = { name: sel.publish!.name, field: sel.publish!.field.trim() }
  if (complete(sel.listen)) next.listen = { name: sel.listen!.name, field: sel.listen!.field.trim(), whenEmpty: sel.listen!.whenEmpty ?? 'none' }
  if (next.publish || next.listen) c.selection = next
  else delete c.selection
}

// names already used on this page, to join the two lists with the same word
const knownNames = computed(() => {
  const names = new Set<string>()
  const visit = (n: any, depth: number) => {
    if (!n || typeof n !== 'object' || depth > 100) return
    for (const part of [n.selection?.publish, n.selection?.listen]) if (part?.name) names.add(part.name)
    for (const b of Array.isArray(n.blocks) ? n.blocks : []) visit(b, depth + 1)
  }
  visit(editor.document, 0)
  return [...names]
})

// field suggestions: the attributes of the bound Data Class; for an Integrations list the author types the path inside one item
const fieldNames = ref<string[]>([])
watch(
  () => (current.value?.dataBinding?.target === 'list' ? '' : current.value?.dataBinding?.className),
  async (className) => {
    fieldNames.value = []
    if (!className) return
    try {
      const cls = await getDataClassByName(className)
      fieldNames.value = ['id', 'key', ...(cls?.fields ?? []).map((f) => f.name)]
    } catch { /* the field can still be typed */ }
  },
  { immediate: true },
)

function togglePublish(on: boolean): void {
  sel.publish = on ? { name: knownNames.value[0] ?? '', field: fieldNames.value.includes('id') ? 'id' : '' } : null
  commit()
}
function toggleListen(on: boolean): void {
  sel.listen = on ? { name: knownNames.value[0] ?? '', field: '', whenEmpty: 'none' } : null
  commit()
}
function setPart(part: 'publish' | 'listen', key: 'name' | 'field' | 'whenEmpty', value: string): void {
  const p = sel[part]
  if (!p) return
  const text = value.trim()
  invalid.value = key === 'name' && text !== '' && !isSelectionName(text)
  ;(p as any)[key] = text
  commit()
}
</script>
