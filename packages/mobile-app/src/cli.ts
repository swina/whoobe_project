import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { ApiClient } from '@whoobe-cms/renderer'

export interface GenerateOptions {
  apiUrl: string
  websiteId: string
  outDir: string
  domain?: string
  appName?: string
  appId?: string
  /** When true, inline all page content + images so the app works fully offline. */
  static?: boolean
  /** Base URL of the API Gateway — needed for gateway-backed form submissions
   *  and data binding resolution. Without it, gateway calls fall back to
   *  http://localhost:3001 (only works from the CMS's own host). */
  gatewayUrl?: string
  /** Optional Gateway API key for this website (Settings > Publish > Gateway
   *  site key). Stored in the generated .env as a VITE_ variable — the mobile
   *  app sends it as X-Whoobe-Site-Key alongside X-Whoobe-Site-Id when
   *  calling the Gateway's public resolve/submit endpoints. */
  siteApiKey?: string
}

export interface ScaffoldOptions {
  outDir: string
  apiUrl: string
  websiteId: string
  websiteName: string
  appName: string
  appId: string
  domain: string
  defaultLocale: string
  rootPath: string
  supportedLocales: string[]
  themeCss: string
  fontFamilies: string[]
  pwaConfig?: Record<string, unknown>
  appPageSlugs: string[]
  staticMode: boolean
  pagesData: Record<string, { content: unknown; title: string; seo: Record<string, unknown> | null; layout?: Record<string, unknown> | null }>
  imagesMap: Record<string, string>
  gatewayUrl: string
  siteApiKey: string
}

/** A DAM asset UUID stored as an image reference (see resolveDisplayUrl in
 *  apps/whoobe-one-spike) rather than a resolved URL. */
const ASSET_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function looksLikeAssetId(value: string): boolean {
  return ASSET_ID_RE.test(value)
}

/** Best-effort guess at the asset-processor's base URL from just the CMS API
 *  URL: local dev runs it on a separate port (3002) alongside core-api
 *  (3003, see docker-compose.yml); production reverse-proxies both services
 *  behind the same public hostname (docs/release/operations/deployment.md), so the API URL
 *  itself is already correct there. */
function getAssetProcessorUrl(apiUrl: string): string {
  const u = new URL(apiUrl)
  if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.port) {
    u.port = '3002'
    return u.toString().replace(/\/+$/, '')
  }
  return apiUrl.replace(/\/+$/, '')
}

/** Walk a content tree and collect every image reference found: absolute
 *  URLs, relative paths starting with `/` (Pimcore-style DAM paths), and
 *  DAM asset-record UUIDs — all resolved to a real URL at download time. */
