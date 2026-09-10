# Changelog

## [SDK renderer fixes: link wrapping, slider carousel, GSAP animations, nullable schema] — 2026-09-10

- **`packages/sdk/react/src/defaults.tsx`**: Added `withLink()` wrapper — `DefaultContainer`, `DefaultImage`, `DefaultIcon`, `DefaultButton`, `DefaultSubmit`, `DefaultReset` now check `descriptor.link` and wrap children in `<a>` when set (matching the editor's BlockContainerPreview behavior). Previously only `DefaultLink` (kind `'link'`) rendered links.
- **`packages/sdk/react/src/defaults.tsx`**: `DefaultSlider` now renders a functional carousel with sliding track (`translateX`), prev/next arrows, dot indicators, autoplay with configurable interval, and tab navigation — matching the editor's `BlockSliderPreview.vue`. Uses `useWhoobe()` context for registry resolution.
- **`packages/sdk/react/src/defaults.tsx`**: Added `useGsapAnimation()` hook — dynamically imports `gsap` + `gsap/ScrollTrigger`, registers GSAP effects, applies ScrollTrigger/hover animations on elements with `gsap.animation` set. Wired to `DefaultContainer` and all text components via `useRef`. Gracefully degrades when GSAP is absent.
- **`packages/sdk/renderer/src/descriptor.ts`**: Added optional `gsap?: ElementGsap | null` to `RenderDescriptor` — GSAP config now carried through the tree walker.
- **`packages/sdk/renderer/src/walk.ts`**: Passes `node.gsap` into the descriptor output.
- **`packages/sdk/schema/src/validators.ts`**: Added missing slider fields to `sliderSchema`: `showDots`, `tabClass`, `activeTabClass`, `tabContainerClass`, `dotClass`, `activeDotClass`, `dotContainerClass`.
- **`packages/sdk/schema/src/validators.ts`**: All optional string fields in `whoobeElementSchema` changed to `.nullable().optional()` to accept JSON `null`. Added `name`, `description` fields.
- **`packages/sdk/schema/src/node.ts`**: All optional string fields changed to `string | null`. `ElementGsap.duration`/`delay` changed to `number | string`. Added `name`, `description` fields.
- **`packages/sdk/react/src/defaults.tsx`**: Fixed `children` prop in `DefaultSlider` — removed unused `children` param.

## [Website Publish: CLI generator + public API endpoints + guide] — 2026-09-10

- **`packages/publish/`**: New `@whoobe-cms/publish` package with a CLI tool (`whoobe-publish`) that generates a standalone Next.js website from a Whoobe CMS website. Fetches website info + themes + all published pages via the public API, extracts Tailwind classes from element trees for build-time JIT, generates `@theme` CSS variables, and scaffolds a complete Next.js app with ISR, sitemap, robots.txt, SEO metadata, and component registry.
- **`packages/sdk/renderer/src/api-client.ts`**: Added `listPages(websiteId?)` and `getWebsite(id)` methods to `ApiClient` for fetching all published pages and website theme info.
- **`apps/core-api/src/server.ts`**: Two new public endpoints — `GET /public/websites/:id` (website info + themes, no auth) and `GET /public/pages?websiteId=...` (list all published pages, no auth).
- **`docs/guides/publish/website-publishing.md`**: Full guide covering the publish workflow: prerequisites, CLI generation, build, deployment to Vercel/Docker/static, customization, and troubleshooting.
- **`Root package.json`**: Added `publish:site` script.
- **`packages/sdk/react/src/hooks.ts`**, **`context.tsx`**, **`components.tsx`**, **`defaults.tsx`**: Added `"use client"` directive so these modules serve as client boundaries in Next.js App Router. Removed duplicate `WhoobeProvider` re-export from `components.tsx` (already exported from `context.tsx`). Fixes SSR/ISR builds where server components import WhoobePage and hooks.
- **`packages/publish/src/cli.ts`**: Fixed `generateStaticParams` in catch-all page scaffold to pre-render all published pages at build time. Fixed `file:` dependency paths using `relative()`. Added `NEXT_PUBLIC_CMS_API_URL` to `.env.local` for client-side access. Added detailed error messages for DNS/connection failures. Made layout a client component (SSG still runs at build time, preserving SEO).

## [Website Export / Import] — 2026-09-10

- **`apps/core-api/src/server.ts`**: New `GET /whoobe-one/websites/:id/export` endpoint — exports a complete website package: website configuration, all pages (with SEO/sitemap/search metadata), website templates, website paths (menus), and associated themes (global themes referenced by website or pages). Returns a versioned JSON payload.
- **`apps/core-api/src/server.ts`**: New `POST /whoobe-one/websites/import` endpoint — imports a previously exported website package. Generates a unique suffix for name and rootPath (e.g. `"My Site (import a1b2c3d4)"` with rootPath `/my-site-a1b2c3d4`) to prevent conflicts. Creates themes first, then the website, then pages (preserving translation group locality), then website templates and paths. All existing IDs are regenerated.
- **`apps/admin-dashboard/src/utils/websites-api.ts`**: Added `WebsiteExportPayload` type, `exportWebsite()` and `importWebsite()` API client functions.
- **`apps/admin-dashboard/src/components/settings/WebsiteSettingsCard.vue`**: Added "Export" button per website row (downloads JSON), and "Import" button in the toolbar (opens file picker for `.json` upload). After import, the websites list refreshes automatically.

- **`packages/core/src/db/ai-image-settings-schema.ts`**: New `ai_image_settings` table (per-user, FK → `users(id)` ON DELETE CASCADE) with `provider`, `model`, `endpoint`, `api_key` — fully independent from the text AI settings.
- **`packages/core/src/db/ai-image-settings-records.ts`**: `getAiImageSettings(userId)` and `upsertAiImageSettings(userId, input)` — same upsert-on-conflict pattern as `ai_settings`.
- **`packages/core/drizzle/0036_ai_image_settings.sql`**: Migration to create the `ai_image_settings` table.
- **`packages/core/drizzle.config.ts`**: Added `ai-image-settings-schema.ts` to the schema list.
- **`packages/core/drizzle/meta/_journal.json`**: Bumped to idx 36.
- **`packages/core/src/ai/image-providers.ts`**: New provider layer — `generateImage()` dispatches to OpenAI, OpenRouter, or Custom endpoints via the OpenAI SDK `images.generate()` API. Supports DALL-E 3 (size/style/quality) and DALL-E 2 (multi-image). Retry logic for 429/5xx. `AiImageGenerationError` with status codes for content policy violations (422) and other failures.
- **`packages/core/src/ai/image-dam.ts`**: `saveAiImageToDam()` — downloads the provider's temp URL server-side, uploads to MinIO via `S3AssetStorageProvider`, creates an asset DB record via `upsertAssetRecord`, and returns the permanent DAM URL + asset ID. No ephemeral URLs ever reach the browser.
- **`packages/core/src/server.ts`**: Exports the new schema, records, image provider, and image DAM modules.
- **`apps/core-api/src/server.ts`**: 3 new routes — `GET /ai/image-settings` (returns config without API key, with `usingFallback` indicator), `PUT /ai/image-settings` (upsert, blank key = keep existing), `POST /ai/generate-image` (generate → download → DAM upload → audit log in one call). Falls back to text AI settings when no image-specific config exists. Logs both successes and failures to `whoobe_ai_generated` with kind `'image'`.
- **`apps/admin-dashboard/src/utils/ai-settings-api.ts`**: Added `AiImageSettingsRecord`, `AiImageSettingsInput`, `fetchAiImageSettings()`, `saveAiImageSettings()`.
- **`apps/admin-dashboard/src/components/settings/AiImageSettingsCard.vue`**: New settings card for AI image provider config (provider, model, endpoint, API key, fallback notice).
- **`apps/admin-dashboard/src/stores/tabsStore.ts`**: Added `'ai-image'` to `SettingsSubSection`.
- **`apps/admin-dashboard/src/views/SettingsView.vue`**: Added AI Image sub-tab with `Image` icon.
- **`apps/admin-dashboard/src/layouts/DashboardLayout.vue`**: Added "AI image gen" sidebar item.
- **`apps/whoobe-one-spike/src/ai-api.ts`**: Added `generateImage()`, `fetchAiImageInfo()`.
- **`apps/whoobe-one-spike/src/components/AiImageGenerateModal.vue`**: New 3-step modal (Generate → Preview → Insert). Prompt controls, provider info, image grid, "Use this image" emits `{ damUrl, assetId }`.
- **`apps/whoobe-one-spike/src/components/FloatingToolbar.vue`**: "AI Generate" button in the image popover, sets `editor.current.image.url`/`.assetId` on select.
- **`apps/whoobe-one-spike/src/components/BlockEditor.vue`**: "AI Image" toolbar button, creates and inserts an `<img>` element on select.
- **`apps/whoobe-one-spike/src/scripts/ElementsClass.d.ts`**: Added `assetId?: string | null` to `ElementImage`.

- **`apps/admin-dashboard/src/components/websites/MasterWebsiteTab.vue`**: `onPageSelected` now preserves the menu item's own `path` instead of overwriting it with the page slug — a menu item with path `/` stays `/` after linking. Also auto-publishes the selected page (PagePickerDrawer quick-create creates unpublished pages), so the public endpoint can serve it. Previously, linked unpublished pages always returned "Page not found" on preview.
- **`apps/admin-dashboard/src/components/settings/MenuItemRow.vue`**: `openLinkPage()` now closes the inline editor (`editing.value = false`) before emitting `link-page`. This prevents the inline editor's `saveEdit()` from racing with the page-linking optimistic update and overwriting the `pageId` with stale data.

## [Website Paths: zero-query-param /{rootPath}/{slug} URLs with server-side locale resolution] — 2026-09-09

- **`apps/admin-dashboard/src/components/settings/MenuItemRow.vue`**: Preview URL is now `/{rootPath}/{slug}` with zero query params (e.g. `/sycore/home`). The page's locale is resolved server-side from the DB record — no `?locale=` or `?rootPath=` needed. Also fixed: when page slug has no leading `/` (PagePickerDrawer quick-create), `target` is now normalized with `slug.startsWith('/') ? slug : '/' + slug` so the URL doesn't produce `/{rootPath}slug` (missing slash). And root-page preview (slug `/`) now works — maps to just `/{rootPath}`.
- **`apps/core-api/src/server.ts`**: New public route `GET /public/page/*` that resolves pages without locale in the URL. Auto-detects rootPath from the first path segment (via `getWebsiteByRootPath`), strips it, and looks up the page by slug + websiteId ignoring locale (`getPublishedWhoobePageBySlugAnyLocale`). Supports dynamic slug patterns (`{placeholder}`) via the same `matchPagePath` fallback as the existing locale-based endpoint. Also tries slug without leading `/` as fallback for pages created via PagePickerDrawer quick-create.
- **`apps/admin-dashboard/src/components/websites/MasterWebsiteTab.vue`**: Fixed `onPageSelected` — when the linked page has slug `/` (root page), the menu item's original `path` is preserved instead of being overwritten with an empty string.
- **`packages/core/src/db/whoobe-pages-records.ts`**: New `getPublishedWhoobePageBySlugAnyLocale(slug, websiteId?)` — finds a published page by slug scoped to website, ignoring locale. Returns the first match.
- **`apps/whoobe-one-spike/src/pages-api.ts`**: New `getPublicPageByPath(path)` — calls `GET /public/page/{path}` on the server for clean URLs without locale.
- **`apps/whoobe-one-spike/src/views/PublicPage.vue`**: When no `?locale=` query param is present, calls the new `getPublicPageByPath()` endpoint. The page's locale is taken from the server response. Legacy `?locale=` URLs (PagePreviewTab) still use the old `getPublicPage()` endpoint.
- **`apps/whoobe-one-spike/src/components/FloatingToolbar.vue`**: `pickWebsitePath()` now generates clean `/{rootPath}/{path}` URLs without `?locale=` or `?rootPath=` query params.
- **`apps/whoobe-one-spike/src/components/preview/BlockContainerPreview.vue`**: `childHref()` now returns clean URLs without `?locale=` — the server resolves the locale from the DB record.

## [Fix: linked pages missing in Website > Paths after app restart] — 2026-09-09

- **`apps/admin-dashboard/src/components/websites/MasterWebsiteTab.vue`**: The Paths tab's `MenuItemRow` components resolve page titles/status/locale from the shared `pagesStore.pages`, but `MasterWebsiteTab` only fetched pages into a local `websitePages` ref and never populated the Pinia store. On a fresh app load, opening Website → Paths showed path items linked via `pageId` with no page title/status/locale info ("unlinked-looking"). Now `load()` also calls `pagesStore.refreshPages(websiteId)` (alongside `websitesStore.getWebsite` and `loadPages`), and re-fetches the store whenever the Paths subtab is entered. Added `usePagesStore` import and instance.

## [FloatingToolbar: website paths select in link picker] — 2026-09-08

- **`apps/whoobe-one-spike/src/website-paths-api.ts`**: New API client with `fetchWebsitePaths(websiteId?)` for the whoobe-one-spike app.
- **`apps/whoobe-one-spike/src/components/FloatingToolbar.vue`**: Added a "Website path" `<select>` dropdown in the link picker popover, filtered by the current page's `websiteId`. Lists all paths from the website's path groups (flattened from the nested MenuItem tree). Selecting a path populates the URL input. Paths are loaded when the link picker opens via a `watch(showLinkPicker, ...)`.
- **`apps/whoobe-one-spike/src/store/editor.ts`**: Added `websiteId` ref and `setWebsiteId()` setter so the editor tracks which website the current page/snippet belongs to.
- **`apps/whoobe-one-spike/src/scripts/database-actions.ts`**: `loadPage()` now stores `saved.websiteId` via `editor.setWebsiteId()`.
- **`apps/whoobe-one-spike/src/views/Editor.vue`**: Both snippet paths (existing and new) now store `websiteId` via `editor.setWebsiteId()`.

## [AI Settings: per-user instead of global (API keys are private)] — 2026-09-08

- **`packages/core/src/db/ai-settings-schema.ts`**: Changed `ai_settings` from a single-row table with `id` PK to a per-user table with `user_id` as PK (FK to `users.id` ON DELETE CASCADE). Each user now has their own AI provider configuration.
- **`packages/core/src/db/ai-settings-records.ts`**: `getAiSettings(userId)` and `upsertAiSettings(userId, input)` now require a `userId` argument. Uses `ON CONFLICT DO UPDATE` instead of separate select-then-insert/replace pattern.
- **`apps/core-api/src/server.ts`**: All 4 endpoints that interact with AI settings (`GET /ai/settings`, `PUT /ai/settings`, `POST /ai/generate`, `POST /ai/generate-website-structure`) now scope the settings lookup to `req.user.id`.
- **`packages/core/drizzle/0035_ai_settings_per_user.sql`**: Drops the old global `ai_settings` table and recreates it with `user_id` as PK + FK to users.

---

## [PagesView: website filter dropdown + server-side websiteId filtering] — 2026-09-08

- **`apps/admin-dashboard/src/views/PagesView.vue`**: Added a website `<select>` filter next to the search input that lists all websites from `websitesStore`. Selecting a website passes its ID to `pagesStore.refreshPages(websiteId)`, so the backend filters by website. The filter modal's `websiteId` field now renders as a website dropdown instead of a text input. A watch on `filterWebsiteId` re-fetches pages on change.

- **`packages/core/src/ai/providers.ts`**: `parseJsonText` now strips non-printable ASCII control characters (0x00-0x1F except `\t\n\r`) before `JSON.parse` — some AI providers inject invisible characters that break parsing.
- **`apps/core-api/src/server.ts`**: The `POST /ai/generate` page/snippet endpoint now passes `maxTokens: 8192` (was default 4096) — complex pages with many blocks could exceed the token limit and get truncated mid-JSON.

---

## [Website Paths & page preview links now include rootPath] — 2026-09-08

- **`apps/admin-dashboard/src/components/settings/MenuItemRow.vue`**: `previewUrl` now looks up the website's `rootPath` from `websitesStore` and includes it in the preview URL (path prefix + `?rootPath=` query param), plus `?locale=` — fixes broken "👁" preview links in Website Paths when a website has a non-empty `rootPath`.
- **`apps/admin-dashboard/src/components/pages/MasterPageTab.vue`**: `openPreviewUrl` computed now includes `rootPath` and `?locale=` query param — fixes "Open in a new tab" link when a website has a non-empty `rootPath`.
- **`apps/admin-dashboard/src/components/websites/MasterWebsiteTab.vue`**: `onPageSelected` now passes `optimistic = true` to `updatePathItems`, so the linked page appears immediately in the UI instead of requiring a tab switch to re-fetch.

## [Website rootPath: scoped preview URLs per website] — 2026-09-08

- **`docs/plans/website/website-scoped-preview-url.md`**: Implementation plan.
- **`packages/core/src/db/websites-schema.ts`**: Added `rootPath` column with unique index.
- **`packages/core/src/db/websites-records.ts`**: Added `rootPath` to `WebsiteRecord`. Added `getWebsiteByRootPath()` helper. Updated `createWebsite`/`updateWebsite` to accept and persist `rootPath`.
- **`apps/core-api/src/server.ts`**: Accept `rootPath` on website create/update with validation (regex + uniqueness). Public pages handler strips `rootPath` from request path and resolves `websiteId` from it. Imported `getWebsiteByRootPath`.
- **`packages/core/drizzle/0034_solid_freak.sql`**: Generated missing migration for `root_path` column + unique index on `websites` table (fixes bootstrap failure).
- **`apps/admin-dashboard/src/utils/websites-api.ts`**: Added `rootPath` to `WebsiteRecord`, `createWebsite` input, `updateWebsite` input.
- **`apps/admin-dashboard/src/components/websites/MasterWebsiteTab.vue`**: Added root preview path input in Settings tab with validation. Pre-fills from website data and saves via `rootPath` field.
- **`apps/admin-dashboard/src/components/pages/PagePreviewTab.vue`**: Prepends `rootPath` to preview iframe URL and passes `?rootPath=` query param. Looks up website from `websitesStore`.
- **`apps/whoobe-one-spike/src/pages-api.ts`**: `getPublicPage()` accepts optional `rootPath` param, passes as query.
- **`apps/whoobe-one-spike/src/views/PublicPage.vue`**: Reads `?rootPath=` from route query and forwards to API.

## [PagePreviewTab: pass locale as query param — fix preview for slugs without locale prefix] — 2026-09-08

- **`apps/admin-dashboard/src/components/pages/PagePreviewTab.vue`**: Added `?locale=` query param to the preview iframe URL, using the page's own locale from the DB. Fixes "Page not found" for pages whose slug doesn't start with a locale prefix (e.g. `/whoobecms` with locale `en`). PublicPage.vue already reads `?locale=` first, so this overrides its fallback path-segment extraction.

## [MasterWebsiteTab: per-tab paths/pages state — fix data race across tabs] — 2026-09-08

- **`apps/admin-dashboard/src/components/websites/MasterWebsiteTab.vue`**: Replaced shared global `pathsStore.paths` and `pagesStore.pages` with per-tab local `websitePaths` and `websitePages` refs, fetched independently per instance. This fixes switching between multiple website tabs showing the wrong (last-loaded) data.

## [FloatingToolbar: drag persists + popovers flip upward near bottom] — 2026-09-08

- **`apps/whoobe-one-spike/src/components/FloatingToolbar.vue`**: Fixed drag not persisting — added `positionPinned` flag so the RAF loop stops auto-updating after a manual drag. Position stays until a new element is selected. All popovers (semantic, text color, fill color, image, link, button icon) now flip upward when the toolbar is near the bottom edge, matching the existing slider popover logic.

## [FloatingToolbar: remove current background image button] — 2026-09-08

- **`apps/whoobe-one-spike/src/components/FloatingToolbar.vue`**: Added a "Remove current" (✕) button next to "Browse assets" that clears the element's background/image reference, only shown when an image is already set.

## [PNG transparency preserved in thumbnails + checkerboard background] — 2026-09-08

- **`packages/core/src/dam/thumbnail-generator.ts`**: Added `alphaQuality: 100` to WebP output so the alpha channel is preserved at full fidelity. Canvas browser fallback now clears to transparent before drawing.
- **`apps/admin-dashboard/src/style.css`**: Added `.bg-checkerboard` utility class with a semi-transparent checkerboard pattern to reveal transparency in image containers.
- **`apps/admin-dashboard/src/components/dam/DamAssetPreviewPanel.vue`**, **`DamThumbnailsPanel.vue`**: Added `bg-checkerboard` to image preview containers so transparent areas are visible instead of appearing solid black/white.

## [SaveSnippetModal: pre-fill current snippet name when editing] — 2026-09-08

- **`apps/whoobe-one-spike/src/components/SaveSnippetModal.vue`**: When opening the modal while editing an existing snippet (`editor.snippetMode`), defaults to "Update existing" mode with the current snippet's name, category, and icon pre-filled. Switching to "New snippet" clears the name field.

## [SnippetsView: delete selected button] — 2026-09-08

- **`apps/admin-dashboard/src/views/SnippetsView.vue`**: Added "Delete Selected (N)" button in the toolbar, shown when snippets are selected. Bulk-deletes with a confirmation dialog and shows a toast summary.

## [SnippetsView: grid view with live preview + List/Grid toggle] — 2026-09-08

- **`apps/admin-dashboard/src/components/snippets/SnippetPreviewCard.vue`**: New component rendering a live scaled-down thumbnail of a snippet node tree (containers/elements/images/content), modeled after whoobe-one-spike's KitGalleryModal.
- **`apps/admin-dashboard/src/views/SnippetsView.vue`**: Added a List/Grid view toggle. Grid view shows snippet preview cards with name, category, updated date, selection checkbox and edit/delete actions.

## [Snippets export: embed images as base64 data URIs] — 2026-09-08

- **`apps/admin-dashboard/src/utils/snippet-export.ts`**: New utility `embedNodeImages()` that walks a snippet node tree, resolves image references (raw Pimcore paths via DAM API, absolute URLs) to binary, and replaces them with base64 data URIs. Handles `image.url`, `props.src`, and `style.backgroundImage`.
- **`apps/admin-dashboard/src/views/SnippetsView.vue`**: Export now embeds images as base64 data URIs, showing a toast while processing.

## [SnippetsView: selectable rows, export selected only] — 2026-09-08

- **`apps/admin-dashboard/src/views/SnippetsView.vue`**: Added checkbox column with select-all. Export now exports only selected snippets (or all if none selected).

## [Element naming: user-assignable unique name per element] — 2026-09-08

- **`apps/whoobe-one-spike/src/scripts/ElementsClass.js`**: Added `this.name = ''` to the constructor.
- **`apps/whoobe-one-spike/src/scripts/ElementsClass.d.ts`**: Added `name?: string` type.
- **`apps/whoobe-one-spike/src/helpers.ts`**: Updated `friendlyElementName()` to return `el.name` first if set, falling back to the existing derived label.
- **`apps/whoobe-one-spike/src/components/FloatingToolbar.vue`**: Added double-click-to-rename on the label badge and a dedicated `Pen` icon button. Added `renameElement()` function using `window.prompt()`.
- **`apps/whoobe-one-spike/src/components/DocumentTreeNode.vue`**: Added double-click-to-rename on the tree node label.

## [FloatingToolbar draggable] — 2026-09-08

- **`apps/whoobe-one-spike/src/components/FloatingToolbar.vue`**: Made the toolbar draggable via mousedown on the label/drag handle. Auto-position resumes when a new element is selected.

## [Tab context menu: close all / close others] — 2026-09-08

- **`apps/admin-dashboard/src/stores/tabsStore.ts`**: Added `closeAllTabs()` and `closeOtherTabs(id)` methods.
- **`apps/admin-dashboard/src/layouts/DashboardLayout.vue`**: Added right-click context menu on tab strip with "Close all tabs" and "Close others" options.

## [AI Website Wizard: generate complete website structure from natural language] — 2026-09-07

- **`packages/core/src/ai/prompts.ts`**: Added `buildWebsiteStructurePrompt()` and `validateWebsiteStructure()`, exported `collectNodes()`.
- **`packages/core/src/ai/providers.ts`**: Added `maxTokens` to `AiGenerateInput`, threaded through all providers. `parseJsonText()` shows raw output in errors.
- **`apps/core-api/src/server.ts`**: Added `POST /ai/generate-website-structure` (with retry-with-feedback loop) and `POST /whoobe-one/websites/from-ai`.
- **`apps/admin-dashboard/src/utils/websites-api.ts`**: Added `generateAiWebsiteStructure()`, `createWebsiteFromAi()`, `AiWebsiteStructure` type.
- **`apps/admin-dashboard/src/stores/websitesStore.ts`**: Added `generateStructure()`, `createFromAiStructure()`.
- **`apps/admin-dashboard/src/components/settings/AiWebsiteWizardModal.vue`**: New modal with prompt input, preview, error handling.
- **`apps/admin-dashboard/src/components/settings/WebsiteSettingsCard.vue`**: Added "AI Website Wizard" button.

## [Grid control, preview iframe, slider dots, Alpine fix, theme name prompt] — 2026-09-07

- **`apps/whoobe-one-spike/src/components/tailwind-controls/GridControl.vue`**: New visual control using `grid.js` column-span distribution patterns. Column count buttons (1–6) with valid distribution patterns for each count.
- **`apps/whoobe-one-spike/src/scripts/tw.groups.js`**: Grid group now has "gap", "columns", and "column span" controls. Added "col span" group for all elements.
- **`apps/whoobe-one-spike/src/components/TailwindCustomizer.vue`**: Registered `GridControl` in component map.
- **`apps/whoobe-one-spike/src/components/DocumentPreview.vue`**: Tablet/mobile preview now uses a real iframe so responsive breakpoints resolve against the device viewport.
- **`apps/whoobe-one-spike/src/router/index.ts`**: Added `/preview` route.
- **`apps/whoobe-one-spike/src/views/PreviewView.vue`**: New standalone preview view for iframe, strips default root classes (`gap-4`, `min-h-[600px]`, `bg-white`, `p-6`).
- **`apps/whoobe-one-spike/src/components/preview/BlockSliderPreview.vue`**: Added dot navigation with `showDots`, `dotClass`, `activeDotClass`, `dotContainerClass` settings.
- **`apps/whoobe-one-spike/src/components/preview/BlockContainerPreview.vue`**: Added `Alpine.initTree` on mount for Alpine support in preview iframe.
- **`apps/whoobe-one-spike/src/components/preview/BlockElementPreview.vue`**: Same Alpine init fix.
- **`apps/whoobe-one-spike/src/scripts/ElementsClass.js`**: Added `showDots`, `dotClass`, `activeDotClass`, `dotContainerClass` defaults to `Slider()`.
- **`apps/whoobe-one-spike/src/scripts/ElementsClass.d.ts`**: Added `showDots`, `dotClass`, `activeDotClass`, `dotContainerClass` to `ElementSlider` interface.
- **`apps/whoobe-one-spike/src/components/FloatingToolbar.vue`**: Added dot indicator checkbox and dot/active-dot/dot-container class inputs.
- **`apps/admin-dashboard/src/components/themes/ThemesView.vue`**: "New Theme" now prompts for a name.
- **`apps/whoobe-one-spike/src/scripts/tw.classes.js`**: Removed `colspan` from flex group (now in dedicated group).

---

## [Fix: DAM asset-processor timeout in production — proxy URLs instead of presigned S3 URLs + local dev hostname support] — 2026-09-07

- **`apps/admin-dashboard/src/utils/editor-urls.ts`**: `getWhoobeOneSpikeUrl()` and `getWhoobeStudioUrl()` now distinguish HTTP (local dev on a LAN hostname like whoobecms.local:3000) from HTTPS (production behind nginx). HTTP dev → direct port 3006/3004. HTTPS production → `/whoobe-one/` / `/whoobe-studio/` nginx path. Previously used the nginx path for any non-localhost hostname, breaking the embedded editor in local LAN dev.
- **`apps/admin-dashboard/src/utils/stale-localhost.ts`**: `isStoredUrlStale()` now only rejects internal backend ports (`3002`, `3003`, `3006`) when the page is served over **HTTPS** (production). On HTTP (local dev), ports are expected and valid.
- **`apps/asset-processor/src/server.ts`**: Added `forwardOrigin()` and `proxyUrl()` helpers. Changed all asset listing routes to return proxy URLs (`{origin}/dam-asset/{s3Key}`) instead of `provider.getAssetUrl()` which generated presigned S3 URLs with the internal MinIO endpoint (`127.0.0.1:9000`). Updated `finalizeAssetUpload` to accept an `origin` parameter.
- **`apps/whoobe-one-spike/src/dam-api.ts`**: `getDefaultAssetProcessorUrl()` now respects `VITE_ASSET_PROCESSOR_URL` env var first.
- **`apps/whoobe-one-spike/src/resolve-display-url.ts`**: Same fix.
- **`apps/whoobe-one-spike/src/env.d.ts`**: Added `VITE_ASSET_PROCESSOR_URL` declaration.
- **`apps/whoobe-studio/src/resolve-display-url.ts`**: Same fix.
- **`apps/admin-dashboard/src/utils/dam-api.ts`**: Respects `VITE_ASSET_PROCESSOR_URL` from `.env` first.
- **`apps/admin-dashboard/src/utils/auth-api.ts`**: Same for `VITE_CORE_API_URL`.
- **`.env`**: Changed `WHOOBE_HOSTNAME` from `develop.local` to `whoobecms.local`.
- **`dev-cms.sh`**: Updated `--hostname` example to `whoobecms.local`.

---

## [Add deploy.sh script for rsync-based deployment] — 2026-09-06

- **`deploy.sh`**: New script that syncs local code to the remote server via rsync (excludes `.env`, `.git`, `.turbo`, `node_modules`), then SSHes into the remote to run `pnpm install`, `pnpm build`, `pm2 restart`. Accepts `--dry-run` flag. Uses `DEPLOY_HOST` / `DEPLOY_PATH` env vars with sensible defaults for the current setup.

---

## [Fix: nginx /whoobe-one/ API routes proxied to SPA instead of core-api] — 2026-09-06

- **`docs/deployment.md`**: Added a regex location block `~ ^/whoobe-one/(websites|themes|pages|snippets|templates|kits|website-paths|search)(/.*)?$` **before** the generic `/whoobe-one/` SPA catch-all. Without this, all `/whoobe-one/*` requests (including API calls like `GET /whoobe-one/websites` from the admin-dashboard) were proxied to the whoobe-one-spike preview server on port 3006, which returned HTML instead of JSON — causing `SyntaxError: Unexpected token '<'` in the browser console. The new block routes API paths to core-api on port 3003, while the SPA paths still go to port 3006.

---

## [Fix: nginx config bootstrap order in deployment guide] — 2026-09-06

- **`docs/deployment.md`**: Fixed nginx `location ~` regex spanning multiple lines (lines 299–302) — nginx rejects line-wrapped regex patterns as "invalid number of arguments". Collapsed onto a single line.
- **`docs/deployment.md`**: Restructured sections 8–10 to eliminate the bootstrapping deadlock: the old config referenced `/etc/letsencrypt/live/your-domain.com/*.pem` before certbot had run, causing `nginx -t` to fail. Section 8 now provides an HTTP-only config (no SSL cert references), section 9 runs certbot against it, and section 10 provides a manual fallback if certbot didn't add the HTTPS block. Subsequent sections renumbered 10→11 through 14→15.

---

## [Fix: Class List Layout should be the default column set] — 2026-09-04

- **`apps/admin-dashboard/src/views/ObjectsView.vue`**: Changed `handleClassChange()` so the class's own List Layout (configured in Settings > Classes > List Layout) is applied as the default columns whenever it exists and has entries. Previously it was only a fallback when no user-side default preset existed; now the class's List Layout takes priority, and user-side default presets are only used as a secondary fallback when the class has no List Layout configured.
- **`apps/admin-dashboard/src/views/ObjectsView.vue`**: Added a `watch(selectedDataClass, ...)` to handle the race condition where `dataClassesStore.classes` hasn't loaded yet when `handleClassChange()` runs. When the class data arrives asynchronously and no columns were set (still empty from the initial `handleClassChange` call), the watcher now applies the class's List Layout columns automatically.
- **`apps/admin-dashboard/src/views/ObjectsView.vue`**: Fixed cross-contamination between Data Object class list tabs. The `dataObjectsStore` was a global singleton shared by all `ObjectsView` instances (one per tab), causing switching tabs to show the wrong class's data. Changed to per-instance local `objects` ref and `fetchObjects()` call, bypassing the global store entirely. Each class list tab also now ignores the global `dataClassesStore.selectedClassId` watcher — they only react to their own `classId` prop. The section-level Objects tab (no `classId` prop) keeps the old sidebar-sync behavior.
- **`apps/admin-dashboard/src/views/ObjectsView.vue`**: Fixed asset thumbnail previews not appearing in the data object list. Added a `_urlResolveTick` ref that is bumped after every async URL fetch completes, and `recordAssetUrl()` reads it as a dummy dependency — this forces the template to re-evaluate the `v-if`/`:src` expressions reliably even when Vue 3's reactive Map tracking across re-render boundaries is inconsistent. Also added retry logic (up to 3 attempts) to `resolveAssetIdUrl()` matching the existing retry logic in `resolveAssetPathUrl()`.
- **`apps/admin-dashboard/src/views/ObjectsView.vue`**: Improved filter system for relation fields (select/manyToOneRelation/manyToManyRelation with `relationTarget`). Added a `'relation'` filter input type that renders a multiselect dropdown with checkboxes for each related class object. The `matchObjectFilter()` function now extracts `id` from the stored `{ id, classId }` value and matches against the selected IDs. Added `relationOptionsByField` computed to reactively track relation options per field, preloaded when the filter modal opens. Field change handler `onFilterFieldChange()` auto-initializes operator/value when switching between relation and non-relation fields.
- **`apps/admin-dashboard/src/utils/data-objects-api.ts`**: Added `'in'` operator to `DataObjectQueryFilter` interface.
- **`apps/admin-dashboard/src/stores/damStore.ts`**: Changed `extractProgress` from a simple string array to a structured object `{ total, current, filename, recent }`. The `uploadZipAsset()` method now counts total extractable files upfront, updates `current` and `filename` for each extracted file, and keeps the last 20 filenames in `recent` for the scrollable list.
- **`apps/admin-dashboard/src/views/AssetsView.vue`**: Updated the ZIP extraction progress UI to show a progress bar, total file count (`current / total`), the currently-extracting filename, a spinner, and a scrollable list of recent filenames.

---

- **`apps/admin-dashboard/src/views/ObjectsView.vue`**: Fixed `recordAssetUrl()` — when an asset is referenced by UUID but not yet loaded in `damStore.assets` (async loading race), the function now falls back to fetching the single asset by ID from the backend (`fetchAssetById`) and caches the resolved URL reactively. Added `_assetIdUrlCache`/`_assetIdUrlInFlight`/`resolveAssetIdUrl()` parallel to the existing path-based cache, so the template re-renders once the URL arrives.
- **`apps/admin-dashboard/src/utils/dam-api.ts`**: Added `fetchAssetById()` — calls `GET /api/v1/dam/assets/:id?folderRules=...` to resolve a single asset's record + URLs by UUID, following the same pattern as `getAssetById` in the asset-processor backend.
- **`apps/admin-dashboard/src/components/objects/MasterClassTab.vue`**: After saving a class, `handleSave()` now re-hydrates the local state (`name`, `label`, `fields`, `viewConfig`, `listColumns`) from the server response returned by `updateDataClass()`, ensuring the in-memory state reflects exactly what was persisted — prevents stale data after reload when the `hydrated` guard would otherwise skip the server response.
- Verified: admin-dashboard `vue-tsc` typecheck clean.

- **`packages/core/src/db/figma-settings-schema.ts`**: New `figma_settings` Drizzle table (single-row, access_token + team_id + timestamps), matching the mail_settings/ai_settings pattern.
- **`packages/core/src/db/figma-settings-records.ts`**: `getFigmaSettings()` + `upsertFigmaSettings()` — same upsert pattern as ai_settings/mail_settings.
- **`packages/core/drizzle/0033_quiet_figma.sql`**: Migration to create `figma_settings` table (manually authored, 0033 entry in _journal.json).
- **`packages/core/drizzle.config.ts`**: Added figma-settings-schema to schema list.
- **`packages/core/src/server.ts`**: Added figma-settings exports to the Node-only barrel.
- **`apps/core-api/package.json`**: Added `@whoobe-cms/figma-converter` workspace dependency.
- **`apps/core-api/src/server.ts`**: Added three new routes —
  - `GET /figma/settings` (SETTINGS_MANAGE, strips token, returns hasToken)
  - `PUT /figma/settings` (SETTINGS_MANAGE, blank token = keep existing)
  - `POST /figma/import` (OBJECTS_WRITE, proxies Figma API, converts via figma-converter, returns Element tree + warnings)
- **`apps/admin-dashboard/src/utils/figma-settings-api.ts`**: API client for figma settings CRUD (fetch + save).
- **`apps/admin-dashboard/src/components/settings/FigmaSettingsCard.vue`**: Settings card for Figma Personal Access Token configuration (password field, team_id, hasToken indicator).
- **`apps/admin-dashboard/src/stores/tabsStore.ts`**: Added `'figma'` to `SettingsSubSection` union type.
- **`apps/admin-dashboard/src/views/SettingsView.vue`**: Added Figma sub-tab with Palette icon, description, and FigmaSettingsCard rendering.
- **`apps/admin-dashboard/src/layouts/DashboardLayout.vue`**: Added Figma to settings sidebar items and labels.
- **`apps/whoobe-one-spike/src/figma-api.ts`**: HTTP client for figma settings and figma import (matching ai-api.ts pattern).
- **`apps/whoobe-one-spike/src/scripts/figma-actions.ts`**: `insertFigmaAsPage()` and `insertFigmaAsSnippet()` — normalization + insertion logic mirroring AI/kit template patterns.
- **`apps/whoobe-one-spike/src/components/FigmaImportModal.vue`**: Two-tab modal (Live API + Upload JSON) with file key/node id inputs, drag-and-drop JSON upload, DocumentPreview, import-as-page/snippet mode selector, warnings display.
- **`apps/whoobe-one-spike/src/components/BlockEditor.vue`**: Added "Figma" toolbar button next to "AI Page", FigmaImportModal integration, onFigmaImported handler.
- Verified: packages/core, core-api, figma-converter, admin-dashboard, whoobe-one-spike all typecheck clean. 28 figma-converter unit tests pass.

---

## [Phase 1: @whoobe-cms/figma-converter package (Figma → Whoobe converter)] — 2026-09-03 (branch: feat/09-03/figma-converter)

- **New `packages/figma-converter/`** (`@whoobe-cms/figma-converter`): Pure TypeScript package that converts Figma node JSON trees into Whoobe Element trees. Depends on `@whoobe-cms/schema`.
  - `src/figma-types.ts`: Complete Figma REST API type definitions (all node types, paints, effects, layout traits, style types, API responses)
  - `src/figma-node-converter.ts`: Main converter entry point (`convertFigmaNode`) with mapping for FRAME, GROUP, TEXT, RECTANGLE, ELLIPSE, LINE, VECTOR, BOOLEAN_OPERATION, INSTANCE, SECTION, COMPONENT node types
  - `src/layout.ts`: Auto-layout conversion (Figma auto-layout → Tailwind flex classes, absolute positioning → inline style, padding/gap → tailwind arbitrary values)
  - `src/style.ts`: Style conversion (SOLID fills → `bg-[#hex]`, gradients → `bg-gradient-*` or inline, corner radius, drop/inner shadows, layer blur, opacity, text color, stroke/border)
  - `src/text.ts`: Text conversion (TypeStyle → heading tags h1-h6, font weight/size/alignment, line-height, letter-spacing, font family → Google Fonts or inline)
  - `src/resolve.ts`: Figma Live API integration (`fetchAndConvert`, `fetchImageUrls`, `renderNodeToImage`) — fetches files/nodes, resolves image fills, uploads to MinIO
  - `src/utils.ts`: RGBA → hex, RGBA → CSS, Tailwind nearest value matching, random id generation, CSS class dedup
  - `src/types.ts`: Shared types (`WhoobeElementNode`, `ConversionResult`, `FigmaConversionOptions`, `FetchOptions`)
  - 28 unit tests across 3 test suites (converter, layout, style) with 2 Figma JSON fixtures
  - TypeScript + vitest, ES module, typecheck clean, all tests passing

- **docs/plans/figma-converter-plan.md**: Full implementation plan for a Figma-to-Whoobe converter. Covers architecture (new `@whoobe-cms/figma-converter` package, core-api routes, whoobe-one-spike modal), dual import modes (Live API + JSON upload), conversion pipeline (node mapping, auto-layout → Tailwind flex, style conversion, component resolution, image upload), 4 implementation phases (core converter → live API → UI → polish), file summary, and open questions.

---

## [Add simplified architecture domain diagram + architectural principles] — 2026-09-03 (current branch)

- **docs/plans/executive-summary.md**: Added a simplified Mermaid flowchart organized by domain (PIM/MDM, DAM, CMS, Headless SDK, ETL) between the full infra diagram and §3.1. Added a "Principio architetturale" table describing the four key principles: Single Source of Truth, Separazione delle Responsabilità, Headless by Design, Zero Nuove Infrastrutture.

---

## [Add general architecture diagram (Mermaid flowchart) to section 3] — 2026-09-03 (current branch)

- **docs/plans/executive-summary.md**: Added a full Mermaid flowchart diagram at the top of section 3 ("Deep Dive Architetturale") showing all architecture layers — infrastructure (Postgres, MinIO), shared core (@whoobe-cms/core: ORM, Zod, Auth, S3, XState, Mail, Search), backend services (core-api, asset-processor), admin dashboard (admin-dashboard, whoobe-one-spike), headless SDK (schema → renderer → react/next/vue/svelte), frontend consumers, and migration tool — with color-coded boxes and dependency flows. Brief prose summary below the diagram.

---

## [Add Websites & Themes section, renumber 3.9–3.13 to 3.6–3.10] — 2026-09-03 (current branch)

- **docs/plans/executive-summary.md**: New section 3.5 "Siti Web (Multi-site), Template e Temi" covering multi-site management, dynamic URL patterns, website templates (header/aside/footer slots, path pattern overrides), and themes (independent entities, hierarchical assignment website→page, Tailwind `@theme` color injection, Google Fonts loading). Existing sections 3.9–3.13 renumbered to 3.6–3.10.

---

## [Restructure executive-summary.md: split Visual Builder & SDK sections, renumber all subsections, mark SDK risk mitigated] — 2026-09-03 (current branch)

- **docs/plans/executive-summary.md**: Section 3.3 rewritten as dedicated "Visual Builder (Whoobe One)" chapter covering the block editor, JSON output, SEO/themes/snippets/mail-editor/AI. New section 3.4 "SDK Frontend Headless (già implementato)" with three-layer architecture (schema → renderer → adapters) and all four implemented adapters: React 18+, Next.js (App Router ISR), Vue 3, Svelte 5. Existing sections 3.4–3.8 renumbered to 3.9–3.13. Risk 1 in section 5 marked as mitigated — SDK already complete. Step 3 in "Prossimi Passi" updated from "Drafting dell'SDK" to "integrare l'adapter prescelto con il design system".

---

## [Update executive-summary.md with app features 3.4–3.8] — 2026-09-03 (current branch)

- **docs/plans/executive-summary.md**: Added subsections 3.4 (DAM su MinIO/S3), 3.5 (Forms & Notifiche Email), 3.6 (Motore di Pubblicazione XState), 3.7 (Autenticazione e Permessi), and 3.8 (Agente AI Generativo) between the existing 3.3 and section 4, covering the full feature surface described in README.md and implemented in CHANGES.md.

---

## [Extract collectionTypes to data_components] — 2026-09-01 (current branch)

- **New `extract-collection-types-to-components.ts`** (`packages/migration-tool/src/`): CLI command `extract-collection-types` that reads all `data_classes` from the DB, finds `fieldcollections` fields with embedded `collectionTypes`, creates a `data_components` record for each unique collection type (deduplicated by name), and updates the class field to use `allowedComponentTypes` alongside `collectionTypes`.
- **CLI flags**: `--dry-run` (report-only), `--class=<Name>` (optional, default: all classes), `--clear` (delete all components first), `--classes-dir=<path>` (re-populate `collectionTypes` from Pimcore files when missing).
- **Exports**: `runExtractCollectionTypes()` + `ExtractCollectionTypesOptions` type from `@whoobe-cms/migration-tool`.
- **Class trace**: before creating/updating, logs every class + field that references each component (e.g. `Component "ProductBanner" -> Product.content`).
- **Integrated into the PIMCORE MIGRATION SOURCE UI** (`MigrationSourcesCard.vue`): new "Extract Components" action per source with class-name filter + dry-run + clear toggles, backed by new `extractComponentsFromClasses()` client util and a new `POST /migration-sources/:id/extract-components` core-api route (wraps `runExtractCollectionTypes`, OBJECTS_WRITE, no Pimcore DB needed).
- **ZIP extraction progress** (`damStore.ts` + `AssetsView.vue`): when uploading a ZIP archive with auto-extract, the modal now shows a live "Extracting ZIP..." section with up to 10 most recently extracted filenames (monospace, bottom-to-top, overwriting as extraction progresses).
- Verified: `packages/migration-tool` typecheck clean + 55 tests pass, `packages/core` typecheck clean, `core-api` typecheck clean, `admin-dashboard` build (vue-tsc + vite) clean.

---

## [Replace inline getDefaultWhoobeOneSpikeUrl/getDefaultWhoobeStudioUrl with shared editor-urls import] — 2026-09-01 (current branch)

- **New shared utility `utils/editor-urls.ts`**: exports `getWhoobeOneSpikeUrl()` (returns `http://localhost:3006` on localhost, `<origin>/whoobe-one-editor` externally) and `getWhoobeStudioUrl()` (returns `http://localhost:3004` on localhost, `<origin>/whoobe-studio` externally).
- **Removed 8 inline `getDefaultWhoobeOneSpikeUrl()` definitions** from: `WhoobeOneEmbed.vue`, `SnippetEditorEmbed.vue`, `MailTemplateEditorEmbed.vue`, `MenuItemRow.vue`, `PagePreviewTab.vue`, `MasterPageTab.vue`, `DashboardLayout.vue` — all now import `getWhoobeOneSpikeUrl` from `../../utils/editor-urls` (or `../utils/editor-urls` for DashboardLayout).
- **`WhoobeStudioEmbed.vue`**: changed import from `getDefaultWhoobeStudioUrl` (from `documents-api`) to `getWhoobeStudioUrl` (from `editor-urls`).
- **`documents-api.ts`**: removed the now-unused `getDefaultWhoobeStudioUrl()` export entirely.

---

## [Themes as independent entities: new DB table, API, themeId on websites/pages/snippets] — 2026-08-17 (branch: feat/08-16/pimcore-documents-migration)

- **New `themes` table** (`packages/core/src/db/themes-schema.ts`): `id` (uuid pk), `name`, `colors` (jsonb), `fonts` (text[]), `styles` (text), timestamps. CRUD in `themes-records.ts`, exported from `@whoobe-cms/core/server`.
- **API endpoints** (`apps/core-api`): `GET/POST /whoobe-one/themes`, `GET/PUT/DELETE /whoobe-one/themes/:id` — full CRUD for independent theme entities.
- **`themeId` added to websites**: `websites-schema.ts` + `websites-records.ts` + core-api create/update endpoints. Nullable uuid column, references themes.id.
- **`themeId` added to whoobe_pages**: schema + records + core-api create/update endpoints. Nullable.
- **`themeId` added to whoobe_one_snippets**: schema + records + core-api create/update endpoints. Nullable.
- **Drizzle migration `0030`**: creates themes table, adds theme_id columns to websites/whoobe_pages/whoobe_one_snippets.
- **Test fix**: `page-path-pattern.test.ts` mock page now includes `themeId: null`.
- **Drizzle config**: added `themes-schema.ts` to the schema list.

---

## [Snippet editor: load all themes from all websites, no websiteId required] — 2026-08-17 (branch: feat/08-16/pimcore-documents-migration)

- **Backend**: `GET /whoobe-one/themes/all` returns all themes from every website, grouped by website (id + name). Used by snippet editors that don't belong to a specific website.
- **`loadAllThemes`** (`database-actions.ts`): fetches all themes across all websites, prefixed with `websiteId:` for unique IDs and labeled with `(websiteName)` for clarity. Sets the first theme as active.
- **Editor.vue**: snippet and new-snippet branches now call `loadAllThemes()` when no `websiteId` query param is provided, so all website themes are available and selectable in the snippet editor's Theme modal.

---

## [Snippet editor: pass websiteId for theme availability] — 2026-08-17 (branch: feat/08-16/pimcore-documents-migration)

- **SnippetEditorEmbed.vue**: accepts optional `websiteId` prop, passed as `?websiteId=` query param to the spike editor iframe.
- **Editor.vue**: snippet and new-snippet branches now read `route.query.websiteId` and call `loadWebsiteTheme()` when present, so theme colors/fonts are available in the snippet editor the same way they are for pages.

---

## [Theme: font picker shows website theme fonts + Theme modal shows theme selector] — 2026-08-17 (branch: feat/08-16/pimcore-documents-migration)

- **FontControl.vue** (Customize > Typography > Font): now cascades through per-page theme fonts → website theme fonts → default env list, so website theme fonts appear in the editor's font selector.
- **ThemeModal.vue**: rewritten to show the list of website themes (`editor.websiteThemes`) at the top, with a radio-button selector. The user picks a theme for the current page, which sets `editor.websiteTheme` (the active session theme). Below the theme picker, the per-page color/font overrides remain editable — they override the website theme when same color name, or when the page has its own font list. The old "Page Theme" label is now just "Theme", matching the topbar button.

---

## [Multiple named themes per website: create, edit, delete, set default] — 2026-08-17 (branch: feat/08-16/pimcore-documents-migration)

- **Data model**: themes are now stored as `settings.themes[]` (array of `{ id, name, colors, fonts }`) with `settings.defaultThemeId` pointer. Backward-compatible: the old `settings.theme` singular format is migrated on read.
- **Backend** (`apps/core-api`): new endpoints — `GET /websites/:id/themes` (list + defaultThemeId), `POST /websites/:id/themes` (create), `PUT /websites/:id/themes/:themeId` (update name/colors/fonts + set as default), `DELETE /websites/:id/themes/:themeId` (remove). Legacy `GET/PUT /websites/:id/theme` kept for backward compat.
- **Admin dashboard** (`MasterWebsiteTab.vue`): Theme tab now shows a list of named themes with inline name editing, color/font summary, set-default and delete actions. A modal editor opens for editing a theme's colors and fonts. Create new theme button.
- **Editor store** (`editor.ts`): new `websiteThemes` array ref (+ `setWebsiteThemes` action), populated alongside the active `websiteTheme` when a page/snippet loads.
- **`loadWebsiteTheme`** (`database-actions.ts`): now fetches the full themes list, sets the default theme as active, and stores all themes in the store for the editor to offer as presets.

---

## [Website-level themes: manage colors/fonts per website, inherited by all pages and snippets] — 2026-08-17 (branch: feat/08-16/pimcore-documents-migration)

- **Backend** (`apps/core-api`): new `GET /whoobe-one/websites/:id/theme` and `PUT /whoobe-one/websites/:id/theme` endpoints, storing/reading the theme in `websites.settings.theme` (the existing generic JSONB column). Zod-validated shape: `{ colors: { name, hex }[], fonts: string[] }`.
- **Admin dashboard** (`MasterWebsiteTab.vue`): new "Theme" sub-tab with color-name/hex pairs (add/remove/rename) and font list (add/remove). Saves to the website via the new API.
- **Editor store** (`editor.ts`): new `websiteTheme` ref and `setWebsiteTheme` action, populated from the backend when a page/snippet loads.
- **`loadPage` / `loadWebsiteTheme`** (`database-actions.ts`): after loading a page with a `websiteId`, fetches the website theme and sets it as the current session theme. Same `loadWebsiteTheme` helper is available for snippet loading.
- **`useThemeStyles`** (composable): now merges two layers — website theme as the base, per-page document theme as overrides. Colors with the same name replace the website entry; fonts use page fonts if present, otherwise website fonts, otherwise the default env list. Watches both `editor.websiteTheme` and `getDoc()?.theme`.
- **Page API client** (`pages-api.ts`): `WhoobeOnePage` now includes `websiteId: string | null`.
- **Tabs store** (`tabsStore.ts`): `WebsiteSubTab` union extended with `'theme'`.

---

## [Date transformer: remove unused timeStyle option, simplify to dateStyle + includeTime only] — 2026-08-17 (branch: feat/08-16/pimcore-documents-migration)

- Removed `timeStyle` from `DateTransformOptions` — it was never exposed in the UI (only dateStyle select + includeTime checkbox appeared). Time is now hardcoded to `'short'` when `includeTime` is true.
- Updated both whoobe-one-spike `field-transforms.ts` and SDK schema `transform.ts` + `validators.ts`.

---

## [Data Binding date transformer: use page locale for date formatting] — 2026-08-17 (branch: feat/08-16/pimcore-documents-migration)

- **Date transformer now uses page locale**: `Intl.DateTimeFormat(locale ?? undefined, ...)` instead of `Intl.DateTimeFormat(undefined, ...)`. When a page locale (e.g. `it`, `en`) is available from `editor.page?.locale`, dates are formatted in the page's language/region. Falls back to browser default when unset.
- **Signature**: `TransformerDefinition.apply` and `applyTransform` both accept an optional `locale` parameter, threaded through from call sites in BlockElement.vue and BlockElementPreview.vue.
- **SDK schema sync**: duplicate `transform.ts` in `packages/sdk/schema` updated with the same locale support.

---

## [Images: remove duplicate background-image on <img> elements (SVG double-render)] — 2026-08-17 (branch: feat/08-16/pimcore-documents-migration)

- **Bug**: the `stile` computed in BlockElement.vue and BlockElementPreview.vue unconditionally set `background-image: url(...)` from `el.image.url`. For `<img>` elements, that same URL is already shown via `:src` — so SVGs (transparent background) rendered double, and raster images had an invisible duplicate layer underneath. Caused by treating `image.url` as a CSS background even when the element IS an image element.
- **Fix**: both components now skip `background-image` when `el.element === 'img'`. The `showBg` guard already existed for data-bound src images; this extends it to all `<img>` elements. Containers (BlockContainer/BlockSlider) still get `background-image` from `image.url` as before.

---

## [Theme: fonts not applied in public/preview — moved font loading from App.vue into useThemeStyles composable used by all renderers] — 2026-08-17 (branch: feat/08-16/pimcore-documents-migration)

- **Bug**: Google Fonts `<link>` tags were only injected by a watcher on `editor.document` in `App.vue`. PublicPage.vue fetches into its own local `doc` ref (never writes to the editor store), so page-specific fonts from ThemeModal were silently missing — only the default `VITE_FONT_FAMILIES` list loaded.
- **Fix**: moved font loading into the `useThemeStyles` composable, which already runs in all three renderers (BlockEditor.vue, DocumentPreview.vue, PublicPage.vue). The composable now manages both the `@theme` color `<style>` AND the Google Fonts `<link>`, keyed on the same getter function. Fallback to `editor.fonts` (the default list) when the document has no page-specific fonts.
- **Cleanup**: removed the now-duplicate font watch from `App.vue` (it still keeps the onMounted bootstrap). Unused `computed`/`watch` imports removed.

---

## [Theme: fix useThemeStyles null ref crash + safeAlpineValue for invalid Alpine expressions] — 2026-08-17 (branch: feat/08-16/pimcore-documents-migration)

- **Bugfix `useThemeStyles`**: Pinia setup stores auto-unwrap refs, so passing `editor.document` directly passed the value (not the ref). Changed to accept a getter `() => doc` instead of `Ref<doc>`, preventing `Cannot read properties of null (reading 'value')` crash. Updated all 3 callers (BlockEditor.vue, DocumentPreview.vue, PublicPage.vue).
- **`safeAlpineValue` helper** (`helpers.ts`): Alpine directives are evaluated as JS expressions, so typing a bare Tailwind class like `h-[600px]` into the `x-bind:class` value field of AlpineControl throws a SyntaxError. The helper validates the value with `new Function()`, and when it fails, wraps it in single quotes so it behaves as a string literal — what a non-technical user expects. Applied in all 3 preview components' `alpineAttrs` computed. Cosmetic fix: previously a silent `eval()` error in the console, now silently corrected to the expected display behaviour.

---

## [Theme: inject @theme colors so named custom classes (e.g. bg-light-grey) are recognized at runtime] — 2026-08-17 (branch: feat/08-16/pimcore-documents-migration)

- **Bug**: custom theme colors defined in ThemeModal (name + hex) were stored on the document but never registered with `@tailwindcss/browser`. Typing a named class like `bg-light-grey` into Custom Classes (or any other CSS textarea) silently produced no CSS, because the runtime engine didn't know `light-grey` as a valid color.
- **Fix**: new `useThemeStyles()` composable injects a `<style id="whoobe-theme-styles">` element into the page `<head>` containing `@theme { --color-{name}: {hex}; ... }` — the standard Tailwind v4 mechanism for registering custom color tokens. `@tailwindcss/browser`'s MutationObserver picks it up immediately and recompiles, so `bg-light-grey` (or any user-named color) starts working the moment the ThemeModal closes.
- **Coverage**: the composable is called from `BlockEditor.vue` (watches `editor.document.theme.colors`), `DocumentPreview.vue` (watches the previewed doc prop), and `PublicPage.vue` (watches the fetched public page). Shared `<style>` element — multiple watchers all update the same tag, no duplication.

---

## [Collection pagination: user-set rows per page + standard/lazyload modes] — 2026-08-17 (branch: feat/08-16/pimcore-documents-migration)

- **Rows per page is now a free number input** in DataObjectPicker.vue's Dynamic query config (was a fixed 5/10/25/50 select) - any user value paginates the resolved set; 0 = no pagination.
- **New `paginationMode` on `ElementDataBinding`**: `standard` (existing Prev/Next arrows + page indicator, the default) or `lazyload` (rows are appended to the currently-shown list in batches of `rowsPerPage`). Lazy load shows a "shown / total" counter (e.g. `10 / 48`) on its own line, then a "More" button whose **text and Tailwind classes are configurable** (`loadMoreText`, `loadMoreClass`).
- **Pagination container is configurable** via `paginationContainerClass` - a Tailwind class string for the block-level wrapper under the list (both modes). Default: centered, full-width flex column on its own line. Applied in both `preview/BlockContainerPreview.vue` and `BlockContainer.vue` (editor canvas).
- **Rendering**: lazyload implemented in both preview and editor canvas, each with a sensible default "More" button style when `loadMoreClass` is unset. State resets when the resolved set changes.
- **Type surface**: `ElementDataBinding` (whoobe-one-spike `ElementsClass.d.ts`) + SDK schema (`packages/sdk/schema` `node.ts` / `validators.ts`) gained `paginationMode`, `loadMoreText`, `loadMoreClass`, `paginationContainerClass`. Purely client-side, never sent to the server (matches `rowsPerPage`).

---

## [Editor: remove min-h-8 leak from preview/public rendering] — 2026-08-17 (branch: feat/08-16/pimcore-documents-migration)

- **Rows per page is now a free number input** in DataObjectPicker.vue's Dynamic query config (was a fixed 5/10/25/50 select) - any user value paginates the resolved set; 0 = no pagination.
- **New `paginationMode` on `ElementDataBinding`**: `standard` (existing Prev/Next arrows + page indicator, the default) or `lazyload` (rows are appended to the currently-shown list in batches of `rowsPerPage`). Lazy load shows a "shown / total" counter (e.g. `10 / 48`) on its own line, then a "More" button whose **text and Tailwind classes are configurable** (`loadMoreText`, `loadMoreClass`).
- **Rendering**: lazyload implemented in both `preview/BlockContainerPreview.vue` (public/Preview) and `BlockContainer.vue` (editor canvas), each with a sensible default "More" button style when `loadMoreClass` is unset. State resets when the resolved set changes.
- **Type surface**: `ElementDataBinding` (whoobe-one-spike `ElementsClass.d.ts`) + SDK schema (`packages/sdk/schema` `node.ts` / `validators.ts`) gained `paginationMode`, `loadMoreText`, `loadMoreClass`. Purely client-side, never sent to the server (matches `rowsPerPage`).

---

## [Editor: remove min-h-8 leak from preview/public rendering] — 2026-08-17 (branch: feat/08-16/pimcore-documents-migration)

- **Bug**: `template-generator.ts` baked `min-h-8` into every data-bound element's stored `css.css` (line 105–108), and `BlockElementPreview.vue` also added it at render time (line 288) — so data-bound elements in preview/public mode had an unwanted `min-height: 2rem` floor. This class is an editing affordance (makes empty elements selectable/clickable in the canvas) and should never appear outside the editor.
- **Fix**: Removed the `min-h-8` baking from `template-generator.ts`'s `createBoundElement` (keeps it out of stored content). Removed the render-time addition from `BlockElementPreview.vue`'s `classe` computed. The editor-only fallback remains in `BlockElement.vue:215`, so canvas-bound elements still get the floor while editing.

---

## [migrate-assets + review UI + promote guard on direct write] — 2026-08-17 (branch: feat/08-16/pimcore-documents-migration)

- **migrate-assets (Phase 1)**: new `runAssetMigration` in migration-tool/cli.ts walks the same documents `migrate-documents` walks, collects asset paths referenced by image/video editables (top-level + nested inside areablock bricks), reads bytes from the source filesystem via `PIMCORE_VAR_ASSETS_PATH`, uploads to MinIO via `S3AssetStorageProvider`, and creates `assets`/`folders` rows path-keyed like a normal DAM upload. Flags: `--dry-run`, `--source=`, `--limit=`, `--public`. Backed by the CLI command `migrate-assets` and the `runAssetMigration` export.
- **Source adapter asset support**: `PimcoreSourceAdapter` gained optional `listAssets()`/`readAssetFile()` (interface + mysql-adapter + fixture-adapter implementations). MysqlPimcoreSourceConfig gained `assetsPath` config.
- **Fixture adapter extended**: `FixturePimcoreDataset` now supports optional `assets` and `assetBytesByPath` fields for migrate-assets testing.
- **core-api endpoints**: `POST /migration-sources/:id/import-documents` (staging flag), `POST /migration-sources/:id/promote-documents`, `GET/DELETE /whoobe-one/pages/staged`, `POST /whoobe-one/pages/staged/promote`, `POST /whoobe-one/pages/staged/:id/promote`. All wired into `apps/core-api/src/server.ts`.
- **Published-page guard on direct write**: `runDocumentMigration`'s non-staging path now consults `findPublishedWhoobePageConflict` before upserting (same as the promote path), preventing `migrate-documents` from silently clobbering published pages. Staging exempt.
- **Drizzle migration 0029**: new `whoobe_pages_staging` table schema + records module.
- **Export surface**: `cli.ts` and `index.ts` export `runAssetMigration`, `runDocumentMigration`, `runPromoteDocuments`, `runPromoteDocument` + their option types.

---

## [Promote guard extended to the direct migrate-documents path] — 2026-08-16 (branch: feat/08-16/pimcore-documents-migration)

- **Extends the published-page guard**: `runDocumentMigration`'s direct (non-staging) write now also consults `findPublishedWhoobePageConflict` before `upsertWhoobePageByPimcoreId` - a converted document whose `pimcore_id` or `slug` path collides with a live, `published: true` page is skipped with a clear failure instead of silently clobbering an editor's published edits. Previously only the promote path (runPromoteDocuments/runPromoteDocument) was guarded; the direct `migrate-documents` (and the backend's `/migration-sources/:id/import-documents` with `staging: false`) could still overwrite. Staging remains exempt (it never touches `whoobe_pages`).
- Verified: positive test against the live DB (a temporary published page at `/it/shared/header/` blocks its staged counterpart; cleaned up after), 0 current staged rows blocked, migration-tool 55 tests + all 13 typechecks clean, core-api restarted.

---

## [Promote guard: never overwrite a live published page] — 2026-08-16 (branch: feat/08-16/pimcore-documents-migration)

- **Bug**: promote (all or single) could silently overwrite a page that was previously migrated, later edited and **published** - `upsertWhoobePageByPimcoreId` upserts on `pimcore_id` and clobbers `content`, and the guard wasn't checking whether the target was already published.
- **Fix**: new `findPublishedWhoobePageConflict(locale, slug, pimcoreId)` in `whoobe-pages-records.ts` - returns a live, `published: true` page whose `pimcore_id` matches the staged row OR whose `slug` (path) matches it (slug matched regardless of locale deliberately, since migrated rows are still hardcoded `locale: 'en'` (plan Phase 3) while real published pages may be `it` - a locale-qualified match would let the overwrite through). Both `runPromoteDocuments` and `runPromoteDocument` consult it before upserting and report a clear "Skipped - a published page already exists at ..." failure instead of overwriting. Unpublished pages remain fair game (promote never flips publish state anyway).
- Verified: guard blocks 0 current staged rows against the live DB (the 4 published pages are authored, no slug/pimcore overlap), migration-tool 55 tests + all 13 typechecks clean, core-api restarted with the guard live.

---

## [Fix: per-row Promote now promotes only that staged page] — 2026-08-16 (branch: feat/08-16/pimcore-documents-migration)

- **Bug**: the Pages panel's per-row "Promote" and the detail drawer's "Promote this page" both called the whole-table endpoint (`POST /whoobe-one/pages/staged/promote`), so "promote one" promoted all 129 staged rows. Root cause: `PagesView.vue`'s `promoteOne` used `promoteStagedPages` (the promote-all API helper) instead of a single-page variant.
- **Fix**: new `runPromoteDocument({ stagedId, dryRun, clear })` in migration-tool (same upsert primitive and never-touch-publish-state guarantee as `runPromoteDocuments`, scoped to one staged row by id, missing row reported as a failure) + new `POST /whoobe-one/pages/staged/:id/promote` core-api route. Admin-dashboard gained `promoteStagedPageById` in `pages-api.ts`; `PagesView.vue`'s `promoteOne` now calls it. Promote All still uses the whole-table path.
- Verified: migration-tool build/typecheck/tests (55) clean, core-api + admin-dashboard typecheck clean, both routes confirmed live (401 without auth).

---

## [Pages view: Staged migration tab (review before promote)] — 2026-08-16 (branch: feat/08-16/pimcore-documents-migration)

- **`PagesView.vue` gained a Pages/Staged mode toggle** in its header. "Staged" lists every `whoobe_pages_staging` row (title/slug/locale/pimcore id/staged-at) fetched from the existing `GET /whoobe-one/pages/staged` endpoint - the review surface the staged migration workflow was missing, so an admin can check what an import produced *before* promoting it into the real Pages table.
- Per-row **Promote** / **Discard** actions, plus a **Promote All** (with "clear staging after" checkbox) and a click-to-open **detail drawer** showing the converted `content` JSON for inspection. All promote/discard calls refresh both the staged list and the live pages list, so the Pages tab reflects the change immediately.
- **New source-agnostic `POST /whoobe-one/pages/staged/promote`** route in core-api (wraps the same `runPromoteDocuments` as the migration-sources-scoped route) - the Pages panel shouldn't need a migration-source id to trigger promote. New admin-dashboard API helpers `fetchStagedPages`/`deleteStagedPageById`/`promoteStagedPages` + `StagedWhoobePage` type in `pages-api.ts`.
- Verified: admin-dashboard `vue-tsc` clean, core-api typecheck clean, all 13 packages/apps typecheck clean.

---

## [Staged Documents migration (whoobe_pages_staging) + backend availability] — 2026-08-16 (branch: feat/08-16/pimcore-documents-migration)

- **`whoobe_pages_staging`** table (new `whoobe-pages-staging-schema.ts`/`-records.ts`, Drizzle migration `0029`): structural mirror of `whoobe_pages` + `staged_at`, same unique indexes (`pimcore_id`, `(locale, slug)`, `(translation_group_id, locale)`) so a constraint violation surfaces at staging time, not promote time. Records layer: `upsertStagedWhoobePageByPimcoreId` (upsert-by-pimcore_id, stamps `staged_at`), `listStagedWhoobePages`, `getStagedWhoobePage`, `deleteStagedWhoobePage`, `clearStagedWhoobePages`.
- **`migrate-documents --staging`** refactored into exported `runDocumentMigration(options)` (like `runClassMigration`/`runObjectMigration`): `staging: true` lands converted pages in `whoobe_pages_staging`, default writes straight to `whoobe_pages` as before - same converter, same upsert-by-pimcore_id primitive, only the target table differs. **`promote-staging`** command (`runPromoteDocuments`): copies every staged row into `whoobe_pages` via `upsertWhoobePageByPimcoreId` (never touches `published`/`workflowState`, idempotent by pimcore_id), flags `--dry-run`/`--clear`. Both exported from migration-tool's `index.ts`.
- **Backend (`apps/core-api`)**: `POST /migration-sources/:id/import-documents` (body `dryRun`/`limit`/`staging`), `POST /migration-sources/:id/promote-documents` (body `dryRun`/`clear`), and review surface `GET /whoobe-one/pages/staged` + `DELETE /whoobe-one/pages/staged/:id` (registered before `/whoobe-one/pages/:id` so "staged" isn't captured as an id).
- **Admin UI (`MigrationSourcesCard.vue`)**: per-source "Import Documents" (limit, dry-run, **stage** toggle) and "Promote Staging" (dry-run, clear) controls; new `importDocumentsFromPimcore`/`promoteDocumentsFromStaging` in `migration-sources-api.ts`.
- Tests: 2 new DB-free staging tests in migration-tool (`runDocumentMigration` dry-run with `--staging` matches the direct path; unresolvable asset produces a null-URL image node, batch survives). migration-tool now 55 tests; all 13 packages/apps typecheck clean; admin-dashboard `vue-tsc` clean.
- Docs: `docs/guides/api-reference.md`, `README.md`, and the plan's Phase 1 status block updated with the staged workflow.

---

## [migrate-assets: Phase 1 of the Documents → Pages migration] — 2026-08-16 (branch: feat/08-16/pimcore-documents-migration)

- **Built `migrate-assets`** (docs/plans/cms/documents-migration.md Phase 1 - the site's biggest correctness blocker): walks the same documents `migrate-documents` walks, collects the asset paths those documents actually reference (top-level image/video editables plus image/video fields nested inside every areablock brick), then for each path reads the real file bytes from the source Pimcore install's filesystem and uploads them into this system's own S3/MinIO bucket + `assets` table - reusing the DAM's conventions (`S3AssetStorageProvider.uploadAsset` + `upsertAssetRecord`), so a migrated page's images/videos finally resolve instead of 404ing.
- `PimcoreSourceAdapter` gained optional `listAssets()`/`readAssetFile()` (asset migration support, same optional-style as Data Object migration); mysql adapter implements both (`PIMCORE_VAR_ASSETS_PATH` config for the source install's asset directory, byte reads keyed by the `assets.data` column with a path-composition fallback); fixture adapter gained in-memory assets/bytes for tests.
- New exported `runAssetMigration(options)` (parameterized like `runClassMigration`/`runObjectMigration`, for CLI + future core-api reuse); CLI command `migrate-assets` with `--dry-run`, `--source=`, `--limit=`, `--public`. Best-effort `folders` row creation for the full ancestor chain so migrated assets are browsable in the DAM UI. Deliberately path-filtered (uploads only what documents reference, not the whole source library).
- Tests: 4 new migrate-assets tests (referenced-path collection incl. brick-nested fields, missing-catalogue-row, missing-bytes, unreferenced-assets-excluded). migration-tool now 53 tests, all passing; all 13 packages/apps typecheck clean.
- Docs: help text, `docs/guides/api-reference.md`, and `README.md` updated (no longer "not yet built").

---

## [Search element: CSS fully editable/removable] — 2026-08-15 (branch: master)

- `SearchElement.vue` no longer hardcodes styling on the search input/button/dropdown - it only keeps structural layout classes (`flex-1 min-w-0` on the input, `shrink-0 inline-flex items-center justify-center` on the button, dropdown positioning). The look now comes entirely from `searchConfig.inputClass`/`buttonClass`/`dropdownClass`.
- `ElementsClass.js` `Search()` pre-fills those config fields with the previous built-in classes (input pill, violet button, dropdown), so new search boxes look the same out of the box - but they're normal editable fields, so `SearchConfigControl` can change or **clear** them (blank = no styling). `SearchConfigControl` + `ElementsClass.d.ts` comments updated.

---

## [Outgoing Mail: main sidebar item] — 2026-08-15 (branch: master)

- **Outgoing Mail** promoted from a Settings sub-section to its own main sidebar item, positioned just before **Settings** (`SectionKind 'mail'` + `MailSettingsView.vue`, which renders the existing `MailSettingsCard` - Settings, Email Test, Mail Log, Templates tabs).
- Removed the now-redundant Settings → Mail submenu entry, the `mail` member of `SettingsSubSection`, and the dead `MailSettingsCard`/`Mail` references in `SettingsView.vue`.

---

## [Website route preview: fix data bindings with a template] — 2026-08-15 (branch: master)

- `resolveDocumentData` (whoobe-one-spike `data-resolver.ts`) gained a `reset` option (default true). The website route preview composes the body page plus the template's header/aside/footer modules, each resolved separately - previously every call reset `editor.resolvedData = {}`, so each module wiped the body's bindings (and vice versa) and data-bound elements rendered empty. `PublicPage.vue` now resolves the modules with `reset=false`, merging their bindings into the same map; single-document callers (editor, DocumentPreview, FloatingToolbar) keep the reset behavior.

---

## [Silence Node `--localstorage-file` warning from tw-to-css] — 2026-08-15 (branch: master)

- `packages/core/src/mail/tailwind-inline.ts` now lazy-loads `tw-to-css` (via `createRequire`) on first use instead of importing it at module load. Its bundled postcss touches `global.localStorage`, which made Node 25 print a spurious `` `--localstorage-file` was provided without a valid path `` warning on every core-api startup. Startup logs are now clean; the warning only appears if an email with Tailwind classes is actually rendered (harmless). Conversion behavior unchanged (59 core tests pass).

---

## [Snippets main item + snippet slot picker + editor canvas classes] — 2026-08-15 (branch: master)

- **Snippets sidebar item**: new **Snippets** main section (`SnippetsView.vue`) lists `whoobe_one_snippets` with name search + category filter; clicking opens an editor tab (`MasterSnippetTab.vue` → `SnippetEditorEmbed.vue`, `/editor?snippetId=`); "+ New Snippet" opens `/editor?snippetNew=1` (created on first save). New `snippetsStore`, `utils/snippets-api.ts`, `tabsStore.openSnippet`, `MasterItemKind 'snippet'`, and sidebar wiring in `DashboardLayout`.
- **Snippet editing in the editor**: `whoobe-one-spike` loads/saves snippets via new `loadSnippet`/`saveSnippet` (database-actions), `getSnippet` API, store `snippetId`/`snippetMode`, `/editor?snippetId=`/`snippetNew` handling in `Editor.vue`, and a Save branch + chrome hiding in `BlockEditor.vue`. New `GET /whoobe-one/snippets/:id` route; PATCH category no longer required non-empty.
- **Snippet picker filters**: the website-template slot picker gained a **search by name** + **category filter** (both in WebsiteTemplatesManager and SnippetsView).
- **Editor container classes fix**: the default document root no longer bakes `gap-4 min-h-[600px] bg-white` into stored content (new `createEmptyDocumentRoot()`); the canvas min-height is now an **editor-only** affordance (`.whoobe-canvas-root` in the spike's style.css, applied in `BlockContainer.vue`), so it no longer renders in preview/public and never fights user-assigned container classes.

---

## [Website template slots: reusable snippets] — 2026-08-15 (branch: master)

- `TemplateSlot` (schema + dashboard type) gains `snippetIds` - references to `whoobe_one_snippets` (reusable Element subtrees saved from the Whoobe One editor), so a header/aside/footer slot can include user-created snippets alongside module pages and custom JSON elements.
- Public composition: the slot's referenced snippets are appended to the composed slot's `pages` (id/title/node), so both whoobe-one-spike's renderer and the headless SDK compose them unchanged. New `getWhoobeOneSnippet(id)` record. Verified: a header slot with a snippet composes it ("Top Bar" → its node).
- Admin UI (`WebsiteTemplatesManager.vue`): each slot gains a snippet chip row + "+ Add snippet" picker modal (list of all snippets, click toggles assignment, removable chips), alongside the module picker and custom-elements JSON.

---

## [Website template slots: user-created elements] — 2026-08-15 (branch: master)

- `TemplateSlot` (schema + dashboard type) gains an optional `content` field: a directly-authored Element tree (or an array of trees) rendered in the header/aside/footer slot **alongside** the module pages - so a slot can include user-created elements (logo, custom menu, footer text) without a whole module page.
- Public composition: the slot's `content` nodes are appended to the composed slot's `pages` as pseudo-pages (id/title/content), so both whoobe-one-spike's renderer and the headless SDK compose them unchanged. Verified: a header with 1 module + 2 custom elements → 3 composed pages; a footer with only custom content renders.
- Admin UI (`WebsiteTemplatesManager.vue`): each slot gains a "Custom elements (JSON)" editor (an Element tree from the editor, or an array), validated before save; an empty slot with only custom content is created on save.

---

## [Website preview: layout without ?websiteId, no ?locale in previews] — 2026-08-15 (branch: master)

- **Public route infers the website for template composition**: `GET /public/pages/:locale/*` now uses the resolved page's own `websiteId` when no `?websiteId=` query param is given, so headless consumers (whoobe-one-spike's public renderer) receive the composed `layout` (header/footer) without knowing the website up front. Verified: `/public/pages/it/it/magazine/` (no query) returns `layout.template = "Default"` with 1 header + 1 footer module.
- **No `?locale=` in path previews**: the Website → Paths item preview (👁) no longer appends `?locale=` — the path carries the locale and the renderer derives it. (Page Preview and "Open in a new tab" already had no query.)

---

## [Website preview + per-route template fixes] — 2026-08-15 (branch: master)

- **Preview no longer depends on `?locale`**: `PagePreviewTab.vue` drops the `?locale=` query (pages carry the locale in their path, `/it/…`); `PublicPage.vue` (whoobe-one-spike) derives the locale from the path's first segment when the query is absent, and a failed layout-module data resolution is now non-fatal (warn + skip) so a broken module never turns the page into "Page not found".
- **Per-route template association**: `MenuItemRow.vue` now shows, on each path item, the Website Template that applies to that route (via a new `resolveTemplateForItem` prop from `MasterWebsiteTab`, using the same path-pattern-override-else-default resolution; " (default)" marked). Templates also re-fetch when entering the Paths tab so a freshly created template appears without a tab reload.
- Verified: the public route returns the composed layout (template "Default", header + footer module) for a page under `/it/**`.

---

## [Website Paths: show assigned Website Template] — 2026-08-15 (branch: master)

- `MasterWebsiteTab.vue` (Website → Paths): each path group now shows the Website Template(s) that apply to its items, resolved client-side with the same semantics as the server (`getWebsiteTemplateForPath`): the longest `path_patterns` match wins per item path (item `path` → linked page's slug → raw `url`), else the website's default template, marked "(default)". "no website template" when the website has none. Templates are loaded per website and recomputed when paths/templates change.

---

## [Website preview shell + module picker UI] — 2026-08-15 (branch: master)

- **Website preview**: the whoobe-one-spike public page renderer (`PublicPage.vue`) now composes the full site shell - it consumes the `layout` object returned by `GET /public/pages/:locale/*` and renders `<header>`/`<aside>`/`<main>`/`<footer>` with the template's module pages (slot `className`/`style` applied, module data bindings resolved). The admin dashboard's Page Preview iframe and the editor's "Open in a new tab" therefore show the real website with header/body/footer, not just the body page. `getPublicPage` (spike `pages-api.ts`) carries the `layout` type.
- **Module assignment UX**: `WebsiteTemplatesManager.vue` slots no longer use checkboxes - each slot shows its assigned modules as removable chips (×) plus an "+ Add module" button that opens a picker modal listing the website's module pages; clicking one adds (or removes) it, with a Done button to close.

---

## [Pages list: Kind column] — 2026-08-15 (branch: master)

- `PagesView.vue`: new **Kind** column in the pages table (badge: violet "module" / slate "content"), added to the column picker (visible by default, toggleable/orderable) and to the filter fields.

---

## [Website Templates implemented] — 2026-08-15 (branch: master)

- **Page kind**: `whoobe_pages.kind` (`content`/`module`, migration `0028`). Routing + sitemap only serve `content` pages; `listPublishedModulePages()` loads published modules (with default-locale fallback). `POST`/`PATCH /whoobe-one/pages` accept `kind`; editor + dashboard page types updated.
- **`website_templates` table** (schema/records): per-website header/aside/footer slot config (`pageIds` + wrapper `className`/`style`), `path_patterns` glob overrides, one `is_default`; `getWebsiteTemplateForPath` = longest-path-pattern match else default. CRUD at `/whoobe-one/websites/:websiteId/templates` (SETTINGS_MANAGE).
- **Public composition**: `GET /public/pages/:locale/*` returns a non-breaking `layout` object with the resolved template + slot module trees; a broken template never 500s.
- **Admin UI**: Pages settings gain a Kind select; website tab gains a **Templates** sub-tab (`WebsiteTemplatesManager.vue`) with per-slot module pickers + classes/style + path patterns + default toggle, reachable via a Templates button in `WebsiteSettingsCard`.
- **Headless SDK shell**: `@whoobe-cms/renderer` `composeLayout()` + `PublicLayout`/`ComposedLayout`; React/Vue/Svelte `<WhoobePage>` render the header/aside/main/footer shell (auto-compose on fetch, `layout` prop for SSR); `@whoobe-cms/next` `getPageData` composes for RSC/ISR.
- Verified: all packages typecheck; SDK 69 tests + core 59 pass; migration applied; live end-to-end (content page + module + default template → composed layout, empty slot null, module not routable).

---

## [Website Templates plan] — 2026-08-15 (branch: master)

- `docs/plans/cms/website-templates.md` expanded from a 26-line sketch into a full plan (style of pimcore-areablock-import-plan.md): page `kind` (`content`/`module`), a per-website `website_templates` table with header/aside/footer slot config (page ids + per-slot className/style) and path-pattern overrides + one default, public-route template resolution returning a `layout` object (non-breaking), a `composeLayout`/`layout` prop in the headless SDK shell, admin UI in the Websites card, and phases/sequencing/file-summary/verification/open-questions sections. Grounded in the existing `whoobe_pages`/`websites`/`website_paths`/public-route/SDK infra.

---

## [Page editor: full-screen mode] — 2026-08-15 (branch: master)

- `MasterPageTab.vue`: a Maximize/Minimize toggle button next to the "Open in a new tab" link opens the embedded Whoobe One editor in a full-screen overlay (`fixed inset-0`, header with the page title + Close button, `WhoobeOneEmbed` filling the viewport) - same pattern as the HTML mail-template editor. Disabled for unsaved (new) pages.

---

## [Headless SDK guide: architecture updated] — 2026-08-15 (branch: master)

- `docs/guides/headless-sdk.md` architecture section rewritten: the layer diagram now shows all three layers (contract → core → adapters) and all four adapters (`@whoobe-cms/react`, `@whoobe-cms/vue`, `@whoobe-cms/svelte`) plus `@whoobe-cms/next` (server-only RSC/ISR helpers on top of React), and a prose summary of the pipeline.

---

## [Headless SDK: React & Next.js adapters] — 2026-08-15 (branch: master)

- **`@whoobe-cms/react`** (`packages/sdk/react`, React 18+): `WhoobeProvider`/`WhoobeNode`/`WhoobePage`, default primitives, hooks (`usePage`/`useObject`/`useQuery`/`useForm`/`useWhoobe`), `descriptorToProps`. `jsx: react-jsx`, builds with `tsc`; tested via `renderToStaticMarkup` (3 tests).
- **`@whoobe-cms/next`** (`packages/sdk/next`): server-only helpers for App Router/RSC - `getPageData`/`getObjectData` (Next `fetch` + `revalidate` for ISR, then `walkTree`), `generateMetadataFromPage` (page.seo → Metadata), `staticParamsForSlugs`/`staticParamsForRecords` (dynamic pages), `whoobeApi(baseUrl)`, re-exports the React adapter. No `next` package dependency (3 tests).
- Guide `docs/guides/headless-sdk.md` extended with React + Next usage (registry overrides, RSC/ISR patterns); plan Resolved + §5 updated. All six SDK packages build via turbo and all tests pass (schema 15, renderer 27, react 3, next 3, vue 4, svelte 3).

---

## [Headless SDK guide] — 2026-08-15 (branch: master)

- New `docs/guides/headless-sdk.md`: architecture and usage of the headless SDK. Covers the four packages (`@whoobe-cms/schema`, `@whoobe-cms/renderer`, `@whoobe-cms/vue`, `@whoobe-cms/svelte`), the layer diagram and `RenderDescriptor`/registry contracts, node-kind mapping table, core `walkTree`/`ApiClient` usage (data bindings, DAM images, dynamic links), per-adapter usage with design-system registry overrides, SSR/hydration patterns for Nuxt and SvelteKit, out-of-the-box features (forms, search, escaping), and verification commands.

---

## [Headless SDK: Svelte & Vue adapters implemented] — 2026-08-15 (branch: master)

- **`@whoobe-cms/vue`** (`packages/sdk/vue`, Vue 3): `WhoobeProvider`/`WhoobeNode`/`WhoobePage`, default primitives, `descriptorToProps`, composables (`useWhoobe`/`usePage`/`useObject`/`useQuery`/`useForm`). Plain `defineComponent`+`h()` so it builds with `tsc`; tested via `@vue/server-renderer` (4 tests).
- **`@whoobe-cms/svelte`** (`packages/sdk/svelte`, Svelte 5, built with `svelte-package`): `WhoobeProvider`/`WhoobeNode`/`WhoobePage`, default primitives, `defaults` registry, stores (`createPageStore`/`createObjectStore`/`createQueryStore`/`createWhoobeApi`), context helpers. Tested via `svelte/server` SSR render (3 tests).
- Shared `Record<NodeKind, Component>` registry contract across React/Svelte/Vue; both adapters reuse `@whoobe-cms/renderer` 100% (escaping, DAM images, per-record links, SSR-descriptor hydration).
- All four SDK packages build via turbo and all tests pass (schema 15, renderer 27, vue 4, svelte 3).

---

## [Headless SDK: Svelte & Vue adapter plan] — 2026-08-15 (branch: master)

- New `docs/plans/cms/headless-sdk-svelte-vue-plan.md`: design for the Svelte (`@whoobe-cms/svelte`, Svelte 5 + SvelteKit) and Vue (`@whoobe-cms/vue`, Vue 3 + Nuxt) adapters of the headless SDK, reusing the `@whoobe-cms/renderer` core 100%. Covers the shared registry contract (`Record<NodeKind, Component>`), `WhoobeProvider`/`WhoobePage`/`WhoobeNode` per framework, default primitives, async-data helpers (Svelte stores / Vue composables), deterministic SSR/hydration, a cross-adapter parity snapshot test, and file-summary/verification sections.

---

## [Headless SDK Phase 2: @whoobe-cms/renderer] — 2026-08-15 (branch: master)

- New workspace package `packages/sdk/renderer` (`@whoobe-cms/renderer`, depends on `@whoobe-cms/schema`) - the pure-TS, framework-agnostic core of the headless SDK (docs/plans/cms/headless-sdk-plan.md §2).
- `kind.ts`: `normalizeKind()` (canonical registry key) + `resolveTag()` (heading levels, semantic containers), mirroring the editor's node→component dispatch.
- `descriptor.ts`: serializable `RenderDescriptor` (id/kind/tag/className/style/attributes/content/image/link/children/configs/options + raw node) - SSR-boundary-safe.
- `walk.ts`: `walkTree()`/`walkNode()` - validates via the schema, resolves field bindings, collection repeaters (query → children per record), config passthrough.
- `resolve.ts`: `resolveDataBinding` (explicit/first/query/parent/currentPage via the public API), `resolveFieldValue`, `formatBoundContent` (shared transform + escaping → safe HTML), `resolveRecordField`.
- `url.ts`: `resolveImageUrl()` (DAM path → proxy URL, http/data passthrough, UUIDs documented unresolvable).
- `path-pattern.ts`: `resolveDynamicLinkPath()` for list-to-detail slugs.
- `api-client.ts`: `ApiClient` (injectable `fetch`, typed getPage/getObject/queryObjects/search/submitForm) + `RenderApi` interface for mocking; fully SSR-safe (no window at module scope).
- 27 vitest tests pass; typecheck + build clean; smoke-tested walking a real `whoobe_pages.content` from the live DB.

---

## [Headless SDK Phase 1: @whoobe-cms/schema] — 2026-08-15 (branch: master)

- New workspace package `packages/sdk/schema` (`@whoobe-cms/schema`, added to `pnpm-workspace.yaml` via `packages/sdk/*`) — the shared, framework-agnostic contract for Whoobe's JSON element trees (docs/plans/cms/headless-sdk-plan.md §1).
- `src/node.ts`: port of the Element-tree data contract (`WhoobeElementNode` + `ElementCss`/`ElementImage`/`ElementDataBinding`/`DynamicLinkBinding`/`ElementFormConfig`/`ElementSearchConfig`/`ElementSlider`, …) as pure interfaces.
- `src/transform.ts`: port of `field-transforms.ts` (`FieldTransform`, `applyTransform`, `escapeHtml`, `TRANSFORMERS`, `transformersForFieldType`) so editor, backend mail renderer, and SDK format values identically.
- `src/validators.ts`: Zod schemas for the tree (recursive lazy node schema, discriminated-union transforms, `formConfig`/`searchConfig`/`slider`), `.passthrough()` so unknown editor fields survive validation, `validatePageContent`/`parsePageContent`.
- 15 vitest tests pass; typecheck + build clean; validated against 4 real trees from the live `whoobe_pages`/`whoobe_one_templates` tables.

---

## [Headless SDK plan] — 2026-08-15 (branch: master)

- New `docs/plans/cms/headless-sdk-plan.md`: design for the official framework-agnostic SDK (React/Next.js first) referenced in `docs/plans/executive-summary.md` §3.3. Covers the shared `@whoobe-cms/schema` contract package (node types + Zod validators + `applyTransform` port), a pure-TS `@whoobe-cms/renderer` (tree-walk → render descriptors, data/image/link resolution via public API, SSR-safe), a `@whoobe-cms/react` adapter (component registry + `<WhoobePage>`/`<WhoobeNode>` + hooks + default components), `@whoobe-cms/next` (RSC/SSR/ISR helpers, metadata, dynamic paths), future adapters, styling/parity notes, a canonical node-kind→component mapping table, and file-summary/verification sections.

---

## [README: feature list updated] — 2026-08-15 (branch: master)

- `README.md` "Main features" rewritten to reflect the currently implemented surface: Data Objects/Classes (incl. Components, WYSIWYG fields, locales, CSV export), DAM (thumbnails, metadata, folder visibility, presigned URLs), headless CMS + visual page builder (SEO/sitemap/search, translations, publish gate, dynamic URL paths), Forms (draft Data Object submissions, honeypot, rate limit, result popup), Email notifications & mail templates (token personalization, dynamic to/bcc, BCC-from-address flag, mail log with preview/resend/search/pagination/delete), workflow engine, auth/2FA, AI agent, site search, websites/URL paths, and the Pimcore migration tool. Placeholder sections (Roles/Users, file migration) explicitly noted as not yet built. Monorepo layout table updated to current app roles (whoobe-one-spike = page + mail-template editor; whoobe-studio = legacy documents pipeline).

---

## [Form submit result: HTML popup (click to close)] — 2026-08-15 (branch: master)

- The success/error message configured in the editor's Form configuration (`FormConfigControl.vue`, `formConfig.successMessage`/`errorMessage`) now displays as a **click-to-close HTML popup** over the page instead of an inline `<p>` under the form (`BlockContainerPreview.vue`): a Teleported `fixed inset-0` overlay renders the message as HTML (`v-html`), and any click (overlay or the box) dismisses it, plus a ✕ button.
- Behavior on submit is unchanged and matches the requirement: on success `form-actions.ts` calls `formEl.reset()` so the form clears; on error the submitted values stay in place. Verified the preview inputs are native/uncontrolled with no `value` defaults, so `reset()` genuinely empties them.

---

## [Mail templates: notify email uses raw submission (fix empty {form.field})] — 2026-08-15 (branch: master)

- Fixed form-notification emails rendering `{form.message}`-style tokens empty for inputs the target Data Class doesn't declare. The notify context was the class-validated `parsed` object, and Zod's `z.object()` strips unknown fields by default - a form with a `message` input against a class lacking that field lost the value before the email rendered. The submit route now passes the **raw submitted attributes** (honeypot-stripped) as the email's `context.form`, so every submitted field is available to the template regardless of the class schema. The renderer still HTML-escapes all bound/token values, so this is safe. The Data Object write continues to use `parsed` (unchanged behavior).
- Verified end to end against the live API with the exact reported payload: subject "Richiesta Contatto", dynamic `to` from `{form.email}`, and body containing firstname/lastname and the full `message` value.

---

## [Mail templates: DAM images in emails] — 2026-08-15 (branch: master)

- Fixed email templates silently dropping images picked from the DAM: the editor stores a *stable reference* (Pimcore-style path like `/uploads/marketing/hero.jpg`, or an asset-record UUID), never a resolved URL, and the mail renderer only emitted `<img>` for full http(s) URLs. New `packages/core/src/mail/mail-image-urls.ts` (`resolveMailImageUrls()` + `looksLikeDamReference()`) walks the Element tree and resolves every DAM reference to a stable public URL via the asset-processor's `/dam-asset/*` proxy (`S3_PUBLIC_BASE_URL` + object key) - which serves objects regardless of visibility and never expires, unlike presigned URLs. `renderTemplateContent()`/`renderMailTemplate()` take an optional `imageUrls` map; `sendMailFromTemplate()` and the legacy `templatePageId` notify path resolve references before rendering. Unresolvable references still omit the `<img>` rather than emit a broken `src`.
- `{form.field}` token substitution in static content already worked (verified end to end); emails with empty context/fields render an empty string, as mail-merge does.

---

## [Mail templates: BCC (CCN) field + "BCC from address" flag] — 2026-08-15 (branch: master)

- `mail_templates` gains a `bcc` column (migration `drizzle/0027_loud_frog_thor.sql`) - an optional blind-copy recipient supporting `{form.field}` tokens like `to`. `sendMailFromTemplate()` resolves it (explicit bcc wins over the template's, CR/LF-stripped), and admin Templates tab exposes a "BCC / CCN" field (form + list column).
- `mail_settings` gains a `bcc_from_address` boolean flag (same migration): when on, every outgoing email is BCC'd to the configured from address (a "keep a copy of everything we send" convenience), combined with any explicit bcc. Exposed in `GET`/`PUT /mail-settings` and as a checkbox in Settings → Mail.
- `sendMail()` now accepts `bcc` and merges the flag's from address into it. Verified end to end via mailhog: envelope delivered to the dynamic `to`, the template bcc, and the from address.

---

## [Mail templates: font family handling in emails] — 2026-08-15 (branch: master)

- Fonts picked in the editor (`node.font`, Google Font family names like `Open+Sans`) now render properly in emails. New `packages/core/src/mail/mail-document.ts`: `fontFamilyStack()` emits a web-safe fallback stack (`"Open Sans", 'Segoe UI', Helvetica, Arial, sans-serif`, serif faces → Georgia), and `buildMailDocument()` wraps the body fragment in a full HTML document whose `<head>` links the Google Fonts CSS for every family the template uses (`collectMailFonts()` walks the Element tree) - so Apple Mail/iOS Mail load the exact face, while Gmail/Outlook (which strip web fonts) degrade to the fallback.
- `sendMailFromTemplate()` and the legacy `templatePageId` notify path now send the wrapped document; the mail log stores it, so the preview modal renders the same document.

---

## [Mail templates: dynamic `to` field] — 2026-08-15 (branch: master)

- `mail_templates` gains a `to` column (migration `drizzle/0026_unusual_bloodstrike.sql`) - an optional default recipient that supports `{form.field}` tokens, so a template can be addressed dynamically (e.g. `{form.email}`).
- `sendMailFromTemplate()` now resolves the recipient itself: an explicit `to` (a Form's `notify.recipientEmail`) wins, otherwise the template's `to` is token-substituted; it throws if nothing resolves to a non-empty address. Subject/to are both CR/LF-stripped via `substituteTokensPlain`.
- `POST`/`PATCH /mail-templates` accept `to`; the form-submit notify path no longer requires `notify.recipientEmail` when the template has a (dynamic) `to`.
- Admin dashboard Templates tab: "To (optional, supports {form.field} tokens)" field in the edit form, `To` column in the list, and `to` in the create/update payloads.

---

## [Mail templates: email-correct HTML (inline styles + rich content)] — 2026-08-15 (branch: master)

- Email bodies rendered from Tailwind-styled templates now carry **inline CSS styles**, not bare `class` attributes - email clients don't load stylesheets, so a body with only `class="p-8 flex flex-col..."` rendered as unstyled text. New `packages/core/src/mail/tailwind-inline.ts` compiles each element's Tailwind utility classes to a `style` attribute at render time via `tw-to-css` (new dependency in `packages/core`), with results cached per class string; interaction variants (hover:/focus:/group-*:) are dropped since a static email has no hover state. Explicit inline `style`/`font` still win over compiled utilities.
- **Static (admin-authored) content now renders as sanitized HTML instead of escaped text**: the editor stores contenteditable innerHTML (real `<b>`/`<a>` markup) into `content`, so escaping it destroyed formatting (`<b>Antonio</b>` shipped as `&lt;b&gt;`). `sanitizeInlineHtml()` keeps a whitelist of safe inline/flow tags, drops all attributes except a safe `href` on links, and escapes everything else (`<script>` etc.). Bound values (public form input) remain fully escaped.
- Text-kind template bodies now substitute tokens **without** HTML-escaping (`substituteTokensPlain`) - they're sent as text/plain, so escaping printed literal `&amp;`/`&lt;`; control characters are still stripped.

---

## [Mail Templates editor fixes] — 2026-08-15 (branch: master)

- Fixed the HTML mail-template editor's save/empty-editor bugs: a brand-new template's `null` content previously left the editor canvas dead (`document = null` - drag-to-add silently no-op'd and Save returned early), and a failed template fetch could silently become a whoobe_pages save. `loadMailTemplate` now seeds an empty document root when content is null; `saveMailTemplate` seeds one defensively too; `Editor.vue` catches load failures and seeds an empty mail-template document keeping `mailTemplateId` set (Save then creates a fresh mail template, never a page). New shared `createEmptyMailTemplateRoot()` in database-actions.ts.
- The admin dashboard now presents the HTML template editor as a **full-page-width editor**: a full-screen overlay (`fixed inset-0`, `MailTemplateEditorEmbed.vue` filling it) opened via an "Open full-screen editor" button in the Templates edit panel, instead of a cramped `h-[480px]` iframe inside the settings card.

---

## [Mail Templates implemented] — 2026-08-15 (branch: master)

- New `mail_templates` table (migration `drizzle/0025_heavy_mephistopheles.sql`): `name`, `kind` (html|text), `description`, `subject` (token-supported), `content` (Element tree jsonb) / `body` (plain text).
- `render-mail-template.ts` generalized to context-aware rendering: `renderTemplateContent(content, context)` with a final `{namespace.field}` token pass; `dataBinding` fields resolve against `context.form` (legacy `renderMailTemplate(pageContent, submission)` preserved). New `mail/token-substitution.ts` (`substituteTokens` HTML-escapes, `substituteTokensPlain` strips CR/LF for headers).
- `mailer.ts`: new `sendMailFromTemplate({ template, context, to, cc?, subject? })` renders by kind, token-substitutes the subject, sends, and records to `mail_log` automatically.
- core-api: `GET/POST /mail-templates` + `GET/PATCH/DELETE /mail-templates/:id` (SETTINGS_MANAGE, list returns metadata only); form notify prefers `notify.mailTemplateId` with legacy `notify.templatePageId` fallback.
- whoobe-one-spike: `formConfig.notify.mailTemplateId`, `FormConfigControl.vue` mail-template select, `mail-templates-api.ts`, `loadMailTemplate`/`saveMailTemplate`, editor-store `mailTemplateId` flag, `/editor?mailTemplateId=` route param, `BlockEditor.vue` Save branching (no path prompt in mail mode).
- admin-dashboard: `utils/mail-templates-api.ts`, **Templates** tab in `MailSettingsCard.vue` (list, text-template editor, `MailTemplateEditorEmbed.vue` iframe for HTML).
- `docs/plans/forms/mail-templates.md` "Resolved" section written up.

---

## [Mail Templates plan] — 2026-08-15 (branch: master)

- `docs/plans/forms/mail-templates.md` rewritten from a sketch into a full plan: a dedicated `mail_templates` table (`kind` html|text, default subject, content/body) replacing the current "a whoobe_pages row as template" approach, a shared `{namespace.field}` token-substitution engine working across text templates, HTML templates, and subject lines, context-aware rendering (`{ form, site?, user?, object? }` with `form.*` today), `sendMailFromTemplate()` as the single path for all app emails (mail log records automatically), `/mail-templates` CRUD API (SETTINGS_MANAGE), `formConfig.notify.mailTemplateId` with a legacy `templatePageId` fallback, embedded whoobe-one-spike editing via `/editor?mailTemplateId=`, and a Settings → Mail "Templates" tab. Includes security considerations (HTML-escaping of public input, CR/LF-strip in subjects) and a verification section.

---

## [Email log: search, pagination, select, order, delete] — 2026-08-15 (branch: master)

- `listMailLog()` (packages/core/src/db/mail-log-records.ts) now supports `search` (case-insensitive match on `to`, `subject`, `status`), `order` (`newest`/`oldest`), and returns `{ records, total }` (matching count) so the UI can paginate. New `deleteMailLogEntries(ids)` bulk delete.
- API: `GET /mail-log` accepts `search` and `order` and returns `total` alongside the stripped records; new `POST /mail-log/delete` (`{ ids: string[] }`, SETTINGS_MANAGE) deletes selected entries.
- Admin dashboard Mail Log tab (MailSettingsCard.vue): search box (debounced server-side), status filter, **Newest/Oldest** order select, page-size select (10/25/50/100), pagination footer with prev/next and "X–Y of Z", row checkboxes with select-all (including indeterminate state), and a **Delete (n)** action with confirmation that prunes the selection and steps back a page if the last one empties. `fetchMailLog()` util returns `{ records, total }`; new `deleteMailLogEntries()` util.

---

## [Email log: body storage, preview modal, resend] — 2026-08-15 (branch: master)

- `mail_log` gains `html` and `text` columns (packages/core/src/db/mail-log-schema.ts) so the sent body is stored with each entry; migration `drizzle/0024_careless_morgan_stark.sql` applied.
- `logMailDelivery()` now stores the body; `sendMail()` (packages/core/src/mail/mailer.ts) passes `html`/`text` through. New `getMailLogEntry(id)` returns the full entry.
- API: `GET /mail-log` list now strips the body (metadata only); new `GET /mail-log/:id` returns the full entry for preview; new `POST /mail-log/:id/resend` resends the stored email verbatim (the resend is itself logged as a fresh entry). All gated on SETTINGS_MANAGE.
- Admin dashboard: `fetchMailLogEntry()`/`resendMail()` utils (mail-settings-api.ts); the Mail Log tab gains an **Actions → Preview** button opening a modal showing metadata plus the rendered body (HTML via sandboxed iframe, else plain text) with a **Resend** button.

---

## [Email delivery log] — 2026-08-15 (branch: master)

- New `mail_log` table (packages/core/src/db/mail-log-schema.ts): durable audit trail of every outgoing email — `to`, `from`, `cc`, `subject`, `status` (`sent`/`failed`), `error`, `sent_at`. Not a typed enum so new states need no migration.
- New `logMailDelivery()` / `listMailLog()` records (packages/core/src/db/mail-log-records.ts) - newest-first list with optional `status` filter and `limit` (cap 500)/`offset` paging.
- `sendMail()` (packages/core/src/mail/mailer.ts) now records every send attempt - success and failure alike. The send and the log write are decoupled so a failing log write never changes the send result, and a failed send is recorded before the error is rethrown. Covers both callers (form notifications and the mail-settings "Email Test" flow).
- New read-only `GET /mail-log` endpoint (apps/core-api/src/server.ts, gated on SETTINGS_MANAGE) with `?status=`, `?limit=`, `?offset=` query params.
- Admin dashboard: `fetchMailLog()` util (mail-settings-api.ts) and a new **Mail Log** tab in Settings → Mail (MailSettingsCard.vue) - table of sent/failed emails with status filter, refresh, and auto-reload after a test send.
- Migration `drizzle/0023_same_korvac.sql` generated and applied to `whoobe_db`.

---

## [Documents Migration plan: Pimcore Documents → Pages] — 2026-08-14 (branch: dev/08-14-documents/documents-migration)

- `docs/plans/cms/documents-migration.md` expanded from a 4-line stub into the full PIMCORE MIGRATION plan: terminology (Documents = Pimcore Documents/brick-built pages vs. Pages = `whoobe_pages`), verified current state (pipeline built and piloted against the 117-document live site), scope & non-goals, and six phases — asset migration (`migrate-assets`), brick mappings for the remaining 41 types, document metadata (title/locale/SEO), full-site run, validation, and retiring the legacy `cms_documents`/`whoobe-studio` path.

---

## [Search element: no baked-in w-full on the container] — 2026-08-14 (branch: feat/08-14/search-engine)

- `ElementsClass.js` `Search()` no longer defaults `css.container` to `w-full` - the container `<div>` is a plain block (fills its parent by default) and the inner `<form>` is already `w-full`, so the redundant class only fought a custom container width in the render (preview/editor) cascade.

---

## [Search element: container div + button icon] — 2026-08-14 (branch: feat/08-14/search-engine)

- `SearchElement.vue` renders as **container `<div>` → `<form class="w-full">`**: the element's own custom classes now land on the container div (a plain block, no baked-in width), so styling the form container (width/bg/padding/border/centering) works without fighting the form's `w-full`.
- `searchConfig` gains `buttonLabel` (default "Search") and `buttonIcon` (default false): when `buttonIcon` is on, the submit button shows the search icon instead of the label text (with `aria-label` for accessibility). Editable in SearchConfigControl (button label + "Icon instead of text" toggle).
- Docs: search-element-plan.md updated.

---

## [Search element: custom classes for input and button] — 2026-08-14 (branch: feat/08-14/search-engine)

- `searchConfig` gains `inputClass` and `buttonClass` (ElementsClass.js + d.ts) - extra Tailwind utilities appended to the search input and submit button on top of their built-in defaults (blank = default).
- `SearchElement.vue` applies them via `:class` on the input/button.
- `SearchConfigControl.vue` (Advanced tab) gains "Input classes" and "Button classes" fields alongside the existing dropdown/placeholder config.
- Docs: search-element-plan.md updated (cascade caveat: use `max-w-*` to size the input rather than fighting the built-in `w-full`).

---

## [Search element: custom CSS fix (element + dropdown visible while editing)] — 2026-08-14 (branch: feat/08-14/search-engine)

- `SearchElement.vue`: the root `<form>` no longer hardcodes conflicting layout utilities (`flex w-full`) - they moved to an inner wrapper, so the element's own custom classes (bg/max-w/w-*/etc., merged from the parent `:class`) apply without being overridden by the Tailwind cascade; a plain block `<form>` still fills its parent width by default.
- The editor canvas now uses a select-only click on the search element (no `preventDefault`, unlike other elements), so the input stays focusable - and the live results dropdown now **fetches and shows while `:editing`** (submit + result clicks stay gated), letting the admin see and tune `dropdownClass` and the element's custom classes in place.
- Docs: search-element-plan.md updated.

---

## [Search element: live results dropdown + custom dropdown class] — 2026-08-14 (branch: feat/08-14/search-engine)

- `SearchElement.vue` now shows a **live results dropdown** under the box while typing (debounced 300ms, min 2 chars, scoped by the same `searchConfig` types/classes, pageSize 8) on top of the existing `/search` navigation on submit. Loading/error/no-results states, type badges, ts_headline highlight; Escape/outside-blur closes it. `:editing` still disables fetch/navigation on the canvas.
- `searchConfig.dropdownClass` (default `''` = built-in `bg-white border-gray-200 rounded-lg shadow-lg`) styles the dropdown; editable via SearchConfigControl's new "Dropdown classes" field. How admins manage that class per-site is a documented follow-up.
- Docs: search-element-plan.md dropdown section + open-question note.

---

## [whoobe-one-spike: Search element on the canvas] — 2026-08-14 (branch: feat/08-14/search-engine)

- `ElementsClass.js`: new `search` palette group with a `Search` element (`Search()` builder - `tag/element 'search'`, `searchConfig` = `types {page,object,asset}` + `classIds`, `placeholder`); registered in `createElement`.
- `SearchElement.vue` (globally registered in `main.ts`): the live search box, rendered on the canvas (editing guard - select-only, never submits), the preview tree and the public page. `BlockElement.vue`/`BlockElementPreview.vue` special-case `tag === 'search'` so the generic `v-html`/contenteditable branch never touches the interactive component; `ElementSearchConfig` type added to `ElementsClass.d.ts`.
- **Advanced tab**: `SearchConfigControl.vue` (modal, mirrors FormConfigControl) - toggles for Pages / Assets / Objects, a class multi-select when Objects is on (empty = all classes), and the placeholder; scope summary label.
- Submits to the spike's `/search` route with `type` (comma-separated / single) + `classId` query params; `search-api.ts` supports `type` arrays and `SearchResultsView.vue` reads/round-trips those params through pagination.
- Verified against the public `/public/search` endpoint (`type=object,asset` and `type=object&classId=...` both accepted).

---

## [Mail settings: Email Test tab] — 2026-08-14 (branch: feat/08-14/search-engine)

- `MailSettingsCard.vue` gains an "Email Test" tab beside Settings: a card with From (defaults to the configured from address), To, CC, Subject and a Body textarea (text or HTML - HTML-looking content is sent as html, otherwise plain text).
- `packages/core/src/mail/mailer.ts`: `sendMail` now accepts optional `from` (overrides the configured sender), `cc` and `text`.
- `apps/core-api`: new `POST /mail-settings/test` (SETTINGS_MANAGE) sends a test email through the configured SMTP and returns `{ ok: true }` or the transport error.
- `utils/mail-settings-api.ts`: `sendTestMail()` client. Verified live against the dev SMTP config.

---

## [Pages settings: locale selection, SEO title fallback, linked-page info] — 2026-08-14 (branch: feat/08-14/search-engine)

- `PageSettingsTab.vue` General: the page's Locale is now a `<select>` of the selected website's `supportedLocales` (free-text input only in single-site mode / when the website has no languages). Switching websites adopts the new site's default locale; a legacy page whose locale isn't in the list keeps its real value (kept selectable + amber warning). Only user-initiated website switches reset the locale - never the initial form load.
- `PageSettingsTab.vue` SEO: when Meta Title is empty it now falls back to the page title - the input shows the page title as placeholder plus an "Empty - will use the page title: …" hint, and save persists `metaTitle: seo.metaTitle || form.title`.
- `MenuItemRow.vue` (Website Paths): a path linked to a page now shows the page's title + locale + last-modified date (e.g. `About Us · en · 8/14/2026`), not just the title.

---

## [Fix: object-list asset previews missing on first render] — 2026-08-14 (branch: feat/08-14/search-engine)

ObjectsView's thumbnail `<img>` rendered with `:src="recordAssetUrl(...) || ''"` - on the first render the asset URL isn't resolved yet (async DAM lookup), so the empty `src` fired a browser `error` event and the `@error` handler permanently set `style.display='none'` on that element. When the URL later arrived, Vue updated `src` but the inline style persisted, so the preview stayed hidden until page navigation recreated the rows.

Fix: the `<img>` is now `v-if`-gated on a non-empty resolved URL (only mounts once the URL actually exists), so no spurious error is ever fired; the cell shows the raw value meanwhile and swaps to the thumbnail the moment the reactive `_assetUrlCache` re-renders. Verified against the Content class (header field stores asset UUIDs).

---

## [Pimcore system audit fields always imported] — 2026-08-14 (branch: feat/08-14/search-engine)

Every Pimcore class's query table (`object_<classId>`) always has `o_creationDate`/`o_modificationDate` (Unix seconds) - they must survive migration as real fields with real values, even though the source class definition never lists them.

- `pimcore-object-converter.ts`: exported `PIMCORE_SYSTEM_DATE_FIELDS` + `appendPimcoreSystemFields()` (DB-free, deduped by name) - `o_creationDate`/`o_modificationDate` as `date` fields. 2 new tests (49 total pass).
- `cli.ts` `runClassMigration`: appends the system fields to every migrated class definition. `runObjectMigration`: appends them to the conversion field list too, so re-imports of an already-migrated class get the values even without re-running migrate-classes.
- Applied to the 14 existing classes via a targeted jsonb `fields` append (NOT a migrate-classes re-run, which would have clobbered the user's dashboard edits like Product's category/brand relation changes - `upsertDataClassByPimcoreId` wholesale-replaces fields). All 14 classes now define the two fields; re-imported Product rows (55 × 2 locales) carry both values as ISO dates (e.g. `2022-02-16T16:50:40.000Z`). Search reindexed.

---

## [Fix: Pimcore relations not imported for relation fields + search enrichment] — 2026-08-14 (branch: feat/08-14/search-engine)

Real finding from the Product class: raw Pimcore stores `category`/`brand` as plain varchar columns holding the target's raw object id (object-provider selects) with **no `object_relations_*` edge at all** - so a `manyToOneRelation` field authored in the new editor imported as null.

- `pimcore-object-converter.ts` (migration-tool): `manyToOneRelation` now falls back to the raw column id string when no relation edge exists (same resolution path as `select`-with-`relationTarget`); the multi-relation family (`manyToManyRelation`/`manyToManyObjectRelation`/`advancedManyToManyRelation`) likewise falls back to a delimited id string when there are no edges (Product's real `tags` shape). Asset-type/no-relationTarget fields stay null. 3 new tests (47 total pass).
- Re-ran Product import (`clear: true`) via the migration-sources route: all 55 products × 2 locales now carry real `category`/`brand` `{ id }` references (was null).
- Search index relation enrichment (the plan's documented "reindex-time enrichment" follow-up): `indexer.ts` resolves each relation's `relationDisplayField` label from the related object and appends it to the indexed body (`extractObjectText` gained an `extraText` param, still DB-free). A product is now findable by its Category's name, e.g. "mineral waters". Full reindex done: 6 pages, 3368 objects, 14 classes, 1135 assets.
- Dashboard search dropdown now sends `includeUnpublished: true` - drafts (e.g. freshly migrated objects) are findable in the admin surface before publish.
- Asset previews not resolving is a dev-environment gap (assets not uploaded to the new bucket yet) - no code change.

---

## [Relations: choose which related-class field to display] — 2026-08-14 (branch: feat/08-14/search-engine)

- `ClassFieldDefinition` (packages/core/src/schema/dynamic.ts) gains `relationDisplayField?: string` - the name of a field on the relation target class whose value is shown for the relation wherever a label is needed; absent = fall back to the related object's `key`.
- `MasterClassTab.vue`: relation-flavored fields (any field with `relationTarget`) get a "Show: …" picker of the related class's fields in both the View Layout tree rows (sections + Ungrouped) and the List Layout column rows. Writes `relationDisplayField` on the field definition itself (one source of truth, like `relationTarget`); "Key (default)" clears it.
- `ObjectsView.vue`: relation columns now resolve each related object (via the shared `useRelationOptions` cache, new `getRelationOptions` peek helper) and render `relationDisplayField`'s value, joining multi-relations, falling back to the object's key.
- `DataObjectFieldControl.vue`: the relation `<select>`s (relation select, manyToOneRelation, multi-relation family) label their options with `relationDisplayField`'s value via `relationOptionLabel()`.
- Docs: editing-object-class.md addendum.

---

## [Class editor: new "List Layout" tab - default listing columns] — 2026-08-14 (branch: feat/08-14/search-engine)

- `ClassViewConfig` (packages/core/src/schema/dynamic.ts) gains `listColumns?: { name: string; title?: string }[]` - the class's default object-listing columns (name = class field or system column, title = optional header override).
- `MasterClassTab.vue` gets a third subtab "List Layout": ordered, reorderable (↑/↓), removable (✕) column rows with an optional custom-header input, an add-picker grouped into System (Key/Path, Locales, Class, Status, Modification Date) and Fields, Clear all, and empty states. Save merges it into `viewConfig` alongside `detailSections` (still drops authored-but-empty config back to null).
- New shared `utils/list-columns.ts` - single source of truth for `SYSTEM_LIST_COLUMNS`, the per-field-type lucide icon map (`fieldTypeIcon`, now also imported by FieldListEditor.vue), and system-column icons (`listColumnIcon`).
- `ObjectsView.vue`: on class selection the listing falls back to the class's List Layout when no user-side default preset exists (preset > class default > all columns); View ▾ menu gains "Use class default listing" to re-apply it anytime. Stale column names (renamed/deleted fields) are filtered out against the current column options.
- Docs: editing-object-class.md updated with the new tab + precedence rules.

---

## [UI: per-field-type lucide icons in the fields editor] — 2026-08-14 (branch: feat/08-14/search-engine)

`FieldListEditor.vue` now shows a type-specific lucide icon on every field-list row (Text → cursor/type, Textarea → align-justify, Rich text → file-text, Number → hash, Checkbox → square-check, Date → calendar, Email → mail, Country → globe, Select → square-chevron-down, Multi-select → list-checks, Relations → link/network, Link → link, Asset → folder-open, Image/Video, Components → component, fallback file) and in the right-pane header above the selected field's settings. All icon names verified against the installed `@lucide/vue` exports; builds green.

---

## [UI: Fields editor becomes a master-detail 2-column layout] — 2026-08-14 (branch: feat/08-14/search-engine)

`FieldListEditor.vue` (shared by the class Fields tab in `MasterClassTab.vue` and by `ComponentSettingsCard.vue`) switches from stacked per-field cards to a master-detail layout: left column lists the fields (click to select, hover ↑/↓/✕ for reorder/remove), right column holds every setting of the selected field (name/title/type, required/localized, select options, relation target, asset filter, allowed components, control classes, move/remove). Selection follows add/remove/move; empty states for "no fields yet" and "select a field". Same v-model contract as before (edits mutate field objects in place; add/remove/move re-emit the array), so both consumers keep working unchanged.

---

## [Fix: Office viewer login redirect in dev - only use MS viewer for internet-reachable URLs] — 2026-08-14 (branch: feat/08-14/search-engine)

The Microsoft Office viewer embed showed a sign-in page instead of the document: `view.officeapps.live.com` fetches the file from Microsoft's servers, and the dev asset URL (`develop.local` - a LAN hostname) is unreachable from the internet, so the viewer fell back to a login/error screen (unrelated to the user's Microsoft account/license). `officeViewerUrl` now runs the URL through an `isInternetPublicUrl()` check (localhost, `*.local`/`*.lan`/`*.internal`/`*.home`, private/loopback IPs rejected); non-public-reachable office assets get the icon + "Open in New Tab" fallback instead of a broken embed. In production, with a real public CDN URL configured, the viewer works as intended.

---

## [Feature: DAM previews for PDF, Office and JSON assets] — 2026-08-14 (branch: feat/08-14/search-engine)

`DamAssetPreviewPanel.vue` now renders inline previews beyond images/MP4, using the asset-processor proxy (`/dam-asset/<s3Key>`, CORS-enabled) so content never needs S3's own CORS or presigned-URL freshness:

- **PDF** → streamed through the proxy, re-typed to `application/pdf` as a blob URL and rendered in an `<iframe>` (works even though the stored S3 objects are `application/octet-stream`, which would otherwise force a download).
- **Word / Excel / PowerPoint** (DOC/DOCX/XLS/XLSX/PPT/PPTX) → embedded Microsoft Office viewer iframe for **public** assets (the file is fetched by Microsoft's servers — acceptable for CDN-public files; private files deliberately fall back to the icon + "Open in New Tab" panel, since presigned URLs expire and sending private files to Microsoft would leak them).
- **JSON** → fetched via the proxy and pretty-printed in a scrollable `<pre>` (raw text fallback if unparseable).
- Busy spinner while streaming; error state with "Open in New Tab"; blob URL revoked on unmount/asset switch; preview reloads when a new version bump changes `updatedAt`.
- Verified: proxy serves the test PDF with `200` and a real `%PDF-1.6` payload (content-type octet-stream — handled by the blob re-typing); admin-dashboard builds green.

---

## [Feature: multi-type filters in admin global search] — 2026-08-14 (branch: dev/08-14/various-features)

The dashboard search dropdown now has a row of toggle badges (Objects / Assets / Pages / Classes), all on by default; clicking one excludes that type from the query, dropping the last active one resets to all. Backend support: `type` on both search routes now accepts several values (comma-separated `?type=object,asset` or repeated params), ORed via `inArray` in `searchContent` — validated against `SEARCH_TYPES` (400 on unknown). Also: reindex toast now includes the asset count. Verified: `type=asset` → 16 pinocchio assets only, `type=object,asset` → 20 mixed, invalid type → 400.

---

## [Fix: admin search dropdown capped at 8 results hid matching assets] — 2026-08-14 (branch: dev/08-14/various-features)

Dashboard global search fetched `pageSize: 8`, so a query like `pinocchio` (4 content objects + 16 filename-matching assets) showed only the 4 objects + 4 assets — the rest were ranked off the visible list even though the footer count said 20. Raised the dropdown fetch to `pageSize: 20` (matching the API default; the dropdown scrolls, and the "N results" footer still reflects the true total).

---

## [Feature: DAM assets join the search index (v1.1)] — 2026-08-14 (branch: dev/08-14/various-features)

Extends the Postgres-native search engine to DAM assets - filename, folder, mime/file type and EXIF metadata are now searchable alongside pages/objects/classes.

- `packages/core/drizzle/0022_search_documents_asset.sql` + journal entry: widens the `search_documents` document_type CHECK to `'asset'` (the 0021 table/columns/indexes are reused as-is; asset extraction flattens the jsonb metadata into the text columns).
- `packages/core/src/search/extract.ts`: `extractAssetDoc()` - title = filename, body = folder/pimcore path + mime/file type + technical (dimensions/format/colorSpace), camera (make/model/lens/ISO/f-number/exposure/flash), GPS, rights (artist/copyright/software) and every string value in the raw EXIF blob; keywords promote filename base, extension, mime type and raw values.
- `packages/core/src/search/indexer.ts`: `indexAsset()` - published mirrors the asset's own `isPublic` flag (private assets stay admin-only), document id = asset id, locale 'en'; `reindexAll()` now reports and rebuilds `assets`.
- `packages/core/src/db/asset-records.ts` hooks: `upsertAssetRecord` → `indexAsset`, `updateAssetMetadata` (e.g. re-extracted EXIF) → reindex, `deleteAssetRecord` → `deleteIndexedByDocument('asset', id)`.
- `apps/core-api/src/server.ts`: `SEARCH_TYPES` now accepts `type=asset` on both search routes.
- UI type unions + badges: `apps/admin-dashboard/src/utils/search-api.ts` + `apps/whoobe-one-spike/src/search-api.ts` (SearchDocumentType + 'asset'), dashboard dropdown gets an amber asset badge and opens the DAM preview tab (`tabsStore.openAsset`), spike results get an asset badge class.
- Verified: all four packages typecheck/build green; migration applied to develop.local and localhost container; reindex = 6 pages / 3368 objects / 14 classes / **1134 assets**; live HTTP - `q=pinocchio` surfaces the asset `pinocchio20202.jpg` alongside content objects, `type=asset` filter works, dimension metadata search (`q=2560&type=asset` → exactly the two 2560px-wide jpgs) works through the technical-metadata path. Note: the current asset DB only carries `technical` metadata (no camera/GPS/rights), so those extractor paths are covered by code but not by live data.

---

## [Feature: Postgres-native search engine implemented (plan phases 1-6)] — 2026-08-14 (branch: dev/08-14/various-features)

Full implementation of `docs/plans/search-engine/search-engine-plan.md` - Postgres tsvector + pg_trgm search over pages, class instances and class definitions, no new infrastructure.

- `packages/core/drizzle/0021_search_documents.sql` + journal entry: `pg_trgm` extension, `search_documents` table with generated `document_tsvector` column (weights A=title / B=category+keywords+excerpt / C=body, `simple` config) via IMMUTABLE wrapper functions `immutable_tsvector()` / `immutable_array_to_string()` (raw `to_tsvector`/`array_to_string` are STABLE, which Postgres rejects in generated columns), GIN tsvector index + trgm GIN indexes, `search_documents_unique` constraint.
- `packages/core/src/db/search-documents-schema.ts`: drizzle table + `uniqueDoc` unique index (name matches the SQL constraint).
- `packages/core/src/search/extract.ts`: `extractPageText()` (Element tree walk, SEO/section/category, page-localized), `extractObjectText()` (localized + non-localized attributes, asset/relation envelopes skipped), `extractClassDoc()` (definition fields + per-field labels/descriptions). `MAX_BODY_CHARS` 20k truncation.
- `packages/core/src/search/indexer.ts`: `upsertSearchDocument()` (ON CONFLICT on (type, id, locale)), `indexPage()` (published = page.published && `search.indexable !== false`; payload slug+websiteId), `indexObject()` / `indexClass()`, `deleteIndexedByDocument()`, `deleteIndexedByClass()` (via `payload->>'classId'`), `reindexAll()` (dynamic imports avoid records↔indexer cycle), `safeIndex()` best-effort wrapper so indexing failures never break publish flows.
- `packages/core/src/search/query.ts`: `buildTsQuery()` (prefix `:*` on last lexeme, single-quote escaping), `searchContent()` - locale/published/websiteId/type/classId filters, `ts_rank_cd(...,32)` + tsvector GIN scan, pg_trgm similarity fallback (>0.3) for fuzzy matches, `ts_headline` `<em>` excerpts, relevance/date sort, pagination (max pageSize 50).
- Records-layer hooks (single-writer pattern): `whoobe-pages-records.ts`, `data-objects-records.ts` (incl. pimcore upsert + `deleteDataObjectsByClassId`), `data-classes-records.ts` - every create/update/delete keeps the index in sync.
- `apps/core-api/src/server.ts`: `GET /public/search` (headless, no auth, published-only, min 2 chars, `PUBLIC_SITE_URL`-based page URLs), `GET /whoobe-one/search` (OBJECTS_READ, `includeUnpublished` for drafts + indexable=false pages), `POST /whoobe-one/search/reindex` (OBJECTS_WRITE). New `search` barrel exports in `packages/core/src/server.ts`.
- `apps/whoobe-one-spike`: `src/search-api.ts` client, `SearchBox.vue` header component, `SearchResultsView.vue` (`/search` route with highlighting + pagination), SearchBox added to `Main.vue`.
- `apps/admin-dashboard`: `src/utils/search-api.ts`, global search input in `DashboardLayout.vue` - debounced dropdown results (page/object/class badges, highlighted excerpts, Enter-to-open-first, click opens the matching tab via `tabsStore.openPage/openObject/openClass`) + one-click "Rebuild index".
- Verified: all four packages typecheck/build green; migration applied to develop.local; reindex = 6 pages / 3368 objects / 14 classes; live HTTP checks - tsvector hit (`energ` → 8), prefix, trgm fallback, 2-char minimum, locale filter, page paths (single-slash `slug` fallback fix), unpublished hidden from public but visible to admin, indexer upsert→search→delete round-trip with a transient doc. Known cosmetic note: `q=ab` style 2-char queries match broadly via trgm (accepted; 3+ chars are the useful range).

---

## [Docs: Postgres-native search engine plan] — 2026-08-14 (branch: dev/08-14/various-features)

- New `docs/plans/search-engine/search-engine-plan.md`: full design for a Postgres-native search engine (tsvector + pg_trgm, no new infra) over pages (`whoobe_pages` Element trees) and classes (`data_objects` attributes + `data_classes` definitions). Covers the `search_documents` table + GIN indexes, extraction/indexing pipeline with records-layer hooks, query building & ranking (ts_rank_cd, trgm similarity, ts_headline), headless API (`GET /public/search`, admin `GET /whoobe-one/search`, `POST /whoobe-one/search/reindex`), website integration (SearchBox + SearchResultsView in whoobe-one-spike), admin dashboard wiring, security/edge cases (locale, multi-site, dynamic slugs, indexable flag), implementation phases and risks. Out of scope for v1: legacy `cms_documents` (different tree shape). Follow-up addendum: V2 hybrid semantic search via pgvector (embedding column + HNSW, `/embeddings` capability in the AI provider layer, RRF fusion) as a documented evolution, not part of the v1 lexical engine.

---

## [Fix: AI-generated pages invisible on the canvas - normalize type/element + corrected prompt contract] — 2026-08-14 (branch: dev/08-14/various-features)

Root cause of "the AI page has a payload but nothing shows on the canvas": generated trees came back with `type` = builder names ("Flexbox", "Heading", ...) and no `element` field at all, but the editor's render dispatch is strict - `BlockContainer.vue` recurses only on `type === 'container'` and `BlockElement.vue` renders `:is="el.element"` (undefined = Vue renders nothing). Every generated node rendered as an invisible leaf, so both the fresh "AI Page" flow and the AI history re-import silently produced an empty-looking canvas.

- `apps/whoobe-one-spike/src/helpers.ts`: new `normalizeGeneratedTree()` - derives `element` from `tag` (tag→HTML-tag map) and coerces `type` to `'container'`/`'element'` from children presence, recursively. Applied at both insertion points, so old stored payloads and any model that ignores the contract still render.
- `apps/whoobe-one-spike/src/scripts/editor-actions.ts` (`insertGeneratedSnippet()`) and `src/components/BlockEditor.vue` (`onAiPageGenerated()`): both normalize after `cloneWithFreshIds()`.
- `packages/core/src/ai/prompts.ts`: `ELEMENT_CONTRACT` corrected - `type` is now documented as `"container"`/`"element"` (builder names explicitly banned), `element` (concrete HTML tag) is required on every node, and the page root is `type: "container", element: "div"`. New generations come out renderable without normalization.
- Verified: core + spike typechecks and spike build green; the stored 41-node payload (laguna-s-2.1-free page) normalizes to 13 containers / 28 leaves with no missing `element` and no invalid `type`.

## [Fix: AI-generated images were broken - models invent non-existent Unsplash photo URLs] — 2026-08-14 (branch: dev/08-14/various-features)

The prompt asked the model for "a plausible placeholder image URL from images.unsplash.com" - models hallucinate photo IDs that don't exist, so generated `<img>` nodes pointed at 404s.

- `packages/core/src/ai/prompts.ts`: `ELEMENT_CONTRACT` now mandates the `https://picsum.photos/seed/<node-id>/1200/800` pattern (picsum always serves a real photo, deterministic per seed) and explicitly bans invented Unsplash/real photo URLs. New `sanitizeGeneratedImages()` walks the tree and swaps every image URL for the seeded placeholder - belt and braces, applied regardless of what the model outputs.
- `apps/core-api/src/server.ts`: `/ai/generate` calls `sanitizeGeneratedImages()` after `validateElementTree()` and before persisting, so stored payloads never contain broken image URLs.
- `apps/whoobe-one-spike/src/helpers.ts`: `normalizeGeneratedTree()` applies the same URL swap, so already-stored records (and any payload a model gets wrong) render with valid images on import.
- Verified: core + core-api + spike typechecks and spike build green; `sanitizeGeneratedImages()` round-trip tested against a synthetic tree with nested img nodes. Note: the currently stored success record (laguna-s-2.1-free) contains no img nodes - the user's broken-image generation was never persisted (its record likely failed validation or was discarded); regeneration with the updated contract will produce valid seeded URLs.

## [Fix: transient 503 gateway errors from Zen free models now retry] — 2026-08-14 (branch: dev/08-14/various-features)

Zen's free-model gateway intermittently returns 503 "Upstream request failed: Endpoint is unavailable" (observed: successes at 09:15/09:19 UTC, 503s at 09:21/09:22 with laguna-s-2.1-free). Previously only 429s were retried, so these transient flaps failed immediately.

- `packages/core/src/ai/providers.ts`: the retry loop in `generateAiJson()` now treats any 502/503/504 as transient and retries (up to 3 attempts total, `Retry-After`-aware backoff), alongside 429s. If the 5xx persists after all attempts, `mapProviderError()` returns a clear message ("AI provider endpoint is temporarily unavailable (gateway error). Try again in a moment, or switch provider/model in Settings → AI.") instead of the raw upstream text.
- Verified: core typecheck/build green; mock-server test - two 503s with `Retry-After: 1` then success → exactly 3 calls, ~2s elapsed, parsed result returned.

## [Fix: invalid nested <button> in DataObjectPicker.vue] — 2026-08-14 (branch: dev/08-14/various-features)

Vite warning: `<button>` cannot be child of `<button>` - the per-class card in the data-object picker was a `<button>` wrapping the inner "Generate template" `<button>`.

- `apps/whoobe-one-spike/src/components/DataObjectPicker.vue`: inner action changed from `<button>` to a `<span role="button">` with `tabindex="0"`, `@keydown.enter` handler and click-stop, keeping the same visual/behaviour while producing valid HTML.
- Verified: spike typecheck + build green.

## [AI history panel: preview modal + "import into current element" buttons] — 2026-08-14 (branch: dev/08-14/various-features)

- `apps/whoobe-one-spike/src/components/AiGeneratedPanel.vue`: each record row now has Preview (Eye) and Import (Download) buttons (click-stop so the row's own import still fires only on the row). Emits `preview` in addition to `import`.
- New `apps/whoobe-one-spike/src/components/AiGeneratedPreviewModal.vue`: read-only preview of a stored payload rendered through the same `BlockContainerPreview` renderer DocumentPreview uses, with a normalized deep clone (legacy payloads with builder-name types/missing element/invented image URLs preview correctly); footer has an "Import into current element" button.
- `apps/whoobe-one-spike/src/components/BlockEditor.vue`: `onAiGeneratedPreview()` opens the modal; `onAiGeneratedImportIntoCurrent()` always inserts the tree into the current selection (into it if a real container, after it otherwise, page-root fallback) regardless of stored kind - unlike the row click, which keeps the kind-aware page→replace-document behavior.
- `apps/whoobe-one-spike/src/scripts/editor-actions.ts`: `insertGeneratedSnippet()` now actually falls back to appending at the document root when nothing is selected (the doc comment already promised it; the code bailed early) - needed by the new import-into-current flow.
- Verified: spike typecheck + build green.

## [Document tree fixes: naming, current-element root, semantic chips, stable drag & drop] — 2026-08-14 (branch: dev/08-14/various-features)

- `apps/whoobe-one-spike/src/helpers.ts` `friendlyElementName()`: every node with `element === 'div'` (all containers, the document root, plain div wrappers) was named "Inline Text" - that label is now reserved for the InlineText builder leaf (`type === 'element'` + `editable`), while containers get "Container" (tag-based names still win: Document/Grid/Flexbox/Slider...) and non-editable div leaves get "Div". Fixes the tree AND the floating toolbar, which share this helper.
- `apps/whoobe-one-spike/src/components/DocumentTree.vue`: shows the **current element's children tree** - container selection roots the tree at it, leaf selection shows a hint and falls back to the document, nothing selected shows the whole page; header states the root ("Tree of: Page/Flexbox/...") plus its semantic tag.
- `apps/whoobe-one-spike/src/components/DocumentTreeNode.vue`: rows with a `semantic` tag (setSemantic, e.g. <section>/<nav>/<form>) render an amber `<tag>` chip.
- `apps/whoobe-one-spike/src/components/BlockEditor.vue` drag & drop rework - three real bugs:
  1. `accepts` rejected `target === source`, so same-parent drops never fired → sibling reordering was impossible everywhere.
  2. Drops always appended; the handler now computes the exact DOM drop index (filtering out BlockContainer's absolute tag badges) and splices at it → precise-position drops on canvas and in the tree, including in-place reorder.
  3. Dropping a container into itself or a descendant detached that whole subtree from the document (the "element vanished after a drag" bug, easy to hit in the tree) → now guarded with a "Cannot drop an element into itself" flash; the document root itself can never be re-parented.
- Verified: spike typecheck + build green.

---

## [Feat: AI generations history panel - re-import lost generated pages/snippets] — 2026-08-14 (branch: dev/08-14/various-features)

- `apps/whoobe-one-spike/src/ai-api.ts`: new `listAiGenerations()` (GET `/ai/generated`) returning only records with a validated `payload` (failed/rejected calls are noise for the editor).
- `apps/whoobe-one-spike/src/components/AiGeneratedPanel.vue` (new): editor sidebar tab listing recent usable generations - kind badge (page/snippet), model, date, truncated prompt - with a refresh button; clicking one emits `import`.
- `apps/whoobe-one-spike/src/components/BlockEditor.vue`: new "AI generations" tab in the right sidebar (Sparkles icon); `onAiGeneratedImport()` re-imports a record: `kind='page'` replaces the document via the existing `onAiPageGenerated()` flow, `kind='snippet'` inserts at the current selection. Recovery path for generations whose payload was persisted server-side but never made it into the canvas (the reported case: one success with `laguna-s-2.1-free` sits in `whoobe_ai_generated` with no matching canvas insertion).
- `apps/whoobe-one-spike/src/scripts/editor-actions.ts`: snippet insertion logic extracted from FloatingToolbar into shared `insertGeneratedSnippet(editor, payload)` (same placement rules as paste) - FloatingToolbar's "AI generate snippet" now uses it too, so both entry points behave identically.
- Verified: whoobe-one-spike typecheck + production build green; dev-DB spot check confirms the panel's data source (`kind='page'`, `status='success'`, payload present).

---

## [Feat: AI modal shows provider/model; raw model response always logged] — 2026-08-14 (branch: dev/08-14/various-features)

- `packages/core/src/db/ai-generated-schema.ts` + `ai-generated-records.ts`: `whoobe_ai_generated.raw_response` changed from `jsonb` to `text` (migration `drizzle/0020_stiff_the_spike.sql`, applied to both the local container and `develop.local`). The raw model reply is usually fence-wrapped markdown that is not valid JSON - the old jsonb column rejected it and would 500 the request right after a successful generation (or silently swallow the log for bare-JSON outputs). The full response is now always persisted for success and validation-failure outcomes. `AiGeneratedRecord.rawResponse` typed `string | null`.
- `apps/whoobe-one-spike/src/ai-api.ts`: new `fetchAiInfo()` (GET `/ai/settings`, never exposes the key; returns null when unconfigured/unauthenticated).
- `apps/whoobe-one-spike/src/components/AiGenerateModal.vue`: shows the current AI agent as a badge under the description - provider (friendly label map for openai/anthropic/google/zen/openrouter/custom) and model, fetched on mount; when no API key is configured it shows an amber "Not configured yet - save provider, model and API key in Settings → AI" hint instead.
- Verified: core + whoobe-one-spike typechecks and spike production build green.

---

## [Feat: OpenRouter as AI provider option] — 2026-08-14 (branch: dev/08-14/various-features)

- `packages/core/src/ai/providers.ts`: new `'openrouter'` provider - the OpenRouter gateway (https://openrouter.ai/api/v1, OpenAI-compatible) served through the existing chat.completions path (`OPENROUTER_DEFAULT_ENDPOINT`, suggested model `OPENROUTER_DEFAULT_MODEL = deepseek/deepseek-chat`); stored `endpoint` still overrides the default; "no API key" error names the provider. `AiProviderName` is now `openai | anthropic | google | zen | openrouter | custom`.
- `packages/core/src/db/ai-settings-schema.ts`: provider comment updated with `openrouter`.
- `apps/admin-dashboard/src/components/settings/AiSettingsCard.vue`: "OpenRouter (openrouter.ai)" added to the Provider dropdown; model prefill logic generalized to a `DEFAULT_MODELS` map (zen → deepseek-v4-flash-free, openrouter → deepseek/deepseek-chat) applied when the field still holds the initial default; endpoint placeholder/help text extended with the OpenRouter URL.
- Verified: core rebuild + typechecks green (`@whoobe-cms/core`, `admin-dashboard`); dispatch smoke test via built dist (missing key → "AI provider (openrouter)" message).

---

## [Fix: detect free-tier quota exhaustion (FreeUsageLimitError) on AI 429s] — 2026-08-14 (branch: dev/08-14/various-features)

- `packages/core/src/ai/providers.ts`: OpenCode Zen returns `FreeUsageLimitError` for the `*-free` models when the account's free quota is spent (not a transient limit). `isFreeQuotaError()` now detects it (OpenAI SDK v7 surfaces the parsed body on `.error`, older SDKs on `.body.error` - both checked) and `generateAiJson()` skips the retry loop for it (was 3 wasted attempts), while `mapProviderError()` returns an actionable message: wait for the quota window or switch to a paid model (e.g. `deepseek-v4-flash`). Plain 429s keep the Retry-After-aware retry behavior.
- Diagnosed live: the stored Zen config (`zen` / `deepseek-v4-flash-free`) returns `429 {"error":{"type":"FreeUsageLimitError",...}}` from `https://opencode.ai/zen/v1/chat/completions` - the free model's account quota was exhausted; a new API key does not reset it (it is an account-level usage cap, not a per-key limit).
- Verified with mock servers against the built dist: FreeUsageLimitError → 1 call, no retries, new message; plain persistent 429 → 3 calls + Retry-After message (unchanged). Typechecks green.

---

## [Fix: AI 429 rate-limit handling - retry with backoff + Retry-After] — 2026-08-14 (branch: dev/08-14/various-features)

- `packages/core/src/ai/providers.ts`: `generateAiJson()` now retries HTTP 429s up to 2 extra times (3 attempts total), sleeping per the provider's `Retry-After` header when present, else backoff (2s/4s); SDK-internal retries are disabled (`maxRetries: 0` on the OpenAI and Anthropic clients) so the loop is the single retry mechanism (was up to 9 hammering calls: 3 SDK x 3 loop). The 429 error message now reports the actual wait time ("Wait ~Ns per the provider's Retry-After header"). Error mapping extracted to `mapProviderError()` + `retryAfterMs()` helpers.
- Verified with a local mock HTTP server against the built dist: transient 429 (2x with `Retry-After: 1`) → recovers on the 3rd attempt (~2s, JSON parsed); persistent 429 → exactly 3 calls (~2s) and the Retry-After-aware message. Typechecks green.

---

## [Feat: OpenCode Zen as AI provider option] — 2026-08-14 (branch: dev/08-14/various-features)

- `packages/core/src/ai/providers.ts`: new `'zen'` provider - the OpenCode Zen gateway (https://opencode.ai/zen/v1) served through the existing OpenAI-compatible path (`ZEN_DEFAULT_ENDPOINT`, suggested model `ZEN_DEFAULT_MODEL = deepseek-v4-flash-free`); the stored `endpoint` still overrides the default when set, and the "no API key" error now names the provider correctly (`generateOpenAi` takes a provider label).
- `packages/core/src/db/ai-settings-schema.ts`: provider comment updated (`openai | anthropic | google | zen | custom`).
- `apps/admin-dashboard/src/components/settings/AiSettingsCard.vue`: "OpenCode Zen (opencode.ai)" added to the Provider dropdown; picking it prefills the model with `deepseek-v4-flash-free` when the field still holds the initial default; endpoint placeholder/help text now covers blank-for-default + the Zen URL.
- Verified: core rebuild + typechecks green (`@whoobe-cms/core`, `admin-dashboard`); dispatch smoke test via built dist (unreachable endpoint → connection error, missing key → "AI provider (zen)" message).

---

## [Feat: AI pages & snippets generator] — 2026-08-14 (branch: dev/08-14/various-features)

Per `docs/plans/ai/ai-pages-snippets-generator.md` (rewritten into a full plan in this change): Settings (AI agent/model, endpoint, API key) + whoobe-one-spike "AI Generate Snippet/Page" + results persisted in the new `whoobe_ai_generated` table.

- **`packages/core`**: new `ai_settings` (single-row, mirrors `mail_settings`) and `whoobe_ai_generated` (audit log: kind/prompt/provider/model/payload jsonb/rawResponse jsonb/status/error/createdBy) Drizzle schemas + records (`db/ai-settings-schema.ts`, `ai-settings-records.ts`, `ai-generated-schema.ts`, `ai-generated-records.ts`), registered in `drizzle.config.ts` (migration `drizzle/0019_overrated_ken_ellis.sql`) and exported from `src/server.ts`. New LLM layer: `ai/providers.ts` (`generateAiJson()` dispatching to openai / @anthropic-ai/sdk / @google/generative-ai SDKs — "custom" = OpenAI SDK at a user-supplied base URL — non-streaming, `parseJsonText()` fence-stripping, `AiGenerationError` with mapped 401/429/404 messages; new deps `openai`, `@anthropic-ai/sdk`, `@google/generative-ai`) and `ai/prompts.ts` (Element-tree JSON contract system prompt, snippet/page user prompts, shallow `validateElementTree()` with unique-id/tag/node-count checks).
- **`apps/core-api/src/server.ts`**: `GET/PUT /ai/settings` (SETTINGS_MANAGE, key never returned — only `hasApiKey`; blank key on PUT keeps the existing one), `POST /ai/generate` (OBJECTS_WRITE; validates kind/prompt, 400 when unconfigured, 422 on validation rejection, logs every success *and* failure into `whoobe_ai_generated` with `createdBy`), `GET /ai/generated` (OBJECTS_READ, recent 50).
- **`apps/admin-dashboard`**: new Settings → AI sub-section (`'ai'` in `tabsStore.ts` `SettingsSubSection`, sidebar entry in `DashboardLayout.vue` with Sparkles icon, sub-tab + title in `SettingsView.vue`); new `components/settings/AiSettingsCard.vue` (provider/model/endpoint/API-key form modeled on MailSettingsCard) + `utils/ai-settings-api.ts`.
- **`apps/whoobe-one-spike`**: new `ai-api.ts` (`generateAi()`, `AiApiError` with status) and `components/AiGenerateModal.vue` (prompt modal, spinner, 401 → "log into the admin dashboard" hint). **AI Generate Snippet**: Wand2 button in `FloatingToolbar.vue` beside "Save as snippet", inserting the generated tree (fresh ids via `cloneWithFreshIds()`, `clean()`, `applyImagePlaceholder()`) with the same placement rules as paste. **AI Generate Page**: "AI Page" top-bar button in `BlockEditor.vue` (visible when embedded too), replacing the document via the `onNew()` pattern (root coerced to tag `document`, keeps the open page's id/name/category).
- **Verified**: `db:generate` + `db:migrate` applied on a fresh Postgres; all four apps typecheck; dashboard + spike production builds pass; authenticated curl round-trip (GET null → PUT persists without echoing the key → blank-key PUT keeps it → generate with bad key returns the mapped 401 message AND writes an error audit row with `createdBy` → bad `kind` 400 → `GET /ai/generated` lists the row); pure-logic spot checks for prompts/parse/validation.

---

## [Feat: Pages list view - column order, sortable headers, multi-column filters, batch selection] — 2026-08-14 (branch: dev/08-14/various-features)

- `apps/admin-dashboard/src/views/PagesView.vue`: pages table now supports configurable column order and visibility via a "View" dropdown (reorder with up/down arrows, toggle checkboxes, matching the Objects view), click-to-sort on every column header (ASC/DESC toggle with ▲/▼ indicator, default sort by slug), and a multi-column filter modal (`Filter` button, field/operator/value rows with AND semantics, incl. boolean `published` and date `updatedAt` inputs). Added a checkbox column with header select-all plus a bottom batch-action bar (same options as `ObjectsView.vue`: Publish, Unpublish, Delete, Clear) operating on the selected rows.
- `apps/admin-dashboard/src/utils/pages-api.ts`: added `deletePageById()` (DELETE `/whoobe-one/pages/:id`); updated the stale "list/get-only" header comment.
- `apps/admin-dashboard/src/stores/pagesStore.ts`: added `deletePage()` which removes the page from the local list after a successful delete.
- `apps/admin-dashboard/src/views/PagesView.vue`: the Website column now displays the website's `name` (resolved via the websites store, loaded on mount) instead of the raw `websiteId`; sorting on that column also uses the label. Falls back to the id (or "—") when unknown.
- Verified: `pnpm --filter admin-dashboard typecheck` green.

---

## [Feat: editable existing custom attributes in AttributesControl] — 2026-08-14 (branch: feat/08-14/env-optimization)

- `apps/whoobe-one-spike/src/components/advanced/AttributesControl.vue`: existing custom HTML attributes are now editable in place — each row renders an editable name input and value input (previously a read-only `name="value"` span, so updating meant delete + re-add).
- Renaming moves the bag key while keeping the value; invalid renames (empty, reserved per `RESERVED_ATTRS`, duplicate) are ignored and the input snaps back to the stored name. Values update the attributes bag on input.

---

## [Implemented: single root .env for all configuration + WHOOBE_HOSTNAME] — 2026-08-14 (branch: env-unification)

Per `docs/plans/environment/env-optimization.md` (with one enhancement: a `WHOOBE_HOSTNAME` variable drives all derived URLs instead of hardcoded values):

- **`.env` (root, rewritten)**: single source of truth for the whole monorepo — `POSTGRES_*` (docker-compose), shared `DB_*`, `MIGRATION_SOURCE_ENCRYPTION_KEY` (core-api), `S3_*` (asset-processor), `VITE_*` (admin-dashboard/whoobe-one-spike), `VITE_FONT_FAMILIES`. `WHOOBE_HOSTNAME=localhost` is expanded into `DB_HOST`, `S3_ENDPOINT`, `S3_PUBLIC_BASE_URL`, `VITE_CORE_API_URL`, `VITE_ASSET_PROCESSOR_URL`. `PORT` vars dropped (code defaults `3003`/`3002`). Deleted: `apps/core-api/.env`, `apps/asset-processor/.env`, `apps/admin-dashboard/.env.local`, `apps/whoobe-one-spike/.env`, `apps/whoobe-one-spike/.env.example` (tracked) and all `:Zone.Identifier` junk files.
- **`packages/core/src/env.ts`** (new): `loadRootEnv()` — reads the repo-root `.env` with `${VAR}` expansion, merges into `process.env` without overwriting shell-exported vars (exported wins). Exported from the Node-only `@whoobe-cms/core/server` barrel (kept out of the browser-safe `index.ts`).
- **`apps/core-api/src/server.ts`, `apps/asset-processor/src/server.ts`, `packages/migration-tool/src/cli.ts`**: replaced `process.loadEnvFile()` with `loadRootEnv()` + updated comments.
- **`apps/admin-dashboard/vite.config.ts`, `apps/whoobe-one-spike/vite.config.ts`**: added `envDir: '../../'` — Vite now loads the root `.env` (native dotenv-expand for `${VAR}`, process.env wins).
- **`dev-cms.sh`**: proper arg parsing (`--build`, `--stop`, `--hostname <name>`, combinable, unknown options rejected). `--hostname` exports only the browser-facing app endpoints (`VITE_ASSET_PROCESSOR_URL`, `VITE_CORE_API_URL`); DB/S3 endpoints are external infra and stay as configured in `.env`.
- **`README.md`**: config section rewritten for the single root `.env` + `--hostname` usage.
- **Verified**: `loadRootEnv()` expansion + shell-override precedence (node test); `docker compose up -d` (postgres+minio up); core-api boots and `/health` 200; asset-processor `/health` ok; Vite serves expanded `VITE_*` = localhost from root `.env`, and exported `VITE_CORE_API_URL=http://develop.local:3003` wins (the `--hostname` path). Full `pnpm typecheck` green.

---

## [Fix: DAM 401 "Authentication required" - cross-host session cookie mismatch] — 2026-08-14 (branch: env-unification)

- Reported: admin-dashboard DAM panel fails with 401 "Authentication required" on `develop.local:3002/api/v1/dam/*` while the rest of the dashboard works. Verified the entire backend path is healthy via curl with a real MFA login (login → `/auth/mfa/challenge` → cookie → `/api/v1/dam/folders` + `/assets` + `/auth/me` all 200).
- **Root cause (browser-side, not server-side)**: the page is opened at `http://localhost:3000` while the effective API/DAM URLs pointed at `develop.local:3002/3003`. The session cookie is host-only for the host the login happened on (localhost) and `SameSite=Lax`, so cross-site requests to `develop.local:3002` arrive without it → 401; core-api on the cookie's own host (localhost:3003) keeps working. Compounded by: (a) the running Vite dev server was started before `apps/admin-dashboard/.env.local` was last edited, so it served stale env values, and (b) `damStore` persists the DAM URL in localStorage (`whoobe_custom_dam_config`) which overrides env — the persisted `develop.local:3002` survived the switch to localhost.
- **`apps/admin-dashboard/src/utils/stale-localhost.ts`** (new): `isStaleLocalhostUrl()` extracted from `damStore` into a shared util.
- **`apps/admin-dashboard/src/stores/authStore.ts`**: `loadInitialConfig()` now applies the same stale-localhost guard as `damStore` — a persisted `coreApiUrl` of `localhost`/`127.0.0.1` is discarded when the page is loaded from a LAN hostname, falling back to the env/window-hostname default (authStore previously had no purge, so a stale localhost auth URL would keep re-breaking DAM once the page moved to develop.local).
- **`apps/admin-dashboard/src/stores/damStore.ts`**: now imports the shared `isStaleLocalhostUrl` instead of its local copy.
- **User action required (one-time)**: restart the dev stack (so Vite loads the current `.env.local`) and clear the browser's localStorage keys `whoobe_custom_auth_config` + `whoobe_custom_dam_config` (or "Clear site data" for the dashboard origin), then log in again — the cookie will then be host-only for the same host all API URLs use (localhost, per the current `.env.local`).

---

## [Fix: core-api fails to start - @whoobe-cms/migration-tool dist missing] — 2026-08-14 (branch: env-unification)

- Reported: `./dev-cms.sh` failed with `ERR_MODULE_NOT_FOUND: Cannot find package '.../apps/core-api/node_modules/@whoobe-cms/migration-tool/dist/index.js'`. Root cause: `packages/migration-tool/dist` was never built — core-api imports `@whoobe-cms/migration-tool` (resolves to `dist/index.js` via `main`), but `dev-cms.sh --build` only built `@whoobe-cms/core`.
- **`dev-cms.sh`**: `--build` now also builds `@whoobe-cms/migration-tool` before starting the apps; header comment updated to explain both workspace deps must be built first.
- Built `packages/migration-tool` (`tsc` → `dist/`) and verified `core-api` boots and answers `/health` with 200.

---

## [Plan: Single root .env for all configuration] — 2026-08-14 (branch: env-unification)

- Added `docs/plans/environment/env-optimization.md` — plan to consolidate the five per-app `.env` files (root, `core-api`, `asset-processor`, `admin-dashboard/.env.local`, `whoobe-one-spike`) into one unique `.env` at the repo root.
- Decisions locked in the plan: `PORT` dropped from env (code defaults `3003`/`3002` keep running), only existing vars consolidated (no `PIMCORE_DB_*`/`SEED_*`/`PUBLIC_SITE_URL` additions), Node loaders (`core-api`, `asset-processor`, `migration-tool`) pointed at `../../../.env` via `import.meta.url`, both Vite apps pointed at the root via `envDir: '../../'`, per-app env files deleted.

---

## [Fix: Dynamic Query offset/limit ignored] — 2026-08-10 (branch: feat/08-10/data-binding-field-transformers)

Reported: a Dynamic Query binding with `offset=0, limit=1` still returned all 226 records. Root-caused via direct `curl` testing against `core-api` (bypassing the editor UI entirely) to isolate frontend vs. backend: `POST /public/data-objects/query` with `{"class":"Product","limit":1,"offset":0}` returned all 6 published records instead of 1.

- **Root cause: stale/orphaned `core-api` processes**, not a logic bug — the source and compiled `packages/core/dist` were both already correct. Found multiple `tsx watch src/server.ts` processes running simultaneously, including a **5-day-old orphaned process from Aug 5** and another from earlier the same day; the one actually bound to port 3003 was serving pre-refactor query logic despite on-disk code being current. Killed all stale instances, rebuilt `packages/core`, started `core-api` fresh — `limit`/`offset` now behave correctly, verified via direct curl (`limit=1,offset=0` → 1 result; `limit=3,offset=2` → 3 results).
- **Also fixed a real (if currently harmless) bug found while tracing this**: `apps/whoobe-one-spike/src/components/DataObjectPicker.vue`'s `confirm()` used a truthy check (`offset.value ? offset.value : undefined`) that silently dropped an explicit `offset = 0` back to `undefined`. No observable behavior change today (0 and "unset" produce identical query results), but the check is now `!= null`, matching actual intent.

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

## [Password reset flow (forgot/reset via email)] — 2026-09-01 (branch: current)

- **New DB columns** on `users` table: `reset_token` (text, nullable) and `reset_token_expires_at` (timestamptz, nullable). Drizzle migration `0032`.
- **New service** `packages/core/src/auth/reset-password.ts`: `generateResetToken()`, `findUserByResetToken()`, `clearResetToken()`, `updatePassword()` — argon2id-hashed password update, 1-hour token TTL. Exported from `@whoobe-cms/core/server`.
- **Backend routes** (`apps/core-api`): `POST /auth/forgot-password` (rate-limited, sends email with reset link via sendMail), `POST /auth/reset-password` (validates token, updates password).
- **Frontend API client** (`apps/admin-dashboard`): `requestPasswordReset()` and `resetPassword()` in `auth-api.ts`.
- **New views** (`apps/admin-dashboard`): `ForgotPasswordView.vue` (email input form, success confirmation), `ResetPasswordView.vue` (token from query param, new password + confirm, success state).
- **Router update** (`apps/admin-dashboard`): added `/forgot-password` and `/reset-password` routes outside the auth gate.
- **App.vue updated**: renders `ForgotPasswordView`/`ResetPasswordView` when not authenticated and route matches.
- **LoginView.vue**: added "Forgot password?" link below the Sign In button.

## [Roles, Users & Permissions admin] — 2026-09-01 (branch: current)

- **Granular permission keys** (`packages/core/src/auth/permissions.ts`): added context-scoped keys (`websites:list`, `pages:edit`, `assets:rename`, `data_objects:create`, `themes:list`, `components:view`, etc.) alongside the existing legacy flat keys. Updated `DEFAULT_ROLE_PERMISSIONS` for admin/editor/viewer.
- **New service** `packages/core/src/auth/admin-users.ts`: full CRUD service for users (`listUsers`, `createUser`, `getUserWithRoles`, `updateUser`, `deleteUser`, `setUserRoles`, `adminResetPassword`) and roles (`listRoles`, `createRole`, `getRole`, `updateRole`, `deleteRole`, `setRolePermissions`) plus `listAllPermissions`. Exported from `@whoobe-cms/core/server`.
- **Backend CRUD routes** (`apps/core-api`): all gated by `requirePermission(PERMISSIONS.USERS_MANAGE)` — `GET/POST /auth/users`, `GET/PATCH/DELETE /auth/users/:id`, `POST /auth/users/:id/reset-password`, `GET/POST /auth/roles`, `GET/PATCH/DELETE /auth/roles/:id`, `GET /auth/permissions`.
- **Frontend API client** (`apps/admin-dashboard`): `listUsers`, `createUser`, `updateUser`, `deleteUser`, `adminResetPassword`, `listRoles`, `createRole`, `updateRole`, `deleteRole`, `listAllPermissions` in `auth-api.ts` with full TypeScript types.
- **UsersView.vue**: table of all users with role badges, create/edit modal (email, display name, password, role picker), delete, admin-forced password reset.
- **RolesView.vue**: table of all roles with user count, create/edit modal with permission grid grouped by context (Websites, Pages, Snippets, Assets, Data Objects, Themes, Components, Workflow) plus system permissions section. Blocks deletion when users are assigned.
- **SettingsView.vue**: replaced the "Roles/Users/Workspaces" placeholder card with sub-tab navigation (Users | Roles) rendering the two new views.
- **Seed updated**: existing idempotent seed loop now picks up all new permission keys from `ALL_PERMISSION_KEYS` automatically — no code change needed.

## [Vite proxy for tunnel/Cloudflare access] — 2026-09-01 (branch: current)

- **Vite proxy** (`apps/admin-dashboard/vite.config.ts`): added proxy rules for all API paths (`/auth`, `/whoobe-one`, `/documents`, `/snippets`, `/data-classes`, `/data-components`, `/data-objects`, `/mail-settings`, `/mail-log`, `/mail-templates`, `/migration-sources`, `/health`, `/search`, `/themes`) to `develop.local:3003`, and `/api/v1/dam` to `develop.local:3002`. This allows all API traffic to go through the frontend port (3000), making the app work behind a tunnel (e.g. Cloudflare) that only exposes that port.
- **`getDefaultCoreApiUrl()`** (`auth-api.ts`): now uses the page's own origin (hostname + port) instead of hardcoding `:3003`, so requests go through the Vite proxy.
- **`getDefaultAssetProcessorUrl()`** (`dam-api.ts`): same change — uses the page's origin instead of hardcoding `:3002`.
- **authStore** (`authStore.ts`): uses `getDefaultCoreApiUrl()` directly instead of the env var `VITE_CORE_API_URL`, so the URL always matches the page's origin.
- **damStore** (`damStore.ts`): uses `getDefaultAssetProcessorUrl()` directly instead of the env var `VITE_ASSET_PROCESSOR_URL`.
- **`setSessionCookie`** (`core-api/server.ts`): `secure` flag now set to `false` (was `isProduction`), so the session cookie is always sent over HTTP — fixes 401 on production environments without HTTPS termination.
- **`express-guards.ts`**: added debug logging (`requireAuth`/`requirePermission`) to distinguish "no cookie" vs "invalid session" on 401 responses.
- **Stale URL detection** (`stale-localhost.ts`): added `isStoredUrlStale()` — a persisted DAM URL is discarded when its hostname differs from the page's current hostname, preventing 401s from a stale custom backend URL saved in localStorage.

## [whoobe-one-spike & whoobe-studio editor proxying] — 2026-09-01 (branch: current)

- **Vite proxy** (`apps/admin-dashboard/vite.config.ts`): added `/whoobe-one-editor` → `develop.local:3006` and `/whoobe-studio` → `develop.local:3004` proxy rules, so both embedded editors load correctly behind a tunnel that only exposes port 3000.
- **Unique base paths**: whoobe-one-spike set to `base: '/whoobe-one-editor/'` and whoobe-studio to `base: '/whoobe-studio/'` in their vite.config.ts, so their assets resolve through the proxy without colliding with the host app's own `/` paths.
- **Embed components updated** (`apps/admin-dashboard`): `WhoobeOneEmbed.vue`, `SnippetEditorEmbed.vue`, `WhoobeStudioEmbed.vue` (via `documents-api.ts`'s `getDefaultWhoobeStudioUrl`) now build iframe URLs on the page's own origin with the editor base path, instead of hardcoding ports `:3006`/`:3004`.
- **Shared core-api URL helper** (`apps/whoobe-one-spike/src/core-api-url.ts`): new `getDefaultCoreApiUrl()` that returns the page's own origin (no `:3003`), so the embedded editor's own API calls go through the proxy. All 9 whoobe-one-spike API files and `ThemeModal.vue` updated to use it.
- **`allowedHosts: true`** in admin-dashboard, whoobe-one-spike, and whoobe-studio vite configs — accept connections from any hostname (Cloudflare public URL).

## [Oracle Free Tier Deployment Guide] — 2026-09-05

- **`docs/deployment.md`**: Added comprehensive deployment guide for Oracle Cloud Infrastructure Always Free Tier, covering VM provisioning (Ampere A1 ARM), dependency installation (Node.js 20, pnpm, PostgreSQL 16, MinIO, nginx), environment configuration, PM2 process management, nginx reverse proxy setup with SSL via Let's Encrypt, OCI Object Storage alternative, backup strategy, and performance tuning for ARM64.
- **`getDefaultCoreApiUrl()` / `getDefaultAssetProcessorUrl()`** now only append a port when the page is served on a non-default port, so HTTPS (portless) URLs work correctly.