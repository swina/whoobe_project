# Developing Whoobe

Moved here from the README: the details a contributor needs. What Whoobe is and how to use it is in the
[documentation](release/README.md); the rules for contributing are in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Monorepo layout

Managed with **pnpm workspaces** + **Turborepo**.

| Path | Package | Description |
| --- | --- | --- |
| `packages/core` | `@whoobe-cms/core` | Shared domain layer: Drizzle ORM schema/migrations (Postgres), Zod validation, auth, S3 client, XState workflows, mail rendering. |
| `packages/migration-tool` | `@whoobe-cms/migration-tool` | ETL CLI for migrating Documents/Classes/Objects/Assets out of Pimcore. |
| `packages/publish` | `@whoobe-cms/publish` | CLI generator that scaffolds a full Nuxt 3 or Next.js project from a CMS website (SSR with Tailwind v4, theme CSS, ISR). |
| `packages/mobile-app` | `@whoobe-cms/mobile-app` | CLI generator that scaffolds a Capacitor native mobile app (iOS/Android) from a CMS website's app pages. |
| `apps/core-api` | `@whoobe-cms/core-api` | Main Express backend API (data, DAM URLs, pages, forms, mail, search, AI). |
| `apps/asset-processor` | `@whoobe-cms/asset-processor` | Express microservice for asset upload/processing (Sharp, exiftool, S3) and the public `/dam-asset/*` proxy. |
| `apps/gateway` | `@whoobe-cms/gateway` | Express API gateway — unified entry point proxying internal services (core-api, asset-processor) and external remote APIs with auth injection, rate limiting, response schema inference, and a plugin system. |
| `apps/admin-dashboard` | `@whoobe-cms/admin-dashboard` | Vue 3 + Vite admin UI (overview, data objects, DAM, documents, pages, websites, API Gateway, settings). |
| `apps/whoobe-one-spike` | `@whoobe-cms/whoobe-one-spike` | Vue 3 visual WYSIWYG block/page builder, embedded in the admin dashboard for pages and HTML mail templates. |


## Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io/) 9.x (`corepack enable` or `npm i -g pnpm`)
- Docker (for local Postgres + Garage S3) , or your own Postgres 16 and S3-compatible storage
- Docker (for the complete stack), suggested for demo or testing.

## Install (for local development)

```bash
git clone https://github.com/swina/whoobe_project
cd whoobe_project
pnpm install
```


## Configure

You can run Whoobe in different modes:

- **Evaluation/Testing**: dockerize the complete stack `docker-compose.yml`
- **Local development**: dockerize PostgresDB `docker-compose.data.yml` and `npm install`
- **Production**: read the dedicated section


Start local infrastructure (Postgres + Garage S3; for production, object storage is a configuration choice: [docs/release/operations/storage-backends.md](release/operations/storage-backends.md)):

```bash
docker compose -f docker-compose.data.yml up -d --build
```

The whole monorepo reads a **single** `.env` at the repo root — docker-compose interpolates its `POSTGRES_*` vars, the Node services (`core-api`, `asset-processor`, `migration-tool`) load it via `@whoobe-cms/core`'s `loadRootEnv()`, and the Vite apps (`admin-dashboard`, `whoobe-one-spike`) load it via `envDir` in their `vite.config.ts`. `${VAR}` references are expanded everywhere (Vite natively, `loadRootEnv()` for Node); shell-exported vars always win.
The whole monorepo reads a **single** `.env` at the repo root (see [`.env.example`](../.env.example), commented line by line). Every
variable is described in [`docs/release/operations/configuration-reference.md`](release/operations/configuration-reference.md).
Copy `.env.example` to `.env` and change the `change_me_*` values (`S3_ACCESS_KEY_ID=GK$(openssl rand -hex 12)`,
`S3_SECRET_ACCESS_KEY=$(openssl rand -hex 32)`).

## Run

### Docker

