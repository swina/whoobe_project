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
            WhooBe
          </span>
        </div>
        <button
          @click="isSidebarCollapsed = !isSidebarCollapsed"
          :class="isSidebarCollapsed ? 'absolute bg-transparent right-0 p-0':'p-1.5 rounded-lg text-slate-400 light:text-slate-600 transition'"
          :title="isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'"
        >
          <ChevronLeft v-if="!isSidebarCollapsed" class="w-5 h-5" />
          <ChevronRight v-else class="w-5 h-5" />
        </button>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto">
        <!-- Nav layout toggle: flat list vs grouped-by-category. Hidden
             (and forced flat, see navRows) while the sidebar is collapsed,
             since group headers have nowhere to go in icon-only mode.
             Choice remembered per browser via localStorage. -->
        <div v-if="!isSidebarCollapsed" class="flex items-center gap-1 p-0.5 mb-2 rounded-lg bg-slate-800/50 light:bg-slate-100/70">
          <button
            @click="setNavGrouped(false)"
            :class="[
              'flex-1 py-1 rounded-md text-[11px] font-semibold transition',
              !isNavGrouped
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 light:text-slate-500 hover:text-slate-200 light:text-slate-700'
            ]"
          >
            Flat
          </button>
          <button
            @click="setNavGrouped(true)"
            :class="[
              'flex-1 py-1 rounded-md text-[11px] font-semibold transition',
              isNavGrouped
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 light:text-slate-500 hover:text-slate-200 light:text-slate-700'
            ]"
          >
            Grouped
          </button>
        </div>

        <template v-for="row in navRows" :key="row.kind === 'header' ? `group-${row.id}` : row.item.section">
          <button
            v-if="row.kind === 'header'"
            @click="toggleNavGroup(row.id)"
            class="w-full flex items-center justify-between px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 light:text-slate-400 hover:text-slate-300 light:hover:text-slate-600 select-none first:pt-1 transition-colors"
            :title="collapsedNavGroups.has(row.id) ? `Expand ${row.label}` : `Collapse ${row.label}`"
          >
            <span>{{ row.label }}</span>
            <ChevronDown v-if="!collapsedNavGroups.has(row.id)" class="w-3 h-3" />
            <ChevronRight v-else class="w-3 h-3" />
          </button>

          <div
            v-else
            class="space-y-1"
            @mouseenter="onNavItemEnter(row.item.section, $event)"
            @mouseleave="scheduleCloseNavPopover"
          >
            <button
              @click="tabsStore.openSection(row.item.section)"
              @focus="onNavItemEnter(row.item.section, $event)"
              @keydown.esc="closeNavPopover"
              :aria-haspopup="isSidebarCollapsed && hasNavChildren(row.item.section) ? 'menu' : undefined"
              :data-testid="`nav-item-${row.item.section}`"
              :title="row.item.name"
              :class="[
                'w-full text-[10px] flex items-center px-3 py-2 rounded-xl font-medium transition-all group relative text-left',
                isSectionActive(row.item.section)
                  ? 'bg-gradient-to-r from-indigo-600/90 to-violet-600/90 text-white shadow-md shadow-indigo-500/10'
                  : 'text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 hover:bg-slate-800/50 light:bg-slate-100/50'
              ]"
            >
              <component :is="row.item.icon" class="w-5 h-5 shrink-0 transition-transform group-hover:scale-110" />
              <span v-if="!isSidebarCollapsed" class="ml-3 text-xs truncate flex-1">{{ row.item.name }}</span>

              <!-- Expand/Collapse Objects Class Tree Toggle -->
              <button
                v-if="row.item.section === 'objects' && !isSidebarCollapsed"
                @click.stop="isObjectsTreeExpanded = !isObjectsTreeExpanded"
                class="p-1 rounded text-slate-400 light:text-slate-600 hover:text-white hover:bg-slate-700/60 light:bg-slate-200/60 transition ml-1 shrink-0"
                title="Toggle Classes Tree"
              >
                <ChevronDown v-if="isObjectsTreeExpanded" class="w-4 h-4 text-indigo-400" />
                <ChevronRight v-else class="w-4 h-4 text-slate-500" />
              </button>

              <!-- Expand/Collapse Assets Tree Toggle -->
              <button
                v-if="row.item.section === 'assets' && !isSidebarCollapsed"
                @click.stop="isAssetsTreeExpanded = !isAssetsTreeExpanded"
                class="p-1 rounded text-slate-400 light:text-slate-600 hover:text-white hover:bg-slate-700/60 light:bg-slate-200/60 transition ml-1 shrink-0"
                title="Toggle Folders Tree"
              >
                <ChevronDown v-if="isAssetsTreeExpanded" class="w-4 h-4 text-indigo-400" />
                <ChevronRight v-else class="w-4 h-4 text-slate-500" />
              </button>

              <!-- Expand/Collapse AI Submenu Toggle -->
              <button
                v-if="row.item.section === 'ai' && !isSidebarCollapsed"
                @click.stop="isAiMenuExpanded = !isAiMenuExpanded"
                class="p-1 rounded text-slate-400 light:text-slate-600 hover:text-white hover:bg-slate-700/60 light:bg-slate-200/60 transition ml-1 shrink-0"
                title="Toggle AI Menu"
              >
                <ChevronDown v-if="isAiMenuExpanded" class="w-4 h-4 text-indigo-400" />
                <ChevronRight v-else class="w-4 h-4 text-slate-500" />
              </button>

              <!-- Expand/Collapse Settings Submenu Toggle -->
              <button
                v-if="row.item.section === 'settings' && !isSidebarCollapsed"
                @click.stop="isSettingsMenuExpanded = !isSettingsMenuExpanded"
                class="p-1 rounded text-slate-400 light:text-slate-600 hover:text-white hover:bg-slate-700/60 light:bg-slate-200/60 transition ml-1 shrink-0"
                title="Toggle Settings Menu"
              >
                <ChevronDown v-if="isSettingsMenuExpanded" class="w-4 h-4 text-indigo-400" />
                <ChevronRight v-else class="w-4 h-4 text-slate-500" />
              </button>

              <!-- Tooltip on collapsed state -->
              <div
                v-if="isSidebarCollapsed && !hasNavChildren(row.item.section)"
                class="absolute left-full ml-2 px-2.5 py-1 bg-slate-800 light:bg-slate-100 text-slate-200 light:text-slate-800 text-xs font-semibold rounded-md opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-50 border border-slate-700 light:border-slate-300 shadow-xl"
              >
                {{ row.item.name }}
              </div>
            </button>

            <!-- Sidebar DAM Folders Tree -->
            <div
              v-if="row.item.section === 'assets' && isAssetsTreeExpanded && !isSidebarCollapsed"
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

            <!-- AI Submenu: the providers used for generating text, images and translations -->
            <div
              v-if="row.item.section === 'ai' && isAiMenuExpanded && !isSidebarCollapsed"
              class="ml-3 pl-2.5 border-l border-slate-800/80 light:border-slate-200/80 space-y-1 py-1"
            >
              <button
                v-for="sub in aiSubItems" :key="sub.key"
                @click="tabsStore.openAiSubSection(sub.key)"
                :data-testid="`nav-ai-${sub.key}`"
                :class="[
                  'w-full flex items-center px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition select-none text-left',
                  isAiSubSectionActive(sub.key)
                    ? 'bg-indigo-600/30 text-indigo-200 light:text-indigo-700 border border-indigo-500/40 font-bold shadow-sm'
                    : 'text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 hover:bg-slate-800/40 light:bg-slate-100/40'
                ]"
              >
                <component :is="sub.icon" class="w-3.5 h-3.5 mr-1.5 shrink-0" />
                <span class="truncate flex-1">{{ sub.name }}</span>
              </button>
            </div>

            <!-- Settings Submenu - docs/plans/UI/settings-ui-plan.md -->
            <div
              v-if="row.item.section === 'settings' && isSettingsMenuExpanded && !isSidebarCollapsed"
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

            <!-- Data Objects Class Tree -->
            <div
              v-if="row.item.section === 'objects' && isObjectsTreeExpanded && !isSidebarCollapsed"
              class="ml-3 pl-2.5 border-l border-slate-800/80 light:border-slate-200/80 space-y-1 py-1"
            >
              <div
                v-for="dataClass in dataClassesStore.classes"
                :key="dataClass.id"
                @click="handleSelectSidebarClass(dataClass.id)"
                :class="[
                  'flex items-center px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition select-none group',
                  dataClassesStore.selectedClassId === dataClass.id
                    ? 'bg-indigo-600/30 text-indigo-200 light:text-indigo-700 border border-indigo-500/40 font-bold shadow-sm'
                    : 'text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 hover:bg-slate-800/40 light:bg-slate-100/40'
                ]"
              >
                <Table2 class="w-3.5 h-3.5 mr-1.5 text-indigo-400 shrink-0" />
                <span class="truncate flex-1">{{ dataClass.label }}</span>
              </div>
            </div>
          </div>
        </template>
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
      <header class="flex items-center justify-between h-16 px-6 bg-slate-900/60 light:bg-white/60 backdrop-blur-md border-b-0 border-slate-800 light:border-slate-200 z-20 shrink-0">
        <!-- Page Title & Search -->
        <div class="flex items-center space-x-6 flex-1 max-w-3xl">
          <h1 class="text-lg font-semibold text-slate-100 light:text-slate-900 truncate hidden md:block">
            {{ currentTabTitle }}
          </h1>
          <div class="relative w-full max-w-md">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search objects, pages, assets, classes..."
              class="w-full pl-9 pr-9 py-1.5 text-sm bg-slate-950/60 light:bg-white/60 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 placeholder-slate-500 light:placeholder-slate-400 focus:outline-none focus:border-indigo-500/80 focus:ring-1 focus:ring-indigo-500/80 transition"
              @input="onSearchInput"
              @focus="searchOpen = true"
              @blur="onSearchBlur"
              @keydown.enter.prevent="openFirstSearchResult"
              @keydown.esc="closeSearch"
            />
            <button
              v-if="searchQuery.trim().length >= 2"
              class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-500 hover:text-rose-400 transition"
              title="Clear search"
              @mousedown.prevent
              @click="closeSearch"
            >
              <X class="w-3.5 h-3.5" />
            </button>

            <!-- Global search results (search-engine plan Phase 5) -->
            <div
              v-if="searchOpen && searchQuery.trim().length >= 2"
              class="absolute top-full left-0 right-0 mt-1.5 rounded-xl border border-slate-800 light:border-slate-200 bg-slate-900 light:bg-white shadow-2xl overflow-hidden z-50"
            >
              <!-- Type filter badges: all on by default, click to exclude a
                   type from the query (multi-select). -->
              <div class="flex items-center gap-1.5 px-3 py-2 border-b border-slate-800/60 light:border-slate-100">
                <span class="text-[10px] uppercase tracking-wide text-slate-500 shrink-0">Types</span>
                <button
                  v-for="t in searchTypeFilters"
                  :key="t.key"
                  class="px-2 py-0.5 rounded-full text-[11px] font-semibold transition"
                  :class="searchTypeFilter.has(t.key)
                    ? 'bg-indigo-500/20 text-indigo-300 light:bg-indigo-500/15 light:text-indigo-700'
                    : 'bg-slate-800/60 light:bg-slate-100 text-slate-400 light:text-slate-500'"
                  @mousedown.prevent
                  @click="toggleSearchType(t.key)"
                >
                  {{ t.label }}
                </button>
              </div>
              <div v-if="searchLoading" class="px-4 py-3 text-sm text-slate-400 animate-pulse">Searching…</div>
              <div v-else-if="searchError" class="px-4 py-3 text-sm text-rose-400">{{ searchError }}</div>
              <div v-else-if="searchResults.length === 0" class="px-4 py-3 text-sm text-slate-400">
                No results for "<span class="text-slate-200 light:text-slate-700">{{ searchQuery }}</span>"
              </div>
              <ul v-else class="max-h-96 overflow-y-auto divide-y divide-slate-800/60 light:divide-slate-100">
                <li v-for="result in searchResults" :key="`${result.type}-${result.id}`">
                  <button
                    class="w-full text-left px-4 py-2.5 hover:bg-slate-800/60 light:hover:bg-slate-50 transition"
                    @mousedown.prevent
                    @click="openSearchResult(result)"
                  >
                    <div class="flex items-center gap-2">
                      <span
                        class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        :class="searchTypeBadge(result.type)"
                      >
                        {{ result.type }}
                      </span>
                      <span class="text-sm text-slate-200 light:text-slate-800 truncate">{{ result.title }}</span>
                      <span v-if="result.type === 'object' && result.publishedAt" class="ml-auto shrink-0 text-[10px] text-slate-500">
                        {{ result.payload?.className ?? '' }}
                      </span>
                    </div>
                    <p class="mt-0.5 text-xs text-slate-500 truncate" v-html="searchHighlight(result.excerpt)"></p>
                  </button>
                </li>
                <li class="flex items-center justify-between px-4 py-2 bg-slate-950/40 light:bg-slate-50 text-[11px] text-slate-500">
                  <span>{{ searchTotal }} result{{ searchTotal === 1 ? '' : 's' }} • {{ searchTookMs }}ms</span>
                  <button class="hover:text-indigo-400 transition" title="Rebuild search index" @mousedown.prevent @click="handleReindex">
                    Rebuild index
                  </button>
                </li>
              </ul>
            </div>
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
      <div class="flex items-center gap-1 px-4 pt-0 overflow-x-auto bg-slate-950/60 light:bg-white/60 border-b border-slate-800 light:border-slate-200 shrink-0">
        <div
          v-for="tab in tabsStore.tabs"
          :key="tab.id"
          :data-tab-id="tab.id"
          @click="tabsStore.activeTabId = tab.id"
          @contextmenu.prevent="openContextMenu($event, tab)"
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

      <!-- Context menu backdrop -->
      <div
        v-if="contextMenu.visible"
        class="fixed inset-0 z-[9998]"
        @click="closeContextMenu"
        @contextmenu.prevent="closeContextMenu"
      ></div>
      <!-- Context menu popup -->
      <div
        v-if="contextMenu.visible"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        class="fixed z-[9999] min-w-[140px] py-1 bg-slate-800 light:bg-white border border-slate-700 light:border-slate-200 rounded-lg shadow-2xl"
        @click.stop
      >
        <button
          @click="handleCloseAllTabs"
          class="w-full text-left px-3 py-2 text-xs font-medium text-slate-300 light:text-slate-700 hover:bg-slate-700/60 light:bg-slate-100/60 transition first:rounded-t-lg"
        >
          Close all tabs
        </button>
        <button
          @click="handleCloseOtherTabs"
          class="w-full text-left px-3 py-2 text-xs font-medium text-slate-300 light:text-slate-700 hover:bg-slate-700/60 light:bg-slate-100/60 transition last:rounded-b-lg"
        >
          Close others
        </button>
      </div>

      <!-- Main Content View: all open tabs stay mounted (v-show) so switching preserves state.
           Each tab manages its own scrolling: section views scroll as a whole page, while
           MasterAssetTab keeps its sub-tab nav fixed and scrolls only its sub-tab content. -->
      <main class="flex-1 min-h-0 overflow-hidden bg-slate-950 light:bg-slate-50">
        <!-- Zero-tabs fallback: Overview renders directly here, not as a
             tab in tabsStore.tabs - see tabsStore.ts's own comment on why
             there's no hardcoded default tab anymore. -->
        <div v-if="tabsStore.tabs.length === 0" class="h-full overflow-hidden -mt-4">
          <OverviewView />
        </div>
        <template v-for="tab in tabsStore.tabs" :key="tab.id">
          <div v-show="tabsStore.activeTabId === tab.id" class="h-full">
            <div v-if="tab.type === 'section' && tab.section" class="h-full overflow-y-auto p-6">
              <component :is="sectionComponent(tab.section)" />
            </div>
            <MasterAssetTab v-else-if="tab.type === 'item' && tab.itemKind === 'asset' && tab.itemId" :asset-id="tab.itemId" />
            <MasterDocumentTab v-else-if="tab.type === 'item' && tab.itemKind === 'document' && tab.itemId" :document-id="tab.itemId" />
            <MasterPageTab v-else-if="tab.type === 'item' && tab.itemKind === 'page' && tab.itemId" :page-id="tab.itemId" :element-id="tab.elementId" />
            <MasterSnippetTab v-else-if="tab.type === 'item' && tab.itemKind === 'snippet' && tab.itemId" :snippet-id="tab.itemId" :element-id="tab.elementId" />
            <MasterObjectTab
              v-else-if="tab.type === 'item' && tab.itemKind === 'object' && tab.itemId && tab.objectClassId"
              :translation-group-id="tab.itemId"
              :class-id="tab.objectClassId"
            />
            <MasterClassTab v-else-if="tab.type === 'item' && tab.itemKind === 'class' && tab.itemId" :class-id="tab.itemId" />
            <ObjectsView
              v-else-if="tab.type === 'item' && tab.itemKind === 'classList' && tab.classListClassId"
              :class-id="tab.classListClassId"
            />
            <MasterWebsiteTab v-else-if="tab.type === 'item' && tab.itemKind === 'website' && tab.itemId" :website-id="tab.itemId" />
            <MasterIntegrationImportTab v-else-if="tab.type === 'item' && tab.itemKind === 'integrationImport'" />
            <MasterApiClientTab v-else-if="tab.type === 'item' && tab.itemKind === 'apiClient' && tab.itemId" :client-id="tab.itemId" :tab-id="tab.id" />
            <MasterObjectEventLogTab v-else-if="tab.type === 'item' && tab.itemKind === 'objectEventLog' && tab.itemId" :subscription-id="tab.itemId" :tab-id="tab.id" />
            <MasterDocsSiteTab v-else-if="tab.type === 'item' && tab.itemKind === 'docsSite' && tab.itemId" :website-id="tab.itemId" />
            <MasterDocsDocTab v-else-if="tab.type === 'item' && tab.itemKind === 'docsDoc' && tab.itemId && tab.docsPath" :website-id="tab.itemId" :path="tab.docsPath" />
          </div>
        </template>
      </main>
    </div>

    <!-- The sidebar is collapsed to icons: the children of an item (the folders of Assets, the classes of Data Objects, the submenus of
         AI and Settings) open as a menu to the right of the icon, while the pointer is on the icon or on the menu (or the icon has the focus). -->
    <Teleport to="body">
      <div
        v-if="navPopover && isSidebarCollapsed"
        ref="navPopoverEl"
        class="ui-popover"
        role="menu"
        :style="{ top: navPopover.top + 'px', left: navPopover.left + 'px' }"
        data-testid="nav-popover"
        @mouseenter="cancelCloseNavPopover"
        @mouseleave="scheduleCloseNavPopover"
        @keydown.esc="closeNavPopover"
      >
        <div class="ui-popover-title">{{ navPopover.title }}</div>
        <button
          v-for="entry in navPopover.entries"
          :key="entry.key"
          type="button"
          role="menuitem"
          class="ui-popover-item"
          :class="{ 'is-active': entry.active }"
          :style="{ paddingLeft: `${0.5 + entry.depth * 0.75}rem` }"
          :data-testid="`nav-popover-item-${entry.key}`"
          @click="chooseNavEntry(entry)"
        >
          <component :is="entry.icon" class="w-3.5 h-3.5 shrink-0" />
          <span class="truncate">{{ entry.label }}</span>
        </button>
        <div v-if="navPopover.entries.length === 0" class="ui-popover-empty">Nothing here yet</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { highlightSearchSnippet } from '@whoobe-cms/core'
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import {
  Layers,
  LayoutDashboard,
  Database,
  FolderArchive,
  FileText,
  FileStack,
  Settings,
  Puzzle,
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
  Palette,
  Image,
  Languages,
  Smartphone,
  Upload,
  Table2,
  Plug,
  Mail,
  Sparkles,
  X,
  Network,
  ScrollText,
  BookOpen,
  Zap,
  Radio,
  Rocket,
  Link2,
  KeyRound,
  ListChecks,
} from '@lucide/vue'
import { useDamStore } from '../stores/damStore'
import { useDocumentsStore } from '../stores/documentsStore'
import { useDataClassesStore } from '../stores/dataClassesStore'
import { useThemeStore } from '../stores/themeStore'
import { useTabsStore, sectionTabId, SectionKind, MainTab, SettingsSubSection, AiSubSection } from '../stores/tabsStore'
import { useToastStore } from '../stores/toastStore'
import { useAuthStore } from '../stores/authStore'
import { getIconForFileType } from '../utils/asset-file-icons'
import SidebarFolderNode from '../components/dam/SidebarFolderNode.vue'
import MasterAssetTab from '../components/dam/MasterAssetTab.vue'
import MasterDocumentTab from '../components/documents/MasterDocumentTab.vue'
import MasterPageTab from '../components/pages/MasterPageTab.vue'
import MasterSnippetTab from '../components/snippets/MasterSnippetTab.vue'
import MasterObjectTab from '../components/objects/MasterObjectTab.vue'
import MasterClassTab from '../components/objects/MasterClassTab.vue'
import MasterIntegrationImportTab from '../components/objects/MasterIntegrationImportTab.vue'
import MasterWebsiteTab from '../components/websites/MasterWebsiteTab.vue'
import MasterApiClientTab from '../components/api-clients/MasterApiClientTab.vue'
import MasterObjectEventLogTab from '../components/objects/MasterObjectEventLogTab.vue'
import MasterDocsSiteTab from '../components/websites/MasterDocsSiteTab.vue'
import MasterDocsDocTab from '../components/websites/MasterDocsDocTab.vue'
import OverviewView from '../views/OverviewView.vue'
import WebsitesView from '../views/WebsitesView.vue'
import PublishView from '../views/PublishView.vue'
import ObjectsView from '../views/ObjectsView.vue'
import AssetsView from '../views/AssetsView.vue'
import DocumentsView from '../views/DocumentsView.vue'
import PagesView from '../views/PagesView.vue'
import SnippetsView from '../views/SnippetsView.vue'
import ComponentsView from '../views/ComponentsView.vue'
import MailSettingsView from '../views/MailSettingsView.vue'
import SettingsView from '../views/SettingsView.vue'
import AiView from '../views/AiView.vue'
import SystemLogsView from '../views/SystemLogsView.vue'
import ThemesView from '../components/themes/ThemesView.vue'
import GatewayEndpointsView from '../views/GatewayEndpointsView.vue'
import GatewayPluginsView from '../views/GatewayPluginsView.vue'
import AutomationsView from '../views/AutomationsView.vue'
import ObjectEventsView from '../views/ObjectEventsView.vue'
import DataBindingsView from '../views/DataBindingsView.vue'
import ApiClientsView from '../views/ApiClientsView.vue'
import { usePagesStore } from '../stores/pagesStore'
import { useSnippetsStore } from '../stores/snippetsStore'
import { adminSearch, reindexSearchIndex, type SearchResult } from '../utils/search-api'
import { getWhoobeOneSpikeUrl } from '../utils/editor-urls'
import { useWebsitesStore } from '../stores/websitesStore'

