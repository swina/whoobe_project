<template>
  <div class="flex flex-col gap-2 font-mono text-xs">
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
