# Changelog

All notable changes to the Whoobe CMS project.

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