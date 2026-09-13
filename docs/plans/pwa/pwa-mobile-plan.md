# PWA Mobile — App Mode Plan

## Overview

Turn any Whoobe CMS website into a **progressive web app** (installable, offline-capable, native-feeling mobile app). The visual builder gains an "App Mode" toggle that constrains the canvas to mobile viewports and unlocks mobile-specific components and PWA configuration. A new SDK package generates a standalone PWA shell with service workers, offline sync, and a dynamic rendering route.

---

## 1. Database Layer

### New columns on `websites` table

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `pwa_enabled` | `boolean` | `false` | Master toggle — enables PWA generation for this website |
| `pwa_config` | `jsonb` | `{}` | PWA manifest overrides (see schema below) |

### `pwa_config` JSON schema

```typescript
type PushProvider = 'self' | 'onesignal' | 'firebase'

interface PushProviderConfig {
  /** Which push provider to use */
  provider: PushProvider

  // ---- Self-hosted (web-push / VAPID) ----
  vapidPublicKey?: string
  vapidPrivateKey?: string         // server-only, never returned by GET

  // ---- OneSignal ----
  onesignalAppId?: string
  onesignalApiKey?: string         // server-only (REST API key)
  onesignalSafariWebId?: string    // optional, for Safari

  // ---- Firebase Cloud Messaging ----
  firebaseProjectId?: string
  firebaseApiKey?: string          // Web API key (public, shipped to client)
  firebaseSenderId?: string
  firebaseAppId?: string
  firebaseServiceAccount?: string  // JSON string, server-only
}

interface PwaConfig {
  /** Display mode — 'standalone' | 'fullscreen' | 'minimal-ui' */
  display: string
  /** Orientation — 'portrait' | 'landscape' | 'any' */
  orientation: string
  /** Background color (splash screen) */
  backgroundColor: string
  /** Theme color (status bar) */
  themeColor: string
  /** Icon variants for the manifest */
  icons: {
    src: string
    sizes: string
    type: string
    purpose?: 'any' | 'maskable' | 'monochrome'
  }[]
  /** Splash screen image (optional, falls back to icon) */
  splashScreen?: string
  /** Start URL after install (defaults to website root) */
  startUrl: string
  /** Short app name (max 12 chars for home screen) */
  shortName: string
  /** Push notification configuration */
  push: PushProviderConfig
}
```

### New table: `pwa_subscriptions`

