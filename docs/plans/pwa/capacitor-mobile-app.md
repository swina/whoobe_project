# Mobile App via Capacitor — Plan

## Goal

Replace the Nuxt/PWA publish/deploy pipeline with a simpler, more reliable approach: **build the existing `PublicPage.vue` renderer as a standalone Vite app and wrap it with Capacitor** to produce native iOS and Android apps. No service worker complexity, no SSR rendering bugs, no Alpine.js compatibility issues — the same renderer that works perfectly in the browser works identically in the native app.

## Why Capacitor Instead of PWA

| Concern | PWA (current approach) | Capacitor (proposed) |
|---------|----------------------|---------------------|
| **Renderer** | Generated Nuxt SSR — different code path from the editor, bugs with images, Alpine, etc. | Same `PublicPage.vue` that works perfectly in the browser — identical rendering |
| **Offline** | Complex Workbox/Service Worker setup | Native caching via Capacitor plugin or simple HTTP cache |
| **Push notifications** | VAPID/OneSignal/Firebase in SW | Native push via Capacitor Push Notifications plugin |
| **Installation** | Browser prompt (low conversion) | App Store / Play Store distribution |
| **Device APIs** | Limited (no file system, Bluetooth, etc.) | Full native API access via Capacitor plugins |
| **Updates** | Complex SW lifecycle | Standard app store update flow |
| **Rendering bugs** | Many (images, Alpine, content) | None — same code as the editor preview |

## Architecture

```
┌─────────────────────────────────────┐
│         Capacitor Mobile App        │
│  ┌───────────────────────────────┐  │
│  │   WebView (WkWebView /       │  │
│  │   Android WebView)           │  │
│  │  ┌─────────────────────────┐ │  │
│  │  │  Vite + Vue 3 SPA       │ │  │
│  │  │  ┌───────────────────┐  │ │  │
│  │  │  │ PublicPage.vue    │  │ │  │
│  │  │  │ (same as          │  │ │  │
│  │  │  │  whoobe-one-spike)│  │ │  │
│  │  │  └───────────────────┘  │ │  │
│  │  │  ┌───────────────────┐  │ │  │
│  │  │  │ BlockContainer    │  │ │  │
│  │  │  │ Preview.vue       │  │ │  │
│  │  │  └───────────────────┘  │ │  │
│  │  │  ┌───────────────────┐  │ │  │
│  │  │  │ BlockElement      │  │ │  │
│  │  │  │ Preview.vue       │  │ │  │
│  │  │  └───────────────────┘  │ │  │
│  │  │  ┌───────────────────┐  │ │  │
│  │  │  │ Alpine.js         │  │ │  │
│  │  │  │ @tailwindcss/     │  │ │  │
│  │  │  │ browser           │  │ │  │
│  │  │  └───────────────────┘  │ │  │
│  │  └─────────────────────────┘ │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │  Capacitor Plugins            │  │
│  │  - Push Notifications         │  │
│  │  - Splash Screen              │  │
│  │  - Status Bar                 │  │
│  │  - Network (offline detect)   │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘

         ↕ HTTPS API calls

┌─────────────────────────────────────┐
│     Whoobe CMS (core-api)           │
│  - Public page lookup               │
│  - DAM asset serving                │
│  - Data object queries              │
│  - Form submissions                 │
│  - Push notification subscription   │
└─────────────────────────────────────┘
```

## Package: `@whoobe-cms/mobile-app`

A new package that scaffolds and builds a Capacitor mobile app for a given website.

### Project structure

