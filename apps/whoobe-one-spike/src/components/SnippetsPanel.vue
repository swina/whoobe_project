<template>
  <div class="flex-1 min-h-0 overflow-y-auto text-xs font-mono">
    <div v-if="!snippetsStore.items.length" class="p-3 text-xs text-gray-400">
      No snippets yet. Select an element on the canvas and use its "Save as snippet" action (the link icon's neighbor in the floating toolbar) to create one.
    </div>
    <template v-for="category in categories" :key="category">
      <button
        type="button"
        class="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold capitalize text-gray-600 hover:bg-violet-500 hover:text-white border-b" :class="{ 'bg-violet-500 text-white': openGroup === category }"
        @click="openGroup = openGroup === category ? null : category"
      >
        {{ category }}
        <ChevronDown v-if="openGroup === category" class="w-3.5 h-3.5 text-gray-400" />
        <ChevronRight v-else class="w-3.5 h-3.5 text-gray-400" />
      </button>
      <div v-if="openGroup === category" class="grid grid-cols-3 gap-1.5 p-2 border-b bg-gray-50 dragula-source-container">
        <div
          v-for="snippet in snippetsFor(category)"
          :key="snippet.id"
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
// Snippets' own top-level sidebar tab, split out of BlockElementsPalette.vue
// (which used to merge saved snippets into the built-in Elements accordion
// by category, sharing "containers"/"text"/"media"/"form" sections with
// Grid/Flexbox/etc - see git history on that file for the prior design and
// its own reasoning). Snippets now get a separate category namespace,
// grouped only by whatever categories exist among saved snippets - no union
// with editor.elements's built-in group labels.
//
// Everything else is unchanged from the old merged behavior: same chip
// markup/attributes (data-type="template"/data-snippet-id,
// dragula-source-container on the grid) so BlockEditor.vue's single shared
// dragula instance and drop handler need no changes to pick these up (see
// that handler's data-snippet-id branch), same delete-in-place button, same
// one-category-open-at-a-time accordion.
import { computed, onMounted, ref, watch } from 'vue'
import { ChevronDown, ChevronRight, Package, X } from '@lucide/vue'
import { useSnippetsStore } from '../store/snippets'

const snippetsStore = useSnippetsStore()
const openGroup = ref<string | null>(null)

const categories = computed(() =>
  Array.from(new Set(snippetsStore.items.map((s) => s.category))).sort((a, b) => a.localeCompare(b))
)

// Auto-open the first category once snippets load, same "land on something
// useful" behavior BlockElementsPalette.vue's hardcoded default ('containers')
// gave for free - snippet categories are user-defined, so there's no fixed
// name to default to instead.
watch(
  categories,
  (list) => {
    if (openGroup.value === null && list.length > 0) openGroup.value = list[0]
  },
  { immediate: true }
)

function snippetsFor(category: string) {
  return snippetsStore.items.filter((s) => s.category === category)
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