const damStore = useDamStore()
const documentsStore = useDocumentsStore()
const pagesStore = usePagesStore()
const snippetsStore = useSnippetsStore()
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

// Global search (search-engine plan Phase 5): debounced admin search over
// /whoobe-one/search with a dropdown of results, Enter-to-open-first, and a
// one-click full index rebuild. Includes unpublished/drafts, which is the
// whole point of the admin endpoint over the public one.
const searchQuery = ref('')
const searchOpen = ref(false)
const searchLoading = ref(false)
const searchError = ref<string | null>(null)
const searchResults = ref<SearchResult[]>([])
const searchTotal = ref(0)
const searchTookMs = ref(0)
let searchDebounce: ReturnType<typeof setTimeout> | null = null

const searchTypeFilters: { key: SearchResult['type']; label: string }[] = [
  { key: 'object', label: 'Objects' },
  { key: 'asset', label: 'Assets' },
  { key: 'page', label: 'Pages' },
  { key: 'class', label: 'Classes' },
]
// All on by default; a Set is fine in Vue 3 reactivity (replaced on toggle).
const searchTypeFilter = ref<Set<SearchResult['type']>>(new Set(searchTypeFilters.map((t) => t.key)))

function toggleSearchType(key: SearchResult['type']) {
  const next = new Set(searchTypeFilter.value)
  if (next.has(key)) {
    next.delete(key)
    // Never a dead state: dropping the last active type resets to all.
    if (next.size === 0) {
      searchTypeFilters.forEach((t) => next.add(t.key))
    }
  } else {
    next.add(key)
  }
  searchTypeFilter.value = next
  runSearch()
}

