<template>
  <div class="h-full flex flex-col">
    <div class="flex-1 min-h-0 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 overflow-hidden relative">
      <iframe ref="iframeEl" :src="embedSrc" :name="props.title" class="w-full h-full border-0" @load="isConnecting = false"></iframe>

      <div
        v-if="isConnecting"
        class="absolute inset-0 bg-slate-950/80 light:bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center space-y-3 text-slate-300 light:text-slate-700"
      >
        <span class="animate-spin text-6xl"><Loader class="w-14 h-14"/></span>
        <span class="text-xs font-semibold">Connecting to Whoobe One…</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Embeds apps/whoobe-one-spike's editor for one whoobe snippet - the same
// shape as WhoobeOneEmbed.vue (pages) but pointed at /editor?snippetId=
// (existing) or /editor?snippetNew=1 (a brand-new snippet). The editor
// loads/saves the snippet itself against core-api (database-actions.ts's
// loadSnippet/saveSnippet), so there's no bridge for document content
// itself - only the one small 'whoobe-one:snippet-saved' notification
// below, which exists purely so this specific tab can react to its own
// snippet being created/renamed (DashboardLayout.vue has its own, separate
// global listener for the same message, which just refreshes the list).
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Loader } from '@lucide/vue'
import { getWhoobeOneSpikeUrl } from '../../utils/editor-urls'

const props = defineProps<{
  snippetId: string
  websiteId?: string
  title?: string
  /** The element to select once the editor has loaded the snippet (the Automations list). */
  elementId?: string
}>()

const emit = defineEmits<{
  // Fired once, the first time a brand-new snippet (props.snippetId
  // starting with 'new:') is actually saved - carries its real backend id/
  // name/category so MasterSnippetTab.vue can rekey the tab off the
  // placeholder id, mirroring MasterPageTab.vue's own onPageCreated().
  (e: 'created', snippet: { id: string; name: string; category: string }): void
}>()

const isConnecting = ref(true)
const iframeEl = ref<HTMLIFrameElement | null>(null)

const embedSrc = computed(() => {
  const base = getWhoobeOneSpikeUrl()
  const isNew = props.snippetId.startsWith('new:')
  const params: Record<string, string> = {
    ...(isNew ? { snippetNew: '1' } : { snippetId: props.snippetId }),
    parentOrigin: window.location.origin,
  }
  if (props.websiteId) params.websiteId = props.websiteId
  if (props.elementId && !isNew) params.elementId = props.elementId
  return `${base}/editor?${new URLSearchParams(params).toString()}`
})

// Checks event.source against this specific iframe's own contentWindow
// (not just event.origin, which every whoobe-one-spike iframe on the page
// shares) - a Dashboard can have several snippet tabs open at once, each
// its own iframe instance of this same component, and only the one whose
// snippet was actually just saved should ever emit 'created'.
//
// Also requires `ownDocument` (not just `created`): the same editor session
// can save an unrelated, separate snippet mid-edit (SaveSnippetModal.vue's
// "Save as snippet" on some selected sub-block, while this tab's own
// document is something else entirely, possibly still itself unsaved) -
// only `ownDocument: true` means "the snippet this whole tab represents
// just got its first real id," which is the only case worth rekeying for.
function onWindowMessage(event: MessageEvent) {
  if (event.origin !== new URL(getWhoobeOneSpikeUrl()).origin) return
  if (event.source !== iframeEl.value?.contentWindow) return
  if (event.data?.type !== 'whoobe-one:snippet-saved') return
  const { id, name, category, created, ownDocument } = event.data
  if (created && ownDocument && typeof id === 'string' && typeof name === 'string' && typeof category === 'string') {
    emit('created', { id, name, category })
  }
}

onMounted(() => window.addEventListener('message', onWindowMessage))
onUnmounted(() => window.removeEventListener('message', onWindowMessage))
</script>
