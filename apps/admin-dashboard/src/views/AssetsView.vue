<template>
  <div class="flex flex-col h-full min-h-0 gap-6">
    <!-- shrink-0: header, filters, selection bar -->
    <div class="shrink-0 flex flex-col gap-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-xl font-bold text-slate-100 light:text-slate-900 flex items-center gap-2">
          <span>Assets Manager</span>
          <span class="text-xs font-mono font-normal px-2.5 py-0.5 rounded-full bg-slate-900 light:bg-white text-indigo-400 border border-slate-800 light:border-slate-200">
            DAM Storage
          </span>
        </h2>
        <p class="text-xs text-slate-400 light:text-slate-600">Manage S3/MinIO media assets, virtual folders, visibility strategies, versioning, and ZIP archives.</p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          @click="openCreateFolderModal()"
          class="px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-900 light:bg-white hover:bg-slate-800 light:bg-slate-100 text-slate-200 light:text-slate-800 border border-slate-800 light:border-slate-200 transition flex items-center gap-1.5"
        >
          <FolderPlus class="w-4 h-4 text-indigo-400" />
          <span>New Folder</span>
        </button>

        <button
          @click="openUploadModal()"
          class="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition flex items-center gap-1.5"
        >
          <Upload class="w-4 h-4" />
          <span>Upload Assets</span>
        </button>

        <button
          @click="regenerateAllThumbnails"
          :disabled="isRegenerating"
          class="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-700 hover:bg-slate-600 text-white shadow-lg transition flex items-center gap-1.5 disabled:opacity-50"
          title="Regenerate thumbnails for all images in this folder and subfolders"
        >
          <RefreshCw class="w-4 h-4" :class="isRegenerating ? 'animate-spin' : ''" />
          <span>{{ isRegenerating ? 'Regenerating...' : 'Regen Thumbnails' }}</span>
        </button>

        <button
          @click="tabsStore.openSection('settings')"
          class="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-900 light:bg-white hover:bg-slate-800 light:bg-slate-100 text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 border border-slate-800 light:border-slate-200 transition"
          title="DAM S3 Settings"
        >
          ⚙
        </button>
      </div>
    </div>

    <!-- Active S3 Bucket Status Bar -->
    <!--<div class="rounded-xl bg-slate-900/80 light:bg-white/80 border border-slate-800 light:border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold text-xs">
          S3
        </div>
        <div>
          <div class="text-xs font-semibold text-slate-200 light:text-slate-800 flex items-center gap-2">
            <span>Bucket: {{ damStore.damInfo.bucket || '—' }}</span>
            <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 light:bg-slate-50 text-indigo-400 border border-slate-800 light:border-slate-200">
              {{ damStore.damInfo.keyPrefix ? 'Prefix: ' + damStore.damInfo.keyPrefix : 'Root Bucket Storage' }}
            </span>
          </div>
          <div class="text-[11px] text-slate-500 font-mono">
            {{ damStore.damInfo.endpoint || 'Not connected to DAM backend' }}
          </div>
        </div>
      </div>-->

      <!-- Current Folder Path Indicator -->
      <!--<div class="flex items-center gap-2 text-xs">
        <span class="text-slate-500">Current Folder:</span>
        <span class="font-mono text-xs font-bold text-indigo-300 bg-slate-950 light:bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-800 light:border-slate-200">
          {{ damStore.currentFolderPath }}
        </span>
      </div>
    </div>-->

    <!-- Breadcrumb Navigation -->
    <div class="flex items-center gap-1.5 text-xs text-slate-400 light:text-slate-600 overflow-x-auto py-1">
      <button
        @click="navigateToFolder('/')"
        :class="['hover:text-indigo-400 font-medium transition flex items-center gap-1', damStore.currentFolderPath === '/' ? 'text-indigo-400 font-bold' : '']"
      >
        <Folder class="w-3.5 h-3.5" />
        Root
      </button>

      <template v-for="(crumb, idx) in breadcrumbs" :key="idx">
        <ChevronRight class="w-3.5 h-3.5 text-slate-600 light:text-slate-400" />
        <button
          @click="navigateToFolder(crumb.path)"
          :class="['hover:text-indigo-400 font-medium transition', damStore.currentFolderPath === crumb.path ? 'text-indigo-400 font-bold' : '']"
        >
          {{ crumb.name }}
        </button>
      </template>
    </div>

    <!-- Subfolders integrated into the asset listing — not a separate section above -->
    <!-- no separate subfolders block here -->

    <!-- Asset Section Header with View Mode & Column Config Controls -->
    <div class="space-y-3">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h3 class="text-xs font-semibold text-slate-400 light:text-slate-600 uppercase tracking-wider">
          Assets ({{ unifiedItems.length }})
        </h3>

        <div class="flex items-center gap-2">
          <!-- Column Selection Dropdown -->
          <div class="relative">
            <button
              @click="showColumnConfig = !showColumnConfig"
              class="px-2.5 py-1.5 rounded-xl bg-slate-900 light:bg-white hover:bg-slate-800 light:bg-slate-100 border border-slate-800 light:border-slate-200 text-slate-300 light:text-slate-700 hover:text-slate-100 light:text-slate-900 transition text-xs font-medium flex items-center gap-1.5"
              title="Configure Table Columns"
            >
              <SlidersHorizontal class="w-3.5 h-3.5 text-indigo-400" />
              <span>Custom view</span>
            </button>

            <!-- Column Config Menu Popover -->
            <div
              v-if="showColumnConfig"
              class="absolute right-0 mt-2 w-56 bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 rounded-xl p-3 shadow-2xl z-40 space-y-2 text-xs"
            >
              <div class="flex items-center justify-between pb-1.5 border-b border-slate-800 light:border-slate-200 text-slate-400 light:text-slate-600 font-semibold text-[11px] uppercase">
                <span>Configure Columns</span>
                <button @click="showColumnConfig = false" class="text-slate-500 hover:text-slate-200 light:text-slate-800">✕</button>
              </div>

              <div class="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                <label v-for="(val, key) in visibleColumns" :key="key" class="flex items-center gap-2 cursor-pointer hover:bg-slate-850 light:bg-slate-100 p-1 rounded transition text-slate-300 light:text-slate-700">
                  <input
                    type="checkbox"
                    :checked="val"
                    @change="toggleColumn(key as keyof ColumnConfig)"
                    class="rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span class="capitalize">{{ key === 's3Key' ? 'S3 Object Key' : key === 'fileType' ? 'Type' : key === 'uploadedAt' ? 'Uploaded' : key === 'updatedAt' ? 'Updated' : key }}</span>
                </label>
              </div>
            </div>
          </div>

          <!-- View Mode Toggle Buttons (Grid vs List) -->
          <div class="flex items-center bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 rounded-xl p-0.5">
            <button
              @click="setViewMode('grid')"
              :class="['px-2.5 py-1 rounded-lg transition text-xs flex items-center gap-1 font-semibold', viewMode === 'grid' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800']"
              title="Grid View"
            >
              <LayoutGrid class="w-3.5 h-3.5" />
              <span class="hidden sm:inline">Grid</span>
            </button>
            <button
              @click="setViewMode('list')"
              :class="['px-2.5 py-1 rounded-lg transition text-xs flex items-center gap-1 font-semibold', viewMode === 'list' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800']"
              title="List View"
            >
              <List class="w-3.5 h-3.5" />
              <span class="hidden sm:inline">List</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Filter Bar (Text Search & Multi-Column Filters) -->
      <div class="p-3 rounded-xl bg-slate-900/80 light:bg-white/80 border border-slate-800 light:border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div class="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          <!-- Text Search Filter -->
          <div class="relative flex-1 min-w-[200px]">
            <Search class="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Filter by filename, path, type, key..."
              class="w-full pl-8 pr-7 py-1.5 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 text-xs focus:outline-none focus:border-indigo-500 transition"
            />
            <button
              v-if="searchQuery"
              @click="searchQuery = ''"
              class="absolute right-2.5 top-2 text-slate-500 hover:text-slate-200 light:text-slate-800 transition"
            >
              ✕
            </button>
          </div>

          <!-- File Type Filter Dropdown -->
          <div class="flex items-center gap-1.5">
            <label class="text-[11px] text-slate-400 light:text-slate-600 font-medium">Type:</label>
            <select
              v-model="filterType"
              class="px-2.5 py-1.5 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="ALL">All Types</option>
              <option value="IMAGE">Images (PNG, JPG, WEBP, SVG)</option>
              <option value="VIDEO">Videos (MP4)</option>
              <option value="DOCUMENT">Documents (PDF)</option>
              <option value="ARCHIVE">Archives (ZIP)</option>
            </select>
          </div>

          <!-- Visibility Filter Dropdown -->
          <div class="flex items-center gap-1.5">
            <label class="text-[11px] text-slate-400 light:text-slate-600 font-medium">Visibility:</label>
            <select
              v-model="filterVisibility"
              class="px-2.5 py-1.5 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="ALL">All Visibilities</option>
              <option value="PUBLIC">PUBLIC (CDN)</option>
              <option value="PRIVATE">PRIVATE (Signed)</option>
            </select>
          </div>

          <!-- Reset Filters Button -->
          <button
            v-if="hasActiveFilters"
            @click="resetFilters"
            class="px-2.5 py-1.5 rounded-xl bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:bg-slate-200 text-indigo-300 hover:text-indigo-200 transition text-[11px] font-semibold flex items-center gap-1"
          >
            <X class="w-3 h-3" />
            <span>Reset Filters</span>
          </button>
        </div>

        <div class="text-[11px] text-slate-400 light:text-slate-600 font-mono">
          Showing <strong class="text-indigo-300 font-bold">{{ unifiedItems.length }}</strong> of {{ damStore.currentAssets.length + damStore.currentSubfolders.length }} items
        </div>
      </div>

      <!-- SELECTION BAR & BULK ACTIONS -->
      <div v-if="selectedAssetIds.length > 0" class="p-3.5 rounded-xl bg-indigo-950/80 border border-indigo-500/40 flex flex-wrap items-center justify-between gap-3 shadow-xl backdrop-blur-md animate-fadeIn">
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2 text-xs font-semibold text-indigo-200">
            <CheckSquare class="w-4 h-4 text-indigo-400" />
            <span>{{ selectedAssetIds.length }} asset(s) selected</span>
          </div>
          <div class="h-4 w-px bg-indigo-800/80"></div>
          <button
            v-if="!isAllFilteredSelected && filteredAndSortedAssets.length > paginatedItems.length"
            @click="selectAllFiltered"
            class="text-xs font-medium text-indigo-300 hover:text-white underline transition"
          >
            Select all {{ unifiedItems.length }} items in folder
          </button>
          <button
            @click="clearSelection"
            class="text-xs font-medium text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 transition"
          >
            Clear selection
          </button>
        </div>

        <div class="flex items-center gap-2">
          <button
            @click="downloadSelectedAssets"
            :disabled="isDownloadingZip"
            class="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1.5 shadow-md border border-indigo-400/30"
          >
            <Download class="w-3.5 h-3.5" />
            <span>{{ isDownloadingZip ? 'Preparing ZIP...' : 'Download Selected' }}</span>
          </button>
          <button
            @click="deleteSelectedAssets"
            class="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition flex items-center gap-1.5 shadow-md border border-rose-400/30"
          >
            <Trash2 class="w-3.5 h-3.5" />
            <span>Delete Selected</span>
          </button>
        </div>
      </div>
    </div>
    </div>  <!-- end shrink-0 header -->

    <!-- Scrollable + Pagination container -->
    <div class="flex flex-col flex-1 min-h-0 gap-3">
      <!-- scrollable: grid or list -->
      <div class="flex-1 overflow-y-auto min-h-0">
        <!-- no results within scrollable -->
        <div v-if="paginatedItems.length === 0" class="rounded-2xl bg-slate-900/40 light:bg-white/40 border border-slate-800/80 light:border-slate-200/80 p-12 text-center space-y-3">
          <Folder class="w-12 h-12 text-slate-600 light:text-slate-400 mx-auto" />
          <h4 class="text-sm font-semibold text-slate-300 light:text-slate-700">No assets found</h4>
          <p class="text-xs text-slate-500 max-w-sm mx-auto">No assets match your current filters in <code class="font-mono text-indigo-400">{{ damStore.currentFolderPath }}</code>.</p>
          <button
            v-if="hasActiveFilters"
            @click="resetFilters"
            class="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:bg-slate-200 text-indigo-300 transition inline-flex items-center gap-1.5 mt-2"
          >
            <X class="w-3.5 h-3.5" />
            <span>Reset Filters</span>
          </button>
          <button
            v-else
            @click="openUploadModal()"
            class="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition inline-flex items-center gap-1.5 mt-2"
          >
            <Upload class="w-3.5 h-3.5" />
            <span>Upload Multiple Files or ZIP</span>
          </button>
        </div>

        <!-- GRID VIEW -->
        <div v-else-if="viewMode === 'grid'" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-0.5">
        <div
          v-for="item in paginatedItems"
          :key="item.id"
          @click="item.kind === 'folder' ? navigateToFolder(item.folderPath) : tabsStore.openAsset(item.id)"
          class="p-4 rounded-xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 hover:border-indigo-500/50 transition group flex flex-col justify-between space-y-3 cursor-pointer"
        >
          <div class="aspect-video w-full rounded-lg bg-slate-950 light:bg-slate-50 flex items-center justify-center border border-slate-800/80 light:border-slate-200/80 overflow-hidden relative group-hover:bg-slate-900/80 light:bg-white/80 transition">
            <Folder v-if="item.kind === 'folder'" class="w-12 h-12 text-indigo-400 group-hover:scale-110 transition-transform" />
            <img
              v-else-if="PREVIEWABLE_IMAGE_TYPES.includes(item.fileType ?? '')"
              :src="item.dataUrl || item.thumbnailUrl || item.url"
              @error="handleImageError($event, item)"
              :alt="item.filename"
              class="w-full h-full object-cover rounded-lg"
            />
            <component v-else :is="getIconForFileType(item.fileType ?? '')" class="w-8 h-8 text-slate-500 group-hover:text-indigo-400 transition-colors" />

            <!-- Quick Eye Preview Indicator (assets only) -->
            <div v-if="item.kind !== 'folder'" class="absolute inset-0 bg-slate-950/40 light:bg-white/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1 text-xs text-white font-medium">
              <Eye class="w-4 h-4 text-indigo-400" />
              <span>Preview</span>
            </div>

            <!-- Selection Checkbox (assets only) -->
            <div v-if="item.kind !== 'folder'" class="absolute top-2 left-2 z-20" @click.stop>
              <input
                type="checkbox"
                :value="item.id"
                :checked="selectedAssetIds.includes(item.id)"
                @change="toggleSelectAsset(item.id)"
                class="w-4 h-4 rounded border-slate-700 light:border-slate-300 bg-slate-950/90 light:bg-white/90 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer shadow-md"
              />
            </div>

            <!-- Visibility Badge -->
            <span
              :class="[
                'absolute top-2 left-8 px-2 py-0.5 text-[9px] font-bold rounded-full border z-10',
                item.isPublic ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              ]"
            >
              {{ item.isPublic ? 'PUBLIC' : 'PRIVATE' }}
            </span>

            <!-- Version Badge (assets only) -->
            <span v-if="item.kind !== 'folder'" class="absolute top-2 right-2 px-2 py-0.5 text-[9px] font-mono font-bold rounded-full bg-slate-900 light:bg-white text-indigo-300 border border-slate-800 light:border-slate-200 z-10">
              v{{ item.version }}
            </span>
          </div>

          <div>
            <div class="font-medium text-slate-200 light:text-slate-800 text-sm truncate" :title="item.filename">{{ item.filename }}</div>
            <div class="flex items-center justify-between text-xs text-slate-500 mt-1">
              <span>{{ item.kind === 'folder' ? 'folder' : item.sizeFormatted }}</span>
              <span v-if="item.kind !== 'folder' && item.metadata?.technical?.width && item.metadata?.technical?.height" class="font-mono">
                {{ item.metadata.technical.width }} × {{ item.metadata.technical.height }}
              </span>
              <span class="font-mono text-[11px] text-indigo-300 truncate max-w-[120px]">{{ item.pimcorePath }}</span>
            </div>
          </div>

          <!-- Hover Actions Toolbar -->
          <div class="pt-2 border-t border-slate-800/80 light:border-slate-200/80 flex items-center justify-between text-xs" @click.stop>
            <template v-if="item.kind === 'folder'">
              <button
                @click="confirmDeleteFolder(item.folderPath)"
                class="px-2 py-1 rounded bg-slate-800 light:bg-slate-100 hover:bg-rose-700 text-slate-400 hover:text-white transition text-[11px] font-medium flex items-center gap-1"
                title="Delete Folder"
              >
                <Trash2 class="w-3 h-3" />
                <span>Delete</span>
              </button>
            </template>
            <template v-else>
              <button
                @click="openVersionModal(item)"
                class="px-2 py-1 rounded bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:bg-slate-200 text-indigo-300 hover:text-indigo-200 transition text-[11px] font-medium flex items-center gap-1"
                title="Upload New Version"
              >
                <RefreshCw class="w-3 h-3" />
                <span>New Version</span>
              </button>
              <div class="flex items-center gap-1">
                <button
                  @click="tabsStore.openAsset(item.id)"
                  class="p-1.5 rounded hover:bg-slate-800 light:bg-slate-100 text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 transition"
                  title="Open Asset"
                >
                  <Eye class="w-3.5 h-3.5 text-indigo-400" />
                </button>
                <button
                  @click="openAssetInNewTab(item)"
                  class="p-1.5 rounded hover:bg-slate-800 light:bg-slate-100 text-slate-400 light:text-slate-600 hover:text-indigo-300 transition"
                  title="Open Asset URL in New Tab"
                >
                  <ExternalLink class="w-3.5 h-3.5" />
                </button>
                <button
                  @click="copyAssetUrl(item)"
                  class="p-1.5 rounded hover:bg-slate-800 light:bg-slate-100 text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 transition"
                  title="Copy Asset URL"
                >
                  <Link class="w-3.5 h-3.5" />
                </button>
                <button
                  @click="deleteAsset(item.id)"
                  class="p-1.5 rounded hover:bg-rose-950 text-slate-400 light:text-slate-600 hover:text-rose-400 transition"
                  title="Delete Asset"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- LIST / TABLE VIEW WITH CLICKABLE SORT HEADERS -->
      <div v-else-if="viewMode === 'list' && paginatedItems.length > 0" class="overflow-x-auto rounded-xl border border-slate-800 light:border-slate-200 bg-slate-900/60 light:bg-white/60 shadow-xl">
        <table class="w-full text-left text-xs text-slate-300 light:text-slate-700">
          <thead class="bg-slate-950/80 light:bg-white/80 border-b border-slate-800 light:border-slate-200 text-[11px] font-semibold text-slate-400 light:text-slate-600 uppercase tracking-wider select-none">
            <tr>
              <th class="py-3 px-3 w-10 text-center select-none" @click.stop>
                <input
                  type="checkbox"
                  :checked="isAllPageSelected"
                  @change="toggleSelectAllPage"
                  class="w-4 h-4 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-500 focus:ring-indigo-500 cursor-pointer"
                  title="Select all on this page"
                />
              </th>
              <th v-if="visibleColumns.thumbnail" class="py-3 px-4 w-12 text-center">Preview</th>

              <th v-if="visibleColumns.filename" @click="toggleSort('filename')" class="py-3 px-4 cursor-pointer hover:text-slate-200 light:text-slate-800 transition">
                <div class="flex items-center gap-1">
                  <span>Filename</span>
                  <ArrowUp v-if="sortColumn === 'filename' && sortDirection === 'asc'" class="w-3 h-3 text-indigo-400" />
                  <ArrowDown v-else-if="sortColumn === 'filename' && sortDirection === 'desc'" class="w-3 h-3 text-indigo-400" />
                  <ArrowUpDown v-else class="w-3 h-3 text-slate-600 light:text-slate-400 opacity-40" />
                </div>
              </th>

              <th v-if="visibleColumns.path" @click="toggleSort('pimcorePath')" class="py-3 px-4 cursor-pointer hover:text-slate-200 light:text-slate-800 transition">
                <div class="flex items-center gap-1">
                  <span>Asset Path</span>
                  <ArrowUp v-if="sortColumn === 'pimcorePath' && sortDirection === 'asc'" class="w-3 h-3 text-indigo-400" />
                  <ArrowDown v-else-if="sortColumn === 'pimcorePath' && sortDirection === 'desc'" class="w-3 h-3 text-indigo-400" />
                  <ArrowUpDown v-else class="w-3 h-3 text-slate-600 light:text-slate-400 opacity-40" />
                </div>
              </th>

              <th v-if="visibleColumns.fileType" @click="toggleSort('fileType')" class="py-3 px-4 cursor-pointer hover:text-slate-200 light:text-slate-800 transition">
                <div class="flex items-center gap-1">
                  <span>Type</span>
                  <ArrowUp v-if="sortColumn === 'fileType' && sortDirection === 'asc'" class="w-3 h-3 text-indigo-400" />
                  <ArrowDown v-else-if="sortColumn === 'fileType' && sortDirection === 'desc'" class="w-3 h-3 text-indigo-400" />
                  <ArrowUpDown v-else class="w-3 h-3 text-slate-600 light:text-slate-400 opacity-40" />
                </div>
              </th>

              <th v-if="visibleColumns.dimensions" class="py-3 px-4">Dimensions</th>

              <th v-if="visibleColumns.size" @click="toggleSort('sizeBytes')" class="py-3 px-4 cursor-pointer hover:text-slate-200 light:text-slate-800 transition">
                <div class="flex items-center gap-1">
                  <span>Size</span>
                  <ArrowUp v-if="sortColumn === 'sizeBytes' && sortDirection === 'asc'" class="w-3 h-3 text-indigo-400" />
                  <ArrowDown v-else-if="sortColumn === 'sizeBytes' && sortDirection === 'desc'" class="w-3 h-3 text-indigo-400" />
                  <ArrowUpDown v-else class="w-3 h-3 text-slate-600 light:text-slate-400 opacity-40" />
                </div>
              </th>

              <th v-if="visibleColumns.visibility" @click="toggleSort('isPublic')" class="py-3 px-4 cursor-pointer hover:text-slate-200 light:text-slate-800 transition">
                <div class="flex items-center gap-1">
                  <span>Visibility</span>
                  <ArrowUp v-if="sortColumn === 'isPublic' && sortDirection === 'asc'" class="w-3 h-3 text-indigo-400" />
                  <ArrowDown v-else-if="sortColumn === 'isPublic' && sortDirection === 'desc'" class="w-3 h-3 text-indigo-400" />
                  <ArrowUpDown v-else class="w-3 h-3 text-slate-600 light:text-slate-400 opacity-40" />
                </div>
              </th>

              <th v-if="visibleColumns.version" @click="toggleSort('version')" class="py-3 px-4 cursor-pointer hover:text-slate-200 light:text-slate-800 transition">
                <div class="flex items-center gap-1">
                  <span>Version</span>
                  <ArrowUp v-if="sortColumn === 'version' && sortDirection === 'asc'" class="w-3 h-3 text-indigo-400" />
                  <ArrowDown v-else-if="sortColumn === 'version' && sortDirection === 'desc'" class="w-3 h-3 text-indigo-400" />
                  <ArrowUpDown v-else class="w-3 h-3 text-slate-600 light:text-slate-400 opacity-40" />
                </div>
              </th>

              <th v-if="visibleColumns.uploadedAt" @click="toggleSort('uploadedAt')" class="py-3 px-4 cursor-pointer hover:text-slate-200 light:text-slate-800 transition">
                <div class="flex items-center gap-1">
                  <span>Uploaded</span>
                  <ArrowUp v-if="sortColumn === 'uploadedAt' && sortDirection === 'asc'" class="w-3 h-3 text-indigo-400" />
                  <ArrowDown v-else-if="sortColumn === 'uploadedAt' && sortDirection === 'desc'" class="w-3 h-3 text-indigo-400" />
                  <ArrowUpDown v-else class="w-3 h-3 text-slate-600 light:text-slate-400 opacity-40" />
                </div>
              </th>

              <th v-if="visibleColumns.updatedAt" @click="toggleSort('updatedAt')" class="py-3 px-4 cursor-pointer hover:text-slate-200 light:text-slate-800 transition">
                <div class="flex items-center gap-1">
                  <span>Updated</span>
                  <ArrowUp v-if="sortColumn === 'updatedAt' && sortDirection === 'asc'" class="w-3 h-3 text-indigo-400" />
                  <ArrowDown v-else-if="sortColumn === 'updatedAt' && sortDirection === 'desc'" class="w-3 h-3 text-indigo-400" />
                  <ArrowUpDown v-else class="w-3 h-3 text-slate-600 light:text-slate-400 opacity-40" />
                </div>
              </th>

              <th v-if="visibleColumns.s3Key" @click="toggleSort('s3Key')" class="py-3 px-4 cursor-pointer hover:text-slate-200 light:text-slate-800 transition">
                <div class="flex items-center gap-1">
                  <span>S3 Key</span>
                  <ArrowUp v-if="sortColumn === 's3Key' && sortDirection === 'asc'" class="w-3 h-3 text-indigo-400" />
                  <ArrowDown v-else-if="sortColumn === 's3Key' && sortDirection === 'desc'" class="w-3 h-3 text-indigo-400" />
                  <ArrowUpDown v-else class="w-3 h-3 text-slate-600 light:text-slate-400 opacity-40" />
                </div>
              </th>

              <th v-if="visibleColumns.actions" class="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
