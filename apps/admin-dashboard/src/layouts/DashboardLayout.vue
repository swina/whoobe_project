<template>
  <div class="flex h-screen bg-slate-950 light:bg-slate-50 text-slate-100 light:text-slate-900 overflow-hidden">
    <!-- Sidebar -->
    <aside
      :class="[
        'flex flex-col border-r border-slate-800 light:border-slate-200 bg-slate-900/80 light:bg-white/80 backdrop-blur-md transition-all duration-300 z-30',
        isSidebarCollapsed ? 'w-20' : 'w-64'
      ]"
    >
      <!-- Sidebar Header -->
      <div class="flex items-center justify-between h-16 px-4 border-b border-slate-800 light:border-slate-200">
        <div class="flex items-center space-x-3 overflow-hidden">
          <div class="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white font-bold shadow-lg shadow-indigo-500/20 shrink-0">
            <Layers class="w-5 h-5" />
          </div>
          <span v-if="!isSidebarCollapsed" class="font-bold text-lg tracking-tight bg-gradient-to-r from-white to-slate-400 light:from-slate-900 light:to-slate-600 bg-clip-text text-transparent truncate">
            Whoobe
          </span>
        </div>
        <button
          @click="isSidebarCollapsed = !isSidebarCollapsed"
          class="p-1.5 rounded-lg text-slate-400 light:text-slate-600 hover:text-white hover:bg-slate-800/60 light:bg-slate-100/60 transition"
          :title="isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'"
        >
          <ChevronLeft v-if="!isSidebarCollapsed" class="w-5 h-5" />
          <ChevronRight v-else class="w-5 h-5" />
        </button>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto">
        <div v-for="item in navItems" :key="item.section" class="space-y-1">
          <button
            @click="tabsStore.openSection(item.section)"
            :class="[
              'w-full flex items-center px-3 py-2.5 rounded-xl font-medium transition-all group relative text-left',
              isSectionActive(item.section)
                ? 'bg-gradient-to-r from-indigo-600/90 to-violet-600/90 text-white shadow-md shadow-indigo-500/10'
                : 'text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 hover:bg-slate-800/50 light:bg-slate-100/50'
            ]"
          >
            <component :is="item.icon" class="w-5 h-5 shrink-0 transition-transform group-hover:scale-110" />
            <span v-if="!isSidebarCollapsed" class="ml-3 text-sm truncate flex-1">{{ item.name }}</span>

            <!-- Expand/Collapse Assets Tree Toggle -->
            <button
              v-if="item.section === 'assets' && !isSidebarCollapsed"
              @click.stop="isAssetsTreeExpanded = !isAssetsTreeExpanded"
              class="p-1 rounded text-slate-400 light:text-slate-600 hover:text-white hover:bg-slate-700/60 light:bg-slate-200/60 transition ml-1 shrink-0"
              title="Toggle Folders Tree"
            >
              <ChevronDown v-if="isAssetsTreeExpanded" class="w-4 h-4 text-indigo-400" />
              <ChevronRight v-else class="w-4 h-4 text-slate-500" />
            </button>

            <!-- Expand/Collapse Settings Submenu Toggle -->
            <button
              v-if="item.section === 'settings' && !isSidebarCollapsed"
              @click.stop="isSettingsMenuExpanded = !isSettingsMenuExpanded"
              class="p-1 rounded text-slate-400 light:text-slate-600 hover:text-white hover:bg-slate-700/60 light:bg-slate-200/60 transition ml-1 shrink-0"
              title="Toggle Settings Menu"
            >
              <ChevronDown v-if="isSettingsMenuExpanded" class="w-4 h-4 text-indigo-400" />
              <ChevronRight v-else class="w-4 h-4 text-slate-500" />
            </button>

            <!-- Tooltip on collapsed state -->
            <div
              v-if="isSidebarCollapsed"
              class="absolute left-full ml-2 px-2.5 py-1 bg-slate-800 light:bg-slate-100 text-slate-200 light:text-slate-800 text-xs font-semibold rounded-md opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-50 border border-slate-700 light:border-slate-300 shadow-xl"
            >
              {{ item.name }}
            </div>
          </button>

          <!-- Sidebar DAM Folders Tree -->
          <div
            v-if="item.section === 'assets' && isAssetsTreeExpanded && !isSidebarCollapsed"
            class="ml-3 pl-2.5 border-l border-slate-800/80 light:border-slate-200/80 space-y-1 py-1"
          >
            <!-- Root Folder Node -->
            <div
              @click="handleSelectSidebarFolder('/')"
              :class="[
                'flex items-center px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition select-none group',
                damStore.currentFolderPath === '/'
                  ? 'bg-indigo-600/30 text-indigo-200 light:text-indigo-700 border border-indigo-500/40 font-bold shadow-sm'
                  : 'text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 hover:bg-slate-800/40 light:bg-slate-100/40'
              ]"
            >
              <Folder class="w-3.5 h-3.5 mr-1.5 text-indigo-400 shrink-0" />
              <span class="truncate flex-1">/ (Root)</span>
            </div>

            <!-- Root Subfolders Tree Nodes -->
            <SidebarFolderNode
              v-for="subfolder in rootSubfolders"
              :key="subfolder.path"
              :folder="subfolder"
              :all-folders="damStore.folders"
              :current-path="damStore.currentFolderPath"
              @select="handleSelectSidebarFolder"
            />
          </div>

          <!-- Settings Submenu - docs/plans/UI/settings-ui-plan.md -->
          <div
            v-if="item.section === 'settings' && isSettingsMenuExpanded && !isSidebarCollapsed"
            class="ml-3 pl-2.5 border-l border-slate-800/80 light:border-slate-200/80 space-y-1 py-1"
          >
            <button
              v-for="sub in settingsSubItems" :key="sub.key"
              @click="tabsStore.openSettingsSubSection(sub.key)"
              :class="[
                'w-full flex items-center px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition select-none text-left',
                isSettingsSubSectionActive(sub.key)
                  ? 'bg-indigo-600/30 text-indigo-200 light:text-indigo-700 border border-indigo-500/40 font-bold shadow-sm'
                  : 'text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 hover:bg-slate-800/40 light:bg-slate-100/40'
              ]"
            >
              <component :is="sub.icon" class="w-3.5 h-3.5 mr-1.5 shrink-0" />
              <span class="truncate flex-1">{{ sub.name }}</span>
            </button>
          </div>
        </div>
      </nav>

      <!-- Sidebar Footer / System Health Indicator -->
      <div class="p-3 border-t border-slate-800 light:border-slate-200">
        <div
          :class="[
            'flex items-center p-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs font-medium',
            isSidebarCollapsed ? 'justify-center' : 'space-x-3'
          ]"
        >
          <span class="relative flex h-2.5 w-2.5 shrink-0">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <div v-if="!isSidebarCollapsed" class="flex-1 truncate">
            <div class="font-semibold text-emerald-300">System Online</div>
            <div class="text-[10px] text-slate-400 light:text-slate-600 truncate">v1.0.0 • Connected</div>
          </div>
        </div>
      </div>
    </aside>

    <!-- Main Content Area -->
    <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
      <!-- Top Header -->
      <header class="flex items-center justify-between h-16 px-6 bg-slate-900/60 light:bg-white/60 backdrop-blur-md border-b border-slate-800 light:border-slate-200 z-20 shrink-0">
        <!-- Page Title & Search -->
        <div class="flex items-center space-x-6 flex-1 max-w-3xl">
          <h1 class="text-lg font-semibold text-slate-100 light:text-slate-900 truncate hidden md:block">
            {{ currentTabTitle }}
          </h1>
          <div class="relative w-full max-w-md">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search objects, assets, documents..."
              class="w-full pl-9 pr-4 py-1.5 text-sm bg-slate-950/60 light:bg-white/60 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 placeholder-slate-500 light:placeholder-slate-400 focus:outline-none focus:border-indigo-500/80 focus:ring-1 focus:ring-indigo-500/80 transition"
            />
          </div>
        </div>

        <!-- Right Header Actions -->
        <div class="flex items-center space-x-4">
          <!-- Toast Notification -->
          <div v-if="toastStore.message" class="px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2 animate-fade-in">
            <Check class="w-3.5 h-3.5" />
            <span>{{ toastStore.message }}</span>
          </div>

          <!-- Theme toggle - dashboard-only light/dark switch -->
          <button
            @click="themeStore.toggleTheme()"
            class="p-2 rounded-lg text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 hover:bg-slate-800/60 light:bg-slate-100/60 transition"
            :title="themeStore.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
          >
            <Sun v-if="themeStore.theme === 'dark'" class="w-5 h-5" />
            <Moon v-else class="w-5 h-5" />
          </button>

          <!-- Notification Bell -->
          <button class="relative p-2 rounded-lg text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 hover:bg-slate-800/60 light:bg-slate-100/60 transition">
            <Bell class="w-5 h-5" />
            <span class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-slate-900 light:ring-white"></span>
          </button>

          <div class="h-6 w-px bg-slate-800 light:bg-slate-100"></div>

          <!-- User Menu -->
          <div class="flex items-center space-x-3 group">
            <div class="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 p-0.5 shadow-md shrink-0">
              <div class="w-full h-full rounded-full bg-slate-900 light:bg-white flex items-center justify-center font-bold text-xs text-indigo-300">
                {{ userInitials }}
              </div>
            </div>
            <div class="hidden sm:block text-left truncate">
              <div class="text-sm font-medium text-slate-200 light:text-slate-800 truncate">{{ authStore.currentUser?.displayName }}</div>
              <div class="text-xs text-slate-500 truncate">{{ authStore.currentUser?.email }}</div>
            </div>
            <button
              @click="handleLogout"
              class="p-2 rounded-lg text-slate-400 light:text-slate-600 hover:text-rose-400 hover:bg-slate-800/60 light:bg-slate-100/60 transition shrink-0"
              title="Log out"
            >
              <LogOut class="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <!-- Main Tab Strip: one tab per open section + one per opened master item (asset) -->
      <div class="flex items-center gap-1 px-4 pt-2 overflow-x-auto bg-slate-950/60 light:bg-white/60 border-b border-slate-800 light:border-slate-200 shrink-0">
        <div
          v-for="tab in tabsStore.tabs"
          :key="tab.id"
          @click="tabsStore.activeTabId = tab.id"
          :class="[
            'group flex items-center gap-1.5 pl-3 pr-2 py-2 text-xs font-semibold rounded-t-lg border border-b-0 light:border-slate-300 transition shrink-0 cursor-pointer',
            tabsStore.activeTabId === tab.id ? 'bg-slate-900 light:bg-violet-500 text-indigo-300 light:text-white border-slate-800 light:border-slate-200' : 'bg-slate-950/60 light:bg-white/60 text-slate-500 hover:text-slate-600 light:text-slate-700 border-transparent'
          ]"
        >
          <component :is="tabIcon(tab)" class="w-3.5 h-3.5 shrink-0" />
          <span class="truncate max-w-[160px]">{{ tabLabel(tab) }}</span>
          <button
            @click.stop="tabsStore.closeTab(tab.id)"
            class="opacity-50 group-hover:opacity-100 hover:text-rose-400 transition p-0.5 rounded leading-none"
            title="Close tab"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Main Content View: all open tabs stay mounted (v-show) so switching preserves state.
           Each tab manages its own scrolling: section views scroll as a whole page, while
           MasterAssetTab keeps its sub-tab nav fixed and scrolls only its sub-tab content. -->
      <main class="flex-1 min-h-0 overflow-hidden bg-slate-950 light:bg-slate-50">
        <template v-for="tab in tabsStore.tabs" :key="tab.id">
          <div v-show="tabsStore.activeTabId === tab.id" class="h-full">
            <div v-if="tab.type === 'section' && tab.section" class="h-full overflow-y-auto p-6">
              <component :is="sectionComponent(tab.section)" />
            </div>
            <MasterAssetTab v-else-if="tab.type === 'item' && tab.itemKind === 'asset' && tab.itemId" :asset-id="tab.itemId" />
            <MasterDocumentTab v-else-if="tab.type === 'item' && tab.itemKind === 'document' && tab.itemId" :document-id="tab.itemId" />
            <MasterPageTab v-else-if="tab.type === 'item' && tab.itemKind === 'page' && tab.itemId" :page-id="tab.itemId" />
            <MasterObjectTab
              v-else-if="tab.type === 'item' && tab.itemKind === 'object' && tab.itemId && tab.objectClassId"
              :translation-group-id="tab.itemId"
              :class-id="tab.objectClassId"
            />
            <MasterClassTab v-else-if="tab.type === 'item' && tab.itemKind === 'class' && tab.itemId" :class-id="tab.itemId" />
            <MasterWebsiteTab v-else-if="tab.type === 'item' && tab.itemKind === 'website' && tab.itemId" :website-id="tab.itemId" />
          </div>
        </template>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  Layers,
  LayoutDashboard,
  Database,
  FolderArchive,
  FileText,
  FileStack,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Folder,
  Search,
  Bell,
  Check,
  LogOut,
  Sliders,
  HardDrive,
  Users,
  Shield,
  Workflow,
  Sun,
  Moon,
  Blocks,
  Globe,
  Table2,
  Mail,
  Sparkles
} from '@lucide/vue'
import { useDamStore } from '../stores/damStore'
import { useDocumentsStore } from '../stores/documentsStore'
import { useDataClassesStore } from '../stores/dataClassesStore'
import { useThemeStore } from '../stores/themeStore'
import { useTabsStore, sectionTabId, SectionKind, MainTab, SettingsSubSection } from '../stores/tabsStore'
import { useToastStore } from '../stores/toastStore'
import { useAuthStore } from '../stores/authStore'
import { getIconForFileType } from '../utils/asset-file-icons'
import SidebarFolderNode from '../components/dam/SidebarFolderNode.vue'
import MasterAssetTab from '../components/dam/MasterAssetTab.vue'
import MasterDocumentTab from '../components/documents/MasterDocumentTab.vue'
import MasterPageTab from '../components/pages/MasterPageTab.vue'
import MasterObjectTab from '../components/objects/MasterObjectTab.vue'
import MasterClassTab from '../components/objects/MasterClassTab.vue'
import MasterWebsiteTab from '../components/websites/MasterWebsiteTab.vue'
import OverviewView from '../views/OverviewView.vue'
import WebsitesView from '../views/WebsitesView.vue'
import ObjectsView from '../views/ObjectsView.vue'
import AssetsView from '../views/AssetsView.vue'
import DocumentsView from '../views/DocumentsView.vue'
import PagesView from '../views/PagesView.vue'
import SettingsView from '../views/SettingsView.vue'
import { usePagesStore } from '../stores/pagesStore'
import { useWebsitesStore } from '../stores/websitesStore'

