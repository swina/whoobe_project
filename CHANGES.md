# Changelog

All notable changes to the Whoobe CMS project.

---

## [Phase 2d — Sidebar Reorder & Website Paths UI] — 2026-08-08

### Database

- **`menus` table renamed to `website_paths`**: Schema file renamed (`menus-schema.ts` → `website-paths-schema.ts`, `menus-records.ts` → `website-paths-records.ts`). Drizzle migration `0017_dusty_tarot.sql` renames the table. All backend functions and API routes renamed accordingly (`listWebsitePaths`, `createWebsitePath`, etc.).
- **`drizzle.config.ts`**: Updated to reference new schema file path.

### API

- **`server.ts`**: All `/whoobe-one/menus*` routes replaced with `/whoobe-one/website-paths*`. Response keys changed from `{ menus }` / `{ menu }` to `{ paths }` / `{ path }`.

### Frontend — Renamed

- **`menus-api.ts`**: `MenuRecord` → `WebsitePathRecord`, all functions prefixed `fetchWebsitePaths`/`createWebsitePath`/etc. Endpoints point to `/whoobe-one/website-paths`.
- **`menusStore.ts`**: Store renamed `useMenusStore` → `usePathStore`, state `menus` → `paths`, actions `refreshMenus`/etc → `refreshPaths`/etc.
- **`MasterWebsiteTab.vue`**: All references updated (`pathsStore`, `WebsitePathRecord`, `refreshPaths`, `updatePathItems`, `createPathGroup`, etc.).
- **`MenuEditor.vue`**: Same renaming pass.
- **`WebsiteSettingsCard.vue`**: Button label "Menus" → "Paths", function `openMenus` → `openPaths`.

### User-Editable Paths

- **`MenuItemRow.vue`**: Added editable path input field in the inline editor panel. Path is displayed as `/<input>` with a leading slash. On save, the user's path value is preserved. Client-side uniqueness validation shows a warning if another sibling has the same path.
- **`MasterWebsiteTab.vue`**: Removed auto-derivation logic (`derivePaths`/`deriveItemPath`) — path is now fully user-controlled.

### Page Linking Fixes

- **`MasterWebsiteTab.vue`**: Fixed `onPageSelected` to use a deep-cloned copy of items and a path-based tree traversal (`setItemByPath`) instead of broken flat-index recursion. Now correctly handles nested items at any depth. Uses fresh data from the store on selection to avoid stale references.
- **`MenuItemRow.vue`**: Badge now shows the actual page title (looked up from `pagesStore`) instead of static "page" text. Added `itemPath` prop (array of indices) to correctly identify nested items. `link-page` emit includes the full path array instead of a flat index.
- **`MasterWebsiteTab.vue`**: All item CRUD functions (`updateItem`, `addRootItem`, `addChildItem`, `removeItem`) simplified to direct array index access. `updatePathItems` now supports optimistic updates — applies changes locally immediately then syncs to API, avoiding the "old data flash" between save and API response.
- **`MenuItemRow.vue`**: Path now always visible in the tree (shows `/…` as placeholder when empty), with leading `/` prefix for clarity.

- **`PagePickerDrawer.vue`**: Now lists ALL pages (removed `websiteId` filter), loads all pages via `refreshPages()` without website scoping.

### Sidebar

- **Websites moved to main sidebar**: Removed from Settings submenu — now a top-level nav item between Overview and Pages.
- **Sidebar order**: Overview, Websites, Pages, Assets, Data Objects, Documents, Settings.
- **`tabsStore.ts`**: Added `'websites'` to `SectionKind`; removed `'websites'` from `SettingsSubSection`.
- **New `WebsitesView.vue`**: Simple section view containing `WebsiteSettingsCard`, opens when Websites sidebar item is clicked.
- **`DashboardLayout.vue`**: Removed `toggleWebsites()` / `isWebsitesExpanded` (website list no longer nested under Settings); cleaned up settings submenu template.
- **`SettingsView.vue`**: Removed `'websites'` sub-tab and `WebsiteSettingsCard` import.

### Website Menu → Paths Rename