function collectImagesFromTree(node: unknown, urls: Set<string>): void {
  if (!node || typeof node !== 'object') return
  const obj = node as Record<string, unknown>
  const src = (obj.image as Record<string, unknown> | undefined)?.url ?? obj.src
  if (typeof src === 'string' && src.startsWith('/')) urls.add(src)
  else if (typeof src === 'string' && /^https?:\/\//.test(src)) urls.add(src)
  else if (typeof src === 'string' && looksLikeAssetId(src)) urls.add(src)
  const blocks = obj.blocks
  if (Array.isArray(blocks)) for (const child of blocks) collectImagesFromTree(child, urls)
}

/** Strip `content` from any node that is a container type (flex, grid, etc.)
 *  — containers render their children, not their own content field.
 *  Also strips from any node that has child blocks (legacy data that stored
 *  content on containers alongside children). Mutates in place. */
function stripContentFromContainers(node: unknown): void {
  if (!node || typeof node !== 'object') return
  const obj = node as Record<string, unknown>
  if (obj.type === 'container' || (Array.isArray(obj.blocks) && obj.blocks.length > 0)) {
    obj.content = null
  }
  const blocks = obj.blocks
  if (Array.isArray(blocks)) for (const child of blocks) stripContentFromContainers(child)
}

/** Pimcore path -> S3 object key, mirroring formatS3ObjectKey in
 *  packages/core/src/dam/storage.ts: strip backslash separators and any
 *  leading slash, then prepend the bucket key prefix (S3_KEY_PREFIX, an
 *  undocumented/unset-in-practice server env var — never exposed by any
 *  public API, so this assumes the default empty prefix). */
function formatS3ObjectKey(pimcorePath: string): string {
  return pimcorePath.replace(/\\/g, '/').replace(/^\/+/, '')
}

/** Resolve a stored image reference (a real URL, a DAM asset UUID, or a
 *  Pimcore-style raw path) to a real, fetchable URL. Mirrors
 *  resolveDisplayUrl in apps/whoobe-one-spike, done up front (not lazily)
 *  since static-mode generation runs once at build time, not per render.
 *  The DAM's own asset-url resolver (`/api/v1/dam/asset-urls`) requires an
 *  authenticated session (fine for the editor, unusable from this
 *  unauthenticated build script) — but the URL it returns is just the
 *  public, unauthenticated `/dam-asset/:key` proxy route with a
 *  deterministically-derived key, so that's reconstructed directly here. */
async function resolveImageRef(ref: string, apiBaseUrl: string, assetProcessorUrl: string): Promise<string | null> {
  if (/^https?:\/\//.test(ref) || ref.startsWith('data:')) return ref
  try {
    if (looksLikeAssetId(ref)) {
      const res = await fetch(`${apiBaseUrl.replace(/\/+$/, '')}/public/assets/${ref}`)
      if (!res.ok) return null
      const body = await res.json()
      return body.url ?? null
    }
    if (ref.startsWith('/')) {
      return `${assetProcessorUrl}/dam-asset/${formatS3ObjectKey(ref)}`
    }
  } catch {
    return null
  }
  return ref
}

/** Download a remote image, save it as a local asset file under
 *  `<outDir>/public/images/`, and return the relative URL to use in the app.
 *  Returns null when the download or reference resolution fails — caller
 *  should skip adding the entry to the static assets map so no broken
 *  background-image emits. `url` may be a real URL, a DAM asset UUID, or a
 *  Pimcore-style raw path (both resolved via `resolveImageRef` first). */
async function downloadImage(url: string, outDir: string, apiBaseUrl: string, assetProcessorUrl: string): Promise<string | null> {
  try {
    const fetchUrl = await resolveImageRef(url, apiBaseUrl, assetProcessorUrl)
    if (!fetchUrl) {
      console.warn(`  ⚠ Failed to resolve ${url}`)
      return null
    }
    const res = await fetch(fetchUrl)
    if (!res.ok) {
      console.warn(`  ⚠ Failed to download ${fetchUrl} (${res.status})`)
      return null
    }
    const buf = Buffer.from(await res.arrayBuffer())
    const mime = res.headers.get('content-type') || ''
    const ext = mime.includes('image/png') ? 'png' : mime.includes('image/webp') ? 'webp' : mime.includes('image/svg') ? 'svg' : mime.includes('image/gif') ? 'gif' : 'jpg'
    const hash = createHash('md5').update(url).digest('hex').slice(0, 12)
    const filename = `${hash}.${ext}`
    const filepath = join(outDir, 'public', 'images', filename)
    await mkdir(join(outDir, 'public', 'images'), { recursive: true })
    await writeFile(filepath, buf)
    return `./images/${filename}`
  } catch (err) {
    console.warn(`  ⚠ Failed to download ${url}: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

export async function generateMobileApp(options: GenerateOptions): Promise<void> {
  const { apiUrl, websiteId, outDir, domain, appName, appId } = options
  const staticMode = options.static ?? false
  const client = new ApiClient(apiUrl)

  console.log(`Fetching website ${websiteId}...`)
  const websiteData = await client.getWebsite(websiteId)
  const website = websiteData.website as Record<string, unknown>
  const themes = (websiteData.themes ?? []) as Array<{
    id: string
    name: string
    colors: { name: string; hex: string }[]
    fonts: string[]
    styles?: string
    tailwindClasses?: string
  }>
  const defaultThemeId = websiteData.defaultThemeId as string | null

  const defaultLocale = (website.defaultLocale as string) ?? 'en'
  const supportedLocales = (website.supportedLocales as string[]) ?? [defaultLocale]
  const websiteName = (website.name as string) ?? 'Whoobe Site'
  // Internal links authored in the editor (FloatingToolbar.vue's "Website
  // path" picker) are stored as `${website.rootPath}${page.slug}` (e.g.
  // "/en/app/home" for a website whose rootPath happens to be "/en") — the
  // mobile app's routes are registered at the bare slug, so this prefix has
  // to be stripped back off when rendering those links (see PageRenderer.vue).
  const rootPath = (website.rootPath as string) ?? ''
  const defaultTheme = themes.find((t) => t.id === (defaultThemeId ?? themes[0]?.id)) ?? themes[0]
  const pwaConfig = ((website.pwaConfig as Record<string, unknown>) ?? {}) as Record<string, unknown>
  const finalAppName = appName ?? (pwaConfig.name as string) ?? websiteName
  const host = domain ?? new URL(apiUrl).hostname
  const slug = websiteId.slice(0, 8)
  const finalAppId = appId ?? `com.whoobe.mobile.${slug}`

  // Fetch all published pages
  console.log('Fetching published pages...')
  const pages = await client.listPages(websiteId)
  if (pages.length === 0) {
    console.log('No published pages found for this website.')
    throw new Error('No published pages found')
  }
  console.log(`Found ${pages.length} page(s):`)
  for (const p of pages) {
    console.log(`  ${p.locale} ${p.slug} — ${p.title}`)
  }
  const appPageSlugs = pages
    .filter((p) => p.locale === defaultLocale)
    .map((p) => p.slug)

  // Build pages data map. The app-shell's x-data (e.g. appMenu/appPage)
  // lives on the website template's `body` slot (layout.body.alpine), not
  // on the page's own content — read from `layout` at build/runtime instead.
  const pagesData: Record<string, { content: unknown; title: string; seo: Record<string, unknown> | null; layout?: Record<string, unknown> | null }> = {}
  for (const p of pages) {
    const key = `${p.locale}:${p.slug}`
    pagesData[key] = { content: p.content, title: p.title, seo: (p as any).seo ?? null }
  }

  const assetProcessorUrl = getAssetProcessorUrl(apiUrl)

  // In static mode, scan and download images, and fetch website template layout
  let imagesMap: Record<string, string> = {}
  if (staticMode) {
    console.log('Scanning for images...')
    const imageUrls = new Set<string>()

    // Collect images from page content trees
    for (const p of pages) {
      collectImagesFromTree(p.content, imageUrls)
    }

    // Fetch full page response (with layout) for each page to get header/footer module content
    console.log('Fetching website template layout...')
    for (const p of pages) {
      try {
        const key = `${p.locale}:${p.slug}`
        const lookup = await client.getPage(p.locale, p.slug, websiteId)
        if ((lookup as any).layout) {
          pagesData[key].layout = (lookup as any).layout
          const layout = (lookup as any).layout as Record<string, unknown>
          for (const slotName of ['header', 'aside', 'footer', 'main', 'body']) {
            const slot = layout[slotName] as Record<string, unknown> | null | undefined
            if (!slot) continue
            const pages = (slot as any).pages as Array<{ content: unknown }> | undefined
            if (!pages) continue
            for (const sp of pages) {
              stripContentFromContainers(sp.content)
              collectImagesFromTree(sp.content, imageUrls)
            }
          }
        }
      } catch {
        console.warn(`  ⚠ Failed to fetch layout for ${p.locale} ${p.slug}`)
      }
    }

    // Strip content from containers in page trees
    for (const p of pages) {
      stripContentFromContainers(p.content)
    }

    if (imageUrls.size > 0) {
      console.log(`Downloading ${imageUrls.size} image(s)...`)
      let i = 0
      for (const url of imageUrls) {
        i++
        process.stdout.write(`  [${i}/${imageUrls.size}] ${url}... `)
        const local = await downloadImage(url, outDir, apiUrl, assetProcessorUrl)
        if (local) {
          imagesMap[url] = local
          process.stdout.write('done\n')
        } else {
          process.stdout.write('failed — skipped\n')
        }
      }
    } else {
      console.log('No remote images found.')
    }
  }

  // Theme CSS for the generated app. CSS requires @import to precede every
  // other statement in the stylesheet, but a theme's custom styles
  // (defaultTheme.styles — e.g. a Google Fonts @import) are authored as a
  // free-form blob with no such guarantee, and would otherwise land after
  // the @theme{} colors block below. Hoist any @import lines to the very
  // top so the generated stylesheet stays valid.
  const colorVars = (defaultTheme?.colors ?? [])
    .map((c: { name: string; hex: string }) => `  --color-${c.name}: ${c.hex};`)
    .join('\n')
  // Matched per whole line, not up to the first ';' — a Google Fonts
  // @import URL commonly embeds its own semicolons in the query string
  // (e.g. "family=Poppins:wght@400;500;600;800"), so a regex terminated on
  // the first ';' truncates mid-statement and never matches to the real
  // line-ending ';'.
  const rawThemeStyles = defaultTheme?.styles ?? ''
  const themeStyleLines = rawThemeStyles.split('\n')
  const themeImports = themeStyleLines.filter((l) => /^\s*@import\b/.test(l)).join('\n')
  const themeStylesWithoutImports = themeStyleLines.filter((l) => !/^\s*@import\b/.test(l)).join('\n').trim()
  const themeCss = defaultTheme
    ? `${themeImports ? themeImports + '\n\n' : ''}@theme {\n${colorVars}\n}\n\n${themeStylesWithoutImports}`
    : ''
  const fontFamilies = defaultTheme?.fonts ?? []

  console.log('Generating mobile app project...')
  const gatewayUrl = options.gatewayUrl ?? ''
  const siteApiKey = options.siteApiKey ?? ''
  await scaffoldMobileApp({
    outDir,
    apiUrl,
    websiteId,
    websiteName,
    appName: finalAppName,
    appId: finalAppId,
    domain: host,
    defaultLocale,
    rootPath,
    supportedLocales,
    themeCss,
    fontFamilies,
    pwaConfig,
    appPageSlugs,
    staticMode,
    pagesData,
    imagesMap,
    gatewayUrl,
    siteApiKey,
  })

  console.log(`\nDone! Mobile app generated at: ${outDir}`)
  if (staticMode) {
    console.log('  (static mode — no CMS connection needed at runtime)')
  }
  console.log('Next steps:')
  console.log(`  cd ${outDir}`)
  console.log('  npm install')
  console.log('  npm run build')
  console.log('  npx cap add android')
  console.log('  npx cap add ios      # macOS only')
  console.log('  npx cap sync')
  console.log('  npx cap open android')
  console.log('  npx cap open ios')
}

async function scaffoldMobileApp(opts: ScaffoldOptions): Promise<void> {
  const dirs = ['src/views', 'src/router', 'src/composables', 'src/assets', 'src/components', 'public']
  for (const d of dirs) {
    await mkdir(join(opts.outDir, d), { recursive: true })
  }

  await writeFile(join(opts.outDir, 'package.json'), pkgJson(opts))
  await writeFile(join(opts.outDir, 'vite.config.ts'), viteConfig())
  await writeFile(join(opts.outDir, 'tsconfig.json'), tsconfig())
  await writeFile(join(opts.outDir, 'tsconfig.node.json'), tsconfigNode())
  await writeFile(join(opts.outDir, 'src/env.d.ts'), envDts())
  await writeFile(join(opts.outDir, 'index.html'), indexHtml(opts))
  await writeFile(join(opts.outDir, 'capacitor.config.ts'), capacitorConfig(opts))
  await writeFile(join(opts.outDir, '.env'), dotEnv(opts))
  await writeFile(join(opts.outDir, 'src/main.ts'), mainTs(opts))
  await writeFile(join(opts.outDir, 'src/App.vue'), appVue())
  await writeFile(join(opts.outDir, 'src/router/index.ts'), routerTs(opts))
  await writeFile(join(opts.outDir, 'src/composables/useApi.ts'), useApiTs(opts))
  await writeFile(join(opts.outDir, 'src/assets/main.css'), mainCss(opts))
  await writeFile(join(opts.outDir, 'public/favicon.ico'), '')

  if (opts.staticMode) {
    await writeFile(join(opts.outDir, 'src/assets/pagesData.ts'), pagesDataTs(opts))
    await writeFile(join(opts.outDir, 'src/assets/images.ts'), imagesTs(opts))
    await writeFile(join(opts.outDir, 'src/views/PublicPage.vue'), publicPageVueStatic(opts))
    await writeFile(join(opts.outDir, 'src/components/PageRenderer.vue'), pageRendererVueStatic(opts))
  } else {
    await writeFile(join(opts.outDir, 'src/views/PublicPage.vue'), publicPageVue(opts))
    await writeFile(join(opts.outDir, 'src/components/PageRenderer.vue'), pageRendererVue())
  }
}

// ── Template functions ─────────────────────────────────────────────────────

function pkgJson(opts: ScaffoldOptions): string {
  return JSON.stringify({
    name: `whoobe-mobile-${opts.websiteId.slice(0, 8)}`,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vue-tsc && vite build',
      preview: 'vite preview',
    },
    dependencies: {
      vue: '^3.5.0',
      'vue-router': '^4.5.0',
      alpinejs: '^3.16.0',
      '@alpinejs/collapse': '^3.16.0',
      '@lucide/vue': '^1.1.0',
      '@capacitor/core': '^7.0.0',
      '@capacitor/splash-screen': '^7.0.0',
      '@capacitor/status-bar': '^7.0.0',
      '@capacitor/push-notifications': '^7.0.0',
      '@tailwindcss/browser': '^4.0.0',
    },
    devDependencies: {
      '@vitejs/plugin-vue': '^5.0.0',
      vite: '^6.0.0',
      'vue-tsc': '^2.0.0',
      typescript: '^5.4.0',
      '@types/alpinejs': '^3.13.0',
      '@capacitor/cli': '^7.0.0',
      '@capacitor/android': '^7.0.0',
      '@capacitor/ios': '^7.0.0',
    },
  }, null, 2)
}

function viteConfig(): string {
  return `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './',
  define: {
    global: 'globalThis',
  },
})
`
}

function tsconfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      jsx: 'preserve',
      resolveJsonModule: true,
      isolatedModules: true,
      esModuleInterop: true,
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      skipLibCheck: true,
      noEmit: true,
      paths: { '@/*': ['./src/*'] },
    },
    include: ['src/**/*.ts', 'src/**/*.d.ts', 'src/**/*.vue'],
  }, null, 2)
}

function tsconfigNode(): string {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      resolveJsonModule: true,
      isolatedModules: true,
      esModuleInterop: true,
      skipLibCheck: true,
      noEmit: true,
    },
    include: ['vite.config.ts', 'capacitor.config.ts'],
  }, null, 2)
}

function envDts(): string {
  return `/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module 'alpinejs' {
  import type { Alpine as AlpineType } from 'alpinejs'
  const Alpine: AlpineType
  export default Alpine
}

declare module '@alpinejs/collapse' {
  const collapse: any
  export default collapse
}
`
}

function indexHtml(opts: ScaffoldOptions): string {
  const fontLinks = opts.fontFamilies
    .map((f) => `<link href="https://fonts.googleapis.com/css2?family=${f.replace(/ /g, '+')}:wght@300;400;500;600;700&display=swap" rel="stylesheet">`)
    .join('\n    ')
  return `<!DOCTYPE html>
<html lang="${opts.defaultLocale}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="${(opts.pwaConfig?.themeColor as string) ?? '#6366f1'}" />
    <title>${opts.appName}</title>
    ${fontLinks}
    <style id="theme-styles">${opts.themeCss}</style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`
}

function capacitorConfig(opts: ScaffoldOptions): string {
  const bgColor = (opts.pwaConfig?.backgroundColor as string) ?? '#ffffff'
  const themeColor = (opts.pwaConfig?.themeColor as string) ?? '#6366f1'
  return `import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: '${opts.appId}',
  appName: '${opts.appName}',
  webDir: 'dist',
  server: {
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '${bgColor}',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '${themeColor}',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
`
}

function dotEnv(opts: ScaffoldOptions): string {
  const gatewayBlock = opts.gatewayUrl ? `\nVITE_GATEWAY_URL=${opts.gatewayUrl}` : ''
  const siteKeyBlock = opts.siteApiKey ? `\nVITE_SITE_API_KEY=${opts.siteApiKey}` : ''
  return `# Whoobe CMS — mobile app configuration
# Generated by whoobe-mobile on ${new Date().toISOString()}

VITE_CORE_API_URL=${opts.apiUrl}
VITE_WEBSITE_ID=${opts.websiteId}
VITE_DEFAULT_LOCALE=${opts.defaultLocale}${gatewayBlock}${siteKeyBlock}
`
}

function mainTs(opts: ScaffoldOptions): string {
  // Runs in both static and CMS-backed builds: the native splash screen is a
  // separate Android/iOS view layered on top of the WebView (invisible to
  // chrome://inspect, which only ever sees the WebView's own content), so if
  // this never fires the splash stays on screen forever — the app looks like
  // a blank/black page on-device even though the page underneath loaded fine.
  const extra = `import { Capacitor } from '@capacitor/core'
const isNative = Capacitor.isNativePlatform()
if (isNative) {
  import('@capacitor/splash-screen').then(({ SplashScreen }) => SplashScreen.hide()).catch(() => {})
  import('@capacitor/status-bar').then(({ StatusBar }) => {
    ;(StatusBar as any).setStyle({ style: 'DARK' })
  }).catch(() => {})
}
`
  return `import { createApp } from 'vue'
import Alpine from 'alpinejs'
import Collapse from '@alpinejs/collapse'
import App from './App.vue'
import router from './router'
import './assets/main.css'

Alpine.plugin(Collapse)

;(async () => {
  const { default: tailwindUrl } = await import('@tailwindcss/browser?url')
  const s = document.createElement('script')
  s.src = tailwindUrl
  document.head.appendChild(s)
})()

;(window as any).Alpine = Alpine

const app = createApp(App)
app.use(router)
app.mount('#app')

Alpine.start()
${extra}
`
}

function appVue(): string {
  return `<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

// Hash-based routing is required here (Capacitor serves the app from a
// local origin with no server to fall back to for history-mode deep
// links), but it means Vue Router treats everything after the URL's '#'
// as its own route path. A same-page anchor link authored as href="#slide2"
// would otherwise be swallowed as a navigation to a non-existent route
// 'slide2' instead of scrolling to the element with that id. Intercepting
// the click before the browser changes location.hash (which is what the
// router actually listens to) and scrolling manually keeps in-page
// anchors working without giving up hash history.
function onAnchorClick(event: MouseEvent): void {
  const anchor = (event.target as HTMLElement | null)?.closest('a')
  const href = anchor?.getAttribute('href')
  if (!href || href.length < 2 || !href.startsWith('#')) return
  const target = document.getElementById(href.slice(1))
  if (!target) return
  event.preventDefault()
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(() => document.addEventListener('click', onAnchorClick))
onUnmounted(() => document.removeEventListener('click', onAnchorClick))
</script>
`
}

function routerTs(opts: ScaffoldOptions): string {
  const slugs = opts.appPageSlugs
  const homeSlug = slugs.find((s) => s === '/') ?? slugs[0] ?? '/'
  // All routes go through a single catch-all — PublicPage.vue fetches the
  // right page content from the CMS based on the current path. No redirect
  // needed (a redirect to '/' loops endlessly when '/' is the home slug).
  return `import { createRouter, createWebHashHistory } from 'vue-router'
import PublicPage from '../views/PublicPage.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/:pathMatch(.*)*', name: 'PublicPage', component: PublicPage },
  ],
})

export default router
`
}

function useApiTs(opts: ScaffoldOptions): string {
  const gatewayUrlInline = opts.gatewayUrl || ''
  const siteApiKeyInline = opts.siteApiKey || ''
  const siteIdInline = opts.websiteId
  const gatewayBlock = `\n
export function getGatewayUrl(): string {
  let url = (import.meta as any).env?.VITE_GATEWAY_URL as string | undefined
  if (!url) url = '${gatewayUrlInline}'
  return url
}

export function getSiteApiKey(): string {
  return (import.meta as any).env?.VITE_SITE_API_KEY || '${siteApiKeyInline}'
}

/** Gateway site-auth headers for public resolve/submit endpoints.
 *  Returns an empty object when no API key is configured — the Gateway
 *  falls back to binding-only checks in that case. */
export function getGatewayAuthHeaders(): Record<string, string> {
  const siteKey = getSiteApiKey()
  if (!siteKey) return {}
  return {
    'X-Whoobe-Site-Id': '${siteIdInline}',
    'X-Whoobe-Site-Key': siteKey,
  }
}`

  if (opts.staticMode) {
    return `export function getApiUrl(): string {
  return '${opts.apiUrl}'
}

export function getDefaultLocale(): string {
  return '${opts.defaultLocale}'
}

export function getRootPath(): string {
  return '${opts.rootPath}'
}${gatewayUrlInline || siteApiKeyInline ? gatewayBlock : ''}
`
  }
  return `import { Capacitor } from '@capacitor/core'

export function getApiUrl(): string {
  let url = (import.meta as any).env?.VITE_CORE_API_URL as string | undefined
  if (!url) {
    url = '${opts.apiUrl}'
  }
  // Android emulator maps 10.0.2.2 to the host machine — replace localhost
  // automatically so the app can reach core-api without manual .env editing.
  try {
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      const isNative = Capacitor.isNativePlatform()
      if (isNative) url = url.replace(/localhost|127\.0\.0\.1/g, '10.0.2.2')
    }
  } catch { /* fall through */ }
  return url
}

