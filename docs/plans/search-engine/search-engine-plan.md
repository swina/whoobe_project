# Search Engine — Plan (Postgres-native)

**Status:** Draft · **Branch:** `dev/08-14/various-features` (or dedicated `search-engine` branch)

## 1. Context & Goals

The CMS stores all content in a single external Postgres database: pages in `whoobe_pages` (whole Element tree in one jsonb `content` column) and class instances in `data_objects` (all field values in one jsonb `attributes` column, shaped by `data_classes.fields`). There is **no search today**: dashboard filters are client-side in-memory, `whoobe_pages.search.indexable`/`keywords` are stored but never queried, and no FTS/trigram infrastructure exists anywhere in the repo.

Goals:
1. Full-text search across **pages** and **classes** (instances + definitions), respecting `published`, `locale`, `websiteId`, and the per-page `search.indexable` flag.
2. A **headless API** (`/public/search`) usable by any frontend — the contract for the website search box today (rendered in whoobe-one-spike) and for the future SSR renderer package (`@whoobe-cms/whoobe-renderer`, per `docs/plans/website/website-structure-plan.md` Phase 3).
3. An **admin API** (authed) + wiring of the currently decorative global search input in the dashboard.
4. Zero new infrastructure: Postgres FTS + `pg_trgm`, consistent with the project's "hybrid EAV + JSONB" design and existing infra (DB at `develop.local`, MinIO for files only).

## 2. Decision: Postgres-native (tsvector + pg_trgm) vs external engine

**Chosen: Postgres-native.**

| | Postgres (tsvector + GIN + pg_trgm) | External engine (Meilisearch/Typesense) |
|---|---|---|
| Infra | none (extension only) | new always-on service, sync pipeline, secret management |
| Consistency | transactional with content writes | async sync lag, failure modes |
| Ranking | `ts_rank_cd` + trgm similarity (good enough) | superior (typo tolerance, facets) |
| Cost | 0 | hosting + ops |

`pg_trgm` GIN on title/path gives the typo-tolerant prefix/fuzzy behavior that makes "simple" config adequate across locales. Facets can be added later by filtering on `payload`/`keywords` jsonb. Documented upgrade path: per-locale `regconfig` mapping (en→english, it→italian…) via reindex if stemming quality demands it.

### Evolution path: hybrid semantic search (V2, pgvector)

**V1 is deliberately lexical (tsvector + pg_trgm). V2 adds semantic search on top, not instead — the index stays the single `search_documents` projection, extended with two columns:**

```sql
ALTER TABLE search_documents ADD COLUMN embedding vector(1536);  -- dim depends on model
ALTER TABLE search_documents ADD COLUMN embedding_model text;    -- for invalidation/reindex
CREATE INDEX search_documents_embedding_hnsw ON search_documents
  USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;
```

- **Embedding source**: new `/embeddings` capability in `packages/core/src/ai/providers.ts` (OpenAI-compatible; OpenAI `text-embedding-3-small` baseline — note Zen may not expose embeddings, OpenRouter does). Model + dimension stored per row; a model switch invalidates and triggers `reindexAll()`.
- **Index time**: indexer embeds title + excerpt + body (truncated, ~8k chars) at write time through the provider layer, with graceful degradation (429/5xx → index without embedding, V1 lexical still works; backfill via reindex).
- **Query time**: hybrid retrieval + **RRF fusion** (reciprocal rank fusion, ~10 lines):
  `score = 1/(60 + rank_lexical) + 1/(60 + rank_semantic)` — no fragile weight tuning; `ts_rank_cd` / cosine `<=>` only decide the per-leg ordering. `query.ts` keeps the fusion step pluggable so V2 is one new module, not a rewrite.
- **Why pgvector is not in V1**: extension must be installed on the external DB (`develop.local` — infra change vs `pg_trgm` which ships with Postgres), embedding API calls add write-path latency/cost/rate-limit failure modes, and embeddings regress on exact identifiers (class names, keys, slugs) that admin search depends on. Lexical first, semantic as a documented, additive layer.
- **Multilingual note**: embeddings sidestep the `simple`-config stemming limitation; if recall for a locale disappoints in V1, V2's semantic leg covers it without per-locale `regconfig` work.

## 3. Architecture

