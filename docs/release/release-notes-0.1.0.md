# Whoobe CMS 0.1.0 - release notes

First release. One version number for the whole product (`0.1.0`: while the version starts with `0.`, a minor release
may change behaviour). Written from `CHANGES.md` and checked against the code on **2026-10-07**; the procedure that
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
  directives applied from the editor). Guides: [`guides/audio-element.md`](guides/audio-element.md),
  [`guides/alpine-presets.md`](guides/alpine-presets.md).
- Customize > Border sliders can give 1px (`border`), and their first step removes the class instead of setting a 0.
- **Website export and import as a `.zip`** with everything the site refers to - snippets, module pages, data classes and
  objects, asset files - and the references rewritten on import, so the copy is a twin. Dry run, rollback on failure.
  Guide: [`guides/website-bundle.md`](guides/website-bundle.md).

**Data and assets**
- Data classes, components and objects (Pimcore-style), with workflow and publication; DAM with folders, thumbnails,
  visibility rules, optional CDN mirror; **Garage** as the default S3 store for local/LAN, an external S3 in production.

**Integration and publishing**
- API Gateway with endpoints, routes, OpenAPI import, site keys, forms; **vendor presets** for the "Add Endpoint" picker
  (Brevo, Cloudinary, HubSpot, Mailchimp, Shopify, Stripe, a fake-products demo). A preset can now be added to a running
  gateway: drop the `.json` in `apps/gateway/presets/` or in `GATEWAY_PRESETS_PATH` (a mounted volume) and reload the page.
- Publishing a website as a Next.js or Nuxt project, a Capacitor mobile app, a headless SDK (React, Vue, Svelte).

**Operations**
- Workspaces (one isolated stack per customer) with `provision-workspace.sh`, profiles and removal; TLS template.
- **Public sandbox**: a workspace with a profile (`deploy/profiles/sandbox.env`) that turns AI, mail, imports, CDN mirror
  and outbound HTTP off, caps assets, and is rebuilt every three hours. [`operations/sandbox.md`](operations/sandbox.md).

**Security** - 52 findings recorded, all 9 High fixed; API (1086 tests), isolation (14), browser (12) and static suites,
OWASP ZAP and image/TLS scans run in CI on every release commit.
[`security/status-summary.md`](security/status-summary.md).

## Behaviour changes to check before you install over a development setup

| Change | What you see | What to do |
|---|---|---|
| **Compose refuses to start without credentials**; Postgres and the S3 store listen on `127.0.0.1` only | `docker compose` names the missing variable; a database client on another machine cannot connect | set `POSTGRES_PASSWORD`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`; `WS_DATA_BIND_ADDRESS=0.0.0.0` to open the ports |
| **Garage replaces MinIO as the default store** | a fresh stack has no MinIO | copy existing data to the new store (see `operations/storage-backends.md`) or use `docker-compose.minio.yml` |
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
| Website export is a `.zip` | the file has another extension and carries the asset files | the old `.json` is still accepted on import |

New or changed variables are documented in `.env.example`; the full list of what each fix changed is in
[`security/status-summary.md`](security/status-summary.md) (section 5).

## Known limits

- Fresh install: done on an arm64 host (Ubuntu 22.04, nginx on the host, Let's Encrypt) following `operations/creating-workspaces.md`; it found and fixed three defects in the TLS scripts. A workspace answers on **one** host name (no `www` alias or redirect).
- **Not tested: upgrading** from an earlier installation (there is no earlier release). The first upgrade test belongs to
  0.2.0.
- Images are built and published by hand (`ghcr.io`); the automation of the release workflow is not done yet.
- No full Content-Security-Policy on the admin and editor SPAs (baseline headers and clickjacking protection are in);
  postponed on purpose until the SaaS mode.
- MinIO (opt-in) and the Postgres image carry upstream advisories that cannot be patched here: keep MinIO off public
  networks. `xlsx` has two accepted advisories (write-only use), reviewed until 2027-01-31.
- A website import does not copy users and roles, gateway endpoints and keys, mail and AI settings, domains or the
  version history of pages.
- The test instance on Oracle must be rebuilt with newly generated secrets (findings F-001 and F-009) before it is used
  as a reference installation.
- Plugins of the gateway are code and are loaded at startup (a restart is needed for them, not for presets).
