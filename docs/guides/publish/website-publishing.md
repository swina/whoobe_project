# Website Publishing Guide

This guide covers how to publish a Whoobe CMS website as a standalone, deployable frontend site. `whoobe-publish` generates either a **Next.js** or a **Nuxt 3** application that renders pages server-side with full SEO metadata, build-time Tailwind CSS, resolved data bindings, and ISR/revalidate caching. It also generates the config needed to reach the CMS's **API Gateway** (Brevo forms, other gateway-backed data bindings) and to prefer **CDN-mirrored** images over the CMS's own asset proxy — both required for the site to actually work once deployed outside the CMS's own network, not just to generate.

## Architecture Overview

```
┌──────────────────────┐     ┌───────────────────────────────┐
│  Whoobe CMS          │     │  Published Site (Next or Nuxt)│
│  (production)        │     │                               │
│  core-api            │◄────│  getPageData() → walkTree     │
│  ├─ /public/pages    │     │  ├─ server-side rendering     │
│  ├─ /public/websites │     │  ├─ ISR / revalidate          │
│  ├─ /public/dam/...  │     │  └─ cdnMirrors-aware images   │
│  └─ /dam-asset       │     │                               │
│                      │     │  WhoobeProvider + WhoobePage  │
│  gateway             │◄────│  → submitForm()/data bindings │
│  (Brevo, etc.)       │     │                               │
│                      │     │  Tailwind v4 (build-time)     │
│  MinIO / S3          │◄────│  Theme CSS @theme variables   │
│  (assets, optionally │     │                               │
│   mirrored to a CDN) │     │                               │
└──────────────────────┘     └───────────────────────────────┘
```

### Key concepts