<tbody class="divide-y divide-slate-800/60 light:divide-slate-200/60">
            <template v-for="item in paginatedItems" :key="item.id">
              <!-- Folder row -->
              <tr v-if="item.kind === 'folder'"
                @click="navigateToFolder(item.folderPath)"
                class="transition cursor-pointer hover:bg-slate-800/10 light:bg-slate-100/50"
              >
                <td class="py-2.5 px-3 text-center"></td>
                <td v-if="visibleColumns.thumbnail" class="py-2.5 px-4 text-center">
                  <div class="w-14 h-14 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 flex items-center justify-center mx-auto">
                    <Folder class="w-6 h-6 text-indigo-400" />
                  </div>
                </td>
                <td v-if="visibleColumns.filename" class="py-2.5 px-4 font-semibold text-slate-100 light:text-slate-900" :title="item.filename">
                  <span class="flex items-center gap-1.5"><Folder class="w-3.5 h-3.5 text-indigo-400 shrink-0" /> {{ item.filename }}</span>
                </td>
                <td v-if="visibleColumns.path" class="py-2.5 px-4 font-mono text-indigo-300" :title="item.pimcorePath">{{ item.pimcorePath }}</td>
                <td v-if="visibleColumns.fileType" class="py-2.5 px-4 text-slate-400 light:text-slate-600">
                  <span class="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-slate-950 light:bg-slate-50 text-slate-300 light:text-slate-700 border border-slate-800 light:border-slate-200">folder</span>
                </td>
                <td v-if="visibleColumns.dimensions" class="py-2.5 px-4 text-slate-400 light:text-slate-600 font-mono">—</td>
                <td v-if="visibleColumns.size" class="py-2.5 px-4 text-slate-400 light:text-slate-600 font-mono">—</td>
                <td v-if="visibleColumns.visibility" class="py-2.5 px-4">
                  <span :class="['px-2 py-0.5 text-[10px] font-bold rounded-full border', item.isPublic ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30']">
                    {{ item.isPublic ? 'PUBLIC' : 'PRIVATE' }}
                  </span>
                </td>
                <td v-if="visibleColumns.version" class="py-2.5 px-4 font-mono text-slate-400 light:text-slate-600">—</td>
                <td v-if="visibleColumns.uploadedAt" class="py-2.5 px-4 text-slate-400 light:text-slate-600 text-[11px]">—</td>
                <td v-if="visibleColumns.updatedAt" class="py-2.5 px-4 text-slate-400 light:text-slate-600 text-[11px]">—</td>
                <td v-if="visibleColumns.s3Key" class="py-2.5 px-4 font-mono text-slate-400 light:text-slate-600">—</td>
                <td v-if="visibleColumns.actions" class="py-2.5 px-4 text-right" @click.stop>
                  <div class="flex items-center justify-end gap-1">
                    <button @click="confirmDeleteFolder(item.folderPath)"
                      class="p-1.5 rounded hover:bg-rose-950 text-slate-400 light:text-slate-600 hover:text-rose-400 transition"
                      title="Delete Folder">
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
              <!-- Asset row -->
              <tr v-else
                :key="item.id"
                @click="tabsStore.openAsset(item.id)"
                :class="[
                  'transition cursor-pointer',
                  selectedAssetIds.includes(item.id) ? 'bg-indigo-950/40 hover:bg-indigo-900/50' : 'hover:bg-slate-800/10 light:bg-slate-100/50'
                ]"
              >
                <td class="py-2.5 px-3 text-center" @click.stop>
                  <input
                    type="checkbox"
                    :value="item.id"
                    :checked="selectedAssetIds.includes(item.id)"
                    @change="toggleSelectAsset(item.id)"
                    class="w-4 h-4 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-500 focus:ring-indigo-500 cursor-pointer"
                  />
                </td>
                <td v-if="visibleColumns.thumbnail" class="py-2.5 px-4 text-center">
                  <div class="w-14 h-14 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 flex items-center justify-center overflow-hidden mx-auto">
                    <img
                      v-if="PREVIEWABLE_IMAGE_TYPES.includes(item.fileType ?? '')"
                      :src="item.dataUrl || item.thumbnailUrl || item.url"
                      @error="handleImageError($event, item)"
                      class="w-full h-full object-cover"
                    />
                    <component v-else :is="getIconForFileType(item.fileType ?? '')" class="w-4 h-4 text-slate-400 light:text-slate-600" />
                  </div>
                </td>
                <td v-if="visibleColumns.filename" class="py-2.5 px-4 font-semibold text-slate-100 light:text-slate-900 max-w-[200px] truncate" :title="item.filename">
                  {{ item.filename }}
                </td>
                <td v-if="visibleColumns.path" class="py-2.5 px-4 font-mono text-indigo-300 max-w-[180px] truncate" :title="item.pimcorePath">
                  {{ item.pimcorePath }}
                </td>
                <td v-if="visibleColumns.fileType" class="py-2.5 px-4 text-slate-400 light:text-slate-600">
                  <span class="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-slate-950 light:bg-slate-50 text-slate-300 light:text-slate-700 border border-slate-800 light:border-slate-200">
                    {{ item.fileType }}
                  </span>
                </td>
                <td v-if="visibleColumns.dimensions" class="py-2.5 px-4 text-slate-400 light:text-slate-600 font-mono">
                  <span v-if="item.metadata?.technical?.width && item.metadata?.technical?.height">
                    {{ item.metadata.technical.width }} × {{ item.metadata.technical.height }}
                  </span>
                  <span v-else class="text-slate-600 light:text-slate-400">—</span>
                </td>
                <td v-if="visibleColumns.size" class="py-2.5 px-4 text-slate-400 light:text-slate-600 font-mono">
                  {{ item.sizeFormatted }}
                </td>
                <td v-if="visibleColumns.visibility" class="py-2.5 px-4">
                  <span
                    :class="[
                      'px-2 py-0.5 text-[10px] font-bold rounded-full border',
                      item.isPublic ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    ]"
                  >
                    {{ item.isPublic ? 'PUBLIC' : 'PRIVATE' }}
                  </span>
                </td>
                <td v-if="visibleColumns.version" class="py-2.5 px-4 font-mono text-slate-400 light:text-slate-600">
                  v{{ item.version }}
                </td>
                <td v-if="visibleColumns.uploadedAt" class="py-2.5 px-4 text-slate-400 light:text-slate-600 text-[11px]">
                  {{ new Date(item.uploadedAt!).toLocaleDateString() }}
                </td>
                <td v-if="visibleColumns.updatedAt" class="py-2.5 px-4 text-slate-400 light:text-slate-600 text-[11px]">
                  {{ new Date(item.updatedAt!).toLocaleDateString() }}
                </td>
                <td v-if="visibleColumns.s3Key" class="py-2.5 px-4 font-mono text-slate-400 light:text-slate-600 max-w-[160px] truncate" :title="item.s3Key">
                  {{ item.s3Key }}
                </td>
                <td v-if="visibleColumns.actions" class="py-2.5 px-4 text-right" @click.stop>
                  <div class="flex items-center justify-end gap-1">
                    <button
                      @click="tabsStore.openAsset(item.id)"
                      class="p-1.5 rounded hover:bg-slate-800 light:bg-slate-100 text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 transition"
                      title="Open Asset"
                    >
                      <Eye class="w-3.5 h-3.5 text-indigo-400" />
                    </button>
                    <button
                      @click="openAssetInNewTab(item)"
                      class="p-1.5 rounded hover:bg-slate-800 light:bg-slate-100 text-slate-400 light:text-slate-600 hover:text-indigo-300 transition"
                      title="Open Asset URL in New Tab"
                    >
                      <ExternalLink class="w-3.5 h-3.5" />
                    </button>
                    <button
                      @click="copyAssetUrl(item)"
                      class="p-1.5 rounded hover:bg-slate-800 light:bg-slate-100 text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 transition"
                      title="Copy Asset URL"
                    >
                      <Link class="w-3.5 h-3.5" />
                    </button>
                    <button
                      @click="deleteAsset(item.id)"
                      class="p-1.5 rounded hover:bg-rose-950 text-slate-400 light:text-slate-600 hover:text-rose-400 transition"
                      title="Delete Asset"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Empty State -->
      <div v-else class="rounded-2xl bg-slate-900/40 light:bg-white/40 border border-slate-800/80 light:border-slate-200/80 p-12 text-center space-y-3">
        <Folder class="w-12 h-12 text-slate-600 light:text-slate-400 mx-auto" />
        <h4 class="text-sm font-semibold text-slate-300 light:text-slate-700">No assets found</h4>
        <p class="text-xs text-slate-500 max-w-sm mx-auto">No assets match your current filters in <code class="font-mono text-indigo-400">{{ damStore.currentFolderPath }}</code>.</p>
        <button
          v-if="hasActiveFilters"
          @click="resetFilters"
          class="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:bg-slate-200 text-indigo-300 transition inline-flex items-center gap-1.5 mt-2"
        >
          <X class="w-3.5 h-3.5" />
          <span>Reset Filters</span>
        </button>
        <button
          v-else
          @click="openUploadModal()"
          class="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition inline-flex items-center gap-1.5 mt-2"
        >
          <Upload class="w-3.5 h-3.5" />
          <span>Upload Multiple Files or ZIP</span>
        </button>
      </div>

      <!-- Pagination Controls Bar -->
      <div
        v-if="filteredAndSortedAssets.length > 0"
        class="rounded-xl bg-slate-900/80 light:bg-white/80 border border-slate-800 light:border-slate-200 p-3 flex flex-wrap items-center justify-between gap-3 text-xs"
      >
        <!-- Summary -->
        <div class="text-slate-400 light:text-slate-600 font-mono">
          Showing <strong class="text-indigo-300 font-bold">{{ paginationStartIndex }}</strong> -
          <strong class="text-indigo-300 font-bold">{{ paginationEndIndex }}</strong> of
          <strong class="text-slate-200 light:text-slate-800 font-bold">{{ unifiedItems.length }}</strong> items
        </div>

        <!-- Controls: Items Per Page & Page Navigation -->
        <div class="flex flex-wrap items-center gap-3">
          <!-- Items Per Page Selector -->
          <div class="flex items-center gap-1.5">
            <label class="text-[11px] text-slate-400 light:text-slate-600 font-medium">Per Page:</label>
            <select
              :value="isCustomPerPage ? 'CUSTOM' : perPageSelection"
              @change="handlePerPageChange"
              class="px-2.5 py-1.5 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer font-mono"
            >
              <option value="10">10</option>
              <option value="25">25 (Default)</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="CUSTOM">Custom...</option>
              <option value="ALL">All</option>
            </select>

            <!-- Custom Input Field -->
            <div v-if="isCustomPerPage" class="flex items-center gap-1">
              <input
                v-model.number="customPerPageInput"
                type="number"
                min="1"
                max="1000"
                class="w-16 px-2 py-1 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                @keyup.enter="applyCustomPerPage"
              />
              <button
                @click="applyCustomPerPage"
                class="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold transition"
              >
                Set
              </button>
            </div>
          </div>

          <!-- Page Navigation Buttons -->
          <div v-if="totalPages > 1" class="flex items-center gap-1">
            <!-- First Page -->
            <button
              @click="goToPage(1)"
              :disabled="currentPage === 1"
              class="p-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 disabled:opacity-30 disabled:hover:text-slate-400 light:text-slate-600 transition"
              title="First Page"
            >
              <ChevronsLeft class="w-3.5 h-3.5" />
            </button>

            <!-- Prev Page -->
            <button
              @click="goToPage(currentPage - 1)"
              :disabled="currentPage === 1"
              class="p-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 disabled:opacity-30 disabled:hover:text-slate-400 light:text-slate-600 transition"
              title="Previous Page"
            >
              <ChevronLeft class="w-3.5 h-3.5" />
            </button>

            <!-- Page Numbers -->
            <button
              v-for="p in totalPages"
              :key="p"
              @click="goToPage(p)"
              :class="[
                'px-2.5 py-1 rounded-lg border text-xs font-mono font-semibold transition',
                currentPage === p ? 'bg-indigo-600 text-white border-indigo-500 shadow' : 'bg-slate-950 light:bg-slate-50 text-slate-400 light:text-slate-600 border-slate-800 light:border-slate-200 hover:text-slate-200 light:text-slate-800'
              ]"
            >
              {{ p }}
            </button>

            <!-- Next Page -->
            <button
              @click="goToPage(currentPage + 1)"
              :disabled="currentPage === totalPages"
              class="p-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 disabled:opacity-30 disabled:hover:text-slate-400 light:text-slate-600 transition"
              title="Next Page"
            >
              <ChevronRight class="w-3.5 h-3.5" />
            </button>

            <!-- Last Page -->
            <button
              @click="goToPage(totalPages)"
              :disabled="currentPage === totalPages"
              class="p-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 disabled:opacity-30 disabled:hover:text-slate-400 light:text-slate-600 transition"
              title="Last Page"
            >
              <ChevronsRight class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal 1: Upload Multiple Assets (with ZIP Support) -->
    <div v-if="showUploadModal" class="fixed inset-0 bg-slate-950/80 light:bg-white/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div class="bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-bold text-slate-100 light:text-slate-900 flex items-center gap-2">
            <Upload class="w-4 h-4 text-indigo-400" />
            Upload Assets to {{ damStore.currentFolderPath }}
          </h3>
          <button @click="showUploadModal = false" class="text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 transition text-sm">✕</button>
        </div>

        <!-- Dropzone / File Picker (Supports Multiple Files) -->
        <div
          @dragover.prevent
          @drop.prevent="handleFileDrop"
          class="border-2 border-dashed border-slate-800 light:border-slate-200 hover:border-indigo-500/50 rounded-xl p-6 text-center bg-slate-950/50 light:bg-white/50 transition cursor-pointer"
          @click="triggerFileInputClick"
        >
          <input
            ref="fileInput"
            type="file"
            multiple
            class="hidden"
            @change="handleFileSelect"
          />
          <Upload class="w-8 h-8 text-indigo-400 mx-auto mb-2" />
          <p class="text-xs font-semibold text-slate-200 light:text-slate-800">Click to choose multiple files or drag and drop</p>
          <p class="text-[11px] text-slate-500 mt-1">Select PNG, JPG, SVG, PDF, MP4, or ZIP archives</p>
        </div>

        <!-- Selected Batch File Queue -->
        <div v-if="selectedFiles.length > 0" class="space-y-2 max-h-48 overflow-y-auto pr-1">
          <div class="flex items-center justify-between text-xs text-slate-400 light:text-slate-600 font-medium">
            <span>Selected Files ({{ selectedFiles.length }})</span>
            <button @click="selectedFiles = []" class="text-rose-400 hover:underline text-[11px]">Clear All</button>
          </div>

          <div v-for="(file, idx) in selectedFiles" :key="idx" class="p-2.5 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 flex items-center justify-between text-xs">
            <div class="flex items-center gap-2 truncate">
              <FileArchive v-if="file.name.toLowerCase().endsWith('.zip')" class="w-4 h-4 text-amber-400 shrink-0" />
              <component v-else :is="getIconForFilename(file.name)" class="w-4 h-4 text-indigo-400 shrink-0" />
              <span class="font-medium text-slate-200 light:text-slate-800 truncate">{{ file.name }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-slate-500 font-mono text-[10px]">{{ (file.size / 1024 / 1024).toFixed(2) }} MB</span>
              <button @click="removeSelectedFile(idx)" class="text-slate-500 hover:text-rose-400">✕</button>
            </div>
          </div>

          <!-- ZIP Option if any ZIP file in batch -->
          <div v-if="hasZipInBatch" class="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-2 mt-2">
            <span class="text-xs font-semibold text-amber-300">ZIP archive handling</span>
            <div class="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                @click="zipMode = 'extract'"
                :class="['p-2 rounded-lg border text-left transition text-xs', zipMode === 'extract' ? 'bg-amber-500/20 border-amber-500/50 text-amber-200' : 'border-slate-700 text-slate-400 hover:border-slate-600']"
              >
                <div class="font-semibold">Extract</div>
                <div class="text-[10px] text-slate-500">preserve folders</div>
              </button>
              <button
                type="button"
                @click="zipMode = 'flatten'"
                :class="['p-2 rounded-lg border text-left transition text-xs', zipMode === 'flatten' ? 'bg-amber-500/20 border-amber-500/50 text-amber-200' : 'border-slate-700 text-slate-400 hover:border-slate-600']"
              >
                <div class="font-semibold">Flatten</div>
                <div class="text-[10px] text-slate-500">files only, no folders</div>
              </button>
              <button
                type="button"
                @click="zipMode = 'upload'"
                :class="['p-2 rounded-lg border text-left transition text-xs', zipMode === 'upload' ? 'bg-amber-500/20 border-amber-500/50 text-amber-200' : 'border-slate-700 text-slate-400 hover:border-slate-600']"
              >
                <div class="font-semibold">Upload</div>
                <div class="text-[10px] text-slate-500">keep .zip as-is</div>
              </button>
            </div>
            <div v-if="zipMode !== 'upload'" class="pl-2 pt-1 space-y-1.5">
              <span class="text-[10px] font-semibold text-slate-400 uppercase">Extracted assets visibility</span>
              <div class="flex items-center gap-4">
                <label class="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                  <input type="radio" v-model="zipVisibility" value="public"
                    class="w-3.5 h-3.5 text-indigo-600 border-slate-700 bg-slate-950" />
                  Public
                </label>
                <label class="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                  <input type="radio" v-model="zipVisibility" value="private"
                    class="w-3.5 h-3.5 text-indigo-600 border-slate-700 bg-slate-950" />
                  Private
                </label>
              </div>
            </div>
          </div>
        </div>

        <div v-if="isUploading && damStore.uploadProgress" class="px-3 py-2 space-y-1">
          <div class="flex items-center justify-between text-[11px] text-slate-400">
            <span class="truncate">{{ damStore.uploadProgress.label }}</span>
            <span>{{ damStore.uploadProgress.current }} / {{ damStore.uploadProgress.total }}</span>
          </div>
          <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              class="h-full bg-indigo-500 rounded-full transition-all duration-300"
              :style="{ width: `${(damStore.uploadProgress.current / damStore.uploadProgress.total) * 100}%` }"
            ></div>
          </div>
        </div>

        <!-- ZIP extraction progress -->
        <div v-if="damStore.extractProgress" class="px-3 py-2 space-y-2">
          <div class="text-[11px] font-semibold text-amber-400 flex items-center gap-1.5">
            <span class="animate-spin w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full"></span>
            Extracting ZIP &middot; {{ damStore.extractProgress.current }} / {{ damStore.extractProgress.total }} files
          </div>
          <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              class="h-full bg-amber-500 rounded-full transition-all duration-300"
              :style="{ width: `${(damStore.extractProgress.current / damStore.extractProgress.total) * 100}%` }"
            ></div>
          </div>
          <div v-if="damStore.extractProgress.filename" class="text-[11px] font-mono text-indigo-300 truncate">
            {{ damStore.extractProgress.filename }}
          </div>
          <div v-if="damStore.extractProgress.recent.length > 0" class="space-y-0.5 max-h-[18rem] overflow-y-auto">
            <div v-for="(line, idx) in damStore.extractProgress.recent" :key="idx"
              class="text-[10px] font-mono text-slate-500 truncate">
              {{ line }}
            </div>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-800 light:border-slate-200">
          <button
            @click="showUploadModal = false"
            :disabled="isUploading"
            class="px-4 py-2 text-xs font-medium rounded-xl text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 transition disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            @click="submitUploadBatch"
            :disabled="selectedFiles.length === 0 || isUploading"
            class="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <span v-if="isUploading" class="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>
            <span>{{ isUploading ? 'Uploading...' : `Upload (${selectedFiles.length}) Files` }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Modal 2: Create Folder (Asks if PUBLIC or PRIVATE) -->
    <div v-if="showCreateFolderModal" class="fixed inset-0 bg-slate-950/80 light:bg-white/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div class="bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-bold text-slate-100 light:text-slate-900 flex items-center gap-2">
            <FolderPlus class="w-4 h-4 text-indigo-400" />
            Create Virtual Folder
          </h3>
          <button @click="showCreateFolderModal = false" class="text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 transition text-sm">✕</button>
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Folder Name</label>
          <input
            v-model="newFolderName"
            type="text"
            placeholder="e.g. branding-assets"
            class="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
            @keyup.enter="submitCreateFolder"
          />
          <p class="text-[11px] text-slate-500 mt-1">
            Path preview: <code class="font-mono text-indigo-300">{{ damStore.currentFolderPath === '/' ? '/' + (newFolderName || 'name') : damStore.currentFolderPath + '/' + (newFolderName || 'name') }}</code>
          </p>
        </div>

        <!-- Folder Visibility Toggle Selection -->
        <div class="p-3 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 space-y-2">
          <label class="block text-xs font-semibold text-slate-300 light:text-slate-700">Folder Visibility Strategy</label>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              @click="newFolderIsPublic = false"
              :class="[
                'p-2.5 rounded-xl border text-left transition',
                !newFolderIsPublic ? 'bg-amber-500/10 border-amber-500/40 text-amber-300' : 'bg-slate-900 light:bg-white border-slate-800 light:border-slate-200 text-slate-400 light:text-slate-600 hover:border-slate-700 light:border-slate-300'
              ]"
            >
              <div class="font-bold text-xs">PRIVATE</div>
              <div class="text-[10px] text-slate-400 light:text-slate-600">Signed short-lived URLs</div>
            </button>

            <button
              type="button"
              @click="newFolderIsPublic = true"
              :class="[
                'p-2.5 rounded-xl border text-left transition',
                newFolderIsPublic ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-slate-900 light:bg-white border-slate-800 light:border-slate-200 text-slate-400 light:text-slate-600 hover:border-slate-700 light:border-slate-300'
              ]"
            >
              <div class="font-bold text-xs">PUBLIC</div>
              <div class="text-[10px] text-slate-400 light:text-slate-600">Direct CDN access</div>
            </button>
          </div>
          <p class="text-[11px] text-slate-500 mt-1">
            <span v-if="newFolderIsPublic" class="text-emerald-400">All assets uploaded to this folder will be publicly accessible via direct CDN links.</span>
            <span v-else class="text-amber-400">All assets uploaded to this folder will be private by default.</span>
          </p>
        </div>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-800 light:border-slate-200">
          <button
            @click="showCreateFolderModal = false"
            class="px-4 py-2 text-xs font-medium rounded-xl text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 transition"
          >
            Cancel
          </button>
          <button
            @click="submitCreateFolder"
            :disabled="!newFolderName.trim()"
            class="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition disabled:opacity-50"
          >
            Create Folder
          </button>
        </div>
      </div>
    </div>

    <!-- Modal 3: Upload New Version -->
    <DamVersionUploadModal
      :is-open="showVersionModal"
      :asset="selectedAssetForVersion"
      @close="showVersionModal = false"
    />
  </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  Folder,
  FolderPlus,
  Upload,
  Trash2,
  RefreshCw,
  FileArchive,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Link,
  Eye,
  LayoutGrid,
  List,
  SlidersHorizontal,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  ExternalLink,
  Download,
  CheckSquare
} from '@lucide/vue'
import JSZip from 'jszip'
import { useDamStore, AssetItem } from '../stores/damStore'
import { useTabsStore } from '../stores/tabsStore'
import { useToastStore } from '../stores/toastStore'
import DamVersionUploadModal from '../components/dam/DamVersionUploadModal.vue'
import { getIconForFileType, getIconForFilename, PREVIEWABLE_IMAGE_TYPES } from '../utils/asset-file-icons'
import { handleAssetImageError } from '../utils/asset-image-heal'

