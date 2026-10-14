# Whoobe CMS 0.1.0 - release notes

First release. One version number for the whole product (`0.1.0`: while the version starts with `0.`, a minor release
may change behaviour). Written from `CHANGES.md` and checked against the code on **2026-10-14**; the procedure that
turns this into a release is in [`release-process.md`](release-process.md) (copy the text into
`.release/notes-v0.1.0.md` after `scripts/release.sh prepare`).

## What is in it

**Authoring**
- Page editor (Whoobe One): blocks, snippets and kits, themes, templates with header/aside/footer slots, dynamic website
  paths and menus, App Mode (phone frame with responsive classes), thumbnails from the Mobile/Tablet preview, version
  history, AI page generation and translation, Figma import.
- Rich text with TipTap: colour, highlight, alignment, links, lists. The colours now survive selecting the paragraph and
  using another control.
- **Audio element** (player or waveform, from an asset or a URL, optional title) and **Alpine presets** (named sets of
  directives applied from the editor). Guides: [`content/audio-element.md`](content/audio-element.md),
  [`content/alpine-presets.md`](content/alpine-presets.md).
- Customize > Border sliders can give 1px (`border`), and their first step removes the class instead of setting a 0.
- **Website export and import as a `.zip`** with everything the site refers to - snippets, module pages, data classes and
  objects, asset files - and the references rewritten on import, so the copy is a twin. Dry run, rollback on failure.
  Guide: [`content/website-bundle.md`](content/website-bundle.md).

- **Documentation sites**: a website whose source is a folder of Markdown assets, with an index (automatic or edited in the
  dashboard), navigation and client-side search, rendered by the editor app or generated as a static site. Guide:
  [`content/documentation-sites.md`](content/documentation-sites.md).
- Documentation sites draw `mermaid` code blocks as diagrams (editor, dashboard preview and generated site; the library is copied into the site, not loaded from a CDN). Guide: [`content/documentation-sites.md`](content/documentation-sites.md).
- **Table element bound to data**: a table can show a Data Class query or a gateway list, with chosen columns and formats, and paginate it
  (arrows or a *More* button); the pagination also works for gateway-bound repeaters. Also drawn by the generated Next.js, Nuxt and Svelte sites and the SDK (first page in the HTML; at most 1,000 rows). Guide:
  [`content/table-element.md`](content/table-element.md).
- **Download element** tied to an asset or a URL (link with `download`, or opened in a new tab); guide
  [`content/download-element.md`](content/download-element.md).
- **Snippet lock**: a locked snippet is not saved automatically.
- **Marketing automation**: a form sends its submission to an automation engine (Activepieces, n8n or any webhook) through the Gateway, the
  engine can answer a one-word `outcome`, and the page reacts with AlpineJS directives to the new `whoobe-form-result` event. The forms
  that start an automation are listed in **Data & Communication > Automations** (and in the editor). Whoobe does not run flows
  itself. Guide: [`communication/marketing-automation.md`](communication/marketing-automation.md).
- **File upload in forms**: a *File Upload* field, per-website limits (Settings > Form uploads), content checks, private
  storage. Guide: [`communication/form-uploads.md`](communication/form-uploads.md).
