<template>
  <div class="flex flex-col gap-2">
    <template v-if="snippet">
      <p class="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
        <span v-if="snippet.icon">{{ snippet.icon }}</span>
        {{ snippet.name }}
      </p>
      <p v-if="snippet.notes" class="whitespace-pre-wrap text-xs text-gray-600">{{ snippet.notes }}</p>
      <p v-else class="text-[10px] text-gray-400 italic">This snippet has no usage notes.</p>
    </template>
    <p v-else class="text-[10px] text-gray-400 italic">The snippet this element came from was deleted.</p>
  </div>
</template>

<script setup lang="ts">
// AdvancedPanel.vue's "Info" section - only shown at all when the selected
// element carries a sourceSnippetId (stamped onto the clone by BlockEditor.
// vue's snippet-drop handler, see ElementsClass.d.ts's field comment), so
// this component can assume `snippet` resolves whenever it's mounted,
// except for the one real edge case handled below: the source snippet was
// deleted from the library after this instance was dropped into the
// document.
import { computed, onMounted } from 'vue'
import { useEditorStore } from '../../store/editor'
import { useSnippetsStore } from '../../store/snippets'

const editor = useEditorStore()
const snippetsStore = useSnippetsStore()

// This section can be the first thing to touch the snippets store in a
// session that never opened the Snippets sidebar tab (e.g. reopening a page
// that already has a snippet-derived element on it) - SnippetsPanel.vue's
// own onMounted() isn't guaranteed to have run first, so make sure the
// store is actually populated before resolving against it.
onMounted(() => {
  if (!snippetsStore.items.length) snippetsStore.refresh()
})

const snippet = computed(() => {
  const id = (editor.current as any)?.sourceSnippetId
  if (!id) return null
  return snippetsStore.items.find((s) => s.id === id) ?? null
})
</script>