export function getWebsiteId(): string {
  return (import.meta as any).env?.VITE_WEBSITE_ID || '${opts.websiteId}'
}

export function getDefaultLocale(): string {
  return (import.meta as any).env?.VITE_DEFAULT_LOCALE || '${opts.defaultLocale}'
}

export function getRootPath(): string {
  return '${opts.rootPath}'
}

export function isNative(): boolean {
  try { return Capacitor.isNativePlatform() }
  catch { return false }
}

// Best-effort guess at the asset-processor's base URL from the CMS API URL:
// local dev runs it on a separate port (3002) alongside core-api (3003);
// production reverse-proxies both services behind the same public
// hostname, so the API URL itself is already correct there.
export function getAssetProcessorUrl(): string {
  const u = new URL(getApiUrl())
  if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.port) {
    u.port = '3002'
    return u.toString().replace(/\\/+$/, '')
  }
  return getApiUrl().replace(/\\/+$/, '')
}

export function getGatewayUrl(): string {
  let url = (import.meta as any).env?.VITE_GATEWAY_URL as string | undefined
  if (!url) url = '${gatewayUrlInline}'
  return url
}

export function getSiteApiKey(): string {
  return (import.meta as any).env?.VITE_SITE_API_KEY || '${siteApiKeyInline}'
}