const damStore = useDamStore()
const documentsStore = useDocumentsStore()
const pagesStore = usePagesStore()
const websitesStore = useWebsitesStore()
const dataClassesStore = useDataClassesStore()
const tabsStore = useTabsStore()
const toastStore = useToastStore()
const authStore = useAuthStore()
const themeStore = useThemeStore()

const userInitials = computed(() => {
  const name = authStore.currentUser?.displayName?.trim()
  if (!name) return '?'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
})

function handleLogout() {
  authStore.logout()
}

const isSidebarCollapsed = ref(false)
const isAssetsTreeExpanded = ref(true)
const isSettingsMenuExpanded = ref(true)

const settingsSubItems: { key: SettingsSubSection; name: string; icon: any }[] = [
  { key: 'general', name: 'General settings', icon: Sliders },
  { key: 'dam', name: 'DAM configuration', icon: HardDrive },
  { key: 'classes', name: 'Data Object classes', icon: Database },
  { key: 'components', name: 'Components', icon: Blocks },
  { key: 'roles', name: 'Roles/Users/Workspaces', icon: Users },
  { key: 'security', name: 'Security', icon: Shield },
  { key: 'workflows', name: 'Workflows', icon: Workflow },
  { key: 'mail', name: 'Outgoing mail', icon: Mail },
  { key: 'ai', name: 'AI agent', icon: Sparkles },
]