| Concept | How it works |
|---|---|
| **Build-time API calls** | The generated app fetches the CMS public API at build time (no auth needed). ISR/revalidate re-fetches periodically for fresh content. |
| **Server-side rendering** | `walkTree()` from `@whoobe-cms/renderer` runs on the server, producing serializable `RenderDescriptor` trees. |
| **Tailwind CSS** | `whoobe-publish` extracts all CSS classes from the element trees and generates a `tailwind.config.ts` `safelist`. Tailwind v4's JIT engine generates only the used utilities at build time. |
| **Theme injection** | Website theme colors are emitted as `@theme { --color-* }` CSS variables. Fonts are loaded via Google Fonts `<link>` tags. |
| **Assets** | DAM references resolve to the CMS `/dam-asset/` proxy by default, but **prefer a CDN mirror** when the referenced asset has one (`cdnMirrors` in the page API response) - see [Step 1b](#step-1b-mirror-images-to-a-cdn-optional-but-recommended). |
| **API Gateway** | Forms wired to a Gateway endpoint (e.g. Brevo) and Gateway-backed data bindings need the Gateway's own public URL, not just the CMS API URL - see `--gateway-url` below. Without it, they silently fall back to `http://localhost:3001` and only work when the published site happens to run on the CMS's own host. |
| **Data bindings** | Collection queries and single-object bindings are resolved server-side via the public API at request time. ISR/revalidate caches the rendered output. |
| **Forms and search** | Work client-side via `useForm` / `search` - POST/GET directly to the CMS public API, or to the Gateway when the form targets a Gateway endpoint. |

### What stays in the CMS

The CMS **remains the single source of truth**. The published site is a read-only consumer of the public API:

- Pages are authored and published in the CMS
- Themes are configured in the CMS per website
- Data objects are managed in the CMS
- Assets are stored in MinIO/S3, optionally mirrored to a CDN (Cloudinary, via the Gateway), and served from either

### What gets generated

The published site is a **fully self-contained project** (`sites/<hash>/` by default) - not published to a real npm registry, but genuinely portable: `whoobe-publish` runs `pnpm pack` on every SDK package the site depends on (`@whoobe-cms/next`/`@whoobe-cms/nuxt` and its own internal dependencies) and bundles the resulting tarballs into the site's own `vendor/` folder, referenced via `file:./vendor/*.tgz`. `pnpm pack` rewrites each package's internal `workspace:*` references to real, resolvable version numbers as part of packing - verified live - so `pnpm install` resolves everything from the site's own directory alone, with **no monorepo checkout required anywhere**, not on your machine, not on a build server, not on the host you deploy to. Alongside `package.json`, the site also ships its own `pnpm-workspace.yaml` (the vendored-tarball overrides + an `allowBuilds` entry for esbuild, needed on pnpm 10+ - see [Troubleshooting](#pnpm-installpnpm-build-fails-on-a-remote-host-or-a-copy-outside-the-monorepo-even-though-it-worked-via-docker)) and a standalone `Dockerfile`, `nginx.conf`, and `deploy.sh` - see [Option B](#option-b-docker--nginx-self-contained) below.

Next.js output:

```
my-published-site/
├── package.json               # dependencies point at ./vendor/*.tgz
├── vendor/                    # packed SDK tarballs (pnpm pack)
├── Dockerfile                 # standalone - builds from this folder alone
├── nginx.conf                 # domain/base-path baked in, __PORT__ placeholder
├── deploy.sh                  # build + run + wire up nginx
├── next.config.ts             # basePath when --base-path is non-root
├── tailwind.config.ts         # safelist from class extraction
├── app/
│   ├── globals.css            # Theme CSS variables + fonts + Tailwind
│   ├── layout.tsx             # Root layout with WhoobeProvider + createWhoobeApi(apiUrl, gatewayUrl)
│   ├── page.tsx / [locale]/[...slug]/page.tsx
│   ├── sitemap.ts / robots.ts
├── src/lib/api.ts              # ApiClient + site config
└── .env.local                  # NEXT_PUBLIC_CMS_API_URL, NEXT_PUBLIC_GATEWAY_URL, ...
```

Nuxt output (equivalent shape, same `vendor/`/`Dockerfile`/`nginx.conf`/`deploy.sh`): `nuxt.config.ts` (`runtimeConfig.public`, `app.baseURL`), `app.vue`, `pages/[locale]/[...slug].vue`, `.env` (`NUXT_PUBLIC_*`).

---

## Prerequisites

- A running Whoobe CMS instance with **public API and Gateway accessible** from the build server (and, for the Gateway, from wherever the published site actually runs in production)
- A **website** created in the CMS with at least one published page
- The website's **UUID** (admin dashboard → Websites → Edit → URL)
- Node.js 20+ and pnpm 9+
- If publishing forms/data-bindings backed by the Gateway: the Gateway's own public base URL
- If mirroring images to a CDN: a CDN provider (e.g. Cloudinary) already configured as a Gateway endpoint/route in the admin dashboard, and a service account (email/password, **no MFA**) for `whoobe-sync-cdn`. **The CMS instance you run this against does not need to be public** - `mirror-cdn` (`apps/asset-processor/src/server.ts`) reads the asset's bytes directly from its own S3/MinIO (private is fine) and sends them to the CDN as base64 whenever `S3_PUBLIC_BASE_URL` isn't a genuinely public origin (`isPubliclyReachableUrl()` rejects `localhost`/private IPs/bare hostnames) - only outbound internet access to reach the Gateway → CDN provider is required, never inbound. This is by design (`docs/plans/assets/assets-cdn.md`): the feature exists specifically for a locked-down/VPN-only/local Whoobe instance. See "Option C: Fully static deployment" under [Step 3](#step-3-deploy) below for the scenario this enables end-to-end.

---

## Step 1: Generate the site

```bash
# From the monorepo root
pnpm publish:site \
  --api-url https://cms.example.com \
  --website-id <uuid> \
  --out-dir ./sites/my-company-site \
  --framework next \
  --domain www.example.com \
  --gateway-url https://cms.example.com:3001 \
  --revalidate 60
```

Or run `./publish-site.sh` for an interactive prompt (asks for all of the below, including the Gateway URL and base path, with sensible defaults) instead of passing flags directly.

### Options

| Flag | Default | Description |
|---|---|---|
| `--api-url` | (required) | Base URL of the CMS public API |
| `--website-id` | (required) | UUID of the website to publish |
| `--out-dir` | (required) | Output directory for the generated project |
| `--framework` | `next` | `next` or `vue` (generates Nuxt 3) |
| `--domain` | CMS hostname | Custom domain for SEO metadata (sitemap, robots, canonical URLs) |
| `--asset-base-url` | API URL host | Public base URL for DAM assets, when it differs from the API URL (e.g. a separate media domain) |
| `--gateway-url` | *(none)* | Base URL of the API Gateway. **Set this** whenever the site uses a Gateway-backed form (Brevo, etc.) or data binding - without it those fall back to `http://localhost:3001` |
| `--base-path` | `/` | Path the site is mounted under behind nginx in production (e.g. `/blog`) - independent from the CMS's own `websites.rootPath` field, which is a different concept (multi-site routing within the CMS itself). Must match whatever path you actually mount the site at (see [Step 3](#step-3-deploy)) or the framework's own static asset URLs will 404. |
| `--revalidate` | `60` | ISR/revalidate time in seconds (Next: build-time default; Nuxt: read at request time from `runtimeConfig`) |

### What happens

1. **Fetch website info** — `GET /public/websites/:id` returns website config + themes
2. **Fetch all published pages** — `GET /public/pages?websiteId=...` returns every published page
3. **Extract Tailwind classes** — recursively walks every page's element tree, collecting all CSS class names into the `safelist`
4. **Generate theme CSS** — converts theme colors to `@theme { --color-* }` variables, collects Google Fonts
5. **Scaffold the project** — writes a complete Next.js or Nuxt app with page routes matching the CMS page slugs, dynamic locale routing, ISR/revalidate-enabled data fetching via `getPageData()` (with the Gateway URL and any CDN mirrors already wired through), SEO metadata, sitemap/robots.

---

## Step 1b: Mirror images to a CDN (optional but recommended)

A published site's images resolve to the CMS's own `/dam-asset/` proxy by default - fine when the CMS itself has a genuinely public origin, but every request round-trips through it. Mirroring an asset to a CDN (Cloudinary, via a Gateway route already configured in the admin dashboard) gives it a stable, permanent, directly-CDN-served URL instead, and the published site **automatically prefers it** once mirrored (`cdnMirrors` in the `/public/pages/...` response, checked first by `resolveImageUrl()`).

Mirroring itself doesn't happen automatically on publish - run it as a separate step, before or after generating the site (it doesn't need the generated project, only the CMS API):

```bash
WHOOBE_SYNC_EMAIL=service-account@example.com \
WHOOBE_SYNC_PASSWORD=... \
pnpm publish:sync-cdn \
  --api-url https://cms.example.com \
  --website-id <uuid> \
  --gateway-route-id <cloudinary-upload-route-id>
```

- The service account **must not have MFA enabled** - the script logs in with plain email/password and exits with an explicit error if the account requires a TOTP challenge. Use a dedicated account for this, not a real admin's own login.
- `--gateway-route-id` is the Gateway route id for the CDN provider's upload route (e.g. Cloudinary's `image/upload`), already configured under Settings → DAM / the Gateway admin UI - the script never creates one itself.
- It walks every published page's image references, checks `GET /public/dam/assets/mirror-status` for each, and calls the existing `POST /api/v1/dam/assets/:id/mirror-cdn` (the same endpoint the Asset Manager's own "Publish to CDN" button uses) for whichever aren't mirrored yet.
- Re-running it is safe/idempotent - already-mirrored assets are skipped.
- If a site was already generated (Step 1) before running this, its `cdnMirrors` are read fresh from the API at **request time** (both Next revalidate and Nuxt runtime), not baked into the generated project - no need to re-run `publish:site` afterwards.

