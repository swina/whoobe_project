import { mkdir, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { ApiClient } from '@whoobe-cms/renderer'

export interface GenerateOptions {
  apiUrl: string
  websiteId: string
  outDir: string
  domain?: string
  appName?: string
  appId?: string
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
  supportedLocales: string[]
  themeCss: string
  fontFamilies: string[]
  pwaConfig?: Record<string, unknown>
  /** Slugs of the app pages to include (kind === 'app'), used to filter
   *  the catch-all route so only app pages are rendered. */
  appPageSlugs: string[]
}

export async function generateMobileApp(options: GenerateOptions): Promise<void> {
  const { apiUrl, websiteId, outDir, domain, appName, appId } = options
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
  const defaultTheme = themes.find((t) => t.id === (defaultThemeId ?? themes[0]?.id)) ?? themes[0]
  const pwaConfig = ((website.pwaConfig as Record<string, unknown>) ?? {}) as Record<string, unknown>
  const finalAppName = appName ?? (pwaConfig.name as string) ?? websiteName
  const host = domain ?? new URL(apiUrl).hostname
  const slug = websiteId.slice(0, 8)
  const finalAppId = appId ?? `com.whoobe.mobile.${slug}`

  // Fetch published pages and filter to app-kind only
  console.log('Fetching published pages...')
  const allPages = await client.listPages(websiteId)
  const appPages = allPages.filter((p) => (p as any).kind === 'app')
  if (appPages.length === 0) {
    console.log('No app pages found for this website.')
    console.log('Generate some pages with kind "app" in the editor first.')
    throw new Error('No app pages found')
  }
  console.log(`Found ${appPages.length} app page(s):`)
  for (const p of appPages) {
    console.log(`  ${p.locale} ${p.slug} — ${p.title}`)
  }
  const appPageSlugs = appPages
    .filter((p) => p.locale === defaultLocale)
    .map((p) => p.slug)

  // Theme CSS for the generated app
  const colorVars = (defaultTheme?.colors ?? [])
    .map((c: { name: string; hex: string }) => `  --color-${c.name}: ${c.hex};`)
    .join('\n')
  const themeCss = defaultTheme ? `@theme {\n${colorVars}\n}\n\n${defaultTheme.styles ?? ''}` : ''
  const fontFamilies = defaultTheme?.fonts ?? []

  console.log('Generating mobile app project...')
  await scaffoldMobileApp({
    outDir,
    apiUrl,
    websiteId,
    websiteName,
    appName: finalAppName,
    appId: finalAppId,
    domain: host,
    defaultLocale,
    supportedLocales,
    themeCss,
    fontFamilies,
    pwaConfig,
    appPageSlugs,
  })

  console.log(`\nDone! Mobile app generated at: ${outDir}`)
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
  await writeFile(join(opts.outDir, 'src/views/PublicPage.vue'), publicPageVue(opts))
  await writeFile(join(opts.outDir, 'src/components/PageRenderer.vue'), pageRendererVue())
  await writeFile(join(opts.outDir, 'src/composables/useApi.ts'), useApiTs(opts))
  await writeFile(join(opts.outDir, 'src/assets/main.css'), mainCss(opts))
  await writeFile(join(opts.outDir, 'public/favicon.ico'), '')
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
      '@capacitor/core': '^7.0.0',
      '@capacitor/splash-screen': '^7.0.0',
      '@capacitor/status-bar': '^7.0.0',
      '@capacitor/push-notifications': '^7.0.0',
      '@capacitor/network': '^7.0.0',
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
  const androidUrl = opts.apiUrl
    .replace(/localhost/g, '10.0.2.2')
    .replace(/127\.0\.0\.1/g, '10.0.2.2')
  return `import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: '${opts.appId}',
  appName: '${opts.appName}',
  webDir: 'dist',
  server: {
    cleartext: process.env.NODE_ENV === 'development',
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
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
  return `# Whoobe CMS — mobile app configuration
# Generated by whoobe-mobile on ${new Date().toISOString()}

VITE_CORE_API_URL=${opts.apiUrl}
VITE_WEBSITE_ID=${opts.websiteId}
VITE_DEFAULT_LOCALE=${opts.defaultLocale}
`
}

function mainTs(_opts: ScaffoldOptions): string {
  return `import { createApp } from 'vue'
import Alpine from 'alpinejs'
import App from './App.vue'
import router from './router'
import './assets/main.css'

// Tailwind v4 browser runtime — same approach as whoobe-one-spike
;(async () => {
  const { default: tailwindUrl } = await import('@tailwindcss/browser?url')
  const s = document.createElement('script')
  s.src = tailwindUrl
  document.head.appendChild(s)
})()

;(window as any).Alpine = Alpine
Alpine.start()

import { Capacitor } from '@capacitor/core'
const isNative = Capacitor.isNativePlatform()
if (isNative) {
  import('@capacitor/splash-screen').then(({ SplashScreen }) => SplashScreen.hide())
  import('@capacitor/status-bar').then(({ StatusBar }) => {
    ;(StatusBar as any).setStyle({ style: 'DARK' })
  })
}

const app = createApp(App)
app.use(router)
app.mount('#app')
`
}

function appVue(): string {
  return `<template>
  <router-view />
</template>
`
}

function routerTs(opts: ScaffoldOptions): string {
  const slugs = opts.appPageSlugs
  const homeSlug = slugs.find((s) => s === '/') ?? slugs[0] ?? '/'
  const routes = slugs
    .filter((s) => s !== '/')
    .map((s) => `    { path: '${s}', name: '${s.replace(/[^a-zA-Z0-9]/g, '_')}', component: PublicPage },`)
    .join('\n')
  return `import { createRouter, createWebHashHistory } from 'vue-router'
import PublicPage from '../views/PublicPage.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '${homeSlug}' },
${routes}
    { path: '/:pathMatch(.*)*', name: 'PublicPage', component: PublicPage },
  ],
})