const settingsSubLabels: Record<SettingsSubSection, string> = {
  general: 'General settings',
  dam: 'DAM configuration',
  classes: 'Data Object classes',
  components: 'Components',
  roles: 'Roles/Users/Workspaces',
  security: 'Security',
  workflows: 'Workflows',
  mail: 'Outgoing mail',
  ai: 'AI agent',
}

function isSettingsSubSectionActive(key: SettingsSubSection): boolean {
  const tab = tabsStore.tabs.find((t) => t.id === sectionTabId('settings'))
  return isSectionActive('settings') && (tab?.settingsSubSection ?? 'general') === key
}

const navItems: { name: string; section: SectionKind; icon: any }[] = [
  { name: 'Overview', section: 'overview', icon: LayoutDashboard },
  { name: 'Websites', section: 'websites', icon: Globe },
  { name: 'Pages', section: 'pages', icon: FileStack },
  { name: 'Assets', section: 'assets', icon: FolderArchive },
  { name: 'Data Objects', section: 'objects', icon: Database },
  { name: 'Documents', section: 'documents', icon: FileText },
  { name: 'Settings', section: 'settings', icon: Settings }
]

const sectionComponents: Record<SectionKind, any> = {
  overview: OverviewView,
  websites: WebsitesView,
  objects: ObjectsView,
  assets: AssetsView,
  documents: DocumentsView,
  pages: PagesView,
  settings: SettingsView
}