function onSearchInput() {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchOpen.value = true
  searchDebounce = setTimeout(() => runSearch(), 300)
}

async function runSearch() {
  const q = searchQuery.value.trim()
  if (q.length < 2) {
    searchResults.value = []
    searchTotal.value = 0
    return
  }
  searchLoading.value = true
  searchError.value = null
  try {
    const types = [...searchTypeFilter.value]
    const res = await adminSearch({
      q,
      pageSize: 20,
      type: types.length === searchTypeFilters.length ? undefined : types.length === 1 ? types[0] : types,
      // Admin search is the management surface - drafts (e.g. freshly
      // migrated objects) must be findable there even before publish.
      includeUnpublished: true,
    })
    searchResults.value = res.results
    searchTotal.value = res.total
    searchTookMs.value = res.tookMs
  } catch (e: any) {
    searchError.value = e.message || 'Search failed'
    searchResults.value = []
  } finally {
    searchLoading.value = false
  }
}

function searchTypeBadge(type: string): string {
  if (type === 'page') return 'bg-violet-500/15 text-violet-300 light:text-violet-700'
  if (type === 'class') return 'bg-emerald-500/15 text-emerald-300 light:text-emerald-700'
  if (type === 'asset') return 'bg-amber-500/15 text-amber-300 light:text-amber-700'
  return 'bg-blue-500/15 text-blue-300 light:text-blue-700'
}

