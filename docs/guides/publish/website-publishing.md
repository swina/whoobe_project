# Website Publishing Guide

This guide covers how to publish a Whoobe CMS website as a standalone, deployable frontend site. The published site is a **Next.js application** that renders pages server-side with full SEO metadata, build-time Tailwind CSS, resolved data bindings, and ISR caching.

## Architecture Overview

```
┌──────────────────────┐     ┌──────────────────────────────┐
│  Whoobe CMS          │     │  Published Site (Next.js)    │
│  (production)        │     │                              │
│                      │     │  next build                  │
│  core-api            │◄────│  ├─ generateStaticParams     │
│  ├─ /public/pages    │     │  ├─ getPageData() → walkTree │
│  ├─ /public/websites │     │  ├─ static HTML output       │
│  ├─ /public/assets   │     │  └─ ISR for dynamic pages    │
│  └─ /dam-asset       │     │                              │
│                      │     │  WhoobeProvider + WhoobePage │
│  whoobe-one-spike    │     │  → renders via React         │
│  (editor only)       │     │                              │
│                      │     │  Tailwind v4 (build-time)    │
│  MinIO / S3          │◄────│  Theme CSS @theme variables  │
│  (assets)            │     │  Google Fonts <link> tags    │
└──────────────────────┘     └──────────────────────────────┘
```

### Key concepts

| Concept | How it works |
|---|---|
| **Build-time API calls** | The Next.js app fetches the CMS public API at build time (no auth needed). ISR re-fetches periodically for fresh content. |
| **Server-side rendering** | `walkTree()` from `@whoobe-cms/renderer` runs on the server, producing serializable `RenderDescriptor` trees. No runtime Tailwind or client-side data fetching. |
| **Tailwind CSS** | The `whoobe-publish` CLI extracts all CSS classes from the element trees and generates a `tailwind.config.ts` `safelist`. Tailwind v4's JIT engine generates only the used utilities at build time. |
| **Theme injection** | Website theme colors are emitted as `@theme { --color-* }` CSS variables in `globals.css`. Fonts are loaded via Google Fonts `<link>` tags. |
| **Assets** | DAM references resolve to the CMS `/dam-asset/` proxy (already nginx-cached with `expires 1y`). |
| **Data bindings** | Collection queries and single-object bindings are resolved server-side via the public API at request time. ISR caches the rendered output. |
| **Forms and search** | These work client-side via `useForm` / `search` composables — they POST/GET directly to the CMS public API. |

### What stays in the CMS

The CMS **remains the single source of truth**. The published site is a read-only consumer of the public API:

- Pages are authored and published in the CMS
- Themes are configured in the CMS per website
- Data objects are managed in the CMS
- Assets are stored in MinIO/S3 and served via the CMS DAM proxy

### What gets generated

The published site is a standalone Next.js app with:

```
my-published-site/
├── package.json
├── next.config.ts
├── tailwind.config.ts       # safelist from class extraction
├── postcss.config.mjs
├── app/
│   ├── globals.css           # Theme CSS variables + fonts + Tailwind
│   ├── layout.tsx            # Root layout with WhoobeProvider
│   ├── page.tsx              # Home page (locale: default)
│   ├── sitemap.ts            # Dynamic sitemap
│   ├── robots.ts             # Robots.txt
│   ├── [locale]/
│   │   ├── page.tsx          # Locale root page
│   │   └── [...slug]/
│   │       └── page.tsx      # Catch-all for /{locale}/{slug}
├── src/
│   ├── lib/
│   │   ├── api.ts            # ApiClient + site config
│   │   └── registry.ts       # Component registry (custom overrides)
└── .env.local                # CMS_API_URL, CMS_WEBSITE_ID, etc.
```

---

## Prerequisites

- A running Whoobe CMS instance with **public API accessible** from the build server
- A **website** created in the CMS with at least one published page
- The website's **UUID** (available in the admin dashboard → Websites → Edit → URL)
- Node.js 20+ and pnpm 9+

---

## Step 1: Generate the site

```bash
# From the monorepo root
pnpm publish:site \
  --api-url https://cms.example.com \
  --website-id <uuid> \
  --out-dir ./sites/my-company-site \
  --domain www.example.com \
  --revalidate 60
```

### Options

| Flag | Default | Description |
|---|---|---|
| `--api-url` | (required) | Base URL of the CMS public API |
| `--website-id` | (required) | UUID of the website to publish |
| `--out-dir` | (required) | Output directory for the generated project |
| `--domain` | CMS hostname | Custom domain for SEO metadata (sitemap, robots, canonical URLs) |
| `--revalidate` | `60` | ISR revalidate in seconds |

### What happens

1. **Fetch website info** — `GET /public/websites/:id` returns website config + themes
2. **Fetch all published pages** — `GET /public/pages?websiteId=...` returns every published page
3. **Extract Tailwind classes** — recursively walks every page's element tree, collecting all CSS class names into the `safelist`
4. **Generate theme CSS** — converts theme colors to `@theme { --color-* }` variables, collects Google Fonts
5. **Scaffold the project** — writes a complete Next.js app with:
   - Page routes matching the CMS page slugs
   - Dynamic locale routing (`/{locale}/{slug}`)
   - ISR-enabled data fetching via `getPageData()`
   - SEO metadata from page settings (`generateMetadataFromPage`)
   - Sitemap and robots.txt