const damStore = useDamStore()
const tabsStore = useTabsStore()
const toastStore = useToastStore()

const showUploadModal = ref(false)
const showCreateFolderModal = ref(false)
const showVersionModal = ref(false)
const showColumnConfig = ref(false)

async function openAssetInNewTab(item: UnifiedItem) {
  const asset = damStore.assets.find((a) => a.id === item.id)
  if (!asset) return
  const targetUrl = (await damStore.getAssetUrl(asset)) || asset.url || asset.pimcorePath
  if (!targetUrl) return
  window.open(targetUrl, '_blank', 'noopener,noreferrer')
}

const VIEW_MODE_KEY = 'whoobe_custom_dam_view_mode'
const COLUMNS_KEY = 'whoobe_custom_dam_columns'

const viewMode = ref<'grid' | 'list'>(
  (localStorage.getItem(VIEW_MODE_KEY) as 'grid' | 'list') || 'grid'
)

function setViewMode(mode: 'grid' | 'list') {
  viewMode.value = mode
  localStorage.setItem(VIEW_MODE_KEY, mode)
}

export interface ColumnConfig {
  thumbnail: boolean
  filename: boolean
  path: boolean
  fileType: boolean
  dimensions: boolean
  size: boolean
  visibility: boolean
  version: boolean
  uploadedAt: boolean
  updatedAt: boolean
  s3Key: boolean
  actions: boolean
}

