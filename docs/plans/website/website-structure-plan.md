# Website Serving & Rendering Plan

## Current State

The CMS has **no website object, no public serving layer, no renderer**. All page routes require authentication. The only rendering code lives inside `whoobe-one-spike` as client-side Vue preview components coupled to `@tailwindcss/browser`. The `content` field is an untyped recursive Element tree with optional data bindings.

## Design Decisions

### 1. Website Data Model

**Option A: Implicit single-site** — No website table. All pages are part of one site. The domain/base URL is a config setting. Simplest start but cannot support multi-tenant.

**Option B: Explicit multi-site** — A `websites` table with `id`, `name`, `domains` (text[]), `defaultLocale`, `supportedLocales` (text[]), and a `website_id` FK on `whoobe_pages`. Pages are scoped to a website. A middleware resolves the domain to pick the right site. Also supports separate nav/menus per site.

**Recommendation: Option B.** The website doc explicitly asks about "multiple website multilanguage." Adding a FK later to a populated table is painful. Start with the columns nullable so single-site works without configuring a website.

### 2. Navigation / Menu Structure

Pages exist as a flat list with slug+locale. A website needs a way to define navigation hierarchy (main menu, footer, etc.).

**Options:**
- A `menus` table: `id, website_id, name, items (jsonb)` — items being an ordered recursive array of `{ label, pageId?, url?, children[] }`
- A `parent_id` on `whoobe_pages` for page hierarchy
- Navigation is part of website settings JSON

**Recommendation:** Separate `menus` table with JSONB `items`. Keeps page content independent of navigation hierarchy (pages can be in multiple menus, or none). Matches the existing pattern of JSONB for flexible data (like `PageSitemapSettings`).

### 3. Serving Architecture — Options

| Approach | SEO | Dynamic Data | Complexity | Hosting |
|---|---|---|---|---|
| **Headless API** | Poor (JS-only) | Full | Low | Any |
| **SSR (Node.js)** | Good | Full | Medium | Node server |
| **SSG** | Good | Snapshot | Low-Medium | Static file server |
| **Hybrid (SSR+SSG)** | Good | Full | High | Node server |
| **SPA renderer** | Poor | Full | Low | Any |

**Issue with SSR/SSG:** The Element tree uses Tailwind utility classes directly (`text-3xl font-bold`). The preview relies on `@tailwindcss/browser` to scan the DOM and generate CSS at runtime. For SSR/SSG, you'd need to either:
- Include the full Tailwind CSS output (bloated)
- Scan the tree at build time and generate only used utilities (Tailwind's JIT mode)
- Use the `tailwindcss` CLI to generate the CSS from a content glob

**Recommendation:** Start with **Headless API + SSR** as a layered approach:
1. **Phase 1:** Public API endpoints (headless) — anyone can build their own frontend
2. **Phase 2:** SSR renderer — extract preview components to a `@whoobe-cms/whoobe-renderer` package, add Node.js Express middleware that renders pages server-side
3. **Phase 3 (future):** SSG build command for static hosting

### 4. Public API Endpoints

Required endpoints for a headless first phase:

| Endpoint | Purpose |
|---|---|
| `GET /public/pages/:locale/:slug` | Resolve a single page by locale+slug (return full page JSON) |
| `GET /public/pages` | List published pages (filter by locale, website) |
| `GET /public/sitemap.xml` | Auto-generated sitemap from `PageSitemapSettings` |
| `GET /public/robots.txt` | Configurable robots.txt per website |
| `GET /public/menus/:websiteId` | Return menu structure for a website |

All respect the `published` gate and `search.indexable`/`sitemap.included` flags.

### 5. Renderer Package Architecture

Extract from `whoobe-one-spike` into a shared `@whoobe-cms/whoobe-renderer`:

- **Recursive tree walker** — walks the Element tree, resolves data bindings (server-side via data-objects API), produces a render tree
- **Component renderers** — port the existing preview components (`BlockContainerPreview`, `BlockElementPreview`, `BlockSliderPreview`, `BlockIFramePreview`) to work in a non-Vue context or as pure rendering functions
- **CSS extractor** — given an Element tree, find all Tailwind classes used, generate the minimal CSS via Tailwind's JIT API
- **HTML template** — wraps the rendered tree in a full HTML document with the generated CSS, SEO meta tags, structured data

### 6. Data Binding Resolution

Currently client-side only (`data-resolver.ts`). For SSR:
- Server-side resolver that calls the data-objects public API
- Resolved data is embedded in the HTML response (for hydration or static rendering)
- Supports the same modes: `explicit`, `query`, `first`

## Implementation Roadmap

```
Phase 1 — Website Foundation (backend)
├── `websites` table + schema + records (CRUD)
├── `website_id` FK on whoobe_pages (nullable)
├── `menus` table + schema + records (CRUD)
├── Seed default website for single-site mode
├── Public page endpoint: GET /public/pages/:locale/:slug
├── Public sitemap.xml endpoint
└── Public robots.txt endpoint

Phase 2 — Website Admin UI
├── Admin-dashboard: Website settings (domain, locales)
├── Admin-dashboard: Menu editor (drag-and-drop tree)
├── Admin-dashboard: Page → Website assignment
└── Admin-dashboard: Navigation preview

Phase 3 — Renderer Package
├── Extract `@whoobe-cms/whoobe-renderer` package
├── Recursive tree renderer (server-side)
├── Tailwind JIT CSS extraction
├── Data binding resolution (server-side)
├── SSR Express middleware
└── Full HTML output with SEO meta + structured data

Phase 4 — Renderer Preview in CMS
├── Admin-dashboard Preview tab uses renderer
├── Preview tokens for unpublished pages
└── Device preview modes (desktop/tablet/mobile)

Phase 5 — SSG (future)
└── CLI command to build all pages to static HTML
```

## Key Technical Risks

1. **Tailwind runtime dependency** — `@tailwindcss/browser` is fundamentally a client-side tool. SSR would need a Node.js equivalent or build-time CSS generation
2. **Data binding resolution** — The server-side resolver needs access to the same data-objects API and must handle the same binding modes
3. **Element tree versioning** — The `content` field has no schema version. If the Element class evolves, old content may not render. A version field + migration path is needed
4. **Performance** — Deep recursive trees with many data bindings could be slow to render per-request. Caching strategy (CDN, Redis, or SSG) is important for production