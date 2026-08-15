# Website Templates

Planning document for **Website Templates** — a reusable page composition (header / aside / body / footer) built from Whoobe pages, so a website doesn't hand-assemble the same chrome on every page. This is a plan; nothing here is implemented yet.

A website is normally composed of three repeated regions plus the routed content:

- **header** — menus and other data that replicate on every page
- **body** — the routed page content
- **footer** — menus, address, references that replicate on every page

A Website Template is a named composition of those regions, where each region is filled with **module pages** (reusable fragments) and the body is whatever page the route resolves to.

## Context

### What already exists

- **Pages are the building blocks.** `whoobe_pages` (`packages/core/src/db/whoobe-pages-schema.ts`) holds the real, publishable pages: `content` (the Element tree), `locale`, `slug`, `path`, `published`, `workflowState`, `websiteId`, SEO/sitemap/search. Pages are authored in `whoobe-one-spike` and published through the existing workflow gate.
- **Websites exist.** `websites` (`websites-schema.ts`) already carries `domains`, `defaultLocale`, `supportedLocales`, and a `settings` jsonb bag — the natural place for "default template" state, though a dedicated table (below) is cleaner.
- **Menus/routing exist.** `website_paths` holds menu trees; the public route `GET /public/pages/:locale/*` resolves a published page by slug/path (static + dynamic `{slug}` patterns) against a `websiteId`.
- **Headless SDK exists.** `@whoobe-cms/*` (schema/renderer/react/next/vue/svelte) already walks a page's Element tree into renderable components — the composition below is designed so consumers render header/body/footer with the same machinery, no new renderer.

### The gap

Pages have a `category` (free text) but no structural "this page is a reusable module" flag, and there is no per-website composition that says *which* module pages fill the header/footer/aside around a routed page. Today every page must repeat its own chrome.

## Design

### Page kind: `content` vs `module`

`whoobe_pages` gains a `kind` column, `'content' | 'module'` (default `'content'`, plain text not an enum so new kinds need no migration):

- **`content`** — a routable page; the body of a route. What routing and sitemaps operate on (unchanged behavior).
- **`module`** — a reusable fragment (header/footer/aside block). Not routable: excluded from route resolution and the sitemap. Still a normal page otherwise — authored/edited in the editor, translated, workflow-published.

### Website Template

New `website_templates` table — a named, per-website composition:

```
website_templates
  id            uuid pk
  website_id    uuid not null          -- templates are scoped to one website
  name          text not null
  description   text
  layout        jsonb not null         -- header/aside/footer slot config
  path_patterns text[] not null default []  -- routes this template applies to (glob), e.g. /it/news/*
  is_default    boolean not null default false  -- fallback template; at most one true per website
  created_at, updated_at
```

Layout slot shape (jsonb, typed):

```ts
interface TemplateSlot {
  pageIds: string[]          // whoobe_pages ids, kind = 'module'
  className?: string         // custom Tailwind/classes applied to the slot wrapper
  style?: string             // custom inline style applied to the slot wrapper
}
interface WebsiteTemplateLayout {
  header?: TemplateSlot | null
  aside?: TemplateSlot | null
  footer?: TemplateSlot | null
}
```

Rules (from the sketch):

- A slot with **no pages renders no output** — empty slot = no `<header>`/`<aside>`/`<footer>` wrapper at all.
- Every slot wrapper can carry **custom classes and style** (e.g. sticky header, aside width).
- The **body** is always the routed page itself; it is never part of the template's `layout`.
- Each website picks **one default template**; any number of additional templates can **override by path pattern**.

### Template selection at request time

On `GET /public/pages/:locale/*`:

1. Resolve the content page as today (static slug, then dynamic `{slug}` patterns).
2. Load the website's templates (from `websiteId` query param, or derived from `Host`/domain later). Pick the template whose `path_patterns` contains a match for the request path — most-specific/longest match wins — otherwise the `is_default` template.
3. For each non-empty slot, load its module pages (published, matching the request locale) and include their trees in the response.

