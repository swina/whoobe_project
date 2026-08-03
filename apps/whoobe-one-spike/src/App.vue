<template>
  <router-view />
</template>

<script setup lang="ts">
// Now a thin router shell (Phase 1) rather than mounting BlockEditor
// directly (Phase 0) - the seed-document logic moved to views/Editor.vue,
// which is what the /editor route now renders.
//
// App-wide bootstrap that ran once in the source repo's own App.vue
// mounted() hook: populating editor.elements from Element.Groups() (the
// same call the original made via `this.$store.dispatch('elements',
// groups)`), and installing the global keydown hotkey listener (the
// source did this as an import-time side effect of scripts/hotkeys.js;
// here it's an explicit setupHotkeys() call - see that file's header).
import { onMounted } from 'vue'
import Element from './scripts/ElementsClass.js'
import { useEditorStore } from './store/editor'
import { setupHotkeys } from './scripts/hotkeys'

const editor = useEditorStore()

onMounted(() => {
  editor.setElements(new Element().Groups())
  setupHotkeys()
})
</script>
