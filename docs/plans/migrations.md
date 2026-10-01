# WordPress / React-Next.js → whoobe_cms Migration — Feasibility Plan

## 0. Terminology

- **Repo/export access** — the source site's database (dump or live connection), content-export file (e.g. a WordPress WXR file), source code repository, and/or hosting filesystem (e.g. `wp-content/uploads`) are available to the migration tooling. This is the access mode `packages/migration-tool` already assumes for Pimcore.
- **Web scraping** — no backend/repo/DB access at all; the only input is what the live, publicly reachable site returns over HTTP(S) or renders in a browser. The importer sees rendered markup, never a schema.
- **Element tree** — whoobe_cms's universal page-content format: the recursive JSON structure stored in `whoobe_pages.content`, defined by `apps/whoobe-one-spike/src/scripts/ElementsClass.js`/`.d.ts` and mirrored framework-agnostically in `packages/sdk/schema/src/node.ts`. Every migration path below, regardless of source, ultimately has to produce this shape (or a `data_objects` row, for structured content — see §4).
- **Data Class / Data Object / Data Component** — whoobe_cms's structured-content system (`packages/core/src/schema/dynamic.ts`'s `ClassFieldDefinition`/`ClassDefinition`, `data_classes`/`data_objects`/`data_components` tables). The natural target for anything with a repeatable shape: a WordPress Custom Post Type, an ACF field group, a React site's typed content model.
- **Source adapter** — the plugin interface `packages/migration-tool/src/source-adapter.ts` defines (`PimcoreSourceAdapter`) for a pluggable source backend. Currently implemented twice: `adapters/mysql-adapter.ts` (live Pimcore MySQL) and `adapters/fixture-adapter.ts` (in-memory, explicitly documented as "a template for a future export-file adapter").
- **WordPress** is used throughout as shorthand for "a WordPress installation," which is not one content format — see §9 for why that distinction matters.

## 1. Scope & goals

This plan assesses the feasibility of importing content from external sites into whoobe_cms along two independent axes:

| | Repo/export access | Web scraping |
|---|---|---|
| **WordPress** | §3.1 — LOW–MEDIUM | §3.2 — MEDIUM |
| **React/Next.js** | §3.3 — HIGH | §3.4 — MEDIUM–HIGH |

Goals:
- For each of the four combinations, determine what existing whoobe_cms infrastructure is directly reusable vs. what is genuinely new engineering.
- Produce one concrete, decisive architectural recommendation (not a menu of equally-weighted options) for how the new tooling should be structured relative to the existing `packages/migration-tool`.
- Lay out a realistic, risk-aware phased roadmap, sequenced by confidence and shared leverage rather than by source-platform popularity.
- State limitations and risks explicitly — a feasibility plan that hides the hard parts isn't one.

Non-goals: this plan does not cover migrating from other headless/traditional CMSs (Webflow, Wix, Squarespace, Drupal, Contentful, ...) — the same two-pipeline architecture (§5) should generalize to those later, but they are out of scope here. It also does not cover ongoing two-way sync with a live WordPress/Next.js install — this is a one-time (or staged, re-run on demand) import, matching `packages/migration-tool`'s existing idempotent-but-not-continuous-sync model.

## 2. Where this stands today (existing infrastructure inventory)

whoobe_cms already has a complete, production-tested migration pipeline for one external CMS — Pimcore — in `packages/migration-tool`. It is the single most relevant piece of prior art for this plan, and large parts of it are not actually Pimcore-specific, just never generalized because nothing has needed it yet.

**The pluggable adapter pattern.** `packages/migration-tool/src/source-adapter.ts` defines `PimcoreSourceAdapter` — an interface for listing/reading documents, assets, class definitions, and objects from a source system — with two implementations: `adapters/mysql-adapter.ts` (a real Pimcore MySQL connection) and `adapters/fixture-adapter.ts` (an in-memory double used by the test suite, whose own comment already describes it as "a template for a future export-file adapter"). Nothing about this interface shape is Pimcore-specific; it is "list raw items of type X, fetch one item's raw detail, return it as a plain DTO" — exactly the shape a WordPress or WXR-file adapter would need.