```
packages/mobile-app/
├── package.json
├── template/                        # Handlebars templates for the generated app
│   ├── package.json.hbs
│   ├── vite.config.ts.hbs
│   ├── tsconfig.json.hbs
│   ├── index.html.hbs
│   ├── src/
│   │   ├── main.ts.hbs              # Bootstrap: Vue app + Alpine + Tailwind
│   │   ├── App.vue.hbs              # Root: <WhoobeProvider> + <router-view>
│   │   ├── router/
│   │   │   └── index.ts.hbs         # Hash-based history, catch-all → PublicPage
│   │   ├── views/
│   │   │   └── PublicPage.vue.hbs   # Exact copy of whoobe-one-spike's PublicPage.vue
│   │   ├── composables/
│   │   │   └── useApi.ts.hbs        # API URL from runtime config
│   │   └── assets/
│   │       └── main.css.hbs         # Tailwind import + theme CSS
│   ├── capacitor/
│   │   ├── capacitor.config.ts.hbs  # Capacitor config (app name, server URL)
│   │   └── resources/               # App icons, splash screen (generated)
│   └── public/
│       └── favicon.ico
├── src/
│   ├── index.ts                     # Public API: generateMobileApp()
│   └── cli.ts                       # CLI entry point
└── bin/
    └── whoobe-mobile.js             # CLI: whoobe-mobile generate
```

### Key differences from whoobe-one-spike

