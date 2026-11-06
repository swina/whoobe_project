<template>
  <div v-if="loading" class="p-8 text-center text-gray-400 text-sm">Loading preview...</div>
  <BlockContainerPreview v-else-if="doc" :doc="doc" editor-preview />
  <div v-else class="p-8 text-center text-gray-400 text-sm">No document to preview</div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useEditorStore } from '../store/editor'
import { useThemeStyles } from '../composables/useThemeStyles'
import { resolveDocumentData } from '../scripts/data-resolver'
import BlockContainerPreview from '../components/preview/BlockContainerPreview.vue'
import { stripEditorRootClasses } from '../scripts/editor-root-classes'

const loading = ref(true)
const doc = ref<any>(null)
const editor = useEditorStore()

onMounted(async () => {
  try {
    // Theme and template body of the page being previewed (see DocumentPreview.vue's storeDocForPreview).
    const ctxRaw = sessionStorage.getItem('whoobe-preview-ctx')
    if (ctxRaw) {
      const ctx = JSON.parse(ctxRaw)
      if (ctx.websiteTheme) editor.setWebsiteTheme(ctx.websiteTheme)
      editor.setTemplateBody(ctx.templateBody ?? null)
    }
    const raw = sessionStorage.getItem('whoobe-preview-doc')
    if (raw) {
      const parsed = stripEditorRootClasses(JSON.parse(raw))
      doc.value = parsed
      resolveDocumentData(parsed).catch(() => {})
    }
  } catch {
    // clean
  }
  loading.value = false
})

useThemeStyles(() => doc.value)
</script>