function searchHighlight(text: string): string {
  return highlightSearchSnippet(text, '<mark class="bg-amber-200/40 text-slate-200 light:text-slate-700">')
}

function openSearchResult(result: SearchResult) {
  closeSearch()
  if (result.type === 'page') {
    tabsStore.openPage(result.id)
  } else if (result.type === 'object') {
    const { classId, translationGroupId } = result.payload ?? {}
    if (classId && translationGroupId) {
      tabsStore.openObject(translationGroupId, classId, result.locale || 'en')
    }
  } else if (result.type === 'class') {
    tabsStore.openClass(result.id)
  } else if (result.type === 'asset') {
    tabsStore.openAsset(result.id)
  }
}

function openFirstSearchResult() {
  if (searchResults.value.length > 0) openSearchResult(searchResults.value[0])
}

function onSearchBlur() {
  // Give mousedown-clicked result buttons time to fire before the dropdown
  // unmounts.
  setTimeout(() => {
    searchOpen.value = false
  }, 150)
}

function closeSearch() {
  searchQuery.value = ''
  searchResults.value = []
  searchTotal.value = 0
  searchOpen.value = false
  if (searchDebounce) clearTimeout(searchDebounce)
}

const contextMenu = ref<{ visible: boolean; x: number; y: number; tabId: string | null }>({
  visible: false,
  x: 0,
  y: 0,
  tabId: null
})

