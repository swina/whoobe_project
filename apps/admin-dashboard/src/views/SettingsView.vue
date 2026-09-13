<template>
  <div class="h-full flex flex-col">
    <!-- <div class="flex shrink-0 items-center gap-2 px-1 text-xs font-semibold pb-3 flex-wrap">
      <button
        v-for="sub in subTabs" :key="sub.key"
        @click="setSubTab(sub.key)"
        :class="['px-3 py-1.5 rounded-lg transition flex items-center gap-1.5', activeSubSection === sub.key ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200']"
      >
        <component :is="sub.icon" class="w-3.5 h-3.5" />
        <span>{{ sub.name }}</span>
      </button>
    </div> -->

    <div class="flex-1 min-h-0 overflow-y-auto">
      <div class="space-y-6 max-w-4xl">
        <div>
          <h2 class="text-xl font-bold text-slate-100 light:text-slate-900">{{ sectionTitle }}</h2>
          <p class="text-xs text-slate-400 light:text-slate-600">{{ sectionDescription }}</p>
        </div>

        <DamConfigManager v-if="activeSubSection === 'dam'" />

        <MfaSettingsCard v-if="activeSubSection === 'security'" />

        <template v-if="activeSubSection === 'classes'">
          <!-- Inner tabs for Classes section -->
          <div class="flex items-center gap-2 pb-1 border-b border-slate-800 light:border-slate-200">
            <button
              v-for="tab in classesSubTabs" :key="tab.key"
              @click="setClassesSubTab(tab.key)"
              :class="['px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5', classesActiveTab === tab.key ? 'bg-slate-800 light:bg-slate-200 text-slate-100 light:text-slate-900' : 'text-slate-500 light:text-slate-600 hover:text-slate-300 light:hover:text-slate-700']"
            >
              <component :is="tab.icon" class="w-3.5 h-3.5" />
              <span>{{ tab.name }}</span>
            </button>
          </div>

          <ClassSettingsCard v-if="classesActiveTab === 'classes'" />
          <MigrationSourcesCard v-else-if="classesActiveTab === 'pimcore'" />
          <div v-else-if="classesActiveTab === 'file'" class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-3">
            <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">File Migration</h3>
            <p class="text-xs text-slate-500">
              Import data objects from structured files (JSON, XLSX, CSV). Not yet implemented — this tab is a placeholder for future development.
            </p>
          </div>
        </template>

        <template v-if="activeSubSection === 'roles'">
          <!-- Inner tabs for Roles section -->
          <div class="flex items-center gap-2 pb-1 border-b border-slate-800 light:border-slate-200">
            <button
              v-for="tab in rolesSubTabs" :key="tab.key"
              @click="setRolesSubTab(tab.key)"
              :class="['px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5', rolesActiveTab === tab.key ? 'bg-slate-800 light:bg-slate-200 text-slate-100 light:text-slate-900' : 'text-slate-500 light:text-slate-600 hover:text-slate-300 light:hover:text-slate-700']"
            >
              <component :is="tab.icon" class="w-3.5 h-3.5" />
              <span>{{ tab.name }}</span>
            </button>
          </div>

          <UsersView v-if="rolesActiveTab === 'users'" />
          <RolesView v-else-if="rolesActiveTab === 'roles'" />
        </template>

        <WorkflowSettingsCard v-if="activeSubSection === 'workflows'" />

        <AiSettingsCard v-if="activeSubSection === 'ai'" />

        <AiImageSettingsCard v-if="activeSubSection === 'ai-image'" />

        <FigmaSettingsCard v-if="activeSubSection === 'figma'" />

        <PwaSettingsCard v-if="activeSubSection === 'pwa'" />

        <div v-if="activeSubSection === 'general'" class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-6">
          <div class="space-y-4">
            <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">General Options</h3>

            <div class="flex items-center justify-between py-2 border-b border-slate-800 light:border-slate-200">
              <div>
                <div class="text-sm font-medium text-slate-200 light:text-slate-800">Default Image Placeholder</div>
                <div class="text-xs text-slate-500">A DAM asset shown as placeholder for newly-created image elements</div>
              </div>
              <div class="flex items-center gap-2">
                <span v-if="placeholderPimcorePath" class="text-xs text-slate-400 font-mono truncate max-w-[200px]">{{ placeholderPimcorePath }}</span>
                <button @click="openPicker" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40">Pick</button>
                <button v-if="placeholderPimcorePath" @click="clearPlaceholder" class="text-xs text-rose-400 hover:text-rose-300">Clear</button>
              </div>
            </div>
          </div>
          <AssetPickerModal :is-open="pickerOpen" @close="pickerOpen = false" @select="onPlaceholderSelected" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import DamConfigManager from '../components/dam/DamConfigManager.vue'
