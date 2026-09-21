------------------------------
# Whoobe 
The Unified Open-Source Composite Data & Full-CRUD Application Platform
------------------------------


A TypeScript-native, open-source **PIM/MDM** (flexible product/data modeling) + **DAM** (digital asset management) + **headless CMS** with a visual block builder — plus a built-in ETL pipeline for a loss-less migration path off legacy instances.

The product itself is branded **Whoobe** (npm scope `@whoobe-cms/*`).

## Main features

- **Data Objects & Classes (PIM/MDM)** 
  
  Define custom data classes ("Class Definitions") with arbitrary field layouts (text, rich-text/WYSIWYG, numbers, dates, selects, assets, relations, `fieldcollections`) through the admin UI, including reusable structured sub-schemas ("Components"). Objects get per-class listing views with ordering and filtering, multiple locales/translations, and CSV export.

  Dynamic Injection into the Editor: Data Objects exposes visual keys in the visual builder (whoobe-one-spike). The designer drags and drops a graphical element and connects it in real time to live data from the Data Object classes.

- **Digital Asset Management (DAM)** 
  S3/MinIO-backed asset storage with Sharp-powered image processing (configurable thumb/medium/large presets) and EXIF/IPTC metadata extraction; public/private folder visibility rules, folder management, versioning, and presigned URLs for private assets. 
  Includes asynchronous integration via API Gateway with Cloudinary; selected assets can be pushed to the public cloud, storing the CDN URL in the metadata. At publish time, the user chooses the media source (Local S3 vs. Cloudinary CDN), enabling offline/local preview architectures connected to public front-end distribution channels

- **Headless CMS & visual page builder** 

  A Vue-based WYSIWYG block/page editor (`whoobe-one-spike`, embedded in the admin dashboard) that outputs structured, Zod-validated JSON layout trees. Pages carry SEO/sitemap/search settings, per-locale translations, a publish gate + workflow state, and render publicly through dynamic URL path patterns. Blocks data binding to Data Object classes and API Gateway whit schema inferrer.


- **API Gateway** 
  
  A unified Express gateway (port 3001) that proxies internal services (core-api, asset-processor) and external remote APIs with authentication injection, rate limiting, response schema inference, and a convention-based plugin system. Gateway endpoints and routes are configured through the admin UI, and inferred response schemas can be bound to page builder blocks via `{{ gateway:... }}` expressions.
  Built-in vendor preset for : Shopify, HubSpot, Brevo, Stripe.

  Dynamic Injection into the Editor: The Gateway queries the remote endpoint (or reads its OpenAPI/Swagger specifications), validates its contract at runtime, and exposes it as visual keys in the visual builder (whoobe-one-spike). The designer drags and drops a graphical element and connects it in real time to live data from the external system (e.g., inventory from an ERP).

- **Mobile App Publishing**

  Generate a **native iOS/Android mobile app** from your Whoobe website using Capacitor. The app renders only `kind: "app"` pages (mobile-first layouts with bottom navigation) and connects to your CMS via the public API.


- **Forms** 
  
  A Form element in the page builder that submits to a public endpoint, storing submissions as draft (unpublished) Data Objects; honeypot spam trap and per-IP rate limiting; success/error feedback as a click-to-close popup on the page.

- **Email notifications & mail templates** 
  
  Global SMTP configuration (Settings → Mail), reusable **mail templates** (HTML authored in the page-builder editor, or plain text) with `{form.field}` token personalization and dynamic `to`/`bcc`; a "BCC the from address" audit flag; DAM images and web-font handling in sent emails; and a full **mail log** (preview, resend, search, pagination, bulk delete).

- **Publishing workflow engine** 
  
  XState-driven publish/draft workflows with configurable states and transitions, plus a transition audit log.

- **Auth & permissions** 
  
  session-based authentication shared across backend services, with 2FA (TOTP via QR code, recovery codes) and role-based permissions.