function openContextMenu(event: MouseEvent, tab: MainTab) {
  contextMenu.value = { visible: true, x: event.clientX, y: event.clientY, tabId: tab.id }
}

function closeContextMenu() {
  contextMenu.value.visible = false
}

function handleCloseAllTabs() {
  closeContextMenu()
  tabsStore.closeAllTabs()
}

function handleCloseOtherTabs() {
  if (contextMenu.value.tabId) {
    const id = contextMenu.value.tabId
    closeContextMenu()
    tabsStore.closeOtherTabs(id)
  }
}

async function handleReindex() {
  try {
    const counts = await reindexSearchIndex()
    toastStore.show(`Index rebuilt: ${counts.pages} pages, ${counts.objects} objects, ${counts.classes} classes, ${counts.assets} assets`)
  } catch (e: any) {
    toastStore.show(e.message || 'Reindex failed')
  }
}

const isSidebarCollapsed = ref(false)
const isObjectsTreeExpanded = ref(true)
const isAssetsTreeExpanded = ref(true)
const isSettingsMenuExpanded = ref(true)
const isAiMenuExpanded = ref(true)

// Flat vs grouped-by-category sidebar layout. Per-browser preference, not a
// server setting - defaults to grouped (the requested improvement) but
// stays a real toggle rather than replacing the old flat list outright.
const NAV_MODE_STORAGE_KEY = 'whoobe-admin-sidebar-nav-mode'
function readStoredNavGrouped(): boolean {
  try {
    return localStorage.getItem(NAV_MODE_STORAGE_KEY) !== 'flat'
  } catch {
    return true
  }
}
const isNavGrouped = ref(readStoredNavGrouped())
function setNavGrouped(grouped: boolean) {
  isNavGrouped.value = grouped
  try {
    localStorage.setItem(NAV_MODE_STORAGE_KEY, grouped ? 'grouped' : 'flat')
  } catch {
    // Private browsing / storage disabled - the toggle still works for
    // this session, it just won't be remembered next time.
  }
}

