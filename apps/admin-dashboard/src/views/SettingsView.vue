<template>
  <div class="h-full flex flex-col">
    <div class="flex shrink-0 items-center gap-2 px-1 text-xs font-semibold pb-3 flex-wrap">
      <button
        v-for="sub in subTabs" :key="sub.key"
        @click="setSubTab(sub.key)"
        :class="['px-3 py-1.5 rounded-lg transition flex items-center gap-1.5', activeSubSection === sub.key ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200']"
      >
        <component :is="sub.icon" class="w-3.5 h-3.5" />
        <span>{{ sub.name }}</span>
      </button>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto">
      <div class="space-y-6 max-w-4xl">
        <div>
          <h2 class="text-xl font-bold text-slate-100 light:text-slate-900">{{ sectionTitle }}</h2>
          <p class="text-xs text-slate-400 light:text-slate-600">{{ sectionDescription }}</p>
        </div>

        <DamConfigManager v-if="activeSubSection === 'dam'" />

        <MfaSettingsCard v-if="activeSubSection === 'security'" />

        <template v-if="activeSubSection === 'classes'">
          <ClassSettingsCard />
          <MigrationSourcesCard />
        </template>

        <ComponentSettingsCard v-if="activeSubSection === 'components'" />

        <div v-if="activeSubSection === 'roles'" class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-3">
          <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">Roles / Users / Workspaces</h3>
          <p class="text-xs text-slate-500">
            Not built yet - there's no admin UI or backend routes for managing users, roles, or workspaces in this codebase yet
            (only the auth tables sign-in already relies on; "workspaces" isn't a concept in the schema at all today). This card is a
            placeholder for that future work, not a working feature.
          </p>
        </div>

        <WorkflowSettingsCard v-if="activeSubSection === 'workflows'" />

        <WebsiteSettingsCard v-if="activeSubSection === 'websites'" />

        <div v-if="activeSubSection === 'general'" class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-6">
          <div class="space-y-4">
            <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">General Options</h3>
            <div class="flex items-center justify-between py-2 border-b border-slate-800 light:border-slate-200">
              <div>
                <div class="text-sm font-medium text-slate-200 light:text-slate-800">Auto Synchronization</div>
                <div class="text-xs text-slate-500">Automatically sync changes from Whoobe CMS backend</div>
              </div>
              <input type="checkbox" checked class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 light:bg-slate-50 border-slate-800 light:border-slate-200" />
            </div>

            <div class="flex items-center justify-between py-2 border-b border-slate-800 light:border-slate-200">
              <div>
                <div class="text-sm font-medium text-slate-200 light:text-slate-800">Debug Logging</div>
                <div class="text-xs text-slate-500">Enable verbose logging for API calls and GraphQL queries</div>
              </div>
              <input type="checkbox" class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 light:bg-slate-50 border-slate-800 light:border-slate-200" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import DamConfigManager from '../components/dam/DamConfigManager.vue'
import MfaSettingsCard from '../components/auth/MfaSettingsCard.vue'
import ClassSettingsCard from '../components/objects/ClassSettingsCard.vue'
import ComponentSettingsCard from '../components/objects/ComponentSettingsCard.vue'
import MigrationSourcesCard from '../components/objects/MigrationSourcesCard.vue'
import WorkflowSettingsCard from '../components/objects/WorkflowSettingsCard.vue'
import WebsiteSettingsCard from '../components/settings/WebsiteSettingsCard.vue'
import { useTabsStore, sectionTabId, type SettingsSubSection } from '../stores/tabsStore'
import {
  Sliders,
  HardDrive,
  Database,
  Blocks,
  Users,
  Shield,
  Workflow,
  Globe
} from '@lucide/vue'

const tabsStore = useTabsStore()

const subTabs: { key: SettingsSubSection; name: string; icon: any }[] = [
  { key: 'general', name: 'General', icon: Sliders },
  { key: 'dam', name: 'DAM', icon: HardDrive },
  { key: 'classes', name: 'Classes', icon: Database },
  { key: 'components', name: 'Components', icon: Blocks },
  { key: 'roles', name: 'Roles', icon: Users },
  { key: 'security', name: 'Security', icon: Shield },
  { key: 'workflows', name: 'Workflows', icon: Workflow },
  { key: 'websites', name: 'Websites', icon: Globe },
]

const activeSubSection = computed<SettingsSubSection>(() => {
  const tab = tabsStore.tabs.find((t) => t.id === sectionTabId('settings'))
  return tab?.settingsSubSection ?? 'general'
})

function setSubTab(key: SettingsSubSection) {
  tabsStore.openSettingsSubSection(key)
}

const sectionTitles: Record<SettingsSubSection, { title: string; description: string }> = {
  general: { title: 'General Settings', description: 'Sync and logging options for the admin dashboard.' },
  dam: { title: 'DAM Configuration', description: 'Configure DAM S3/MinIO storage, folder visibility rules, and sync options.' },
  classes: { title: 'Data Object Classes', description: 'Define classes and fields, and import them on demand from Pimcore.' },
  components: { title: 'Components', description: 'Reusable structured field lists a class field can hold a repeatable mix of.' },
  roles: { title: 'Roles / Users / Workspaces', description: 'Manage who can access this dashboard and what they can do.' },
  security: { title: 'Security', description: 'Two-factor authentication and account security.' },
  workflows: { title: 'Workflows', description: 'Author publish/review workflows for Data Object classes.' },
  websites: { title: 'Websites', description: 'Manage websites, their domains, locales, and navigation menus.' }
}

const sectionTitle = computed(() => sectionTitles[activeSubSection.value].title)
const sectionDescription = computed(() => sectionTitles[activeSubSection.value].description)
</script>