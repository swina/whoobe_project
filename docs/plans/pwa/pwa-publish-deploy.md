# PWA Publish/Deploy Plan — All Pages (Standard + App Pages)

## Goal

Extend the Next.js site generator (docs/plans/website-publish.md) so the **published website** is a fully installable Progressive Web App: with a manifest, service worker, offline fallback, and install prompt. The PWA must work for **all page types** — standard pages (desktop layout, header/footer) and app pages (mobile layout, appHeader/appFooter, bottom navigation).

This is **not** the "App Mode" editor feature (pwa-mobile-plan.md) — that's about building mobile-first content. This is about the **deployment artifact** — the generated Next.js site — becoming a PWA itself.

---

## 1. PWA Manifest

The generated Next.js site needs a `manifest.json` that makes the browser offer the "Add to Home Screen" prompt.

### Schema

```typescript
interface PwaManifest {
  name: string
  short_name: string
  description: string
  start_url: string
  display: 'standalone' | 'fullscreen' | 'minimal-ui'
  orientation: 'portrait' | 'landscape' | 'any'
  background_color: string
  theme_color: string
  icons: {
    src: string
    sizes: string
    type: string
    purpose?: 'any' | 'maskable' | 'monochrome'
  }[]
  scope: string
  categories?: string[]
  lang?: string
}
```

### Storage — `websites.pwa_config`

From pwa-mobile-plan.md, `websites` already planned for a `pwa_config` jsonb column with icons, colors, display, orientation, etc. The generator reads this field at generation time and writes `public/manifest.json`.

### Generation flow

```
CLI reads website.pwa_config
  → writes public/manifest.json with name/short_name/icons from config
  → writes app/layout.tsx with <link rel="manifest"> in <head>
```

### Start URL & scope

| Page type | start_url | scope |
|-----------|-----------|-------|
| Standard pages | `/` (website root) | `/` (entire site) |
| App-only PWA | `/app` (app landing) | `/app/*` |

For a mixed site (standard + app pages), `start_url = '/'` and `scope = '/'`. The service worker handles both layouts transparently.

---

## 2. Service Worker

The generated Next.js site must register a service worker that:

- **Precaches** the app shell (layout, critical CSS, manifest)
- **Stale-while-revalidates** page data from the CMS public API
- **Cache-first** serves DAM assets (images, files)
- **Network-first** handles data object API calls with offline fallback

### Strategy matrix

| Resource | Strategy | Cache | Notes |
|----------|----------|-------|-------|
| App shell (HTML, CSS, JS) | `precache` (Workbox injectManifest) | `precache` | Built at `next build` time |
| Page API data (`/public/pages/*`) | `StaleWhileRevalidate` | `whoobe-pages` | ISR-compatible; serve cached, update in background |
| DAM assets (`/dam-asset/*`) | `CacheFirst` | `whoobe-assets` | Immutable content-hashed URLs; cache forever |
| Data Objects (`/public/objects/*`) | `NetworkFirst` | `whoobe-objects` | Fresh data preferred; serve cache when offline |
| Search (`/public/search`) | `NetworkOnly` | — | No offline search; show offline message |
| Form submissions (`POST /public/forms/*`) | `NetworkOnly` + queue | IndexedDB | Queue when offline, replay on reconnect |

### Service worker generation

The next-site generator (`@whoobe-cms/publish`) creates:

```
sites/my-site/
├── public/
│   ├── manifest.json
│   └── sw.js                        # Generated service worker
├── src/
│   └── lib/
│       └── sw-register.ts            # Registration + update handling
```

**Options for service worker generation:**

#### Option A: Workbox `generateSW` (recommended)

The generator uses Workbox's `generateSW` mode via a `workbox-config.js`:

```javascript
// Generated: sites/my-site/workbox-config.js
module.exports = {
  globDirectory: '.next',
  globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
  swDest: 'public/sw.js',
  runtimeCaching: [
    {
      urlPattern: /\/public\/pages\//,
      handler: 'StaleWhileRevalidate',
      cacheName: 'whoobe-pages',
    },
    {
      urlPattern: /\/dam-asset\//,
      handler: 'CacheFirst',
      cacheName: 'whoobe-assets',
    },
    {
      urlPattern: /\/public\/objects\//,
      handler: 'NetworkFirst',
      cacheName: 'whoobe-objects',
    },
  ],
}
```

