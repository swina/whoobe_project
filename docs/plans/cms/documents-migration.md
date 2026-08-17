# Documents Migration (PIMCORE MIGRATION)

## 0. Terminology

- **Documents** = Pimcore Documents. In Pimcore, a "document" is ultimately a **page** built out of
  area blocks ("bricks" — reusable element blocks) rendered by Twig templates. The term "Documents"
  in this CMS's UI refers to the *initial association* to that Pimcore concept: the first attempt to
  import Pimcore content stored it in `cms_documents` as `WhoobeBlockNode` trees, editable in the
  `whoobe-studio` app.
- **Pages** = this CMS's real, published website pages: `whoobe_pages` (`packages/core/src/db/
  whoobe-pages-schema.ts`), holding an `Element` tree, SEO/sitemap/search metadata, per-locale rows,
  translation groups, publish state, and `pimcore_id` provenance. Edited in `whoobe-one-spike`.

**This plan migrates Pimcore Documents → Pages.** The product direction is settled
(`whoobe-one-editor-integration-plan.md` §1/§3): whoobe-one-spike is *the* page composer, and Pimcore
migration is a backend-only import plugin. It writes converted documents straight into `whoobe_pages`,
not `cms_documents`; `cms_documents`/`WhoobeBlockNode`/`whoobe-studio` are legacy and get retired
(§3 Phase 6).

## 1. Current state (verified 2026-08-14)

The migration pipeline exists and has run against real data. Per the live DB:

- `whoobe_pages`: **17 rows** — 11 migrated from Pimcore (`pimcore_id` set, e.g. `/`,
  `/it/area-comunicazione/`, `/it/shared/header/`, `/it/magazine/`), 6 authored/AI/test rows.
- `cms_documents`: **2 rows** (legacy first-pipeline content, docs 1 and 10).

Working, end to end:

- **Source extraction** (`packages/migration-tool`): `PimcoreSourceAdapter` plugin architecture
  (`source-adapter.ts`), real `mysql` adapter (`adapters/mysql-adapter.ts`, `documents_editables`,
  PHP `serialize()` decoding in `pimcore-serialized-data.ts`), `fixture` adapter for tests.
- **Conversion**: `PimcorePageConverter` (`pimcore-page-converter.ts`) turns a Pimcore document into
  an `Element` tree (`WhoobeOneElementNode`). Slug resolution composes `path` + `key`
  (`resolveDocumentSlug`), fixing the real "path is the parent's path" Pimcore quirk. Unregistered
  brick types fall back to a generic container (content preserved); `href`/`multihref`/`snippet`
  editables become clearly-labeled placeholder nodes.
- **Brick mapping registry**: `registerElementAreabrickConverter` / `element-areabrick-mappings/`.
  One real brick mapped so far: `header-brick` (from its actual Twig source).
- **Persistence**: `upsertWhoobePageByPimcoreId` (`whoobe-pages-records.ts`), idempotent by
  `pimcore_id`, never touches `published`/`workflowState` on re-import.
- **CLI**: `migrate-documents` (`cli.ts`) drives adapter → converter → `whoobe_pages`; flags
  `--dry-run`, `--source=`, `--limit=`.
- **UI**: `PagesView.vue` + `MasterPageTab.vue` (Editor/Settings/Preview), `WhoobeOneEmbed.vue`
  embedding whoobe-one-spike (`:3006`); `/whoobe-one/pages` CRUD; public serving via
  `GET /public/pages/:locale/*`, `/public/sitemap.xml`, `/public/robots.txt`, `/public/search`.
  Legacy `DocumentsView`/`MasterDocumentTab`/`whoobe-studio` still run alongside (Phase 6 removes them).

Pilot result (integration plan §8 Phase 5): full `--dry-run` of the 117-document real site converted
0 failures; a real `--limit=10` write succeeded 10/10 with distinct slugs.

## 2. Scope & non-goals

**In scope**: completing the Pimcore Documents → Pages migration for the real site — asset migration,
brick mappings, metadata, a full-site run, validation, and retiring the legacy documents path.

**Non-goals** (each is its own plan/concern, not this one):
- Data Object/class migration (`migrate-classes`, `migrate-objects`) — separate CLI commands.
- Pimcore document *snippets* → whoobe-one-snippets (a real migration of its own; currently a
  placeholder node).
- `href`/`multihref` data-object relations (deferred by the integration plan's §5 data-binding
  design; placeholder for now).
- Production deploy/SSR (website-serving plan, not this one).

## 3. Phases

### Phase 1 — Asset migration (`migrate-assets`) ✅ BUILT (2026-08-16)

> **Status**: implemented on `feat/08-16/pimcore-documents-migration`. `migrate-assets` walks the same documents `migrate-documents` walks, collects the asset paths those documents actually reference (top-level image/video editables plus image/video fields nested inside areablock bricks), then for each path reads the real bytes from the source install's filesystem (`PIMCORE_VAR_ASSETS_PATH`) and uploads them via `S3AssetStorageProvider` + `upsertAssetRecord`, creating `folders` rows for the ancestor chain. Supported on the adapter layer via optional `listAssets()`/`readAssetFile()` (mysql + fixture). Flags: `--dry-run`, `--source=`, `--limit=`, `--public`. **Still to do**: a real (non-dry-run) run against the live site, then re-run `migrate-documents` as the plan's own next step.
>
> **Also built (same session): the staged, review-then-promote document workflow.** `migrate-documents --staging` lands converted pages in a new `whoobe_pages_staging` table (schema `whoobe-pages-staging-schema.ts`, Drizzle migration `0029`) instead of touching the live pages table; `promote-staging` copies those rows into `whoobe_pages` via the same `upsertWhoobePageByPimcoreId` primitive the direct path uses (so a promoted page is byte-identical to a directly-migrated one), idempotent by `pimcore_id`, never touching `published`/`workflowState`. Exposed in the backend (`apps/core-api`): `POST /migration-sources/:id/import-documents` (`staging` flag), `POST /migration-sources/:id/promote-documents`, `GET/DELETE /whoobe-one/pages/staged` for review, plus the admin `MigrationSourcesCard.vue` Import Documents (stage) / Promote Staging controls. Shared logic: `runDocumentMigration`/`runPromoteDocuments` in `packages/migration-tool` (exported from its `index.ts` like `runClassMigration`/`runObjectMigration`).
>
> **Review UI added (same session): `PagesView.vue` now has a Pages/Staged mode toggle.** "Staged" lists every `whoobe_pages_staging` row (from `GET /whoobe-one/pages/staged`), with per-row Promote/Discard, a Promote All button, and a detail drawer showing the converted `content` JSON - so an admin can inspect what an import produced before promoting. A source-agnostic `POST /whoobe-one/pages/staged/promote` route (wrapping `runPromoteDocuments`) backs the panel's actions so they don't require a migration-source id.
>
> **Promote safety guard (same session): never overwrite a live published page.** Both `runPromoteDocuments` and `runPromoteDocument` now consult `findPublishedWhoobePageConflict` (whoobe-pages-records.ts) before upserting - it returns any `published: true` page whose `pimcore_id` matches the staged row OR whose `slug` path matches it (slug matched regardless of locale because migrated rows are still hardcoded `locale: 'en'` - Phase 3 - while real published pages may be `it`), and the promote is skipped with a clear failure message instead of silently clobbering an editor's published edits. **The same guard was then extended to `runDocumentMigration`'s direct (non-staging) write path** (and thus `/migration-sources/:id/import-documents` with `staging: false`) - the direct path previously overwrote published pages by design; staging is exempt since it never touches `whoobe_pages`. This is the concrete fix for the §5 "re-running overwrites content" risk across both write paths.

Assets referenced by migrated documents (image/video editables resolve to Pimcore paths like
`/communication/Visore_2023.jpg`) are **not** copied into this system's S3/DAM. The dashboard preview
and whoobe-one-spike resolve them at render time via `/api/v1/dam/asset-urls`, but a
`looksLikeRawPath()` value 404s unless the asset exists in this system's own bucket (confirmed: the
asset does NOT exist there). Build `migrate-assets` (`cli.ts` already lists it as "not yet built"):
walk `assets` referenced by migrated documents, upload to MinIO (`whoobe-cms` bucket), insert/upsert
`assets` rows (path-keyed, reusing DAM conventions), then re-run `migrate-documents` so stored
content matches the migrated asset paths. *This is the single biggest correctness blocker for the
real site.*

### Phase 2 — Brick mappings for the remaining types
The real site uses **42 distinct brick types** (496 instances); only `header_brick` (41 instances)
is mapped. Everything else converts through the generic dashed-border fallback — content survives,
real layout does not. Per-brick work, in the same style as `header-brick.ts`: read the brick's real
`view.html.twig` **and** any component template it delegates to, confirm each field is actually
rendered, and hand-port the SCSS to Tailwind utilities (both apps' `style.css` already have the
`@source` glob covering `packages/migration-tool/src/**/*.ts`). Prioritize by instance count.

### Phase 3 — Document metadata (title/locale/SEO)
Current converter gaps, confirmed by inspection:
- **Title**: `listDocuments` (mysql adapter) selects no `title` column, so `title` falls back to
  `key` — real rows are literally named after their `key` (`area-comunicazione`, `footer`, …).
  Confirm whether this Pimcore instance stores page titles in `documents` (e.g. `title`/`description`
  columns or a properties/editable) and map them to `title` + `seo.metaTitle`.
- **Locale**: `PimcorePageConverter` hardcodes `locale: 'en'`; the live site is mostly Italian under
  `/it/`. Derive the target `locale` from the document tree (Pimcore stores localized trees as sibling
  subtrees, typically `/{locale}/…`), matching how `/it/magazine/` should be `it`, not `en`. Map to
  `translationGroupId` for sibling-locale pages.
- **SEO/sitemap/search**: seed `seo` (meta title/description), `sitemap.included`, `search.indexable`
  from Pimcore document properties where present; default sensibly otherwise.
- **Publish state**: migrated pages arrive as `published: false`. Decide (config flag?) whether a
  full-site migration should publish anything by default, or leave the explicit Save/Publish UX in
  charge.

### Phase 4 — Full-site migration run
Re-run `migrate-documents` across all 117 real documents (no `--limit`), dry-run first, then real.
Then verify: distinct slugs, translation-group wiring, asset URLs actually load, and a sample of
pages render in the whoobe-one-spike editor and the public path.

### Phase 5 — Validation
- All migration-tool tests (currently 53) + typecheck across all 6 packages/apps.
- Interactive browser pass: open `/pages`, open a real migrated page, edit in the embedded
  whoobe-one-spike editor, save, re-open, preview, and hit the public URL.
- Asset-resolution check: every image/video on migrated pages loads over HTTP.

### Phase 6 — Retire the legacy documents path
After validation: archive `whoobe-studio` (stop running the live app, keep git history), remove
`DocumentsView.vue`, `MasterDocumentTab.vue`, `WhoobeStudioEmbed.vue`, the Documents nav entry and
`/documents` endpoints, and drop `cms_documents`/`WhoobeBlockNode` (`cms-schema.ts`/`cms-records.ts`,
`block-schema.ts`) once nothing reads them. This is gated on Phase 4/5 proving the new path (per the
integration plan's own Phase 5 gate) — do NOT delete the only working Documents UI before then.

## 4. Sequencing & dependencies

Phase 1 first (it unblocks correct rendering of everything else), then Phase 2 and Phase 3 in parallel
(independent), then Phase 4 → 5 → 6. Phase 6 strictly last.

## 5. Open questions / risks

- Whether page titles live in Pimcore's `documents` table or in editables/properties — confirms Phase
  3's title mapping. Phase 0-style check against the live instance.
- Locale derivation: assuming the document tree encodes locale via path prefix needs confirming
  against the real tree (`/`, `/it/`, `/en/`?).
- Per-brick mapping cost is real and scales with site brick count (42 here); generic-fallback
  content survives but layout does not, so "migrated" ≠ "visually identical" until Phase 2.
- The publish-default question (§3 Phase 3) is a product call, not a technical one.
- Re-running `migrate-documents` overwrites `content` (not `published`) — safe, but an editor's
  manual content edits on a migrated page get clobbered by the next import; note it, don't fix it here.
