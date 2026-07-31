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
        <div v-for="item in navItems" :key="item.name" class="space-y-1">
          <router-link
            :to="item.path"
            :class="[
              'flex items-center px-3 py-2.5 rounded-xl font-medium transition-all group relative',
              $route.path === item.path
                ? 'bg-gradient-to-r from-indigo-600/90 to-violet-600/90 text-white shadow-md shadow-indigo-500/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            ]"
          >
            <component :is="item.icon" class="w-5 h-5 shrink-0 transition-transform group-hover:scale-110" />
            <span v-if="!isSidebarCollapsed" class="ml-3 text-sm truncate flex-1">{{ item.name }}</span>

            <!-- Expand/Collapse Assets Tree Toggle -->
            <button
              v-if="item.name === 'Assets' && !isSidebarCollapsed"
              @click.prevent.stop="isAssetsTreeExpanded = !isAssetsTreeExpanded"
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
          </router-link>

          <!-- Sidebar DAM Folders Tree -->
          <div
            v-if="item.name === 'Assets' && isAssetsTreeExpanded && !isSidebarCollapsed"
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
      <header class="flex items-center justify-between h-16 px-6 bg-slate-900/60 backdrop-blur-md border-b border-slate-800 z-20">
        <!-- Page Title & Search -->
        <div class="flex items-center space-x-6 flex-1 max-w-xl">
          <h1 class="text-lg font-semibold text-slate-100 truncate hidden md:block">
            {{ currentRouteTitle }}
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
          <!-- Notification Bell -->
          <button class="relative p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition">
            <Bell class="w-5 h-5" />
            <span class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-slate-900"></span>
          </button>

          <div class="h-6 w-px bg-slate-800"></div>

          <!-- User Menu -->
          <div class="flex items-center space-x-3 cursor-pointer group">
            <div class="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 p-0.5 shadow-md">
              <div class="w-full h-full rounded-full bg-slate-900 flex items-center justify-center font-bold text-xs text-indigo-300">
                AD
              </div>
            </div>
            <div class="hidden sm:block text-left">
              <div class="text-sm font-medium text-slate-200 group-hover:text-white transition">Admin User</div>
              <div class="text-xs text-slate-500">Super Administrator</div>
            </div>
          </div>
        </div>
      </header>

      <!-- Main Content View -->
      <main class="flex-1 overflow-y-auto p-6 bg-slate-950">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Layers,
  LayoutDashboard,
  Database,
  FolderArchive,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Folder,
  Search,
  Bell
} from '@lucide/vue'
import { useDamStore } from '../stores/damStore'
import SidebarFolderNode from '../components/SidebarFolderNode.vue'

const route = useRoute()
const router = useRouter()
const damStore = useDamStore()

const isSidebarCollapsed = ref(false)
const isAssetsTreeExpanded = ref(true)

const navItems = [
  { name: 'Overview', path: '/', icon: LayoutDashboard },
  { name: 'Data Objects', path: '/objects', icon: Database },
  { name: 'Assets', path: '/assets', icon: FolderArchive },
  { name: 'Documents', path: '/documents', icon: FileText },
  { name: 'Settings', path: '/settings', icon: Settings }
]

const currentRouteTitle = computed(() => {
  return (route.meta.title as string) || 'Dashboard'
})

const rootSubfolders = computed(() => {
  return damStore.folders.filter((f) => f.parentPath === '/')
})

function handleSelectSidebarFolder(path: string) {
  damStore.currentFolderPath = path
  if (route.path !== '/assets') {
    router.push('/assets')
  }
}
</script>