---

## Step 2: Build and test locally

Next.js:

```bash
cd ./sites/my-company-site
pnpm install
pnpm build
pnpm start
```

Nuxt:

```bash
cd ./sites/my-company-site
pnpm install
pnpm build      # nuxi build (node-server preset)
pnpm start      # node .output/server/index.mjs
# or: pnpm generate for a static export (no ISR/revalidate, no Gateway-URL-at-request-time)
```

Visit `http://localhost:3000/en/your-page-slug` (or `/your-page-slug` for a single-locale site) to verify:

- Pages render correctly with full layout
- Images load (from the DAM proxy, or from the CDN mirror URL if you ran Step 1b - check the `<img>` `src` in devtools)
- Navigation links work
- SEO meta tags are present in the HTML `<head>`
- Forms submit correctly - **including a Gateway-backed one (e.g. Brevo)** if the site has one; this is the one thing that *cannot* be verified by browsing the local dev build unless `--gateway-url` was reachable from your machine too
- Search works

---

## Step 3: Deploy

### Option A: Vercel (recommended for Next.js)

```bash
pnpm add -g vercel
cd ./sites/my-company-site
vercel --prod
```

Set environment variables in the Vercel dashboard (Next.js reads `NEXT_PUBLIC_*` at build time, so these must be set **before** the Vercel build runs, not just at runtime):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_CMS_API_URL` | `https://cms.example.com` |
| `NEXT_PUBLIC_WEBSITE_ID` | `<website-uuid>` |
| `NEXT_PUBLIC_ASSET_BASE_URL` | Public DAM/asset base URL |
| `NEXT_PUBLIC_GATEWAY_URL` | The Gateway's public URL, if used |
| `CMS_REVALIDATE` | `60` |