// Which group headers are collapsed, grouped-view only. Session-only (not
// persisted), same as the existing objects/assets/settings tree toggles
// above.
const collapsedNavGroups = ref<Set<NavGroupId>>(new Set())
function toggleNavGroup(groupId: NavGroupId) {
  const next = new Set(collapsedNavGroups.value)
  if (next.has(groupId)) {
    next.delete(groupId)
  } else {
    next.add(groupId)
  }
  collapsedNavGroups.value = next
}

const settingsSubItems: { key: SettingsSubSection; name: string; icon: any }[] = [
  { key: 'general', name: 'General settings', icon: Sliders },
  { key: 'dam', name: 'DAM configuration', icon: HardDrive },
  { key: 'classes', name: 'Data Object classes', icon: Database },
  { key: 'roles', name: 'Roles/Users/Workspaces', icon: Users },
  { key: 'security', name: 'Security', icon: Shield },
  { key: 'workflows', name: 'Workflows', icon: Workflow },
  { key: 'figma', name: 'Figma', icon: Palette },
  { key: 'pwa', name: 'Mobile App', icon: Smartphone },
  { key: 'uploads', name: 'Form uploads', icon: Upload },
]

const settingsSubLabels: Record<SettingsSubSection, string> = {
  general: 'General settings',
  dam: 'DAM configuration',
  classes: 'Data Object classes',
  roles: 'Roles/Users/Workspaces',
  security: 'Security',
  workflows: 'Workflows',
  figma: 'Figma',
  pwa: 'Mobile App',
  uploads: 'Form uploads',
}

const aiSubItems: { key: AiSubSection; name: string; icon: any }[] = [
  { key: 'text', name: 'AI agent', icon: Sparkles },
  { key: 'image', name: 'Image generation', icon: Image },
  { key: 'translate', name: 'Translation', icon: Languages },
]

function isAiSubSectionActive(key: AiSubSection): boolean {
  const tab = tabsStore.tabs.find((t) => t.id === sectionTabId('ai'))
  return isSectionActive('ai') && (tab?.aiSubSection ?? 'text') === key
}

function isSettingsSubSectionActive(key: SettingsSubSection): boolean {
  const tab = tabsStore.tabs.find((t) => t.id === sectionTabId('settings'))
  return isSectionActive('settings') && (tab?.settingsSubSection ?? 'general') === key
}

// Overview has no menu item - there's nothing to "open" it into, it's just
// what renders (directly, not as a tab - see the zero-tabs branch in the
// template's <main>) until the user opens something. sectionComponents/
// sectionLabels/sectionIcons below still carry an 'overview' entry since
// SectionKind still includes it and that fallback rendering reuses
// sectionComponents.overview.
const allNavItems: { name: string; section: SectionKind; icon: any }[] = [
  { name: 'Websites', section: 'websites', icon: Globe },
  { name: 'Pages', section: 'pages', icon: FileStack },
  { name: 'Snippets', section: 'snippets', icon: Puzzle },
  { name: 'Themes', section: 'themes', icon: Palette },
  { name: 'Publish', section: 'publish', icon: Rocket },
  { name: 'Assets', section: 'assets', icon: FolderArchive },
  { name: 'Data Objects', section: 'objects', icon: Database },
  { name: 'Components', section: 'components', icon: Blocks },
  { name: 'Integrations', section: 'gateway', icon: Network },
  { name: 'API clients', section: 'api-clients', icon: KeyRound },
  { name: 'Data bindings', section: 'data-bindings', icon: Link2 },
  { name: 'Automations', section: 'automations', icon: Zap },
  { name: 'Object events', section: 'object-events', icon: Radio },
  { name: 'Outgoing Mail', section: 'mail', icon: Mail },
  { name: 'Documents', section: 'documents', icon: FileText },
  { name: 'AI', section: 'ai', icon: Sparkles },
  { name: 'Settings', section: 'settings', icon: Settings },
  { name: 'System Logs', section: 'system-logs', icon: ScrollText }
]

// Object events are managed by administrators only (`object_events:manage`): the entry is not offered to anyone else.
const navItems = computed(() => allNavItems.filter((item) => item.section !== 'object-events' || authStore.can('object_events:manage')))

