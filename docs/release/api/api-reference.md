# API Reference

Overview of the HTTP APIs exposed by this monorepo's backend services, grouped by service and resource. Every endpoint returns/accepts JSON unless noted otherwise. Endpoints under `/public/*` and `/preview/*` (and `/health`, `/dam-asset/*`) require no authentication; everything else requires a valid `wcms_session` cookie (see [Auth](#auth)) and, in most cases, a specific permission. `gateway`'s own `/api/v1/gateway/resolve`/`/submit` are a third case: a published site (not an admin session) authenticates with a resolved `gatewayBindingId` and, optionally, a per-site API key — see [`docs/release/guides/api-gateway-security.md`](../guides/api-gateway-security.md).

For exact request/response shapes, see the route handlers in each service's `src/server.ts` (or, for `gateway`, `src/router.ts` + `src/admin-routes.ts`/`src/resolve-handler.ts`/`src/submit-handler.ts`). A machine-readable companion spec covering every route on this page lives at [`docs/release/api/openapi.yaml`](../api/openapi.yaml) — see its own section below for what it does and doesn't model.

## Services

| Service | Default port | Base path prefix |
| --- | --- | --- |
| [`core-api`](#core-api-port-3003) | 3003 | none (routes are top-level, e.g. `/data-objects`) |
| [`gateway`](#gateway-port-3001) | 3001 | mixed — `/api/v1/gateway/*` (admin + published-site), `/public/*`/`/api/internal/*`/`/dam/*` (proxies) |
| [`asset-processor`](#asset-processor-port-3002) | 3002 | `/api/v1/*` |

---

## `core-api` (port 3003)

The main backend API: authentication, the PIM/MDM data model (Classes, Components, Data Objects), the CMS (Documents, Snippets, Whoobe One pages/templates/kits/websites/themes), mail, AI generation, Figma import, and Pimcore migration orchestration.

<!-- GENERATED:CORE_API:START - do not hand-edit below; run `python3 docs/release/api/gen-api-docs.py` after editing that script's route table instead. -->
### Auth

| Method & path | Description |
| --- | --- |
| `POST /auth/login` | Log in with email/password. Sets the session cookie, or returns `{ mfaRequired: true, mfaToken }` if 2FA is enabled. |
| `POST /auth/mfa/challenge` | Step 2 of a 2FA login: verify a TOTP code (or a recovery code) against a pending mfaToken and complete the session. |
| `GET /auth/mfa/status` | Whether the current user has 2FA enabled. |
| `POST /auth/mfa/setup` | Start 2FA enrollment; returns a TOTP secret + QR code. |
| `POST /auth/mfa/verify-setup` | Confirm a TOTP code to finish enrollment; returns one-time recovery codes. |
| `POST /auth/mfa/disable` | Disable 2FA (requires re-entering the password). |
| `POST /auth/logout` | Revoke the current session and clear the cookie. |
| `GET /auth/me` | Current user's id, email, display name, and effective permissions. |
| `POST /auth/forgot-password` | Request a password-reset email. |
| `POST /auth/reset-password` | Complete a password reset with the emailed token. |
| `GET /auth/users` | List admin users. |
| `POST /auth/users` | Create an admin user. |
| `GET /auth/users/:id` | Get one admin user. |
| `PATCH /auth/users/:id` | Update an admin user. |
| `DELETE /auth/users/:id` | Delete an admin user. |
| `POST /auth/users/:id/reset-password` | Force-reset another user's password (admin action). |
| `GET /auth/roles` | List roles. |
| `POST /auth/roles` | Create a role (name + permission set). |
| `GET /auth/roles/:id` | Get one role. |
| `PATCH /auth/roles/:id` | Update a role. |
| `DELETE /auth/roles/:id` | Delete a role. |
| `GET /auth/permissions` | List every permission key the system recognizes. |

### Documents & Snippets (legacy Pimcore-migrated content)

| Method & path | Description |
| --- | --- |
| `GET /documents` | List documents migrated from Pimcore. |
| `GET /documents/:id` | Get one document. |
| `PATCH /documents/:id` | Update a document's content. |
| `GET /snippets` | List reusable content snippets (Whoobe Studio format - distinct from Whoobe One snippets below). |
| `POST /snippets` | Create a snippet. |
| `DELETE /snippets/:id` | Delete a snippet. |

### Whoobe One: Snippets

| Method & path | Description |
| --- | --- |
| `GET /whoobe-one/snippets` | List reusable block snippets (whoobe-one-spike editor format). |
| `POST /whoobe-one/snippets` | Create a snippet. |
| `GET /whoobe-one/snippets/:id` | Get one snippet. |
| `GET /whoobe-one/snippets/:id/versions` | List the snippet's instant version history (up to the 10 most recent prior states). |
| `GET /whoobe-one/snippets/:id/versions/:versionId` | Get one historical version's full node content. |
| `POST /whoobe-one/snippets/:id/render` | Render a snippet's node tree to standalone email HTML. |
| `PATCH /whoobe-one/snippets/:id` | Update a snippet in place. Snapshots the pre-update node into version history if it changed. |
| `DELETE /whoobe-one/snippets/:id` | Delete a snippet. |
| `PUT /whoobe-one/snippets/:id/thumbnail` | Set (or clear with `null`) the snippet thumbnail: an image data URL under 400k characters. |
| `PUT /whoobe-one/snippets/:id/lock` | Lock or unlock a snippet (`{ locked }`). A locked snippet is not saved automatically: the editor's autosave skips it and `PATCH /whoobe-one/snippets/:id` with `autosave: true` answers 423. Manual saves are unaffected. |

### Whoobe One: Templates & Kits

| Method & path | Description |
| --- | --- |
| `GET /whoobe-one/templates` | List whole-page templates. |
| `GET /whoobe-one/templates/:id` | Get one template. |
| `POST /whoobe-one/templates` | Create a template (unique path). |
| `PATCH /whoobe-one/templates/:id` | Update a template. |
| `DELETE /whoobe-one/templates/:id` | Delete a template. |
| `GET /whoobe-one/kits` | List named template collections ("kits"). |
| `GET /whoobe-one/kits/:id` | Get one kit. |
| `POST /whoobe-one/kits` | Create a kit. |
| `POST /whoobe-one/kits/:id/templates` | Append a template to an existing kit. |
| `DELETE /whoobe-one/kits/:id` | Delete a kit. |

### Whoobe One: Pages

| Method & path | Description |
| --- | --- |
| `GET /whoobe-one/pages` | List real site pages, optionally filtered by websiteId. |
| `GET /whoobe-one/pages/staged` | List Pimcore-migration staged pages awaiting review/promotion. |
| `GET /whoobe-one/pages/staged/:id` | Get one staged page. |
| `POST /whoobe-one/pages/staged/promote` | Promote all staged pages into the real pages table. |
| `POST /whoobe-one/pages/staged/:id/promote` | Promote one staged page. |
| `DELETE /whoobe-one/pages/staged/:id` | Discard one staged page without promoting it. |
| `PUT /whoobe-one/pages/:id/thumbnail` | Set (or clear with `null`) the page thumbnail: an image data URL (webp/png/jpeg) under 400k characters. Used by the editor preview's "Capture thumbnail" (desktop crop, or the Mobile/Tablet device screen). |
| `GET /whoobe-one/pages/:id` | Get one page. |
| `GET /whoobe-one/pages/:id/versions` | List the page's instant version history (up to the 10 most recent prior states of its content). |
| `GET /whoobe-one/pages/:id/versions/:versionId` | Get one historical version's full content tree. |
| `GET /whoobe-one/pages/:id/layout` | Resolved website-template body slot (className/style) for this page's editor canvas. |
| `POST /whoobe-one/pages/:id/render` | Render a page's node tree to standalone email HTML. |
| `GET /whoobe-one/pages/:id/translations` | All locale variants of the same logical page. |
| `POST /whoobe-one/pages/:id/translate` | AI-translate a page into a new locale, creating a draft in the same translation group. |
| `POST /whoobe-one/pages` | Create a page. Validates/binds any Gateway content bindings before saving. |
| `PATCH /whoobe-one/pages/:id` | Update a page. Snapshots the pre-update content into version history if it changed. |
| `DELETE /whoobe-one/pages/:id` | Delete a page. |

### Whoobe One: Websites, Settings, PWA

| Method & path | Description |
| --- | --- |
| `GET /whoobe-one/websites` | List websites (domain + locale config a page tree belongs to). |
| `POST /whoobe-one/websites` | Create a website. |
| `POST /whoobe-one/websites/:id/gateway-api-key/regenerate` | Generate (or replace) this website's Gateway site API key. Plaintext is returned once, only a salted hash is stored. |
| `DELETE /whoobe-one/websites/:id/gateway-api-key` | Clear this website's Gateway site API key. |
| `GET /whoobe-one/settings/default-placeholder-image` | Get the org-wide default placeholder image used when an image element has no source. |
| `PUT /whoobe-one/settings/default-placeholder-image` | Set the default placeholder image. |
| `GET /whoobe-one/settings/strip-html-comments` | Get whether HTML comments are stripped from rendered output. |
| `PUT /whoobe-one/settings/strip-html-comments` | Set the strip-HTML-comments setting. |
| `GET /whoobe-one/settings/logging` | Get editor logging verbosity settings. |
| `PUT /whoobe-one/settings/logging` | Set editor logging verbosity. |
| `GET /whoobe-one/settings/autosave` | Get the org-wide default autosave enabled/interval settings. |
| `PUT /whoobe-one/settings/autosave` | Set the org-wide default autosave settings. |
| `GET /whoobe-one/settings/alpine-presets` | Get the catalog of Alpine presets: named sets of Alpine.js directives applied from the editor's Advanced > AlpineJS panel (`{ presets: [{ name, description, directives }] }`). |
| `PUT /whoobe-one/settings/alpine-presets` | Replace the whole Alpine presets catalog (`{ presets }`); 400 with the reason when a name, a directive (`x-...`, `@event`, `:attr`) or a size limit is invalid, nothing is stored then. |
| `GET /whoobe-one/settings/cdn-mirror` | Get the default CDN-mirroring settings for DAM assets. |
| `PUT /whoobe-one/settings/cdn-mirror` | Set the default CDN-mirroring settings. |
| `GET /whoobe-one/websites/:id` | Get one website. |
| `PATCH /whoobe-one/websites/:id` | Update a website. |
| `DELETE /whoobe-one/websites/:id` | Delete a website. |
| `GET /whoobe-one/websites/:id/upload-settings` | The file-upload limits of a website's forms (`settings.uploads`: enabled, allowed file types, size, count, daily bytes, target folder), normalized, with the ceilings and the file types that can be allowed. |
| `PUT /whoobe-one/websites/:id/upload-settings` | Save them. Only file types whose content can be checked are accepted (never html, svg, scripts, programs); numbers are held within the ceilings; the target folder is private unless a public one is explicitly allowed. |
| `GET /whoobe-one/websites/:id/themes` | List themes available to this website (its settings.themes catalog). |
| `POST /whoobe-one/websites/:id/themes` | Add a theme to this website's catalog. |
| `PUT /whoobe-one/websites/:id/themes/:themeId` | Update one of this website's catalog themes. |
| `DELETE /whoobe-one/websites/:id/themes/:themeId` | Remove a theme from this website's catalog. |
| `GET /whoobe-one/themes/all` | List every website's themes in one call, for snippet/global editors with no single website context. |
| `GET /whoobe-one/websites/:id/theme` | Get this website's currently active default theme. |
| `PUT /whoobe-one/websites/:id/theme` | Set this website's active default theme. |
| `POST /whoobe-one/websites/:id/generate-pwa` | Generate/update this website's installable PWA manifest + service worker config. |

### Themes (global catalog)

| Method & path | Description |
| --- | --- |
| `GET /whoobe-one/themes` | List all globally-defined themes (name, colors, fonts, custom styles/Tailwind classes). |
| `POST /whoobe-one/themes` | Create a theme. |
| `GET /whoobe-one/themes/:id` | Get one theme. |
| `PUT /whoobe-one/themes/:id` | Update a theme. |
| `DELETE /whoobe-one/themes/:id` | Delete a theme. |

### Website Templates (header/aside/main/footer/404 composition)

| Method & path | Description |
| --- | --- |
| `GET /whoobe-one/websites/:websiteId/templates` | List a website's layout templates. |
| `POST /whoobe-one/websites/:websiteId/templates` | Create a layout template. |
| `GET /whoobe-one/websites/:websiteId/templates/:id` | Get one layout template. |
| `PATCH /whoobe-one/websites/:websiteId/templates/:id` | Update a layout template. |
| `DELETE /whoobe-one/websites/:websiteId/templates/:id` | Delete a layout template. |

### Website Paths (menu/navigation tree)

| Method & path | Description |
| --- | --- |
| `GET /whoobe-one/website-paths` | List a website's menu/navigation entries. |
| `POST /whoobe-one/website-paths` | Create a menu entry. |
| `GET /whoobe-one/website-paths/:id` | Get one menu entry. |
| `PATCH /whoobe-one/website-paths/:id` | Update a menu entry. |
| `DELETE /whoobe-one/website-paths/:id` | Delete a menu entry. |

### Public site endpoints (no auth)

| Method & path | Description |
| --- | --- |
| `GET /public/pages/:locale/*` | Fetch a published page by locale + full path (static slug or dynamic pattern match), for SSR/rendering. |
| `GET /public/page/*` | SEO-friendly page lookup with no locale in the URL - detects the website's rootPath from the first path segment. |
| `GET /public/404/:websiteId` | Fetch a website's configured 404 page content. |
| `GET /public/sitemap.xml` | Generated sitemap of all published, sitemap-included pages. |
| `GET /public/robots.txt` | Generated robots.txt pointing at the sitemap. |
| `GET /public/websites` | List websites (id + name only). |
| `GET /public/websites/:id` | Get one website's public config (domains, locales, PWA config; secrets redacted). |
| `GET /public/pages` | List a website's published pages (id/slug/title only), for static-export route generation. |
| `GET /public/snippets/:id` | Get one Whoobe One snippet's node tree (public, for embedding on a published site). |
| `GET /public/assets/:uuid` | Resolve a DAM asset's public URL by its stable uuid reference. |
| `GET /public/dam/assets/mirror-status` | Whether CDN-mirrored copies exist for a batch of asset paths. |
| `GET /public/apps/:websiteId` | List a website's `kind: app` pages, for the Capacitor mobile-app generator. |
| `GET /public/search` | Full-text search (tsvector + pg_trgm) across published pages/objects/classes/assets. |

### PWA push

| Method & path | Description |
| --- | --- |
| `POST /pwa/subscribe` | Register a browser's push subscription for a website. |
| `POST /pwa/send` | Send a push notification to a website's subscribers. |

### Data Classes (PIM/MDM class definitions)

| Method & path | Description |
| --- | --- |
| `GET /data-classes` | List all classes. |
| `GET /data-classes/:id` | Get one class. |
| `POST /data-classes` | Create a class (name, label, fields, optional view config). |
| `PATCH /data-classes/:id` | Update a class. Renaming/retyping a field is blocked once objects of that class exist. |
| `DELETE /data-classes/:id` | Delete a class. Blocked while any object of that class still exists. |
| `GET /data-classes/:id/workflow` | Get the class's publishing workflow definition, if any. |
| `PUT /data-classes/:id/workflow` | Create/replace the class's workflow (places + transitions). |
| `DELETE /data-classes/:id/workflow` | Remove the class's workflow. |

### Data Components (reusable field-collection sub-schemas)

| Method & path | Description |
| --- | --- |
| `GET /data-components` | List all component types. |
| `GET /data-components/:id` | Get one component type. |
| `GET /data-components/:id/usage` | Whether any existing object references this component. |
| `POST /data-components` | Create a component type. |
| `PATCH /data-components/:id` | Update a component type. Renaming/retyping a field is blocked while it's in use. |
| `DELETE /data-components/:id` | Delete a component type. Blocked while it's in use. |

### Migration Sources & Pimcore import

| Method & path | Description |
| --- | --- |
| `GET /migration-sources` | List configured migration sources (passwords never included). |
| `POST /migration-sources` | Save a new source (DB connection + var/classes path). |
| `PATCH /migration-sources/:id` | Update a source. |
| `DELETE /migration-sources/:id` | Delete a source. |
| `POST /migration-sources/:id/import-classes` | Import Pimcore class definitions into data-classes. |
| `POST /migration-sources/:id/import-objects` | Import one class's real object instances from the source MySQL DB. |
| `POST /migration-sources/:id/extract-components` | Extract embedded collection types of the imported classes into standalone data components (no access to the Pimcore DB needed). |
| `POST /migration-sources/:id/import-documents` | Convert the source's Pimcore documents into pages. With `staging: true` they land in the staging table for review instead of the live pages. |
| `POST /migration-sources/:id/promote-documents` | Copy the staged documents of this source into the live pages table. |

### Data Objects (PIM/MDM instances)

| Method & path | Description |
| --- | --- |
| `GET /data-objects` | List objects, optionally filtered by classId. |
| `GET /data-objects/:id` | Get one object. |
| `POST /data-objects` | Create an object. |
| `PATCH /data-objects/:id` | Update an object. |
| `DELETE /data-objects/:id` | Delete an object. |
| `GET /data-objects/batch` | Fetch several objects by id (admin: drafts included). |
| `POST /data-objects/batch` | Batch action on `ids[]`: `publish`, `unpublish`, `delete` or `resolve-assets`. |
| `POST /data-objects/query` | Query objects by class name + filters (admin: no published filter). |
| `GET /data-objects/:id/translations` | Every locale variant of the same logical object. |
| `GET /data-objects/translations/:translationGroupId` | Locale variants by translation group id. |
| `POST /data-objects/:id/preview-link` | Create a shareable preview link for an object (may be a draft); body `{ expiresInDays? }`. Requires `objects:publish`. |
| `GET /data-objects/:id/preview-links` | List the object's preview links (with view counts). |
| `DELETE /data-objects/preview-links/:token` | Revoke a preview link; `?permanent=true` removes a revoked or expired one for good. Requires `objects:publish`. |
| `GET /data-objects/:id/transitions` | Workflow transitions available for the object in its class's workflow. |
| `POST /data-objects/:id/transition` | Run a workflow transition; each transition declares the permissions it needs. |

### Public Data Objects & Forms (no auth, published only)

| Method & path | Description |
| --- | --- |
| `GET /public/data-objects` | List published objects of a class by name. |
| `GET /public/data-objects/batch` | Fetch multiple published objects by id. |
| `POST /public/data-objects/query` | Query published objects by class name + filters. |
| `GET /public/data-objects/:id` | Get one published object (404 if it's a draft - never leaks draft existence). |
| `POST /public/uploads/intent` | Public. Approve one file for a form Upload field: `{ fieldId, filename, size }` is checked against the website's upload limits (type, size, daily quota) and the field's own; answers `{ uploadId, uploadUrl, expiresIn, maxBytes }`. The bytes go to `uploadUrl` (asset service, `PUT /public/upload-data/<ticket>`), then the form submission refers to the upload as `{ uploadId }`. 503 when `UPLOAD_TOKEN_SECRET` is not set. |
| `POST /public/forms/:classId/submit` | Submit a public form, creating an unpublished Data Object of the given class. A `notify` block in the body only sends mail if it is the one an author saved in a form of a page for that class (F-053); recipients must be one plain address, 3 mails an hour per address. |
| `GET /preview/objects/:token` | Resolve a preview-link token to its (possibly unpublished) object. |

### Documentation sites (Markdown)

| Method & path | Description |
| --- | --- |
| `GET /docs-sites/:websiteId/tree` | A documentation website (settings `kind: docs`, source DAM folder): its documents with titles, addresses and visibility, the index (automatic from the tree of files, or `_nav.yml`), the other files and the warnings (broken links, entries pointing nowhere). |
| `GET /docs-sites/:websiteId/preview/*` | A rendered page of a documentation website by its address (empty = home), private documents included: `{ site, nav, page }` with the HTML, the headings, breadcrumbs, previous/next and the warnings. |
| `POST /docs-sites/:websiteId/render` | Live preview: renders Markdown that is not saved yet (`{ path, markdown }`) as it would be at that path, with the folder's real links and files; returns `{ title, html, headings, warnings }`. |
| `POST /docs-sites/:websiteId/nav/check` | Checks the text of the index file (`{ text }`) without saving it: `{ ok, errors, warnings, nav }`. |
| `GET /docs-sites/:websiteId/search-index` | The search index of a documentation website (a serialised MiniSearch, searched in the browser), private documents included. ETag-cached. |
| `GET /public/docs/:websiteId/search-index` | The search index of the PUBLIC documents of a documentation website. ETag-cached; the same file the static site ships. |
| `GET /public/docs-site/:segment` | Which documentation website answers at a root path segment (`{ websiteId, rootPath, title }`, 404 if none). |
| `GET /public/docs/:websiteId/nav` | Index of the PUBLIC documents of a documentation website. |
| `GET /public/docs/:websiteId/page/*` | A rendered public document by its address (empty = home): `{ site, page }`. A document that is private in the DAM answers 404. |

### Mail: settings, log, templates

| Method & path | Description |
| --- | --- |
| `GET /mail-settings` | Get a mail configuration: the default, or with `?websiteId=` that website's own, plus what a message of that scope is sent with. Passwords and API keys are never returned (only whether they are set). |
| `GET /mail-providers` | List the installed HTTP mail providers (OneSignal ...): their id, label and config fields. Providers are JSON files (`packages/core/mail-providers`, `MAIL_PROVIDERS_PATH`), read again when one changes. |
| `PUT /mail-settings` | Save a mail configuration for the default (no `websiteId`) or for one website: `provider` is `smtp` (with `smtp: {host, port, secure, user, password}`) or a provider id (with `providerConfig`). Secrets are encrypted at rest; a blank secret keeps the stored one. Needs `MAIL_SETTINGS_ENCRYPTION_KEY` on the server. |
| `DELETE /mail-settings` | Remove a website's own mail configuration (`?websiteId=`), so its mail goes out with the default again. The default cannot be removed. |
| `POST /mail-settings/test` | Send a test email with the configuration of the default or, with `websiteId`, of that website. |
| `GET /mail-log` | List sent-mail log entries. |
| `POST /mail-log/delete` | Bulk-delete mail log entries. |
| `GET /mail-log/:id` | Get one mail log entry (including the rendered body). |
| `POST /mail-log/:id/resend` | Re-send a previously logged email. |
| `GET /mail-templates` | List HTML/text mail templates. |
| `POST /mail-templates` | Create a mail template. |
| `GET /mail-templates/:id` | Get one mail template. |
| `PATCH /mail-templates/:id` | Update a mail template. |
| `DELETE /mail-templates/:id` | Delete a mail template. |
| `POST /mail-templates/:id/render` | Render a mail template to HTML, substituting sample/live data. |

### AI: text, images, translation, whole-website generation

| Method & path | Description |
| --- | --- |
| `GET /ai/settings` | Get the configured AI text-generation provider/model/key. |
| `PUT /ai/settings` | Update AI text-generation settings. |
| `POST /ai/generate` | Generate text for an editor field (heading, paragraph, etc.) from a prompt. |
| `GET /ai/generated` | List past AI-generation results. |
| `POST /ai/generate-website-structure` | Generate a full website's page/section structure from a text brief. |
| `POST /whoobe-one/websites/from-ai` | Create a real website + pages from a previously generated AI structure. |
| `GET /whoobe-one/websites/:id/export` | Export a website as a version 2 bundle (JSON manifest): pages, templates, menus, themes and everything they refer to - snippets, module pages, data classes/components/objects, asset records. `?dataObjects=referenced` leaves out the objects a data binding would list. The asset files are fetched by the client (admin dashboard zips them). |
| `POST /whoobe-one/websites/import` | Import a version 1 or 2 bundle as a new website. `?dryRun=1` writes nothing and returns the report with the asset plan; `assetMap` in the body maps old asset ids to the records the client stored. Classes and objects that exist are reused, ids are rewritten, a failure removes what was created. |
| `GET /ai/image-settings` | Get the configured AI image-generation provider/model/key. |
| `PUT /ai/image-settings` | Update AI image-generation settings. |
| `GET /ai/translate-settings` | Get the configured AI translation provider/model/key. |
| `PUT /ai/translate-settings` | Update AI translation settings. |
| `POST /ai/generate-image` | Generate an image from a text prompt, uploading the result to the DAM. |

### Figma import

| Method & path | Description |
| --- | --- |
| `GET /figma/settings` | Get the configured Figma personal access token (masked). |
| `PUT /figma/settings` | Update the Figma access token. |
| `POST /figma/import` | Import a Figma file/frame, converting it into a page's node tree. |

### Search (admin)

| Method & path | Description |
| --- | --- |
| `GET /whoobe-one/search` | Admin search over the same index as `/public/search`, but session-gated and including drafts and non-indexable pages. |
| `POST /whoobe-one/search/reindex` | Rebuild the whole search index from the source tables (heals drift; indexing hooks are best-effort). |

### System

| Method & path | Description |
| --- | --- |
| `GET /api/v1/system/logs` | Tail recent application log lines. |
| `GET /api/v1/system/logs/download` | Download the full current log file. |
| `GET /health` | Liveness/uptime check. |
| `GET /site-root` | Asked by the reverse proxy for requests it cannot route by name: 204 if the first path segment is a website's root path (the proxy then sends the request to the editor, which renders the page), 403 otherwise (dashboard). Answers from a 5 s cache; reads the URI from `X-Original-URI`. |
<!-- GENERATED:CORE_API:END -->

---

## `gateway` (port 3001)

Federated API Gateway: lets a published site or the admin editor reach third-party REST APIs (HubSpot, Brevo, Stripe, or any custom endpoint) through server-side-only credentials, plus a couple of authenticated/public proxy passthroughs to `core-api`/`asset-processor` for callers that only have the Gateway's own origin configured. See [`docs/release/guides/api-gateway-security.md`](../guides/api-gateway-security.md) for the authorization model behind `/resolve`/`/submit` (a mandatory server-resolved `gatewayBindingId`, plus an optional per-site API key) — a published site never gets to pick an arbitrary endpoint/route itself.

<!-- GENERATED:GATEWAY:START - do not hand-edit below; run `python3 docs/release/api/gen-api-docs.py` after editing that script's route table instead. -->
### Gateway admin: endpoints, routes, schemas (auth: wcms_session + GATEWAY_MANAGE)

| Method & path | Description |
| --- | --- |
| `GET /api/v1/gateway/endpoints` | List configured upstream API endpoints (base URL, auth type, rate limits). |
| `POST /api/v1/gateway/endpoints` | Register a new upstream endpoint. |
| `GET /api/v1/gateway/endpoints/:id` | Get one endpoint (credentials redacted). |
| `PATCH /api/v1/gateway/endpoints/:id` | Update an endpoint. |
| `DELETE /api/v1/gateway/endpoints/:id` | Delete an endpoint and its routes. |
| `GET /api/v1/gateway/endpoints/:id/routes` | List an endpoint's configured routes. |
| `POST /api/v1/gateway/endpoints/:id/routes` | Add a route (path + method) to an endpoint. |
| `PATCH /api/v1/gateway/routes/:id` | Update a route. |
| `DELETE /api/v1/gateway/routes/:id` | Delete a route. |
| `POST /api/v1/gateway/routes/:id/test` | Fire a real test request through a route and return the raw upstream response. |
| `POST /api/v1/gateway/routes/:id/execute` | Execute a route's proxied request with real parameters (used by the editor's live preview). |
| `GET /api/v1/gateway/routes/:id/schema` | Get a route's auto-inferred response schema + sample payload. |
| `POST /api/v1/gateway/routes/:id/refresh-schema` | Re-infer a route's response schema from a fresh live call. |
| `POST /api/v1/gateway/endpoints/:id/import-openapi` | Bulk-create routes for an endpoint from an OpenAPI/Swagger spec. |
| `POST /api/v1/gateway/preview-resolve` | Admin-authenticated live resolve, for the editor's own binding-picker preview (distinct from the public /resolve below). |
| `GET /api/v1/gateway/plugins` | List loaded custom Gateway plugins. |
| `GET /api/v1/gateway/presets` | List available connector presets (HubSpot, Brevo, Stripe, etc.). |

### Gateway published-site endpoints (site API key or bound content only - see docs/release/guides/api-gateway-security.md)

| Method & path | Description |
| --- | --- |
| `POST /api/v1/gateway/resolve` | Resolve a gateway-bound content field for a published page - the only way a published site reads third-party data. Requires a resolved gatewayBindingId (server-assigned at page-save time), not a free endpoint/route choice. |
| `POST /api/v1/gateway/submit` | Submit a gateway-bound form for a published page. Requires a resolved gatewayBindingId, same as /resolve. |

### Gateway internal proxies (auth: wcms_session, admin-dashboard use only)

| Method & path | Description |
| --- | --- |
| `ALL /api/internal/*` | Authenticated passthrough proxy to core-api, for admin-dashboard requests that need to cross from the Gateway's own origin. |
| `ALL /dam/*` | Authenticated passthrough proxy to asset-processor. |

### Gateway public proxy (no auth)

| Method & path | Description |
| --- | --- |
| `ALL /public/*` | Unauthenticated passthrough proxy to core-api's own /public/* routes, for published sites that only have the Gateway's origin configured. |

### Gateway plugin routes

| Method & path | Description |
| --- | --- |
| `ALL /api/remote/*` | Dynamically registered by loaded Gateway plugins (see /api/v1/gateway/plugins) - not enumerable statically. |

### Health

| Method & path | Description |
| --- | --- |
| `GET /health` | Liveness/uptime check. |
<!-- GENERATED:GATEWAY:END -->

---

## `asset-processor` (port 3002)

DAM (Digital Asset Management) microservice: image processing/transform, metadata extraction, and S3/MinIO-backed asset & folder storage, plus optional CDN mirroring. Isolated from `core-api` so heavy image work never blocks the main API.

<!-- GENERATED:ASSET_PROCESSOR:START - do not hand-edit below; run `python3 docs/release/api/gen-api-docs.py` after editing that script's route table instead. -->
### Stateless image processing

| Method & path | Description |
| --- | --- |
| `POST /api/v1/process` | Resize/convert an uploaded (or base64) image; `?mode=variants` returns multiple sizes in one call. |
| `POST /api/v1/metadata` | Extract EXIF/IPTC/GPS/camera metadata from an uploaded file. |

### DAM assets (S3/MinIO-backed, Postgres-tracked)

| Method & path | Description |
| --- | --- |
| `GET /api/v1/dam/info` | Non-secret storage config (bucket, endpoint, public base URL) for the admin UI. |
| `POST /api/v1/dam/upload` | Upload a file to S3/MinIO and record it (path, visibility, metadata). |
| `POST /api/v1/dam/transform` | Re-process an already-uploaded image (resize/format/watermark/etc.) and save it as a new version or _edited copy. |
| `DELETE /api/v1/dam/asset` | Delete an asset (and its thumbnails) from storage and the DB. |
| `POST /api/v1/dam/assets/move` | Move/rename an asset to a new folder path. |
| `GET /api/v1/dam/folders` | List DAM folders. |
| `POST /api/v1/dam/folders` | Create a folder. |
| `DELETE /api/v1/dam/folders` | Delete a folder and everything under it (descendant folders, asset records, and S3 objects). |
| `GET /api/v1/dam/assets` | List assets in a folder, with resolved URLs + thumbnails. |
| `POST /api/v1/dam/assets` | List assets in a folder (POST variant, avoids URL-length limits for large folder-rule payloads). |
| `GET /api/v1/dam/assets/:id` | Get a single asset by record id, with resolved URLs. |
| `PATCH /api/v1/dam/assets/metadata` | Update an asset's stored metadata. |
| `POST /api/v1/dam/assets/:id/mirror-cdn` | Push a copy of this asset to the configured CDN mirror target. |
| `GET /api/v1/dam/asset-urls` | Resolve an asset's (public or freshly presigned) URL + thumbnail URLs by path. |
| `POST /api/v1/dam/asset-urls` | Resolve URLs for a batch of asset paths in one call. |
| `GET /api/v1/dam/exists` | Check whether an asset exists at a given path. |
| `POST /api/v1/dam/exists` | Check existence for a batch of paths in one call. |
| `POST /api/v1/dam/regenerate-thumbnails` | Regenerate thumbnail variants for one or more assets. |
| `POST /api/v1/dam/ensure-bucket` | Ensure the target bucket exists with the correct public-read policy for current folder rules. |
| `GET /dam-asset/*` | Streams a stored object through this server (signed S3 GetObject), so the browser never talks to S3/MinIO directly. |

### Health

| Method & path | Description |
| --- | --- |
| `GET /health` | Liveness/uptime check. |
<!-- GENERATED:ASSET_PROCESSOR:END -->

---

## Non-HTTP: `migration-tool` CLI

`packages/migration-tool` also ships a standalone CLI (used directly, or wrapped by `core-api`'s `/migration-sources/*/import-*` endpoints above):

```bash
pnpm --filter @whoobe-cms/migration-tool cli -- help
```

| Command | Description |
| --- | --- |
| `migrate-documents` | Import Pimcore Documents (pages/snippets) and their Areablocks into `whoobe_pages`. Flags: `--dry-run`, `--source=`, `--limit=`, `--staging`. |
| `promote-staging` | Copy `whoobe_pages_staging` rows into `whoobe_pages` (completes the staged workflow). Flags: `--dry-run`, `--clear`. |
| `migrate-classes` | Translate Pimcore class definitions (`var/classes/*.php`) into `data_classes`. |
| `migrate-objects --class=<Name>` | Import one class's real object instances into `data_objects`. |
| `migrate-assets` | Upload Pimcore assets referenced by migrated documents into this system's S3/MinIO bucket + `assets` table (documents-migration plan Phase 1). Flags: `--dry-run`, `--source=`, `--limit=`, `--public`. Requires `PIMCORE_VAR_ASSETS_PATH` pointing at the source install's asset directory. |

---

## OpenAPI spec

[`docs/release/api/openapi.yaml`](../api/openapi.yaml) is a generated, machine-readable OpenAPI 3.0 companion to this page — importable into Swagger UI, Postman, Insomnia, or any OpenAPI-driven client generator. It's generated from the exact same route table as this page (see [`docs/release/api/gen-api-docs.py`](../api/gen-api-docs.py)), so the two can't silently drift apart — **when a route changes, edit that script's table and re-run it (`python3 docs/release/api/gen-api-docs.py` from `docs/api/`), not the YAML or this page's tables directly.**

Scope, by design: every one of the ~226 routes documented above gets a real path, method, tag, auth requirement, and path parameters — that part is exhaustive. Request/response **bodies** are intentionally generic (`type: object`, no field-by-field modeling) for most routes, since hand-modeling every payload shape across three services would be a much larger, separate effort and would need to be re-verified against the handlers constantly to stay honest. A handful of flagship endpoints (`POST /auth/login`, `GET /auth/me`, `POST /api/v1/gateway/resolve`, `POST /api/v1/gateway/submit`, and the Whoobe One Pages CRUD) get real, hand-written schemas instead, as a quality anchor and a template for extending the rest incrementally.