const sectionLabels: Record<SectionKind, string> = {
  overview: 'Overview',
  websites: 'Websites',
  objects: 'Data Objects',
  assets: 'Assets',
  documents: 'Documents',
  pages: 'Pages',
  settings: 'Settings'
}

const sectionIcons: Record<SectionKind, any> = {
  overview: LayoutDashboard,
  websites: Globe,
  objects: Database,
  assets: FolderArchive,
  documents: FileText,
  pages: FileStack,
  settings: Settings
}

function sectionComponent(section: SectionKind) {
  return sectionComponents[section]
}

function isSectionActive(section: SectionKind): boolean {
  return tabsStore.activeTabId === sectionTabId(section)
}

function tabLabel(tab: MainTab): string {
  if (tab.type === 'section' && tab.section) {
    if (tab.section === 'assets') {
      const path = damStore.currentFolderPath
      if (path === '/') return 'Assets'
      return path.split('/').filter(Boolean).pop() || 'Assets'
    }
    if (tab.section === 'settings' && tab.settingsSubSection) {
      return `Settings ‣ ${settingsSubLabels[tab.settingsSubSection]}`
    }
    return sectionLabels[tab.section]
  }
  if (tab.type === 'item' && tab.itemKind === 'asset' && tab.itemId) {
    const asset = damStore.assets.find((a) => a.id === tab.itemId)
    return asset?.filename || 'Asset'
  }
  if (tab.type === 'item' && tab.itemKind === 'document' && tab.itemId) {
    const document = documentsStore.documents.find((d) => d.id === tab.itemId)
    return document?.title || 'Document'
  }
  if (tab.type === 'item' && tab.itemKind === 'page' && tab.itemId) {
    const page = pagesStore.pages.find((p) => p.id === tab.itemId)
    return page?.title || 'Page'
  }
  if (tab.type === 'item' && tab.itemKind === 'object') {
    return tab.label || 'New Object'
  }
  if (tab.type === 'item' && tab.itemKind === 'class') {
    // Existing classes are looked up live from the shared store (like
    // asset/document/page above) so a save's label change reflects
    // immediately; a brand-new class's placeholder id (`new:<uuid>`,
    // tabsStore.ts's openClass()) never matches a real class, so it falls
    // through to MasterClassTab.vue's own setTabLabel() call instead -
    // same fallback shape as the 'object' branch above, for the same
    // "not in any shared list yet" reason (tabsStore.ts's own comment on
    // MainTab.label).
    const dataClass = dataClassesStore.classes.find((c) => c.id === tab.itemId)
    return dataClass?.label ?? tab.label ?? 'New Class'
  }
  if (tab.type === 'item' && tab.itemKind === 'website' && tab.itemId) {
    const website = websitesStore.websites.find((w) => w.id === tab.itemId)
    return website?.name || 'Website'
  }
  return 'Untitled'
}