const defaultColumns: ColumnConfig = {
  thumbnail: true,
  filename: true,
  path: true,
  fileType: true,
  dimensions: true,
  size: true,
  visibility: true,
  version: true,
  uploadedAt: true,
  updatedAt: false,
  s3Key: false,
  actions: true
}

function loadSavedColumns(): ColumnConfig {
  try {
    const saved = localStorage.getItem(COLUMNS_KEY)
    if (saved) return { ...defaultColumns, ...JSON.parse(saved) }
  } catch {}
  return { ...defaultColumns }
}

const visibleColumns = ref<ColumnConfig>(loadSavedColumns())

function toggleColumn(key: keyof ColumnConfig) {
  visibleColumns.value[key] = !visibleColumns.value[key]
  localStorage.setItem(COLUMNS_KEY, JSON.stringify(visibleColumns.value))
}

// --- Multi-Column Filtering & Dynamic Column Sorting ---
export type SortableColumn = 'filename' | 'pimcorePath' | 'fileType' | 'sizeBytes' | 'isPublic' | 'version' | 'uploadedAt' | 'updatedAt' | 's3Key'

const searchQuery = ref('')
const filterType = ref<string>('ALL')
const filterVisibility = ref<string>('ALL')

const sortColumn = ref<SortableColumn>('uploadedAt')
const sortDirection = ref<'asc' | 'desc'>('desc')