// Grouped-view categories for the sidebar toggle above. Assets stays its
// own group (rather than folded into Content) since it already carries
// its own DAM folder sub-tree in the nav. Sections with no entry here
// (currently none) would simply not render a header in grouped mode.
type NavGroupId = 'content' | 'data'  | 'assets' | 'system'  
const navGroupOrder: NavGroupId[] = ['content', 'data', 'assets', 'system' ]
const navGroupLabels: Record<NavGroupId, string> = {
  content: 'Content',
  assets: 'Assets',
  data: 'Data & Communication',
  system: 'System'
}
const sectionGroup: Partial<Record<SectionKind, NavGroupId>> = {
  websites: 'content',
  publish: 'content',
  pages: 'content',
  snippets: 'content',
  themes: 'content',
  assets: 'assets',
  objects: 'data',
  components: 'data',
  documents: 'data',
  mail: 'data',
  gateway: 'data',
  'api-clients': 'data',
  'data-bindings': 'data',
  automations: 'data',
  'object-events': 'data',
  'system-logs': 'system',
  ai: 'system',
  settings: 'system'
}

type NavRow =
  | { kind: 'header'; id: NavGroupId; label: string }
  | { kind: 'item'; item: (typeof allNavItems)[number] }

// Sidebar renders this single list, not navItems directly, so the flat and
// grouped layouts share one row of markup instead of two duplicated blocks.
// Collapsed sidebar always renders flat: group headers have no room in
// icon-only mode.
const navRows = computed<NavRow[]>(() => {
  if (!isNavGrouped.value || isSidebarCollapsed.value) {
    return navItems.value.map((item) => ({ kind: 'item', item }))
  }
  const rows: NavRow[] = []
  for (const groupId of navGroupOrder) {
    const items = navItems.value.filter((item) => sectionGroup[item.section] === groupId)
    if (items.length === 0) continue
    rows.push({ kind: 'header', id: groupId, label: navGroupLabels[groupId] })
    if (!collapsedNavGroups.value.has(groupId)) {
      for (const item of items) rows.push({ kind: 'item', item })
    }
  }
  return rows
})

const sectionComponents: Record<SectionKind, any> = {
  overview: OverviewView,
  websites: WebsitesView,
  publish: PublishView,
  objects: ObjectsView,
  assets: AssetsView,
  documents: DocumentsView,
  pages: PagesView,
  snippets: SnippetsView,
  components: ComponentsView,
  themes: ThemesView,
  mail: MailSettingsView,
  settings: SettingsView,
  ai: AiView,
  gateway: GatewayEndpointsView,
  'gateway-plugins': GatewayPluginsView,
  'api-clients': ApiClientsView,
  'data-bindings': DataBindingsView,
  automations: AutomationsView,
  'object-events': ObjectEventsView,
  'system-logs': SystemLogsView,
}

const sectionLabels: Record<SectionKind, string> = {
  overview: 'Overview',
  websites: 'Websites',
  publish: 'Publish',
  objects: 'Data Objects',
  assets: 'Assets',
  documents: 'Documents',
  pages: 'Pages',
  snippets: 'Snippets',
  components: 'Components',
  mail: 'Outgoing Mail',
  themes: 'Themes',
  gateway: 'Integrations',
  'gateway-plugins': 'Integration Plugins',
  'api-clients': 'API clients',
  'data-bindings': 'Data bindings',
  automations: 'Automations',
  'object-events': 'Object events',
  'system-logs': 'System Logs',
  ai: 'AI',
  settings: 'Settings'
}