The generator also creates an npm script in package.json:
```json
{
  "scripts": {
    "build:sw": "workbox generateSW workbox-config.js"
  }
}
```

The build pipeline in `next.config.js` runs Workbox as a post-build step:
```javascript
const withPWA = require('next-pwa')  // alternative: next-pwa plugin

module.exports = {
  // ... existing config
}
```

**Recommendation:** Use the `@serwist/next` package (modern fork of `next-pwa`, actively maintained, supports App Router):

```bash
npm install @serwist/next
```

```javascript
// next.config.js (generated)
import withSerwist from '@serwist/next'

const config = {
  // ... existing next config
}

export default withSerwist({
  ...config,
  swSrc: 'src/sw.ts',     // Service worker source
  swDest: 'public/sw.js', // Output
})
```

#### Option B: Manual Workbox injection

Generate `src/sw.ts` directly and use `injectManifest` mode for full control:

```typescript
// Generated: sites/my-site/src/sw.ts
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate, CacheFirst, NetworkFirst } from 'workbox-strategies'

precacheAndRoute(self.__WB_MANIFEST)

// CMS page data
registerRoute(
  ({ url }) => url.origin === API_ORIGIN && url.pathname.startsWith('/public/pages/'),
  new StaleWhileRevalidate({ cacheName: 'whoobe-pages' })
)

// DAM assets
registerRoute(
  ({ url }) => url.pathname.startsWith('/dam-asset/'),
  new CacheFirst({ cacheName: 'whoobe-assets' })
)

// Data Objects
registerRoute(
  ({ url }) => url.pathname.startsWith('/public/objects/'),
  new NetworkFirst({ cacheName: 'whoobe-objects' })
)
```

---

## 3. Page Types — Standard vs App Pages

The PWA must handle both page types seamlessly.

### Detection at render time

`getPageData()` in `@whoobe-cms/next` already returns `page.kind` (`'standard' | 'module' | 'app'`). The generated layout uses this to switch layouts.

### Layout switching

```tsx
// Generated: app/[...slug]/page.tsx (simplified)
export default async function Page({ params }) {
  const { page, descriptor, layout } = await getPageData(params.locale, params.slug)

  if (page.kind === 'app') {
    return (
      <AppShell>
        <WhoobePage descriptor={descriptor} />
      </AppShell>
    )
  }

  return (
    <TemplateShell layout={layout}>
      <WhoobePage descriptor={descriptor} />
    </TemplateShell>
  )
}
```

### `AppShell` component (bundled in the generated site)

```tsx
interface AppShellProps {
  children: ReactNode
  pwaConfig?: PwaConfig
}

function AppShell({ children, pwaConfig }: AppShellProps) {
  return (
    <div className="app-shell min-h-screen pb-16">
      {children}
      <BottomNav items={pwaConfig?.bottomNav ?? []} />
    </div>
  )
}
```

### Mobile-first layout in app mode

App pages use:
- `appHeader` / `appFooter` instead of `header` / `footer`
- Bottom navigation bar (fixed at bottom)
- No desktop aside sidebar
- Full-width content (no container max-width constraints)
- Safe area padding (`env(safe-area-inset-bottom)`)

The `composeLayout()` function in `@whoobe-cms/renderer` already supports `appHeader`/`appFooter`. The generated page component passes the correct layout variation based on `page.kind`.

### Page type routing

Standard pages and app pages share the same URL space (`/{locale}/[...slug]`). The differentiation is purely in the metadata:

| Metadata field | Standard page | App page |
|----------------|---------------|----------|
| `kind` | `'standard'` | `'app'` |
| Template slots | `header`/`footer` | `appHeader`/`appFooter` |
| `isMobileApp` | `false` | `true` |

The service worker handles both identically — caching strategy is URL-based, not page-type-based.

---

## 4. Install Prompt

### `beforeinstallprompt` handling

Generated component `src/components/InstallPrompt.tsx`:

```tsx
function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!show) return null

  return (
    <div className="install-prompt">
      <p>Install this app on your home screen</p>
      <button onClick={async () => {
        if (deferredPrompt) {
          (deferredPrompt as any).prompt()
          const result = await (deferredPrompt as any).userChoice
          setShow(false)
        }
      }}>Install</button>
      <button onClick={() => setShow(false)}>Not now</button>
    </div>
  )
}
```

