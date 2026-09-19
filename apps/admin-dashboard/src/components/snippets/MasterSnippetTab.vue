<template>
  <div class="h-full flex flex-col">
    <!---<div class="flex shrink-0 px-6 pt-2 pb-1 items-center gap-2">
      <h4 class="text-sm font-bold text-slate-100 light:text-slate-900">{{ title }}</h4>
      <span v-if="isNewSnippet" class="px-2 py-0.5 text-[10px] font-bold rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 uppercase">new</span>
    </div>--->
    <div class="flex-1 min-h-0 px-2 pb-1 pt-2">
      <div class="h-full rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-2">
        <SnippetEditorEmbed :snippet-id="props.snippetId" :title="title" @created="onSnippetCreated" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useSnippetsStore } from '../../stores/snippetsStore'
import { useTabsStore, snippetTabId } from '../../stores/tabsStore'
import SnippetEditorEmbed from './SnippetEditorEmbed.vue'

const props = defineProps<{ snippetId: string }>()

const snippetsStore = useSnippetsStore()
const tabsStore = useTabsStore()
const isNewSnippet = computed(() => props.snippetId.startsWith('new:'))

const title = computed(() => {
  if (isNewSnippet.value) return 'New Snippet'
  return snippetsStore.snippets.find((s) => s.id === props.snippetId)?.name || 'Snippet'
})

onMounted(() => {
  if (snippetsStore.snippets.length === 0) snippetsStore.refresh()
})

// The embedded editor's first Save for a brand-new snippet (props.snippetId
// still a client-side 'new:<uuid>' placeholder) hands back the real backend
// row - rekey this tab onto it, exactly like MasterPageTab.vue's own
// onPageCreated() does for pages, so the tab strip (DashboardLayout.vue's
// tabLabel(), keyed by tab.itemId) picks up the real name instead of
// staying stuck on "New Snippet" forever.
function onSnippetCreated(created: { id: string; name: string; category: string }) {
  const tab = tabsStore.tabs.find((t) => t.itemKind === 'snippet' && t.itemId === props.snippetId)
  if (!tab) return
  const wasActive = tabsStore.activeTabId === tab.id
  tab.id = snippetTabId(created.id)
  tab.itemId = created.id
  // DashboardLayout.vue's tab strip/content panel both key their `v-for`
  // by `tab.id` (matching MasterPageTab.vue's own onPageCreated(), which
  // rekeys the same way for pages) - changing it re-keys this tab's DOM,
  // so activeTabId must follow the new id too or the tab silently goes
  // blank (still open, just no longer matching `v-show`) until re-clicked.
  if (wasActive) tabsStore.activeTabId = tab.id
}
</script>
