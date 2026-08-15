# Whoobe CMS

A TypeScript-native, open-source **PIM/MDM** (flexible product/data modeling) + **DAM** (digital asset management) + **headless CMS** with a visual block builder — plus a built-in ETL pipeline for a loss-less migration path off legacy instances.

The product itself is branded **Whoobe CMS** (npm scope `@whoobe-cms/*`).

## Main features

- **Data Objects & Classes (PIM/MDM)** — define custom data classes ("Class Definitions") with arbitrary field layouts (text, rich-text/WYSIWYG, numbers, dates, selects, assets, relations, `fieldcollections`) through the admin UI, including reusable structured sub-schemas ("Components"). Objects get per-class listing views with ordering and filtering, multiple locales/translations, and CSV export.
- **Digital Asset Management (DAM)** — S3/MinIO-backed asset storage with Sharp-powered image processing (configurable thumb/medium/large presets) and EXIF/IPTC metadata extraction; public/private folder visibility rules, folder management, versioning, and presigned URLs for private assets.
- **Headless CMS & visual page builder** — a Vue-based WYSIWYG block/page editor (`whoobe-one-spike`, embedded in the admin dashboard) that outputs structured, Zod-validated JSON layout trees. Pages carry SEO/sitemap/search settings, per-locale translations, a publish gate + workflow state, and render publicly through dynamic URL path patterns.
- **Forms** — a Form element in the page builder that submits to a public endpoint, storing submissions as draft (unpublished) Data Objects; honeypot spam trap and per-IP rate limiting; success/error feedback as a click-to-close popup on the page.
- **Email notifications & mail templates** — global SMTP configuration (Settings → Mail), reusable **mail templates** (HTML authored in the page-builder editor, or plain text) with `{form.field}` token personalization and dynamic `to`/`bcc`; a "BCC the from address" audit flag; DAM images and web-font handling in sent emails; and a full **mail log** (preview, resend, search, pagination, bulk delete).
- **Publishing workflow engine** — XState-driven publish/draft workflows with configurable states and transitions, plus a transition audit log.
- **Auth & permissions** — session-based authentication shared across backend services, with 2FA (TOTP via QR code, recovery codes) and role-based permissions.
- **AI agent** — LLM-powered page/snippet generator (OpenAI / Anthropic / Google) with a generation history panel in the editor.
- **Site search** — headless public search across published pages and Data Objects, with type/class filtering.
- **Websites & URL paths** — manage multiple websites with default/supported locales, and dynamic URL path patterns (`/it/news/{slug}`) served by the public page route.
- **Pimcore migration tool** — a CLI ETL pipeline that imports legacy Pimcore Documents, Class Definitions, Data Objects, and Assets (from a source MySQL database and/or `var/classes` PHP files) directly into this system's Postgres schema.

> Some admin sections are still placeholders pending future work — e.g. Roles/Users management and file-based migration — while the rest above are implemented end to end.

## Monorepo layout

Managed with **pnpm workspaces** + **Turborepo**.

| Path | Package | Description |
| --- | --- | --- |
| `packages/core` | `@whoobe-cms/core` | Shared domain layer: Drizzle ORM schema/migrations (Postgres), Zod validation, auth, S3 client, XState workflows, mail rendering. |
| `packages/migration-tool` | `@whoobe-cms/migration-tool` | ETL CLI for migrating Documents/Classes/Objects/Assets out of Pimcore. |
| `apps/core-api` | `@whoobe-cms/core-api` | Main Express backend API (data, DAM URLs, pages, forms, mail, search, AI). |
| `apps/asset-processor` | `@whoobe-cms/asset-processor` | Express microservice for asset upload/processing (Sharp, exiftool, S3) and the public `/dam-asset/*` proxy. |
| `apps/admin-dashboard` | `@whoobe-cms/admin-dashboard` | Vue 3 + Vite admin UI (overview, data objects, DAM, documents, pages, websites, settings). |
| `apps/whoobe-one-spike` | `@whoobe-cms/whoobe-one-spike` | Vue 3 visual WYSIWYG block/page builder, embedded in the admin dashboard for pages and HTML mail templates. |
| `apps/whoobe-studio` | `@whoobe-cms/whoobe-studio` | Legacy standalone document editor (documents pipeline being retired). |

## Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io/) 9.x (`corepack enable` or `npm i -g pnpm`)
- Docker (for local Postgres + MinIO), or your own Postgres 16 and S3-compatible storage

## Install

```bash
git clone <repo-url> <your_folder>
cd <your_folder>
pnpm install
```

## Configure

Start local infrastructure (Postgres + MinIO):

