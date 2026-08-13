<template>
  <div class="flex flex-col gap-2">
    <div v-if="rows.length" class="flex flex-col gap-1">
      <div v-for="row in rows" :key="row.name" class="flex items-center gap-1">
        <span class="flex-1 truncate font-mono bg-white border rounded px-1.5 py-0.5" :title="`${row.name}=&quot;${row.value}&quot;`">
          {{ row.name }}="{{ row.value }}"
        </span>
        <button type="button" class="text-gray-400 hover:text-rose-500 shrink-0" title="Remove" @click="removeAttribute(row.name)">
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>
    <div class="flex flex-col gap-1">
      <input v-model="newName" type="text" placeholder="attribute name" class="w-full text-xs border rounded px-1.5 py-1" @keydown.enter="addAttribute" />
      <textarea v-model="newValue" type="text" placeholder="value" class="w-full text-xs border rounded px-1.5 py-1"/>
      <button type="button" class="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 self-start" @click="addAttribute">+ Add attribute</button>
    </div>
    <p class="text-[10px] text-gray-400">
      Custom HTML attributes, added directly to this element's tag.
      <code>id</code>/<code>class</code>/<code>style</code> are reserved and ignored here.
    </p>
  </div>
</template>

<script setup lang="ts">
// Not a direct port - the reference's BlockAttributes.vue reads/writes the
// same `element.data.attributes` bag (there also used, separately, as a
// fixed schema for Form/Input builders - see ElementsClass.js's Form()/
// inputElement()/InputTextarea()), generalized here to any element rather
// than just form fields. `data.attributes` was already declared as a
// concept in this app but never actually rendered anywhere - see the
// v-bind="customAttrs(...)" wiring added to BlockElement.vue/
// BlockContainer.vue and their preview/*Preview.vue counterparts.
import { computed, ref } from 'vue'
import { X } from '@lucide/vue'
import { useEditorStore } from '../../store/editor'
import { RESERVED_ATTRS } from '../../helpers'

const editor = useEditorStore()
const newName = ref('')
const newValue = ref('')

const rows = computed(() => {
  const attrs = (editor.current as any)?.data?.attributes as Record<string, string> | undefined
  if (!attrs) return []
  return Object.keys(attrs).map((name) => ({ name, value: attrs[name] }))
})

function addAttribute() {
  if (!editor.current) return
  const name = newName.value.trim()
  if (!name || RESERVED_ATTRS.includes(name)) return
  const data = (editor.current as any).data
  if (!data.attributes) data.attributes = {}
  data.attributes[name] = newValue.value
  newName.value = ''
  newValue.value = ''
}

function removeAttribute(name: string) {
  const attrs = (editor.current as any)?.data?.attributes
  if (!attrs) return
  delete attrs[name]
}
</script>
