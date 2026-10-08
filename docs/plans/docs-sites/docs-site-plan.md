# Documentation sites from Markdown - Plan

**Status:** Decisions taken 2026-10-08 (section 13), phase 1 in progress · **Branch:** `feat/docs-sites`

## 1. Goal

A user keeps **Markdown documents** as assets in a DAM folder (uploaded, or written in the dashboard), defines an
**index** (table of contents), and Whoobe presents them as a **documentation site**: sidebar navigation, per-page table
of contents, previous/next, breadcrumbs, and **search**. The source is a folder of the asset library, not pages built in
the editor. It can be previewed in the dashboard, served live by the CMS and published as a static site.

Non-goals (for now): editing in a rich WYSIWYG (Markdown source + preview only), comments, user accounts for readers,
analytics. Versions of a documentation set and sync from Git are phase 3.

## 2. What already exists and is reused

| Need | Existing piece |
|---|---|
| Storage of the documents, versions, public/private | DAM: `folders` (`is_public`), `assets` (`version`, `s3_key`, `is_public`, CDN mirrors) |
| Domain, root path, theme, locales, preview | `websites` (`root_path`, `domains`, `default_locale`, `supported_locales`, `settings` jsonb, `theme_id`), `/site-root` + the preview routing |
| Full-text search, typo tolerance | `search_documents` (tsvector + pg_trgm; `website_id`, `locale`, `published`, `title`, `path`, `body`, `excerpt`), `src/search/{extract,indexer,query}.ts`, `GET /public/search` |
| Markdown to HTML | `marked` (core, dashboard, editor), the Markdown element and its editor window (source + live preview) |
| HTML sanitising | `sanitizeRichText` in `@whoobe-cms/schema` |
| Export/import between installations | website bundle (zip with `assets/`) |
| Static publication | `packages/publish` (`whoobe-publish`, `publish-site.sh`) |

Gaps found: `.md` is not a known file type (`packages/core/src/dam/file-type.ts` maps it to `application/octet-stream`), no
heading-id / front-matter / admonition handling, no docs layout, no docs-specific index.

## 3. Concepts and data model

**Docs site = a website of kind `docs`.** No new entity: `websites.settings` gets

```jsonc
{
  "kind": "docs",                       // absent or "site" = a normal website
  "docs": {
    "sourceFolder": "/docs/product",    // DAM folder holding the .md files (and their images)
    "homeDoc": "index.md",              // document shown at the root path (default: index.md, else the first)
    "navFile": "_nav.yml",              // optional manual index (YAML), inside the source folder
    "title": "Product documentation",   // header title (default: the website name)
    "editUrl": null,                    // optional "edit this page" link template
    "search": true
  }
}
```

A website of kind `docs` has no `whoobe_pages`; everything else (domain, theme colours/fonts/custom CSS, locales, preview
path) is shared with normal websites. No migration is needed (`settings` is jsonb); a later migration may add a `kind`
column if filtering by kind becomes common.

**Documents** are assets: `filename` `*.md`, `file_type` `MD`, `mime_type` `text/markdown`. Their content is read from
object storage, never copied into the database except in the search index. Folders below the source folder are the
sections; images referenced from a document are other assets in the same tree.

**Front matter** (optional, YAML between `---` lines at the top of a file):

```yaml
---
title: Install Whoobe        # default: first H1, else the file name
description: One-line summary used by search and meta description
order: 20                    # position among its siblings (default: alphabetical)
hidden: false                # not listed in the index, still reachable by its address
slug: install                # default: file name without extension
---
```

**Index (table of contents).**

- *Automatic* (default): built from the folder tree: a folder is a section (title from its `index.md`/`README.md` front
  matter, else the folder name), documents sorted by `order` then by name.
- *Manual*: `_nav.yml` (YAML) in the source folder, written by the dashboard's tree editor (drag to reorder, rename, hide,
  group) **and editable as text in the dashboard** (a YAML view of the same file, validated on save) or from Git:

```yaml
- title: Getting started
  items:
    - doc: getting-started/install.md
    - doc: getting-started/first-site.md
      title: Your first site
- title: Reference
  items:
    - doc: reference/api.md
    - link: https://example.org
      title: Changelog
```

Documents missing from a manual index are listed at the end under "Other" (the editor warns), so nothing becomes
unreachable silently. A reference to a missing document is reported, not fatal.
- *Per page*: the headings (`##`, `###`) of the document become the right-hand "On this page" list.

## 4. Rendering pipeline (one implementation, three consumers)

