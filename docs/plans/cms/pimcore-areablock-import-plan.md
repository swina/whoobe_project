# Plan: Pimcore Areablock/Editable Import & Whoobe Studio Integration

Planning document for importing Pimcore Documents (and the Areablocks/editables inside them) into this system, and for the Whoobe Studio visual editor that will let staff view and edit that imported content. No new code has been written yet — this corrects some stale documentation first, then lays out the real work.

Confirmed with the user before writing this: Whoobe Studio is to be **designed and built fresh** in this repo (the `github.com/swina/whoobe-studio-alpha-0122` reference in `docs/Initial-Plan.md`/`docs/WhoobeStudio-Integration.md` is aspirational, not a repo to vendor in), and the source is **live Pimcore MySQL access** (not export files or mock data), so the extractor work below is scoped to build against a real database.

---

## 0. Status (updated after the first implementation pass, branch `dev/08-02/pimcore-documents-import`)

Being explicit here on purpose, having just finished correcting a doc that claimed phases were done when they weren't (§1) — real status:

**Built and verified (typecheck + tests passing)**:
- Phase 2 (persistence): `cms_documents` table (`packages/core/src/db/cms-schema.ts`/`cms-records.ts`), migrated into the live `whoobe_db`.
- Phase 1 (extractor), built as a **plugin architecture** rather than a single hardcoded extractor, per the explicit "make it repeatable" instruction:
  - `source-adapter.ts` — the `PimcoreSourceAdapter` interface + a name-based registry (`registerPimcoreSourceAdapter`/`createPimcoreSourceAdapter`). Adding support for a different Pimcore version or a non-MySQL source is a new file + one registration call, no changes to the CLI/converter.
  - `adapters/mysql-adapter.ts` — a real adapter (`mysql2`), with table/column names as config overrides rather than hardcoded, since Phase 0 (below) hasn't confirmed them against a real instance yet.
  - `adapters/fixture-adapter.ts` — an in-memory adapter for tests, doubling as the template for a future export-file adapter.
  - `php-unserialize.ts` — a from-scratch, tested PHP `serialize()` decoder (Pimcore stores Areablock slot lists and Image/Video references this way).
  - `pimcore-serialized-data.ts` — bridges raw `documents_elements` rows to `PimcoreEditableElement`s: resolves Image/Video asset IDs to paths, reassembles Areablock brick instances from sibling rows.
  - `pimcore-document-converter.ts` extended with `registerAreabrickConverter` — a brick-type → `WhoobeBlockNode` mapping registry. Unregistered brick types still convert (a generic fallback container, fields preserved), so migration never silently drops content while brick-specific mappings are still being written. Verified end-to-end in `pimcore-etl-pipeline.test.ts`: a registered brick and an unregistered brick side by side, in the same document, both converting correctly.
- Phase 3 (CLI wiring): `cli.ts`'s `migrate-documents` no longer uses a hardcoded sample document — it drives the adapter interface, converts via `PimcoreDocumentConverter`, and persists via `upsertDocumentRecord` (idempotent by `pimcoreId`). Supports `--dry-run` and `--source=<mysql|fixture>`.

**Phase 0 (updated 2026-08-02): run against a real instance, assumptions corrected.**

Ran `migrate-documents --dry-run` against a live Pimcore MySQL database. Two assumptions were wrong and have been fixed in code:

- The table is `documents_editables`, not `documents_elements` (renamed in this Pimcore version) — `adapters/mysql-adapter.ts`'s default updated, still overridable via `PIMCORE_DOCUMENTS_ELEMENTS_TABLE` for instances still on the older name.
- An Areablock slot entry is `{key, type, hidden}`, and a brick instance's sibling fields are named `{areablockName}:{key}.{fieldName}` (e.g. `content:5.classe`) — keyed by the slot's `key` string, **not** by array index or brick type name as originally assumed. Fixed in `parseAreablockSlotList`/`matchesAreablockSlot` in `pimcore-serialized-data.ts`.

