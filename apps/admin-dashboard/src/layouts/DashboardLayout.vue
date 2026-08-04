<template>
  <div class="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
    <!-- Sidebar -->
    <aside
      :class="[
        'flex flex-col border-r border-slate-800 bg-slate-900/80 backdrop-blur-md transition-all duration-300 z-30',
        isSidebarCollapsed ? 'w-20' : 'w-64'
      ]"
    >
      <!-- Sidebar Header -->
      <div class="flex items-center justify-between h-16 px-4 border-b border-slate-800">
        <div class="flex items-center space-x-3 overflow-hidden">
          <div class="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white font-bold shadow-lg shadow-indigo-500/20 shrink-0">
            <Layers class="w-5 h-5" />
          </div>
          <span v-if="!isSidebarCollapsed" class="font-bold text-lg tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent truncate">
            Whoobe CMS
          </span>
        </div>
        <button
          @click="isSidebarCollapsed = !isSidebarCollapsed"
          class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition"
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
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            ]"
          >
            <component :is="item.icon" class="w-5 h-5 shrink-0 transition-transform group-hover:scale-110" />
            <span v-if="!isSidebarCollapsed" class="ml-3 text-sm truncate flex-1">{{ item.name }}</span>

            <!-- Expand/Collapse Assets Tree Toggle -->
            <button
              v-if="item.section === 'assets' && !isSidebarCollapsed"
              @click.stop="isAssetsTreeExpanded = !isAssetsTreeExpanded"
              class="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700/60 transition ml-1 shrink-0"
              title="Toggle Folders Tree"
            >
              <ChevronDown v-if="isAssetsTreeExpanded" class="w-4 h-4 text-indigo-400" />
              <ChevronRight v-else class="w-4 h-4 text-slate-500" />
            </button>

            <!-- Tooltip on collapsed state -->
            <div
              v-if="isSidebarCollapsed"
              class="absolute left-full ml-2 px-2.5 py-1 bg-slate-800 text-slate-200 text-xs font-semibold rounded-md opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-50 border border-slate-700 shadow-xl"
            >
              {{ item.name }}
            </div>
          </button>

          <!-- Sidebar DAM Folders Tree -->
          <div
            v-if="item.section === 'assets' && isAssetsTreeExpanded && !isSidebarCollapsed"
            class="ml-3 pl-2.5 border-l border-slate-800/80 space-y-1 py-1"
          >
            <!-- Root Folder Node -->
            <div
              @click="handleSelectSidebarFolder('/')"
              :class="[
                'flex items-center px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition select-none group',
                damStore.currentFolderPath === '/'
                  ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-500/40 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
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
        </div>
      </nav>

      <!-- Sidebar Footer / System Health Indicator -->
      <div class="p-3 border-t border-slate-800">
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
            <div class="text-[10px] text-slate-400 truncate">v1.0.0 • Connected</div>
          </div>
        </div>
      </div>
    </aside>

    <!-- Main Content Area -->
    <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
      <!-- Top Header -->
      <header class="flex items-center justify-between h-16 px-6 bg-slate-900/60 backdrop-blur-md border-b border-slate-800 z-20 shrink-0">
        <!-- Page Title & Search -->
        <div class="flex items-center space-x-6 flex-1 max-w-xl">
          <h1 class="text-lg font-semibold text-slate-100 truncate hidden md:block">
            {{ currentTabTitle }}
          </h1>
          <div class="relative w-full max-w-md">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search objects, assets, documents..."
              class="w-full pl-9 pr-4 py-1.5 text-sm bg-slate-950/60 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/80 focus:ring-1 focus:ring-indigo-500/80 transition"
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

          <!-- Notification Bell -->
          <button class="relative p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition">
            <Bell class="w-5 h-5" />
            <span class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-slate-900"></span>
          </button>

          <div class="h-6 w-px bg-slate-800"></div>

          <!-- User Menu -->
          <div class="flex items-center space-x-3 group">
            <div class="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 p-0.5 shadow-md shrink-0">
              <div class="w-full h-full rounded-full bg-slate-900 flex items-center justify-center font-bold text-xs text-indigo-300">
                {{ userInitials }}
              </div>
            </div>
            <div class="hidden sm:block text-left truncate">
              <div class="text-sm font-medium text-slate-200 truncate">{{ authStore.currentUser?.displayName }}</div>
              <div class="text-xs text-slate-500 truncate">{{ authStore.currentUser?.email }}</div>
            </div>
            <button
              @click="handleLogout"
              class="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800/60 transition shrink-0"
              title="Log out"
            >
              <LogOut class="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <!-- Main Tab Strip: one tab per open section + one per opened master item (asset) -->
      <div class="flex items-center gap-1 px-4 pt-2 overflow-x-auto bg-slate-950/60 border-b border-slate-800 shrink-0">
        <div
          v-for="tab in tabsStore.tabs"
          :key="tab.id"
          @click="tabsStore.activeTabId = tab.id"
          :class="[
            'group flex items-center gap-1.5 pl-3 pr-2 py-2 text-xs font-semibold rounded-t-xl border border-b-0 transition shrink-0 cursor-pointer',
            tabsStore.activeTabId === tab.id ? 'bg-slate-900 text-indigo-300 border-slate-800' : 'bg-slate-950/60 text-slate-500 hover:text-slate-300 border-transparent'
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
      <main class="flex-1 min-h-0 overflow-hidden bg-slate-950">
        <template v-for="tab in tabsStore.tabs" :key="tab.id">
          <div v-show="tabsStore.activeTabId === tab.id" class="h-full">
            <div v-if="tab.type === 'section' && tab.section" class="h-full overflow-y-auto p-6">
              <component :is="sectionComponent(tab.section)" />
            </div>
            <MasterAssetTab v-else-if="tab.type === 'item' && tab.itemKind === 'asset' && tab.itemId" :asset-id="tab.itemId" />
            <MasterDocumentTab v-else-if="tab.type === 'item' && tab.itemKind === 'document' && tab.itemId" :document-id="tab.itemId" />
            <MasterPageTab v-else-if="tab.type === 'item' && tab.itemKind === 'page' && tab.itemId" :page-id="tab.itemId" />
          </div>
        </template>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
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
  LogOut
} from '@lucide/vue'
import { useDamStore } from '../stores/damStore'
import { useDocumentsStore } from '../stores/documentsStore'
import { useTabsStore, sectionTabId, SectionKind, MainTab } from '../stores/tabsStore'
import { useToastStore } from '../stores/toastStore'
import { useAuthStore } from '../stores/authStore'
import { getIconForFileType } from '../utils/asset-file-icons'
import SidebarFolderNode from '../components/dam/SidebarFolderNode.vue'
import MasterAssetTab from '../components/dam/MasterAssetTab.vue'
import MasterDocumentTab from '../components/documents/MasterDocumentTab.vue'
import MasterPageTab from '../components/pages/MasterPageTab.vue'
import OverviewView from '../views/OverviewView.vue'
import ObjectsView from '../views/ObjectsView.vue'
import AssetsView from '../views/AssetsView.vue'
import DocumentsView from '../views/DocumentsView.vue'
import PagesView from '../views/PagesView.vue'
import SettingsView from '../views/SettingsView.vue'
import { usePagesStore } from '../stores/pagesStore'

const damStore = useDamStore()
const documentsStore = useDocumentsStore()
const pagesStore = usePagesStore()
const tabsStore = useTabsStore()
const toastStore = useToastStore()
const authStore = useAuthStore()

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

const navItems: { name: string; section: SectionKind; icon: any }[] = [
  { name: 'Overview', section: 'overview', icon: LayoutDashboard },
  { name: 'Data Objects', section: 'objects', icon: Database },
  { name: 'Assets', section: 'assets', icon: FolderArchive },
  { name: 'Documents', section: 'documents', icon: FileText },
  { name: 'Pages', section: 'pages', icon: FileStack },
  { name: 'Settings', section: 'settings', icon: Settings }
]

const sectionComponents: Record<SectionKind, any> = {
  overview: OverviewView,
  objects: ObjectsView,
  assets: AssetsView,
  documents: DocumentsView,
  pages: PagesView,
  settings: SettingsView
}

const sectionLabels: Record<SectionKind, string> = {
  overview: 'Overview',
  objects: 'Data Objects',
  assets: 'Assets',
  documents: 'Documents',
  pages: 'Pages',
  settings: 'Settings'
}

const sectionIcons: Record<SectionKind, any> = {
  overview: LayoutDashboard,
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
</script>
