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
// Embeds apps/whoobe-one-spike's editor for one HTML mail template - the
// exact same shape as WhoobeOneEmbed.vue (pages), but pointed at a
// mail_templates row via the `mailTemplateId` query param the editor's
// /editor route now recognizes (docs/plans/forms/mail-templates.md §7).
// The editor loads/saves that template itself against core-api
// (database-actions.ts's loadMailTemplate/saveMailTemplate), so there's no
// postMessage bridge - the iframe only isolates the runtime Tailwind
// scanner, same reasoning as WhoobeOneEmbed.vue.
import { ref, computed } from 'vue'

const props = defineProps<{
  templateId: string
}>()

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
    mailTemplateId: props.templateId,
    parentOrigin: window.location.origin,
  })
  return `${base}/editor?${params.toString()}`
})
</script>
