# Capacitor Mobile App — Publishing Guide

Generate a **native iOS/Android mobile app** from your Whoobe CMS website using Capacitor. The app renders only `kind: "app"` pages (mobile-first layouts with bottom navigation) and connects to your CMS via the public API.

## Prerequisites

- Node.js 20+ and pnpm 9+
- A running Whoobe CMS with public API access
- A website with at least one page of **kind "app"** (set in the page editor's settings)
- For iOS: macOS with Xcode
- For Android: Android Studio

## Quick Start

```bash
# 1. Generate the mobile app project
whoobe-mobile generate \
  --api-url https://cms.example.com \
  --website-id <uuid> \
  --out-dir ./sites/my-mobile-app \
  --app-name "My Brand"

# 2. Install dependencies
cd ./sites/my-mobile-app
npm install

# 3. Build the web app
npm run build

# 4. Add native platforms
npx cap add android
npx cap add ios          # macOS only

# 5. Sync web build to native projects
npx cap sync

# 6. Open in native IDE
npx cap open android     # Opens Android Studio
npx cap open ios         # Opens Xcode (macOS only)
```

## What Gets Generated

```
sites/my-mobile-app/
├── package.json              # Dependencies: Vue 3, Vue Router, Alpine.js, Capacitor v7
├── vite.config.ts            # Vite config with base: './' for file:// compatibility
├── tsconfig.json
├── capacitor.config.ts       # App name, ID, splash screen, status bar, push config
├── index.html                # HTML shell with Google Fonts, viewport-fit=cover
├── src/
│   ├── main.ts               # App bootstrap: Vue + Pinia + Alpine.js + Capacitor plugins
│   ├── App.vue               # Root component: <router-view />
│   ├── router/index.ts       # Hash-based router with routes for each app page
│   ├── views/PublicPage.vue  # Page renderer — fetches content from CMS public API
│   ├── composables/useApi.ts # API URL and website ID from env / compiled-in defaults
│   └── assets/main.css       # Tailwind CSS + theme variables + safe area utilities
└── public/
    └── favicon.ico
```

## CLI Reference

```bash
whoobe-mobile generate \
  --api-url <url>           # Base URL of the CMS public API (required)
  --website-id <id>         # UUID of the website (required)
  --out-dir <path>          # Output directory (required)
  --app-name <name>         # Display name for the app (defaults to website name)
  --app-id <id>             # Bundle identifier (defaults to com.whoobe.mobile.<slug>)
  --domain <domain>         # Custom domain for API (defaults to api-url host)
```

## How It Works

### Architecture

```
                     ┌──────────────────┐
                     │   Native App      │
                     │  (Android / iOS)  │
                     │                   │
User opens app ─────→│ WebView loads     │
                     │ hash route ──────→│──┐
                     │                   │  │
                     │ PublicPage.vue    │  │
                     │ fetches page via  │←─┘
                     │ CMS public API    │
                     │                   │
                     │ Alpine.js handles │
                     │ x-data / x-show   │
                     │ interactivity     │
                     └──────────────────┘
                            │ HTTPS
                     ┌──────┴──────┐
                     │  Whoobe CMS │
                     │ (core-api)  │
                     └─────────────┘
```

### Page Filtering

The generator only includes **app-kind pages**:

1. **At generation time**: fetches all published pages, filters to `kind === 'app'`
2. **Route generation**: creates an explicit route for each app page slug
3. **Runtime guard**: the generated `PublicPage.vue` checks `page.kind === 'app'` and rejects non-app pages

If no app pages exist, the generator fails with a clear error message.

### Hash Routing

The app uses `createWebHashHistory()` instead of HTML5 history mode. This is required because Capacitor loads the app from `http://localhost` (dev) or `file://` (production), and hash mode works everywhere without a server.

### API URL Resolution

The API URL is resolved in this priority:

1. `VITE_CORE_API_URL` env var (set in `.env` at generation time)
2. Compiled-in default from the `--api-url` CLI flag

For production, set `VITE_CORE_API_URL` in `.env` to your production CMS URL.

## Configuration

### `capacitor.config.ts`

Generated with sensible defaults. Key settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `appId` | `com.whoobe.mobile.<slug>` | Bundle identifier (reverse-domain) |
| `appName` | From `--app-name` or website name | Display name on the home screen |
| `webDir` | `dist` | Built web app output directory |
| `SplashScreen.backgroundColor` | From PWA config or `#ffffff` | Splash screen background |
| `StatusBar.backgroundColor` | From PWA config theme color | Status bar color |

### Environment Variables (`.env`)

| Variable | Description |
|----------|-------------|
| `VITE_CORE_API_URL` | CMS public API base URL |
| `VITE_WEBSITE_ID` | Website UUID |
| `VITE_DEFAULT_LOCALE` | Default locale (e.g. `en`) |

## Native Build & Deployment

### Android

```bash
npx cap open android
```

In Android Studio:
1. Wait for Gradle sync to complete
2. Select a device or emulator
3. Click Run ▶

To build a release APK/AAB:
```bash
cd android
./gradlew assembleRelease     # APK
./gradlew bundleRelease       # AAB (Google Play)
```

### iOS (macOS only)

```bash
npx cap open ios
```

In Xcode:
1. Select a simulator or connected device
2. Click Run ▶

To build for App Store:
```bash
npx cap sync ios
# Open .xcworkspace in Xcode, set signing team, Archive
```

## Push Notifications

The app includes `@capacitor/push-notifications` for native push.

### Setup

1. **Android**: Add Firebase Cloud Messaging configuration (`google-services.json`) to `android/app/`
2. **iOS**: Enable Push Notifications capability in Xcode, generate APNs certificate

### Subscription

The generated `main.ts` registers push handlers. When a push token is received, send it to your CMS:

```typescript
import { PushNotifications } from '@capacitor/push-notifications'

PushNotifications.addListener('registration', (token) => {
  fetch(`${apiUrl}/public/pwa/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      websiteId,
      provider: 'capacitor',
      subscription: { endpoint: token.value },
    }),
  })
})
```

## Offline Behavior

The app uses the WebView's built-in HTTP cache. For basic offline support:

- **Page data**: The browser's HTTP cache caches API responses based on `Cache-Control` headers
- **Assets (images, CSS)**: Cached by the WebView automatically
- **No service worker**: Capacitor apps don't need one — the native WebView handles caching

For more advanced offline support (Phase 2), add an IndexedDB cache layer in `useApi.ts`.

## Customizing the App Shell

The generated app is intentionally minimal. To add a navigation bar, splash screen, or other shell UI:

1. Edit `src/App.vue` to add a layout wrapper
2. Add navigation components in `src/components/`
3. Rebuild and sync:

```bash
npm run build && npx cap sync
```

## Updating the App

When your CMS content changes:

```bash
npm run build && npx cap sync
```

Re-run `npx cap open android` (or iOS) and rebuild the native app for store distribution. For dynamic content that changes frequently, the app already fetches live data from the CMS API at runtime — only structural changes (new pages, routing changes) require a rebuild.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Blank screen on device** | Check `VITE_CORE_API_URL` in `.env` — must be reachable from the device |
| **"No app pages found"** | Create pages with kind "app" in the editor's page settings |
| **CORS errors** | Ensure your CMS API allows requests from the app's origin (or `*`) |
| **Images not loading** | Check that the CMS DAM proxy is publicly accessible |
| **Hash route not working** | Verify `vite.config.ts` has `base: './'` |
| **Splash screen stays visible** | The app hides it in `main.ts` — check for JS errors in the WebView |