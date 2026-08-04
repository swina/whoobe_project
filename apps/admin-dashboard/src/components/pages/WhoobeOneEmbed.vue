<template>
  <div class="h-full flex flex-col">
    <div class="flex-1 min-h-0 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden relative">
      <iframe :src="embedSrc" class="w-full h-full border-0" @load="isConnecting = false"></iframe>

      <div
        v-if="isConnecting"
        class="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center space-y-3 text-slate-300"
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

const props = defineProps<{
  pageId: string
}>()

// Mirrors getDefaultWhoobeStudioUrl()/getDefaultCoreApiUrl() (utils/
// documents-api.ts, utils/auth-api.ts) - default to whatever hostname the
// page itself was loaded from, never a hardcoded "localhost". Port 3006 -
// see apps/whoobe-one-spike's own vite.config.ts. Inlined here rather than
// added to documents-api.ts (that file belongs to the cms_documents/
// whoobe-studio pipeline being retired, not this one) - if/when Phase 4
// adds a real pages-api.ts client for listing/CRUD, this belongs there
// instead of staying duplicated in this component.
function getDefaultWhoobeOneSpikeUrl(): string {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:3006`
  }
  return 'http://localhost:3006'
}

const isConnecting = ref(true)

const embedSrc = computed(() => {
  const base = getDefaultWhoobeOneSpikeUrl()
  const params = new URLSearchParams({
    pageId: props.pageId,
    parentOrigin: window.location.origin,
  })
  return `${base}/editor?${params.toString()}`
})
</script>