function toggleSort(col: SortableColumn) {
  if (sortColumn.value === col) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortColumn.value = col
    sortDirection.value = 'asc'
  }
}

function resetFilters() {
  searchQuery.value = ''
  filterType.value = 'ALL'
  filterVisibility.value = 'ALL'
}

const hasActiveFilters = computed(() => {
  return searchQuery.value.trim() !== '' || filterType.value !== 'ALL' || filterVisibility.value !== 'ALL'
})

const filteredAndSortedAssets = computed(() => {
  let list = damStore.currentAssets

  // 1. Text Search Filter across filename, pimcorePath, fileType, and s3Key
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(
      (a) =>
        a.filename.toLowerCase().includes(q) ||
        a.pimcorePath.toLowerCase().includes(q) ||
        a.fileType.toLowerCase().includes(q) ||
        a.s3Key.toLowerCase().includes(q)
    )
  }

  // 2. File Type Filter
  if (filterType.value !== 'ALL') {
    if (filterType.value === 'IMAGE') {
      list = list.filter((a) => PREVIEWABLE_IMAGE_TYPES.includes(a.fileType))
    } else if (filterType.value === 'VIDEO') {
      list = list.filter((a) => a.fileType === 'MP4')
    } else if (filterType.value === 'DOCUMENT') {
      list = list.filter((a) => a.fileType === 'PDF')
    } else if (filterType.value === 'ARCHIVE') {
      list = list.filter((a) => a.fileType === 'ZIP')
    } else {
      list = list.filter((a) => a.fileType === filterType.value)
    }
  }

  // 3. Visibility Filter
  if (filterVisibility.value !== 'ALL') {
    const isPub = filterVisibility.value === 'PUBLIC'
    list = list.filter((a) => a.isPublic === isPub)
  }

  // 4. Column Sorting
  return [...list].sort((a, b) => {
    let valA: any = a[sortColumn.value]
    let valB: any = b[sortColumn.value]

    if (valA === undefined) valA = ''
    if (valB === undefined) valB = ''

    if (typeof valA === 'string') valA = valA.toLowerCase()
    if (typeof valB === 'string') valB = valB.toLowerCase()

    if (valA < valB) return sortDirection.value === 'asc' ? -1 : 1
    if (valA > valB) return sortDirection.value === 'asc' ? 1 : -1
    return 0
  })
})