The quickest way to test Whoobe is `./try.sh` (see the [README](../README.md)): it generates the settings and runs `docker-compose.yml`
for you. By hand, with a `.env` made as above:

```
$ git clone https://github.com/swina/whoobe_project
$ cd whoobe_project
$ docker compose up -d --build
```

Goto `http://localhost:3000` to login to the dashboard.
The first administrator is `admin@example.com` (or `SEED_ADMIN_EMAIL`); the password is generated and printed once in the core-api log at the first start, unless you set `SEED_ADMIN_PASSWORD` in `.env`.

### Development

In a development environment in order to use HMR feature you have to run the app using 
the development script to run the app. Before to launch the script you need to start the Database and the S3 storage (Garage) as docker services.

#### DB and S3 (Garage) storage docker

```
$ docker compose -f docker-compose.data.yml up -d`
```


#### Start the App

```bash
./dev-cms.sh                       # start all
./dev-cms.sh --build               # build the workspace packages first (and what they depend on), then start all.
                                   # Required once after a fresh clone: the packages ship no build output.
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
```


### Migrating from Pimcore

```bash
pnpm --filter @whoobe-cms/migration-tool cli -- help
pnpm --filter @whoobe-cms/migration-tool cli -- migrate-classes --dry-run
pnpm --filter @whoobe-cms/migration-tool cli -- migrate-objects --class=Product
pnpm --filter @whoobe-cms/migration-tool cli -- migrate-assets --dry-run
pnpm --filter @whoobe-cms/migration-tool cli -- migrate-documents --staging   # review first
pnpm --filter @whoobe-cms/migration-tool cli -- promote-staging --dry-run     # then promote
pnpm --filter @whoobe-cms/migration-tool cli -- migrate-documents             # or direct
```

Configure the source Pimcore MySQL connection in the repo-root `.env` (`PIMCORE_DB_HOST`, `PIMCORE_DB_PORT`, `PIMCORE_DB_USER`, `PIMCORE_DB_PASSWORD`, `PIMCORE_DB_NAME`, plus the target `DB_*` vars). `migrate-assets` also needs `PIMCORE_VAR_ASSETS_PATH` pointing at the source install's asset directory (e.g. `.../web/var/assets`) so it can read the actual file bytes it uploads.


## Other scripts

Run across the whole workspace via Turborepo:

```bash
pnpm build       # build all apps/packages
pnpm dev         # dev mode for all apps/packages
pnpm lint        # lint all apps/packages
pnpm typecheck   # typecheck all apps/packages
```


## Publish a Mobile App (iOS/Android)

Generate a native mobile app from your CMS website's app pages using Capacitor:

```bash
# Interactive script (recommended)
./publish-mobile.sh

# Or directly via CLI
pnpm run --filter @whoobe-cms/mobile-app... build
node packages/mobile-app/bin/whoobe-mobile.js \
  --api-url https://cms.example.com \
  --website-id <uuid> \
  --out-dir ./sites/my-mobile-app

cd ./sites/my-mobile-app
npm install
npm run build
npx cap add android
npx cap add ios      # macOS only
npx cap sync
npx cap open android # or: npx cap open ios
```

The generated app is a minimal Vite + Vue 3 SPA with hash routing, Alpine.js, Tailwind (browser runtime), and Capacitor v7. It fetches pages live from the CMS public API — same renderer that powers the browser preview. See `docs/release/content/publishing/capacitor-mobile-app.md` for the full guide.


## Publish a Website (SSR)

Generate a standalone Nuxt 3 or Next.js site for production deployment:

```bash
# Interactive script
./publish-site.sh

# Or directly via CLI
pnpm run --filter @whoobe-cms/publish... build
node packages/publish/bin/whoobe-publish.js \
  --api-url https://cms.example.com \
  --website-id <uuid> \
  --out-dir ./sites/my-site \
  --framework vue
```

See `docs/release/content/publishing/website-publishing.md` for the full guide.
