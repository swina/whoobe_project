<template>
  <div v-if="state === 'checking'" class="p-8 text-center text-gray-400 text-sm">Loading…</div>
  <DocsView v-else-if="state === 'docs' && site" :key="site.websiteId" :site="site" :route="docsRoute" />
  <PublicPage v-else />
</template>

<script setup lang="ts">
// Catch-all of the application: an address whose first segment is the root path of a DOCUMENTATION website shows the docs
// layout; every other address is a page, exactly as before (PublicPage.vue is untouched).
import { ref, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import PublicPage from './PublicPage.vue'
import DocsView from './DocsView.vue'
import { findDocsSite, type DocsSiteRef } from '../docs-api'

const route = useRoute()
const state = ref<'checking' | 'docs' | 'page'>('checking')
const site = ref<DocsSiteRef | null>(null)
const cache = new Map<string, DocsSiteRef | null>()

const segments = computed(() => {
  const m = route.params.pathMatch
  return (Array.isArray(m) ? m : [m ?? '']).flatMap((p) => String(p).split('/')).filter(Boolean)
})
const docsRoute = computed(() => '/' + segments.value.slice(1).join('/'))

async function resolve() {
  const first = segments.value[0]
  if (!first) { state.value = 'page'; return }
  if (!cache.has(first)) cache.set(first, await findDocsSite(first))
  site.value = cache.get(first) ?? null
  state.value = site.value ? 'docs' : 'page'
}
watch(() => segments.value[0], resolve, { immediate: true })
</script>