const sectionIcons: Record<SectionKind, any> = {
  overview: LayoutDashboard,
  websites: Globe,
  publish: Rocket,
  objects: Database,
  assets: FolderArchive,
  documents: FileText,
  pages: FileStack,
  snippets: Puzzle,
  components: Blocks,
  mail: Mail,
  themes: Palette,
  gateway: Network,
  'gateway-plugins': Network,
  'api-clients': KeyRound,
  'data-bindings': Link2,
  automations: Zap,
  'object-events': Radio,
  'system-logs': ScrollText,
  ai: Sparkles,
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
    if (tab.section === 'ai' && tab.aiSubSection) {
      return `AI ‣ ${aiSubItems.find((i) => i.key === tab.aiSubSection)?.name ?? ''}`
    }
    if (tab.section === 'settings' && tab.settingsSubSection) {
      return `Settings ‣ ${settingsSubLabels[tab.settingsSubSection]}`
    }
    return sectionLabels[tab.section]
  }
  if (tab.type === 'item' && tab.itemKind === 'integrationImport') return 'Integration import'
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
  if (tab.type === 'item' && tab.itemKind === 'snippet' && tab.itemId) {
    const snippet = snippetsStore.snippets.find((s) => s.id === tab.itemId)
    return snippet?.name || (tab.itemId.startsWith('new:') ? 'New Snippet' : 'Snippet')
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
  if (tab.type === 'item' && tab.itemKind === 'classList') {
    const dataClass = dataClassesStore.classes.find((c) => c.id === tab.classListClassId)
    return `${dataClass?.label ?? tab.label ?? 'Data'} Objects`
  }
  if (tab.type === 'item' && tab.itemKind === 'website' && tab.itemId) {
    const website = websitesStore.websites.find((w) => w.id === tab.itemId)
    return website?.name || 'Website'
  }
  if (tab.type === 'item' && tab.itemKind === 'apiClient') {
    return `${tab.dirty ? '● ' : ''}${tab.label || 'New API client'}`
  }
  if (tab.type === 'item' && tab.itemKind === 'objectEventLog') {
    return tab.label || 'Delivery log'
  }
  if (tab.type === 'item' && tab.itemKind === 'docsSite' && tab.itemId) {
    const website = websitesStore.websites.find((w) => w.id === tab.itemId)
    return `${website?.name || 'Docs'} ‣ docs`
  }
  if (tab.type === 'item' && tab.itemKind === 'docsDoc' && tab.docsPath) {
    return `${tab.dirty ? '● ' : ''}${tab.docsPath.split('/').pop()}`
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
  if (tab.type === 'item' && tab.itemKind === 'snippet' && tab.itemId) {
    return Puzzle
  }
  if (tab.type === 'item' && tab.itemKind === 'object') {
    return Database
  }
  if (tab.type === 'item' && tab.itemKind === 'class') {
    return Table2
  }
  if (tab.type === 'item' && tab.itemKind === 'classList') {
    return Database
  }
  if (tab.type === 'item' && tab.itemKind === 'website') {
    return Globe
  }
  if (tab.type === 'item' && tab.itemKind === 'integrationImport') {
    return Plug
  }
  if (tab.type === 'item' && tab.itemKind === 'apiClient') {
    return KeyRound
  }
  if (tab.type === 'item' && tab.itemKind === 'objectEventLog') {
    return ListChecks
  }
  if (tab.type === 'item' && tab.itemKind === 'docsSite') {
    return BookOpen
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


// ---- collapsed sidebar: the children of an item as a menu to its right --------------------------------------------------------

interface NavChild { key: string; label: string; icon: any; depth: number; active: boolean; run: () => void }

/** The entries an item would show under it when the sidebar is open, flattened (null: the item has no children). */
function navChildren(section: SectionKind): NavChild[] | null {
  if (section === 'assets') {
    const rootFirst = [...damStore.folders].sort((a, b) => a.path.localeCompare(b.path, 'en', { numeric: true }))
    return [
      { key: 'asset-folder-/', label: '/ (Root)', icon: Folder, depth: 0, active: damStore.currentFolderPath === '/', run: () => handleSelectSidebarFolder('/') },
      ...rootFirst.map((f) => ({ key: `asset-folder-${f.path}`, label: f.name, icon: Folder, depth: f.path.split('/').filter(Boolean).length, active: damStore.currentFolderPath === f.path, run: () => handleSelectSidebarFolder(f.path) })),
    ]
  }
  if (section === 'objects') {
    return dataClassesStore.classes.map((c) => ({ key: `class-${c.id}`, label: c.label, icon: Table2, depth: 0, active: dataClassesStore.selectedClassId === c.id, run: () => handleSelectSidebarClass(c.id) }))
  }
  if (section === 'settings') {
    return settingsSubItems.map((i) => ({ key: `settings-${i.key}`, label: i.name, icon: i.icon, depth: 0, active: isSettingsSubSectionActive(i.key), run: () => tabsStore.openSettingsSubSection(i.key) }))
  }
  if (section === 'ai') {
    return aiSubItems.map((i) => ({ key: `ai-${i.key}`, label: i.name, icon: i.icon, depth: 0, active: isAiSubSectionActive(i.key), run: () => tabsStore.openAiSubSection(i.key) }))
  }
  return null
}
const hasNavChildren = (section: SectionKind): boolean => navChildren(section) !== null

const navPopover = ref<{ section: SectionKind; title: string; top: number; left: number; entries: NavChild[] } | null>(null)
const navPopoverEl = ref<HTMLElement | null>(null)
let navPopoverTimer: ReturnType<typeof setTimeout> | null = null

function cancelCloseNavPopover() { if (navPopoverTimer) { clearTimeout(navPopoverTimer); navPopoverTimer = null } }
function scheduleCloseNavPopover() { cancelCloseNavPopover(); navPopoverTimer = setTimeout(closeNavPopover, 220) }
function closeNavPopover() { cancelCloseNavPopover(); navPopover.value = null }

function onNavItemEnter(section: SectionKind, event: Event) {
  if (!isSidebarCollapsed.value) return
  cancelCloseNavPopover()
  const entries = navChildren(section)
  if (!entries) { navPopover.value = null; return }
  const row = event.currentTarget as HTMLElement
  const rect = (row.querySelector('button') ?? row).getBoundingClientRect()
  navPopover.value = { section, title: sectionLabels[section], top: rect.top, left: rect.right + 6, entries }
  // keep it on the screen: nudge it up when it would run off the bottom
  void nextTick(() => {
    const el = navPopoverEl.value
    if (!el || !navPopover.value) return
    const overflow = rect.top + el.offsetHeight + 8 - window.innerHeight
    if (overflow > 0) navPopover.value = { ...navPopover.value, top: Math.max(8, rect.top - overflow) }
  })
}

function chooseNavEntry(entry: NavChild) {
  entry.run()
  closeNavPopover()
}

// Esc closes the menu wherever the focus is (the pointer may be on the icon without the icon having the focus)
function onNavPopoverKey(e: KeyboardEvent) { if (e.key === 'Escape') closeNavPopover() }
watch(navPopover, (now, was) => {
  if (now && !was) window.addEventListener('keydown', onNavPopoverKey)
  else if (!now && was) window.removeEventListener('keydown', onNavPopoverKey)
})
onUnmounted(() => window.removeEventListener('keydown', onNavPopoverKey))

// leaving the collapsed state (or the page) must not leave a menu behind
watch(isSidebarCollapsed, (v) => { if (!v) closeNavPopover() })

function handleSelectSidebarClass(classId: string) {
  const dataClass = dataClassesStore.classes.find((c) => c.id === classId)
  tabsStore.openClassList(classId, dataClass?.label ?? classId)
  dataClassesStore.selectedClassId = classId
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
  if (event.origin !== new URL(getWhoobeOneSpikeUrl()).origin) return
  if (event.data?.type === 'whoobe-one:open-page-preview') {
    const { pageId, path, locale } = event.data
    if (typeof pageId === 'string' && typeof path === 'string' && typeof locale === 'string') {
      tabsStore.openPagePreview(pageId, path, locale)
    }
  }
  if (event.data?.type === 'whoobe-one:snippet-saved') {
    snippetsStore.refresh()
  }
  if (event.data?.type === 'whoobe-one:thumbnail-saved') {
    if (event.data.kind === 'snippet') snippetsStore.refresh()
    else pagesStore.reloadPages()
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
