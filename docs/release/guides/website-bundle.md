# Website export and import (bundle)

A website can be exported as a **bundle** and imported on another Whoobe installation, where it works as a twin:
the same pages, templates, menus, themes, **snippets**, **module pages**, **data classes and data objects**, and the
**asset files**, with every reference between them pointing at the copies made there.

Where: **Settings > Websites** in the admin dashboard, buttons **Export** (on each website) and **Import**.

## What is in a bundle

The export is a `.zip` with

| File | Content |
|---|---|
| `bundle.json` | The manifest (version 2): the website and everything below |
| `assets/0001-<name>`, ... | The files of the assets the website uses (only when you chose to include them) |

The manifest holds:

| Section | What it is |
|---|---|
| `website` | name, root path, locales, settings, theme (domains are not imported: a new site has none) |
| `pages` | the website's pages with all their translations, content, SEO, sitemap and search settings, publication state; plus the **module pages** of other websites (or of none) that a layout of this one uses, marked `external` |
| `websiteTemplates`, `websitePaths` | templates (slots, path patterns, locale, default) and menus |
| `themes` | the website's theme and the themes of its pages and snippets |
| `snippets` | the snippets that templates or pages refer to (`snippetIds`, `sourceSnippetId`), and the ones those use in turn |
| `dataClasses`, `dataComponents` | the classes that data bindings name, the classes their relation fields point at, and the component types they allow |
| `dataObjects` | every object of a class named by a data binding (what the site would list), plus the objects reached through relations and `objectId`s |
| `assets` | records (path, name, type, size, visibility, metadata) of every asset the content refers to |

Nothing is listed by hand: the export **follows the references** starting from the website's content. A reference is
an id found anywhere in a page, snippet, template layout, menu or data object (page ids in a layout, `{ assetId }`,
relation ids ...) or an asset path (`image.url`, a `/dam-asset/...` address). This is why a new element type that
refers to a snippet or an asset needs no change to the export.

Choosing **Cancel** at the "Include the asset files?" question exports the asset records without the files: the
other installation must already have them at the same paths.

## Importing

**Import** accepts the `.zip` (or a plain `.json`, the old version 1 export included). Before anything is written the
dialog shows what will happen: pages, templates, snippets, how many classes and objects are new or already there, how
many assets will be stored, and the warnings. The import then

1. **stores the asset files** that are missing, at the same path (same path and same size = the same file, reused;
   same path and another size = a different file: the new one is stored as `name-imported.ext` and the references
   to it are rewritten);
2. creates the **data classes and components** that do not exist (a class with the same name is reused; if its fields
   differ from the bundle's, the report says which);
3. creates the **data objects** (an object with the same class, locale and key is reused, never overwritten);
4. creates the **website** (its name gets `(import xxxx)` and its root path a suffix, as before), themes, snippets,
   pages, templates and menus, all with new ids, and rewrites every reference to them.

If a step fails, what the import created is removed again. Assets that were stored stay (they are ordinary DAM files).

### Permissions and what is not copied

- Importing needs `objects:write`; storing files needs `assets:upload`, as an upload does.
- **Publishing needs `objects:publish`.** Without it, everything comes in as a draft and the report says how many
  pages and objects were published in the bundle. With it, the publication state and workflow state are restored.
- A module page that belonged to no website (or to another one) becomes a page of the imported website.
- **Gateway forms**: the endpoints are not in the bundle (they hold credentials), but the pages keep the endpoint **name** and route of each form. On import the form's binding is made again for the new website, if an endpoint with that name and route exists on this installation; if not, the report says which endpoint is missing and the form stays unbound until it is created and the page is saved again (a binding id from another installation is never kept). The dry run lists the missing endpoints too.
- Not copied: users and roles, gateway endpoints and keys, mail and AI settings, the website's domains, Pimcore ids,
  search indexes (they are rebuilt when the pages are saved), the version history of pages.
- In the public sandbox the asset limits (file size, count) apply to what an import stores.

## Through the API

```
GET  /whoobe-one/websites/:id/export                       # version 2 manifest (objects:read)
GET  /whoobe-one/websites/:id/export?dataObjects=referenced  # without the objects a binding would list
POST /whoobe-one/websites/import?dryRun=1                  # report only, nothing is written (objects:write)
POST /whoobe-one/websites/import                           # body: the manifest, plus assetMap
```

`assetMap` is `{ "<old asset id>": { "id": "<new id>", "pimcorePath": "<new path>" } }` for the assets the caller has
stored (upload them with `POST /api/v1/dam/upload` using the path in the dry run's `assets` plan: each entry says
`upload`, `reuse` or `conflict` and the `targetPath` to use). Assets reported as `reuse` need no entry. The response
is the report: counts, the class actions, the asset plan and the warnings.

## Checking that a copy is a twin

Export the imported website and compare it with the first export after replacing every id by its order of
appearance: the two are equal (apart from the module pages that belonged to no website, which now belong to the
copy). `packages/core/src/portability/roundtrip.integration.test.ts` does this against a disposable database, and
`scripts/security/browser/website-bundle.spec.ts` does the zip round trip through the dashboard, with a real asset
deleted in between.