// --- Pagination State & Logic ---
const PER_PAGE_STORAGE_KEY = 'whoobe_custom_dam_per_page'

const currentPage = ref(1)
const perPageSelection = ref<string>(
  localStorage.getItem(PER_PAGE_STORAGE_KEY) || '25'
)
const customPerPageInput = ref<number>(25)
const isCustomPerPage = ref(false)

if (['10', '25', '50', '100', '200', 'ALL'].includes(perPageSelection.value)) {
  isCustomPerPage.value = false
} else {
  const parsed = parseInt(perPageSelection.value, 10)
  if (!isNaN(parsed) && parsed > 0) {
    customPerPageInput.value = parsed
    isCustomPerPage.value = true
  } else {
    perPageSelection.value = '25'
  }
}

const itemsPerPageLimit = computed(() => {
  if (perPageSelection.value === 'ALL') return Infinity
  if (isCustomPerPage.value) return customPerPageInput.value > 0 ? customPerPageInput.value : 25
  return parseInt(perPageSelection.value, 10) || 25
})

function handlePerPageChange(e: Event) {
  const val = (e.target as HTMLSelectElement).value
  if (val === 'CUSTOM') {
    isCustomPerPage.value = true
  } else {
    isCustomPerPage.value = false
    perPageSelection.value = val
    localStorage.setItem(PER_PAGE_STORAGE_KEY, val)
  }
  currentPage.value = 1
}

