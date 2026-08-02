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

**Explicitly NOT done, and why**:
- **Phase 0 (the live-schema spike) has not run.** There is no live Pimcore MySQL connection available in the environment this was built in. The MySQL adapter's table/column assumptions (`documents`/`documents_elements`/`assets`, the specific key names inside a serialized Areablock slot entry, the naming convention for a brick's sibling sub-field rows) are built against documented/historically-stable Pimcore behavior, **not confirmed against a real instance**. Every one of those assumptions is isolated behind a small, named, overridable piece (config overrides on the adapter, `parseAreablockSlotList`, `matchesAreablockSlot`) specifically so that confirming/correcting them against real data is a small, contained change, not a rewrite — but they are still assumptions until Phase 0 actually runs.
- Phases 4 (Documents admin UI) and 5 (Whoobe Studio editor app) are unstarted.

**To actually run this against a real Pimcore instance**: set `PIMCORE_DB_HOST`/`PIMCORE_DB_PORT`/`PIMCORE_DB_USER`/`PIMCORE_DB_PASSWORD`/`PIMCORE_DB_NAME` (via env or `packages/migration-tool/.env`), then `pnpm --filter @pimcore-custom/migration-tool exec tsx src/cli.ts migrate-documents --dry-run --limit=5` first. Treat the first real run as Phase 0 by another name — read its output against a few pages you know the content of, and fix whichever of the assumptions above turns out wrong before dropping `--dry-run`.

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
