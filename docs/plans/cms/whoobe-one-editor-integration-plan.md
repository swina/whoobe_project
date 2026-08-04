# Integrating `whoobe-one-spike` into Whoobe CMS

Sequel to `docs/plans/cms/whoobe-one-studio-vue3-port-plan.md` (the "port plan"), specifically its §7 ("Integration options - for tomorrow's decision - not decided there"). The port plan intentionally stopped short of this question; this document picks it back up now that Phase 0-3 (partial) of the port is done and the spike has grown considerably past what §7 was written against (see §2).

**Revision history**: the first version of this document treated "which of the port plan's three options" as the open question and recommended keeping `whoobe-studio` running side-by-side as a second, permanent editor. That framing is superseded by explicit product direction (recorded in §1) that settles the strategic question directly: `whoobe-one-spike` is *the* page/document composer for Whoobe CMS, full stop - not one of two editors. What's genuinely still open is narrower and more concrete: the shape of the new page/document data model (§4) and exactly how Pimcore migration folds into a backend-only pipeline (§3) rather than a live tool.

Not a request for new backend/frontend work by itself - this is the planning document the port plan's §7 asked for, to be reviewed and adjusted before any of its phases start.

## 0. Terminology, to avoid the same ambiguity the port plan flagged

- **"whoobe-cms" / "Whoobe CMS"** is this product's brand name (see `docs/guides/WCMS_asset_management.md`, the `wcms_session` cookie, the `whoobe-cms` MinIO bucket, the MFA issuer string) - not a package or app. The monorepo/technical name is `pimcore-to-custom`; every workspace package is scoped `@pimcore-custom/*`.
- **`whoobe-one-spike`** - the app this plan is about integrating: the Vue 3 port of `whoobe-one-studio` (an external reference repo), living at `apps/whoobe-one-spike`, dev port 3006. Per §1, this becomes the CMS's advanced page composer - the word "spike" in its directory name is a holdover from its original proof-of-concept scope, not a statement about its intended permanence.
- **`whoobe-studio`** - a *different* app at `apps/whoobe-studio`, dev port 3004, today embedded live into `apps/admin-dashboard` (see §2 for how - kept as background/prior art). Per §1/§3, its role narrows to "the thing that proved Pimcore import into a modern composer was viable" and its logic is folded into a backend migration pipeline; its live iframe-embedded editor UI is retired, not kept running side-by-side. Not the same codebase as `whoobe-one-studio`/`whoobe-one-spike` despite the similar name - this is the single biggest source of confusion when discussing this plan out loud, so it's worth over-stating once here.

## 1. Product direction (settles what the port plan's §7 left open)

Recorded here verbatim in substance, since it's the basis for every decision below, not just background color:

- **Whoobe CMS is a standalone CMS product**, not "a nicer editor bolted onto a Pimcore migration tool." Its three pillars are: an advanced visual page composer (`whoobe-one-spike`), DAM (already real - `apps/asset-processor` + the DAM UI in `admin-dashboard`), and Data Objects modeling (not yet built - see §5). Pimcore migration is **one optional, pluggable pathway into the CMS**, not a requirement for using it - most users of Whoobe CMS will never touch it.
- **`whoobe-one-spike` is *the* page/document builder** - not a second option alongside `whoobe-studio`. It's explicitly a *modular* composer: snippets, elements, and per-node style customization already exist and are real (this session's whole body of work); **data integration - binding a page's content to structured data objects - is explicitly still to be designed**, not something this plan scopes (see §5).
- **The page/document data model's shape is driven by the CMS's own goal, not by what's easiest to bolt onto the existing minimal schema**: it needs to represent real website pages with the things a modern website actually needs - SEO (meta tags, structured data, canonical URLs), a sitemap, search indexing, multilanguage content, and general meta management. §4 proposes a concrete starting shape for this rather than deferring it the way the port plan deferred its own §7.
- **Pimcore migration remains available, but only as a plugin**: `whoobe-studio` was built specifically to prove that a real Pimcore document/page import into a more stable, user-friendly composer was possible at all - that job is done. Going forward, migration is a **backend-only import step** (extending `packages/migration-tool`, which already has a `migrate-documents` command per `DocumentsView.vue`'s own description) that converts Pimcore content directly into `whoobe-one-spike`'s own page format at import time. There's no live editor UI for this afterward - once a page is imported, it's edited exactly like any other page, in `whoobe-one-spike`. `whoobe-studio`'s standalone app and its iframe embedding in `admin-dashboard` are retired, not kept running as a parallel tool (see §3 for what specifically happens to its codebase).

## 2. Where `whoobe-one-spike` actually stands today

The port plan's §7 was written against Phase 0-3 (partial) - a demo document, no real persistence beyond browser-local Dexie. Since then (see `apps/whoobe-one-spike/README.md`'s "Round 2" onward), it has grown a real feature set:

