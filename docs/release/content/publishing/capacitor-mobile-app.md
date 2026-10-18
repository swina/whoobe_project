# Capacitor Mobile App — Publishing Guide

Generate a **native iOS/Android mobile app** from your Whoobe website using Capacitor. The app renders only `kind: "app"` pages (mobile-first layouts with bottom navigation) and connects to your CMS via the public API.

## Prerequisites

- Node.js 20+ and pnpm 9+
- A running Whoobe with public API access
- A website with at least one page of **kind "app"** (set in the page editor's settings)
- For iOS: macOS with Xcode
- For Android: Android Studio

## Quick Start

The easiest way to generate the project is the interactive script at the repo root — it builds the
generator, prompts for everything below, and prints the next steps when it's done:

```bash
./publish-mobile.sh
```

It asks for: the CMS API URL, the website ID (Websites → click the truncated ID to copy the full
UUID), an app display name, a bundle identifier, an output directory, and whether to generate a
**fully static (offline)** build (see [Static vs. Dynamic Mode](#static-vs-dynamic-mode) below).
The admin dashboard's **Settings → PWA / Mobile App** page (once a website is selected) shows this
same command plus a ready-to-copy non-interactive version pre-filled with that website's ID.

Equivalently, to script it non-interactively:

```bash
# 1. Build the generator once (publish-mobile.sh does this for you automatically)
pnpm run --filter @whoobe-cms/mobile-app... build

# 2. Generate the mobile app project
node packages/mobile-app/bin/whoobe-mobile.js \
  --api-url https://cms.example.com \
  --website-id <uuid> \
  --out-dir ./sites/my-mobile-app \
  --app-name "My Brand"
  # add --static for a fully offline build

# 3. Install dependencies
cd ./sites/my-mobile-app
npm install

# 4. Build the web app
npm run build

# 5. Add native platforms
npx cap add android
npx cap add ios          # macOS only

# 6. Sync web build to native projects
npx cap sync

# 7. Open in native IDE
npx cap open android     # Opens Android Studio
npx cap open ios         # Opens Xcode (macOS only)
```

## What Gets Generated

```
sites/my-mobile-app/
├── package.json                    # Vue 3, Vue Router, Alpine.js, @lucide/vue, Capacitor v7
├── vite.config.ts                  # Vite config with base: './' for file:// compatibility
├── tsconfig.json
├── capacitor.config.ts             # App name, ID, splash screen, status bar, push config
├── index.html                      # HTML shell with Google Fonts, viewport-fit=cover
├── src/
│   ├── main.ts                     # App bootstrap: Vue + Alpine.js (+ Collapse plugin) + Capacitor plugins
│   ├── App.vue                     # Root component: <router-view /> + in-page anchor scroll handling
│   ├── router/index.ts             # Hash-based router with routes for each app page
│   ├── views/PublicPage.vue        # Fetches page + template layout, binds Alpine x-data from the layout's body slot
│   ├── components/PageRenderer.vue # Recursive block renderer — icons, images, links, containers
│   ├── composables/useApi.ts       # API URL, website ID, root path, asset-processor URL
│   └── assets/main.css             # Tailwind CSS + theme variables + safe area utilities
└── public/
    └── favicon.ico
```

In `--static` mode, two extra files replace the runtime API calls with data baked in at generation
time: `src/assets/pagesData.ts` (every app page's content + layout, inlined) and
`src/assets/images.ts` (a map from original image reference to a locally-downloaded, bundled file
under `public/images/`).

## CLI Reference

There is no subcommand — `whoobe-mobile` (or `node packages/mobile-app/bin/whoobe-mobile.js`
inside the monorepo, after running `pnpm run --filter @whoobe-cms/mobile-app... build` once) takes
flags directly:

```bash
whoobe-mobile \
  --api-url <url>           # Base URL of the CMS public API (required)
  --website-id <id>         # UUID of the website (required)
  --out-dir <path>          # Output directory (required)
  --app-name <name>         # Display name for the app (defaults to website name)
  --app-id <id>             # Bundle identifier (defaults to com.whoobe.mobile.<slug>)
  --domain <domain>         # Custom domain for API (defaults to api-url host)
  --static                  # Inline all page content + images so the app works fully offline
```

### Static vs. Dynamic Mode

By default (no `--static`) the generated app fetches page content live from the CMS public API at
runtime — content updates show up without rebuilding, but the app needs network access to the CMS.
`--static` instead bakes every app page's content, layout, and images into the build at generation
time: the app works fully offline, but picking up CMS content changes means re-running the
generator and rebuilding.

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
                     │   Whoobe    │
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

Two consequences of this, both handled automatically by the generator:

- **In-page anchor links** (e.g. a slider's `href="#slide2"`) would otherwise be swallowed by the
  router as a navigation to a non-existent route. `App.vue` intercepts these clicks and scrolls to
  the target element manually instead.
- **Internal page-to-page links** authored in the editor are stored as
  `{website.rootPath}{page.slug}` (e.g. `/en/app/home`) — not routable as-is under hash history.
  `PageRenderer.vue` strips the website's `rootPath` and prepends `#` when rendering `<a>` hrefs, so
  `/en/app/home` becomes `#/app/home`, matching the route the app actually registered for that page.

### API URL Resolution

The API URL is resolved in this priority:

1. `VITE_CORE_API_URL` env var (set in `.env` at generation time)
2. Compiled-in default from the `--api-url` CLI flag

For production, set `VITE_CORE_API_URL` in `.env` to your production CMS URL.

## Styles and themes

A website's theme (Settings > Themes) has two parts, and both end up in the generated project:

- **Colours** (and any `@theme { --color-* }` you write in the custom CSS) become Tailwind colour utilities: a colour named `accent-violet` gives `bg-accent-violet`, `text-accent-violet`, `border-accent-violet` ...
- **Custom CSS** (the theme's *styles*) is added as it is: fonts (`@import`), rules for `body`, classes such as `.glass-panel`.

Rules worth knowing when you write that CSS:

- **Write the rules for `body` (background, text colour, font) inside `@layer base { ... }`.** The generated projects keep their own defaults (white page, default font) in a layer *below* `base`, so your rule always wins. A rule outside any layer also wins, but then it beats Tailwind's utility classes too (`bg-black` on the body would stop working).
- **Tailwind's classes (`utilities` layer) win over `base` and over the defaults.** To restyle one element, give it a class; to set the page, use `body` in `@layer base`.
- **Plain rules (`.glass-panel { ... }`) are outside any layer**, so they beat Tailwind utilities with the same property. If a utility class must override one of your classes, put your class inside `@layer components { ... }`.
- **Order inside the same layer decides**: the last rule wins. Layers decide before specificity and before position: an unlayered rule beats every layered one whatever its order in the file.
- **`@import` lines (Google Fonts) are kept apart and loaded first**; nothing else needs to be moved.
- Colours changed in the theme need the project to be generated again (see "Theme, Gateway URL, base path changes").

In the mobile project the theme is in `index.html` as `<style type="text/tailwindcss" id="theme-styles">` (it is compiled by the Tailwind browser runtime, which is what makes `@theme` colours work) and the `@import` lines in a separate `<style id="theme-imports">`. The defaults are in `src/assets/main.css`, inside `@layer defaults`; the page background default is on `body` only, so a theme's body colour fills the whole page. A project generated before 2026-10-08 has the older files: generate it again (run `pnpm run --filter @whoobe-cms/mobile-app... build` first; `publish-mobile.sh` does it).

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
| **Images not loading** | Check that the CMS DAM proxy (`/dam-asset/*`, `/public/assets/:uuid`) is reachable from the device; in local dev this is a separate port (3002) from core-api |
| **Icons not loading** | The generated app dynamically imports `@lucide/vue` on first icon render — check the WebView console for a failed chunk load, and confirm `npm install` completed |
| **Internal links go to a blank/404 page** | The link's `href` must be under this website's `rootPath` for the generator to route it internally — a link authored for a different website's `rootPath` can't be resolved inside this app |
| **Hash route not working** | Verify `vite.config.ts` has `base: './'` |
| **Splash screen stays visible** | The app hides it in `main.ts` — check for JS errors in the WebView |