- **`WebsiteSubTab` type**: `'menus'` renamed to `'paths'` in `tabsStore.ts`.
- **`MasterWebsiteTab.vue`**: Sub-tab label "Menus" → "Paths"; internal key `'menus'` → `'paths'`.
- **`WebsiteSettingsCard.vue`**: Button label and function name "Menus" → "Paths".

### Fixes

- **PagePickerDrawer**: Fixed overlay clickability issue — changed flex layout from mixed `absolute`+`ml-auto` to `justify-end` with `relative z-10` on the content panel so clicks register properly.
- **PagesView.vue**: Added `onMounted(() => pagesStore.refreshPages())` — the store no longer auto-loads on creation (refactored to support `?websiteId=` filter), so the view needs to explicitly request pages on mount.

---

## [Phase 2c — Website Menus: Path Tree & Page Picker] — 2026-08-08

### Database & Backend

- **`whoobe-pages-schema.ts`**: Added `path` text column for hierarchical URL paths (e.g. `"/about/team"`) derived from menu tree association.
- **`whoobe-pages-records.ts`**: `listWhoobePages(websiteId?)` now optionally filters by website; `WhoobePageRecord` includes `path`; `createWhoobePage` and `updateWhoobePage` accept `path`.
- **`menus-schema.ts`**: `MenuItem` interface extended with optional `path` field.
- **`server.ts`**: `GET /whoobe-one/pages` now accepts `?websiteId=` query param; `POST /whoobe-one/pages` and `PATCH /whoobe-one/pages/:id` accept `path` and `websiteId`.

### Frontend API & Store

- **`pages-api.ts`**: `fetchPages(baseUrl, websiteId?)` supports website-scoped filtering; `WhoobeOnePage` includes `path`; `updatePageById` and `createPageById` accept `path`/`websiteId`.
- **`pagesStore.ts`**: `refreshPages(websiteId?)` filters by website; added `filteredPages(websiteId)` getter; `updatePage` and `createPage` accept path/websiteId. Removed auto-call on store creation.

### Menu Tree Redesign

- **`MasterWebsiteTab.vue`**: Menu items now auto-derive slash-delimited `path` from the tree hierarchy on every save/add/remove/move operation. "Link page" button on unlinked nodes opens the `PagePickerDrawer`. Emits `link-page` event from `MenuItemRow`.
- **`MenuItemRow.vue`**: Shows computed path below the label. Green/amber dot for published/draft page status. "unlinked" badge on items without pageId or url. Inline editor shows linked page ID with unlink option. Drag-and-drop supports both tree reordering (text/plain) and page linking from picker (application/page-id).

### New Component

- **`PagePickerDrawer.vue`**: Right-side drawer showing website-scoped pages with search, published/draft status dots, locale badge. Each row is draggable onto menu tree nodes. Includes a "Create New Page" quick-create form.

---

## [Phase 2b — Settings Sub-tab UI & Website Sidebar] — 2026-08-08

### Settings → Sub-tab UI (Phase 2)

- **`SettingsView.vue`**: Added a sub-tab navigation bar at the top with buttons for all 8 settings sub-sections (General, DAM, Classes, Components, Roles, Security, Workflows, Websites). Clicking a sub-tab switches the `settingsSubSection` on the active settings tab — consistent with how `MasterPageTab.vue` switches editor/settings/preview sub-tabs.

- **`WebsiteSettingsCard.vue`**: Removed all modals (create/edit form overlay, MenuEditor overlay). Edit opens `MasterWebsiteTab` (Settings sub-tab), Menus opens `MasterWebsiteTab` (Menus sub-tab). New Website+ prompts for name/locale, creates via API, then opens the tab.

### Websites in Sidebar (Phase 2)

- **`DashboardLayout.vue`**: Websites now appear as an expandable sub-list under Settings → Websites in the sidebar (matching the DAM folder tree pattern). Clicking a website calls `tabsStore.openWebsite(id)`, which opens a dedicated main tab.

### MasterWebsiteTab (new)