```bash
docker compose up -d
```

The whole monorepo reads a **single** `.env` at the repo root — docker-compose interpolates its `POSTGRES_*` vars, the Node services (`core-api`, `asset-processor`, `migration-tool`) load it via `@whoobe-cms/core`'s `loadRootEnv()`, and the Vite apps (`admin-dashboard`, `whoobe-one-spike`) load it via `envDir` in their `vite.config.ts`. `${VAR}` references are expanded everywhere (Vite natively, `loadRootEnv()` for Node); shell-exported vars always win.

**`.env`** (repo root)
```
# The hostname all derived URLs are built from - change here for the
# whole stack at once, or per run via ./dev-cms.sh --hostname <name>.
WHOOBE_HOSTNAME=localhost
DB_HOSTNAME=<database_hostname>
S3_ENDPOINT_HOSTNAME=<S3_endpoint_hostname>

# --- Postgres container (docker-compose.yml) ---
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgrespassword
POSTGRES_DB=whoobe_db

# --- Shared Postgres connection (core-api, asset-processor, migration-tool) ---
DB_HOST=${DB_HOSTNAME}
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgrespassword
DB_NAME=whoobe_db

# --- core-api only ---
# Encryption key for stored Pimcore migration sources (aes-256, 32 bytes).
MIGRATION_SOURCE_ENCRYPTION_KEY=my_secret_key_change_me

# --- asset-processor only: S3/MinIO connection ---
# Owned exclusively by the backend - never shipped to the browser.
S3_ENDPOINT=http://${S3_ENDPOINT_HOSTNAME}:9000
S3_BUCKET=whoobe-cms
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadminpassword
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_BASE_URL=http://${WHOOBE_HOSTNAME}:3002/dam-asset

# --- admin-dashboard (Vite) ---
VITE_ASSET_PROCESSOR_URL=http://${WHOOBE_HOSTNAME}:3002
VITE_CORE_API_URL=http://${WHOOBE_HOSTNAME}:3003

# --- whoobe-one-spike (Vite) ---
VITE_FONT_FAMILIES=Alfa+Slab+One|Asap+Condensed|Abel|Alice|Alegreya|Amethysta|Archivo+Black|Barlow|Barlow+Condensed|Bungee+Inline|Expletus+Sans|Lora|Montserrat|Nunito+Sans|Oi|Open+Sans|PT+Sans|Roboto|Roboto+Condensed|Quattrocento|Raleway|Ultra|Yatra+One
```

`core-api` creates the database and applies migrations automatically on startup, so no separate migration step is required for a fresh Postgres instance.

## Run (development)

The quickest way to start the core services (admin-dashboard, core-api, asset-processor, whoobe-one-spike) together:

```bash
./dev-cms.sh                       # start all
./dev-cms.sh --build               # rebuild the workspace packages first, then start all
./dev-cms.sh --hostname develop.local   # override ONLY the browser-facing app endpoints (VITE_* URLs)
./dev-cms.sh --stop                # stop all
```

Use `--hostname` matching the hostname you open the dashboard from (the session cookie is host-only + `SameSite=Lax`, so it only reaches APIs on the same host). DB/S3 endpoints are external infrastructure and stay as configured in the `.env`.

| App | URL |
| --- | --- |
| admin-dashboard | http://localhost:3000 |
| asset-processor | http://localhost:3002 |
| core-api | http://localhost:3003 |
| whoobe-one-spike | http://localhost:3006 |

To run an individual app/package instead:

```bash
pnpm --filter @whoobe-cms/core-api dev
pnpm --filter @whoobe-cms/admin-dashboard dev
pnpm --filter @whoobe-cms/whoobe-studio dev   # http://localhost:3004
```

### Migrating from Pimcore

```bash
pnpm --filter @whoobe-cms/migration-tool cli -- help
pnpm --filter @whoobe-cms/migration-tool cli -- migrate-classes --dry-run
pnpm --filter @whoobe-cms/migration-tool cli -- migrate-objects --class=Product
pnpm --filter @whoobe-cms/migration-tool cli -- migrate-documents
```

Configure the source Pimcore MySQL connection in the repo-root `.env` (`PIMCORE_DB_HOST`, `PIMCORE_DB_PORT`, `PIMCORE_DB_USER`, `PIMCORE_DB_PASSWORD`, `PIMCORE_DB_NAME`, plus the target `DB_*` vars).

## Other scripts

Run across the whole workspace via Turborepo:

```bash
pnpm build       # build all apps/packages
pnpm dev         # dev mode for all apps/packages
pnpm lint        # lint all apps/packages
pnpm typecheck   # typecheck all apps/packages
```