---

## Step 2: Build and test locally

```bash
cd ./sites/my-company-site
pnpm install
pnpm build
pnpm start
```

Visit `http://localhost:3000/en/your-page-slug` to verify:

- Pages render correctly with full layout
- Images load from the CMS DAM proxy
- Navigation links work
- SEO meta tags are present in the HTML `<head>`
- Forms submit correctly
- Search works

---

## Step 3: Deploy

### Option A: Vercel (recommended)

```bash
# Install Vercel CLI
pnpm add -g vercel

# Deploy
cd ./sites/my-company-site
vercel --prod
```

Set environment variables in Vercel dashboard:

| Variable | Value |
|---|---|
| `CMS_API_URL` | `https://cms.example.com` |
| `CMS_WEBSITE_ID` | `<website-uuid>` |
| `CMS_REVALIDATE` | `60` |

Add the custom domain in Vercel project settings → Domains.

### Option B: Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install && pnpm build
EXPOSE 3000
CMD ["pnpm", "start"]
```

```bash
docker build -t my-site .
docker run -p 4000:3000 -e CMS_API_URL=https://cms.example.com my-site
```

Then configure nginx:

```nginx
server {
    listen 443 ssl;
    server_name www.example.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Option C: Static export

For fully static hosting (S3, Cloudflare Pages, Netlify):

```bash
# In next.config.ts, add: output: 'export'
pnpm build
# Static files in ./out/
```

**Limitation:** Static export cannot use ISR — pages are snapshots at build time. Dynamic data (collection queries, bound objects) will use the value from the last build. Re-run the export when content changes.

---

## Updating the published site

### Content changes (pages, data objects)

With ISR (default `revalidate: 60`), new content is picked up automatically within the revalidation window. No rebuild needed.

To force immediate refresh, use Vercel's deploy hook or restart the Docker container.

### Theme changes

Theme colors, fonts, and custom CSS are **embedded at generation time**, not fetched at runtime. To apply theme changes:

```bash
# Re-generate and re-deploy
pnpm publish:site --api-url https://cms.example.com --website-id <uuid> --out-dir ./sites/my-company-site
cd ./sites/my-company-site
pnpm build && pnpm start
```

### New pages

ISR picks up new pages automatically when they're requested. The `generateStaticParams` returns an empty array (dynamic params), so every page is rendered on first request and cached by ISR.

### Structural changes (new slugs, page renames)

Next.js routes are based on the generated `app/[locale]/[...slug]/page.tsx` catch-all, which accepts any path. The CMS resolves the slug at build/ISR time via `getPageData()`. Renamed slugs work automatically after ISR refreshes.

---

## Customizing the published site

The generated `src/lib/registry.ts` allows custom React component overrides:

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

Ensure the CMS public API is accessible and that the nginx regex location for `/whoobe-one/*` API routes is matching (see deployment docs). Test with:

```bash
curl https://cms.example.com/whoobe-one/websites
# Expected: 401 {"error":"Authentication required"}
```

### Images not loading

Verify the CMS DAM proxy is accessible:

```bash
curl -I https://cms.example.com/dam-asset/test
# Expected: 404 (asset not found) but proxied to asset-processor
```

The published site generates `images.remotePatterns` in `next.config.ts` to allow Next.js Image optimization for CMS-hosted assets.

### Blank page or "Page not found"

Check:

1. The page is published in the CMS (`published: true`)
2. The website ID matches
3. The CMS API URL is correct
4. ISR hasn't failed: check CMS server logs for `/public/pages/:locale/*` requests

### Tailwind classes missing

The `safelist` in `tailwind.config.ts` is generated from the element trees at generation time. If you add new elements with new classes after generation, re-run `whoobe-publish` to update the safelist.

For dynamically-constructed classes (e.g., Alpine.js expressions), add them manually to the safelist.

---

## Technical Reference

### Generated API client methods

| Method | Endpoint | Purpose |
|---|---|---|
| `getPage(locale, path, websiteId?)` | `GET /public/pages/:locale/*` | Fetch a single published page |
| `listPages(websiteId?)` | `GET /public/pages?websiteId=` | List all published pages |
| `getWebsite(id)` | `GET /public/websites/:id` | Fetch website info + themes |
| `getObject(id)` | `GET /public/data-objects/:id` | Fetch a published data object |
| `queryObjects(params)` | `POST /public/data-objects/query` | Query published objects |
| `search(params)` | `GET /public/search` | Full-text search |
| `submitForm(classId, attributes)` | `POST /public/forms/:classId/submit` | Submit a form |

### SDK packages used

| Package | Role |
|---|---|
| `@whoobe-cms/renderer` | Tree walker, API client, layout composer |
| `@whoobe-cms/next` | Next.js helpers: `getPageData`, `generateMetadataFromPage`, `staticParamsForSlugs` |
| `@whoobe-cms/react` | React adapter: `WhoobeProvider`, `WhoobeNode`, `WhoobePage`, hooks |

All packages are published to npm as `@whoobe-cms/*` and are installed by the generated `package.json`.