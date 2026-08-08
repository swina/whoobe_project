# Website Menus — Implementation Plan

## Goal

Transform the current free-form menu editor (flat `MenuItem[]` with raw label/pageId/url inputs) into a **website navigation tree** that mirrors the site's URL path hierarchy and serves as the primary interface for associating pages with navigable paths.

---

## Current State (Phase 2b)

- `menus` table: flat JSONB `MenuItem[]` with `{ label, pageId?, url?, children[] }` — no path concept
- `whoobe_pages` table: flat `slug` (e.g. `"about-us"`), no hierarchical path; has nullable `websiteId`
- `MasterWebsiteTab.vue` Menus sub-tab: inline editor listing all menus, `MenuItemRow` for each item
- `MenuItemRow.vue`: raw UUID text input for `pageId` — no page picker, no drag-and-drop
- API: `GET /whoobe-one/pages` returns **all** pages, no `?websiteId=` filter
- `pagesStore.refreshPages()` loads everything globally, no website-scoped filtering

---

## Implementation Phases

### Phase 1 — Backend: Page Path & Website-Scoped Filtering

**1a. Add `path` column to `whoobe_pages`**

- Schema: new `text` column `path` on `whoobe_pages` (nullable, default `null`)
- Purpose: stores the full hierarchical URL path (e.g. `"/about/team"`) derived from menu tree association
- The `slug` column stays as-is (single segment); `path` is the full slash-delimited path set by the menu association
- Migration: existing pages get `path = '/' + slug` as a one-time backfill

**1b. Add `?websiteId=` filter to pages list API**

- `listWhoobePages(websiteId?)` in `whoobe-pages-records.ts`: add optional `websiteId` param, filter with `and(...)` if provided
- `GET /whoobe-one/pages` route: read `req.query.websiteId`, pass to `listWhoobePages()`
- `fetchPages(baseUrl, websiteId?)` in `pages-api.ts`: add optional param
- `pagesStore.refreshPages(websiteId?)`: add optional param, add `filteredPages(websiteId)` getter that returns only pages for that website when loaded

**1c. Add `path` field support to pages API**

- `PATCH /whoobe-one/pages/:id`: accept and update `path`
- `MenuItemRow` inline editor: replace raw UUID input for `pageId` with page search/picker (built in Phase 3)

### Phase 2 — Redesign MenuItem as Path Node

**2a. Extend `MenuItem` interface** (`menus-schema.ts` / `menus-api.ts`)

```ts
interface MenuItem {
  label: string           // display label (auto-derived from page title if linked)
  pageId?: string | null  // linked page UUID
  url?: string | null     // external URL (mutually exclusive with pageId)
  children?: MenuItem[]
  path?: string           // auto-computed: concatenation of ancestor labels + own label
}
```

The `path` is derived client-side by walking the tree and joining labels with `/`.

**2b. Improve MasterWebsiteTab Menus sub-tab**

- Instead of separate menus (like "Main Menu", "Footer Menu"), each `MenuRecord` represents a **navigation group** (header nav, footer nav, sidebar, etc.)
- Each group renders a tree of path nodes — the tree _is_ the navigation structure
- Rename labels from vague "New Item" to meaningful defaults based on context

**2c. Path derivation on save**

When saving a menu's items, auto-compute each node's `path` by joining ancestor labels with `/`:
- Root node `About` → path `/about`
- Child `Team` → path `/about/team`
- Child `Engineering` → path `/about/team/engineering`

This derived path is stored temporarily in the `MenuItem.path` field and used when associating a page.

### Phase 3 — Page Picker Drawer

**3a. New component: `PagePickerDrawer.vue`**

- Right-side drawer triggered when clicking a menu tree node that has no `pageId`
- Shows pages for this website + locale (filtered via `?websiteId=` + `locale`)
- Columns: title, slug, published status badge, locale badge
- Search/filter bar at top
- Each row is draggable
- "Create new page" button at bottom (opens quick-create form)

**3b. Page picker from MenuItemRow**

- When a menu item has no `pageId` and no `url`, show a "Link page" button (replaces the raw UUID input)
- Clicking it opens `PagePickerDrawer` scoped to this website's locale
- Selecting a page sets `pageId` and auto-updates `label` to match the page's `title`

**3c. Quick-create page flow**

- From the drawer, "Create new page" opens an inline form: slug, title, locale
- Creates the page via `POST /whoobe-one/pages`, assigns `websiteId`, then links it to the menu node
- Auto-sets the page's `path` from the derived menu tree path

### Phase 4 — Drag-and-Drop

**4a. HTML5 drag-and-drop within menu tree**

- Drag to reorder tree nodes (replace current ▲/▼ buttons)
- Drag a node to reparent it under a different parent
- Use native HTML5 drag events (`dragstart`, `dragover`, `drop`) to avoid new dependencies

**4b. Drag page from picker onto tree node**

- In `PagePickerDrawer`, each page row is `draggable="true"`
- Each menu tree node is a drop target
- Dropping a page onto a node: sets `pageId`, updates `label` to page title, **updates page's `path`** via `PATCH /whoobe-one/pages/:id` to match the menu node's derived path
- Show visual drop indicators (highlighted zone, "+" icon)

### Phase 5 — Path Conflict & Visibility Handling

**5a. Path uniqueness per locale**

- `path` + `locale` + `websiteId` — unique constraint (or application-level check)
- When associating a page with a menu node, if another page already has that path, show a warning and offer to swap

**5b. Published/draft distinction in tree**

- Menu tree nodes linked to published pages show a green dot; draft pages show amber
- The production website only renders published pages, but the admin tree shows both
- Tooltip on hover: "Page: About Us (Published)" or "Page: About Us (Draft)"

**5c. External URL nodes**

- Nodes with a `url` instead of `pageId` show a link icon and render as external links on the production site
- In the tree, these are visually distinct (no page status dot, different icon)

---

## Files to Modify

| File | What Changes |
|------|-------------|
| `packages/core/src/db/whoobe-pages-schema.ts` | Add `path` text column |
| `packages/core/src/db/whoobe-pages-records.ts` | `listWhoobePages(websiteId?)` filter; `updateWhoobePage` accepts `path` |
| `packages/core/src/db/menus-schema.ts` | Add optional `path` to `MenuItem` interface |
| `apps/core-api/src/server.ts` | `GET /whoobe-one/pages` accept `?websiteId=`; `PATCH` accept `path` |
| `apps/admin-dashboard/src/utils/pages-api.ts` | `fetchPages(baseUrl, websiteId?)`; update `WhoobeOnePage` type |
| `apps/admin-dashboard/src/stores/pagesStore.ts` | `refreshPages(websiteId?)`; add `filteredPages` getter |
| `apps/admin-dashboard/src/utils/menus-api.ts` | Add `path` to `MenuItem` type |
| `apps/admin-dashboard/src/components/settings/MenuItemRow.vue` | Replace raw pageId input with "Link page" button + drop target; path display |
| `apps/admin-dashboard/src/components/websites/MasterWebsiteTab.vue` | Pass locale to page picker; auto-derive paths on save |
| `apps/admin-dashboard/src/components/websites/PagePickerDrawer.vue` | **New** — right drawer for page selection |
| docs/plans/website/website-menus.md | This plan |

---

## Out of Scope

- **Production frontend rendering**: this plan covers the admin UI only. Rendering the menu tree on the public website is a separate task.
- **Multi-level path validation**: e.g., preventing a node from being both a page-type and external-url-type at the same level.
- **Page delete cascading**: if a linked page is deleted, the menu node should show a "broken link" warning but not auto-delete.