For push notification subscriptions:

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid PK` | defaultRandom |
| `website_id` | `uuid FK` | → `websites(id)` ON DELETE CASCADE |
| `endpoint` | `text` | Push subscription endpoint |
| `keys` | `jsonb` | `{ p256dh, auth }` |
| `user_agent` | `text` | nullable |
| `created_at` | `timestamp` | |

### Migration: `packages/core/drizzle/0037_pwa_mobile.sql`

---

## 2. Editor — Mobile App Mode

### Toggle: "App Mode"

Location: `apps/whoobe-one-spike` — add toggle in the editor toolbar (next to device preview buttons).

When active:

| Behaviour | Detail |
|-----------|--------|
| **Canvas width** | Locks to `375px` (iPhone SE) or `390px` (iPhone 16) — user-selectable via dropdown |
| **Device chrome** | Shows a phone frame around the canvas (status bar notch, home indicator) |
| **PWA config panel** | New tab in the right sidebar: manifest fields (colors, icons, splash screen, orientation) |
| **Bottom Navigation** | New element type becomes available; renders a fixed bottom bar with icon+label links |
| **Splash Screen** | Image picker (DAM) + background color selector |
| **Push Notification triggers** | New action type on buttons/forms: "Subscribe to push" + "Send notification" |
| **Output flag** | Root node gets `isMobileApp: true` + `pwaConfig` embedded |

### New element type: Bottom Navigation

```typescript
interface ElementBottomNav {
  kind: 'bottom-navigation'
  items: {
    id: string
    label: string
    icon: string           // Lucide icon name
    link?: string          // Internal page path or external URL
    active?: boolean       // Default active tab
  }[]
  activeColor: string      // Tailwind class for active tab
  inactiveColor: string    // Tailwind class for inactive tab
  backgroundColor: string  // Background of the bar itself
}
```

The bottom navigation renders as a fixed `position: fixed; bottom: 0; width: 100%` bar with iOS/Android-safe bottom padding.

### New action: Push Notification trigger

For buttons and form submissions, add a push notification action:

```typescript
interface PushAction {
  type: 'push-notification'
  title: string
  body: string
  icon?: string
  badge?: string
  data?: Record<string, unknown>
  /** For forms: use submitted field values in the template */
  template?: string       // e.g. "New submission from {{email}}"
}
```

### Files to create/modify

| File | Change |
|------|--------|
| `apps/whoobe-one-spike/src/store/editor.ts` | Add `appMode` ref, `pwaConfig` ref, `setAppMode()` |
| `apps/whoobe-one-spike/src/components/BlockEditor.vue` | Add "App Mode" toggle button; conditionally constrain canvas width |
| `apps/whoobe-one-spike/src/components/PwaConfigPanel.vue` | **New** — sidebar panel for manifest config (colors, icons, splash, push) |
| `apps/whoobe-one-spike/src/components/FloatingToolbar.vue` | Add bottom nav creation + push notification action config |
| `apps/whoobe-one-spike/src/scripts/ElementsClass.js` | Add `BottomNavigation()` constructor, `PushAction()` |
| `apps/whoobe-one-spike/src/scripts/ElementsClass.d.ts` | Add `ElementBottomNav`, `PushAction` interfaces |
| `apps/whoobe-one-spike/src/components/preview/BlockContainerPreview.vue` | Render bottom navigation in preview |
| `apps/whoobe-one-spike/src/components/DocumentPreview.vue` | Add phone frame when appMode is active |

---

## 3. SDK — PWA Template Package

### New package: `@whoobe-cms/pwa-template`

Location: `packages/sdk/pwa-template/`

A standalone mobile app shell that consumes the Whoobe CMS public API. Framework choice: **Vite + Vue 3** (lightest weight, reuses existing Vue SDK components).

### Project structure

```
packages/sdk/pwa-template/
├── package.json
├── template/
│   ├── index.html
│   ├── src/
│   │   ├── main.ts                 # App bootstrap + registerSW
│   │   ├── App.vue                 # Root component: reads appId from route
│   │   ├── router/
│   │   │   └── index.ts            # /public/apps/:appId/* dynamic route
│   │   ├── components/
│   │   │   ├── AppShell.vue        # Wraps content + bottom nav + splash
│   │   │   ├── BottomNav.vue       # Renders the bottom navigation bar
│   │   │   ├── SplashScreen.vue    # Animated splash on cold start
│   │   │   └── OfflineIndicator.vue
│   │   ├── composables/
│   │   │   ├── useAppData.ts             # Fetch WHOOBE tree + assets
│   │   │   ├── useOfflineSync.ts         # IndexedDB caching of pages
│   │   │   └── usePushNotifications.ts   # Provider-agnostic push (self/OneSignal/FCM)
│   │   ├── sw/
│   │   │   ├── service-worker.ts         # Workbox-based SW
│   │   │   └── onesignal-sw.ts           # OneSignal service worker (shim, delegates to OneSignal SDK)  
│   │   ├── lib/
│   │   │   └── push-provider.ts          # Client-side push abstraction
│   │   └── assets/
│   │       └── manifest.json       # Dynamic PWA manifest
│   ├── vite.config.ts
│   └── tsconfig.json
```

### Dynamic route: `/public/apps/:appId/*`

1. `:appId` resolves to a `website.id` (or a new dedicated `pwa_apps` table)
2. Fetches the website's published page tree from `GET /public/websites/:id`
3. Renders the JSON tree through the existing `@whoobe-cms/vue` SDK renderer
4. Wraps the output in `AppShell.vue` which:
   - Applies the PWA config (theme color, background color)
   - Renders bottom navigation if configured
   - Shows splash screen on first paint
   - Injects the service worker

### Service Worker (Workbox)

```typescript
// Strategy: StaleWhileRevalidate for pages, CacheFirst for DAM assets
import { registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate, CacheFirst } from 'workbox-strategies'

// WHOOBE API pages — serve from cache, update in background
registerRoute(
  ({ url }) => url.pathname.startsWith('/public/'),
  new StaleWhileRevalidate({ cacheName: 'whoobe-pages' })
)

// DAM images — cache forever once fetched
registerRoute(
  ({ url }) => url.pathname.startsWith('/dam-asset/'),
  new CacheFirst({ cacheName: 'whoobe-dam-images' })
)

// Data Objects — NetworkFirst with IndexedDB fallback
registerRoute(
  ({ url }) => url.pathname.startsWith('/public/objects/'),
  new NetworkFirst({ cacheName: 'whoobe-objects' })
)
```

### Offline sync for Data Objects

When the app is offline and a form submission or Data Object update is attempted:
- Queue the mutation in IndexedDB (`idb-wrapper` or Dexie)
- On `online` event, replay the queue against the API
- Show pending count in an OfflineIndicator component

---

## 4. Push Notification Architecture

### Provider abstraction (server-side)

New file: `packages/core/src/push/provider.ts`

```typescript
interface PushProvider {
  name: 'self' | 'onesignal' | 'firebase'
  /** Send a notification to one or many subscribers */
  send(recipients: PushRecipient[], payload: PushPayload): Promise<PushResult>
  /** Validate the provider configuration */
  validateConfig(): PushConfigError | null
}