```
                      ┌───────────────────────────────┐
                      │   Postgres (whoobe_db)        │
                      │  whoobe_pages  data_classes   │
                      │  data_objects                 │
                      └──────────────┬────────────────┘
                                     │ single-writer records layer
                                     ▼ (hooks after create/update/delete/publish)
                      ┌───────────────────────────────┐
                      │  Search indexer (packages/core)│
                      │  extract → weight → upsert     │
                      └──────────────┬────────────────┘
                                     │
                                     ▼
                      ┌───────────────────────────────┐
                      │  search_documents             │
                      │  (tsvector gen column + GIN,  │
                      │   trgm GIN on title/path)     │
                      └──────────────┬────────────────┘
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
GET /public/search           GET /whoobe-one/search      POST /whoobe-one/search/reindex
(headless, no auth,          (admin, OBJECTS_READ,       (admin, OBJECTS_WRITE, full rebuild)
 published + indexable)       includes drafts)
        │                           │
        ▼                           ▼
Website search UI             Dashboard global search
(SearchBox.vue +              (wire existing input,
 SearchResultsView.vue,        dropdown + navigation)
 route /search in spike)
```

**Key principle:** the index is a *projection* of content, never a source of truth. All writes flow through the records layer (single writer), which is where hooks live; a `reindex` endpoint heals drift at any time.

