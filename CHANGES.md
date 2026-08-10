# Changelog

All notable changes to the Whoobe CMS project.

---

## [Fix: crypto.randomUUID crash on non-secure-context hostnames] — 2026-08-10 (branch: feat/08-10/data-binding-field-transformers)

`crypto.randomUUID()` is only exposed in secure contexts (HTTPS, or literally the hostname `localhost`) — visiting admin-dashboard via a plain-HTTP LAN hostname (e.g. this project's own `develop.local` dev setup) throws `crypto.randomUUID is not a function`, breaking "Create Page"/"+ New class"/"+ New object" (all three mint a client-side `new:<uuid>` placeholder tab id the same way).

- **`apps/admin-dashboard/src/utils/random-id.ts`** (new): `randomUUID()` — uses the native method when available, otherwise falls back to a hand-rolled RFC 4122 v4 UUID built from `crypto.getRandomValues()` (not secure-context-gated).
- Updated the three call sites: `apps/admin-dashboard/src/views/PagesView.vue`, `apps/admin-dashboard/src/views/ObjectsView.vue`, `apps/admin-dashboard/src/components/objects/ClassSettingsCard.vue`.
- **Also fixed**: `PagesView.vue`'s pages-list table referenced `page.website_id` (doesn't exist — the real field is `websiteId`), silently rendering the "Website" column blank. One-line fix, found while in the same file.
- `admin-dashboard`'s full `typecheck`/`build` pipeline is clean end-to-end for the first time this session (previously blocked by the `website_id` typo, unrelated to every other change until now).

---

## [List-to-Detail Links Open as an admin-dashboard Tab] — 2026-08-10 (branch: feat/08-10/data-binding-field-transformers)

Superseding refinement of the feature below: when whoobe-one-spike runs embedded inside admin-dashboard (the normal way pages are edited), a list-to-detail link now opens/focuses the target page's own tab directly on its Preview sub-tab, instead of opening a real new browser tab. Standalone (`:3006` direct) usage is unchanged — still opens a real new tab, since there's no host to hand the request to.

- **`apps/admin-dashboard/src/stores/tabsStore.ts`**: new `pagePreviewPath`/`pagePreviewLocale` fields on `MainTab` and a new `openPagePreview(pageId, path, locale)` function (layers on the existing `openPage()`, reusing its dedup/focus logic — clicking a different record just overwrites the override on the same tab, no duplicates).
- **`apps/admin-dashboard/src/components/pages/PagePreviewTab.vue`**: was a 0%-built stub ("Full preview... will be added in a future phase"). Now renders an `<iframe>` pointed at whoobe-one-spike's own `PublicPage.vue` route — reuses all of that app's resolution/rendering logic (collection bindings, filter substitution, list-to-detail hrefs) with zero duplication into admin-dashboard. Falls back to the page's own static slug when there's no override (works for any non-dynamic page); a dynamic page with no specific record shows a short notice instead of guessing.
- **`apps/whoobe-one-spike/src/components/preview/BlockContainerPreview.vue`**: `dynamicLink` clicks, when `editor.embedded`, `preventDefault()` and `postMessage` the resolved `{ pageId, path, locale }` to the parent window (targeted at `editor.parentOrigin`, not `'*'`) instead of navigating.
- **`apps/admin-dashboard/src/layouts/DashboardLayout.vue`**: new global `window.addEventListener('message', ...)`, registered once (not per-embedded-iframe — `WhoobeOneEmbed.vue` mounts one per open page-editor tab, so a per-component listener would fire once per open tab for every message), origin-checked against whoobe-one-spike's own origin, dispatching to `tabsStore.openPagePreview()`.
- This is the first real postMessage traffic whoobe-one-spike's embed has ever sent (previously zero-way — `WhoobeOneEmbed.vue`'s own comment used to say there was "nothing to secure" here); both directions are origin-locked, not `'*'`.

---

## [Render Resolved Pages for List-to-Detail Links] — 2026-08-10 (branch: feat/08-10/data-binding-field-transformers)

Fixes the gap found while testing the feature below: clicking a list-to-detail link inside Preview navigated the current tab to a path `whoobe-one-spike`'s own router had no route for (`/` and `/editor` only), logging a Vue Router "No match found for location" warning and rendering a blank page. Docs updated: `docs/guides/dynamic-website-paths.md`.