- **Editor tools**: a **Data** panel (the binding of the selected element, the fields of the nearest bound list as chips to click or drag, nested and linked bindings) and an **AlpineJS** panel (presets, with a built-in **Form result** preset that sets `done`, `ok` and `outcome` from `whoobe-form-result`, and the element's directives); a status bar with the selected element (`type > <tag> > #id`) and its Custom CSS (classes), a twin of Custom Classes in Advanced.
- **Forms**: the message a visitor sees names the field that was refused (a field named differently from the class field is the usual cause); the form can be hidden once it has been sent (*On success > Hide the form once it has been sent*; editor preview and React, Vue, Svelte, Next.js and Nuxt sites). Guide: [`communication/marketing-automation.md`](communication/marketing-automation.md).
- A consistent look for buttons, fields and windows (checked for contrast), the editor's tools as an icon bar, a menu
  next to the collapsed navigation.

**Data and assets**
- **Creating classes faster**: *+ From template* (Contact, Category, Product), *+ From file* (JSON, CSV, Excel: types are guessed, HTML becomes Rich text) and *Settings > Classes > Integration import* (from a GET route of an Integration); each can create the schema only or schema and data. **Bulk import** of objects (`POST /data-objects/bulk`: up to 500 rows per call, drafts, rows that break a rule come back in `rejected`).
- **Unique fields**: a class field can be marked *unique*; a second object with the same value is refused (409 in the API, "<field> is already in use" in forms).
- **Empty data**: removes every object of a class after typing the class name (Data Objects list and Settings > Classes); logged.
- **Pimcore migration**: class files with text ids and the Fields Summary of real installations are read correctly; before importing, *Choose fields and import...* lets the user pick and map fields; objects import in the background with a progress bar and a downloadable list of failed records.
- Data classes, components and objects (Pimcore-style), with workflow and publication; DAM with folders, thumbnails,
  visibility rules, optional CDN mirror; **Garage** as the default S3 store for local/LAN, an external S3 in production.

**Integration and publishing**
- **Outgoing mail** per website: SMTP or an HTTP mail provider described by a JSON file (**OneSignal** built in, more are a file each), secrets encrypted at rest. [`communication/mail-providers.md`](communication/mail-providers.md).
- API Gateway with endpoints, routes, OpenAPI import, site keys, forms; **vendor presets** for the "Add Endpoint" picker
  (Brevo, Cloudinary, HubSpot, Mailchimp, Shopify, Stripe, a fake-products demo). A preset can now be added to a running
  gateway: drop the `.json` in `apps/gateway/presets/` or in `GATEWAY_PRESETS_PATH` (a mounted volume) and reload the page.
- Publishing a website as a Next.js or Nuxt project, a Capacitor mobile app, a headless SDK (React, Vue, Svelte).

**Operations**
- Workspaces (one isolated stack per customer) with `provision-workspace.sh`, profiles and removal; TLS template.
- **Public sandbox**: a workspace with a profile (`deploy/profiles/sandbox.env`) that turns AI, mail, imports, CDN mirror
  and outbound HTTP off, caps assets, and is rebuilt every three hours. [`operations/sandbox.md`](operations/sandbox.md).

**Security** - 59 findings recorded, all High fixed; none of the review's findings is open (see below); API (1171 tests), unit (269), isolation (14), browser (30) and static suites,
OWASP ZAP and image/TLS scans run in CI on every release commit.
[`security/status-summary.md`](security/status-summary.md).

## Behaviour changes to check before you install over a development setup

| Change | What you see | What to do |
|---|---|---|
| **Compose refuses to start without credentials**; Postgres and the S3 store listen on `127.0.0.1` only | `docker compose` names the missing variable; a database client on another machine cannot connect | set `POSTGRES_PASSWORD`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`; `WS_DATA_BIND_ADDRESS=0.0.0.0` to open the ports |
| **Garage replaces MinIO as the default store** | a fresh stack has no MinIO; the MinIO overlay (its compose file and Docker build folder) is removed | copy existing data to the new store (see `operations/storage-backends.md`); an existing MinIO can stay as an external S3 endpoint |
| **Asset visibility is enforced** (`DAM_ENFORCE_ASSET_VISIBILITY`, on by default); `/public/**` is public | assets recorded as private answer 404 without a session | move what public pages use under `/public`, or set the flag to `false` |
| **Credentialed CORS only for an allowlist** | "Failed to fetch" from an origin that is not `WHOOBE_HOSTNAME` | `CORS_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` |
| **Publishing needs `objects:publish`** (pages, data objects, and now website import) | 403 when an editor changes `published`; an imported site arrives as drafts | grant the permission; `ENFORCE_PUBLISH_PERMISSION=false` restores the old behaviour |
| **Rich text is filtered when rendered** (no iframes/embeds, `<style>`, `id`, `data-*`; only colour, background and alignment as inline style) | embedded HTML disappears from pages | extend the allow-list in `packages/sdk/schema/src/sanitize.ts` |
| Image endpoints need a session or `DAM_SERVICE_TOKEN`; images over 100 MP are refused | 401 from scripts, 413 on huge uploads | `DAM_SERVICE_TOKEN`, `ASSET_MAX_INPUT_PIXELS` |
| Outbound requests (gateway, OpenAPI import, AI endpoints) refuse loopback and metadata addresses | an endpoint on a local address is refused | `OUTBOUND_ALLOW_HOSTS`, `OUTBOUND_ALLOW_LOOPBACK`; `OUTBOUND_ALLOW_PRIVATE=false` on internet-facing installs |
| Public routes are rate limited per address | 429 for a server-side rendering host | `PUBLIC_*_RATE_LIMIT_PER_MINUTE`; `TRUST_PROXY=1` behind nginx |
| Gateway forms forward only the form's own fields | an extra field is dropped | save the page again and republish; `GATEWAY_REQUIRE_FIELD_ALLOWLIST=true` refuses old bindings |
| Password reset revokes sessions; reset tokens are stored hashed; MFA secrets are encrypted at rest | tokens issued earlier stop working | set `TOTP_ENCRYPTION_KEY` and keep it (losing it forces MFA re-enrolment) |
| 5xx answers are generic in production | no SQL or stack text in the UI | the logs keep the detail |
| A gateway preset in `GATEWAY_PRESETS_PATH` replaces a built-in one with the same `id` | a custom file overrides a vendor preset | change its `id` to keep both |
| nginx caps request bodies for the **whole** workspace server (`WS_MAX_BODY`, default 100 MB), not only for uploads | a large JSON (website import, AI page, kit) no longer answers 413 at 1 MB | workspaces provisioned before 0.1.0 need the `client_max_body_size` line at the top of their `deploy/nginx/_locations-<slug>.inc` (or re-provisioning), then an nginx reload |
| **A public form's notification e-mail** is sent only for the notify block an author saved in a form of a page (F-053) | mail that relied on a recipient or subject changed in the browser request stops; a confirmation to the visitor goes to one plain address, 3 an hour per address | save the page after configuring the notification; the recipient comes from the form or the template |
| **Website previews live at the root preview path** (`https://host/whoobe-website/blog`), not under `/whoobe-one/`; the proxy asks core-api (`GET /site-root`) which paths are websites | a root preview path equal to a name the host uses (`/api`, `/auth`, `/assets`, `/login`, `/settings`, `/whoobe-one`, `/editor` ...) is refused; a workspace provisioned earlier still previews at `/whoobe-one/<root>/...` until its routing include is rendered again | `./scripts/render-workspace-nginx.sh <slug>` (see `operations/creating-workspaces.md`) |
| **Outgoing mail**: a configuration per website, SMTP or an HTTP provider (OneSignal built in); SMTP passwords and API keys are encrypted at rest | saving a password or key needs `MAIL_SETTINGS_ENCRYPTION_KEY` (new workspaces get one; older ones must add it); the mail settings API has a new shape (the old flat `PUT` body still works) | add `MAIL_SETTINGS_ENCRYPTION_KEY=$(openssl rand -hex 32)` to the workspace's env file and recreate the services; see `guides/mail-providers.md` |
| **File upload in forms** needs `UPLOAD_TOKEN_SECRET`; the proxy must route `/public/upload-data/` to the asset service | without the secret uploads answer 503; without the route a visitor's upload gets a 404/405 from core-api | `UPLOAD_TOKEN_SECRET=$(openssl rand -hex 32)` in the workspace's env file (new workspaces get one); `./scripts/render-workspace-nginx.sh <slug>`; see `guides/form-uploads.md` |
| **Third-party credentials are encrypted at rest** (AI provider keys, Figma token, push provider key) and the push provider key is no longer returned by any API (F-055, F-059) | without `INTEGRATION_SECRETS_ENCRYPTION_KEY` they stay in clear text and a warning is logged; the dashboard shows "saved - leave blank to keep it" in the push key field; if a push key was ever saved on an internet-reachable installation it was served by `GET /public/apps/:id`: rotate it | `INTEGRATION_SECRETS_ENCRYPTION_KEY=$(openssl rand -hex 32)` in the workspace's env file (new workspaces get one), recreate the services; keep it with the other keys |
| **Sessions are stored as hashes and purged** (F-056); **a database password is required** unless `NODE_ENV` is `development` or `test` (F-057) | everyone is logged out once after the upgrade (the old rows are deleted by migration 0053); a service started without `DB_PASSWORD` stops with "DB_PASSWORD is not set" | log in again; set `DB_PASSWORD` (Compose workspaces already have it) |
| **Function permissions are enforced** on 90 content routes (pages, websites, data objects, snippets and kits, themes, components): `pages:edit` etc. now do what their names say, and the broad `objects:read`/`objects:write` keep working as before | roles that only had function keys (and no `objects:*`) used to get 403 on those routes and now work; nothing that worked stops working | for a restricted role, give `objects:read` plus the function keys and **not** `objects:write` (it overrides them) |
| The seeded `editor` role gets `objects:read` and `objects:write`, `viewer` gets `objects:read` (they had neither, F-058) | existing installations: the missing links are added at the next start, so editors can now read and write content | review the roles you use |
| The public form submit limit (10 per address per 15 minutes) is configurable | no change unless you set `FORM_SUBMIT_RATE_LIMIT_PER_WINDOW` | - |
| **A class field marked *unique* is enforced** on create, update, forms, the client API and bulk import | a second object with the same value is refused with 409 (`UNIQUE_VIOLATION`); duplicates that already exist are not detected, and Pimcore imports do not check it | clean existing duplicates before marking a field unique |
| **`docker-compose.apps.yml` needs `PUBLISH_RUNNER_TOKEN`** (the publisher service that builds websites from the dashboard); five `PUBLISH_*` variables are new in the reference | `docker compose` refuses to start without it; without it on core-api the runner routes answer 503 | `PUBLISH_RUNNER_TOKEN=$(openssl rand -hex 32)` in the workspace's env file, same value for core-api and the publisher; see `operations/configuration-reference.md` section 7.1 |
| Website export is a `.zip` | the file has another extension and carries the asset files | the old `.json` is still accepted on import |

New or changed variables are documented in `.env.example`; the full list of what each fix changed is in
[`security/status-summary.md`](security/status-summary.md) (section 5).

## Known limits

- **Deployment model:** one workspace per organisation. Different companies or legal entities need different workspaces; roles are for the functions and divisions of one organisation, and permissions apply to the whole workspace (there is no per-website permission).

- **Findings from the review, all fixed in this release:** function-level permissions (F-058: 90 content routes accept `pages:edit`, `snippets:delete` ... or the broad key; see `architecture/authentication-and-authorization.md`), session ids stored as hashes and old sessions purged (F-056), no default database password outside development/test (F-057), AI/Figma/push credentials in clear text (F-055, needs `INTEGRATION_SECRETS_ENCRYPTION_KEY`), the OneSignal REST API key served by a public route (F-059), the seeded editor/viewer roles without `objects:*` (F-058, part).
- Marketing automation: a form submission is the only trigger; the Gateway still returns the engine's whole reply to the browser next to `outcome` (the flow must not answer with secrets or personal data); the AlpineJS reaction was not checked against a Content-Security-Policy without `unsafe-eval`.
- Form uploads: no malware scan; forms that send to a gateway endpoint do not take files.
- The DAST scan (OWASP ZAP) ran on the release commit and passed; the manual security checklist was not repeated for the features added after 2026-10-09.
- No audit log of administrative actions; `/health` does not check the database; no metrics; one instance per service (see `operations/observability-and-logging.md` and `operations/capacity-and-scaling.md`).

- Importing data: a background Pimcore import lives in the memory of core-api (a restart loses its progress, not the objects already written); the file and Integration wizards read one request, with no paging; *Empty data* cannot be undone; nested fields (blocks, field collections) cannot be mapped in the Pimcore field dialog; the Pimcore adapter expects the `o_` column prefix of Pimcore 10 and older.
- Fresh install: done on an arm64 host (Ubuntu 22.04, nginx on the host, Let's Encrypt) following `operations/creating-workspaces.md`; it found and fixed three defects in the TLS scripts. A workspace answers on **one** host name (no `www` alias or redirect).
- **Not tested: upgrading** from an earlier installation (there is no earlier release). The first upgrade test belongs to
  0.2.0.
- Images are built and published by hand (`ghcr.io`); the automation of the release workflow is not done yet.
- No full Content-Security-Policy on the admin and editor SPAs (baseline headers and clickjacking protection are in);
  postponed on purpose (Whoobe is deployed one organisation per instance; see `architecture/architecture-overview.md` section 7).
- The Postgres image carries upstream advisories that cannot be patched here. `xlsx` has two accepted advisories (write-only use), reviewed until 2027-01-31.
- A website import does not copy users and roles, gateway endpoints and keys, mail and AI settings, domains or the
  version history of pages.
- The test instance on Oracle must be rebuilt with newly generated secrets (findings F-001 and F-009) before it is used
  as a reference installation.
- Plugins of the gateway are code and are loaded at startup (a restart is needed for them, not for presets).