After the fix: **all 117 documents in the real instance converted successfully, 0 failures**, in dry-run mode (no writes performed). Real content converted correctly end to end - resolved asset paths (e.g. an Image editable's asset ID → `communication/Visore_2023.jpg`), real page text, and 43 distinct real Areabrick type names discovered (`header-brick`, `banner-brick`, `content-two-columns-brick`, `hero`, `products-showcase`, and 38 others) — all currently going through the generic unmapped-brick fallback (content preserved, not yet given brick-specific `WhoobeBlockNode` shaping). Registering `registerAreabrickConverter` mappings for these 43 real brick types, prioritized by how often each appears across the 117 documents, is the natural next increment - not done yet.

**Real (non-dry-run) writes have now happened**: documents 1 and 10 (`/` and `/it/`) are persisted in `cms_documents` and confirmed reachable through `apps/core-api`'s `/documents` endpoints and the admin-dashboard's read-only Preview tab (see the dashboard-integration commit).

**First real brick mapping is done: `header-brick`** (`areabrick-mappings/header-brick.ts`), built directly from the real Twig source (`templates/areas/header-brick/view.html.twig` → `templates/components/hero-generico.html.twig`), not guessed from field names. Worth internalizing before mapping the remaining 42, since the same two gotchas will very likely recur:
- The brick's own `view.html.twig` is often not where the real layout lives - it delegates to a shared component template for the actual (non-editmode) HTML. Read both.
- Not every field passed into an include is actually used by it (`header_color`, a document-level property here, turned out to be dead in the target template) - worth confirming a field is actually rendered before modeling it.

Also fixed while mapping this brick: the generic Video editable conversion never applied `s3Prefix` to its URL (Image did) - inconsistent, now both go through a shared `resolveMediaUrl` helper that brick-specific mappings reuse too (e.g. for a background-image style, which the generic conversion has no case for).

Verified against real data: re-ran `migrate-documents` (real write, not dry-run) for documents 1 and 10 - document 10's stored `cms_documents` row now has the correctly-mapped `header-brick` (real background image path, real Italian title/text, and the mapping correctly omits the video wrapper when that field is empty, which it is for this real instance).

**Phases 4 and 5 are now both done, MVP-scoped, as originally planned in §7/§8:**

- **Phase 4 (Documents admin UI)**: real (non-mock) list + read-only Preview, wired to `GET /documents`/`GET /documents/:id`. `BlockNodePreview.vue` was upgraded after first landing - it originally only showed schematic type/name badges, ignoring `node.style`/`props.cssClass` entirely, so `header-brick`'s real background-image/layout never actually showed. It now renders each node with its real tag/style/class, so the preview visually matches the migrated Twig layout instead of a debug tree.
- **Phase 5 (Whoobe Studio)**: `apps/whoobe-studio` converted from a `tsc`-only stub into a real Vite + Vue 3 app (port 3004) - the MVP scoped in §8: a tree view (select/reorder-via-up-down-buttons/delete) and an inspector panel (name/tag/content fields, raw-JSON editing for `props`/`style`), syncing via the already-written postMessage bridge, autosaving (debounced 500ms) to `PATCH /documents/:id` rather than needing an explicit Save button. Wired into the dashboard via an "Edit in Whoobe Studio" button on `MasterDocumentTab.vue`, opening `WhoobeStudioEmbedModal.vue` (moved from `components/dam/` to `components/documents/` - it was misplaced there from before Documents existed as its own feature).
- **The postMessage origin-validation gap flagged in §8 is fixed** on both sides: `WhoobeStudioBridge` (studio) now requires an explicit `expectedOrigin` and refuses to default to `"*"`; `WhoobeHostBridge` (dashboard) derives the studio's origin from `studioUrl` and validates every incoming `event.origin` against it. The studio learns the dashboard's origin via a `?parentOrigin=` query param on the iframe `src`, since it has no other way to know who's allowed to embed it.

Verified end-to-end: `PATCH /documents/:id` tested via curl (success, 401 unauthenticated, 404 unknown id); all 6 packages/apps typecheck clean; all new/changed files confirmed compiling via both dev servers (admin-dashboard on 3000, whoobe-studio on 3004).

**Deliberately deferred from the Whoobe Studio MVP** (per §8's original scope): drag-and-drop reordering, the reusable snippet library, multi-locale switching UI, and adding brand-new nodes (only editing/reordering/deleting existing imported content is supported - matches the actual near-term need, which is fixing up migrated content, not authoring from scratch).

### Preview Styling: real Tailwind, not the original semantic CSS

Corrected course after landing the above: the user flagged that Whoobe Studio was "really a JSON structure visualizer," not a WYSIWYG editor, and that the goal is (1) a real WYSIWYG editor of editables and (2) an HTML preview of documents that actually looks like the real site. First fix targeted both at once, since they share the same rendering gap.

**Decision, made explicitly with the user**: convert the real site's per-brick SCSS component library (`assets/scss/components/_hero-generico.scss` etc. - discovered to exist and to match brick names almost 1:1, e.g. `_content-two-columns.scss` ↔ `content-two-columns-brick`) to hand-written Tailwind utility classes, rather than importing the site's real compiled CSS as-is. The latter would have been faster and risk-free (literally the same styling), but the user chose the Tailwind conversion explicitly, aware of the tradeoff (larger effort, hand-translation risk per brick) - recorded here since it's a deliberate choice this plan should keep respecting for the remaining 42 bricks, not revisit each time.

- `site-theme.css` (new, in both `admin-dashboard` and `whoobe-studio` - two small copies, not a shared package, matching how the bridge files are already maintained in parallel) ports the real design tokens from `assets/scss/utils/_variables.scss`/`_mediaquery.scss`: custom Tailwind breakpoints named after the site's own mixins (`tablet-l` = 900px, not Tailwind's default `lg`), plus the brand colors and `font-tenor`/`font-poppins`. Real values, not approximations - only the *technique* (Tailwind utilities vs. SCSS + grid-area/mixins) differs from the source per brick, not the underlying breakpoints/colors.
- `header-brick.ts` rewritten to emit real Tailwind classes hand-ported from `_hero-generico.scss` (plus `.sb-wrapper` from `_global.scss`), including a `clamp()`-based reproduction of the SCSS `fluid-type` mixin's two-breakpoint linear interpolation (a single `clamp()` naturally reproduces the same flat/fluid/flat behavior without needing the mixin's extra breakpoint gate). Also found and fixed here: the CTA link ("Scarica schede e folder") is unconditionally `display:none` in the real component - the original mapping had modeled it as visible, which was wrong; now hidden to match, while the field data is still preserved.
- **A critical build gotcha, worth internalizing before converting more bricks**: these Tailwind classes are string literals inside `packages/migration-tool/src/areabrick-mappings/*.ts`, fetched at runtime from the API - not present anywhere in either Vite app's own source tree. Tailwind v4's default content scan only looks at the current app's files, so without action it silently generates *no CSS at all* for these classes - no error, they just don't render, which would have made this entire conversion invisible. Fixed with an explicit `@source "../../../packages/migration-tool/src/**/*.ts";` in both apps' `style.css`, verified by confirming the compiled CSS actually contains the expected rules (e.g. the `clamp()` font-size, the `900px` media query) rather than trusting that adding the class string was suffient on its own.
- Also fixed while doing this: `BlockNodePreview.vue` had a real rendering bug - for a `media`/`video` node, the outer generic `<component :is="node.tag">` wrapper (used for typography/container/etc.) also evaluates to `video` (since `node.tag === 'video'` there), producing invalid nested `<video><video/></video>` markup. Fixed by rendering media nodes (`img`/`video`) as flat, non-wrapped elements, never through the generic component branch.
- **Whoobe Studio gained a live rendered preview pane** (`StudioBlockPreview.vue`, a near-duplicate of `BlockNodePreview.vue` for the same "separate apps, no shared Vue-component path yet" reason bridge.ts/whoobe-host-bridge.ts already established) alongside the tree and JSON inspector, laid out tree (narrow) | live preview (main, white background matching the real site's light theme) | inspector (narrow). Clicking a rendered element in the preview selects it (same `selectedNodeId` the tree drives), with a visible outline on the selected element - this is what actually makes it a WYSIWYG editor rather than a JSON form with a tree on the side.

Verified: compiled CSS inspected directly (not just "no errors") to confirm the custom breakpoints/clamp/gradient utilities are actually present; both apps typecheck clean; migration-tool's 14 tests pass, including the updated `header-brick.test.ts` (`props.cssClass` assertions now check for Tailwind class substrings, and the CTA's `hidden` class).