function applyCustomPerPage() {
  if (customPerPageInput.value < 1) customPerPageInput.value = 1
  perPageSelection.value = customPerPageInput.value.toString()
  localStorage.setItem(PER_PAGE_STORAGE_KEY, customPerPageInput.value.toString())
  currentPage.value = 1
}

// Unified list: folders first, then assets, sorted by name
interface UnifiedItem {
  kind: 'folder' | 'asset'
  id: string
  filename: string
  pimcorePath: string
  folderPath: string
  isPublic: boolean
  fileType?: string
  sizeFormatted?: string
  version?: number
  url?: string
  dataUrl?: string
  thumbnailUrl?: string
  uploadedAt?: string
  updatedAt?: string
  s3Key?: string
  metadata?: { technical?: { width?: number; height?: number } }
}

const unifiedItems = computed<UnifiedItem[]>(() => {
  const folders: UnifiedItem[] = damStore.currentSubfolders.map((f) => ({
    kind: 'folder',
    id: `folder:${f.path}`,
    filename: f.name,
    pimcorePath: f.path,
    folderPath: f.path,
    isPublic: f.isPublic ?? false,
  }))
  const assets: UnifiedItem[] = filteredAndSortedAssets.value.map((a) => ({
    kind: 'asset',
    id: a.id,
    filename: a.filename,
    pimcorePath: a.pimcorePath,
    folderPath: a.folderPath,
    isPublic: a.isPublic,
    fileType: a.fileType,
    sizeFormatted: a.sizeFormatted,
    version: a.version,
    url: a.url,
    dataUrl: a.dataUrl,
    thumbnailUrl: a.thumbnailUrl,
    uploadedAt: a.uploadedAt,
    updatedAt: a.updatedAt,
    s3Key: a.s3Key,
    metadata: a.metadata,
  }))
  return [...folders, ...assets].sort((a, b) => a.filename.localeCompare(b.filename))
})

const paginatedItems = computed(() => {
  if (itemsPerPageLimit.value === Infinity) return unifiedItems.value
  const start = (currentPage.value - 1) * itemsPerPageLimit.value
  return unifiedItems.value.slice(start, start + itemsPerPageLimit.value)
})

const totalPages = computed(() => {
  if (itemsPerPageLimit.value === Infinity) return 1
  const count = unifiedItems.value.length
  return Math.max(1, Math.ceil(count / itemsPerPageLimit.value))
})

watch([filteredAndSortedAssets, unifiedItems, itemsPerPageLimit], () => {
  if (currentPage.value > totalPages.value) {
    currentPage.value = totalPages.value
  }
})

const paginationStartIndex = computed(() => {
  if (unifiedItems.value.length === 0) return 0
  if (itemsPerPageLimit.value === Infinity) return 1
  return (currentPage.value - 1) * itemsPerPageLimit.value + 1
})

const paginationEndIndex = computed(() => {
  if (itemsPerPageLimit.value === Infinity) return unifiedItems.value.length
  return Math.min(currentPage.value * itemsPerPageLimit.value, unifiedItems.value.length)
})

function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
  }
}

// --- Selection State & Actions ---
const selectedAssetIds = ref<string[]>([])
const isDownloadingZip = ref(false)

const isAllPageSelected = computed(() => {
  const pageAssetIds = paginatedItems.value.filter((a) => a.kind === 'asset')
  if (pageAssetIds.length === 0) return false
  return pageAssetIds.every((a) => selectedAssetIds.value.includes(a.id))
})

const isAllFilteredSelected = computed(() => {
  const assetIds = unifiedItems.value.filter((a) => a.kind === 'asset')
  if (assetIds.length === 0) return false
  return assetIds.every((a) => selectedAssetIds.value.includes(a.id))
})

