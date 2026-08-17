# API Reference

Overview of the HTTP APIs exposed by this monorepo's backend services, grouped by service and resource. Every endpoint returns/accepts JSON unless noted otherwise. Endpoints under `/public/*` and `/preview/*` require no authentication; everything else requires a valid `wcms_session` cookie (see [Auth](#auth)) and, in most cases, a specific permission.

For exact request/response shapes, see the route handlers in each service's `src/server.ts`.

## Services

| Service | Default port | Base path prefix |
| --- | --- | --- |
| [`core-api`](#core-api-port-3003) | 3003 | none (routes are top-level, e.g. `/data-objects`) |
| [`asset-processor`](#asset-processor-port-3002) | 3002 | `/api/v1/*` |

---

## `core-api` (port 3003)

The main backend API: authentication, the PIM/MDM data model (Classes, Components, Data Objects), the CMS (Documents, Snippets, Whoobe One pages/templates/kits/websites), publishing workflows, and Pimcore migration orchestration.

### Auth

Session-cookie based auth with optional TOTP-based 2FA.

| Method & path | Description |
| --- | --- |
| `POST /auth/login` | Log in with email/password. Sets the session cookie, or returns `{ mfaRequired: true, mfaToken }` if the account has 2FA enabled. |
| `POST /auth/mfa/challenge` | Step 2 of a 2FA login: verify a TOTP code (or a recovery code) against a pending `mfaToken` and complete the session. |
| `GET /auth/mfa/status` | Whether the current user has 2FA enabled. |
| `POST /auth/mfa/setup` | Start 2FA enrollment; returns a TOTP secret + QR code. |
| `POST /auth/mfa/verify-setup` | Confirm a TOTP code to finish enrollment; returns one-time recovery codes. |
| `POST /auth/mfa/disable` | Disable 2FA (requires re-entering the password). |
| `POST /auth/logout` | Revoke the current session and clear the cookie. |
| `GET /auth/me` | Current user's id, email, display name, and effective permissions. |

### Data Classes (PIM/MDM class definitions)

Pimcore-style "Classes" — admin-defined field layouts that data objects are instances of.

| Method & path | Description |
| --- | --- |
| `GET /data-classes` | List all classes. |
| `GET /data-classes/:id` | Get one class. |
| `POST /data-classes` | Create a class (name, label, fields, optional view config). |
| `PATCH /data-classes/:id` | Update a class. Renaming or retyping a field is blocked once objects of that class exist. |
| `DELETE /data-classes/:id` | Delete a class. Blocked while any object of that class still exists. |
| `GET /data-classes/:id/workflow` | Get the class's publishing workflow definition, if any. |
| `PUT /data-classes/:id/workflow` | Create/replace the class's workflow (places + transitions). |
| `DELETE /data-classes/:id/workflow` | Remove the class's workflow. |

### Data Components (reusable field-collection sub-schemas)

Named, reusable field-list definitions — Pimcore's "Field Collection" equivalent — referenced by a class field's `allowedComponentTypes`.

| Method & path | Description |
| --- | --- |
| `GET /data-components` | List all component types. |
| `GET /data-components/:id` | Get one component type. |
| `GET /data-components/:id/usage` | Whether any existing object references this component. |
| `POST /data-components` | Create a component type. |
| `PATCH /data-components/:id` | Update a component type. Renaming/retyping a field is blocked while it's in use. |
| `DELETE /data-components/:id` | Delete a component type. Blocked while it's in use. |

### Data Objects (PIM/MDM instances)

Instances of a Data Class, with draft/published state, per-locale translations, and optional workflow.

| Method & path | Description |
| --- | --- |
| `GET /data-objects?classId=` | List objects, optionally filtered by class. |
| `POST /data-objects/batch` | Bulk action (`publish`, `unpublish`, `delete`, or `resolve-assets`) over an array of ids. |
| `GET /data-objects/batch?ids=` | Fetch multiple objects by id in one round trip. |
| `GET /data-objects/:id` | Get one object. |
| `GET /data-objects/:id/translations` | All locale variants of the same logical object. |
| `GET /data-objects/translations/:translationGroupId` | Same lookup, keyed directly by translation group id. |
| `POST /data-objects` | Create an object. |
| `PATCH /data-objects/:id` | Update an object. |
| `DELETE /data-objects/:id` | Delete an object. |
| `POST /data-objects/query` | Admin query by class name + filters (includes drafts). |
| `POST /data-objects/:id/preview-link` | Issue a shareable, token-based preview link for a draft object. |
| `GET /data-objects/:id/preview-links` | List active preview links for an object. |
| `DELETE /data-objects/preview-links/:token` | Revoke a preview link. |
| `POST /data-objects/:id/transition` | Move an object to a new workflow state via a named transition. |
| `GET /data-objects/:id/transitions` | List an object's past workflow transitions. |

### Public Data Objects (no auth, published only)

Read-only, published-content-only views of Data Objects for consumption by public-facing frontends.

| Method & path | Description |
| --- | --- |
| `GET /public/data-objects?class=&locale=` | List published objects of a class by name. |
| `GET /public/data-objects/batch?ids=` | Fetch multiple published objects by id. |
| `POST /public/data-objects/query` | Query published objects by class name + filters. |
| `GET /public/data-objects/:id` | Get one published object (404 if it's a draft — never leaks draft existence). |
| `GET /preview/objects/:token` | Resolve a preview-link token to its (possibly unpublished) object. |

### Migration Sources & Pimcore import

Saved connection configs for a legacy Pimcore MySQL database, used to trigger class/object imports from the admin UI (wraps `@whoobe-cms/migration-tool`).

| Method & path | Description |
| --- | --- |
| `GET /migration-sources` | List configured migration sources (passwords never included). |
| `POST /migration-sources` | Save a new source (DB connection + `var/classes` path). |
| `PATCH /migration-sources/:id` | Update a source. |
| `DELETE /migration-sources/:id` | Delete a source. |
| `POST /migration-sources/:id/import-classes` | Import Pimcore class definitions (from `var/classes/*.php`) into `data-classes`. |
| `POST /migration-sources/:id/import-objects` | Import one class's real object instances from the source MySQL DB into `data-objects`. |

### Documents & Snippets (legacy Pimcore-migrated content)

| Method & path | Description |
| --- | --- |
| `GET /documents` | List documents migrated from Pimcore. |
| `GET /documents/:id` | Get one document. |
| `PATCH /documents/:id` | Update a document's content. |
| `GET /snippets` | List reusable content snippets. |
| `POST /snippets` | Create a snippet. |
| `DELETE /snippets/:id` | Delete a snippet. |

### Whoobe One (CMS: snippets, templates, kits, pages, websites, menus)

Content for the `whoobe-one-spike` block/page editor — a separate JSON node format from the Documents/Snippets above.

| Method & path | Description |
| --- | --- |
| `GET/POST /whoobe-one/snippets` | List/create reusable block snippets. |
| `PATCH/DELETE /whoobe-one/snippets/:id` | Update-in-place / delete a snippet. |
| `GET /whoobe-one/templates` | List whole-page templates. |
| `GET /whoobe-one/templates/:id` | Get one template. |
| `POST /whoobe-one/templates` | Create a template (unique `path`). |
| `PATCH /whoobe-one/templates/:id` | Update a template. |
| `DELETE /whoobe-one/templates/:id` | Delete a template. |
| `GET /whoobe-one/kits` | List named template collections ("kits"). |
| `GET /whoobe-one/kits/:id` | Get one kit. |
| `POST /whoobe-one/kits` | Create a kit. |
| `POST /whoobe-one/kits/:id/templates` | Append a template to an existing kit. |
| `DELETE /whoobe-one/kits/:id` | Delete a kit. |
| `GET /whoobe-one/pages?websiteId=` | List real, published-or-draft site pages. |
| `GET /whoobe-one/pages/:id` | Get one page. |
| `GET /whoobe-one/pages/:id/translations` | All locale variants of the same logical page. |
| `POST /whoobe-one/pages` | Create a page. |
| `PATCH /whoobe-one/pages/:id` | Update a page. |
| `DELETE /whoobe-one/pages/:id` | Delete a page. |
| `GET/POST /whoobe-one/websites` | List/create websites (domain + locale config a page tree belongs to). |
| `GET/PATCH/DELETE /whoobe-one/websites/:id` | Get/update/delete one website. |
| `GET /whoobe-one/website-paths?websiteId=` | List a website's menu/navigation entries. |
| `POST /whoobe-one/website-paths` | Create a menu entry. |
| `GET/PATCH/DELETE /whoobe-one/website-paths/:id` | Get/update/delete one menu entry. |

### Public site endpoints (no auth)

| Method & path | Description |
| --- | --- |
| `GET /public/pages/:locale/:slug?websiteId=` | Fetch a published Whoobe One page by locale + slug, for SSR/rendering. |
| `GET /public/sitemap.xml` | Generated sitemap of all published, sitemap-included pages. |
| `GET /public/robots.txt` | Generated `robots.txt` pointing at the sitemap. |

### Health

| Method & path | Description |
| --- | --- |
| `GET /health` | Liveness/uptime check. |

---

## `asset-processor` (port 3002)

DAM (Digital Asset Management) microservice: image processing/transform, metadata extraction, and S3/MinIO-backed asset & folder storage. Isolated from `core-api` so heavy image work never blocks the main API.

### Stateless image processing

| Method & path | Description |
| --- | --- |
| `POST /api/v1/process?mode=transform\|variants` | Resize/convert an uploaded (or base64) image; `variants` mode returns multiple sizes in one call. |
| `POST /api/v1/metadata` | Extract EXIF/IPTC/GPS/camera metadata from an uploaded file. |
| `POST /api/v1/watermark` | Composite a watermark image onto a source image. |

### DAM assets (S3/MinIO-backed, Postgres-tracked)

| Method & path | Description |
| --- | --- |
| `GET /api/v1/dam/info` | Non-secret storage config (bucket, endpoint, public base URL) for the admin UI. |
| `POST /api/v1/dam/upload` | Upload a file to S3/MinIO and record it (path, visibility, metadata). |
| `POST /api/v1/dam/transform` | Re-process an already-uploaded image (resize/format/watermark/etc.) and save it as a new version or `_edited` copy. |
| `DELETE /api/v1/dam/asset` | Delete an asset (and its thumbnails) from storage and the DB. |
| `GET /api/v1/dam/folders` | List DAM folders. |
| `POST /api/v1/dam/folders` | Create a folder. |
| `DELETE /api/v1/dam/folders` | Delete a folder and everything under it (descendant folders, asset records, and S3 objects). |
| `GET/POST /api/v1/dam/assets?folderPath=` | List assets in a folder, with resolved URLs + thumbnails (`POST` variant avoids URL-length limits for large folder-rule payloads). |
| `GET /api/v1/dam/assets/:id` | Get a single asset by record id, with resolved URLs — used to render an object's asset reference. |
| `PATCH /api/v1/dam/assets/metadata` | Update an asset's stored metadata. |
| `GET/POST /api/v1/dam/asset-urls` | Resolve an asset's (public or freshly presigned) URL + thumbnail URLs by path. |
| `GET/POST /api/v1/dam/exists` | Check whether an asset exists at a given path. |
| `POST /api/v1/dam/regenerate-thumbnails` | Regenerate thumbnail variants for one or more assets. |
| `POST /api/v1/dam/ensure-bucket` | Ensure the target bucket exists with the correct public-read policy for current folder rules. |
| `GET /dam-asset/*` | Streams a stored object through this server (signed S3 `GetObject`), so the browser never talks to S3/MinIO directly. |

### Health

| Method & path | Description |
| --- | --- |
| `GET /health` | Liveness/uptime check. |

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