export default router
`
}

function useApiTs(opts: ScaffoldOptions): string {
  return `import { Capacitor } from '@capacitor/core'

export function getApiUrl(): string {
  let url = (import.meta as any).env?.VITE_CORE_API_URL as string | undefined
  if (!url) {
    url = '${opts.apiUrl}'
  }
  // Android emulator cannot reach host localhost — use 10.0.2.2 instead
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    url = url
      .replace(/\\blocalhost\\b/g, '10.0.2.2')
      .replace(/\\b127\\.0\\.0\\.1\\b/g, '10.0.2.2')
  }
  return url
}

export function getWebsiteId(): string {
  return (import.meta as any).env?.VITE_WEBSITE_ID || '${opts.websiteId}'
}

export function getDefaultLocale(): string {
  return (import.meta as any).env?.VITE_DEFAULT_LOCALE || '${opts.defaultLocale}'
}

export function isNative(): boolean {
  try { return Capacitor.isNativePlatform() }
  catch { return false }
}
`
}

function mainCss(opts: ScaffoldOptions): string {
  const themeBlock = opts.themeCss ? `@theme {\n${opts.themeCss}\n}` : ''
  return `/* Tailwind v4 browser runtime is loaded via <script> in index.html */
/* Theme variables are inlined in main.ts via a <style> tag */

${themeBlock}

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
  <img v-if="isImage" :src="imgSrc" :alt="imgAlt" :class="nodeClass" :style="nodeStyle" />
  <component :is="tag" v-else :class="nodeClass" :style="nodeStyle" v-bind="attrs">
    <template v-if="node.content && !hasBlocks">{{ node.content }}</template>
    <PageRenderer v-for="child in nodeBlocks" :key="child.id" :node="child" />
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ node: any }>()

const isImage = computed(() => props.node?.element === 'img' || props.node?.tag === 'img')
const imgSrc = computed(() => props.node?.image?.url || props.node?.src || '')
const imgAlt = computed(() => props.node?.image?.alt || props.node?.alt || '')

const tag = computed(() => {
  const t = props.node?.tag || props.node?.element || 'div'
  if (['p', 'h', 'span', 'button', 'input', 'textarea', 'a', 'ul', 'ol', 'li', 'header', 'footer', 'nav', 'section', 'main', 'aside'].includes(t)) return t
  return 'div'
})

const attrs = computed(() => {
  const a: Record<string, any> = {}
  if (props.node?.link) a.href = props.node.link
  if (props.node?.linkTarget) a.target = props.node.linkTarget
  return a
})

const nodeClass = computed(() => props.node?.css?.css || props.node?.className || '')
const nodeStyle = computed(() => props.node?.style || '')

const hasBlocks = computed(() => {
  const b = props.node?.blocks
  return Array.isArray(b) && b.length > 0
})

const nodeBlocks = computed(() => {
  const blocks = props.node?.blocks ?? []
  return Array.isArray(blocks) ? blocks : []
})
</script>
`
}

function publicPageVue(_opts: ScaffoldOptions): string {
  return `<template>
  <div v-if="loading" class="p-8 text-center text-gray-400 text-sm">Loading\u2026</div>
  <div v-else-if="error" class="p-8 text-center text-rose-400 text-sm whitespace-pre-line">{{ errorMsg }}</div>
  <div v-else-if="pageContent" class="whoobe-page">
    <PageRenderer :node="pageContent" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getApiUrl, getWebsiteId, getDefaultLocale, isNative } from '../composables/useApi'
import PageRenderer from '../components/PageRenderer.vue'

const loading = ref(true)
const error = ref(false)
const errorMsg = ref('')
const pageContent = ref<any>(null)

onMounted(async () => {
  try {
    const apiUrl = getApiUrl()
    const websiteId = getWebsiteId()
    const locale = getDefaultLocale()
    const route = useRoute()
    const path = route.path

    const res = await fetch(\`\${apiUrl}/public/pages/\${locale}/\${encodeURIComponent(path)}?websiteId=\${websiteId}\`)
    if (!res.ok) {
      error.value = true
      errorMsg.value = \`Failed to load page (\${res.status})\`
      return
    }

    const data = await res.json()
    const kind = data.page?.kind
    if (kind && kind !== 'app') {
      error.value = true
      errorMsg.value = 'This page is not available in the mobile app.'
      return
    }

    pageContent.value = data.page?.content ?? null
    if (data.page?.seo?.metaTitle) {
      document.title = data.page.seo.metaTitle
    } else if (data.page?.title) {
      document.title = data.page.title
    }
  } catch (e: any) {
    error.value = true
    errorMsg.value = isNative()
      ? \`Cannot reach the CMS.\\n\\nCheck that:\\n1. The CMS server is running\\n2. The API URL is correct\\n3. For Android emulator, forward WSL2 port:\\n   netsh interface portproxy add v4tov4\\n     listenport=3003 listenaddress=0.0.0.0\\n     connectport=3003 connectaddress=<WSL2-IP>\`
      : e?.message || 'Failed to load page'
  } finally {
    loading.value = false
  }
})
</script>
`
}