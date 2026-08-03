<template>
  <div class="fixed inset-0 z-[10002] bg-white overflow-auto">
    <div class="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-gray-900 text-white text-xs">
      <span class="font-semibold">Preview</span>
      <div class="flex-1"></div>
      <span class="text-gray-400">Esc to close</span>
      <button class="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600" @click="$emit('close')">✕ Close</button>
    </div>
    <BlockContainerPreview v-if="doc" :doc="doc" />
  </div>
</template>

<script setup lang="ts">
// Equivalent of the source's BlockWindowPreview.vue's own fullscreen mode
// (src/components/blocks/preview/BlockWindowPreview.vue) - trimmed way
// down to just what "preview the document" needs here: a read-only render
// of the current document, with no editing chrome at all. The source's
// own file also has a device-size switcher (fullscreen/tablet/smartphone,
// with a live-srcdoc iframe + zoom controls), a right-click "Save/HTML
// source/Build page" context menu, and a print-screen/thumbnail feature -
// all of that talks to features this spike hasn't built (the static-export
// tool, a screenshot pipeline, the page-settings dialog) and is out of
// scope for a first pass at "can I see what this looks like without the
// editing UI in the way".
//
// Opened from BlockEditor.vue's own "👁 Preview" button and the Alt+N
// hotkey (hotkeys.ts already emitted `editorBus.emit('preview',
// 'fullscreen')` on Alt+N since Phase 1 - this is the first thing that
// actually listens for it, matching hotkeys.ts's own comment that it
// "stays inert until the feature it targets is actually built").
import { onMounted, onUnmounted } from 'vue'
import type Element from '../scripts/ElementsClass.js'
import BlockContainerPreview from './preview/BlockContainerPreview.vue'

defineProps<{
  doc: InstanceType<typeof Element> | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>