### Public response shape

The public page response gains a `layout` object; `page`/`params` are unchanged (no breaking change):

```json
{
  "page": { "...": "routed content page, as today" },
  "params": {},
  "layout": {
    "template": { "id": "…", "name": "Main" },
    "header": {
      "className": "sticky top-0 z-40",
      "style": "",
      "pages": [ { "id": "…", "title": "Header", "content": { "…": "module element tree" } } ]
    },
    "aside": null,
    "footer": { "className": "", "style": "", "pages": [ { "id": "…", "title": "Footer", "content": { "…": "…" } } ] }
  }
}
```

No template configured → `layout: null` (current behavior for existing single-page sites).

### Consumer / headless SDK composition

The headless SDK (`@whoobe-cms/renderer` + adapters) already renders any Element tree into components. Composition is a thin helper, not a new renderer:

- A `composeLayout(bodyDescriptor, layout)` helper in `@whoobe-cms/renderer` (or each adapter) wraps the body descriptor with a semantic shell:
  - `<header class={slot.className} style={slot.style}>` → each module page's tree via `walkTree`
  - `<aside …>` → aside module trees
  - `<main>` → the routed body descriptor
  - `<footer …>` → footer module trees
- The Vue/Svelte/React `<WhoobePage>` gains a `layout` prop: when present it renders the full shell, otherwise just the body (backwards compatible).

## Scope & Non-Goals

**In scope**: page `kind` (content/module), the `website_templates` data model + CRUD API, admin UI in the Websites card (and a kind picker on pages), public-route template resolution + composed `layout` in the response, and headless-SDK shell rendering.

**Out of scope for now**: multi-website domain→website resolution at the public route (still requires the explicit `websiteId` query param, as today), a shared component library / server-side template partials beyond "pages marked as module", template versioning/history, and previewing a template with a *draft* module (modules must be published to appear publicly, matching the content page gate).

## Phases

### Phase 1 — Page kind (`content` / `module`)

- `whoobe_pages.kind` column (schema + migration), `'content'` default.
- Records: `getPublishedWhoobePageBySlug`/`listPublishedWhoobePages` and the admin page records expose `kind`; routing helpers (`isDynamicSlug` unaffected) skip `kind === 'module'` pages — modules never resolve a route and never appear in the sitemap.
- API: `PATCH /whoobe-one/pages/:id` accepts `kind`; page create accepts it too.
- Editor (`whoobe-one-spike`): `pages-api.ts`'s `WhoobeOnePage` type gains `kind`; the pages list passes it through (no new editor UI yet — kind is set from the dashboard).

### Phase 2 — Website Templates data model

- New `packages/core/src/db/website-templates-schema.ts` + `website-templates-records.ts` (typed `layout`/`pathPatterns`/`isDefault`; `listWebsiteTemplates(websiteId)`, `getWebsiteTemplate(id)`, `createWebsiteTemplate`, `updateWebsiteTemplate`, `deleteWebsiteTemplate`, `getDefaultWebsiteTemplate(websiteId)`, `getWebsiteTemplateForPath(websiteId, path)`).
- Migration; registered in `drizzle.config.ts` and exported from `packages/core/src/server.ts`.

### Phase 3 — CRUD API

All gated on `PERMISSIONS.SETTINGS_MANAGE` (same as mail settings):