### Whoobe Studio Alpha (github.com/swina/whoobe-studio-alpha-01): evaluated, partially adopted

The user asked to evaluate their own existing repo, `github.com/swina/whoobe-studio-alpha-01`, as a possible replacement for building Whoobe Studio from scratch - a real reversal of the earlier "design/build fresh" decision, worth taking seriously rather than dismissing. Investigated the actual code (not just the README), found via the public GitHub API and raw file contents:

- **Real capability**: a substantially more mature visual editor than this plan's from-scratch MVP - drag-drop placement, inline editing, animation config, responsive breakpoint switching, a floating toolbar, an 80,000+ icon library (Iconify), Pixabay/Cloudinary/URL media import, a reusable saved-block gallery. Not vaporware - genuinely more capable.
- **Real costs**: Vue 2.6 (EOL Dec 2023), Vue CLI/webpack (not Vite, despite the README claiming it), Tailwind 1.8, and - the biggest one - deep FeathersJS backend coupling: components call `this.$api.service('components').find(...)` directly with Socket.io event listeners wired into lifecycle hooks throughout, not behind one swappable layer. Using it for real would mean either standing up a real FeathersJS backend implementing matching services, or rewriting its data layer across many files. Plus real scope mismatch: Shopify Buy SDK, Snipcart, its own auth/project management - all irrelevant to editing CMS editables.
- Not actually abandoned despite the "Alpha 0.0.1 / May 2021" tag - confirmed via the GitHub API that it was pushed to as recently as 2026-02-14.

**Decision**: don't adopt the whole app or its backend - cherry-pick two small, genuinely self-contained pieces instead, ported to Vue 3:
- **Icon picker** (`IconPicker.vue`, new): a search box + grid against Iconify's public search API (`api.iconify.design/search`, no API key needed, 200,000+ icons) using `@iconify/vue`'s Vue-3-compatible `<Icon>` component. Ported the *pattern* from their `block.iconify.vue` (~35 lines, trivially portable), not the code itself (theirs was Vue 2 Options API tied to a Vuex-stored "current" node).
- **Media URL importer** (`MediaUrlImporter.vue`, new): paste a URL, get a live preview + dimensions via a native `Image()` load, confirm to use it. Matches what their `media.url.vue` actually does - it never fetches/re-hosts the image either, just references the external URL directly, which conveniently sidesteps any CORS concern about reading external image bytes.
- Both write into the selected node's `props` (`icon`/`src`) rather than introducing a new `WhoobeBlockNode` type - `props.icon` is checked as an explicit render signal (takes precedence over the normal type/tag dispatch) in both `StudioBlockPreview.vue` and `BlockNodePreview.vue`, so a chosen icon renders identically in the live editor preview and the dashboard's read-only Preview tab.

Verified: `@iconify/vue` installed in both apps; all 6 packages/apps typecheck clean; Iconify's search API confirmed reachable and returning real results; all new files confirmed compiling via both dev servers.

### Porting whoobe-studio-alpha-01's blocks/elements and common (21 of 31 candidate files)

Follow-up to the cherry-pick above: the user asked for `src/components/blocks` and `src/components/common` to be ported wholesale. Inventoried the real size first via the GitHub API before starting - **140 files / ~650KB in `blocks/`, 17 files / ~30KB in `common/`** - this is the source app's entire editor+preview engine (tree editor, a full visual Tailwind style-control system, drag-drop, sliders/carousels/popups/forms), not a peripheral feature. Presented this to the user with three scoping options; **chosen: port only `blocks/elements/` (14 files) + `common/` (17 files) now**, deferring the ~110-file `editor/`/`actions/`/`preview/` core (the actual block-tree editor and Tailwind control panels) to a later, separately-scoped pass - that core is where the deep Vuex/FeathersJS coupling really lives, and is a materially different size of undertaking.

**Ported (21 of the 31 files in scope), all converted from Vue 2 Options API + untyped `$attrs` access to Vue 3 `<script setup lang="ts">` with typed props, under `apps/whoobe-studio/src/ported/`:**

