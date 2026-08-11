<template>
  <div class="shrink-0 overflow-y-auto">
    <div v-if="!editor.elements && !snippetsStore.items.length" class="p-3 text-xs text-gray-400">No elements loaded</div>
    <template v-for="label in groupLabels" :key="label">
      <button
        type="button"
        class="w-full flex items-center justify-between px-3 py-1.5 text-sm font-semibold capitalize text-gray-600 hover:bg-violet-500 hover:text-white border-b" :class="{ 'bg-violet-500 text-white': openGroup === label }"
        @click="openGroup = openGroup === label ? null : label"
      >
        {{ label }}
        <ChevronDown v-if="openGroup === label" class="w-3.5 h-3.5 text-gray-400" />
        <ChevronRight v-else class="w-3.5 h-3.5 text-gray-400" />
      </button>
      <div v-if="openGroup === label" class="grid grid-cols-3 gap-1.5 p-2 border-b bg-gray-50 dragula-source-container">
        <div
          v-for="item in builtInElementsFor(label)"
          :key="'el-' + item.name"
          data-type="template"
          :data-template="item.name"
          :title="item.name"
          class="flex flex-col items-center justify-center gap-1 h-14 rounded-md bg-white border text-[10px] text-gray-500 text-center px-1 cursor-grab select-none hover:border-indigo-400 hover:text-indigo-600"
        >
          <component :is="elementIcon(item.name)" class="w-5 h-5" />
          <span class="truncate w-full">{{ item.name }}</span>
        </div>
        <div
          v-for="snippet in snippetsFor(label)"
          :key="'sn-' + snippet.id"
          data-type="template"
          :data-snippet-id="snippet.id"
          :title="snippet.name"
          class="relative group/chip flex flex-col items-center justify-center gap-1 h-14 rounded-md bg-white border border-emerald-200 text-[10px] text-gray-500 text-center px-1 cursor-grab select-none hover:border-emerald-400 hover:text-emerald-700"
        >
          <span v-if="snippet.icon" class="text-lg leading-none">{{ snippet.icon }}</span>
          <Package v-else class="w-5 h-5" />
          <span class="truncate w-full">{{ snippet.name }}</span>
          <button
            type="button"
            title="Delete snippet"
            class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover/chip:opacity-100"
            @mousedown.stop
            @click.stop="removeSnippet(snippet.id)"
          >
            <X class="w-2.5 h-2.5" />
          </button>
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
//
// Not a port - saved snippets (SaveSnippetModal.vue) merge into these same
// accordion sections by category, rather than getting a separate "Snippets"
// area: a snippet saved under "containers" shows up as more chips in the
// existing Containers group, right alongside Grid/Flexbox. `groupLabels`
// is the union of the built-in group labels and whatever categories exist
// among saved snippets (so a snippet under a brand-new category name gets
// its own accordion section), in that order. Snippet chips carry
// `data-snippet-id` instead of `data-template` - BlockEditor.vue's drop
// handler checks for that attribute first and, if present, instantiates a
// fresh clone of the snippet's stored node instead of calling
// createElement(templateName).
import { computed, onMounted, ref } from 'vue'
import type { Component } from 'vue'
import {
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ClipboardList,
  Code,
  Download,
  GalleryHorizontal,
  Hash,
  Heading,
  Image,
  LayoutGrid,
  Mail,
  MousePointerClick,
  Package,
  Pilcrow,
  Quote,
  Shapes,
  SquareCheck,
  StretchHorizontal,
  TextAlignStart,
  TextCursorInput,
  Type,
  Video,
  X,
} from '@lucide/vue'
import { useEditorStore } from '../store/editor'
import { useSnippetsStore } from '../store/snippets'

// Real per-element-type icons, keyed by the exact `name` strings
// ElementsClass.js's own Groups() uses (its own `icon` field per entry -
// e.g. 'grid_on', 'title', 'smart_button' - is a Material Icons ligature
// name, never actually rendered anywhere in this app: no Material Icons
// font is loaded, and nothing reads that field at all - the palette
// chip's icon has always been a single generic `▦` glyph shared by every
// element type regardless of what it actually was). Real @lucide/vue icons
// per type. Falls back to `Shapes` for any element name this table
// doesn't recognize (defensive - keeps a brand-new Groups() entry from
// rendering nothing at all rather than a build-time requirement to update
// this table in lockstep).
const ELEMENT_ICONS: Record<string, Component> = {
  Grid: LayoutGrid,
  Flexbox: StretchHorizontal,
  Heading: Heading,
  Paragraph: Pilcrow,
  'Inline Text': Type,
  Span: Type,
  Blockquote: Quote,
  Code: Code,
  Image: Image,
  Slider: GalleryHorizontal,
  Video: Video,
  Youtube: Video,
  Vimeo: Video,
  MIcon: Shapes,
  Iconify: Shapes,
  Download: Download,
  Form: ClipboardList,
  'Input Text': TextCursorInput,
  Email: Mail,
  Number: Hash,
  Checkbox: SquareCheck,
  Textarea: TextAlignStart,
  Select: ChevronsUpDown,
  Submit: MousePointerClick,
  Reset: MousePointerClick,
  Button: MousePointerClick,
}

function elementIcon(name: string): Component {
  return ELEMENT_ICONS[name] ?? Shapes
}

const editor = useEditorStore()
const snippetsStore = useSnippetsStore()
const openGroup = ref<string | null>('containers')

const groupLabels = computed(() => {
  const builtIn = (editor.elements ?? []).map((g) => g.label)
  const fromSnippets = snippetsStore.items.map((s) => s.category)
  return Array.from(new Set([...builtIn, ...fromSnippets]))
})

function builtInElementsFor(label: string) {
  return editor.elements?.find((g) => g.label === label)?.elements ?? []
}

function snippetsFor(label: string) {
  return snippetsStore.items.filter((s) => s.category === label)
}

async function removeSnippet(id: string) {
  if (!window.confirm('Delete this snippet?')) return
  try {
    await snippetsStore.remove(id)
  } catch (e: any) {
    window.alert(e?.message || 'Failed to delete snippet')
  }
}

onMounted(() => {
  snippetsStore.refresh()
})
</script>