Add the custom domain in Vercel project settings → Domains. Since the generated site is now fully self-contained (see [What gets generated](#what-gets-generated)), `vercel --prod` from inside the generated folder alone works fine - no monorepo checkout needed, no special "root directory" setup required.

### Option B: Docker + nginx (self-contained)

Every generated site ships its own `Dockerfile`, `nginx.conf`, and `deploy.sh` - together a complete, standalone deploy mechanism that needs **only Docker (and optionally nginx) on the target host**, nothing else. Not this repo, not `packages/sdk/*`, not even the same machine you generated the site on - `rsync`/`scp`/`zip` the generated folder anywhere and run `./deploy.sh` there.

```bash
cd ./sites/my-company-site
PORT=3100 ./deploy.sh
```

What it does:

1. Builds the image from the Dockerfile in the current directory (`docker build --network host -t whoobe-site-<websiteId8> .` - `--network host` because Nuxt's/Next's build-time prerender/data fetch may need to reach the CMS API URL baked into `.env`/`.env.local`, harmless when that URL is genuinely public). The image itself needs nothing beyond what's already in this folder - dependencies resolve from `vendor/*.tgz` (see [What gets generated](#what-gets-generated)), not the npm registry or a monorepo.
2. Runs the container on `$PORT` (default `3100`) - `--env-file .env` for Nuxt, so its `NUXT_PUBLIC_*` runtime config can still be overridden without a rebuild; Next's `NEXT_PUBLIC_*` were already inlined at build time from `.env.local`.
3. Renders `nginx.conf` (domain and base path already baked in at generation time) with the actual port substituted, and - if `/etc/nginx/sites-enabled` exists on this host - installs and reloads it automatically. Otherwise it just prints where the rendered config landed (`/tmp/<image-name>-nginx.conf`) for you to add manually to whatever reverse proxy this host actually uses.

**Deploying to a different host than you generated the site on**: transfer the whole generated folder (it's self-contained) and run `deploy.sh` there:

```bash
rsync -az --delete ./sites/my-company-site/ user@remote-host:/opt/sites/my-company-site/
ssh user@remote-host "cd /opt/sites/my-company-site && PORT=3100 ./deploy.sh"
```

The Websites list in the admin dashboard has a **Publish** button that generates this exact two-command sequence (plus the CDN mirroring and site-generation steps before it) pre-filled for a given website - see the admin dashboard's Settings → Websites.

**TLS**: not automated by `deploy.sh`. The rendered vhost's `/.well-known/acme-challenge/` location is ready for a manual run:

```bash
certbot certonly --webroot -w /var/www/certbot -d www.example.com
# then add your own `listen 443 ssl` server block to the installed nginx config
```

**Redeploying after a content-only change**: with ISR/revalidate, no redeploy is needed - just wait out the revalidate window. A **theme, Gateway URL, base path, or `--asset-base-url` change** requires regenerating (Step 1, which also re-packs `vendor/*.tgz` and rewrites `Dockerfile`/`nginx.conf`) and re-running `deploy.sh` (these are all Next `NEXT_PUBLIC_*` build-time values, or values baked into `nuxt.config.ts`).

### Option C: Fully static deployment (Nuxt only) - no Whoobe runtime dependency except the Gateway

**The scenario this solves**: you author content on a local/private Whoobe instance (local Postgres, local MinIO/S3, never exposed to the internet) and want to publish a genuinely static site on a separate public domain, where the *only* thing that needs to stay reachable at runtime is the Gateway (for a Brevo form, say) - not the CMS's API, not its DAM, nothing else. This is different from Option B: that runs a live Node server that keeps calling `--api-url` on every request/revalidate forever, which would mean your local instance would need to stay up and be reachable from the public deployment permanently. Static export instead only touches the CMS at **build time, on your own machine** - the output is self-contained afterwards.

This works today because Nuxt's prerender crawler (`nitro.prerender.crawlLinks: true`, already set in the generated `nuxt.config.ts`) doesn't just copy files - it actually **executes** each page's `<script setup>` during the crawl, which runs `getPageData()`, fetches `/public/pages/...`, reads `cdnMirrors`, and lets `resolveImageUrl()` pick the CDN URL - all *before* the static HTML is written to disk. The resulting files reference the CDN directly; nothing in them points back at your local instance.

Procedure:

```bash
# 1. Mirror every image the site references to the CDN - run against your
#    LOCAL instance (this is where the asset rows/bytes actually live).
#    No public exposure needed - see Prerequisites above.
WHOOBE_SYNC_EMAIL=service-account@example.com \
WHOOBE_SYNC_PASSWORD=... \
pnpm publish:sync-cdn \
  --api-url http://localhost:3003 \
  --website-id <uuid> \
  --gateway-route-id <cloudinary-upload-route-id>

# 2. Generate the site - api-url still points at your LOCAL instance
#    (only used during this step, on this machine), gateway-url points at
#    wherever the PUBLIC Gateway actually is (this one IS used at runtime,
#    client-side, by submitForm()).
pnpm publish:site \
  --api-url http://localhost:3003 \
  --website-id <uuid> \
  --out-dir ./sites/my-company-site \
  --framework vue \
  --domain www.example.com \
  --gateway-url https://public-instance.example.com:3001

# 3. Build - the static crawl runs now, against your still-running local
#    instance, baking the already-mirrored CDN URLs into the output.
cd ./sites/my-company-site
pnpm install
pnpm generate   # nuxi generate, a genuine static export via Nitro
# Static files in ./.output/public/ - copy/rsync/deploy these anywhere
# (nginx serving plain files, S3+CloudFront, Netlify, Cloudflare Pages...).
# Your local Whoobe instance can be shut down after this step.
```

Verify before shutting down the local instance: open a generated HTML file (or a deployed page) and check an `<img src>` in devtools - it should be a CDN URL (e.g. `https://res.cloudinary.com/...`), not `/dam-asset/...` or `http://localhost:3003/...`. If it's still pointing at localhost, that image wasn't mirrored yet (step 1 didn't cover it - check `GET /public/dam/assets/mirror-status`) or the crawler never reached that page (no internal link to it - `crawlLinks` only discovers pages reachable via navigation; a truly orphaned page needs to be added to `nitro.prerender.routes` manually in `nuxt.config.ts`, not something `whoobe-publish` generates for you today).

**TODO**: Next.js has no equivalent today - the generated project has no `output: 'export'` support, so this exact flow (local authoring, zero runtime DAM/API dependency, CDN-backed static output) isn't available for `--framework next`. Adding it means emitting `output: 'export'` in `next.config.ts` and confirming `generateStaticParams` + `getPageData()` behave correctly under `next build`'s static export crawl (unverified - Next's static export has historically been stricter about what can run at build time than Nuxt's Nitro prerenderer). Not implemented yet - use Nuxt for this scenario in the meantime.

---

## Updating the published site

### Content changes (pages, data objects)

With ISR/revalidate (default 60s), new content is picked up automatically within the window. No rebuild needed.

### CDN mirrors

Re-run `publish:sync-cdn` (Step 1b) whenever new images are added to published pages - the published site picks up a newly-mirrored asset's URL on its next fetch (no redeploy needed, same as any other content change).

### Theme, Gateway URL, base path changes

These are **embedded at generation time** (Next: always; Nuxt: as defaults, though `NUXT_PUBLIC_*` can be overridden via the container's env at runtime - see Option B). To apply a change:

```bash
pnpm publish:site --api-url https://cms.example.com --website-id <uuid> --out-dir ./sites/my-company-site --gateway-url ... --base-path ...
cd ./sites/my-company-site && PORT=3100 ./deploy.sh
```

### New pages / structural changes (new slugs, renames)

The catch-all route accepts any path and resolves the slug via `getPageData()` at request time - new/renamed slugs work automatically after the next revalidate, no rebuild needed.

---

## Customizing the published site

The generated `src/lib/registry.ts` (Next) allows custom component overrides:

```tsx
// src/components/MyHero.tsx
export function MyHero({ descriptor }: { descriptor: RenderDescriptor }) {
  return (
    <section className="my-custom-hero">
      <WhoobeNode descriptor={descriptor} />
    </section>
  )
}

// src/lib/registry.ts
import { MyHero } from '@/components/MyHero'

export function createRegistry(): Registry {
  return {
    ...defaults,
    container: MyHero,  // override container rendering
  }
}
```

Then wire the registry in `layout.tsx`:

```tsx
import { createRegistry } from '@/lib/registry'

export default function RootLayout({ children }) {
  const registry = createRegistry()
  return (
    <WhoobeProvider registry={registry} api={api}>
      {children}
    </WhoobeProvider>
  )
}
```

---

## Troubleshooting

### "Cannot GET /websites" or API 404

Ensure the CMS public API is accessible. Test with:

```bash
curl https://cms.example.com/whoobe-one/websites
# Expected: 401 {"error":"Authentication required"}
```

### Forms/Gateway bindings don't work in production but did locally

Almost always a missing/unreachable `--gateway-url`. Check the deployed site's env (`NEXT_PUBLIC_GATEWAY_URL` / `NUXT_PUBLIC_GATEWAY_URL`) isn't empty and is reachable from wherever the site actually runs - not just from the CMS's own host. A form silently falling back to `http://localhost:3001` will fail with a network error in the browser console, not a CMS-side error.

### Images not using the CDN mirror

`cdnMirrors` is only populated for a reference once it's actually been mirrored (Step 1b) - check `GET /public/dam/assets/mirror-status?paths=<the DAM path>` against the CMS API directly to confirm. A ref with no mirror correctly falls back to the DAM proxy - that's not a bug.

### `pnpm install`/`docker build` fails with `ERR_PNPM_FETCH_404` on a `@whoobe-cms/*` package

`pnpm pack` didn't run, or `vendor/*.tgz` is missing/incomplete - re-run `whoobe-publish` (Step 1), which packs the SDK dependencies fresh every time. If `vendor/` has the tarballs but this still happens, check `package.json`'s `pnpm.overrides` block actually lists them (it should, generated automatically) - a nested dependency like `@whoobe-cms/renderer` needs that override to resolve locally instead of trying the public npm registry (where it doesn't exist).

### `pnpm install` at the repo root fails with `ERR_PNPM_FETCH_404` on a `@whoobe-cms/*` package

This is fixed as of this repo's `pnpm-workspace.yaml` no longer listing `sites/*` as a workspace member (see `CHANGES.md`) - if you still hit it, your checkout predates that fix; pull latest. What was happening: `sites/*` used to be a member of this repo's own pnpm workspace, and pnpm only reads a member's `pnpm.overrides` from the *workspace root*, never from the member's own `package.json` - so a generated site's override (pointing its internal `@whoobe-cms/*` deps at its local `vendor/*.tgz`) silently never applied whenever `pnpm install` ran at the repo root, and the whole install failed trying the public npm registry instead, for every workspace member, not just the site. A generated site was never meant to be part of this repo's own workspace in the first place - it's fully self-contained (see [What gets generated](#what-gets-generated)) and doesn't need to be.

### `pnpm install`/`pnpm build` fails on a remote host or a copy outside the monorepo, even though it worked via Docker

Your local/global `pnpm` is version 10 or newer. pnpm 10+ stopped reading `pnpm.overrides` (and other `pnpm.*` settings) from `package.json` entirely, for any project, workspace or not - and separately, blocks a dependency's install/postinstall scripts (e.g. esbuild's native-binary fetch, pulled in by every framework here) unless explicitly allowed, failing `pnpm build` outright with `ERR_PNPM_IGNORED_BUILDS`. The generated site ships its own `pnpm-workspace.yaml` (alongside `package.json`) with the same overrides plus `allowBuilds: { esbuild: true }` specifically to cover this - if you still hit either error, re-run `whoobe-publish` (Step 1) to regenerate it, or your checkout predates this fix (`CHANGES.md`). This doesn't affect the Docker deploy path ([Option B](#option-b-docker--nginx-self-contained)), since its `Dockerfile` pins pnpm 9 via corepack, which never had either restriction.

### Blank page or "Page not found"

Check:

1. The page is published in the CMS (`published: true`)
2. The website ID matches
3. The CMS API URL is correct and reachable from where the site runs
4. Check CMS server logs for `/public/pages/:locale/*` requests

### Tailwind classes missing

The `safelist` in `tailwind.config.ts` is generated from the element trees at generation time. If you add new elements with new classes after generation, re-run `whoobe-publish` to update the safelist. For dynamically-constructed classes (e.g. Alpine.js expressions), add them manually to the safelist.

---

## Technical Reference

### Generated API client methods

| Method | Endpoint | Purpose |
|---|---|---|
| `getPage(locale, path, websiteId?)` | `GET /public/pages/:locale/*` | Fetch a single published page (includes `cdnMirrors` when applicable) |
| `listPages(websiteId?)` | `GET /public/pages?websiteId=` | List all published pages |
| `getWebsite(id)` | `GET /public/websites/:id` | Fetch website info + themes |
| `getObject(id)` | `GET /public/data-objects/:id` | Fetch a published data object |
| `queryObjects(params)` | `POST /public/data-objects/query` | Query published objects |
| `search(params)` | `GET /public/search` | Full-text search |
| `submitForm(classId, attributes, formConfig?)` | `POST /public/forms/:classId/submit`, or `POST <gatewayUrl>/api/v1/gateway/submit` when `formConfig.gatewayEndpointName` is set | Submit a form - to a Data Object, or to a Gateway endpoint (Brevo, etc.) |

### SDK packages used

| Package | Role |
|---|---|
| `@whoobe-cms/renderer` | Tree walker, `ApiClient` (accepts a `gatewayUrl`), layout composer, `resolveImageUrl` (CDN-mirror-aware) |
| `@whoobe-cms/next` / `@whoobe-cms/nuxt` | Framework helpers: `getPageData`, `generateMetadataFromPage`, `staticParamsForSlugs` |
| `@whoobe-cms/react` / `@whoobe-cms/vue` | Framework adapters: `WhoobeProvider`, `WhoobeNode`, `WhoobePage`, hooks, `createWhoobeApi(baseUrl, gatewayUrl?)` |

**Not published to a real npm registry, but genuinely portable** - every `@whoobe-cms/*` dependency in a generated site's `package.json` is a `file:./vendor/*.tgz` reference to a tarball bundled inside the site's own folder (`pnpm pack`, run automatically at generation time - see [What gets generated](#what-gets-generated)). No monorepo checkout is needed to build or deploy a generated site, anywhere.

### CDN mirroring / Gateway internals

- `packages/core/src/dam/resolve-content-image-refs.ts` - shared DAM reference walk/resolve, used both by this pipeline and by email rendering (`docs/plans/assets/assets-cdn.md`).
- `apps/core-api/src/server.ts` - `GET /public/pages/:locale/*` / `GET /public/page/*` include `cdnMirrors`; `GET /public/dam/assets/mirror-status` reports mirror state for a set of references (public, no auth - mirror status isn't sensitive once mirrored).
- `apps/asset-processor/src/server.ts` - `POST /api/v1/dam/assets/:id/mirror-cdn` (authenticated) actually performs a mirror, via the Gateway's generic route executor.
- `packages/publish/src/sync-cdn-assets.ts` - the `whoobe-sync-cdn` orchestration script (Step 1b).