- `GET /websites/:websiteId/templates` → metadata list (+ each slot's module page titles).
- `POST /websites/:websiteId/templates`, `GET/PATCH/DELETE /websites/:websiteId/templates/:id`.
- Validation: `pageIds` must reference `kind === 'module'` pages on the same website; at most one `is_default` per website (setting one clears the others).

### Phase 4 — Public composition

- Extend `GET /public/pages/:locale/*` (and the headless `getPage`/`ApiClient.getPage` types): after resolving the content page, resolve the template (path-pattern override → default), load the slot module pages, and include `layout` in the response. Module load failure (deleted/unpublished) degrades to an empty slot, never a 500 for the page.
- Sitemap: module pages already excluded (Phase 1).

### Phase 5 — Admin UI

- **Websites card** (`WebsiteSettingsCard.vue`, Settings → Websites): a "Templates" section — list/create/edit per website. Each template editor has:
  - name + description,
  - three slot editors (Header / Aside / Footer), each: a multi-select of the website's `module` pages, a `className` input, a `style` input,
  - "default template" toggle,
  - `path_patterns` editor (free-text globs, one per line).
- **Pages UI** (`PagesView`/`PageSettingsTab`): a Kind select (Content / Module) so authors mark reusable fragments. Module pages get a badge in the list and are excluded from the routed list preview.

### Phase 6 — Headless SDK shell

- `@whoobe-cms/renderer`: a `composeLayout(body, layout, options)` helper that walks the slot module trees (via the existing `walkTree`) and produces header/aside/main/footer descriptors; adapters (`react`/`next`/`vue`/`svelte`) add a `layout` prop to `<WhoobePage>` to render the shell (backwards compatible: no `layout` → body only).
- Guide (`docs/guides/headless-sdk.md`) documents the `layout` prop and a sample composition.

## Sequencing & Dependencies

Phase 1 → 2 → 3 → 5 can proceed independently of Phase 4/6; the data model and admin UI are usable (author templates, mark modules) before the public route composes them. Phase 4 (public composition) and Phase 6 (SDK shell) are the "make it appear on the site" halves and build on 1–3. Recommended order: **1 → 2 → 3 → 4 → 5 → 6** (route composition before the SDK shell, so the response shape is settled first; UI can overlap 3).

## File summary

New:
- `packages/core/src/db/website-templates-schema.ts`, `packages/core/src/db/website-templates-records.ts`
- `apps/admin-dashboard/src/components/websites/WebsiteTemplatesManager.vue` (and the slot editor inside it)

Modified:
- `packages/core/src/db/whoobe-pages-schema.ts` (+ `kind`), `whoobe-pages-records.ts`, migration
- `packages/core/drizzle.config.ts`, `packages/core/src/server.ts`
- `apps/core-api/src/server.ts` (templates CRUD + public-route `layout` composition)
- `apps/admin-dashboard`: `PagesView.vue`/`PageSettingsTab.vue` (kind), `WebsiteSettingsCard.vue` (Templates section), `utils/pages-api.ts`/a new `website-templates-api.ts`
- `apps/whoobe-one-spike`: `pages-api.ts` (`kind` passthrough)
- `packages/sdk/renderer` (`composeLayout`), `packages/sdk/{react,next,vue,svelte}` (`layout` prop), `docs/guides/headless-sdk.md`
- `CHANGES.md`

## Verification

- Typecheck/build clean across `packages/core`, `core-api`, `admin-dashboard`, `whoobe-one-spike`, and the SDK packages.
- Migration applied; `kind` and `website_templates` rows CRUDable via API.
- **Routing isolation**: a `kind='module'` page is never returned by `/public/pages/:locale/*` nor listed in `/public/sitemap.xml`.
- **Composition**: with a default template + module header/footer, `GET /public/pages/:locale/<path>` returns the content page with a `layout.header.pages[0].content` (the module's tree) and the slot `className`/`style`; an empty slot returns `null`; a path matching a template's `path_patterns` uses that template over the default.
- **SDK shell**: a fixture composed layout renders `<header>…<main>…<footer>` through the React and Vue adapters (SSR), body centered, modules as their own walked trees.
- **Regression**: a website with no templates returns `layout: null` and renders exactly as before.

## Open Questions / Risks

- **Locale of module pages**: modules should follow the request locale (an Italian route should show the Italian header). Phase 4 resolves slot pages by the request locale, falling back to the website `defaultLocale` when a translation is missing — confirm that fallback is desired rather than strict.
- **Module navigation state**: menus inside a header module often need "current page" highlighting; the module tree doesn't know the routed page. A later phase could pass the request path as render context to module bindings.
- **One default per website** is enforced app-level; a partial unique index (`unique(website_id) where is_default`) is the DB-level alternative if races become real.

## Resolved (implemented 2026-08-15)

All phases implemented:

- **Phase 1 — page kind**: `whoobe_pages.kind` (`'content'`/`'module'`, default `content`, migration `0028`). Routing (`getPublishedWhoobePageBySlug`/`listPublishedWhoobePages`) and the sitemap only consider `content` pages; new `listPublishedModulePages(websiteId, locale, defaultLocale)` returns published modules with a default-locale fallback. `POST`/`PATCH /whoobe-one/pages` accept `kind`; the editor + dashboard `WhoobeOnePage` types carry it.
- **Phase 2/3 — data model + API**: `website_templates` table (schema/records: `layout` slots with `pageIds`/`className`/`style`, `path_patterns` globs, one `is_default` per website enforced app-level; `getWebsiteTemplateForPath` = longest-path-pattern match else default) + `GET/POST/PATCH/DELETE /whoobe-one/websites/:websiteId/templates` (SETTINGS_MANAGE).
- **Phase 4 — public composition**: `GET /public/pages/:locale/*` resolves the template, loads the slot module pages, and returns a non-breaking `layout` object (`template` + `header`/`aside`/`footer` with `className`/`style`/`pages[{id,title,content}]`); a broken template degrades to no layout, never a 500.
- **Phase 5 — admin UI**: Pages settings gain a **Kind** select (Content/Module, with a module explanation); the website tab gains a **Templates** sub-tab (`WebsiteTemplatesManager.vue`: list + editor with per-slot module-page multi-select + wrapper classes/style + path patterns + default toggle), reachable from a **Templates** button in `WebsiteSettingsCard`.
- **Phase 6 — SDK shell**: `@whoobe-cms/renderer` gains `composeLayout(body, layout, options)` + `PublicLayout`/`ComposedLayout` types and `ApiClient.getPage` returns `layout?`; React/Vue/Svelte `<WhoobePage>` accept a `layout` prop and render `<header>/<aside>/<main>/<footer>` around the body (auto-composing when the fetched page has a template); `@whoobe-cms/next`'s `getPageData` composes for SSR.

Verified: all SDK packages (69 tests: schema 15, renderer 29, react 3, next 3, vue 4, svelte 3 + core 59) and typechecks pass; migration applied. Live end-to-end: a published content page + module page + default template on a temp website → `GET /public/pages/it/contatti?websiteId=…` returns the content page with `layout.template.name = "Main"`, `layout.header.className = "sticky top-0"`, the header module's content tree, an empty `aside` slot as null, and the module page itself does not resolve as a route (404).

Follow-up (same day): slots also accept **user-created elements** directly - `TemplateSlot.content` holds an Element tree (or array) rendered alongside the module pages, composed into the slot's `pages` by the public route and editable in the template manager via a "Custom elements (JSON)" editor. The public route infers the website from the resolved page when no `?websiteId` is sent, so headless consumers (whoobe-one-spike's renderer) get the composed layout without knowing the website up front; previews no longer append `?locale=` (the path carries it).

Snippets (same day): slots additionally reference `whoobe_one_snippets` via `TemplateSlot.snippetIds` - the reusable Element subtrees saved from the Whoobe One editor are the natural fit for header/footer reusable content. The public route composes referenced snippets into the slot's `pages`, and the template manager offers an "+ Add snippet" picker per slot (removable chips), alongside the module picker and custom-elements JSON. Order per slot: module pages → snippets → custom content.