`packages/core/src/docs/` (pure functions, unit-tested, no I/O):

1. `parseDocument(source)` -> `{ frontMatter, body }`.
2. `renderMarkdown(body, ctx)` -> `{ html, headings, text }` with `marked`:
   - GitHub-flavoured Markdown (tables, task lists, strikethrough), heading ids (stable slugs, de-duplicated), anchor links;
   - code blocks with a language class (highlighting done by the consumer, client-side or at publish time);
   - admonitions `:::tip` / `:::warning` / `:::danger` / `:::note`;
   - **link rewriting** with `ctx`: `other.md#x` or `../guide/x.md` -> the document's route in the site; a link to an asset
     (image, pdf) -> its DAM URL (`/dam-asset/...` or the CDN mirror); a link to a missing document is flagged;
   - **sanitising by construction**: `sanitizeRichText` drops `id`/`name` attributes (needed for heading anchors), so the
     result is not passed through it as a whole. Instead the renderer is the only producer of attributes (every value
     escaped; heading ids generated by the pipeline; link and image URLs checked against a scheme allow-list), and each
     **raw HTML fragment found in the Markdown** is either escaped or passed through `sanitizeRichText` on its own.
     Raw `<script>`, event handlers and `javascript:` URLs never survive; tested with the same XSS corpus as the sanitizer.
3. `buildNavigation(tree, navFile)` -> sidebar tree, flat reading order (for previous/next), breadcrumbs per document.
4. `docToSearchDoc(...)` -> title, path, plain text body, excerpt, keywords for `search_documents`.

Consumers: the **API** (live and preview), the **search indexer** (on save) and the **static generator** (publish).

## 5. API

Authenticated (dashboard), permission-gated like the other settings/asset routes (route contract + docs updated):

| Route | Purpose | Permission |
|---|---|---|
| `GET /docs-sites/:websiteId/tree` | source tree, parsed front matter, the index (manual or automatic), warnings | `assets:list` |
| `PUT /docs-sites/:websiteId/nav` | write `_nav.yml` (validated against the tree) | `assets:edit` |
| `POST /docs-sites/:websiteId/documents` | create a document (path, content) | `assets:upload` |
| `PUT /docs-sites/:websiteId/documents/*` | save a document (new version of the asset) | `assets:edit` |
| `POST /docs-sites/:websiteId/reindex` | rebuild the site's search documents | `settings:manage` |
| `GET /docs-sites/:websiteId/preview/*` | the rendered page including drafts (private folders readable by the user) | `assets:view` |

Public (no login; only for documents whose DAM folder is public; rate limited like `/public/search`):

| Route | Purpose |
|---|---|
| `GET /public/docs/:websiteId/nav` | the sidebar tree |
| `GET /public/docs/:websiteId/page/*` | `{ title, html, headings, breadcrumbs, prev, next, updatedAt, editUrl }` |
| `GET /public/search?websiteId=...&type=doc` | existing endpoint, new document type `doc` |

Document visibility follows the DAM (`folders.is_public` / `assets.is_public`): a document in a private folder is not
served, indexed as published, nor included in a published site. The docs site editor shows which documents are private.

## 6. Search