- **`apps/whoobe-one-spike/src/pages-api.ts`**: new `getPublicPage(locale, path)` calling the public `GET /public/pages/:locale/*` route built earlier this session.
- **`apps/whoobe-one-spike/src/router/index.ts`**: new catch-all route (`/:pathMatch(.*)*`, always last — an exact match still wins regardless of position) lazy-loading a new `PublicPage.vue`.
- **`apps/whoobe-one-spike/src/views/PublicPage.vue`** (new): fetches a page by locale + full path via `getPublicPage()`, resolves its data bindings via the existing `resolveDocumentData()`, and renders it read-only via `BlockContainerPreview.vue` — no editor chrome, a real look at the resolved page.
- **`apps/whoobe-one-spike/src/components/preview/BlockContainerPreview.vue`**: `childHref()` now appends `?locale=<code>` to constructed links, sourced directly from the target page's own already-fetched `locale` (not guessed from the URL — the DB's `locale` column doesn't reliably match a leading path segment, confirmed on real data). `dynamicLink`-based links now open in a new tab (`target="_blank" rel="noopener noreferrer"`) instead of navigating the current tab away from Preview.
- Verified end-to-end: the catch-all route serves the SPA shell for an arbitrary dynamic path, and the exact `GET /public/pages/en/it/news/my-article` call the new view makes returns the correct page, extracted `{ slug: 'my-article' }` params, and content shape.

---

## [Website Paths: Dynamic Slug Patterns + List-to-Detail Linking] — 2026-08-10 (branch: feat/08-10/data-binding-field-transformers)

Implements `docs/plans/website/website-paths.md`: a page's routing slug can now be a pattern like `/it/news/{slug}`, resolved per-visit via the existing Dynamic Query binding; and a list-bound container's records can each link to their own detail page.

- **`packages/core/src/routing/page-path-pattern.ts`** (new): `isDynamicSlug`, `extractPlaceholderNames`, `compilePagePathPattern`, `matchPagePath` (deterministic ambiguous-match ordering — fewer placeholders wins), `buildPathFromPattern`. No new DB column — a slug is dynamic iff it contains `{`. 17 new vitest tests (`page-path-pattern.test.ts`); caught and fixed two real bugs during testing (a regex-escaping bug that made every dynamic match silently fail, and an unguarded `.sort()` that let one malformed slug break matching for every other page).
- **`apps/core-api/src/server.ts`**: `GET /public/pages/:locale/:slug` replaced with a wildcard route (`:locale/*`) — Express 4's single-segment param could never match a multi-segment dynamic path at all. Literal exact-match tried first (byte-identical behavior for existing static pages), falling through to pattern matching only on a miss. Response gains a `params` field (`{}` for static pages). Sitemap generation now skips any dynamic-slug page entirely. Verified end-to-end via curl against the live DB, including a genuine pre-existing bug this exposed: the old route could never have matched multi-segment stored slugs (e.g. `/it/news-ed-eventi/`) at all.
- **`apps/whoobe-one-spike/src/scripts/data-resolver.ts`**: a `DataBindingFilter.value` that is, whole-string, a `{name}` placeholder is now substituted from the current preview's URL params before querying — e.g. a filter `slug = {slug}` on a page routed at `/it/news/{slug}` resolves the one record matching whatever a visitor actually requested. Applied consistently across all three resolution tiers (admin query, public query fallback, client-side filter fallback).
- **`apps/whoobe-one-spike/src/components/DocumentPreview.vue`**: new "Preview as path" input (shown for dynamic-pattern pages) lets an editor type a path to simulate a visit and see filter substitution happen live — there's no real visitor-facing route inside the editor app itself to source params from otherwise.
- **`apps/whoobe-one-spike/src/scripts/database-actions.ts`**: new `updatePageSlug()` fixes a real pre-existing gap — `savePage()`'s update branch never sent `slug` to the backend at all, so an existing page's path could never be changed through the editor (only set once, at creation). `BlockEditor.vue` gained a pencil icon to edit an existing page's slug.
- **List-to-detail linking**: new `DynamicLinkBinding` (`{ targetPageId, valueField }`) on `Element` (`ElementsClass.d.ts`), set via a new "Link to a page" mode in `FloatingToolbar.vue`'s Link popover (disabled unless the selected element sits inside a collection-bound container — new `findAncestorChain()` helper in `helpers.ts` walks up to find it). `BlockContainerPreview.vue`'s repeater now builds each record's own href by substituting that record's field value into the target page's slug pattern (`childHref()`), replacing the old static, non-per-record `element.link`.