// Provider implementations (one per file):
// - packages/core/src/push/providers/self.ts      -> web-push (VAPID)
// - packages/core/src/push/providers/onesignal.ts  -> OneSignal REST API
// - packages/core/src/push/providers/firebase.ts   -> Firebase Admin SDK
```

Provider selection happens at runtime based on `pwa_config.push.provider`.

### Client-side abstraction

New file: `packages/sdk/pwa-template/template/src/lib/push-provider.ts`

```typescript
interface ClientPushProvider {
  /** Request permission and subscribe */
  subscribe(): Promise<boolean>
  /** Unsubscribe */
  unsubscribe(): Promise<void>
  /** Check if subscribed */
  isSubscribed(): boolean
}

// Implementations:
// - self:             navigator.serviceWorker.pushManager + subscribe with VAPID key
// - onesignal:        OneSignal SDK (window.OneSignal) — loaded from CDN
// - firebase:         Firebase Messaging SDK — loaded from CDN
```

### API Routes

### `GET /public/apps/:websiteId`

Returns the full PWA manifest data + page tree for a given website:

```json
{
  "website": {
    "id": "...",
    "name": "My App",
    "rootPath": "/app",
    "domains": ["app.example.com"]
  },
  "pwaConfig": {
    "display": "standalone",
    "orientation": "portrait",
    "backgroundColor": "#ffffff",
    "themeColor": "#4f46e5",
    "icons": [...],
    "shortName": "MyApp",
    "startUrl": "/public/apps/123/"
  },
  "pages": [
    { "id": "...", "slug": "home", "title": "Home", "content": {...} },
    { "id": "...", "slug": "profile", "title": "Profile", "content": {...} }
  ],
  "bottomNavigation": {
    "items": [...],
    "activeColor": "text-indigo-600",
    "backgroundColor": "bg-white"
  }
}
```

### `POST /pwa/subscribe` (permission: public, rate-limited)

Subscribe to push notifications. Works for all providers — the endpoint stores the subscription and dispatches to the configured provider.

```json
{
  "websiteId": "uuid",
  "provider": "self" | "onesignal" | "firebase",
  "subscription": {
    // For 'self': endpoint + keys (standard Web Push API)
    "endpoint": "https://fcm.googleapis.com/...",
    "keys": { "p256dh": "...", "auth": "..." }
    // For 'onesignal': OneSignal subscription ID
    // "onesignalUserId": "uuid"
    // For 'firebase': FCM token
    // "fcmToken": "..."
  }
}
```

### `POST /pwa/send` (permission: `OBJECTS_WRITE`)

Send a push notification through the configured provider:

```json
{
  "websiteId": "uuid",
  "title": "New content!",
  "body": "Check out the latest update",
  "icon": "/dam-asset/icon-192.png",
  "data": { "url": "/public/apps/123/home" }
}
```

The server reads `pwa_config.push.provider` for the website, instantiates the correct provider implementation, and dispatches. No extra params needed.

Provider backends:
- **self**: requires `web-push` npm package + VAPID keys (`pwa_config.push.vapidPublicKey` / `.vapidPrivateKey`)
- **onesignal**: requires `@onesignal/node-onesignal` npm package + `pwa_config.push.onesignalAppId` / `.onesignalApiKey`
- **firebase**: requires `firebase-admin` npm package + `pwa_config.push.firebaseServiceAccount`

---

## 5. Admin Dashboard — PWA Settings UI

### `PwaSettingsCard.vue`

Location: `apps/admin-dashboard/src/components/settings/PwaSettingsCard.vue`

A settings card in the Website settings view:

- **Enable PWA** toggle → sets `pwa_enabled`
- **App name** (short name) input
- **Display mode** select: standalone / fullscreen / minimal-ui
- **Orientation** select: portrait / landscape / any
- **Background color** color picker
- **Theme color** color picker
- **Splash screen** DAM image picker
- **App icons** — upload up to 4 variants (192x192, 512x512, maskable)
- **Push notifications** — provider selector with dynamic fields:
  - **Self-hosted** (web-push): auto-generate VAPID keys, show public key
  - **OneSignal**: OneSignal App ID, REST API Key (password field), Safari Web ID (optional)
  - **Firebase**: Project ID, Web API Key, Sender ID, App ID, Service Account JSON (file upload or textarea)

### API client

Add to `apps/admin-dashboard/src/utils/websites-api.ts`:

```typescript
fetchPwaConfig(websiteId): Promise<PwaConfig>
savePwaConfig(websiteId, config): Promise<PwaConfig>
```

---

## 6. File Inventory

### New files

| File | Purpose |
|------|---------|
| `packages/core/src/db/pwa-subscriptions-schema.ts` | Push subscription schema |
| `packages/core/src/push/provider.ts` | Push provider interface |
| `packages/core/src/push/providers/self.ts` | Self-hosted web-push (VAPID) implementation |
| `packages/core/src/push/providers/onesignal.ts` | OneSignal REST API implementation |
| `packages/core/src/push/providers/firebase.ts` | Firebase Admin SDK implementation |
| `packages/core/drizzle/0037_pwa_mobile.sql` | Migration for new columns + table |
| `apps/whoobe-one-spike/src/components/PwaConfigPanel.vue` | PWA config sidebar panel |
| `apps/admin-dashboard/src/components/settings/PwaSettingsCard.vue` | PWA settings in dashboard |
| `packages/sdk/pwa-template/` | Full PWA template package |
| `packages/sdk/pwa-template/template/src/sw/service-worker.ts` | Workbox service worker |
| `packages/sdk/pwa-template/template/src/sw/onesignal-sw.ts` | OneSignal service worker shim |
| `packages/sdk/pwa-template/template/src/lib/push-provider.ts` | Client-side push abstraction |
| `packages/sdk/pwa-template/template/src/composables/useOfflineSync.ts` | IndexedDB offline queue |
| `packages/sdk/pwa-template/template/src/composables/usePushNotifications.ts` | Push subscription composable |
| `packages/sdk/pwa-template/template/src/components/AppShell.vue` | App shell wrapper |
| `packages/sdk/pwa-template/template/src/components/BottomNav.vue` | Bottom navigation renderer |
| `packages/sdk/pwa-template/template/src/components/SplashScreen.vue` | Splash screen |
| `packages/sdk/pwa-template/template/src/components/OfflineIndicator.vue` | Offline badge |

| Modified files | Change |
|------|--------|
|------|--------|
| `packages/core/src/db/websites-schema.ts` | Add `pwa_enabled`, `pwa_config` columns |
| `packages/core/src/db/websites-records.ts` | Add PWA fields to CRUD |
| `packages/core/src/server.ts` | Export new schema |
| `apps/core-api/src/server.ts` | Add `GET /public/apps/:id`, `POST /pwa/subscribe`, `POST /pwa/send` |
| `apps/whoobe-one-spike/src/store/editor.ts` | Add `appMode`, `pwaConfig` state |
| `apps/whoobe-one-spike/src/components/BlockEditor.vue` | App Mode toggle + canvas constraint |
| `apps/whoobe-one-spike/src/components/FloatingToolbar.vue` | Bottom nav creation, push action |
| `apps/whoobe-one-spike/src/components/DocumentPreview.vue` | Phone frame when appMode |
| `apps/whoobe-one-spike/src/scripts/ElementsClass.js` | BottomNavigation constructor |
| `apps/whoobe-one-spike/src/scripts/ElementsClass.d.ts` | ElementBottomNav, PushAction types |
| `apps/admin-dashboard/src/utils/websites-api.ts` | PWA config API |
| `apps/admin-dashboard/src/store/tabsStore.ts` | Add `'pwa'` to website settings tabs |
| `pnpm-workspace.yaml` | Add `packages/sdk/pwa-template` |

---

## 7. Implementation Order

| Phase | Scope |
|-------|-------|
| **1. DB + Schema** | New columns on `websites`, `pwa_subscriptions` table, migration |
| **2. Editor App Mode** | Toggle, canvas constraint, phone frame, PWA config panel |
| **3. Bottom Navigation** | New element type, editor UI, preview rendering, SDK support |
| **4. Push Notifications** | Provider abstraction (self/OneSignal/FCM), subscribe/send endpoints, VAPID key generation, provider configs in admin UI |
| **5. PWA Template** | `@whoobe-cms/pwa-template` package, service worker, offline sync, AppShell |
| **6. Admin UI** | `PwaSettingsCard.vue`, manifest config, icon uploader |
| **7. Publish CLI** | Add `--pwa` flag to `whoobe-publish` to generate a PWA build instead of a website |

---

## 8. End-to-End User Flow

```
Admin builds a website in Whoobe CMS:
  1. Toggles "App Mode" in the editor
  2. Configures PWA manifest (colors, icons, short name)
  3. Adds bottom navigation with links to pages
  4. Adds push notification triggers on buttons/forms (e.g. "Subscribe" button)
  5. Publishes the website

Developer/Admin:
  6. Enables PWA in Settings → PWA
  7. Selects push provider (Self-hosted / OneSignal / Firebase)
  8. Fills in provider credentials (or auto-generates VAPID keys for self-hosted)
  9. Runs `pnpm --filter @whoobe-cms/pwa-template generate --website-id <id>`
     OR visits `https://whoobe-cms.example.com/public/apps/<websiteId>`
     from a mobile device

End user:
  10. Opens the PWA URL on a mobile browser
  11. "Add to Home Screen" prompt appears (browser detects manifest + SW)
  12. App opens fullscreen, splash screen shows on cold start
  13. Bottom navigation allows quick tab switching
  14. Content loads from cache when offline
  15. User taps "Subscribe" button → browser shows native push permission dialog
  16. Subscription is sent to the configured provider (OneSignal SDK / FCM / VAPID)
  17. Admin can send push notifications from the dashboard → delivered via the configured provider
  18. Form submissions queue in IndexedDB when offline, sync when back online
```