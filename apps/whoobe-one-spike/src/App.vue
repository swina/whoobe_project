<template>
  <router-view />
  <AiUsageToast />
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
import AiUsageToast from './components/AiUsageToast.vue'

const editor = useEditorStore()

onMounted(() => {
  editor.setElements(new Element().Groups())
  setupHotkeys()
  // Kits no longer need a client-side import step - the repo's own
  // reference kits are seeded server-side now (packages/core/src/db/
  // seed.ts's seedWhoobeOneKits()), so they're already there by the time
  // KitsPanel.vue asks for them.
})
</script>
