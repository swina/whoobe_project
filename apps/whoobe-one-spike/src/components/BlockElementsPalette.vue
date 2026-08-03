<template>
  <div class="w-64 shrink-0 overflow-y-auto">
    <div v-if="!editor.elements" class="p-3 text-xs text-gray-400">No elements loaded</div>
    <template v-for="group in editor.elements" :key="group.label">
      <button
        type="button"
        class="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold capitalize text-gray-600 hover:bg-gray-50 border-b"
        @click="openGroup = openGroup === group.label ? null : group.label"
      >
        {{ group.label }}
        <span class="text-gray-400">{{ openGroup === group.label ? '−' : '+' }}</span>
      </button>
      <div v-if="openGroup === group.label" class="grid grid-cols-3 gap-1.5 p-2 border-b bg-gray-50 dragula-source-container">
        <div
          v-for="item in group.elements"
          :key="item.name"
          data-type="template"
          :data-template="item.name"
          :title="item.name"
          class="flex flex-col items-center justify-center gap-1 h-14 rounded-md bg-white border text-[10px] text-gray-500 text-center px-1 cursor-grab select-none hover:border-indigo-400 hover:text-indigo-600"
        >
          <span class="text-lg leading-none">▦</span>
          <span class="truncate w-full">{{ item.name }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
// Port of whoobe-one-studio's src/components/blocks/BlockElements.vue - the
// "add element" sidebar, sourced from editor.elements (populated via
// Element.Groups() in App.vue since Phase 1, unconsumed until now).
// Replaces BlockEditor.vue's earlier flat, hardcoded 6-item palette row
// with the real category structure (containers/text/media/form) the
// source itself defines in ElementsClass.js's Groups() method.
//
// Still drag-only, not click-to-add (see BlockEditor.vue's own comment on
// why click-to-add-to-selected was replaced) - every element chip carries
// the same data-type="template"/data-template attributes the existing
// palette row used, so BlockEditor.vue's single shared dragula instance
// and drop handler need no changes at all to pick these up.
//
// "dragula-source-container" has to go on the *grid* div directly wrapping
// the chips, not the outer sidebar - dragula requires a draggable item to
// be a direct child of a recognized container (it walks up from the click
// target to find a container ancestor, then treats whatever direct child
// of that container sits on the way as "the item"). With the class on the
// outer sidebar instead, that "item" would have been the whole per-group
// grid wrapper div, not an individual chip - it has no data-type attribute,
// so `moves()` correctly rejected it and nothing was draggable at all. A
// real regression introduced when this replaced the old flat palette row
// (where each chip *was* a direct child of the marked container).
//
// One group is collapsed/expanded at a time (`openGroup`), matching the
// source's own accordion behavior (`gr===group.label?gr=null:gr=group.
// label` in the original).
import { ref } from 'vue'
import { useEditorStore } from '../store/editor'

const editor = useEditorStore()
const openGroup = ref<string | null>('containers')
</script>
