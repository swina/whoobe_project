<template>
  <div class="flex flex-col items-center justify-center h-full space-y-3 text-center">
    <Eye class="w-10 h-10 text-slate-600" />
    <p class="text-sm font-semibold text-slate-400">Page Preview</p>
    <p v-if="page?.published" class="text-xs text-slate-500 mb-3">
      This page is published at <span class="font-mono text-indigo-400">{{ page.slug }}</span>.
    </p>
    <p v-else class="text-xs text-slate-600 mb-3">Publish the page to see the live preview.</p>
    <p class="text-xs text-slate-600 italic">Full preview (rendering the Whoobe One element tree) will be added in a future phase.</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Eye } from '@lucide/vue'
import { usePagesStore } from '../../stores/pagesStore'
import type { WhoobeOnePage } from '../../utils/pages-api'

const props = defineProps<{
  pageId: string
}>()

const pagesStore = usePagesStore()
const page = ref<WhoobeOnePage | null>(null)

onMounted(async () => {
  try {
    page.value = await pagesStore.getPage(props.pageId)
  } catch {
    // ignore
  }
})
</script>