/** Gateway site-auth headers for public resolve/submit endpoints.
 *  Returns an empty object when no API key is configured — the Gateway
 *  falls back to binding-only checks in that case. */
export function getGatewayAuthHeaders(): Record<string, string> {
  const siteKey = getSiteApiKey()
  if (!siteKey) return {}
  return {
    'X-Whoobe-Site-Id': '${siteIdInline}',
    'X-Whoobe-Site-Key': siteKey,
  }
}
`
}

function mainCss(opts: ScaffoldOptions): string {
  // Theme CSS (colors, an @import for Google Fonts, and any other custom
  // theme styles) is already inlined unwrapped in indexHtml()'s
  // <style id="theme-styles"> tag, which loads before this stylesheet.
  // Re-embedding opts.themeCss here too — which is what this used to do —
  // wrapped an @import (which CSS requires to precede every other
  // statement) inside a second, redundant @theme{} block, producing
  // invalid nested CSS.
  return `/* Tailwind v4 browser runtime is loaded via <script> in index.html */
/* Theme variables (colors, fonts, custom theme CSS) are inlined via index.html's <style id="theme-styles"> */

html, body, #app {
  background: #ffffff;
  min-height: 100vh;
}

body {
  font-family: ${opts.fontFamilies.map((f) => `"${f}"`).join(', ') || 'sans-serif'};
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Safe area insets for mobile devices */
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
  .pt-safe { padding-top: env(safe-area-inset-top); }
  .pl-safe { padding-left: env(safe-area-inset-left); }
  .pr-safe { padding-right: env(safe-area-inset-right); }
}
`
}

function pageRendererVue(): string {
  return `<template>
  <a v-if="node.link && isLucideIcon" :href="resolvedHref" :target="linkTarget">
    <component v-if="iconComponent" :id="node.anchor || node.id" :is="iconComponent" :class="classList" :style="styleList" v-bind="attrs" />
    <span v-else :id="node.anchor || node.id" :class="classList" :style="styleList"></span>
  </a>
  <a v-else-if="node.link && isImg" :href="resolvedHref" :target="linkTarget">
    <img :id="node.anchor || node.id" :src="imgSrc" :alt="imgAlt" :class="classList" :style="styleList" v-bind="attrs" />
  </a>
  <a v-else-if="node.link" :id="node.anchor || node.id" :href="resolvedHref" :target="linkTarget" :class="classList" :style="styleList" v-bind="attrs">
    <template v-if="hasBlocks">
      <PageRenderer v-for="child in node.blocks" :key="child.id" :node="child" />
    </template>
    <span v-else-if="hasContent" v-html="node.content"></span>
  </a>
  <component v-else-if="isLucideIcon && iconComponent" :id="node.anchor || node.id" :is="iconComponent" :class="classList" :style="styleList" v-bind="attrs" />
  <span v-else-if="isLucideIcon" :id="node.anchor || node.id" :class="classList" :style="styleList"></span>
  <img v-else-if="isImg" :id="node.anchor || node.id" :src="imgSrc" :alt="imgAlt" :class="classList" :style="styleList" v-bind="attrs" />
  <component v-else :id="node.anchor || node.id" :is="component" :class="classList" :style="styleList" v-bind="attrs">
    <template v-if="hasBlocks">
      <PageRenderer v-for="child in node.blocks" :key="child.id" :node="child" />
    </template>
    <span v-else-if="hasContent" v-html="node.content"></span>
  </component>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getApiUrl, getAssetProcessorUrl, getRootPath } from '../composables/useApi'