- **AI agent** 

  LLM-powered page/snippet/image/text generator (OpenAI / Anthropic / Google) with a generation history panel in the editor.

- **Site search** 
  
  headless public search across published pages and Data Objects, with type/class filtering.

- **Websites & URL paths** 

  manage multiple websites with default/supported locales, and dynamic URL path patterns (`/it/news/{slug}`) served by the public page route.

- **Figma → Whoobe Converter (BETA)**

  Import from Figma content into the Whoobe editor

- **Pimcore migration tool** 

  a CLI ETL pipeline that imports legacy Pimcore Documents, Class Definitions, Data Objects, and Assets (from a source MySQL database and/or `var/classes` PHP files) directly into this system's Postgres schema.



> Some admin sections are still placeholders pending future work — e.g. Roles/Users management and file-based migration — while the rest above are implemented end to end.

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
- Docker (for local Postgres + MinIO) , or your own Postgres 16 and S3-compatible storage
- Docker (for the complete stack), suggested for demo or testing.

## Install (for local development)

```bash
git clone https://github.com/swina/whoobe_cms
cd whoobe_cms
pnpm install
```

## Configure

You can run Whoobe in different modes:

- **Evaluation/Testing**: dockerize the complete stack `docker-compose.yml`
- **Local development**: dockerize PostgresDB `docker-compose.data.yml` and `npm install`
- **Production**: read the dedicated section


Start local infrastructure (Postgres + MinIO):

```bash
docker compose -f docker-compose.data.yml up -d --build
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
VITE_GATEWAY_URL=http://${WHOOBE_HOSTNAME}:3001

# --- gateway ---
GATEWAY_PORT=3001
GATEWAY_CORE_API_URL=http://${WHOOBE_HOSTNAME}:3003
GATEWAY_ASSET_PROCESSOR_URL=http://${WHOOBE_HOSTNAME}:3002
GATEWAY_DEFAULT_RATE_LIMIT_RPS=10

# --- whoobe-one-spike (Vite) ---
VITE_FONT_FAMILIES=Alfa+Slab+One|Asap+Condensed|Abel|Alice|Alegreya|Amethysta|Archivo+Black|Barlow|Barlow+Condensed|Bungee+Inline|Expletus+Sans|Lora|Montserrat|Nunito+Sans|Oi|Open+Sans|PT+Sans|Roboto|Roboto+Condensed|Quattrocento|Raleway|Ultra|Yatra+One
```

`core-api` creates the database and applies migrations automatically on startup, so no separate migration step is required for a fresh Postgres instance.

## Run

### Docker

The quickest way to test Whoobe CMS is to run the `docker-compose.yml`

```
$ git clone https://github.com/swina/whoobe_cms
$ cd whoobe_cms
$ docker compose up -d --build
```

Goto `http://localhost:3000` to login to the dashboard.
Initial user is `admin@example.com`, password `admin123`

### Development

In a development environment in order to use HMR feature you have to run the app using 
the development script to run the app. Before to launch the script you need to start the Database and the S3/Minio Storage Engine as docker services.

#### DB and S3/Minio Storage docker

```
$ docker compose -f docker-compose.data.yml up -d`
```


#### Start the App

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
pnpm run --filter @whoobe-cms/mobile-app build
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

The generated app is a minimal Vite + Vue 3 SPA with hash routing, Alpine.js, Tailwind (browser runtime), and Capacitor v7. It fetches pages live from the CMS public API — same renderer that powers the browser preview. See `docs/guides/publish/capacitor-mobile-app.md` for the full guide.

## Publish a Website (SSR)

Generate a standalone Nuxt 3 or Next.js site for production deployment:

```bash
# Interactive script
./publish-site.sh

# Or directly via CLI
pnpm run --filter @whoobe-cms/publish build
node packages/publish/bin/whoobe-publish.js \
  --api-url https://cms.example.com \
  --website-id <uuid> \
  --out-dir ./sites/my-site \
  --framework vue
```

See `docs/guides/publish/website-publishing.md` for the full guide.