function toggleSelectAllPage() {
  const pageAssetIds = paginatedItems.value.filter((a) => a.kind === 'asset').map((a) => a.id)
  if (isAllPageSelected.value) {
    selectedAssetIds.value = selectedAssetIds.value.filter((id) => !pageAssetIds.includes(id))
  } else {
    const set = new Set([...selectedAssetIds.value, ...pageAssetIds])
    selectedAssetIds.value = Array.from(set)
  }
}

function selectAllFiltered() {
  selectedAssetIds.value = unifiedItems.value.filter((a) => a.kind === 'asset').map((a) => a.id)
}

function clearSelection() {
  selectedAssetIds.value = []
}

function toggleSelectAsset(id: string) {
  const idx = selectedAssetIds.value.indexOf(id)
  if (idx >= 0) {
    selectedAssetIds.value.splice(idx, 1)
  } else {
    selectedAssetIds.value.push(id)
  }
}

async function deleteSelectedAssets() {
  const count = selectedAssetIds.value.length
  if (count === 0) return
  if (confirm(`Are you sure you want to delete ${count} selected asset(s) from DAM storage?`)) {
    for (const id of selectedAssetIds.value) {
      await damStore.deleteAsset(id)
      tabsStore.closeAssetTab(id)
    }
    toastStore.show(`Deleted ${count} asset(s) from DAM storage.`)
    selectedAssetIds.value = []
  }
}

async function downloadSelectedAssets() {
  const count = selectedAssetIds.value.length
  if (count === 0) return

  const selectedItems = damStore.assets.filter((a) => selectedAssetIds.value.includes(a.id))

  if (selectedItems.length === 1) {
    const asset = selectedItems[0]
    const url = (await damStore.getAssetUrl(asset)) || asset.url || asset.pimcorePath
    const link = document.createElement('a')
    link.href = url
    link.download = asset.filename
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toastStore.show(`Downloading ${asset.filename}...`)
    return
  }

  isDownloadingZip.value = true
  toastStore.show(`Preparing ZIP archive for ${selectedItems.length} assets...`)

  try {
    const zip = new JSZip()
    const folder = zip.folder('dam_assets')

    for (const asset of selectedItems) {
      const url = (await damStore.getAssetUrl(asset)) || asset.url || asset.pimcorePath
      try {
        if (asset.dataUrl && asset.dataUrl.startsWith('data:')) {
          const parts = asset.dataUrl.split(',')
          const bstr = atob(parts[1])
          let n = bstr.length
          const u8arr = new Uint8Array(n)
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n)
          }
          folder?.file(asset.filename, u8arr)
        } else {
          const response = await fetch(url)
          if (response.ok) {
            const blob = await response.blob()
            folder?.file(asset.filename, blob)
          } else {
            folder?.file(asset.filename, `Asset path: ${asset.pimcorePath}`)
          }
        }
      } catch (e) {
        console.warn(`Could not add ${asset.filename} to zip:`, e)
        folder?.file(asset.filename, `Asset path: ${asset.pimcorePath}`)
      }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const zipUrl = URL.createObjectURL(zipBlob)
    const link = document.createElement('a')
    link.href = zipUrl
    link.download = `dam_assets_${Date.now()}.zip`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(zipUrl)

    toastStore.show(`Downloaded ZIP archive with ${selectedItems.length} assets!`)
  } catch (err: any) {
    alert(`Failed to create ZIP download: ${err.message}`)
  } finally {
    isDownloadingZip.value = false
  }
}

const selectedFiles = ref<File[]>([])
const selectedAssetForVersion = ref<AssetItem | null>(null)
const newFolderName = ref('')
const newFolderIsPublic = ref(false)
const zipMode = ref<'extract' | 'flatten' | 'upload'>('extract')
const zipVisibility = ref<'public' | 'private'>('public')
const isUploading = ref(false)
const isRegenerating = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function triggerFileInputClick() {
  fileInput.value?.click()
}

const breadcrumbs = computed(() => {
  if (damStore.currentFolderPath === '/') return []
  const parts = damStore.currentFolderPath.split('/').filter(Boolean)
  let accum = ''
  return parts.map((part) => {
    accum += `/${part}`
    return { name: part, path: accum }
  })
})

const hasZipInBatch = computed(() => {
  return selectedFiles.value.some((f) => f.name.toLowerCase().endsWith('.zip'))
})

function navigateToFolder(path: string) {
  damStore.currentFolderPath = path
}

function openUploadModal() {
  selectedFiles.value = []
  zipMode.value = 'extract'
  zipVisibility.value = 'public'
  showUploadModal.value = true
}

async function regenerateAllThumbnails() {
  // Collect all image assets from current folder and all subfolders recursively
  function collectImagePaths(folderPath: string): string[] {
    const paths: string[] = []
    for (const a of damStore.assets) {
      if (a.folderPath === folderPath || a.folderPath.startsWith(folderPath === '/' ? '/' : folderPath + '/')) {
        if (PREVIEWABLE_IMAGE_TYPES.includes(a.fileType)) paths.push(a.pimcorePath)
      }
    }
    return paths
  }
  const paths = collectImagePaths(damStore.currentFolderPath)
  if (paths.length === 0) { toastStore.show('No image assets in this folder or subfolders'); return }
  if (!confirm(`Regenerate thumbnails for ${paths.length} image(s) in "${damStore.currentFolderPath}" and all subfolders?`)) return
  isRegenerating.value = true
  try {
    const result = await damStore.regenerateThumbnails(paths)
    toastStore.show(`Thumbnails: ${result.succeeded} OK, ${result.failed} failed`)
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to regenerate thumbnails')
  } finally {
    isRegenerating.value = false
  }
}

function handleFileSelect(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (files && files.length > 0) {
    selectedFiles.value = Array.from(files)
  }
}

function handleFileDrop(e: DragEvent) {
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    selectedFiles.value = Array.from(e.dataTransfer.files)
  }
}

function removeSelectedFile(index: number) {
  selectedFiles.value.splice(index, 1)
}

async function submitUploadBatch() {
  if (selectedFiles.value.length === 0) return
  isUploading.value = true

  try {
    const hasZip = selectedFiles.value.some((f) => f.name.toLowerCase().endsWith('.zip'))
    const isPublicOverride = hasZip && zipMode.value !== 'upload' ? zipVisibility.value === 'public' : undefined
    await damStore.uploadMultipleAssets(selectedFiles.value, damStore.currentFolderPath, isPublicOverride, zipMode.value)
    toastStore.show(`Uploaded ${selectedFiles.value.length} files to ${damStore.currentFolderPath}`)
    selectedFiles.value = []
    showUploadModal.value = false
  } catch (err: any) {
    alert(err.message || 'Batch upload failed')
  } finally {
    isUploading.value = false
  }
}

function openCreateFolderModal() {
  newFolderName.value = ''
  newFolderIsPublic.value = false
  showCreateFolderModal.value = true
}

async function submitCreateFolder() {
  if (!newFolderName.value.trim()) return
  try {
    await damStore.createFolder(newFolderName.value, newFolderIsPublic.value)
    toastStore.show(`Created ${newFolderIsPublic.value ? 'PUBLIC' : 'PRIVATE'} folder "${newFolderName.value}"`)
    newFolderName.value = ''
    showCreateFolderModal.value = false
  } catch (err: any) {
    alert(err.message)
  }
}

async function confirmDeleteFolder(path: string) {
  if (confirm(`Are you sure you want to delete folder "${path}" and all its contents?`)) {
    await damStore.deleteFolder(path)
    toastStore.show(`Deleted folder "${path}"`)
  }
}

function openVersionModal(item: UnifiedItem) {
  const asset = damStore.assets.find((a) => a.id === item.id)
  if (asset) selectedAssetForVersion.value = asset
  showVersionModal.value = true
}

async function deleteAsset(id: string) {
  if (confirm('Are you sure you want to delete this asset from DAM storage?')) {
    await damStore.deleteAsset(id)
    tabsStore.closeAssetTab(id)
    toastStore.show('Asset deleted from DAM storage.')
  }
}

async function copyAssetUrl(item: UnifiedItem) {
  const asset = damStore.assets.find((a) => a.id === item.id)
  if (!asset) return
  const url = (await damStore.getAssetUrl(asset)) || asset.url || asset.pimcorePath
  await navigator.clipboard.writeText(url)
  toastStore.show('Asset URL copied to clipboard!')
}

function handleImageError(e: Event, item: UnifiedItem) {
  handleAssetImageError(e, item as any)
}
</script>