const props = defineProps<{ node: any }>()

const isImg = computed(() => props.node?.element === 'img' || props.node?.tag === 'img')
const isLucideIcon = computed(() => props.node?.tag === 'lucideicon')

// Internal links authored in the editor are stored as \`\${website.rootPath}\${page.slug}\`
// (e.g. "/en/app/home"), but this app's hash-router only ever registers
// routes at the bare slug ("/app/home") — so that prefix has to come off,
// and the result needs a leading '#' so the router (not the browser)
// handles the click. Already hash-formatted links ("#...", "/#..."),
// external links, and other URI schemes (mailto:, tel:) pass through
// unchanged — as does any '/'-prefixed link that does NOT start with this
// website's own rootPath, since that's not one of this app's own pages
// (most likely a cross-website link) and can't be resolved locally.
const resolvedHref = computed(() => {
  const link = props.node?.link
  if (!link) return undefined
  if (link.startsWith('#') || link.startsWith('/#') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(link) || link.startsWith('//')) return link
  const rootPath = getRootPath()
  if (rootPath && !link.startsWith(rootPath)) return link
  const stripped = rootPath ? link.slice(rootPath.length) : link
  return '#' + (stripped.startsWith('/') ? stripped : '/' + stripped)
})

// @lucide/vue exports every icon as a PascalCase named export, so a
// user-typed name ("arrow-right") must be normalized before lookup.
function toPascalCase(input: string): string {
  return input
    .trim()
    .split(/[^a-zA-Z0-9]+|(?<=[a-z])(?=[A-Z])/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join('')
}

let lucideIconsPromise: Promise<Record<string, any>> | null = null
function loadLucideIcons(): Promise<Record<string, any>> {
  if (!lucideIconsPromise) {
    lucideIconsPromise = import('@lucide/vue').then((m: any) => m.icons)
  }
  return lucideIconsPromise
}

const iconComponent = ref<any>(null)
watch(
  () => (isLucideIcon.value ? props.node?.content : null),
  (name) => {
    iconComponent.value = null
    if (name === null || name === undefined) return
    loadLucideIcons().then((icons) => {
      iconComponent.value = icons[toPascalCase(name)] ?? icons.HelpCircle
    })
  },
  { immediate: true }
)

const component = computed(() => {
  const el = props.node
  if (el.semantic) return el.semantic
  if (el.level) {
    const level = Number(el.level)
    return 'h' + (Number.isInteger(level) && level >= 1 && level <= 6 ? level : 1)
  }
  return el.tag === 'grid' ? 'div' : (el.tag || el.element || 'div')
})

const classList = computed(() => {
  const el = props.node
  const cssCss = el.css?.css || ''
  const cssContainer = el.css?.container || ''
  return (cssCss + ' ' + cssContainer).trim()
})

// Resolves a stored image reference (a real URL, a DAM asset UUID, or a
// Pimcore-style raw path) to a real, fetchable URL — mirrors
// resolveDisplayUrl in apps/whoobe-one-spike. A tiny per-reference cache
// avoids re-resolving the same asset in every node that uses it.
const ASSET_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const resolvedUrlCache: Record<string, string> = {}
// Pimcore path -> S3 object key, mirroring formatS3ObjectKey in
// packages/core/src/dam/storage.ts (assumes the default empty key
// prefix — never exposed by any public API for this to read instead).
function formatS3ObjectKey(pimcorePath: string): string {
  return pimcorePath.replace(/\\\\/g, '/').replace(/^\\/+/, '')
}
async function resolveImageRef(ref: string): Promise<string> {
  if (!ref || /^https?:\\/\\//.test(ref) || ref.startsWith('data:')) return ref
  if (resolvedUrlCache[ref]) return resolvedUrlCache[ref]
  try {
    if (ASSET_ID_RE.test(ref)) {
      const res = await fetch(getApiUrl().replace(/\\/+$/, '') + '/public/assets/' + ref)
      if (res.ok) {
        const body = await res.json()
        if (body.url) { resolvedUrlCache[ref] = body.url; return body.url }
      }
      return ''
    }
    if (ref.startsWith('/')) {
      // The DAM's own resolver (/api/v1/dam/asset-urls) requires an
      // authenticated editor session and can't be called from a plain
      // visitor's browser — but it just proxies to the public, unauthenticated
      // /dam-asset/:key route with a deterministically-derived key, so that's
      // reconstructed directly here instead.
      const url = getAssetProcessorUrl() + '/dam-asset/' + formatS3ObjectKey(ref)
      resolvedUrlCache[ref] = url
      return url
    }
  } catch {
    return ''
  }
  return ref
}

const resolvedBackgroundUrl = ref('')
watch(
  () => (!isImg.value && !isLucideIcon.value ? props.node?.image?.url : null),
  (url) => {
    resolvedBackgroundUrl.value = ''
    if (!url) return
    resolveImageRef(url).then((resolved) => { resolvedBackgroundUrl.value = resolved })
  },
  { immediate: true }
)

const styleList = computed(() => {
  const el = props.node
  let st = ''
  if (!isImg.value && !isLucideIcon.value && el.image?.url && resolvedBackgroundUrl.value) {
    st += 'background-image:url(' + resolvedBackgroundUrl.value + ');'
  }
  if (el.font) {
    st += 'font-family:"' + el.font.replace(/\\+/g, ' ') + '";'
  }
  return st + (el.style || '')
})

const resolvedImgSrc = ref('')
watch(
  () => (isImg.value ? (props.node?.image?.url || props.node?.src || '') : null),
  (url) => {
    resolvedImgSrc.value = ''
    if (!url) return
    resolveImageRef(url).then((resolved) => { resolvedImgSrc.value = resolved })
  },
  { immediate: true }
)

const imgSrc = computed(() => resolvedImgSrc.value)

const imgAlt = computed(() => {
  return props.node?.image?.alt || ''
})

const linkTarget = computed(() => {
  return props.node?.linkTarget || undefined
})

// Alpine evaluates directive values as JS expressions, so a bare Tailwind
// class typed into an x-bind:class value would throw a SyntaxError at
// render time; wrap anything that doesn't parse as JS in quotes so it's
// treated as a plain string instead (mirrors safeAlpineValue in
// apps/whoobe-one-spike/src/helpers.ts).
function safeAlpineValue(value: string, name = ''): string {
  // x-transition:*, x-teleport and x-ref hold class lists, a selector and a name, not JavaScript: leave them as typed
  if (name.startsWith('x-transition:') || name === 'x-ref' || name === 'x-teleport' || name.startsWith('x-teleport.')) return value
  try {
    new Function('return ' + value)
    return value
  } catch {
    return "'" + value.replace(/'/g, "\\\\'") + "'"
  }
}

const attrs = computed(() => {
  const el = props.node
  const result: Record<string, any> = {}
  if (el.alpine) {
    for (const key of Object.keys(el.alpine)) {
      result[key] = safeAlpineValue(el.alpine[key] || '', key)
    }
  }
  if (el.data?.attributes) {
    for (const key of Object.keys(el.data.attributes)) {
      if (!['class', 'style', 'ref', 'data-id', 'data-type'].includes(key)) {
        result[key] = el.data.attributes[key]
      }
    }
  }
  return result
})

const hasBlocks = computed(() => {
  const b = props.node?.blocks
  return Array.isArray(b) && b.length > 0
})

const hasContent = computed(() => {
  const el = props.node
  if (el?.type === 'container') return false
  const c = el?.content
  return c !== null && c !== undefined
})
</script>
`
}

function publicPageVue(_opts: ScaffoldOptions): string {
  return `<template>
  <div v-if="loading" class="p-8 text-center text-gray-400 text-sm">Loading\u2026</div>
  <div v-else-if="error" class="p-8 text-center text-rose-400 text-sm whitespace-pre-line">{{ errorMsg }}</div>
  <template v-else-if="pageContent">
    <div v-if="layout?.header" :class="'whoobe-header ' + (layout.header.className || '')" :style="layout.header.style || ''" v-bind="slotAlpine(layout.header.alpine)">
      <PageRenderer v-for="p in layout.header.pages || []" :key="p.id" :node="p.content" />
    </div>
    <div class="whoobe-page" v-bind="slotAlpine(layout?.body?.alpine)">
      <PageRenderer :node="pageContent" />
    </div>
    <div v-if="layout?.footer" :class="'whoobe-footer ' + (layout.footer.className || '')" :style="layout.footer.style || ''" v-bind="slotAlpine(layout.footer.alpine)">
      <PageRenderer v-for="p in layout.footer.pages || []" :key="p.id" :node="p.content" />
    </div>
  </template>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getApiUrl, getWebsiteId, getDefaultLocale, isNative } from '../composables/useApi'
import PageRenderer from '../components/PageRenderer.vue'

const loading = ref(true)
const error = ref(false)
const errorMsg = ref('')
const pageContent = ref<any>(null)
const layout = ref<any>(null)

// Alpine evaluates directive values as JS expressions; wrap anything that
// doesn't parse as JS in quotes so it's treated as a plain string instead
// (mirrors safeAlpineValue in apps/whoobe-one-spike/src/helpers.ts).
function safeAlpineValue(value: string, name = ''): string {
  // x-transition:*, x-teleport and x-ref hold class lists, a selector and a name, not JavaScript: leave them as typed
  if (name.startsWith('x-transition:') || name === 'x-ref' || name === 'x-teleport' || name.startsWith('x-teleport.')) return value
  try {
    new Function('return ' + value)
    return value
  } catch {
    return "'" + value.replace(/'/g, "\\\\'") + "'"
  }
}

function slotAlpine(alpine: Record<string, string> | null | undefined): Record<string, string> {
  if (!alpine) return {}
  const result: Record<string, string> = {}
  for (const key of Object.keys(alpine)) {
    result[key] = safeAlpineValue(alpine[key] || '', key)
  }
  return result
}

onMounted(async () => {
  try {
    const apiUrl = getApiUrl()
    const websiteId = getWebsiteId()
    const locale = getDefaultLocale()
    const route = useRoute()
    const path = route.path

    const res = await fetch(\`\${apiUrl}/public/pages/\${locale}\${path}?websiteId=\${websiteId}\`)
    if (!res.ok) {
      error.value = true
      errorMsg.value = \`Failed to load page (\${res.status})\`
      return
    }

    const data = await res.json()

    pageContent.value = data.page?.content ?? null
    layout.value = data.layout ?? null
    if (data.page?.seo?.metaTitle) {
      document.title = data.page.seo.metaTitle
    } else if (data.page?.title) {
      document.title = data.page.title
    }
  } catch (e: any) {
    error.value = true
    errorMsg.value = 'Cannot reach the CMS.\\n\\n' + (
      isNative()
        ? \`For Android emulator:\\n1. Ensure core-api is running (check http://10.0.2.2:3003/public/websites)\\n2. Rebuild: npm run build && npx cap sync\\n3. If still failing, edit .env and set VITE_CORE_API_URL to your machine's IP\`
        : \`Check that:\\n1. The CMS is running (pnpm run dev)\\n2. The API URL is correct in .env\`
    )
  } finally {
    loading.value = false
  }
})

watch([pageContent, layout], () => {
  nextTick(() => {
    if (!(window as any).Alpine) return
    for (const sel of ['.whoobe-page', '.whoobe-header', '.whoobe-footer']) {
      const el = document.querySelector(sel)
      if (el) (window as any).Alpine.initTree(el)
    }
  })
})
</script>
`
}

function pagesDataTs(opts: ScaffoldOptions): string {
  const entries: string[] = []
  for (const [key, entry] of Object.entries(opts.pagesData)) {
    const content = JSON.stringify(entry.content)
    const seo = JSON.stringify(entry.seo)
    const layout = JSON.stringify(entry.layout ?? null)
    entries.push(`  "${key}": { content: ${content}, title: ${JSON.stringify(entry.title)}, seo: ${seo}, layout: ${layout} }`)
  }
  return `export interface PageEntry {
  content: unknown
  title: string
  seo: Record<string, unknown> | null
  layout: Record<string, unknown> | null
}

export const pagesData: Record<string, PageEntry> = {
${entries.join(',\n')},
}
`
}

function imagesTs(opts: ScaffoldOptions): string {
  if (Object.keys(opts.imagesMap).length === 0) {
    return 'export const images: Record<string, string> = {}\n'
  }
  const entries: string[] = []
  for (const [url, dataUri] of Object.entries(opts.imagesMap)) {
    entries.push(`  ${JSON.stringify(url)}: ${JSON.stringify(dataUri)}`)
  }
  return `export const images: Record<string, string> = {
${entries.join(',\n')},
}
`
}

function pageRendererVueStatic(opts: ScaffoldOptions): string {
  const hasImages = Object.keys(opts.imagesMap).length > 0
  if (!hasImages) {
    return pageRendererVue()
  }
  return `<template>
  <a v-if="node.link && isLucideIcon" :href="resolvedHref" :target="linkTarget">
    <component v-if="iconComponent" :id="node.anchor || node.id" :is="iconComponent" :class="classList" :style="styleList" v-bind="attrs" />
    <span v-else :id="node.anchor || node.id" :class="classList" :style="styleList"></span>
  </a>
  <a v-else-if="node.link && isImg" :href="resolvedHref" :target="linkTarget">
    <img :id="node.anchor || node.id" :src="imgSrc" :alt="imgAlt" :class="classList" :style="styleList" v-bind="attrs" />
  </a>
  <a v-else-if="node.link" :id="node.anchor || node.id" :href="resolvedHref" :target="linkTarget" :class="classList" :style="styleList" v-bind="attrs">
    <template v-if="hasBlocks">
      <PageRenderer v-for="child in node.blocks" :key="child.id" :node="child" />
    </template>
    <span v-else-if="hasContent" v-html="node.content"></span>
  </a>
  <component v-else-if="isLucideIcon && iconComponent" :id="node.anchor || node.id" :is="iconComponent" :class="classList" :style="styleList" v-bind="attrs" />
  <span v-else-if="isLucideIcon" :id="node.anchor || node.id" :class="classList" :style="styleList"></span>
  <img v-else-if="isImg" :id="node.anchor || node.id" :src="imgSrc" :alt="imgAlt" :class="classList" :style="styleList" v-bind="attrs" />
  <component v-else :id="node.anchor || node.id" :is="component" :class="classList" :style="styleList" v-bind="attrs">
    <template v-if="hasBlocks">
      <PageRenderer v-for="child in node.blocks" :key="child.id" :node="child" />
    </template>
    <span v-else-if="hasContent" v-html="node.content"></span>
  </component>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { images } from '../assets/images'
import { getRootPath } from '../composables/useApi'

const props = defineProps<{ node: any }>()

const isImg = computed(() => props.node?.element === 'img' || props.node?.tag === 'img')
const isLucideIcon = computed(() => props.node?.tag === 'lucideicon')

// Internal links authored in the editor are stored as \`\${website.rootPath}\${page.slug}\`
// (e.g. "/en/app/home"), but this app's hash-router only ever registers
// routes at the bare slug ("/app/home") — so that prefix has to come off,
// and the result needs a leading '#' so the router (not the browser)
// handles the click. Already hash-formatted links ("#...", "/#..."),
// external links, and other URI schemes (mailto:, tel:) pass through
// unchanged — as does any '/'-prefixed link that does NOT start with this
// website's own rootPath, since that's not one of this app's own pages
// (most likely a cross-website link) and can't be resolved locally.
const resolvedHref = computed(() => {
  const link = props.node?.link
  if (!link) return undefined
  if (link.startsWith('#') || link.startsWith('/#') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(link) || link.startsWith('//')) return link
  const rootPath = getRootPath()
  if (rootPath && !link.startsWith(rootPath)) return link
  const stripped = rootPath ? link.slice(rootPath.length) : link
  return '#' + (stripped.startsWith('/') ? stripped : '/' + stripped)
})

// @lucide/vue exports every icon as a PascalCase named export, so a
// user-typed name ("arrow-right") must be normalized before lookup.
function toPascalCase(input: string): string {
  return input
    .trim()
    .split(/[^a-zA-Z0-9]+|(?<=[a-z])(?=[A-Z])/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join('')
}

let lucideIconsPromise: Promise<Record<string, any>> | null = null
function loadLucideIcons(): Promise<Record<string, any>> {
  if (!lucideIconsPromise) {
    lucideIconsPromise = import('@lucide/vue').then((m: any) => m.icons)
  }
  return lucideIconsPromise
}

const iconComponent = ref<any>(null)
watch(
  () => (isLucideIcon.value ? props.node?.content : null),
  (name) => {
    iconComponent.value = null
    if (name === null || name === undefined) return
    loadLucideIcons().then((icons) => {
      iconComponent.value = icons[toPascalCase(name)] ?? icons.HelpCircle
    })
  },
  { immediate: true }
)

const component = computed(() => {
  const el = props.node
  if (el.semantic) return el.semantic
  if (el.level) {
    const level = Number(el.level)
    return 'h' + (Number.isInteger(level) && level >= 1 && level <= 6 ? level : 1)
  }
  return el.tag === 'grid' ? 'div' : (el.tag || el.element || 'div')
})

const classList = computed(() => {
  const el = props.node
  const cssCss = el.css?.css || ''
  const cssContainer = el.css?.container || ''
  return (cssCss + ' ' + cssContainer).trim()
})

const styleList = computed(() => {
  const el = props.node
  let st = ''
  if (!isImg.value && !isLucideIcon.value && el.image?.url && images[el.image.url]) {
    st += 'background-image:url(' + images[el.image.url] + ');'
  }
  if (el.font) {
    st += 'font-family:"' + el.font.replace(/\\+/g, ' ') + '";'
  }
  return st + (el.style || '')
})

const imgSrc = computed(() => {
  const el = props.node
  const url = el.image?.url || el.src || ''
  return images[url] || url
})

const imgAlt = computed(() => {
  return props.node?.image?.alt || ''
})

const linkTarget = computed(() => {
  return props.node?.linkTarget || undefined
})

// Alpine evaluates directive values as JS expressions, so a bare Tailwind
// class typed into an x-bind:class value would throw a SyntaxError at
// render time; wrap anything that doesn't parse as JS in quotes so it's
// treated as a plain string instead (mirrors safeAlpineValue in
// apps/whoobe-one-spike/src/helpers.ts).
function safeAlpineValue(value: string, name = ''): string {
  // x-transition:*, x-teleport and x-ref hold class lists, a selector and a name, not JavaScript: leave them as typed
  if (name.startsWith('x-transition:') || name === 'x-ref' || name === 'x-teleport' || name.startsWith('x-teleport.')) return value
  try {
    new Function('return ' + value)
    return value
  } catch {
    return "'" + value.replace(/'/g, "\\\\'") + "'"
  }
}

const attrs = computed(() => {
  const el = props.node
  const result: Record<string, any> = {}
  if (el.alpine) {
    for (const key of Object.keys(el.alpine)) {
      result[key] = safeAlpineValue(el.alpine[key] || '', key)
    }
  }
  if (el.data?.attributes) {
    for (const key of Object.keys(el.data.attributes)) {
      if (!['class', 'style', 'ref', 'data-id', 'data-type'].includes(key)) {
        result[key] = el.data.attributes[key]
      }
    }
  }
  return result
})

const hasBlocks = computed(() => {
  const b = props.node?.blocks
  return Array.isArray(b) && b.length > 0
})

const hasContent = computed(() => {
  const el = props.node
  if (el?.type === 'container') return false
  const c = el?.content
  return c !== null && c !== undefined
})
</script>
`
}

function publicPageVueStatic(opts: ScaffoldOptions): string {
  return `<template>
  <div v-if="pageContent" v-bind="slotAlpine(layout?.body?.alpine)">
    <div v-if="layout?.header" :class="'whoobe-header ' + (layout.header.className || '')" :style="layout.header.style || ''" v-bind="slotAlpine(layout.header.alpine)">
      <PageRenderer v-for="p in layout.header.pages || []" :key="p.id" :node="p.content" />
    </div>
    <div class="whoobe-page">
      <PageRenderer :node="pageContent" />
    </div>
    <div v-if="layout?.footer" :class="'whoobe-footer ' + (layout.footer.className || '')" :style="layout.footer.style || ''" v-bind="slotAlpine(layout.footer.alpine)">
      <PageRenderer v-for="p in layout.footer.pages || []" :key="p.id" :node="p.content" />
    </div>
  </div>
  <div v-else class="p-8 text-center text-rose-400 text-sm">
    Page not found
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getDefaultLocale } from '../composables/useApi'
import { pagesData } from '../assets/pagesData'
import PageRenderer from '../components/PageRenderer.vue'

const route = useRoute()

const entry = computed(() => {
  const locale = getDefaultLocale()
  const path = route.path
  const exact = pagesData[locale + ':' + path]
  if (exact) return exact
  const other = Object.keys(pagesData).find((key) => key.endsWith(':' + path))
  return other ? pagesData[other] : undefined
})

const pageContent = computed(() => entry.value?.content ?? null)

const layout = computed(() => (entry.value?.layout ?? null) as any)

// Alpine evaluates directive values as JS expressions; wrap anything that
// doesn't parse as JS in quotes so it's treated as a plain string instead
// (mirrors safeAlpineValue in apps/whoobe-one-spike/src/helpers.ts).
function safeAlpineValue(value: string, name = ''): string {
  // x-transition:*, x-teleport and x-ref hold class lists, a selector and a name, not JavaScript: leave them as typed
  if (name.startsWith('x-transition:') || name === 'x-ref' || name === 'x-teleport' || name.startsWith('x-teleport.')) return value
  try {
    new Function('return ' + value)
    return value
  } catch {
    return "'" + value.replace(/'/g, "\\\\'") + "'"
  }
}

function slotAlpine(alpine: Record<string, string> | null | undefined): Record<string, string> {
  if (!alpine) return {}
  const result: Record<string, string> = {}
  for (const key of Object.keys(alpine)) {
    result[key] = safeAlpineValue(alpine[key] || '', key)
  }
  return result
}

watch(
  () => entry.value,
  (e) => {
    if (e?.seo?.metaTitle) {
      document.title = e.seo.metaTitle as string
    } else if (e?.title) {
      document.title = e.title
    }
  },
  { immediate: true }
)

function initAlpine(): void {
  nextTick(() => {
    if (!(window as any).Alpine) return
    for (const sel of ['.whoobe-page', '.whoobe-header', '.whoobe-footer']) {
      const el = document.querySelector(sel)
      if (el) (window as any).Alpine.initTree(el)
    }
  })
}

onMounted(initAlpine)
watch(layout, initAlpine)
</script>
`
}