### When to show the prompt

- Standard pages: Show after 3 page visits or 30s of engagement
- App pages: Show immediately after cold start (app pages are inherently mobile-first — the user expects an app experience)
- Dismissed prompt: Don't show again for 7 days (or until re-engagement via a settings button)

### Install prompt styles

- Standard pages: Subtle bottom banner (non-intrusive)
- App pages: Full-screen modal matching the app's theme colors

---

## 5. Offline Experience

### Offline fallback page

The service worker serves a cached fallback when the network is unavailable:

```
Generated: public/offline.html
```

This page:
- Shows a "You're offline" message with the app's theme styling
- Lists the last visited pages (from IndexedDB)
- Has a "Retry" button that checks connectivity and navigates to the last page

The layout (`app/layout.tsx`) includes the offline page in precache:
```typescript
// In the service worker
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('whoobe-offline').then((cache) => cache.add(OFFLINE_URL))
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    )
  }
})
```

### Cached page browsing (optional, Phase 2)

Store page metadata in IndexedDB at visit time:
```typescript
interface CachedPage {
  path: string
  title: string
  kind: 'standard' | 'app'
  visitedAt: number
}
```

The offline page reads this store and shows a "Recently viewed" list the user can navigate to (they'll see the cached SW response).

### Data Object offline queue

Already covered in pwa-mobile-plan.md (§3, Offline sync). The generated site includes the same IndexedDB queue:

```typescript
// Generated: src/lib/offline-queue.ts
import { openDB } from 'idb'

const db = await openDB('whoobe-offline-queue', 1, {
  upgrade(db) {
    db.createObjectStore('mutations', { keyPath: 'id', autoIncrement: true })
  },
})

export async function enqueueMutation(payload: unknown) {
  await db.add('mutations', { payload, createdAt: Date.now() })
}

export async function replayQueue(apiClient: ApiClient) {
  const all = await db.getAll('mutations')
  for (const item of all) {
    try {
      await apiClient.submitForm(item.payload)  // or updateObject, etc.
      await db.delete('mutations', item.id)
    } catch {
      break // Stop replay on first failure — next online event will retry
    }
  }
}

// Register online listener in layout.tsx
window.addEventListener('online', () => replayQueue(apiClient))
```

---

## 6. Push Notifications

### Integration with existing push architecture

The generated site reuses the push provider abstraction from pwa-mobile-plan.md (§4):

1. **In the generated `src/sw.ts`:**
   - Listen for push events
   - Extract notification payload
   - Show notification

```typescript
// In service worker
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  self.registration.showNotification(data.title, {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    data: data.data,
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const urlToOpen = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients.openWindow(urlToOpen)
  )
})
```

2. **In the generated app:**
   - Import push subscription logic from a generated `src/lib/push.ts`
   - Subscribe/unsubscribe based on user preference
   - Send subscription to endpoint: `POST /public/pwa/subscriptions`

3. **Push subscription management:**

The generated site has a "Notification Settings" page or modal that:
- Checks Notification permission status
- Provides toggle to enable/disable push
- Calls `self.registration.pushManager.subscribe()` with VAPID key from `pwa_config`
- Sends the subscription object to the CMS API

---

## 7. Generator Changes (`@whoobe-cms/publish`)

### New scaffold template files

```
packages/publish/src/templates/
├── public/
│   ├── manifest.json.hbs         # PWA manifest template
│   ├── offline.html.hbs          # Offline fallback page
│   └── sw.js.hbs                 # Service worker (or src/sw.ts.hbs)
├── src/
│   ├── components/
│   │   ├── InstallPrompt.tsx.hbs
│   │   └── AppShell.tsx.hbs      # For app page rendering
│   ├── lib/
│   │   ├── sw-register.ts.hbs
│   │   ├── push.ts.hbs
│   │   └── offline-queue.ts.hbs
│   └── sw.ts.hbs                 # Service worker source (for @serwist)
├── workbox-config.js.hbs         # Workbox config
└── package.json.hbs              # Updated with PWA deps
```

### Updated CLI flags

```bash
pnpm publish:next-site \
  --api-url https://cms.example.com \
  --website-id <uuid> \
  --out-dir ./sites/my-site \
  --revalidate 60 \
  --domain example.com \
  --pwa                          # Enable PWA features
  --pwa-display standalone       # Manifest display mode
  --pwa-orientation portrait     # Manifest orientation
  --pwa-background '#ffffff'     # Splash background
  --pwa-theme '#6366f1'          # Status bar color
```

Or, more practically: PWA config is read from `website.pwa_config` at generation time, so no CLI flags are needed — the generator just checks `pwaConfig.enabled` and generates the extra files when true.

### Generator logic

```typescript
// In scaffold.ts — when website.pwaConfig?.enabled is true
if (pwaConfig?.enabled) {
  // 1. Write manifest.json from pwaConfig
  await writeManifest(outDir, pwaConfig, website)

  // 2. Write service worker
  await writeServiceWorker(outDir, apiUrl, pwaConfig)

  // 3. Write SW registration script
  await writeSwRegister(outDir)

  // 4. Write install prompt component
  await writeInstallPrompt(outDir, pwaConfig)

  // 5. Write offline fallback
  await writeOfflinePage(outDir, pwaConfig)

  // 6. Write push subscription lib
  await writePushLib(outDir, apiUrl, pwaConfig)

  // 7. Update layout.tsx to include <link rel="manifest"> + SW registration
  await patchLayout(outDir, pwaConfig)

  // 8. Update next.config.js with @serwist/next
  await patchNextConfig(outDir)
}
```

---

## 8. App Page-Specific PWA Handling

### Bottom Navigation in PWA shell

When the PWA serves an app page, the generated `AppShell` component renders a bottom navigation bar. The items come from **two sources**:

| Source | Priority | When used |
|--------|----------|-----------|
| `pwa_config.bottomNav` | High | Global PWA navigation (all app pages) |
| Element tree's bottom-nav element | Low | Per-page navigation (editor-authored) |

If both are present, merge them: the PWA config items are always visible, the element tree items are contextual (shown only on that page).

### Splash screen

The generated PWA uses manifest properties (`background_color`, `theme_color`, `icons`) for the native splash screen (iOS/Android show this automatically on cold start). No custom splash component needed at the web app level.

### App page routing

App pages get a `start_url` that opens directly to the first app page, with a `scope` that covers all app pages:

```json
{
  "start_url": "/?source=pwa",
  "scope": "/"
}
```

### Safe area insets

The generated Tailwind CSS includes safe area utilities:

```css
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  .pb-safe {
    padding-bottom: env(safe-area-inset-bottom);
  }
  .pt-safe {
    padding-top: env(safe-area-inset-top);
  }
  .pl-safe {
    padding-left: env(safe-area-inset-left);
  }
  .pr-safe {
    padding-right: env(safe-area-inset-right);
  }
}
```

Bottom navigation and `AppShell` use `pb-safe` to avoid notch/gesture bar overlap on modern phones.

---

## 9. Deployment

### Deployment targets

| Target | PWA support | Notes |
|--------|-------------|-------|
| **Vercel** | Full | SW works with serverless functions; ISR + SW compatible |
| **Docker (Node server)** | Full | Standard Node.js + SW; works out of the box |
| **Static export** | Partial | `next export` + `workbox generateSW` for precache-only; dynamic routes need client-side routing |
| **Cloudflare Pages** | Partial | SW must be manually configured; no Node.js ISR |

### Build pipeline

```
1. pnpm build                          → next build
2. pnpm build:sw                       → workbox generateSW (or @serwist injectManifest)
3. Output: .next/ + public/sw.js + public/manifest.json

Deploy: .next/ as Node server or serverless functions
```

### Dockerfile (updated)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run build:sw

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next .next
COPY --from=builder /app/public public
COPY --from=builder /app/package.json .
EXPOSE 3000
CMD ["npm", "start"]
```

---

## 10. Edge Cases

| Case | Handling |
|------|----------|
| **PWA disabled** | Generator skips all PWA files; site works as normal SSR Next.js |
| **No app pages** | PWA still works; install prompt shows, SW caches standard pages. `AppShell` never renders |
| **Only app pages** | PWA treats every page as mobile-first; `start_url` points to first app page |
| **Mixed (standard + app)** | Layout router switches based on `page.kind`; same SW caches both |
| **PWA config changed after deploy** | User must re-generate and redeploy the Next.js site. ISR doesn't affect manifest/SW — they're build-time artifacts |
| **Custom domain** | `manifest.json` `scope` and `start_url` must use the custom domain. The generator reads `--domain` flag |
| **No HTTPS** | Service worker requires HTTPS (or localhost). Fail early: skip SW generation, warn the user |
| **Multiple languages** | All locales served under same scope. SW handles all locale paths |
| **DAM proxy down** | SW serves cached assets. Form submissions fail with offline queue |
| **Large assets (videos)** | Exclude from SW cache. Only cache images (< 5MB). Add `maxEntries: 100` to CacheFirst |
| **Service worker update** | Standard update flow: `skipWaiting()` + `clients.claim()`. Show "Update available" toast to user |

---

## 11. Implementation Order

| Phase | What | Depends on |
|-------|------|------------|
| **P1** | Read `pwa_config` from website, generate `manifest.json` in scaffold | `@whoobe-cms/publish` package exists |
| **P2** | Generate service worker with @serwist/next, SW registration script | P1 |
| **P3** | InstallPrompt component, beforeinstallprompt handling | P2 |
| **P4** | Offline fallback page + IndexedDB mutation queue | P2 |
| **P5** | AppShell component, layout switching by `page.kind`, bottom nav | P2, existing template layout code |
| **P6** | Push notification subscription in generated site + SW push handler | P5, existing push architecture |
| **P7** | `--pwa` CLI flag + manifest override CLI flags | P1 |
| **P8** | Safe area CSS, splash screen polish, update prompt UI | P3, P5 |

---

## 12. Files to Create/Modify

### New files

| File | Purpose |
|------|---------|
| `packages/publish/src/templates/public/manifest.json.hbs` | PWA manifest template |
| `packages/publish/src/templates/public/offline.html.hbs` | Offline fallback page |
| `packages/publish/src/templates/src/sw.ts.hbs` | Service worker source |
| `packages/publish/src/templates/src/lib/sw-register.ts.hbs` | SW registration + update handling |
| `packages/publish/src/templates/src/components/InstallPrompt.tsx.hbs` | Install banner component |
| `packages/publish/src/templates/src/components/AppShell.tsx.hbs` | App page shell with bottom nav |
| `packages/publish/src/templates/src/lib/push.ts.hbs` | Push subscription client |
| `packages/publish/src/templates/src/lib/offline-queue.ts.hbs` | IndexedDB offline mutation queue |
| `packages/publish/src/templates/workbox-config.js.hbs` | Workbox generateSW config |

### Modified files

| File | Change |
|------|--------|
| `packages/publish/src/scaffold.ts` | Add PWA generation pipeline (manifest, SW, components) when `pwaConfig.enabled` |
| `packages/publish/src/api.ts` | Fetch `pwaConfig` from website + theme for manifest icons |
| `packages/publish/src/templates/app/layout.tsx.hbs` | Add `<link rel="manifest">`, SW registration script, InstallPrompt |
| `packages/publish/src/templates/next.config.js.hbs` | Add `@serwist/next` wrapper when PWA enabled |
| `packages/publish/src/templates/package.json.hbs` | Add `@serwist/next`, `workbox-*` or `idb` deps when PWA enabled |
| `packages/publish/src/templates/app/\[locale\]/\[...slug\]/page.tsx.hbs` | Add layout switching by `page.kind` |
| `packages/core/src/db/website-templates-schema.ts` | Ensure `pwa_config` is typed (already planned in pwa-mobile-plan.md) |
| `apps/whoobe-one-spike/src/pages-api.ts` | Expose `pwa_config` in public API response |

---

## 13. Testing

| Test | Method |
|------|--------|
| Manifest loads | `curl /manifest.json` returns valid JSON; Chrome DevTools → Application → Manifest |
| SW registers | DevTools → Application → Service Workers → registered + active |
| Offline page rendering | DevTools → Network → Offline → navigate → see offline page |
| Page cache | Visit a page, go offline, reload → page still renders from cache |
| Asset cache | Visit a page with images, go offline → images still load |
| Install prompt | Trigger `beforeinstallprompt` manually via DevTools → Application → Manifest → "Add to Home Screen" |
| App shell for app pages | Navigate to app page → verify bottom nav, appHeader, full-width layout |
| Safe area | Use iOS Simulator or Android emulator → verify bottom nav respects safe area |
| Push notification | Send test push via CMS → notification appears on registered device |
| Offline queue | Submit form while offline → go online → form submits automatically |
| SW update | Deploy new SW → "Update available" toast appears → user can activate update |