- **Real backend persistence for its own library content**: `whoobe_one_templates`, `whoobe_one_kits`, and `whoobe_one_snippets` (`packages/core/src/db/whoobe-one-{template,kit,snippet}-schema.ts`) - real Postgres tables, served by `core-api`, consumed via the app's own `templates-api.ts`/`kits-api.ts`/`snippets-api.ts`. **This is the load-bearing architectural fact for §6**: unlike `whoobe-studio` (which has no API client of its own - see §3 - and relies entirely on its host to persist on its behalf), `whoobe-one-spike` already makes its own direct, authenticated REST calls against `core-api`. Embedding it does not need a document-sync bridge the way `whoobe-studio` did.
- **Real DAM integration already done**: `MediaPickerModal.vue`/`dam-api.ts` browse and pick real assets from `apps/asset-processor`'s own API, resolved via stable `pimcorePath` values (never a baked-in presigned URL) - the exact same DAM this monorepo already has, not a stand-in.
- **A materially richer editing surface than the port plan anticipated**: a from-scratch Slider element (autoplay/cycling/tabs-vs-arrows nav, per-part Tailwind class overrides), a real `@lucide/vue` icon system used throughout the whole editor chrome, a Kit/Template gallery with live thumbnails, Save/Save As, device-mode (mobile/tablet, portrait/landscape) preview. None of this exists in `whoobe-studio` or has an equivalent in `WhoobeBlockNode` (§3's data model) - this is direct evidence for §1's product direction, not just a feature list.
- **Still missing**: any embedding into `admin-dashboard`, a page/document data model that actually represents a website page (§4 - `whoobe_one_templates` today is a flat name/category/path/node shape, nothing SEO/sitemap/locale-aware), and a production build/deploy story (dev-only, `pnpm --filter @pimcore-custom/whoobe-one-spike dev`).

## 3. Pimcore migration as a backend-only plugin

- **What retires**: `apps/whoobe-studio`'s standalone app as a *live, embedded editor* - specifically `WhoobeStudioEmbed.vue`, `whoobe-host-bridge.ts` (the `admin-dashboard`-side half of the bridge), and `apps/whoobe-studio/src/bridge.ts` (its own side). The reason this pattern existed at all: `whoobe-studio` has no API client of its own for documents (confirmed - there's no `documents-api.ts` inside `apps/whoobe-studio`; that file lives in `admin-dashboard`, and it's the *host* that calls `PATCH /documents/:id` on the bridge's `UPDATE_DOCUMENT` callback). That architecture was a reasonable way to prove the editing loop worked against real migrated content quickly; it's not a foundation to keep building on now that `whoobe-one-spike` exists and has its own real persistence.
- **What replaces it**: `packages/migration-tool`'s existing `migrate-documents` command (today converting Pimcore documents into `cms_documents`/`WhoobeBlockNode`) gets **retargeted at the new page schema (§4)** instead - Pimcore document → `whoobe-one-spike`'s own page/content-tree shape, written directly into whichever table §4 lands on. No intermediate `cms_documents` row, no live editor round-trip needed to "finish" an import - the CLI's own conversion output *is* a finished, editable page from the moment it lands.
- **What's genuinely new work, not free**: the actual Pimcore-brick → `whoobe-one-spike`-`Element` conversion logic doesn't exist yet in this shape - `whoobe-studio`'s own bridge/embed code proved the *editing* loop against migrated content, not a batch conversion function with no live UI involved. Whatever Pimcore-parsing logic already exists inside `packages/migration-tool` (it must have *some* document-shape understanding already, to produce today's `WhoobeBlockNode` output) is the right starting point to retarget, not a from-scratch rewrite - but this plan doesn't assume that retargeting is trivial, and it should be scoped as its own phase (§8, Phase 2) with a real look at that existing code before estimating it.
- **What happens to the `whoobe-studio` codebase itself**: not deleted by this plan's own authority - that's a separate call - but its ongoing purpose is fully served once the CLI conversion path above covers what it currently proves. Recommend archiving it (stop running/maintaining the live app, keep the git history) once Phase 2/4 (§8) show the CLI path handles real migrated documents at least as well as opening them in `whoobe-studio` did. `cms_documents`/`WhoobeBlockNode` (`packages/core/src/db/cms-schema.ts` / `packages/core/src/cms/block-schema.ts`) likely goes with it, once nothing depends on that schema anymore - not touched by this plan directly, since retiring a schema that other things might still read is its own careful step, not a side effect to wave through here.