**Pure, DB-independent converters.** The conversion logic is cleanly separated from the DB-read step: `pimcore-class-definition-parser.ts` (source schema → `ClassFieldDefinition[]`), `pimcore-object-converter.ts` (source records → `data_objects.attributes`, with relation/asset resolution via injected callbacks so it never needs its own DB connection), `pimcore-page-converter.ts` (source page/document → an Element tree), and `extract-collection-types-to-components.ts` (a post-migration step promoting repeated embedded field groups into reusable `data_components`). `php-unserialize.ts` is a hand-rolled PHP `serialize()` decoder, written for Pimcore's `link` field type — and directly reusable as-is for WordPress, which stores ACF field values and many plugins' settings as PHP-serialized strings in `wp_postmeta`.

**The CLI and its operational guarantees.** `cli.ts` exposes six commands (`migrate-documents`, `promote-staging`, `migrate-classes`, `migrate-objects`, `migrate-assets`, `extract-collection-types`), every one of which supports `--dry-run` and `--limit`, isolates failures per-item (a single bad record never aborts the batch — it's recorded in a `{succeeded, failed, errors}` result and the run continues), and is idempotent via upsert-by-natural-key: `pimcoreId` (on pages/classes/objects) and `pimcorePath` (on assets) are, despite their name, already generic "source system identifier" columns — re-running the same import updates in place rather than duplicating. Pages additionally support a staging workflow (`whoobe_pages_staging`, reviewed and promoted via `promote-staging`), with a guard (`findPublishedWhoobePageConflict`) that refuses to silently overwrite an already-published page.

**An admin-triggered front door already exists.** The same `run*Migration` functions the CLI calls are also exported and wrapped by HTTP routes in `apps/core-api/src/server.ts`: `POST /migration-sources/:id/import-classes|import-objects|import-documents|promote-documents|extract-components`, backed by a `migration_sources` table (`packages/core/src/db/migration-sources-schema.ts`) storing encrypted source-DB connection details per configured source. This means "add a new source type" does not require inventing a new admin UX concept — it means extending an existing one (see §7 for the one real gap in that table's current shape).

**The target data model** content has to land in is described fully in §4. The short version: pages become `whoobe_pages` rows with an Element-tree `content`; structured/repeatable content becomes Data Classes/Objects/Components; media becomes DAM `assets`; navigation becomes `website_paths`; and a whole site (pages + menus + theme + templates) can be expressed as one `WebsiteExport` JSON document and imported in a single call to `POST /whoobe-one/websites/import` (`apps/core-api/src/server.ts:4939`) — which already handles translation-group ID remapping, rootPath de-duplication, and correct creation ordering (themes → website → pages → paths).

**An adjacent, already-shipped pipeline for unstructured content.** The AI Website Wizard (`apps/admin-dashboard/src/components/settings/AiWebsiteWizardModal.vue` → `POST /ai/generate-website-structure` → `packages/core/src/ai/prompts.ts` → `POST /whoobe-one/websites/from-ai`) takes a free-text prompt, asks an LLM to emit a strict `{website, pages[], snippets[]}` JSON structure matching the Element-tree contract, retries up to three times with the previous output + validation error fed back on failure, validates the result (`validateWebsiteStructure`/`validateElementTree` — tag allowlist, node-count ceilings, structural shape), sanitizes any hallucinated image URLs (`sanitizeGeneratedImages`), and persists it. This is, functionally, "unstructured input → validated Element-tree JSON → persisted site," which is exactly the shape a web-scraping importer needs — it is not purpose-built for scraping today, but it is the correct thing to generalize rather than building a second, parallel pipeline from scratch.

**A second, independent option for Next.js specifically.** `packages/sdk/renderer` + `packages/sdk/schema` (consumed by `packages/sdk/next`, `nuxt`, `react`, `vue`, `svelte`) form whoobe_cms's official headless SDK: a framework-agnostic element-tree walker, data/image/link resolver, and public-API client meant to be embedded in an externally-hosted frontend. This opens a route for Next.js that has no WordPress equivalent: an actively-maintained Next.js codebase could be re-pointed at whoobe_cms as its content backend via this SDK, rather than having its existing content migrated into the page builder at all. This is a genuinely different offering from content migration — see §5.3.

**Confirmed gap: no scraping/crawling code exists anywhere in this repo.** An exhaustive search found no `cheerio`, `puppeteer`, `playwright`, `jsdom`, or generic external-HTML-fetching utility in any app or package. The only "crawler" in the codebase is `packages/publish`'s Nitro/Next prerender crawler (`nitro.prerender.crawlLinks: true`), which walks **our own generated site's** internal links at build time to produce static output for publishing — it informs crawl-strategy design (sitemap/link-following discovery) but contains no code reusable for importing a foreign, externally-owned site. Any web-scraping path in this plan is new infrastructure, not a wrapper around something that already exists.

## 3. The four migration paths

### 3.1 WordPress + repo/export access — Effort/Risk: LOW–MEDIUM

**Access mode.** A database dump or live MySQL connection to the WordPress install, and/or a WXR (WordPress eXtended RSS) export file, plus filesystem access to `wp-content/uploads` for media.

**Why this is the easiest path.** WordPress's content model — posts/pages in `wp_posts`, metadata in `wp_postmeta` (frequently PHP-serialized, exactly the format `php-unserialize.ts` already decodes), taxonomies in `wp_terms`/`wp_term_relationships`, and a real media library — is structurally close enough to Pimcore's (objects/classes/documents/assets) that essentially the entire existing pipeline transfers: schema inference, object conversion with relation resolution, document→Element-tree conversion, staging/promote, per-item error isolation, idempotent re-runs. This is a matter of adding a new adapter, not building a new migration system.

**Target mapping:**
- WordPress **page** → a `whoobe_pages` row (`kind: 'content'`), with `content` converted to an Element tree.
- WordPress **post** (the default blog post type) → a `data_objects` row of an "Article"/"Post" Data Class (fields like `title`, `body` as a `wysiwyg`/`markdown` field, `publishedDate`, `author`, `categories`/`tags` as `manyToManyRelation`), rendered via a template page that binds to it (`dataBinding`) — recommended over treating every post as its own `whoobe_pages` row, since posts are naturally a repeatable, structured content type and this is exactly the shape `pimcore-object-converter.ts` already produces for equivalent content.
- WordPress **Custom Post Type + ACF field group** → a new Data Class, with `ClassFieldDefinition[]` inferred from the ACF field group definition; ACF repeater/flexible-content fields map onto `fieldcollections`/`data_components`, mirroring exactly what `extract-collection-types-to-components.ts` already does post-migration for Pimcore's field collections. Each CPT entry → one `data_objects` row.
- WordPress **media library** (`wp_posts` with `post_type = 'attachment'`, backed by real files under `wp-content/uploads`) → DAM `assets` rows, via the same path-keyed idempotent upload flow `migrate-assets` already uses.
- WordPress **navigation menu** (`wp_nav_menu` + menu items) → a `website_paths` row (a `MenuItem[]` tree).
- WordPress **permalink structure** (e.g. `/category/%postname%/`, custom rewrite rules) → a dynamic-slug `whoobe_pages` row using `page-path-pattern.ts`'s `{placeholder}` syntax, bound to the relevant Data Class via `dataBinding`.

**The one real catch:** "WordPress content" is not a single format (see §9) — a new `WordPressSourceAdapter`'s content-body parser should scope v1 to **Gutenberg blocks and classic-editor raw HTML only**. Page-builder plugins (Elementor, Divi, WPBakery) each serialize their own proprietary nested JSON/shortcode structure inside `post_content`, requiring a dedicated parser per plugin; a page built with one of those should fall back to the scrape/LLM pipeline (§3.2), since it still renders as ordinary HTML in a browser even though its *source* representation is not.

### 3.2 WordPress + web scraping — Effort/Risk: MEDIUM

**Access mode.** No DB, FTP, or API access — only what the live public site returns over HTTP.

**Why this is more tractable than it sounds.** WordPress is, in the overwhelming majority of real installs, server-rendered HTML — the page you fetch over plain HTTP is already the final content. This means scraping WordPress does **not** require a headless browser; a plain HTTP fetch plus a static HTML parser (e.g. Cheerio) is normally sufficient to capture full page content, images, and link structure.

**Recommended approach: do not hand-build a DOM→Element-tree transpiler.** Writing a bespoke converter that walks arbitrary scraped HTML and infers Element-tree structure (headings, paragraphs, images, buttons, sections) from raw markup is a large, open-ended, and fragile undertaking — every theme produces different markup for conceptually identical content. Instead, generalize the AI Website Wizard pipeline described in §2: clean the scraped HTML (strip navigation/footer/scripts/ads, keep the semantic content structure), feed it to the same LLM-driven JSON-generation flow with a "reconstruct this scraped page" prompt variant alongside the wizard's existing "invent a page from this brief" prompt, and reuse its retry-on-invalid-output, Element-tree/tag-allowlist/node-count validation, and hallucinated-image-URL sanitization exactly as they exist today.

**Target mapping.** Same output shapes as §3.1 (pages, DAM assets, nav menus) — but derived through LLM reconstruction of rendered markup rather than structural parsing of a known schema. This has a real, inherent consequence worth stating plainly: a scraper only ever sees the rendered page, never the underlying CPT/ACF structure, so **no Data Class recovery is possible via scraping** — every imported page becomes unstructured Element-tree content, never a `data_objects` row. This is a ceiling on the scraping path's fidelity, not a solvable implementation detail.

### 3.3 Next.js/React + repo access — Effort/Risk: HIGH

**Access mode.** Full source repository (components, routing files, build configuration), ideally also whatever the site's original content source was (a headless CMS, MDX files, or hardcoded data in the components themselves).

**Why this is the hardest of the four paths.** WordPress has one bounded funnel point every post/page's content passes through (`wp_posts.post_content` plus a known set of meta tables) — a generic parser is feasible because the input space is constrained. A Next.js/React codebase has no equivalent funnel: App Router vs. Pages Router, arbitrary UI component libraries, server components vs. client components, server actions, build-time vs. runtime data fetching, and completely custom data models mean there is no single shape a generic importer can target. There is no AST/babel-based JSX analyzer in this codebase today, and building one that reliably reconstructs an Element tree from arbitrary React source is a fundamentally more open-ended engineering problem than anything `packages/migration-tool` currently solves.

**Recommended scope for v1: static/SSG Next.js output only.** Rather than attempting true JSX-to-Element-tree transpilation, scope this path to sites that are statically generated (via `next export` or static generation): build or render the site locally — repo access's actual advantage here is simply that you can trust and control the build, rather than scraping a potentially-gated live deployment — and then route the resulting static HTML through the exact same render-and-reconstruct pipeline built for §3.2/§3.4. In other words, Next+repo (static) degrades gracefully into "render it ourselves, then scrape-pipeline it," which is honest about the real difficulty of the general problem rather than overpromising a code-aware transpiler.

**Target mapping.** Best-effort only, via the same LLM-reconstruction output shapes as §3.2: Element-tree pages, DAM assets for referenced media, `website_paths` for navigation. True component-tree-aware reconstruction — one that would preserve component boundaries and recover something resembling the original data model — should be flagged explicitly as a stretch goal / human-reviewed effort, never presented as an automated deliverable.

### 3.4 Next.js/React + web scraping — Effort/Risk: MEDIUM–HIGH

**Access mode.** Only the live, public site.

**What's shared with §3.2.** The same LLM-driven reconstruction pipeline, the same asset-harvesting approach, the same page/nav persistence target.

**What's genuinely new here.** Next.js sites are frequently client-rendered — React hydration means a plain HTTP fetch can return a near-empty HTML shell, with the actual content only appearing after JavaScript executes. This path requires introducing a headless browser (Playwright is the natural choice; it is not a dependency anywhere in this repo today) to execute the page's JavaScript and capture the fully-hydrated DOM before handing it to the same cleaning/reconstruction stage used for WordPress scraping. This is both a new infrastructure dependency (a headless Chromium runtime) and a real runtime-cost increase (slower, heavier crawl jobs) relative to WordPress's simple-fetch case.

**Target mapping.** Same ceiling as §3.2 — unstructured, LLM-reconstructed Element-tree pages, with no access to the original component/data model. Additionally, interactive or stateful UI (tabs, modals, client-side filters, multi-step forms) will not survive being flattened into a static page tree — this should be communicated as a real, lossy limitation of the scraping approach, not glossed over.

## 4. Target data model mapping (per source path)

| Source content | Repo-access target | Scrape target |
|---|---|---|
| WP/Next page | `whoobe_pages` row, Element-tree `content` | `whoobe_pages` row, LLM-reconstructed Element-tree `content` |
| WP post / blog entry | `data_objects` row (Article Data Class) + template page with `dataBinding` | Unstructured `whoobe_pages` row (no Data Class recovery) |
| WP CPT + ACF field group | New Data Class (`ClassFieldDefinition[]`) + `data_objects` rows; repeaters/flexible content → `fieldcollections`/`data_components` | Not recoverable — structure is invisible once rendered |
| Images / media | DAM `assets` rows, path-keyed idempotent upload | DAM `assets` rows, keyed by the referenced URL, idempotent upload |
| Navigation menu | `website_paths` (`MenuItem[]` tree) | `website_paths`, reconstructed from observed site navigation during crawl |
| Permalinks / dynamic routes | Dynamic-slug `whoobe_pages` row (`page-path-pattern.ts`'s `{placeholder}` syntax) + `dataBinding` | Each distinct crawled URL becomes its own static-slug page (no dynamic-route recovery) |
| Whole site (pages+menus+theme) | `WebsiteExport` JSON → `POST /whoobe-one/websites/import` | Same — the scrape pipeline should emit the same `WebsiteExport` shape rather than inventing a new bulk-import format |

The consistent theme: **repo/export access can recover structure** (Data Classes, dynamic routes, reusable components); **scraping can only ever recover rendered output** (flat pages, static URLs). This isn't a gap to be closed by better tooling — it's the fundamental difference between the two access modes, and the plan's phasing (§8) and risk list (§9) treat it as such.

## 5. Architectural recommendation

**Two separate pipelines, not one unified adapter abstraction.** The two access modes solve structurally different problems and should not be forced into a shared interface:

### 5.1 Repo/export access → extend `packages/migration-tool`'s adapter pattern

Add a `WordPressSourceAdapter` (and, since a database dump isn't always what a customer can hand over, a companion WXR-file adapter — directly analogous to how `fixture-adapter.ts` already describes itself as a template for exactly this) implementing the same adapter-interface shape `PimcoreSourceAdapter` already defines. This is justified because WordPress's content model has enough real, bounded structure (posts/postmeta/taxonomies/media/CPTs) that the existing converter pipeline — schema inference, relation-aware object conversion, document→Element-tree conversion, staging/promote, per-item error isolation, idempotent upsert — transfers with minimal change. Building a separate package for this would mean re-implementing staging/promote/CLI/HTTP-route machinery that already exists and is already tested; there is no reason to.

### 5.2 Scraping (both WordPress and Next.js) → a new pipeline generalizing the AI Website Wizard

This is a deliberately different architecture from §5.1, because a scraper fundamentally cannot produce the structured, typed records (`PimcoreObjectSummary`, `PimcoreFieldCollectionItem`, etc.) `PimcoreSourceAdapter` is designed around — a scraper only ever has rendered markup, never a schema. Forcing scraped content through the adapter interface would mean inventing fake structure that doesn't exist in the source. The correct precedent is the AI Website Wizard's already-shipped "unstructured content in, validated Element-tree JSON out" flow. Recommend a new module (e.g. a `packages/scrape-import` package, or a focused extension of the existing AI-generation code in `packages/core/src/ai/`) providing: crawl discovery → fetch/render → HTML cleaning → the generalized prompt/validate/sanitize flow (reusing `buildWebsiteStructurePrompt`/`validateWebsiteStructure`/`validateElementTree`/`sanitizeGeneratedImages` with a new "reconstruct from scraped content" prompt variant) → persistence.

**Shared output contract across all four paths:** emit a `WebsiteExport`-shaped JSON document (`apps/core-api/src/server.ts:4939`) and import it via the existing `POST /whoobe-one/websites/import` route, rather than inventing a fifth persistence mechanism. That route already handles translation-group remapping, rootPath de-duplication, and correct creation ordering (themes → website → pages → paths) — reuse it.

### 5.3 The Next.js "backend swap" — an independent third offering

Converting an actively-maintained Next.js codebase to consume whoobe_cms as a headless backend via `packages/sdk/next` (built on `packages/sdk/renderer`/`schema`) is architecturally unrelated to content migration — it applies when a customer is handing over a Next.js app that will keep being developed, authoring new content in whoobe_cms going forward, rather than archiving an existing site's existing content. It should be presented as a complementary offering for the Next+repo case specifically, not as a substitute for §3.3/§3.4 — it does nothing for "import the content of this site that already exists and won't be touched again."

## 6. What "web scraping" concretely means here

A five-stage pipeline, shared by §3.2 and §3.4 (with one branch point at stage 2):

1. **Crawl discovery.** Enumerate URLs to import: check `sitemap.xml` first (cheap and authoritative when present), falling back to breadth-first same-origin link-following from the homepage with a configurable depth/page-count cap. `packages/publish`'s own `nitro.prerender.crawlLinks` crawler (used to generate *our* published sites' static output) is a useful reference for crawl-strategy shape, even though it runs in the opposite direction and contains no reusable code for this purpose.
2. **Page rendering** — branches by source platform: WordPress is server-rendered, so a plain HTTP fetch plus static HTML parsing (Cheerio) is normally sufficient; Next.js sites are frequently client-rendered, requiring a headless browser (Playwright, a new dependency) to execute JavaScript and capture the fully-hydrated DOM.
3. **Content reconstruction.** Clean the rendered HTML (strip scripts/styles/nav/footer/cookie banners, retain heading/paragraph/image/link/list structure), then feed it to the generalized AI-wizard pipeline (§5.2) — same JSON contract, same retry-on-invalid-output, same Element-tree/tag-allowlist/node-count validation, same image-URL sanitization.
4. **Asset harvesting.** Download only the media actually referenced in the reconstructed content — not a wholesale crawl of every file on the source site, matching the "walk referenced media" philosophy `migrate-assets` already uses for Pimcore — then push through the existing DAM upload path (`POST /api/v1/dam/upload`, or a direct `AssetStorageProvider.uploadAsset()` call for a trusted backend job), with idempotent path-keyed upsert.
5. **Attribution / legal caveat — stated explicitly, not as a footnote.** Scraping and reproducing content and images from a site the operator does not own or have explicit permission to migrate carries real copyright and Terms-of-Service exposure: many sites' ToS explicitly prohibit automated scraping, and images in particular are frequently separately licensed (stock photography, third-party attribution requirements) in a way that is not transferred simply by virtue of appearing on a page. This plan recommends requiring an explicit rights attestation from the customer before any scrape job runs, and scoping the feature's marketing/UX to "import your own legacy site," not "scrape any URL."

## 7. Admin UX & workflow (migration_sources extension)

The existing `migration_sources` table (`packages/core/src/db/migration-sources-schema.ts`) is, today, shaped specifically for a MySQL connection: `dbHost`, `dbPort`, `dbUser`, `dbPasswordEncrypted`, `dbName`, `classesPath`. This is a real, concrete gap worth calling out rather than assuming away: it has no column for a WXR file path and no column for a scrape target URL. Extending it to cover the new source types requires either (a) adding nullable columns for each new connection shape plus a `sourceType` discriminator, or (b) replacing the fixed columns with a generic `config: jsonb` column keyed by source type — either is a small, mechanical schema change, not a redesign, but it is a real prerequisite, not something that falls out of adding a new adapter for free.

Whatever shape is chosen, every new source type should reuse the existing staging/promote review workflow (`whoobe_pages_staging` + `findPublishedWhoobePageConflict`) without exception — **LLM-reconstructed scrape content should never be published directly**, given the accuracy risk discussed in §9; it should always land in staging for human review first, exactly like a staged Pimcore document migration does today. New source types should also surface the same `--dry-run`/`--limit`/per-item-error-reporting UX the existing `migrate-*` commands already provide, so an admin gets the same level of visibility and control regardless of which source type they're importing from.

## 8. Proposed phases

### Phase 1 — `WordPressSourceAdapter` (repo/export access)
**Goal:** prove the `packages/migration-tool` adapter pattern generalizes beyond Pimcore, on the highest-confidence, most bounded-scope source.
Scope: WP MySQL schema reader and/or WXR file parser; `wp_postmeta`/ACF PHP-serialized value decoding (reusing `php-unserialize.ts`); CPT+ACF → Data Class inference; post/page → `data_objects`/`whoobe_pages`; Gutenberg-block and classic-HTML content parsing only (page-builder-plugin content explicitly out of scope for v1); media library → DAM; nav menus → `website_paths`.

### Phase 2 — LLM-assisted scrape→Element-tree pipeline
**Goal:** generalize the AI Website Wizard's prompt/validate/sanitize/persist pattern to accept scraped content instead of a free-text brief. This is the single biggest leverage point in the whole plan — it is the shared foundation for both scraping combinations (§3.2, §3.4) and for the Next+repo fallback (§3.3), so it should land before Phase 3 or Phase 5 build on it.
Scope: crawl discovery (sitemap.xml + link-following); static HTML fetch/parse path (fully serves WordPress scraping on its own); the "reconstruct from scraped content" prompt variant plus reuse of existing validation/sanitization; `WebsiteExport`-shaped output via `POST /whoobe-one/websites/import`.

### Phase 3 — Headless-browser rendering for client-rendered sites
**Goal:** extend Phase 2's pipeline to sites that require JavaScript execution to render their content, unlocking Next.js scraping.
Scope: introduce Playwright as a new dependency; capture the post-hydration DOM and feed it into Phase 2's existing cleaning/reconstruction stage unchanged.

### Phase 4 — Asset/DAM harvesting hardening
**Goal:** robust, idempotent, licensing-aware media import, as a shared dependency across every path above.
Scope: referenced-only download (never a full source-site media crawl); path-keyed idempotent upsert via the existing DAM upload flow; flagging externally-hosted/CDN-hotlinked images for manual licensing review rather than silently re-hosting them.

### Phase 5 — Next.js repo-access content migration (best-effort)
**Goal:** offer a conservatively-scoped, human-reviewed path for static/SSG Next.js repositories, without attempting general JSX transpilation.
Scope: build/export the target site locally, then route its static output through Phase 2/3's render-and-reconstruct pipeline; explicitly flag true component-tree-aware reconstruction as a future stretch goal, not a committed deliverable.

### Phase 6 — Next.js "backend swap" via headless SDK
**Goal:** offer SDK-based headless adoption (`packages/sdk/next`) as an alternative to content migration, for customers actively maintaining their own Next.js codebase.
Scope: independent of Phases 1–5; this is an architecture-change sale, not a migration, and can be pulled forward opportunistically ahead of Phase 5 if the right customer need arises first — it has no dependency on any other phase in this plan.

### Phase 7 — Admin UX
**Goal:** make every migration path above usable without shell/CLI access.
Scope: extend `migration_sources` (per §7) to cover the new source types alongside the existing Pimcore type; reuse the existing staging/promote review workflow for all of them, including scrape-derived content; surface `--dry-run`/`--limit`/per-item error reporting consistent with the existing `migrate-*` commands.

**Sequencing rationale:** Phase 1 ships first because it is the highest-confidence, most directly reusable piece of infrastructure — the clearest, lowest-risk win. Phase 2 is prioritized immediately after because it is shared by the largest number of downstream phases (3.2, 3.4, and the Phase-5 fallback); building it once, early, avoids duplicating reconstruction logic later. Phase 6 is called out as independent and parallelizable specifically because it has no technical dependency on anything else in this plan and may be worth shipping opportunistically out of order.

## 9. Open questions / risks, stated rather than hidden

- **"WordPress" is not one content format.** Gutenberg block JSON-in-HTML-comments, classic-editor raw HTML, and page-builder plugins (Elementor, Divi, WPBakery) each store their own proprietary nested shortcode/JSON structure inside `post_content`, with no shared schema between them. Phase 1 scopes v1 to Gutenberg + classic HTML only; page-builder-plugin content should fall back to the scrape/LLM pipeline rather than block the whole repo-access path on supporting every plugin's private format.
- **WooCommerce and other plugin-specific structured data** (products, orders, bookings, subscriptions) have no whoobe_cms equivalent today and are out of scope for repo-access migration unless/until a dedicated Data Class mapping is designed for each. Consistent with how `pimcore-page-converter.ts` already treats unsupported Pimcore constructs (`href`/`multihref`/`snippet` become explicit labeled placeholder nodes, never silently dropped), unsupported WordPress plugin data should be flagged as explicitly unsupported during import, not silently discarded.
- **Next.js's architectural variability** (App Router vs. Pages Router, arbitrary component libraries, server actions/components, build-time vs. runtime data fetching) means no generic repo-access importer can be fully automated the way the WordPress adapter can. This needs to be communicated to customers as a scoped, best-effort, human-reviewed offering — not a turnkey migration — from the outset.
- **Client-rendered Next.js sites require a headless browser to scrape** (Phase 3), which is new infrastructure (Playwright, headless Chromium) with a real runtime-cost and complexity increase over the WordPress case; some interactive/stateful UI (tabs, modals, client-side filters) will not survive being flattened into a static Element tree, regardless of tooling quality.
- **LLM cost, accuracy, and hallucination risk** for the scrape-reconstruction path, particularly at the scale of a multi-hundred-page site. Schema/retry validation (already proven by the AI wizard) mitigates *invalid JSON shape* but not *semantically wrong reconstructions* of page content. Mitigation: every scrape-derived page must land in the existing staging workflow for human review — never auto-publish LLM-reconstructed content directly, regardless of how confident the validation pass is.
- **Image licensing on harvested media.** A scraped image being technically downloadable does not mean it is rights-cleared for reuse by the customer. Externally-hosted/CDN-hotlinked images in particular should be flagged for manual review rather than silently re-hosted into the DAM as if first-party.
- **Legal / Terms-of-Service risk of scraping a site the customer does not own or control.** This is a business/legal risk, not just a technical one (see §6, stage 5) — require an explicit rights attestation before a scrape job runs, and do not position this as a general "scrape any site" capability.
- **`pimcoreId`/`pimcorePath` naming debt.** These columns are already generic source-system natural keys in practice, used that way by every existing test and by this plan's own recommended reuse — but their literal names still reference Pimcore specifically. Recommend documenting the generalization (as this plan does) rather than renaming the columns, since a rename is a breaking schema migration for a purely cosmetic improvement and buys nothing functionally.

## 10. Relationship to other plans

- `docs/plans/cms/documents-migration.md` and `docs/plans/datamodel/advanced-data-modeling-plan.md` (§5, "Migration pipeline") — the existing Pimcore ETL pipeline this plan's Phase 1 extends with a new source adapter.
- `docs/plans/datamodel/native-class-authoring-plan.md` (§3.4) — the `migration_sources` admin-triggered import UI this plan's Phase 7 builds on.
- `docs/plans/datamodel/component-fields-plan.md` — the `data_components`/`fieldcollections` target shape that WordPress ACF repeaters and flexible-content fields map onto in §3.1/§4.
- `docs/Initial-Plan.md` (§4, "Enterprise Migration Pipeline (ETL)") — the project's original migration-engine vision, which this plan operationalizes for two new source platforms.
- `docs/guides/publish/website-publishing.md` — the publishing pipeline (whoobe-publish → generated Next.js/Nuxt app → Vercel/Docker/static) any migrated or assembled website flows through afterward, unchanged by anything in this plan.
