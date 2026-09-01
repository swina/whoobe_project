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
// Embeds apps/whoobe-one-spike's editor for one whoobe snippet - the same
// shape as WhoobeOneEmbed.vue (pages) but pointed at /editor?snippetId=
// (existing) or /editor?snippetNew=1 (a brand-new snippet). The editor
// loads/saves the snippet itself against core-api (database-actions.ts's
// loadSnippet/saveSnippet), so there's no postMessage bridge.
import { ref, computed } from 'vue'
import { getWhoobeOneSpikeUrl } from '../../utils/editor-urls'

const props = defineProps<{
  snippetId: string
  websiteId?: string
}>()

const isConnecting = ref(true)

const embedSrc = computed(() => {
  const base = getWhoobeOneSpikeUrl()
  const isNew = props.snippetId.startsWith('new:')
  const params: Record<string, string> = {
    ...(isNew ? { snippetNew: '1' } : { snippetId: props.snippetId }),
    parentOrigin: window.location.origin,
  }
  if (props.websiteId) params.websiteId = props.websiteId
  return `${base}/editor?${new URLSearchParams(params).toString()}`
})
</script>
