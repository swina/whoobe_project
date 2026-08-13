# Whoobe CMS

A TypeScript-native, open-source combining **PIM/MDM** (flexible product/data modeling), **DAM** (digital asset management), and a **headless CMS** with a visual block builder — plus a built-in ETL pipeline for a loss-less migration path off legacy instances.

The product itself is branded **Whoobe CMS** (npm scope `@whoobe-cms/*`).

## Main features

- **Data Objects & Classes (PIM/MDM)** — define custom data classes ("Class Definitions") with arbitrary field layouts through the admin UI. Supports reusable structured sub-schemas ("Components"), custom object listing views, ordering, and filtering.
- **Digital Asset Management (DAM)** — S3/MinIO-backed asset storage with Sharp-powered image processing (resize/WebP thumbnails via configurable presets) and EXIF/IPTC metadata extraction, with public/private folder visibility rules.
- **Headless CMS & Whoobe Studio** — a Vue-based visual WYSIWYG block/page builder that outputs structured, Zod-validated JSON layout trees, embeddable in the admin dashboard and renderable headlessly by any frontend.
- **Publishing workflow engine** — XState-driven publish/draft workflows with configurable states, transitions, and per-transition permissions.
- **Auth & permissions** — session-based authentication shared across backend services, with 2FA (TOTP/QR) and role-based permissions.
- **Pimcore migration tool** — a CLI ETL pipeline that imports legacy Pimcore Documents, Class Definitions, and Data Objects (from a source MySQL database and/or `var/classes` PHP files) directly into this system's Postgres schema.

## Monorepo layout

Managed with **pnpm workspaces** + **Turborepo**.

| Path | Package | Description |
| --- | --- | --- |
| `packages/core` | `@whoobe-cms/core` | Shared domain layer: Drizzle ORM schema/migrations (Postgres), Zod validation, auth, S3 client, XState workflows. |
| `packages/migration-tool` | `@whoobe-cms/migration-tool` | ETL CLI for migrating Documents/Classes/Objects/Assets out of Pimcore. |
| `apps/core-api` | `@whoobe-cms/core-api` | Main Express backend API. |
| `apps/asset-processor` | `@whoobe-cms/asset-processor` | Express microservice for asset upload/processing (Sharp, exiftool, S3). |
| `apps/admin-dashboard` | `@whoobe-cms/admin-dashboard` | Vue 3 + Vite admin UI (data objects, classes, DAM, settings, workflows). |
| `apps/whoobe-studio` | `@whoobe-cms/whoobe-studio` | Vue 3 visual WYSIWYG block/page builder, embedded via the admin dashboard. |
| `apps/whoobe-one-spike` | `@whoobe-cms/whoobe-one-spike` | Experimental standalone page-building editor. |

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

POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgrespassword
POSTGRES_DB=whoobe_db

DB_HOST=${WHOOBE_HOSTNAME}
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgrespassword
DB_NAME=whoobe_db

MIGRATION_SOURCE_ENCRYPTION_KEY=<random-32-byte-key>

S3_ENDPOINT=http://${WHOOBE_HOSTNAME}:9000
S3_BUCKET=whoobe-cms
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadminpassword
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_BASE_URL=http://${WHOOBE_HOSTNAME}:3002/dam-asset

VITE_ASSET_PROCESSOR_URL=http://${WHOOBE_HOSTNAME}:3002
VITE_CORE_API_URL=http://${WHOOBE_HOSTNAME}:3003

VITE_FONT_FAMILIES=Alfa+Slab+One|Asap+Condensed|...
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