## 4. The page/document data model — Phase 0 outcome (confirmed)

This is the part of the plan that most needs to be designed against the CMS's actual goal (§1), not the easiest thing to bolt onto what exists. The shape below reflects three decisions confirmed in review (superseding the first draft of this section, kept in git history rather than restated as still-open):

1. **Status model: `published: boolean` + `workflowState: text | null`**, not a simple status string - deliberately the same shape `docs/plans/backend/object-publish-workflow-plan.md` already designed for Data Objects (§2.1 there: `published` is the hard public-API-visibility gate; `workflowState` is editorial/organizational only, and does not itself gate visibility except through an explicit workflow-transition side-effect). That plan already calls out Documents as "the identical mechanism... treated as a fast-follow" - this adopts that shape directly for pages too, rather than inventing a third, competing status vocabulary alongside `cms_documents.status` (simple text) and the Data Objects plan's own split. A class/page with no workflow configured just gets plain Draft/Published toggling for free (`workflowState` stays `null`) - the common case still doesn't require authoring a workflow.
2. **Slug uniqueness: per `(locale, slug)`, not global** - two different locales can legitimately reuse the same slug string (a real case for a multi-locale site where slugs aren't always further localized); a single global unique constraint (as `cms_documents.slug` has today) would incorrectly reject that.
3. **Fresh table, `whoobe_pages`** - not `whoobe_one_templates` renamed in place. Existing rows in `whoobe_one_templates` are this session's own pre-production test/demo data and are left behind, not migrated - `whoobe_one_templates` itself is left as-is (Kits/Snippets are unaffected either way; they remain genuinely reusable building blocks, a different concept from a page).

**`seo`/`sitemap`/`search` are real typed interfaces, not untyped `jsonb`** - unlike `content` (which must stay loosely typed, since the `Element` shape it holds lives in a frontend app, not this backend package - same treatment `whoobe_one_templates.node` already gets and for the same reason), none of these three depend on any frontend-only type, so there's no reason not to give them real structure and get type-checking on them:

```ts
export interface PageSeo {
  metaTitle?: string | null
  metaDescription?: string | null
  canonicalUrl?: string | null
  robots?: { index: boolean; follow: boolean } | null
  ogTitle?: string | null
  ogDescription?: string | null
  ogImage?: string | null
  structuredData?: Record<string, unknown> | null // JSON-LD, verbatim
}

export interface PageSitemapSettings {
  included: boolean
  priority?: number | null // 0.0-1.0, sitemap.xml's own convention
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never' | null
}

export interface PageSearchSettings {
  indexable: boolean
  keywords?: string[] | null
}
```

**Table** (Drizzle, matching this codebase's existing schema-file conventions - `pgTable`, `jsonb(...).$type<...>()` for the typed columns above, `uniqueIndex` for real constraints):

```ts
export const whoobePages = pgTable(
  'whoobe_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    translationGroupId: uuid('translation_group_id').notNull().defaultRandom(),
    locale: text('locale').notNull().default('en'),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    category: text('category').notNull().default(''),
    published: boolean('published').notNull().default(false),
    workflowState: text('workflow_state'),
    content: jsonb('content').notNull(),
    seo: jsonb('seo').$type<PageSeo>(),
    sitemap: jsonb('sitemap').$type<PageSitemapSettings>(),
    search: jsonb('search').$type<PageSearchSettings>(),
    pimcoreId: text('pimcore_id'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // (locale, slug), not slug alone - decision 2 above.
    localeSlugIdx: uniqueIndex('whoobe_pages_locale_slug_idx').on(table.locale, table.slug),
    // Doubles as the "all translations of this page" lookup index (leading
    // column), so no separate plain index on translationGroupId alone.
    translationGroupLocaleIdx: uniqueIndex('whoobe_pages_translation_group_locale_idx').on(
      table.translationGroupId,
      table.locale
    ),
    // Nullable-unique, same pattern cms-schema.ts's own pimcoreId already
    // uses - Postgres allows multiple NULLs through a unique index, which is
    // exactly right here (most pages won't have one at all).
    pimcoreIdIdx: uniqueIndex('whoobe_pages_pimcore_id_idx').on(table.pimcoreId),
  })
)
```

`translationGroupId` defaults to a fresh random UUID at insert time (same mechanism as `id`), never left `null` - a page with no translations yet still gets a real group id so a later translation can attach to it without a backfill migration.

**A natural future fit, not scope added now**: the Data Objects plan's own `object_preview_tokens` mechanism (a public, scoped, temporary preview link for sharing an unpublished draft) is designed to generalize - `whoobe_pages` should plan to reuse that same mechanism once it exists, rather than growing a second, page-specific preview-link system. Not built here; noted so Phase 1 doesn't accidentally reinvent it.

Notes on the specific requirements §1 named, each addressed directly rather than folded into a vague `metadata: jsonb` catch-all (which is what `WhoobeBlockNode` does today, and part of why it doesn't validate or communicate what's actually expected):

- **SEO**: a structured `seo` object, not free-form - meta title/description, canonical URL, robots directives, Open Graph fields, and a slot for structured data (JSON-LD) are all named, known needs, not a guess. Whether this needs per-locale overrides beyond what "one row per locale" already gives it (it does, automatically, since each locale is its own row) is not a separate design problem.
- **Sitemap**: `included`/`priority`/`changefreq` map directly onto a standard `sitemap.xml` generator's own inputs - deliberately not more than that yet (no per-page custom sitemap XML, no image/video sitemap extensions) until there's an actual need past the standard case.
- **Search**: scoped narrowly and honestly - this table only carries *per-page opt-in and hints* (`indexable`, optional `keywords`). Building an actual search index (Postgres full-text, an external service, whatever it ends up being) is a separate, later system that would *read* this table, not a field to design here as if the whole search feature were being speced in one row.
- **Multilanguage**: one row per locale (the "one row per locale" decision from this plan's own review), linked via a shared `translationGroupId` rather than each row knowing about every other translation directly - adding a new locale to an existing page's translation group, or looking up "the Italian version of this page," is a simple query either way, and no Element/content-tree code needs any awareness of translation at all (each locale's content tree is fully independent, which also sidesteps having to design "which parts of a Slider's settings are translatable" as its own question).
- **Meta management**: covered by `seo` above plus `title`/`category`/`status` at the page level - "meta management" as a named requirement is addressed by the same structured fields, not a separate system.

**Explicitly not designed here**: how `content` (the `Element` tree) itself changes, if at all, to support any of the above inline (e.g., per-element SEO hints, an element that renders differently per locale beyond plain text content) - the working assumption is that page-level SEO/sitemap/search metadata is enough for now and the content tree doesn't need new fields for this specific requirement set, but that assumption should be checked against real requirements before Phase 2 (§8) starts, not assumed permanently true.

## 5. Data integration / Data Objects modeling (explicitly deferred, not designed here)

Per §1, this is real, acknowledged future scope, not an oversight:

- `whoobe-one-spike`'s own modularity story (snippets, elements, style customization) is already built; **binding an element or a page to structured data** - a product listing bound to a "Product" data object, a blog page bound to a "Post" - is the missing fourth piece, and its design isn't attempted in this document.
- Some groundwork already exists to build on, not from zero: `WhoobeBlockNode` already has a `dataBinding` field (`packages/core/src/cms/block-schema.ts`) - unused today (per the port plan's own research, whoobe-studio's Data Object picker is a full stub, since Data Objects/PIM don't exist yet either) but at least a prior attempt at naming the same concept, worth reviewing before designing `Element`'s own equivalent from scratch.
- This plan's only concrete recommendation here: **don't block §4 on solving this.** Land the page schema without a data-binding concept first (an ordinary optional field can be added to `content`'s `Element` shape later without a breaking migration, the same way `tabLabel`/`slider` were added to `Element` incrementally over the course of this session's own work), and design Data Objects modeling + `whoobe-one-spike` data integration as its own follow-up plan once Data Objects modeling itself has a real design - the two need to be designed together, and neither should wait on the other being fully speculative right now.

## 6. Embedding `whoobe-one-spike` into `admin-dashboard`

Lighter than `whoobe-studio`'s own mechanism, and deliberately so - not because the precedent was wrong, but because `whoobe-one-spike`'s own architecture (§2) makes most of it unnecessary:

- **No document-sync bridge needed.** `whoobe-studio`'s `postMessage` bridge (`WhoobeHostBridge`/`WhoobeStudioBridge`, `SYNC_DOCUMENT` in / `UPDATE_DOCUMENT` out) exists specifically because `whoobe-studio` has no way to load or save a document on its own - the host must hand it data and persist whatever comes back. `whoobe-one-spike` already loads and saves its own content directly against `core-api` (exactly like it already does for templates/kits/snippets today) - once it's pointed at the real page table (§4), opening/saving a specific page is just its own existing API-client pattern, not a new bridge.
- **What embedding actually needs**:
  1. **An iframe**, still - not to bridge documents, but because `whoobe-one-spike` runs Tailwind entirely at runtime in the browser (`@tailwindcss/browser`, scanning the live DOM of whatever page it's loaded into). Mounting its components directly inside `admin-dashboard`'s own document would mean that runtime scanner running against `admin-dashboard`'s *entire* DOM, and `admin-dashboard`'s own build-time Tailwind setup never seeing the spike's dynamically-constructed classes at all. An iframe keeps both fully isolated - separate document, separate Pinia stores, separate `main.ts` bootstrap - with zero risk of the two interfering.
  2. **A way to tell the iframe which page to open** - simplest option: a query param (`?pageId=<id>`), read once on mount, used to call `whoobe-one-spike`'s own existing load-a-page API. No new message protocol needed for this at all.
  3. **A lightweight, one-way "I'm embedded" signal**, reusing the same `parentOrigin` query-param convention `whoobe-studio` already established (so there's still exactly one convention in this codebase for "how does an embedded app know its parent," not two) - useful for e.g. hiding standalone-app-only chrome (the "Whoobe One Spike" top bar branding, the standalone Templates-gallery entry point if pages are now reached from `admin-dashboard`'s own nav instead) when running inside the CMS shell. This does not need to be a bidirectional bridge class - a single `origin` check at startup is enough, since there's no ongoing message traffic to secure the way `whoobe-studio`'s live document sync needed.
- **Auth already works for free**: neither app has ever needed its own login flow - both rely on the existing `wcms_session` cookie (`packages/core/src/auth/session.ts`), host-scoped (not port-scoped), already shared across every dev port (dashboard 3000, core-api 3003, spike 3006) as long as they're reached via the same hostname. Nothing new needed here.

## 7. Where it plugs into `admin-dashboard`'s UI

- A page-listing view (e.g. `/pages` → `PagesView.vue`), replacing `DocumentsView.vue`'s current role once §3/§4 land - listing rows from the new page table (§4), reusing the shape `getTemplateGallery()` already establishes (`apps/whoobe-one-spike/src/scripts/database-actions.ts`) for a live-thumbnail gallery, the same visual pattern `whoobe-one-spike` already built for its own Kit/Template galleries.
- Opening a page is a new tab type in `tabsStore.ts` (mirroring the existing `openDocument()` pattern) wrapping the embed from §6, pointed at that page's id.
- `MasterDocumentTab.vue`'s Editor/Preview toggle and `WhoobeStudioEmbed.vue` go away with `whoobe-studio` (§3) - not left running alongside the new tab type.
- The dashboard's nav (`DashboardLayout.vue`) swaps its Documents entry for Pages (or keeps both labels pointed at the same underlying view, if "Documents" is worth keeping as the user-facing term - a naming call, not a technical one).

## 8. Proposed phases

Mirroring the port plan's own phase-tracking convention (status inline, not a separate tracker):

- **Phase 0 - Schema review: DONE**, see §4 - status model (`published`/`workflowState`, matching the Data Objects publish-workflow plan), slug uniqueness (`(locale, slug)`), and table strategy (fresh `whoobe_pages`, not `whoobe_one_templates` renamed) all confirmed. `seo`/`sitemap`/`search` given real typed interfaces rather than untyped `jsonb`.
- **Phase 1 - Data model** (not started): build the new page table/schema from Phase 0's confirmed shape; migrate `whoobe-one-spike`'s existing save/load code (`database-actions.ts`) to read/write it instead of `whoobe_one_templates`' current flat shape.
- **Phase 2 - Migration pipeline retarget** (not started): point `packages/migration-tool`'s `migrate-documents` command at the new schema instead of `cms_documents`/`WhoobeBlockNode` (§3) - review what Pimcore-parsing logic already exists there first, since it's the right starting point, not a rewrite.
- **Phase 3 - Embedding** (not started): §6's iframe + query-param loading + `parentOrigin` signal, provable in isolation against a real page from Phase 1 before any UI wiring depends on it.
- **Phase 4 - UI wiring** (not started): §7's `PagesView.vue` + tab type; retire `MasterDocumentTab.vue`'s `whoobe-studio` Editor mode and `DocumentsView.vue` (or repoint them at the same new view, per §7's naming note).
- **Phase 5 - Pilot** (not started): a handful of real migrated pages (Phase 2) and a handful of from-scratch ones, end-to-end, before wider rollout and before archiving `whoobe-studio` (§3) for real.
- **Phase 6 - Deploy** (not started): neither app has a production deploy path in this repo yet (`docker-compose.yml` today only defines Postgres/MinIO) - `whoobe-one-spike` needs a real production build served under the same hostname as `admin-dashboard`/`core-api` (§6's cookie-sharing requirement doesn't go away in production); its `@tailwindcss/browser` runtime bundle (~282KB, per that app's own README) ships as part of that build already, a stated, accepted tradeoff for an editing tool, not something to also ship as the published output.

## 9. Open risks, stated rather than hidden

- **§4's schema is confirmed, but only against what §1 named as requirements today** - SEO/sitemap/search/multilanguage/meta. If a real requirement surfaces later that these fields don't cover (a new Open Graph field, a different sitemap extension), that's a normal additive migration, not evidence the schema review was wrong - not every future field needs to be anticipated now.
- **§3's migration retargeting cost is unknown until someone reads the existing `migrate-documents` conversion code** - this plan assumes it's a reasonable starting point, not a rewrite, but that's an assumption, not a confirmed fact yet.
- **`whoobe-one-spike`'s own README documents zero interactive-in-browser confirmation for almost every feature it lists** (typecheck/build clean, logic verified directly, but "not yet interactively confirmed" appears throughout its changelog) - Phase 5's pilot is where that finally gets tested against real usage, not before.
- **Retiring `whoobe-studio` removes the only currently-proven Pimcore-import path before its replacement is proven** - Phase 2/5 need to actually demonstrate the new pipeline handles real migrated content before `whoobe-studio` is archived for good, not just assume the retarget "should" work the same way.