- **Index**: `search_documents` gets documents of type `doc` (`SEARCH_DOCUMENT_TYPES` extended; `document_id` = asset id,
  `locale`, `website_id` = the docs website, `path` = the document's route, `payload` = section/breadcrumb). The records
  layer for assets calls the indexer on upload/replace/delete/rename, as it does for type `asset`; a reindex route heals drift.
  Headings are indexed as `keywords` (a title match ranks high) and give search results a deep link (`path#heading`).
- **Live**: `GET /public/search` as it is, with a result template in the docs layout (title, breadcrumb, excerpt with the match).
- **Published (static)**: at build time a compact index (`search-index.json`: id, title, path, headings, text split in
  fields) is generated and searched in the browser with a small client library (MiniSearch, ~7 kB) loaded on first use.
  No dependency on the CMS at runtime. Size guard: above a threshold (say 5 MB of text) the generator switches to
  per-section index shards loaded on demand, and warns.

## 7. Presentation

A **docs layout** shared by the preview, the live rendering and the static output:

- header (title, search box with Ctrl/Cmd-K, theme toggle, language selector when there is more than one locale);
- left sidebar: the index, collapsible sections, current document highlighted, scrolled into view;
- content: the HTML from the pipeline, with copy buttons on code blocks and anchor links on headings;
- right: "On this page" with scroll-spy;
- footer of each page: previous/next, last updated, optional "edit this page";
- responsive: the sidebar becomes a drawer on small screens;
- the website's **theme** (colours, fonts, custom CSS) styles it through CSS variables, so a docs site looks like the brand.

Where it runs: (a) a `DocsView` in the editor application (`whoobe-one-spike`) for preview and for the CMS-served site at
the website's root path (same routing as website previews); (b) the static generator emits the same markup and a small
vanilla JS for sidebar, scroll-spy, search and copy buttons (no framework, so the output hosts anywhere).

## 8. Dashboard

- **Create**: Settings > Websites > New > type *Documentation* (choose or create the source folder).
- **Documents** tab: tree of the source folder with create / upload (files, folder, zip) / rename / delete / move, an editor
  window per document (Markdown source + live preview, reusing the Markdown element's editor), private/public badge,
  front matter helper, warnings (broken links, missing images, documents not in the index).
- **Index** tab: tree editor for `_nav.yml` with "regenerate from folders".
- **Settings** tab: title, home document, edit URL, search on/off, languages, theme.
- **Preview** button and **Publish** (section 9).

## 9. Publication

`whoobe-publish --kind docs --website-id <id> --out-dir ./sites/docs` (and a question in `publish-site.sh`):

1. read the tree, index and documents through the API (the same pipeline, in the generator process);
2. write one HTML file per document (`/guide/install/index.html`), `sitemap.xml`, `robots.txt`, `404.html`, `search-index.json`,
   the CSS (Tailwind compiled with the theme) and the small JS;
3. copy or reference the images (CDN mirror URL when mirrored, else copied under `/assets/`);
4. report broken links and private documents left out; exit non-zero on broken internal links with `--strict`.

Deployment is the existing static workflow (nginx image, rsync to a host). CI can run it on a schedule or by webhook.

## 10. Security

- Markdown is untrusted input: HTML is sanitised after rendering, link schemes are limited to `http`, `https`, `mailto`,
  relative and `#`; images only from the DAM or `https`.
- Public routes serve only documents of public folders; paths are normalised (no `..`, no leading `/`), no directory
  listing, no access to files outside the source folder.
- Editing requires the asset permissions; the docs routes are in the route contract and the authorisation matrix, with
  tests for: private document not served, path traversal, XSS payloads in a document, index file that points outside the folder.
- Rate limits on the public routes, as for search.
- The static output contains only public documents.

## 11. Phases

| Phase | Content | Done when |
|---|---|---|
| 1 | `.md` file type; `docs/` pipeline in core (parse, render, navigation, sanitising) with tests; website kind `docs`; tree/preview/documents routes; automatic index; dashboard Documents tab with the editor; `DocsView` for preview | A folder of `.md` files shows as a navigable site in the dashboard |
| 2 | `_nav.yml` and the index editor; search indexing (`doc`) and live search; static generator (`--kind docs`) with client-side search; broken-link report; export/import in the website bundle | A docs site published to a host, with search, from a DAM folder |
| 3 | The docs layout as a page template of normal websites; multi-language (folder per locale, selector); versions of a documentation set (`/v1/`, `/latest/`); sync from a Git repository (webhook + pull); AI-assisted summaries/"ask the docs" over the same index | Enterprise use |

## 12. Tests

Unit: front matter, slugs and duplicate headings, link rewriting (relative, anchors, missing, assets), sanitising
(`<script>`, `onerror`, `javascript:`), admonitions, navigation (automatic, manual, missing entries, previous/next),
search document extraction. Integration (disposable database): indexing on upload/replace/delete, visibility rules,
reindex. API security tests: permissions, path traversal, private folders. Browser (Playwright): create a docs site, upload
documents, edit the index, open the preview, search. Generator: a golden output for a small fixture tree, link checks.

## 13. Decisions (2026-10-08)

1. **Index file**: in the source folder, as YAML (`_nav.yml`), editable from the dashboard (tree editor and a text view).
2. **Static search**: MiniSearch, with a JSON index generated at publish time and searched in the browser.
3. **Syntax highlighting**: client side (a small library, loaded only on pages that contain code).
4. **The docs layout is also offered as a page template** of a normal website (a "documentation" section inside another site): phase 3.
5. **Limits**: no hard limits on documents per site or bytes per document. Instead soft guards that never refuse: a warning in the
   dashboard and in the generator when the search text passes a few MB, and the static index split into shards loaded on demand
   (section 6) so a big set stays usable. A single request still has the platform's usual body cap (`WS_MAX_BODY`).
