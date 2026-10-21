<template>
  <BaseModal :open="true" size="sm" title="Website created" @close="emit('close')">
    <div class="space-y-3 text-sm text-slate-300 light:text-slate-700" data-testid="website-created">
      <p>
        <strong class="text-slate-100 light:text-slate-900">{{ website.name }}</strong> was created as a <strong>draft</strong>
        with {{ pages }} {{ pages === 1 ? 'page' : 'pages' }}. The public address answers "Page not found" until the pages are published.
      </p>
      <p class="text-xs text-slate-400 light:text-slate-600">
        <strong>Preview</strong> opens the site with its draft pages (marked as a draft preview). <strong>Manage</strong> opens its settings.
      </p>
    </div>
    <template #footer>
      <button class="btn btn-secondary" data-testid="website-created-close" @click="emit('close')">Close</button>
      <a :href="previewUrl" target="_blank" rel="noopener" class="btn btn-soft-primary" data-testid="website-created-preview">Preview</a>
      <button class="btn btn-primary" data-testid="website-created-manage" @click="manage">Manage</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
// Shown when a website has been generated (the wizard, a specification): the person can look at it or go to its settings.
import { computed } from 'vue'
import BaseModal from '../ui/BaseModal.vue'
import { useTabsStore } from '../../stores/tabsStore'
import { useWebsitesStore } from '../../stores/websitesStore'
import { websiteDraftPreviewUrl } from '../../utils/editor-urls'

const props = defineProps<{ website: { id: string; name: string; rootPath: string }; pages: number }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const tabsStore = useTabsStore()
const websitesStore = useWebsitesStore()

// the default language comes from the website as the list now holds it
const previewUrl = computed(() => {
  const known = websitesStore.websites.find((w) => w.id === props.website.id)
  return websiteDraftPreviewUrl({ rootPath: props.website.rootPath, defaultLocale: known?.defaultLocale ?? 'en' })
})

function manage(): void {
  tabsStore.openWebsite(props.website.id)
  emit('close')
}
</script>
