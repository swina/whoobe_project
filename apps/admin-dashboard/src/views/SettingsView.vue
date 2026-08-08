<template>
  <div class="space-y-6 max-w-4xl">
    <div>
      <h2 class="text-xl font-bold text-slate-100 light:text-slate-900">{{ sectionTitle }}</h2>
      <p class="text-xs text-slate-400 light:text-slate-600">{{ sectionDescription }}</p>
    </div>

    <!-- DAM Storage Manager -->
    <DamConfigManager v-if="activeSubSection === 'dam'" />

    <!-- Security: two-factor authentication -->
    <MfaSettingsCard v-if="activeSubSection === 'security'" />

    <!-- Data Object classes + Pimcore migration sources - grouped under
         one submenu entry (docs/plans/UI/settings-ui-plan.md only lists
         "Data Object classes", not a separate "Migration Sources" item;
         importing from Pimcore is a class-related admin action, same
         reasoning native-class-authoring-plan.md §3.4 used to place it
         alongside ClassSettingsCard.vue rather than under Workflows). -->
    <template v-if="activeSubSection === 'classes'">
      <ClassSettingsCard />
      <MigrationSourcesCard />
    </template>

    <!-- Component Types - docs/plans/datamodel/component-fields-plan.md -->
    <ComponentSettingsCard v-if="activeSubSection === 'components'" />

    <!-- Roles / Users / Workspaces - listed in the plan, but no backend
         exists for this yet (no /users, /roles, or /workspaces admin
         routes - only the auth tables users/roles/permissions/
         rolePermissions/userRoles that log-in already relies on, and no
         "workspaces" concept anywhere in the schema at all). An honest
         placeholder rather than a mocked table with fake rows - matches
         this codebase's own recurring "stated, not built" discipline
         (see native-class-authoring-plan.md/advanced-data-modeling-
         plan.md's own placeholders for genuinely unbuilt pieces). -->
    <div v-if="activeSubSection === 'roles'" class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-3">
      <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">Roles / Users / Workspaces</h3>
      <p class="text-xs text-slate-500">
        Not built yet - there's no admin UI or backend routes for managing users, roles, or workspaces in this codebase yet
        (only the auth tables sign-in already relies on; "workspaces" isn't a concept in the schema at all today). This card is a
        placeholder for that future work, not a working feature.
      </p>
    </div>

    <!-- Data Object workflows -->
    <WorkflowSettingsCard v-if="activeSubSection === 'workflows'" />

    <!-- Websites -->
    <WebsiteSettingsCard v-if="activeSubSection === 'websites'" />

    <!-- General Options -->
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
</template>

<script setup lang="ts">
// One card group at a time, driven by the collapsible Settings submenu in
// DashboardLayout.vue's sidebar - docs/plans/UI/settings-ui-plan.md. Reads
// the active sub-section straight from tabsStore (the same store the
// sidebar writes to via openSettingsSubSection()) rather than via a prop,
// matching every other section view's existing convention of reading
// directly from a store instead of DashboardLayout passing props into
// `<component :is="sectionComponent(tab.section)" />`.
import { computed } from 'vue'
import DamConfigManager from '../components/dam/DamConfigManager.vue'
import MfaSettingsCard from '../components/auth/MfaSettingsCard.vue'
import ClassSettingsCard from '../components/objects/ClassSettingsCard.vue'
import ComponentSettingsCard from '../components/objects/ComponentSettingsCard.vue'
import MigrationSourcesCard from '../components/objects/MigrationSourcesCard.vue'
import WorkflowSettingsCard from '../components/objects/WorkflowSettingsCard.vue'
import WebsiteSettingsCard from '../components/settings/WebsiteSettingsCard.vue'
import { useTabsStore, sectionTabId, type SettingsSubSection } from '../stores/tabsStore'

const tabsStore = useTabsStore()

const activeSubSection = computed<SettingsSubSection>(() => {
  const tab = tabsStore.tabs.find((t) => t.id === sectionTabId('settings'))
  return tab?.settingsSubSection ?? 'general'
})

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