- `elements/`: `MokaAudioElement`, `MokaDownloadElement`, `FontIconElement` (Material/Bootstrap font glyphs - distinct from the Iconify-based `props.icon` already wired in), `MokaIframeElement`, `MokaInputElement`, `MokaTextareaElement`, `MokaSvgElement`, `MokaLinkElement` (external-link `target="_blank"` detection kept, the source's Vuex-dispatched `#popup?` link convention dropped - no popup state exists here), `WhoobeResponsiveMenu` (a *simplified* nav menu - the source's `moka.menu.responsive.vue`, not the separate, much larger `menu.vue` mega-menu, which recurses through `<moka-element>`/block trees and is really part of the deferred preview engine, not a self-contained element).
- `common/`: `BootstrapIcon`, `MaterialIconButton`, `WhoobeChip`, `LoadingOverlay`, `ToggleSwitch` (converted to a proper `v-model`, replacing the source's Vue-2-only mutate-a-prop-in-a-click-handler pattern), `RadioGroup`, `NavigationArrows`, `Modal` (draggable, slotted, configurable button rows - kept faithfully, no Vuex/Feathers coupling in the source), `ModalFullscreen`, `ConfirmDialog`, `DoubleRangeSlider` (dropped the source's `eventBus` global-event-bus import, a removed-in-Vue-3 pattern with no equivalent anywhere in this app - the component's own `@range` emit already carries the same payload), `ColorPalette` (uses Tailwind's own standard color names rather than porting the source's custom `tw.classes.js` data file).

**Skipped, and why** (the other 10 of 31): `img.vue`/`moka.video.vue`/`text.vue` (redundant - already covered by this app's existing type-based dispatch), `menu.vue`/`simple.svg.vue`/`Plugins.Wrapper.vue`/`plugin.wrapper.vue`/`supericon.vue` (not actually self-contained - deeply wired into the deferred ~110-file editor/preview engine via Vuex state and dynamic plugin imports), `login.vue` (redundant - this app has its own real auth already), `actions.vue` (core editor-engine glue, `editor.action`/`editor.subaction` Vuex-driven).

**Two real things found and fixed while porting, not just translated:**
- `ConfirmDialog`'s source (`confirm.vue`) never actually passed a `buttons` prop to its `Modal`, and `Modal`'s default (`buttons: 'none'`) renders no button row at all - the original dialog had no visible way to confirm or cancel. Fixed by passing `buttons="standard"`.
- `ColorPalette.vue` constructs classes via runtime string interpolation (`` `bg-${colour}-${shade}` ``) - a *different* Tailwind-scanning gap than the `@source` fix from the previous pass: this isn't a literal string anywhere for `@source` to find via file-scanning, since it's built at runtime. Fixed with Tailwind v4's `@source inline("bg-{...}-{100,...,900}")`, its explicit mechanism for classes that can never be found by scanning source text. Verified directly in compiled CSS output again, not assumed from "no errors."

Also added, needed for these ports to render actual glyphs: `bootstrap-icons` (npm, self-hosted font+CSS) in both apps; Material Icons via the same Google Fonts CDN pattern `admin-dashboard`'s `index.html` already used for the Inter font.

Wired into the live editor: `MokaAudioElement`/`MokaIframeElement`/`MokaSvgElement` extend `StudioBlockPreview.vue`'s existing tag-based dispatch (alongside the pre-existing `img`/`video`), following the exact pattern already established. The rest (download link, styled link, responsive menu, all `common/` UI atoms) are ready-to-use standalone components, not yet force-wired into any dispatch or brick mapping, since no current brick mapping produces the tags/data they'd need (e.g. nothing emits `tag: 'audio'` yet) - real when the next brick that needs one is mapped, not speculative scaffolding.

Verified: all 6 packages/apps typecheck clean; all 21 new files individually confirmed compiling via the running dev server; migration-tool's 14 tests still pass.

### Bricks-in-document outline (right pane)

The user pointed out something worth keeping in mind for the rest of the brick-mapping work: in Pimcore itself, each Areabrick is edited *in place* in the page - there's no separate "list of bricks" UI there, because `templates/areas/<brick>/view.html.twig`'s `{% if editmode %}` block *is* the editing surface, right where the brick renders. That's a different UX shape than a side-panel list, but a per-document outline is still useful here for navigation, so added one: a "Bricks in this Document" panel in Whoobe Studio's right column, above the field inspector - walks the tree for `areablock`-type nodes and lists their direct children (the actual brick instances, e.g. "Header (Hero Generico)", "Unmapped Brick: banner-brick"), clicking one sets the same `selectedNodeId` the tree and live preview already share. Deliberately coarser than the full node tree on the left, which includes every nested typography/media leaf too - this is brick-instance-level only, matching the granularity that's actually relevant when the question is "which bricks does this page have."

Confirmed as part of this: the center pane already renders each brick through its migrated Vue+Tailwind conversion (`StudioBlockPreview.vue` + the brick's registered converter, e.g. `header-brick.ts`) rather than a schematic view - exact visual/CSS fidelity to the original SCSS is *not* the bar for calling a brick's mapping done, matching how `header-brick` itself was scoped (structure and field-editability first, pixel-matching later if ever).

### header-brick's CSS, redone properly (not approximated)

Immediately followed by the user asking to actually get `header-brick` pixel-faithful, since it's the one real proof point available. The first pass (§ above) had flagged one open question explicitly: `.hero-generico` never declares `display:grid` in its own SCSS file, so `aside`/`header`'s `grid-area: content` looked unresolvable, and that pass substituted plain absolute positioning to get the same *visual effect*.

Chased it down this time: `assets/scss/base/_global.scss` has a global rule - `main section { display: grid; grid-template-columns: auto minmax(auto,1440px) auto; grid-template-areas: ". content ."; } .sb-wrapper { grid-area: content; }`. Since `.hero-generico` is itself a `<section>` inside `<main>`, it inherits this automatically. Both `aside` and `header` sharing `grid-area: content` means they land in the *same grid cell* and stack by DOM order (video painted first, text overlay on top) - genuine CSS Grid stacking, not a trick needing an absolute-positioning substitute.

Rewrote `header-brick.ts` to use the real technique: the outer `section` gets `grid grid-cols-[auto_minmax(auto,1440px)_auto]`, both `aside` and `header` get `col-start-2 row-start-1` (placing them in the same cell), `.sb-wrapper`'s own nested responsive grid (`tablet-p:grid-cols-[2fr_1fr]` / `tablet-l:grid-cols-[3fr_1fr]` / `desktop-sm:grid-cols-[4fr_1fr]`) is modeled as its own node rather than folded into `header`, and `hgroup`'s `place-self: end stretch` becomes Tailwind's built-in `self-end justify-self-stretch` (no arbitrary value needed - these are standard utilities). Verified this isn't just "no typecheck errors" the same way as the earlier `@source` gotchas: pulled the compiled CSS from both dev servers directly and confirmed `grid-template-columns: auto minmax(auto,1440px) auto`, `col-start-2`/`row-start-1`, `self-end`/`justify-self-stretch`, and the responsive `sb-wrapper` grid-column values are all genuinely present, not just referenced.

Re-ran `migrate-documents` (real write) so document 10's stored `cms_documents` row reflects the corrected mapping - the earlier absolute-positioning version is gone from the database, not just the source file.

### Editor becomes the default document tab, not a modal

The user then asked for a UX change: opening a document should land directly in the Whoobe Studio editor, with the read-only rendered-HTML view as a *sub-tab* named Preview - not a button that opens a modal. This is exactly the sub-tab pattern `MasterAssetTab.vue` already established for assets (Preview/Edit Image/Metadata/Thumbnails, all mounted via `v-show` inside one master tab) - documents were the odd one out, with editing behind a separate modal instead of being a sibling sub-tab.

- `tabsStore.ts`: added `DocumentSubTab = 'editor' | 'preview'` and a `documentSubTab` field on `MainTab`, mirroring `AssetSubTab`/`assetSubTab` exactly. `openDocument()` now defaults to `documentSubTab: 'editor'` - opening a document lands in the editor immediately, matching how opening an asset lands in Preview immediately (no extra click to get to the primary view either way).
- `WhoobeStudioEmbedModal.vue` → renamed `WhoobeStudioEmbed.vue` and stripped of all modal chrome (fixed overlay, backdrop, close button, its own header) - it's a plain panel now, always mounted inside the Editor sub-tab's content area, sized to fill it. Emits `saved` with the updated document record on every autosave (previously this only mattered for a close-triggered refetch; now `MasterDocumentTab.vue` listens and updates its own copy live, so switching to the Preview sub-tab always reflects the latest edit without a re-fetch).
- `MasterDocumentTab.vue`: added the Editor/Preview sub-tab nav bar (visually identical to `MasterAssetTab.vue`'s), both panels mounted via `v-show` rather than `v-if` - critical for the Editor specifically, since `v-if` would tear down and rebuild the iframe/bridge connection (and lose the `WhoobeHostBridge` listener) every time the user switched to Preview and back, not just hide it.

Verified: all 6 packages/apps typecheck clean; `MasterDocumentTab.vue`/`WhoobeStudioEmbed.vue`/`tabsStore.ts` confirmed compiling via the dev server; no remaining references to the old `WhoobeStudioEmbedModal` name anywhere in the codebase.

### Image references resolved fresh at render time, not baked in at migration time

The user asked how a brick's image reference (`header-brick`'s `backgroundImageSrc`/`src`, e.g. `/communication/Visore-campagna-25.jpg`) actually gets turned into something the browser can load, since the asset genuinely exists in the DAM (confirmed via `assets` table lookup - real S3 key, `is_public: true`).

**Diagnosis**: it didn't resolve to anything, because nothing was resolving it. `header-brick.ts`'s `resolveMediaUrl(imagePath, s3Prefix)` needs an `s3Prefix` to produce a real URL, but `cli.ts`'s call to `PimcoreDocumentConverter.convertDocument(rawDoc)` never passes one - `s3BucketPrefix` silently defaults to `''`, so the stored value has only ever been a bare relative path, never a URL.

The fix is **not** "pass a real `s3Prefix` at migration time and store the resolved URL" - presigned URLs for private-by-current-folderRules assets expire in ~1h (confirmed: this specific asset resolves to a *presigned* URL right now, `isPublic: false` per the caller's folderRules at resolution time, even though the DB's own `assets.is_public` column says `true` - the two are independently derived, see the earlier bucket-policy incident in the DAM implementation history for why). Baking either into `cms_documents.root_block`'s stored JSON would go stale, the exact reason `dam-schema.ts`'s own asset records never store URLs either - only stable paths, always resolved fresh.

**Fix**: added `resolve-display-url.ts` to both apps - a small, reactively-cached resolver that recognizes a raw Pimcore-style path (`/foo/bar.jpg`, not `http://`/`data:`) and resolves it via asset-processor's existing `/api/v1/dam/asset-urls` endpoint on demand, purely at render time, without ever mutating the node's own `props`/`style` (mutating them would let a resolved-but-expiring URL get autosaved back into storage on the next edit - checked for and deliberately avoided). Wired into both `BlockNodePreview.vue` (admin-dashboard) and `StudioBlockPreview.vue` (whoobe-studio, which had no asset-processor connection at all before this - added a minimal client) for `img`/`video` `src` and any `style.backgroundImage: url(...)`.

Verified end-to-end: confirmed the exact call pattern the new resolver uses (no `folderRules` param) against the real asset-processor, resolves successfully, and the resulting URL genuinely loads the image (HTTP 200); both apps typecheck clean; all changed/new files confirmed compiling via their dev servers.

**Known gap, not yet covered by this fix**: the ported `MokaAudioElement`/`MokaIframeElement`/`MokaSvgElement` components (whoobe-studio only) still read `node.props?.src` directly, unresolved - deferred since nothing currently exercises those tags with real unresolved paths; same fix would apply there once one does.

### `resolveMediaUrl` was stripping the leading slash even with no `s3Prefix`

The user reported the header-brick image still didn't load after the fix above. Root cause was one layer deeper: `resolveMediaUrl(path, s3Prefix)` in `pimcore-document-converter.ts` unconditionally ran `path.replace(/^\/+/, '')` - stripping the leading slash even when `s3Prefix` is falsy, which is the real case on every migration run so far (`cli.ts` never passes one). This produced stored values like `url(communication/Visore-campagna-25.jpg)` (no leading slash) instead of `url(/communication/Visore-campagna-25.jpg)` - confirmed directly via `SELECT root_block->...->'style' FROM cms_documents`. The new render-time resolver's `looksLikeRawPath()` heuristic requires that leading slash to recognize "this needs resolving"; without it, the value silently passed through completely unresolved.

Fixed: `resolveMediaUrl` now returns `path` unchanged (leading slash intact) whenever `s3Prefix` is empty, only stripping/rejoining in the with-prefix case. Added a regression test to `header-brick.test.ts` (15 tests passing, up from 14). Re-ran `migrate-documents --limit=2` to apply the fix to the real stored row.

**Side effect surfaced by this**: re-running the migration overwrote a manual edit the user had made in Whoobe Studio while troubleshooting (`Visore-campagna-25.jpg`, wired in directly via the props editor) - reverted to the real Pimcore-sourced field value, `Visore_2023.jpg`. That real value then turned out not to exist in this system's own DAM at all: `SELECT ... FROM assets WHERE pimcore_path = '/communication/Visore_2023.jpg'` returns zero rows, and asset-processor's `/api/v1/dam/asset-urls` endpoint returns a 200 with a presigned URL regardless (it doesn't check object existence before signing) - but the resolved URL itself 404s when actually fetched. This is a live confirmation of the still-open gap below: assets referenced by migrated documents are not themselves migrated into this system's S3 bucket yet, only the documents pointing at them are.

**Still explicitly NOT done**:
- Brick-specific converters for the remaining 42 discovered brick types (generic fallback only, so far) - `header-brick` is the first of 43.
- The deferred ~110-file `blocks/editor/`/`blocks/actions/`/`blocks/preview/` core from whoobe-studio-alpha-01 (the actual visual tree editor and Tailwind style-control panels) - not started, and a materially larger undertaking than this pass given the Vuex/FeathersJS coupling throughout.
- A `migrate-assets` CLI command that actually uploads Pimcore-referenced assets into this system's own S3 bucket/`assets` table - confirmed twice now (this section and the DAM image-resolution work above) to be the real blocker whenever a migrated document's image doesn't load, as distinct from a resolution-logic bug.

### Snippets, and explicit Save as Draft/Save and Publish

Two related additions the user asked for next. First, a terminology change: the "Bricks in this Document" outline panel (§ above) is now labeled "Snippets in this Document" throughout the UI - same underlying walk of `areablock`-type nodes' direct children, just renamed (`BrickSummary`/`collectBricks` → `DocumentSnippetSummary`/`collectDocumentSnippets` in `App.vue`) to match. Second, and distinct from that per-document outline: a genuinely new, persisted **snippet library** - "Save as Snippet" in the field inspector prompts for a name and an icon (reusing the existing `IconPicker.vue` Iconify search modal, via a new `SaveSnippetModal.vue`), then POSTs the currently selected node - itself plus its full `children` subtree, exactly as `WhoobeBlockNode` already nests them - to a new `cms_snippets` table (`packages/core/src/db/snippet-schema.ts`/`snippet-records.ts`, `POST`/`GET`/`DELETE /snippets` in `apps/core-api`). Whoobe Studio calls core-api directly for this (new `snippets-api.ts` client, port 3003) rather than round-tripping through the dashboard/bridge - it already does the same direct-fetch-with-credentials thing for asset-processor (`resolve-display-url.ts`), and a saved snippet doesn't need the host's `currentDocument` state the way document autosave does.

Third: `cms_documents.status` already existed (`'draft'`/`'published'`, defaulting to `'draft'`) but nothing ever set it - the editor's autosave loop only ever touched `title`/`rootBlock`. Added explicit **Save as Draft**/**Save and Publish** buttons to `MasterDocumentTab.vue`'s header, next to the status badge. Both resend the tab's current `title`/`rootBlock` (kept live-accurate by the existing autosave-driven `onSaved` callback) alongside the new `status` via a new `documentsStore.setDocumentStatus()`, deliberately separate from `updateDocument()` (the autosave path) so a keystroke can never flip a document's published status by accident - the PATCH route's `status` field is entirely optional and left untouched when absent. Transitioning to `'published'` specifically requires the pre-existing `objects:publish` permission (already defined, already granted to the `editor` role) in addition to the route's base `objects:write` gate - checked inline in the route handler rather than via a second `requirePermission` wrapper, since the same route serves both the always-allowed draft-save and the publish-gated case depending on request body.

Verified end-to-end via curl against a minted session: `POST /snippets` creates and `GET /snippets` lists a real row; `PATCH /documents/:id` with no `status` leaves it untouched, with `status: 'published'` flips it, with `status: 'draft'` reverts it. (One process note: a test PATCH used a stub `rootBlock` and briefly overwrote document 10's real content in `whoobe_db` - caught immediately and restored via `migrate-documents --limit=2` before moving on; worth remembering that this PATCH route has no revision history, so any manual test against a real document id must resend real content, not a placeholder.) All 6 packages/apps typecheck clean.

**Still explicitly NOT done**: no UI yet to browse/insert a saved snippet back into a document (`listSnippets`/`GET /snippets` exist and are usable, but nothing in Whoobe Studio calls them) - the user asked to build saving first and "see if they can be reused," matching the same wait-and-see scoping applied earlier to the ported alpha components.

---

## 1. Correcting the Existing Documentation First

`docs/WhoobeStudio-Integration.md` checks off Phases 1–6 as done and describes `apps/admin-dashboard` as React/Next.js. Neither is accurate, and planning on top of it as-is would misdirect the work:

- **`apps/admin-dashboard` is Vue 3 + Vite + Pinia**, not React/Next.js. The doc's entire "bridge connects two different frameworks" framing (§2.1) doesn't apply to this codebase — it's Vue talking to Vue.
- **`apps/whoobe-studio` is not a Vue app.** Its `package.json` has no `vue` or `vite` dependency; `dev` is literally `tsc --watch`. It contains only postMessage protocol types (`bridge.ts`, `bridge/postmessage.ts`) — real and useful, but there is no visual editor UI anywhere in the repo. `WhoobeStudioEmbedModal.vue` (itself currently unused/unimported by any view) points its iframe at a hardcoded `http://localhost:5173` that nothing serves.
- **The Pimcore MySQL extractor is a stub.** `packages/migration-tool/src/extractors/mysql.ts`'s `extractPimcoreObjects()` logs a message and returns `[]`. It has no DB client dependency at all.
- **The migration CLI runs against a hardcoded sample document**, not real data (`cli.ts`'s `migrate-documents` case constructs a `PimcoreRawDocument` literal inline).
- **There is no persistence layer** for converted content — only `auth-schema.ts` and `dam-schema.ts` exist under `packages/core/src/db/`. Nothing like `cms_documents` exists yet.

What *is* real and directly reusable: `packages/core/src/cms/block-schema.ts` (a tested Zod schema for `WhoobeBlockNode`/`WhoobeDocumentLayout`) and `packages/migration-tool/src/pimcore-document-converter.ts` (a tested converter from an in-memory `PimcoreRawDocument.elements` map to a `WhoobeBlockNode` tree, including recursive Areablock handling). Both are legitimate building blocks — the gap is entirely in what feeds them real data, where results are stored, and what actually renders/edits them.

Fixing the doc's false-done checkmarks and framework claim is Phase 1 below — cheap, and prevents the next person (or the next session) from trusting phases that never actually happened.

---

## 2. Scope & Non-Goals

**In scope**: real extraction of Pimcore Documents and their editables (including Areablock/Areabrick contents) from a live Pimcore MySQL database; conversion to `WhoobeBlockNode` trees; Postgres persistence for the converted trees; a real (non-mock) Documents admin UI to browse imported content; a minimal-but-functional Whoobe Studio Vue 3 app to edit it; wiring the existing (already-written) postMessage bridge to that real app.

**Out of scope for this plan**: Pimcore Class/Data Object migration (`migrate-classes`/`migrate-assets` — different data model, different CLI command, own plan if/when needed) — this is scoped to **Documents and their editables only**, matching what was asked. Also deferred: the full feature list from the old doc's §3–4 (Tailwind visual style inspector, micro-animations, reusable snippet library, multi-locale switching UI, SSR/SSG universal renderer) — these are real, sensible future features, just not needed to get the core loop (import → persist → browse → edit → save) working end to end. Build that loop first; layer polish on afterward.

---

## 3. Phase 0 (Spike): Ground the Converter in Real Pimcore Data

Before writing a single line of "real" extractor code, connect to the live Pimcore MySQL database (a read replica if one exists — this should be read-only reconnaissance, not run against anything that matters if a query goes wrong) and inspect, for a handful of real documents:

- **Pimcore version.** Editable storage has changed shape across major Pimcore versions, and the exact column layout of `documents_elements` (and whether Areablock configuration lives inline in that table or in a separate structure) depends on it. Don't assume — check.
- **The raw `data` column contents for one real Areablock editable.** Pimcore has historically stored this as a PHP `serialize()`'d array (brick index, brick type name, hidden flag, per-brick config), not JSON. If that's what's found here, a PHP-serialization parser needs to be added as a dependency (e.g. `php-serialize` on npm) — nothing in this repo currently deserializes PHP data, and `PimcoreDocumentConverter`'s tests only ever hand-construct clean, already-parsed `PimcoreEditableElement` objects, so this step has never actually been exercised against real data.
- **The actual Areabrick type names in use** (the `type` value inside each brick config), and, if the source Pimcore instance's filesystem/codebase is also reachable, the Areabrick PHP class + template directory (`.../areas/<brickname>/`) for each — Pimcore lets every Areabrick define its own arbitrary field set, so there is no way to build a complete brick→block mapping table from documentation alone. It has to be grounded in what this specific instance actually uses.

**Deliverable**: a short findings note (a sibling file, `docs/plans/cms/pimcore-schema-findings.md`) recording the real schema, the real serialization format, and one fully worked real example (raw row → parsed editable → converted `WhoobeBlockNode`) — written before any Phase 1 code, so Phase 1 is built against reality rather than the illustrative examples in the old doc (Hero Banner / Feature Grid / Testimonial / FAQ, none of which are confirmed to exist in the actual source content).

---

## 4. Phase 1: Real MySQL Extractor

- Add a MySQL client (`mysql2`) as a dependency of `packages/migration-tool` — nothing currently pulls one in.
- Replace `extractors/mysql.ts`'s stub with real queries:
  - `listDocuments(config)` — walks the `documents` table (`id`, `parentId`, `type`, `key`, `path`), filtered to `type IN ('page', 'snippet')` (folders and links don't carry editables and aren't page content).
  - `getDocumentElements(documentId)` — queries `documents_elements` for a given document ID and returns `PimcoreEditableElement[]`, after running each row's `data` column through the new parser below.
- New module, `PimcoreSerializedDataParser` — turns the raw per-type `data` column contents into the shape `PimcoreDocumentConverter` already expects (a plain string for `wysiwyg`/`input`, `{ path, alt }` for `image`, an array of `{ type, data }` for `areablock`, etc.). This is the connective tissue the current stub never needed and the converter's tests never covered.
- Extend `PimcoreDocumentConverter.convertEditableToBlockNode`'s `areablock` case with a `PIMCORE_BRICK_TO_WHOOBE_BLOCK` lookup table, keyed by the real brick names found in Phase 0, once those are known — each entry maps a specific brick's fields to a tailored `WhoobeBlockNode` shape instead of falling through the current generic recursive default.

---

## 5. Phase 2: Persistence Layer

New `packages/core/src/db/cms-schema.ts` (Drizzle), following the exact pattern already established by `dam-schema.ts`/`auth-schema.ts`:

```
cms_documents   id, pimcore_id (nullable — provenance/idempotency key for re-imports),
                title, slug, locale, root_block (jsonb), metadata (jsonb),
                status ('draft' | 'published'),
                created_at, updated_at
```

- `root_block`/`metadata` are stored as `jsonb`; `WhoobeDocumentLayoutSchema`/`WhoobeBlockNodeSchema` (already-written Zod schemas) validate at the read/write boundary rather than trusting the column's contents blindly — the database is just storage, the schema package remains the source of truth for shape.
- `status` is deliberately the same two values (`draft`/`published`) as `docs/plans/backend/object-publish-workflow-plan.md`'s not-yet-built draft/publish model, so this slots into that workflow when it lands instead of inventing a second, competing status concept.
- Register the new schema file in `drizzle.config.ts`'s schema array (a one-line addition, exactly like the existing entries for `dam-schema.ts`), so migrations for it are picked up by the already-working `bootstrapDatabase()` migration-on-boot flow — no separate bootstrap path needed.
- New `packages/core/src/db/cms-records.ts` — `listDocuments`, `getDocumentBySlug`, `upsertDocumentRecord`, `deleteDocumentRecord`, mirroring `asset-records.ts`'s conventions (upsert-by-natural-key, metadata preserved unless explicitly overwritten).
- Exported from `packages/core/src/server.ts` (the Node-only barrel), not `index.ts` — these touch `pg`, same reasoning as the existing DAM/auth records.

---

## 6. Phase 3: Wire the Real ETL

- `packages/migration-tool/src/cli.ts`'s `migrate-documents` command stops constructing a sample document inline. It takes source-DB connection info (flags or a `.env`, matching the env-var convention already used by `apps/core-api`/`apps/asset-processor`), walks all documents via Phase 1's extractor, converts each through `PimcoreDocumentConverter` (extended per Phase 0/1's findings), and persists via Phase 2's `upsertDocumentRecord` against the target (Whoobe) Postgres database.
- Idempotent by `pimcore_id`: re-running the migration updates existing rows rather than duplicating them, matching how `upsertAssetRecord` already handles re-uploads.
- A `--dry-run` flag that prints the converted tree without writing — cheap to add, and the way to verify the real extractor against Phase 0's worked example before trusting it with bulk writes.

---

## 7. Phase 4: Real Documents Admin UI

- `apps/core-api` gains `GET /documents`, `GET /documents/:slug`, `PATCH /documents/:slug`, permission-gated the same way DAM endpoints already are (reusing `requirePermission` — add `documents:read`/`documents:write` permission keys alongside the existing `assets:*`/`objects:*` ones).
- `views/DocumentsView.vue` (currently a static mock) becomes a real list view, following the pattern already proven out in `AssetsView.vue`: grid/list toggle, one tab per opened document via `tabsStore` (a new `MasterDocumentTab.vue`), with Preview (read-only rendered tree) and Edit (the Whoobe Studio embed, Phase 5) sub-tabs.
- New components live under `components/documents/`, following the object-type-folder convention just adopted for `components/dam/` — `MasterDocumentTab.vue`, a read-only tree renderer, and whatever list/detail panels this needs, kept separate from the DAM components rather than mixed in with them.

---

## 8. Phase 5: Whoobe Studio — Build Fresh (MVP Scope)

With no external repo to vendor, this scopes a real but deliberately minimal Vue 3 app rather than the old doc's full feature list:

- Convert `apps/whoobe-studio` from a `tsc`-only package into an actual Vite + Vue 3 app — add `vite`, `vue`, `vite.config.ts`, `index.html`, `src/App.vue`, `src/main.ts`, none of which currently exist.
- **MVP editor capability**: render the `WhoobeBlockNode` tree received via `SYNC_DOCUMENT`; select a node and edit its `content`/`props` through a plain form panel; reorder or delete children; emit debounced `UPDATE_DOCUMENT` messages back. The bridge protocol for all of this (`bridge/postmessage.ts` on the Studio side, `whoobe-host-bridge.ts` on the dashboard side) is already written and the two sides already agree with each other — only the actual Vue app consuming it is missing.
- **Explicitly deferred from the MVP**: drag-and-drop reordering (start with up/down buttons on each node), the Tailwind visual style inspector, micro-animations, the reusable snippet library, and multi-locale switching UI. All real, sensible features — just not required to prove the import→edit→save loop works.
- **Fix postMessage origin validation while this becomes a real, running integration.** Both `bridge.ts` and `whoobe-host-bridge.ts` currently default to/accept a wildcard target origin and don't validate `event.origin` on receive. This was flagged in the original security review and never fixed because there was no real embedded app yet to make it concrete; there will be one after this phase, so it stops being a theoretical finding.
- Wire the existing (currently unused) `WhoobeStudioEmbedModal.vue` into the new Documents Edit sub-tab from Phase 4, pointing `studioUrl` at the real dev server via a hostname-derived default (matching the existing `getDefaultAssetProcessorUrl()` pattern used everywhere else for `develop.local`), not the current hardcoded `localhost:5173`.

---

## 9. Sequencing & Dependencies

Phases 0 → 2 → 1 → 3 can proceed independently of Phase 5 — imported, persisted content is useful and inspectable (via Phase 4's read-only Preview) before any editor exists. Persistence is sequenced before extraction so Phase 1's `--dry-run` output has somewhere real to eventually land once trusted, and so Phase 3 isn't blocked waiting on schema decisions made in parallel.

Phase 5 (the editor) is the largest and most open-ended piece and can start in parallel with Phase 1 once Phase 2's `WhoobeBlockNode` contract is settled — Whoobe Studio only needs to agree on that shape, not on how it was populated. It doesn't need to wait for real Pimcore data to make progress; it can be built and tested against `createEmptyWhoobeDocument()`/the existing preset helpers in `block-schema.ts` first, then validated against real imported documents once Phase 3 exists.

**Recommended order**: 0 → 2 → 1 → 3 → 4 → 5.

---

## 10. Open Questions / Risks

- **Areabrick field sets are open-ended.** Every Areabrick is an arbitrary PHP class with its own fields; the brick→block mapping table from Phase 0/1 will need to grow incrementally as new brick types turn up in real content. There's no way to enumerate the full set from the database alone — a filesystem inventory of the source instance's `areas/` directory (if reachable) should happen alongside the Phase 0 DB spike, not instead of it.
- **The draft/publish workflow this plan's `status` column expects doesn't exist yet either** — it's still just `docs/plans/backend/object-publish-workflow-plan.md`. `cms_documents.status` is shaped to slot into that model once built, not to duplicate a competing one; if that plan changes shape before this lands, this schema should follow it.
- **Locale handling.** `WhoobeDocumentLayoutSchema` has one `locale` field per document, implying one `cms_documents` row per locale per page. This likely matches how Pimcore itself stores localized document trees (typically one tree per locale), but Phase 0 should confirm against the real instance rather than assume.
