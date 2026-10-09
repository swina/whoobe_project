<template>
  <div class="h-full flex flex-col">
    <div class="flex-1 min-h-0 overflow-y-auto">
      <div class="space-y-6 max-w-4xl">
        <div>
          <h2 class="text-xl font-bold text-slate-100 light:text-slate-900">{{ current.title }}</h2>
          <p class="text-xs text-slate-400 light:text-slate-600">{{ current.description }}</p>
        </div>

        <AiSettingsCard v-if="active === 'text'" />
        <AiImageSettingsCard v-else-if="active === 'image'" />
        <AiTranslateSettingsCard v-else-if="active === 'translate'" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// The AI section of the navigation: the providers the dashboard and the Whoobe One editor use for generating pages and snippets
// (text), images and translation. They used to be three cards of Settings; the sidebar's AI entry has the submenu that picks one.
import { computed } from 'vue'
import { useTabsStore, sectionTabId, type AiSubSection } from '../stores/tabsStore'
import AiSettingsCard from '../components/settings/AiSettingsCard.vue'
import AiImageSettingsCard from '../components/settings/AiImageSettingsCard.vue'
import AiTranslateSettingsCard from '../components/settings/AiTranslateSettingsCard.vue'

const tabsStore = useTabsStore()

const TITLES: Record<AiSubSection, { title: string; description: string }> = {
  text: { title: 'AI Agent', description: 'LLM provider used by the AI page and snippet generator in the Whoobe One composer.' },
  image: { title: 'AI Image Generation', description: 'Dedicated AI provider for image generation, or leave blank to use your text AI configuration.' },
  translate: { title: 'AI Translation', description: 'Dedicated AI provider for the page editor\'s "Translate" action, or leave blank to use your AI Agent configuration.' },
}

const active = computed<AiSubSection>(() => tabsStore.tabs.find((t) => t.id === sectionTabId('ai'))?.aiSubSection ?? 'text')
const current = computed(() => TITLES[active.value])
</script>