| Feature | whoobe-one-spike | Mobile app |
|---------|-----------------|------------|
| **Entry** | Full editor app | Minimal — only PublicPage |
| **Router** | `createWebHistory` | `createWebHashHistory` (required for file:// protocol) |
| **API URL** | `window.location.hostname` + port 3003 | Static config from env var / Capacitor config |
| **Alpine.js** | Imported + started in main.ts | Same — works unchanged |
| **Tailwind** | `@tailwindcss/browser` runtime script | Same — works unchanged |
| **GSAP** | Full animation library | Keep — used by page animations |
| **Dragula** | Drag-and-drop in editor | Remove — not needed for public pages |
| **Tiptap** | Rich text editor | Remove — not needed for public pages |
| **Editor components** | Full editor UI | Remove |
| **Capacitor** | Not present | `@capacitor/core`, platform packages, config |
| **Theme CSS** | Fetched at runtime from API | Same — no change needed |

### Generated app output

```
sites/my-mobile-app/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── capacitor.config.ts
├── src/
│   ├── main.ts
│   ├── App.vue
│   ├── router/index.ts
│   ├── views/PublicPage.vue
│   ├── composables/useApi.ts
│   └── assets/main.css
├── public/
│   ├── favicon.ico
│   └── resources/               # Generated icons/splash
├── android/                      # After `npx cap add android`
├── ios/                          # After `npx cap add ios`
└── .env
```

## Capacitor Configuration

### `capacitor.config.ts` (generated)

```typescript
import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.whoobe.mobile.{website-slug}',
  appName: '{website-name}',
  webDir: 'dist',
  server: {
    // Allow cleartext for local dev; production enforces HTTPS
    cleartext: process.env.NODE_ENV === 'development',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '{pwaConfig.backgroundColor || "#ffffff"}',
      androidSplashResourceName: 'splash',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '{pwaConfig.themeColor || "#6366f1"}',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
```

### Platform setup

After generation, the user runs:

```bash
cd sites/my-mobile-app
npm install
npm run build          # Builds the Vite SPA to dist/
npx cap add android    # Adds Android platform
npx cap add ios        # Adds iOS platform (macOS only)
npx cap sync           # Syncs web build to native platforms
npx cap open android   # Opens Android Studio
npx cap open ios       # Opens Xcode
```

## Router: Hash History

The mobile app uses `createWebHashHistory()` instead of `createWebHistory()`:

```typescript
import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/:pathMatch(.*)*', name: 'PublicPage', component: PublicPage },
  ],
})
```

Hash history is required because:
- Capacitor loads the app from `http://localhost` (dev) or `file://` (production)
- HTML5 history mode requires a server to handle fallback routing
- Hash mode works everywhere with no server configuration

## API URL Resolution

The generated app resolves the API URL from three sources (in priority order):

1. `import.meta.env.VITE_CORE_API_URL` — set at build time
2. Capacitor config `server.url` — for development with live reload
3. Compiled-in default — the CMS URL provided at generation time

```typescript
// src/composables/useApi.ts
export function getApiUrl(): string {
  // 1. Env var (explicit build-time config)
  if (import.meta.env.VITE_CORE_API_URL) return import.meta.env.VITE_CORE_API_URL
  // 2. Fallback to the compiled-in default from generation
  return '__CMS_API_URL__'
}
```

The `__CMS_API_URL__` placeholder is replaced at generation time with the actual CMS URL.

## Offline Support

Instead of complex Workbox service workers, use:

1. **HTTP cache headers** — the CMS API sets `Cache-Control` headers; the WebView respects them
2. **Simple fetch-with-cache** — a thin cache layer for page data (optional):

```typescript
// Simple in-memory cache for page data
const pageCache = new Map<string, { data: any; expiry: number }>()

export async function fetchWithCache(url: string, ttl = 60000) {
  const cached = pageCache.get(url)
  if (cached && cached.expiry > Date.now()) return cached.data
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  pageCache.set(url, { data, expiry: Date.now() + ttl })
  return data
}
```

3. **Capacitor Network plugin** — detect offline state and show a banner

## Push Notifications

Use Capacitor's native Push Notifications plugin instead of Web Push API:

```typescript
import { PushNotifications } from '@capacitor/push-notifications'

async function registerPush() {
  const perm = await PushNotifications.requestPermissions()
  if (perm.receive !== 'granted') return

  await PushNotifications.register()
  PushNotifications.addListener('registration', (token) => {
    // Send token to CMS API
    await fetch(`${apiUrl}/public/pwa/subscribe`, {
      method: 'POST',
      body: JSON.stringify({ websiteId, provider: 'capacitor', subscription: { endpoint: token.value } }),
    })
  })

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    // Notification already shown by OS
  })
}
```

## Deep Linking

Capacitor supports deep linking so external links (e.g., from push notifications or email) open the correct page inside the app:

```typescript
// capacitor.config.ts
plugins: {
  Deeplinks: {
    // Match CMS page URLs to in-app routes
  },
}
```

## Build & Deployment Pipeline

```
1. whoobe-mobile generate \
     --api-url https://cms.example.com \
     --website-id <uuid> \
     --out-dir ./sites/my-mobile-app

2. cd ./sites/my-mobile-app
3. npm install
4. npm run build                  # Vite builds to dist/
5. npx cap sync                   # Sync to native platforms
6. npx cap open android           # Build & run in Android Studio
   npx cap open ios               # Build & run in Xcode
```

## Files to Create

| File | Purpose |
|------|---------|
| `packages/mobile-app/package.json` | Package definition |
| `packages/mobile-app/src/index.ts` | `generateMobileApp()` function |
| `packages/mobile-app/src/cli.ts` | CLI with commander |
| `packages/mobile-app/bin/whoobe-mobile.js` | CLI entry point |
| `packages/mobile-app/template/package.json.hbs` | Generated app deps |
| `packages/mobile-app/template/vite.config.ts.hbs` | Vite config |
| `packages/mobile-app/template/index.html.hbs` | HTML shell |
| `packages/mobile-app/template/src/main.ts.hbs` | App bootstrap (Alpine + Vue + Tailwind) |
| `packages/mobile-app/template/src/App.vue.hbs` | Root component |
| `packages/mobile-app/template/src/router/index.ts.hbs` | Hash router |
| `packages/mobile-app/template/src/views/PublicPage.vue.hbs` | Page renderer (same as whoobe-one-spike) |
| `packages/mobile-app/template/src/composables/useApi.ts.hbs` | API URL resolver |
| `packages/mobile-app/template/src/assets/main.css.hbs` | Tailwind + theme CSS |
| `packages/mobile-app/template/capacitor.config.ts.hbs` | Capacitor config |

## Implementation Order

| Phase | What | Notes |
|-------|------|-------|
| **P1** | Create `packages/mobile-app/` with scaffolding + CLI | Same pattern as `packages/publish/` |
| **P2** | Template files: `main.ts`, `App.vue`, router, `PublicPage.vue` | Copy from whoobe-one-spike, strip editor code |
| **P3** | Capacitor config generation, platform setup | `capacitor.config.ts`, platform install commands |
| **P4** | Push notification integration | Capacitor Push Notifications plugin |
| **P5** | Deep linking | Capacitor Deeplinks plugin |
| **P6** | Splash screen + icon generation | From `pwaConfig` |
| **P7** | CI/CD integration | GitHub Actions that build + deploy to stores |