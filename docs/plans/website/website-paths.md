# Website Paths

Website paths are the logic implementation for routing.
Since the CMS relates on database, paths could be dynamic. By default and in order to make SEO friendly paths, paths are built on this logic:
- static paths: e.g. /it/news (normally list of records page)
- dynamic path: /it/news/[identifier] (normally a single record page)

## Saving dynamic paths

The easiest way to create dynamic paths is to add an identifier included in graphs like:

`/it/news/{slug}`

where slug is the identifier that corresponds to a data object field.

So, in the data binding the Dynamic Query, settings a filter to a field with slug = {slug}, the system should automatically and dynamically bind the data of the record that satisfy the query filter.
The path becomes the way to identify a single record.

## How to link to a dynamic path from a list of records page?

From the data binding any data should have the option when listed to link to it's dynamic path. For example binding a list of news of a page linked to a path `/it/news-ed-eventi`, every record listed should have the possibility to link (clicking on the record container or adding a button/link) to a it's dynamic path that will be:

`/it/news-ed-eventi/{slug}`

Dynamic paths can be updated by the user.

## SEO of dynamic pages

A dynamic page (`/it/news/{slug}`) is one template rendered for many records, so its SEO settings can't be fixed text. Any of **Meta Title, Meta Description, Canonical URL, OG Title, OG Description, OG Image** (and every string inside the JSON-LD) may contain `{field}` tokens that are filled from the data record the page is bound to:

| Setting | Example | Result for the article "Why we chose Postgres" |
|---|---|---|
| Meta Title | `{title} \| Whoobe` | `Why we chose Postgres \| Whoobe` |
| Meta Description | `{abstract}` | the abstract, as plain text |
| Canonical URL | `https://site.com/blog/{slug}` | `https://site.com/blog/why-we-chose-postgres` |
| OG Image | `{cover}` | the public URL of the image/asset field |

- **Where the values come from.** A token is looked up on the record first (a field of the class, or `key`), then in the page's URL params, so `{slug}` works even if the class has no such field. `{Class.field}` is accepted too (the prefix is ignored). Rich-text/Markdown values are reduced to plain text; lists are joined with `, `. A token that can't be resolved becomes empty (never a literal `{title}`), and an empty Meta Title/Description falls back to the page title / nothing, like a static page.
- **Which record.** The page's *data source* - Page > Settings > SEO > "Data source" - is one of its data bindings. A binding identifies "the page's record" when it is a single record (resolve mode `first` / `explicit`) or a **dynamic query**: a `query` whose filter takes a URL parameter (`slug = {slug}`), which is how a dynamic page normally binds its record - the first row is used. "Automatic" takes the first of these in the page, so a plain list earlier in the page (related/latest items, a `query` with no `{param}` filter) is skipped. Such a list can still be picked by hand (its first record is then used), but is never chosen automatically. `parent` / `currentPage` bindings aren't sources.
- **Editing.** The SEO tab shows a "Dynamic SEO" panel (for dynamic-path pages and pages with a single-record binding) with the source selector and the class's fields as buttons that insert `{field}` at the caret of the SEO field last focused.
- **Preview.** Page > Preview resolves the tokens from the record the preview shows (drafts included) and the SEO panel above the iframe displays the resolved values and warnings (e.g. "Meta title uses a {field} that resolved empty").
- **Output.** `GET /public/pages/...` and `/public/page/...` return the resolved values in `page.seo`, so generated sites and the headless SDK need no change. Only *published* records are used there; with `?editor=true` the raw templates stay in `page.seo` and the resolved copy is added as `seoResolved`. The search index ignores templated meta fields (it uses the page title/body instead).
- Code: `packages/core/src/cms/seo-template.ts` (pure, tested), `apps/core-api/src/server.ts` (`resolvePublicPageSeo`), `apps/whoobe-one-spike/src/views/PublicPage.vue` (`applyDynamicSeo`).
