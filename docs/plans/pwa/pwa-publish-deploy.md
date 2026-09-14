# PWA Publish/Deploy Plan — All Pages (Standard + App Pages)

## Goal

Generate a **standalone Nuxt site** from a Whoobe CMS website that is a fully installable Progressive Web App: manifest, service worker, offline fallback, and install prompt. The PWA must work for **all page types** — standard pages (desktop layout, header/footer) and app pages (mobile layout, appHeader/appFooter, bottom navigation).

**Framework choice: Nuxt (Vue)** — the codebase already has `@whoobe-cms/vue` with ready components (`WhoobeProvider`, `WhoobeNode`, etc.). Next.js is a documented alternative (see §14) but Nuxt is the default deploy target because the Vue SDK is feature-complete and maintained.

This is **not** the "App Mode" editor feature (pwa-mobile-plan.md) — that's about building mobile-first content. This is about the **deployment artifact** — the generated Nuxt site — becoming a PWA itself.

---

## 1. PWA Manifest

The generated Nuxt site needs a `manifest.json` that makes the browser offer the "Add to Home Screen" prompt.

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
  → nuxt.config.ts includes app.head.link for <link rel="manifest">
```

Nuxt already merges `public/` files into the root. The manifest at `public/manifest.json` is served at `/manifest.json` with no extra config. The generator sets `app.head.link` in `nuxt.config.ts` to register it:

```typescript
// Generated: nuxt.config.ts
export default defineNuxtConfig({
  app: {
    head: {
      link: [
        { rel: 'manifest', href: '/manifest.json' }
      ]
    }
  }
})
```

### Start URL & scope

| Page type | start_url | scope |
|-----------|-----------|-------|
| Standard pages | `/` (website root) | `/` (entire site) |
| App-only PWA | `/app` (app landing) | `/app/*` |

For a mixed site (standard + app pages), `start_url = '/'` and `scope = '/'`. The service worker handles both layouts transparently.

---

## 2. Service Worker

The generated Nuxt site must register a service worker that:

- **Precaches** the app shell (layout, critical CSS, manifest)
- **Stale-while-revalidates** page data from the CMS public API
- **Cache-first** serves DAM assets (images, files)
- **Network-first** handles data object API calls with offline fallback

### Strategy matrix

| Resource | Strategy | Cache | Notes |
|----------|----------|-------|-------|
| App shell (HTML, CSS, JS) | `precache` (Workbox injectManifest) | `precache` | Built at `nuxt generate/build` time |
| Page API data (`/public/pages/*`) | `StaleWhileRevalidate` | `whoobe-pages` | Serve cached, update in background |
| DAM assets (`/dam-asset/*`) | `CacheFirst` | `whoobe-assets` | Immutable content-hashed URLs; cache forever |
| Data Objects (`/public/objects/*`) | `NetworkFirst` | `whoobe-objects` | Fresh data preferred; serve cache when offline |
| Search (`/public/search`) | `NetworkOnly` | — | No offline search; show offline message |
| Form submissions (`POST /public/forms/*`) | `NetworkOnly` + queue | IndexedDB | Queue when offline, replay on reconnect |

### Service worker generation

Use **`@vite-pwa/nuxt`** — the standard Nuxt PWA module (powered by Vite PWA / Workbox under the hood). It supports both `generateSW` and `injectManifest` modes, handles dev-server SW injection, and requires minimal config.

```
npm install @vite-pwa/nuxt
```

```typescript
// Generated: nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@vite-pwa/nuxt'],
  pwa: {
    registerType: 'autoUpdate',
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      runtimeCaching: [
        {
          urlPattern: /\/public\/pages\//,
          handler: 'StaleWhileRevalidate',
          options: { cacheName: 'whoobe-pages' },
        },
        {
          urlPattern: /\/dam-asset\//,
          handler: 'CacheFirst',
          options: { cacheName: 'whoobe-assets' },
        },
        {
          urlPattern: /\/public\/objects\//,
          handler: 'NetworkFirst',
          options: { cacheName: 'whoobe-objects' },
        },
      ],
    },
    manifest: false,  // We write manifest.json ourselves from pwa_config
  },
})
```

`@vite-pwa/nuxt` handles:
- SW registration via `registerType: 'autoUpdate'` (registers on first load, updates silently)
- Precaching of all build assets
- Runtime caching for API routes
- Dev-mode SW injection (no manual registration in dev)

### Manual Workbox injection (alternative)

For full control, `injectManifest` mode reads a source `sw.ts`:

```typescript
// Generated: sw.ts
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate, CacheFirst, NetworkFirst } from 'workbox-strategies'

precacheAndRoute(self.__WB_MANIFEST)

registerRoute(
  ({ url }) => url.origin === API_ORIGIN && url.pathname.startsWith('/public/pages/'),
  new StaleWhileRevalidate({ cacheName: 'whoobe-pages' })
)

registerRoute(
  ({ url }) => url.pathname.startsWith('/dam-asset/'),
  new CacheFirst({ cacheName: 'whoobe-assets' })
)

registerRoute(
  ({ url }) => url.pathname.startsWith('/public/objects/'),
  new NetworkFirst({ cacheName: 'whoobe-objects' })
)
```

---

## 3. Page Types — Standard vs App Pages

### Reusable SDK components

The generated site imports ready-made components from `@whoobe-cms/vue`:

| Component | Package | Purpose |
|-----------|---------|---------|
| `WhoobeProvider` | `@whoobe-cms/vue` | Provides registry + api + options via provide/inject |
| `WhoobeNode` | `@whoobe-cms/vue` | Maps `RenderDescriptor.kind` → registered component → renders recursively |
| `WhoobePage` | `@whoobe-cms/vue` | Fetches page + walks + renders with layout shell |

These already exist and are actively used in `whoobe-one-spike`. The generated site reuses them unchanged.

### Detection at render time

`getPageData()` in `@whoobe-cms/nuxt` returns `page.kind` (`'standard' | 'module' | 'app'`). The generated layout uses this to switch layouts.

### Layout switching

```vue
<!-- Generated: pages/[...slug].vue -->
<template>
  <AppShell v-if="page.kind === 'app'" :pwa-config="pwaConfig">
    <WhoobePage :descriptor="descriptor" />
  </AppShell>
  <TemplateShell v-else :layout="layout">
    <WhoobePage :descriptor="descriptor" />
  </TemplateShell>
</template>

<script setup lang="ts">
const { page, descriptor, layout } = await getPageData(route.params)
</script>
```

### `AppShell` component (bundled in the generated site)

```vue
<!-- Generated: components/AppShell.vue -->
<template>
  <div class="app-shell min-h-screen pb-safe">
    <slot />
    <BottomNav v-if="items.length" :items="items" />
  </div>
</template>

<script setup lang="ts">
defineProps<{ pwaConfig?: PwaConfig }>()
</script>
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

Standard pages and app pages share the same URL space (`/:locale/[...slug]`). The differentiation is purely in the metadata:

| Metadata field | Standard page | App page |
|----------------|---------------|----------|
| `kind` | `'standard'` | `'app'` |
| Template slots | `header`/`footer` | `appHeader`/`appFooter` |
| `isMobileApp` | `false` | `true` |

The service worker handles both identically — caching strategy is URL-based, not page-type-based.

---

## 4. Install Prompt

### `beforeinstallprompt` handling

Composable `composables/useInstallPrompt.ts`:

```typescript
export function useInstallPrompt() {
  const deferredPrompt = ref<Event | null>(null)
  const show = ref(false)

  function onBeforeInstallPrompt(e: Event) {
    e.preventDefault()
    deferredPrompt.value = e
    show.value = true
  }

  onMounted(() => window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt))
  onUnmounted(() => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt))

  async function install() {
    if (!deferredPrompt.value) return
    ;(deferredPrompt.value as any).prompt()
    await (deferredPrompt.value as any).userChoice
    deferredPrompt.value = null
    show.value = false
  }

  function dismiss() { show.value = false }

  return { show, install, dismiss }
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

The service worker serves a cached fallback when the network is unavailable. The generated `error.vue` in Nuxt handles this:

```vue
<!-- Generated: error.vue -->
<template>
  <div class="offline-page">
    <h1>You're offline</h1>
    <p>Check your connection and try again.</p>
    <ul v-if="recentPages.length">
      <li v-for="p in recentPages" :key="p.path">
        <NuxtLink :to="p.path">{{ p.title }}</NuxtLink>
      </li>
    </ul>
    <button @click="retry">Retry</button>
  </div>
</template>
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
// Generated: composables/useOfflineQueue.ts
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
      await apiClient.submitForm(item.payload)
      await db.delete('mutations', item.id)
    } catch {
      break
    }
  }
}

// Register online listener in app.vue or layout
if (process.client) {
  window.addEventListener('online', () => replayQueue(apiClient))
}
```

---

## 6. Push Notifications

### Integration with existing push architecture

The generated site reuses the push provider abstraction from pwa-mobile-plan.md (§4).

1. **In the service worker** (generated by `@vite-pwa/nuxt` or manual sw.ts):
   - Listen for push events
   - Extract notification payload
   - Show notification

```typescript
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
  event.waitUntil(clients.openWindow(urlToOpen))
})
```

2. **In the generated app** — composable `composables/usePushNotifications.ts`:
   - Subscribe/unsubscribe based on user preference
   - Send subscription to endpoint: `POST /public/pwa/subscriptions`

3. **Push subscription management:**
   - Checks Notification permission status
   - Provides toggle to enable/disable push
   - Calls `self.registration.pushManager.subscribe()` with VAPID key from `pwa_config`
   - Sends the subscription object to the CMS API

---

## 7. Generator Package (`@whoobe-cms/publish`)

### Project structure

```
packages/publish/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts             # Public API (generate function)
│   ├── cli.ts               # CLI entry point (bin)
│   ├── scaffold.ts          # Generates the Nuxt project structure
│   ├── class-extractor.ts   # Recursively collects all CSS classes from element trees
│   ├── theme-css.ts         # Generates CSS variables from website theme
│   ├── api.ts               # Fetches pages, theme, pwa_config from public API
│   └── templates/
│       ├── nuxt.config.ts.hbs
│       ├── app.vue.hbs
│       ├── pages/
│       │   └── [...slug].vue.hbs
│       ├── components/
│       │   ├── AppShell.vue.hbs
│       │   ├── BottomNav.vue.hbs
│       │   └── InstallPrompt.vue.hbs
│       ├── composables/
│       │   ├── useInstallPrompt.ts.hbs
│       │   ├── useOfflineQueue.ts.hbs
│       │   └── usePushNotifications.ts.hbs
│       ├── layouts/
│       │   └── default.vue.hbs
│       ├── public/
│       │   ├── manifest.json.hbs
│       │   └── sw.ts.hbs          # For injectManifest mode
│       ├── error.vue.hbs
│       ├── package.json.hbs
│       └── tsconfig.json.hbs
└── bin/
    └── publish-site.js          # CLI entry: tsx src/cli.ts
```

### CLI usage

```bash
pnpm publish:site \
  --api-url https://cms.example.com \
  --website-id <uuid> \
  --out-dir ./sites/my-site \
  --domain example.com
```

PWA config is read from `website.pwa_config` at generation time — no extra CLI flags needed. The generator checks `pwaConfig.enabled` and generates the extra files when true.

### Generator logic

```typescript
// In scaffold.ts
if (pwaConfig?.enabled) {
  await writeManifest(outDir, pwaConfig, website)      // public/manifest.json
  await patchNuxtConfig(outDir, pwaConfig)               // nuxt.config.ts → @vite-pwa/nuxt + manifest link
  await writeInstallPrompt(outDir)                        // components/InstallPrompt.vue
  await writePushComposable(outDir, pwaConfig)            // composables/usePushNotifications.ts
  await patchAppVue(outDir, pwaConfig)                    // app.vue → SW registration + InstallPrompt
}
```

### Output structure

```
sites/my-site/
├── nuxt.config.ts             # With @vite-pwa/nuxt module + runtime caching config
├── package.json               # nuxt, @whoobe-cms/vue, @vite-pwa/nuxt, etc.
├── tsconfig.json
├── app.vue                    # Root: <WhoobeProvider> + <NuxtPage> + InstallPrompt
├── error.vue                  # Offline/error page
├── pages/
│   └── [...slug].vue          # Catch-all: resolves locale + slug → renders page
├── layouts/
│   └── default.vue            # Theme CSS, Google Fonts, <link rel="manifest">
├── components/
│   ├── AppShell.vue           # App page shell (bottom nav + safe area)
│   ├── BottomNav.vue          # Fixed bottom navigation bar
│   └── InstallPrompt.vue      # "Add to Home Screen" banner/modal
├── composables/
│   ├── useInstallPrompt.ts
│   ├── useOfflineQueue.ts
│   └── usePushNotifications.ts
├── public/
│   ├── manifest.json          # PWA manifest from pwa_config
│   └── favicon.ico
├── lib/
│   ├── api.ts                 # ApiClient singleton
│   └── registry.ts            # Component registry with defaults
└── assets/
    └── css/
        └── theme.css          # @theme CSS variables + theme.styles
```

---

## 8. App Page-Specific PWA Handling

### Bottom Navigation in PWA shell

When the PWA serves an app page, the `AppShell` component renders a bottom navigation bar. The items come from **two sources**:

| Source | Priority | When used |
|--------|----------|-----------|
| `pwa_config.bottomNav` | High | Global PWA navigation (all app pages) |
| Element tree's bottom-nav element | Low | Per-page navigation (editor-authored) |

If both are present, merge them: the PWA config items are always visible, the element tree items are contextual (shown only on that page).

### Splash screen

The generated PWA uses manifest properties (`background_color`, `theme_color`, `icons`) for the native splash screen. iOS/Android show this automatically on cold start — no custom splash component needed at the web app level.

### App page routing

App pages get a `start_url` that opens directly to the first app page:

```json
{
  "start_url": "/?source=pwa",
  "scope": "/"
}
```

### Safe area insets

The generated CSS includes safe area utilities:

```css
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
  .pt-safe { padding-top: env(safe-area-inset-top); }
  .pl-safe { padding-left: env(safe-area-inset-left); }
  .pr-safe { padding-right: env(safe-area-inset-right); }
}
```

Bottom navigation and `AppShell` use `pb-safe` to avoid notch/gesture bar overlap on modern phones.

---

## 9. Deployment

### Deployment targets

| Target | PWA support | Notes |
|--------|-------------|-------|
| **Node server** (`nuxt build`) | Full | `@vite-pwa/nuxt` SW works out of the box |
| **Static export** (`nuxt generate`) | Full | Pre-rendered HTML + SW + precache; dynamic routes via client-side fallback |
| **Vercel** | Full | Nuxt Nitro serverless + SW compatible |
| **Cloudflare Pages** | Full | Nuxt Nitro + `@vite-pwa/nuxt` work with CF Workers |
| **Docker** | Full | Containerized Node server with SW |

### Build pipeline

```
1. pnpm install
2. pnpm generate           → nuxt generate (static) or pnpm build (server)
3. @vite-pwa/nuxt handles SW injection automatically during build
4. Output: .output/public/ + public/sw.js + public/manifest.json

Deploy: .output/ as Node server, static files, or serverless functions
```

### Dockerfile (Nuxt)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.output .output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

---

## 10. Edge Cases

| Case | Handling |
|------|----------|
| **PWA disabled** | Generator skips all PWA files; site works as normal Nuxt SSR |
| **No app pages** | PWA still works; install prompt shows, SW caches standard pages. `AppShell` never renders |
| **Only app pages** | PWA treats every page as mobile-first; `start_url` points to first app page |
| **Mixed (standard + app)** | Layout router switches based on `page.kind`; same SW caches both |
| **PWA config changed after deploy** | User must re-generate and redeploy. Manifest/SW are build-time artifacts |
| **Custom domain** | `manifest.json` `scope` and `start_url` use the custom domain |
| **No HTTPS** | Service worker requires HTTPS (or localhost). Fail early: skip SW generation, warn |
| **Multiple languages** | All locales served under same scope. SW handles all locale paths |
| **DAM proxy down** | SW serves cached assets. Form submissions fail with offline queue |
| **Large assets (videos)** | Exclude from SW cache. Only cache images (< 5MB). Add `maxEntries: 100` to CacheFirst |
| **Service worker update** | `@vite-pwa/nuxt` with `registerType: 'autoUpdate'` handles this silently; alternative: show "Update available" toast |

---

## 11. Implementation Order

| Phase | What | Depends on |
|-------|------|------------|
| **P1** | Read `pwa_config` from website, generate `manifest.json` in scaffold | `@whoobe-cms/publish` package exists |
| **P2** | Generate `nuxt.config.ts` with `@vite-pwa/nuxt` module and runtime caching | P1 |
| **P3** | InstallPrompt component + `useInstallPrompt` composable | P2 |
| **P4** | Offline fallback (`error.vue`) + `useOfflineQueue` composable | P2 |
| **P5** | `AppShell` + `BottomNav` components, layout switching by `page.kind` | P2, existing `@whoobe-cms/vue` SDK |
| **P6** | Push notification composable + SW push handler | P5, existing push architecture |
| **P7** | Safe area CSS, splash screen polish, update prompt UI | P3, P5 |
| **P8** | `@whoobe-cms/nuxt` helper package (getPageData, metadata, static params) | P5 |

---

## 12. Files to Create/Modify

### New packages

| Package | Purpose |
|---------|---------|
| `packages/publish/` | Nuxt site generator with PWA support |
| `packages/sdk/nuxt/` | Nuxt-specific helpers: `getPageData()`, `generateMetadata()`, `staticParams()` |

### Template files

| File | Purpose |
|------|---------|
| `packages/publish/src/templates/nuxt.config.ts.hbs` | Nuxt config with `@vite-pwa/nuxt` + Tailwind + manifest link |
| `packages/publish/src/templates/app.vue.hbs` | Root component: `<WhoobeProvider>` + `<NuxtPage>` + InstallPrompt |
| `packages/publish/src/templates/error.vue.hbs` | Offline/error page |
| `packages/publish/src/templates/pages/[...slug].vue.hbs` | Catch-all page with layout switching |
| `packages/publish/src/templates/layouts/default.vue.hbs` | Theme CSS + Google Fonts + `<link rel="manifest">` |
| `packages/publish/src/templates/components/AppShell.vue.hbs` | App page shell with bottom nav |
| `packages/publish/src/templates/components/BottomNav.vue.hbs` | Bottom navigation bar |
| `packages/publish/src/templates/components/InstallPrompt.vue.hbs` | Install banner/prompt |
| `packages/publish/src/templates/composables/useInstallPrompt.ts.hbs` | beforeinstallprompt logic |
| `packages/publish/src/templates/composables/useOfflineQueue.ts.hbs` | IndexedDB offline mutation queue |
| `packages/publish/src/templates/composables/usePushNotifications.ts.hbs` | Push subscription client |
| `packages/publish/src/templates/public/manifest.json.hbs` | PWA manifest |
| `packages/publish/src/templates/public/sw.ts.hbs` | InjectManifest service worker source |

### Modified files

| File | Change |
|------|--------|
| `apps/core-api/src/server.ts` | Add `GET /public/pwa/config/:websiteId` endpoint returning `pwa_config` |
| `apps/whoobe-one-spike/src/pages-api.ts` | Expose `pwa_config` in public API response |
| `packages/sdk/vue/src/` | Verify `WhoobePage` and `WhoobeNode` work in a Nuxt SSR context |

---

## 13. Testing

| Test | Method |
|------|--------|
| Manifest loads | `curl /manifest.json` returns valid JSON; DevTools → Application → Manifest |
| SW registers | DevTools → Application → Service Workers → registered + active |
| Offline page rendering | DevTools → Network → Offline → navigate → see error.vue |
| Page cache | Visit page, go offline, reload → page renders from cache |
| Asset cache | Visit page with images, go offline → images still load |
| Install prompt | Trigger `beforeinstallprompt` via DevTools → Application → Manifest → "Add to Home Screen" |
| App shell for app pages | Navigate to app page → verify bottom nav, appHeader, full-width layout |
| Safe area | iOS Simulator or Android emulator → verify bottom nav respects safe area |
| Push notification | Send test push via CMS → notification appears on registered device |
| Offline queue | Submit form while offline → go online → form submits automatically |
| SW update | Deploy new SW → verify `autoUpdate` activates new version |

---

## 14. Alternative: Next.js Deploy Target

While Nuxt is the default, the same architecture works for Next.js. The differences:

| Aspect | Nuxt (default) | Next.js (alternative) |
|--------|---------------|----------------------|
| PWA module | `@vite-pwa/nuxt` | `@serwist/next` |
| Renderer SDK | `@whoobe-cms/vue` | `@whoobe-cms/react` |
| Layout components | Vue SFCs | React TSX |
| Routing | `pages/[...slug].vue` | `app/\[locale\]/\[...slug\]/page.tsx` |
| Build output | `.output/` | `.next/` |
| CLI flag | `--framework nuxt` (default) | `--framework next` |

The scaffold can support both via a `--framework` flag, swapping template directories:

```
packages/publish/src/templates/
├── nuxt/              # Default — Vue templates
│   ├── nuxt.config.ts.hbs
│   ├── pages/[...slug].vue.hbs
│   └── ...
└── next/              # Alternative — React templates
    ├── next.config.js.hbs
    ├── app/[...slug]/page.tsx.hbs
    └── ...
```