function tabIcon(tab: MainTab) {
  if (tab.type === 'section' && tab.section) {
    return sectionIcons[tab.section]
  }
  if (tab.type === 'item' && tab.itemKind === 'asset' && tab.itemId) {
    const asset = damStore.assets.find((a) => a.id === tab.itemId)
    return asset ? getIconForFileType(asset.fileType) : FileText
  }
  if (tab.type === 'item' && tab.itemKind === 'page' && tab.itemId) {
    return FileStack
  }
  if (tab.type === 'item' && tab.itemKind === 'object') {
    return Database
  }
  if (tab.type === 'item' && tab.itemKind === 'class') {
    return Table2
  }
  if (tab.type === 'item' && tab.itemKind === 'website') {
    return Globe
  }
  return FileText
}

const currentTabTitle = computed(() => {
  const tab = tabsStore.tabs.find((t) => t.id === tabsStore.activeTabId)
  return tab ? tabLabel(tab) : 'Dashboard'
})

const rootSubfolders = computed(() => {
  return damStore.folders.filter((f) => f.parentPath === '/')
})

function handleSelectSidebarFolder(path: string) {
  damStore.currentFolderPath = path
  tabsStore.openSection('assets')
}

// Mirrors WhoobeOneEmbed.vue's own identically-named helper - duplicated,
// not extracted (see PagePreviewTab.vue's matching comment on why).
function getDefaultWhoobeOneSpikeUrl(): string {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:3006`
  }
  return 'http://localhost:3006'
}

// Receiving end of a list-to-detail link clicked inside an embedded
// whoobe-one-spike editor's own Preview (BlockContainerPreview.vue's
// onDynamicLinkClick) - opens/focuses the target page's own tab directly
// on its Preview sub-tab, targeted at that one resolved record, instead of
// the link opening a real new browser tab. Registered ONCE here (not
// inside WhoobeOneEmbed.vue, which mounts one instance per open page-
// editor tab and would otherwise fire this handler once per open tab for
// every single message). Origin-checked against the exact same
// whoobe-one-spike origin every embedded iframe is already built from.
function onWindowMessage(event: MessageEvent) {
  if (event.origin !== new URL(getDefaultWhoobeOneSpikeUrl()).origin) return
  if (event.data?.type !== 'whoobe-one:open-page-preview') return
  const { pageId, path, locale } = event.data
  if (typeof pageId === 'string' && typeof path === 'string' && typeof locale === 'string') {
    tabsStore.openPagePreview(pageId, path, locale)
  }
}

onMounted(() => {
  websitesStore.refreshWebsites()
  window.addEventListener('message', onWindowMessage)
})

onUnmounted(() => {
  window.removeEventListener('message', onWindowMessage)
})
</script>