## 4. Data model (migration `0021_*`)

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE search_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type  text NOT NULL CHECK (document_type IN ('page','object','class')),
  document_id    uuid NOT NULL,
  locale         text NOT NULL DEFAULT 'en',
  website_id     uuid,                       -- inherited from page / website scope
  published      boolean NOT NULL DEFAULT false,
  published_at   timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  title          text NOT NULL DEFAULT '',
  path           text NOT NULL DEFAULT '',   -- public URL path (pages), '' for objects
  category       text NOT NULL DEFAULT '',   -- page category / class label
  keywords       text[] NOT NULL DEFAULT '{}',
  body           text NOT NULL DEFAULT '',   -- full extracted text (see §5)
  excerpt        text NOT NULL DEFAULT '',
  document_tsvector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(category,'') || ' ' || array_to_string(keywords,' ')), 'B') ||
    setweight(to_tsvector('simple', coalesce(excerpt,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(body,'')), 'C')
  ) STORED,
  payload        jsonb NOT NULL DEFAULT '{}', -- classId, field highlights, sitemap flags
  UNIQUE (document_type, document_id, locale)
);
CREATE INDEX search_documents_tsv_gin  ON search_documents USING gin (document_tsvector);
CREATE INDEX search_documents_title_trgm ON search_documents USING gin (title gin_trgm_ops);
CREATE INDEX search_documents_path_trgm ON search_documents USING gin (path gin_trgm_ops);
CREATE INDEX search_documents_scope   ON search_documents (website_id, locale, published);
CREATE INDEX search_documents_updated ON search_documents (updated_at DESC);
```

- **Weights:** title A=1.0, keywords/category/excerpt B=0.5, body C=0.2 (`ts_rank_cd`).
- **`simple` config** (no stemming): language-neutral; typo tolerance comes from trgm similarity. Per-locale `regconfig` = documented follow-up via `ALTER ... / reindex`.
- Drizzle modeling: table defined in `packages/core/src/db/search-documents-schema.ts` (drizzle types for the normal columns, `sql` fragments for tsvector/`@@` queries in records); migration is hand-written SQL like the existing `0020_stiff_the_spike.sql` precedent.

## 5. Extraction & indexing pipeline (`packages/core/src/search/`)

**Extractors** (written against the two documented JSON shapes — the backend treats `content`/`attributes` as opaque jsonb today):

1. `extractPageText(page)` — walk the Element tree in `content.blocks`: collect `node.content` (skip `coords` noise), headings (`level`) get an excerpt/title boost, `image.url`/`src` + `link.text`, form labels (`formConfig` + input `data.attributes`), `dataBinding` field names. Compose with `title`, `category`, `seo.metaTitle/metaDescription`, `search.keywords`, `path`/`slug` (dynamic patterns `{...}` indexed as-is — URL resolution stays the existing `matchPagePath` flow).
2. `extractObjectText(object, classDef)` — for each field in `classDef.fields`: flatten scalar values (string/number/boolean/date/select **label**), recurse into `collectionFields`/`blockFields`; relations/asset fields contribute the referenced `key`/label best-effort (no deep joins). Class label + field labels become `keywords`.
3. `extractClassDoc(classDef)` — lightweight: `label` + `name` + field titles → a `class` document (payload carries `classId`). This is what makes searching "News" surface the class itself.

**Indexer** (`indexer.ts`):
- `indexPage(page)`, `indexObject(obj, classDef)`, `indexClass(classDef)`, `deleteIndexed(documentType, documentId, locale)` — transactional `ON CONFLICT (document_type, document_id, locale) DO UPDATE`.
- `reindexAll()` — full rebuild from `listPublishedWhoobePages`/published objects/classes; idempotent.
- **Hooks** in the records layer (single writer): `whoobe-pages-records.ts` (create/update/delete/publish flows) and `data-objects-records.ts` (incl. the `POST /data-objects/batch` publish/unpublish path). Published rows upsert; unpublished/deleted rows delete from the index. Drafts are indexed with `published=false` (admin-only visibility), except pages with `search.indexable === false` which are **admin-only** too.
- Cache `data_classes` definitions in-memory (class list is small) to avoid a fetch per object.

## 6. Query & ranking

- Input handling: `q` trimmed, min 2 chars; build `to_tsquery('simple', …)` from lexemes — **never concatenate raw input into SQL** (`websearch_to_tsquery`-style lexeme sanitization; quote-aware phrase support).
- **As-you-type prefix:** append `:*` to the last lexeme so `sport` matches `sports`/`sportswear`.
- Ranking: `ts_rank_cd(document_tsvector, query, 32)` primary; `similarity(title, q)` + `updated_at DESC` tie-breakers; `similarity(path, q) > 0.3` as fallback when the query yields no lexemes (or below a rank floor). The ranking step stays isolated in `query.ts` so V2's RRF fusion (see §2 addendum) slots in as a pluggable module.
- Highlights: `ts_headline('simple', body, query, 'StartSel=<em>, StopSel=</em>, MaxWords=30, MinWords=15')` in responses.
- Filters: `published`, `locale`, `website_id` (nullable → all sites), `document_type` (`page|object|class`), `classId` (via `payload->>'classId'`).
- Sort: `relevance | date`.

## 7. Headless API (core-api)

All in `apps/core-api/src/server.ts`, new group before bootstrap (~line 2439); records/query helpers imported from `@whoobe-cms/core/server` (barrel += new search modules).

### `GET /public/search` — no auth, published-only
```
q=energy drink&locale=en&websiteId=&type=page|object|class&classId=&page=1&pageSize=20&sort=relevance|date
```
```json
{
  "query": "energy drink", "total": 12, "page": 1, "pageSize": 20, "tookMs": 4,
  "results": [{
    "type": "page", "id": "…", "title": "Energy Drink — Hero", "path": "/en/energy-drink",
    "url": "https://…/en/energy-drink", "excerpt": "…<em>energy</em> <em>drink</em>…",
    "score": 0.61, "category": "products", "locale": "en", "publishedAt": "…",
    "highlight": null
  }, {
    "type": "object", "id": "…", "classId": "…", "className": "Product",
    "title": "AquaFizz (product)", "excerpt": "Flavor: citrus …", "score": 0.42, "highlight": {"name": "…"}
  }]
}
```
- `url` assembled from `PUBLIC_SITE_URL` (same env as sitemap) when set, else relative `path`.
- Object results have **no public URL by default** (data objects are headless records); consumers use `classId`+`id`.
- Optional `POST /public/search` with a JSON body for complex filters (mirrors `/public/data-objects/query` pattern) — Phase 3 nicety.

### `GET /whoobe-one/search` — `requirePermission(OBJECTS_READ)`
Same engine, plus `includeUnpublished=true`; page docs with `search.indexable === false` visible here.

### `POST /whoobe-one/search/reindex` — `requirePermission(OBJECTS_WRITE)`
Full rebuild (optional body `{ documentType }`); returns counts per type.

## 8. Website integration (whoobe-one-spike)

- `src/search-api.ts` — `searchPublic(q, params)` fetch wrapper (same `coreApiUrl` idiom as `pages-api.ts`).
- `components/SearchBox.vue` — input, 250ms debounce, top-5 suggestions (title + type badge + path), Enter/click → `router.push('/search?q=…')`.
- `views/SearchResultsView.vue` — results list (title, highlighted excerpt, type badge, date, class filter for `object`/`class` results), pagination.
- Router: explicit `/search` route registered **before** the catch-all `/:pathMatch(.*)*` (`src/router/index.ts:36`).
- Embedding in site chrome is site-specific (there's no site header yet); the components + headless API are the integration points, and the future SSR renderer consumes `/public/search` unchanged.

## 9. Admin integration (admin-dashboard)

- `utils/search-api.ts` + `stores/searchStore.ts` (per-domain idioms from existing utils/stores).
- Wire `DashboardLayout.vue:157-164` global search input: debounced dropdown (type badges, include drafts), click → navigate (page → `PagesView` with filter; object → `ObjectsView` with class filter; class → `ObjectsView`).
- Optional: "Reindex now" button in Settings (calls `/whoobe-one/search/reindex`).

## 10. Security & edge cases

- Public queries can only see `published=true`; pages with `search.indexable===false` excluded publicly; no SQL injection surface (lexeme-sanitized tsquery, parameterized filters).
- Multi-locale: one row per `(type, id, locale)`; public queries default `locale` to the website's `defaultLocale`.
- Multi-site: `websiteId` scoping; hostname→website middleware is a separate plan item (`getWebsiteByDomain` is dead code awaiting it) — search stays `websiteId`-parameter-driven until then.
- Dynamic slugs (`/it/news/{slug}`): indexed with the pattern; result `url` uses the pattern (resolution stays on the public page route).
- Form submissions (unpublished objects) → indexed `published=false`, admin-only.
- Reindex concurrency: per-document upsert is transactional; a rebuild during writes is safe (last-write-wins).

## 11. Implementation phases & file map

Status: **v1 implemented 2026-08-14** (this session). Verified: all four packages typecheck/build green; migration applied to develop.local; reindex 6 pages / 3368 objects / 14 classes; HTTP checks of all three routes; indexer upsert→search→delete round-trip. Hooks live at the records layer as planned; `searchStore.ts` was folded into `DashboardLayout.vue` (no separate store needed for a single-input dropdown).

| Phase | Files | Deliverable |
|---|---|---|
| 1 | `packages/core/drizzle/0021_*.sql`, `packages/core/src/db/search-documents-schema.ts`, `src/server.ts` barrel | table + indexes; both DBs migrated (localhost + develop.local, per AGENTS.md) — applied to develop.local; localhost container migration pending (same file, `runMigrations`) |
| 2 | `packages/core/src/search/{extract,indexer,query}.ts`; hooks in `whoobe-pages-records.ts`, `data-objects-records.ts` | live indexing on writes + `reindexAll` |
| 3 | `apps/core-api/src/server.ts` (3 routes) | `/public/search`, `/whoobe-one/search`, `/whoobe-one/search/reindex` |
| 4 | spike: `search-api.ts`, `SearchBox.vue`, `SearchResultsView.vue`, router | working site search |
| 5 | dashboard: `search-api.ts`, `searchStore.ts`, `DashboardLayout.vue` | working admin search |
| 6 | tests (unit extractors/query-builder; integration publish→index→search→unpublish→gone), curl verification, `CHANGES.md`, this doc | verified + documented |

## 12. Risks & open items

- `CREATE EXTENSION pg_trgm` needs a privileged role (postgres user on `develop.local` — fine).
- `simple` config quality vs stemming — revisit per-locale `regconfig` if recall disappoints (reindex-only change).
- Object extraction cost on write — acceptable (single row per object, fields are small); `reindexAll` is the escape hatch.
- No public URL for object results — confirm with future site UX; may resolve via first page binding it (deferred).
- V2: pgvector extension availability on `develop.local` (external DB, needs the extension binary installed) and embedding-model choices/limits on the AI gateways — both open items, only relevant when the V2 hybrid leg is started.

### v1.1 addendum (implemented 2026-08-14): DAM assets in the index

- Migration `0022_search_documents_asset.sql` widens the document_type CHECK to `'asset'`; all 0021 columns/indexes reused unchanged.
- `extractAssetDoc()` (filename/title, folder+pimcore path, mime/file type, technical/camera/gps/rights + raw EXIF strings into body/keywords), `indexAsset()` (published = asset's own `isPublic`, so private assets stay admin-only), hooks in `asset-records.ts` (upsert / metadata update / delete), `reindexAll()` now includes and reports assets.
- Both routes accept `type=asset`; dashboard dropdown opens the DAM preview tab via `tabsStore.openAsset`.
- Verified: 1134 assets indexed on develop.local; filename (`pinocchio` → `pinocchio20202.jpg`), type filter and technical-metadata dimension searches (`2560` → the two 2560px jpgs) all hit. Caveat: the current asset DB only holds `technical` metadata — camera/GPS/rights/raw extractor paths are code-covered but not yet data-verified.