---

## [Dynamic Query: Order By / Offset / Limit / Pagination] — 2026-08-10 (branch: feat/08-10/data-binding-field-transformers)

- **`packages/core/src/db/data-objects-records.ts`**: `queryDataObjects`/`queryPublishedDataObjects` switched from positional params to a `DataObjectQueryOptions` object (`filters`, `orderBy`, `offset`, `limit`, `locale`); extracted a shared `queryDataObjectsInternal()` helper. **Fixes a real bug**: SQL `LIMIT` was previously applied to the *unfiltered* base query, then filtered in JS afterward, so a caller's `limit` could silently return fewer matching rows than actually existed. Now: fetch (unbounded, matching `ObjectsView.vue`/`AssetsView.vue`'s existing no-SQL-cap convention) → filter in JS (unchanged) → sort in JS via new exported `sortDataObjects`/`compareSortValues`/`getSortValue` (always applies an effective order — the caller's `orderBy`, or the same `createdAt`/`publishedAt desc` default this code already hardcoded, so `offset`/`limit` stay deterministic) → offset/limit as an array slice. Deleted a literal duplicate `DataObjectQueryFilter` interface that existed twice back-to-back in the file. New `packages/core/src/db/data-objects-records.test.ts` (9 tests) covers the sort helpers directly.
- **`apps/core-api/src/server.ts`**: `POST /data-objects/query` and `POST /public/data-objects/query` accept new `orderBy`/`offset` body params (lightweight `typeof`-validated, matching the existing `limit`/`locale` style).
- **`apps/whoobe-one-spike/src/data-objects-api.ts`**: client `queryDataObjects`/`queryPublishedDataObjects` mirror the same options-object shape.
- **`apps/whoobe-one-spike/src/scripts/ElementsClass.d.ts`**: `ElementDataBinding` gains `orderBy` (applies to both `'query'` and `'first'` resolve modes), and `offset`/`limit`/`rowsPerPage` (`'query'`-only) — all optional, no migration needed (opaque JSONB).
- **`apps/whoobe-one-spike/src/scripts/data-resolver.ts`**: `resolveBinding()`'s query/first case now threads the binding's real `orderBy`/`offset`/`limit` through (previously always passed `limit: undefined`). Added a local `sortClientSide()` so the rare last-resort client-side fallback (no session, no public route reachable) also honors ordering/offset/limit instead of ignoring them.
- **`apps/whoobe-one-spike/src/components/DataObjectPicker.vue`**: "Dynamic query" mode gains Order By (field + ASC/DESC), Offset, Limit, and Rows Per Page (`[5,10,25,50]` presets, "No pagination") controls. `testQuery()` now runs the actually-configured query (previously hardcoded `limit: 20`) and reports the true result count, capped for display at `TEST_DISPLAY_CAP = 50`.
- **Fixed a pre-existing gap**: `BlockContainerPreview.vue` already rendered one repeated copy of a bound container's children per resolved record for a query/collection binding, but the live editing canvas (`BlockContainer.vue`) discarded array results entirely (`Array.isArray(resolved)` → `null`), so children rendered with zero data while editing such a binding. `BlockContainer.vue` now has the same `collectionResolved` repeater as Preview.
- **`BlockContainer.vue`** / **`BlockContainerPreview.vue`**: both gained client-side pagination (`currentPage`/`totalPages`/`pagedItems`, reset on data change) driven by the binding's `rowsPerPage`; Prev/Next controls render only when the result set exceeds one page. Pagination state is ephemeral (not persisted on the binding), matching `ObjectsView.vue`'s own `currentPage` pattern.

---

## [Data Binding Field Transformers] — 2026-08-10 (branch: feat/08-10/data-binding-field-transformers)

- **`apps/whoobe-one-spike/src/scripts/field-transforms.ts`** (new): `FieldTransform`/`TransformResult` types and a `TRANSFORMERS` registry (`date`, `url`, `number`, `truncate`) — each declares which `ClassFieldDefinition.fieldType`s it applies to, its default options, and a pure `apply(value, options)`. `applyTransform()` is the single entry point render code calls (never throws, falls back to raw-value behavior on error); `escapeHtml()` supports safely building the `url` transform's `<a>` markup. URL transform allow-lists `http(s)/mailto/tel/relative-path` schemes before rendering a real anchor, blocking `javascript:`-style stored payloads.
- **`apps/whoobe-one-spike/src/scripts/ElementsClass.d.ts`**: `ElementDataBinding` gains `fieldType` (denormalized `ClassFieldDefinition.fieldType`, set at bind time) and `transform` (configured post-bind from the sidebar) — both optional, so pre-existing saved bindings need no migration.
- **`apps/whoobe-one-spike/src/components/DataObjectPicker.vue`**: `confirm()` now denormalizes `fieldType` onto the emitted binding and preserves a previously-set `transform` only when rebinding to the same field (resets to `none` on a field change, since transform options are field-type-specific).
- **`apps/whoobe-one-spike/src/components/BlockElement.vue`** / **`preview/BlockElementPreview.vue`**: `displayContent`/`displayAlt` now run the resolved value through `applyTransform()`; a `url`-transform `link` result renders as a real `<a href>` (both already use `v-html`, so no template change needed), other results render as plain text exactly as before when no transform is set.
- **`apps/whoobe-one-spike/src/components/tailwind-controls/DataBindingTransformControl.vue`** (new): sidebar control (same pattern as `SemanticControl.vue`/`CustomClassesControl.vue` — reads/writes `editor.current.dataBinding.transform` directly, no modal) offering a transform-type select plus per-type option inputs.
- **`apps/whoobe-one-spike/src/components/TailwindCustomizer.vue`**: new "data binding" accordion group, shown for `content`-target bindings and for `src`-target bindings on an `<img>` element (the only reachable path to an image's alt text, since `bindingTarget()` never actually produces `target: 'alt'`).
- **Fix — old bindings only offering "Truncate text"**: bindings created before this feature shipped have no `fieldType` key at all, so the sidebar's transform dropdown could only offer `truncate` (the only transformer with an `'any'`-fieldType gate) instead of e.g. "Format date" for an actual date field. Added **`apps/whoobe-one-spike/src/scripts/resolve-binding-field-type.ts`** (new): `useEffectiveFieldType()` falls back to looking up the real `fieldType` from the Data Class definition (`getDataClassByName`, cached per class) whenever a binding predates denormalization, so old bindings self-heal without needing to be manually rebound. Wired into `DataBindingTransformControl.vue`. Also dropped a redundant `fieldType`-based gate on `TailwindCustomizer.vue`'s "data binding" group visibility — it could never actually hide the group, since `truncate` matches every field type.

---

## [Project Documentation] — 2026-08-10 (branch: master)

- **`README.md`** (new): Project overview — main features (PIM/MDM, DAM, CMS/Whoobe Studio, workflow engine, auth, Pimcore migration tool), monorepo layout, and install/configure/run instructions.
- **`docs/guides/api-reference.md`** (new): Reference of available HTTP endpoints for `core-api` and `asset-processor`, grouped by resource, plus the `migration-tool` CLI commands.

---

## [Migration Sources, Data Object Features & DAM Asset Improvements] — 2026-08-09

### Migration & Data Import

- **`packages/migration-tool/src/adapters/mysql-adapter.ts`**: Added `charset: 'utf8mb4'` to MySQL connection for full UTF-8 data migration support.
- **`packages/migration-tool/src/cli.ts`**: Added `clear` option to `RunObjectMigrationOptions`. When `true` (and not dry-run), deletes all existing objects for the class before importing — allows clean retry.
- **`packages/migration-tool/src/pimcore-object-converter.ts`**: Added `resolveAssetUuid` option. When provided, asset/image/video field values are stored as `{ assetId: "<dam-uuid>" }` instead of `{ assetId: "/raw/path" }` — looks up the Pimcore path in the DAM `assets` table via `getAssetByPath` and uses the UUID if found.
- **`packages/migration-tool/src/cli.ts`**: `RunObjectMigrationOptions.resolveAssetUuids` defaults to `true`. Passes `resolveAssetUuid` callback (wrapping `getAssetByPath`) to the converter.

### Backend — Batch Operations

- **`packages/core/src/db/data-objects-records.ts`**: Added `queryDataObjects` (admin, no published filter), `queryPublishedDataObjects`, `deleteDataObjectsByClassId`. Extracted `DataObjectQueryFilter` interface and `matchFilter`/`compareGT`/`compareLT` helpers with date-aware comparison.
- **`apps/core-api/src/server.ts`**: Added `POST /data-objects/batch` (publish/unpublish/delete/resolve-assets), `POST /data-objects/query` (admin filtered query), `POST /public/data-objects/query` (published-only filtered query).

### Data Object Listing (ObjectsView.vue)

- Replaced per-field text filters with **Dynamic Query filter modal** — same field-type-aware filter builder as DataObjectPicker (supports key, path, locale, all class fields, date picker, number input, checkbox/select dropdowns).
- Added **checkboxes** (select-all + per-row) and **batch action toolbar** (Publish, Unpublish, Delete, Resolve assets).
- Added **sortable columns** — click any column header to sort ascending/descending.
- All columns now configurable: Key/Path, Locales, Class, Status, Modification Date plus all class fields can be toggled on/off.
- **Column reordering** via ▲/▼ buttons in the View dropdown. Reorder persists in saved presets.
- **Custom view presets**: Save/Update/Delete, set as default (auto-applied on class selection).
- **Asset thumbnails** inline in asset/image/video field columns — resolved via `damStore.assets` lookup or `resolveDisplayUrl` for Pimcore-style path strings.
- Fixed `allowRelativeBinding` returning string instead of boolean (caused Vue prop type warning).

### Data Object Binding (whoobe-one-spike)

- **`data-resolver.ts`**: Complete rewrite — now calls `POST /data-objects/query` (admin, no published filter) first, falls back to `POST /public/data-objects/query`, then to client-side filter over `GET /data-objects`. Server-side filtering avoids fetching all objects. Added `console.error` for binding failures.
- **`FloatingToolbar.vue`**: Triggers `resolveDocumentData` immediately after setting/clearing a binding — data shows up right away in editor canvas.
- **`DataObjectPicker.vue`**: Added **Test query** button that runs the current filters via `queryDataObjects` and shows result count + up to 20 matching records. Filter field selector now includes `key`, `path`, `locale` as top-level fields. Added field-type-aware value inputs (date picker, number, checkbox, select options).
- Fixed `allowRelative` prop type — `allowRelativeBinding` now returns boolean not string.

### DAM — Asset Storage & Folder Navigation

- **`packages/core/src/db/data-objects-records.ts`**: `matchFilter` now handles date/string comparison for `gt`/`lt` operators (tries numeric first, falls back to Date comparison).
- **`stores/damStore.ts`**: `currentFolderPath` now persisted to localStorage (`whoobe:dam-current-folder-path`), restored on store init, auto-saved on every navigation via watcher. `uploadMultipleAssets`/`uploadZipAsset`/`uploadAsset` accept optional `isPublicOverride` parameter.
- **`views/AssetsView.vue`**: ZIP upload shows Public/Private radio group when auto-extract is enabled. Subfolders render as a simple list in list view mode (not buttons/cards), merged inline above the asset listing. Grid view mode preserves card layout.

### Settings — Data Object Classes

- **`SettingsView.vue`**: The Classes settings sub-section now has three inner tabs: **Classes** (CMS class authoring), **PIMCORE MIGRATION SOURCE** (Pimcore import), and **FILE MIGRATION** (placeholder for JSON/XLSX/CSV import). Active tab persisted to localStorage (`whoobe:settings-classes-subtab`).

### DAM — Asset Folder Integration

- **`AssetsView.vue`**: Folders are now rendered as regular items in the main asset grid/list view alongside assets, sorted alphabetically. Folders show a folder icon instead of a thumbnail. Grid view renders folder cards with a large folder icon; list view renders folder rows with a folder icon and name. Folders are not selectable (no checkbox) and not included in batch operations. Clicking a folder navigates into it.

### DAM — Folder Tree & 431 Error Fix

- **`SidebarFolderNode.vue`**: `isOpen` now defaults to `false` — folders start collapsed instead of exploding the entire tree on load or navigation.
- **`dam-api.ts`**: `fetchAssets`, `fetchAssetUrls`, and `checkAssetExists` changed from GET (with `folderRules` in URL query params) to POST (with `folderRules` in JSON body) to avoid `ERR_FAILED 431 (Request Header Fields Too Large)` when many folder visibility rules accumulate.
- **`asset-processor`**: Added `S3_PUBLIC_BASE_URL=http://develop.local:3002/dam-asset` to `.env`. Added `GET /dam-asset/*` proxy endpoint that serves files from S3/MinIO through the asset-processor's own HTTP server — fixes broken thumbnails/images by resolving URLs same-origin instead of pointing directly at MinIO (avoids CORS and cross-host issues). Added POST route handlers for `/api/v1/dam/assets`, `/api/v1/dam/asset-urls`, `/api/v1/dam/exists`.

---

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