- **`components/websites/MasterWebsiteTab.vue`**: New master tab component following the same pattern as `MasterPageTab.vue`. Two sub-tabs:
  - **Settings**: inline form for editing website name, domains, locales
  - **Menus**: full menu editor inline (CRUD, drag-and-drop item tree via `MenuItemRow`)

### Tab Store — Website Support

- **`stores/tabsStore.ts`**:
  - Added `'website'` to `MasterItemKind`
  - Added `WebsiteSubTab = 'settings' | 'menus'` type
  - Added `websiteSubTab` property to `MainTab` interface
  - Added `websiteTabId()`, `openWebsite()`, `setWebsiteSubTab()`, `closeWebsiteTab()`

---

## [Phase 2 — Website Structure] — 2026-08-08

- Complete Phase 2 of the website-structure-plan.md
- Website data model (menus, pages)
- Pages: locale editable, create page, pagination, search, sorting by slug
- whoobe-one-spike's PageSettingsModal and page metadata store changes
- Empty bound field renders as visible/clickable element
- Data binding from parent, save as data binding snippet
- Threaded dataContext through editor canvas components
- Data object binding fixes, assets binding fixes, object URL resolution
- SingleObjectContext computed for container's resolved single object
- WYSIWYG editor for textarea/richtext fields
- Customizable field/section layout: reordering, per-field classes, Tailwind safelist

---

## [Phase 5-8 — Data Object Integration] — 2026-07

- Data model asset integration
- Data object binding in editor
- Assets preview in editing mode
- Added `start all apps` script
- Data Objects: class authoring, custom CRUD views, Settings submenu, dashboard theme
- Multi-type Field Collection editor + data migration
- Publish/workflow integration (public API, preview links, XState workflows)
- Migrate-classes/migrate-objects pilot (202 real objects, 0 failures)

---

## [Phase 1-4 — Data Objects & Pimcore Migration] — 2026-06

- Phase 0: resolve class-definition-source, ground field types
- Phase 1: real `data_classes`/`data_objects` model, CRUD API, ObjectsView retarget
- Phase 2: full field-type coverage + dynamic object-detail form
- Phase 3: migrate-classes/migrate-objects pilot
- Phase 4: fix locale bugs

---

## [Pages & Whoobe Studio] — 2026-05

- whoobe_pages data model, real CRUD, frontend retarget
- whoobe-one-spike integration: Vue 3 port of whoobe-one-studio
- Page embed into admin-dashboard
- Fix: containers render as real semantic HTML tags
- Semantic tag control in Customize panel
- Pimcore slug derivation; pilot migration against real install
- Fix crash on gsap-less elements (migrated/API-authored pages)

---

## [Documents & Assets] — 2026-04

- MFA login, Kit/Template/Snippet backend
- Reusable snippet library
- Explicit document Save as Draft/Publish
- ResolveMediaUrl fixes for missing s3Prefix
- Resolve brick image/video paths at render time
- Document sub-tab system (Whoobe Studio as a sub-tab, not modal)
- Bricks-in-document outline in right pane
- Port whoobe-studio-alpha-01 blocks/elements to Vue 3 (21 files)
- Icon picker + media URL importer
- Real Tailwind CSS in header-brick

---

## [Initial Whoobe Studio MVP] — 2026-03

- Build Whoobe Studio MVP with visual Preview
- First real Areabrick mapping: header-brick (from Twig source)
- Wire migrated Documents into admin dashboard (read-only)
- Assets: thumbnail generation with Sharp, S3 presigned URLs
- Documents CRUD with migration from Pimcore
- Real-time preview of rendered documents
- Basic user auth with roles and permissions
- Express guards for API routes
- Session management with database-backed sessions
- Response caching layer for public routes

## [Foundation] — 2026-02

- Initial project scaffolding (pnpm workspace with apps/admin-dashboard, apps/core-api, packages/core)
- Vite + Vue 3 + TypeScript + Tailwind CSS setup
- PostgreSQL with Drizzle ORM schema definitions
- Express.js API server with CORS, cookie parser
- Lucide icon integration
- Tab-based navigation system (Pimcore-style)
- Dark/light theme support
- Toast notification system
- Responsive sidebar with collapsible navigation