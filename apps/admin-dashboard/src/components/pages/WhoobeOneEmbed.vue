<template>
  <div class="h-full flex flex-col">
    <div class="flex-1 min-h-0 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 overflow-hidden relative">
      <iframe :src="embedSrc" class="w-full h-full border-0" @load="isConnecting = false"></iframe>

      <div
        v-if="isConnecting"
        class="absolute inset-0 bg-slate-950/80 light:bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center space-y-3 text-slate-300 light:text-slate-700"
      >
        <span class="animate-spin text-2xl">⏳</span>
        <span class="text-xs font-semibold">Connecting to Whoobe One…</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Embeds apps/whoobe-one-spike's real editor for one specific page - see
// docs/plans/cms/whoobe-one-editor-integration-plan.md §6 (Phase 3) for
// the full reasoning this follows. Deliberately much lighter than this
// same directory's sibling, WhoobeStudioEmbed.vue (documents/):
//
// - No WhoobeHostBridge/postMessage document-sync bridge - that mechanism
//   exists specifically because whoobe-studio has no way to load or save
//   a document on its own (the host must hand it data and persist
//   whatever comes back). whoobe-one-spike already loads/saves its own
//   content directly against core-api (the exact same way it already does
//   for templates/kits/snippets) - once pointed at a real `pageId`, it
//   just uses that same existing API-client pattern, no bridge needed.
// - No `onSaved`/`onRequestAssetPicker`/`onRequestDataObjectPicker`
//   callbacks either, for the same reason - there's nothing for this
//   component to do on the editor's behalf.
// - Still a real <iframe>, and still passes `parentOrigin` in the query
//   string (reusing the exact same convention WhoobeStudioEmbed.vue
//   already established, rather than inventing a second one) - not to
//   secure any postMessage traffic (there isn't any here), but because
//   whoobe-one-spike runs Tailwind entirely at runtime in the browser
//   (@tailwindcss/browser, scanning whatever DOM it's loaded into) -
//   mounting its components directly inside this app's own document
//   would mean that scanner running against this app's *entire* page.
//   The iframe keeps the two fully isolated.
import { ref, computed } from 'vue'
import { getWhoobeOneSpikeUrl } from '../../utils/editor-urls'

const props = defineProps<{
  pageId: string
}>()

const isConnecting = ref(true)

const embedSrc = computed(() => {
  const base = getWhoobeOneSpikeUrl()
  const params = new URLSearchParams({
    pageId: props.pageId,
    parentOrigin: window.location.origin,
  })
  return `${base}/editor?${params.toString()}`
})
</script>
