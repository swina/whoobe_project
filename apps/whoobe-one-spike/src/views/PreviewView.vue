<template>
  <div v-if="loading" class="p-8 text-center text-gray-400 text-sm">Loading preview...</div>
  <BlockContainerPreview v-else-if="doc" :doc="doc" />
  <div v-else class="p-8 text-center text-gray-400 text-sm">No document to preview</div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useThemeStyles } from '../composables/useThemeStyles'
import BlockContainerPreview from '../components/preview/BlockContainerPreview.vue'

const DEFAULT_ROOT_CLASSES = ['gap-4', 'min-h-[600px]', 'bg-white', 'p-6']

const loading = ref(true)
const doc = ref<any>(null)

onMounted(() => {
  try {
    const raw = sessionStorage.getItem('whoobe-preview-doc')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.css?.container) {
        const cls = parsed.css.container.split(' ').filter((c: string) => !DEFAULT_ROOT_CLASSES.includes(c)).join(' ')
        parsed.css.container = cls
      }
      doc.value = parsed
    }
  } catch {
    // clean
  }
  loading.value = false
})

useThemeStyles(() => doc.value)
</script>