import MfaSettingsCard from '../components/auth/MfaSettingsCard.vue'
import ClassSettingsCard from '../components/objects/ClassSettingsCard.vue'
import MigrationSourcesCard from '../components/objects/MigrationSourcesCard.vue'
import WorkflowSettingsCard from '../components/objects/WorkflowSettingsCard.vue'
import AiSettingsCard from '../components/settings/AiSettingsCard.vue'
import AiImageSettingsCard from '../components/settings/AiImageSettingsCard.vue'
import FigmaSettingsCard from '../components/settings/FigmaSettingsCard.vue'
import PwaSettingsCard from '../components/settings/PwaSettingsCard.vue'
import UsersView from './UsersView.vue'
import RolesView from './RolesView.vue'
import { useTabsStore, sectionTabId, type SettingsSubSection } from '../stores/tabsStore'
import { useAuthStore } from '../stores/authStore'
import { fetchDefaultPlaceholderImage, saveDefaultPlaceholderImage } from '../utils/websites-api'
import { useToastStore } from '../stores/toastStore'
import AssetPickerModal from '../components/dam/AssetPickerModal.vue'
import type { AssetItem } from '../stores/damStore'
import {
  Sliders,
  HardDrive,
  Database,
  Users,
  Shield,
  Workflow,
  Upload,
  FileJson,
  Sparkles,
  WandSparkles,
  Image,
  Palette,
  Smartphone,
  UserRound,
  KeyRound,
} from '@lucide/vue'

const tabsStore = useTabsStore()
const authStore = useAuthStore()
const toastStore = useToastStore()

const placeholderPimcorePath = ref<string | null>(null)
const pickerOpen = ref(false)

async function loadPlaceholder() {
  try {
    placeholderPimcorePath.value = await fetchDefaultPlaceholderImage(authStore.config.coreApiUrl)
  } catch { /* ignore */ }
}

function openPicker() {
  pickerOpen.value = true
}

async function onPlaceholderSelected(asset: AssetItem) {
  pickerOpen.value = false
  placeholderPimcorePath.value = asset.pimcorePath
  try {
    await saveDefaultPlaceholderImage(authStore.config.coreApiUrl, asset.pimcorePath)
    toastStore.show('Default placeholder updated')
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to save placeholder')
  }
}

async function clearPlaceholder() {
  placeholderPimcorePath.value = null
  try {
    await saveDefaultPlaceholderImage(authStore.config.coreApiUrl, null)
    toastStore.show('Default placeholder cleared')
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to clear placeholder')
  }
}

onMounted(loadPlaceholder)

const subTabs: { key: SettingsSubSection; name: string; icon: any }[] = [
  { key: 'general', name: 'General', icon: Sliders },
  { key: 'dam', name: 'DAM', icon: HardDrive },
  { key: 'classes', name: 'Classes', icon: Database },
  { key: 'roles', name: 'Roles', icon: Users },
  { key: 'security', name: 'Security', icon: Shield },
  { key: 'workflows', name: 'Workflows', icon: Workflow },
  { key: 'ai', name: 'AI', icon: WandSparkles },
  { key: 'ai-image', name: 'AI Image', icon: Image },
  { key: 'figma', name: 'Figma', icon: Palette },
  { key: 'pwa', name: 'PWA', icon: Smartphone },
]

type ClassesSubTab = 'classes' | 'pimcore' | 'file'

const CLASSES_SUB_KEY = 'whoobe:settings-classes-subtab'
const classesActiveTab = ref<ClassesSubTab>('classes')

// Restore last active tab from localStorage
try {
  const saved = localStorage.getItem(CLASSES_SUB_KEY) as ClassesSubTab | null
  if (saved) classesActiveTab.value = saved
} catch { /* ignore */ }

const classesSubTabs: { key: ClassesSubTab; name: string; icon: any }[] = [
  { key: 'classes', name: 'Classes', icon: Database },
  { key: 'pimcore', name: 'PIMCORE MIGRATION SOURCE', icon: Upload },
  { key: 'file', name: 'FILE MIGRATION', icon: FileJson },
]

function setClassesSubTab(key: ClassesSubTab) {
  classesActiveTab.value = key
  try { localStorage.setItem(CLASSES_SUB_KEY, key) } catch { /* ignore */ }
}

const ROLES_SUB_KEY = 'whoobe:settings-roles-subtab'
type RolesSubTab = 'users' | 'roles'
const rolesActiveTab = ref<RolesSubTab>('users')
try {
  const saved = localStorage.getItem(ROLES_SUB_KEY) as RolesSubTab | null
  if (saved) rolesActiveTab.value = saved
} catch { /* ignore */ }

const rolesSubTabs: { key: RolesSubTab; name: string; icon: any }[] = [
  { key: 'users', name: 'Users', icon: UserRound },
  { key: 'roles', name: 'Roles', icon: KeyRound },
]

function setRolesSubTab(key: RolesSubTab) {
  rolesActiveTab.value = key
  try { localStorage.setItem(ROLES_SUB_KEY, key) } catch { /* ignore */ }
}

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
  classes: { title: 'Data Object Classes', description: 'Define classes and fields, and import them on demand from Pimcore or structured files.' },
  roles: { title: 'Roles / Users / Workspaces', description: 'Manage who can access this dashboard and what they can do.' },
  security: { title: 'Security', description: 'Two-factor authentication and account security.' },
  workflows: { title: 'Workflows', description: 'Author publish/review workflows for Data Object classes.' },
  ai: { title: 'AI Agent', description: 'LLM provider used by the AI page and snippet generator in the Whoobe One composer.' },
  'ai-image': { title: 'AI Image Generation', description: 'Dedicated AI provider for image generation, or leave blank to use your text AI configuration.' },
  figma: { title: 'Figma Integration', description: 'Figma Personal Access Token configuration for importing designs into the Whoobe One editor.' },
  pwa: { title: 'PWA / Mobile App', description: 'Configure Progressive Web App settings, push notification providers, and manifest options per website.' },
}

const sectionTitle = computed(() => sectionTitles[activeSubSection.value].title)
const sectionDescription = computed(() => sectionTitles[activeSubSection.value].description)
</script>