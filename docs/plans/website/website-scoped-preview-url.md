# Website-scoped Preview URLs

Each website must have a unique root folder so preview URLs are unambiguous
across websites. All pages from a given website are served under its root path.

## Problem

Multiple websites can have pages with the same or overlapping slugs (e.g.
`/news` in Website A and `/news` in Website B). The current preview URL
construction has no website scoping, leading to "Page not found" errors and
collisions.

## Solution

Add a `rootPath` field to every website — a short, unique URL prefix like
`/default` or `/sycore`. All page previews are nested under this path, and the
server strips it before looking up the page.

## Schema changes

### `websites` table (`packages/core/src/db/websites-schema.ts`)

```
rootPath: text('root_path').notNull().default(''),
```

Indexed, unique constraint to prevent duplicates.

### `website-records.ts` — add to `WebsiteRecord`

```
rootPath: string;
```

### `websites-api.ts` (admin-dashboard) — add to interface

```
rootPath: string
```

## API changes

### `POST /whoobe-one/websites`

Accept `rootPath` in body. Validate: non-empty, starts with `/`, matches
`/^\/[a-z0-9_-]+$/`, not already taken (409 on conflict).

### `PATCH /whoobe-one/websites/:id`

Same validation as create.

### `GET /whoobe-one/websites/:id`

Include `rootPath` in response.

### `GET /public/pages/:locale/*`

Accept `?rootPath=` query param. Strip it from `requestPath` before page
lookup. Resolve `websiteId` from rootPath (new helper `getWebsiteIdByRootPath`)
so all pages are correctly filtered.

## Admin UI changes

### `MasterWebsiteTab.vue` — Settings tab

Add a new required text input:

```html
<label>Root preview path</label>
<input v-model="form.rootPath" pattern="^\/[a-z0-9_-]+$" placeholder="/default" required />
```

Pre-fill from `website.rootPath` on load, include in save payload.

Auto-generate a default root path for new websites from the name:
`/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

### `PagePreviewTab.vue` — Preview iframe URL

Look up the website's `rootPath` and prepend it:

```
{base}{rootPath}{slug}?locale={locale}
```

The whoobe-one-spike catch-all route receives the full path including rootPath,
and passes it as `?rootPath=` to the public API.

## whoobe-one-spike changes

### `PublicPage.vue`

Pass `?rootPath=` to the public pages API.

### `pages-api.ts`

Update `getPublicPage()` to accept optional `rootPath` param.

## Migration

Existing websites without a rootPath get one auto-assigned:
`/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

Apply at:
1. Server startup (on read)
2. First save via admin UI (triggers update)

## Edge cases

- **Changing rootPath**: warn user that existing bookmarks break.
- **Duplicate rootPaths**: reject with 409 on create/update.
- **Empty rootPath**: reject — every website must have one.
- **Single segment limit**: enforce `^\/[a-z0-9_-]+$`.
- **Legacy websites without rootPath**: auto-generate on read or first save.