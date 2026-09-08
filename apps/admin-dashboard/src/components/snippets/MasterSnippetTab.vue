<template>
  <div class="h-full flex flex-col">
    <!---<div class="flex shrink-0 px-6 pt-2 pb-1 items-center gap-2">
      <h4 class="text-sm font-bold text-slate-100 light:text-slate-900">{{ title }}</h4>
      <span v-if="isNewSnippet" class="px-2 py-0.5 text-[10px] font-bold rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 uppercase">new</span>
    </div>--->
    <div class="flex-1 min-h-0 px-2 pb-1 pt-2">
      <div class="h-full rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-2">
        <SnippetEditorEmbed :snippet-id="props.snippetId" :title="title" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useSnippetsStore } from '../../stores/snippetsStore'
import SnippetEditorEmbed from './SnippetEditorEmbed.vue'

const props = defineProps<{ snippetId: string }>()

const snippetsStore = useSnippetsStore()
const isNewSnippet = computed(() => props.snippetId.startsWith('new:'))

const title = computed(() => {
  if (isNewSnippet.value) return 'New Snippet'
  return snippetsStore.snippets.find((s) => s.id === props.snippetId)?.name || 'Snippet'
})

onMounted(() => {
  if (snippetsStore.snippets.length === 0) snippetsStore.refresh()
})
</script>
