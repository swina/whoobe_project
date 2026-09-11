import { mkdir, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { ApiClient } from '@whoobe-cms/renderer'

export interface GenerateOptions {
  apiUrl: string
  websiteId: string
  outDir: string
  framework: 'next' | 'vue' | 'svelte'
  revalidate: number
  domain?: string
  assetBaseUrl?: string
}

export async function generateNextSite(options: GenerateOptions): Promise<void> {
  const { apiUrl, websiteId, outDir, framework, revalidate, domain, assetBaseUrl } = options
  const client = new ApiClient(apiUrl)

  // Determine asset base: explicit > domain-derived > api-url-derived
  const assetDomain = assetBaseUrl ?? (() => {
    if (domain) {
      const u = new URL(apiUrl)
      return `${u.protocol}//${domain}${u.port ? ':' + u.port : ''}`
    }
    return apiUrl
  })()

  console.log(`Fetching website ${websiteId}...`)
  try {
    const websiteData = await client.getWebsite(websiteId)
    const website = websiteData.website as Record<string, unknown>
    const themes = (websiteData.themes ?? []) as Array<{ id: string; name: string; colors: { name: string; hex: string }[]; fonts: string[]; styles?: string; tailwindClasses?: string }>
    const defaultThemeId = websiteData.defaultThemeId as string | null

    console.log('Fetching published pages...')
    const pages = await client.listPages(websiteId)

    console.log(`Found ${pages.length} pages. Extracting Tailwind classes...`)
    const classSet = new Set<string>()
    for (const page of pages) {
      collectClasses(page.content, classSet)
    }
    for (const theme of themes) {
      if (theme.tailwindClasses) {
        for (const cls of theme.tailwindClasses.split(/\s+/)) {
          if (cls) classSet.add(cls)
        }
      }
    }

    const safelist = [...classSet].sort()
    const themeCss = themes.map((t) => generateThemeCss(t, t.id === defaultThemeId)).join('\n')
    const themeRawStyles = themes.map((t) => stripThemeBlock(t.styles ?? '')).filter(Boolean).join('\n')
    const fontFamilies = collectFonts(themes, defaultThemeId)
    const homePaths = computeHomePaths(pages)
    const supportedLocales = (website.supportedLocales as string[]) ?? [website.defaultLocale ?? 'en']
    const defaultLocale = (website.defaultLocale as string) ?? 'en'
    const singleLocale = supportedLocales.length <= 1

    console.log('Scaffolding project...')
    await scaffoldNextSite({
      outDir,
      apiUrl,
      websiteId,
      website,
      safelist,
      themeCss,
      themeRawStyles,
      fontFamilies,
      pages,
      homePaths,
      singleLocale,
      defaultLocale,
      revalidate,
      domain,
      assetBaseUrl: assetDomain,
    })

    console.log(`\nDone! Generated project at: ${outDir}`)
    console.log('Next steps:')
    console.log(`  cd ${outDir}`)
    console.log('  pnpm install')
    console.log('  pnpm build')
    console.log('  pnpm start          # or deploy to Vercel')
  } catch (error: unknown) {
    const err = error as Error & { cause?: { code?: string } }
    let detail = err instanceof Error ? err.message : String(error)
    const cause = err.cause as { code?: string } | undefined
    if (cause?.code === 'ENOTFOUND') {
      detail = `DNS lookup failed for "${apiUrl}" — check the host resolves. In local dev, the API runs on port 3003 (e.g. http://whoobecms.local:3003), not 3000.`
    } else if (cause?.code === 'ECONNREFUSED') {
      detail = `Connection refused for "${apiUrl}" — is the core-api running on that host/port? (core-api is on port 3003, e.g. http://whoobecms.local:3003)`
    } else if (cause?.code === 'ERR_TLS_CERT_ALTNAME_INVALID' || cause?.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
      detail = `TLS certificate issue for "${apiUrl}" — the server's certificate doesn't match.`
    }
    console.error(`Unable to contact the CMS API at "${apiUrl}". ${detail}`)
    console.error('Confirm the API URL and that it points to the core-api service, not the admin dashboard.')
    throw error
  }
}

// --- Class extraction ---

function collectClasses(content: unknown, set: Set<string>): void {
  if (!content || typeof content !== 'object') return
  const node = content as Record<string, unknown>
  if (typeof node.css === 'object' && node.css) {
    const css = node.css as Record<string, unknown>
    if (typeof css.css === 'string') splitAndAdd(css.css, set)
    if (typeof css.container === 'string') splitAndAdd(css.container, set)
  }
  const blocks = node.blocks
  if (Array.isArray(blocks)) {
    for (const child of blocks) collectClasses(child, set)
  }
}

function splitAndAdd(s: string, set: Set<string>): void {
  for (const cls of s.split(/\s+/)) {
    const t = cls.trim()
    if (t) set.add(t)
  }
}

// --- Theme CSS generation ---

/** Extracts CSS variable declarations (--name: value) from a CSS string,
 *  typically from inside an @theme block. */
function extractCssVars(css: string): string {
  const lines: string[] = []
  for (const line of css.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('--') && trimmed.includes(':')) {
      lines.push(trimmed)
    }
  }
  return lines.join('\n')
}

function generateThemeCss(theme: { name: string; colors: { name: string; hex: string }[]; styles?: string }, isDefault: boolean): string {
  const lines: string[] = []
  // Collect API-level colors first (these take precedence)
  const apiColorNames = new Set<string>()
  if (theme.colors.length > 0) {
    for (const c of theme.colors) {
      const safeName = c.name.replace(/[^a-zA-Z0-9_-]/g, '')
      lines.push(`  --color-${safeName}: ${c.hex};`)
      apiColorNames.add(safeName)
    }
  }
  // Extract CSS vars from theme.styles (some themes keep everything in styles)
  if (theme.styles) {
    const vars = extractCssVars(theme.styles)
    if (vars) {
      for (const v of vars.split('\n')) {
        const trimmed = v.trim()
        // Skip color vars already set from API
        const colorMatch = trimmed.match(/^--color-([^:]+):/)
        if (colorMatch && apiColorNames.has(colorMatch[1])) continue
        lines.push(`  ${trimmed}`)
      }
    }
  }
  return lines.join('\n')
}

/** Strips the @theme { ... } block (with nested braces) from a CSS string.
 *  Also strips @import and @tailwind directives. Returns the rest. */
function stripThemeBlock(styles: string): string {
  let s = styles
    .replace(/@import\s+url\([^)]+\)\s*;?/gi, '')
    .replace(/@import\s+"[^"]+"\s*;?/g, '')
    .replace(/@tailwind\s+[^;]+;/g, '')
  // Brace-counting to remove @theme { ... } with arbitrary nesting
  let result = ''
  let i = 0
  while (i < s.length) {
    if (s[i] === '@' && s.slice(i, i + 6) === '@theme' && !/[a-zA-Z]/.test(s[i - 1] ?? ' ')) {
      let depth = 1
      i += 6
      while (i < s.length && depth > 0) {
        if (s[i] === '{') depth++
        else if (s[i] === '}') depth--
        i++
      }
      continue
    }
    result += s[i]
    i++
  }
  return result.trim()
}

function collectFonts(themes: Array<{ id?: string; name: string; fonts: string[] }>, defaultThemeId: string | null): string[] {
  const fonts = new Set<string>()
  const defaultTheme = themes.find((t) => t.name === defaultThemeId || t.id === defaultThemeId)
  if (defaultTheme) {
    for (const f of defaultTheme.fonts) fonts.add(f)
  }
  for (const theme of themes) {
    for (const f of theme.fonts) fonts.add(f)
  }
  return [...fonts]
}

/** Converts a font name from Google-Fonts-URL form to CSS font-family form.
 *  Theme fonts are stored with '+' for spaces (e.g. "Alfa+Slab+One"), but
 *  the @font-face declared by Google Fonts uses the spaced family name. */
function fontFamily(f: string): string {
  return f.replace(/\+/g, ' ')
}

// --- Scaffolding ---

interface ScaffoldOptions {
  outDir: string
  apiUrl: string
  websiteId: string
  website: Record<string, unknown>
  safelist: string[]
  themeCss: string
  /** Raw CSS from theme.styles with @theme/@import stripped, to append after the @theme block. */
  themeRawStyles: string
  fontFamilies: string[]
  pages: Array<{ locale: string; slug: string; title: string }>
  homePaths: Record<string, string>
  revalidate: number
  domain?: string
  assetBaseUrl?: string
  /** When only one locale is configured, routes are clean (/{slug} instead of /{locale}/{slug}). */
  singleLocale: boolean
  defaultLocale: string
}

/** Determines the home page path for each locale. Tries '/' first (now that
 *  schema validation accepts null fields), falls back to '/home' then first page. */
function computeHomePaths(pages: Array<{ locale: string; slug: string }>): Record<string, string> {
  const byLocale = new Map<string, string[]>()
  for (const p of pages) {
    const arr = byLocale.get(p.locale) ?? []
    arr.push(p.slug)
    byLocale.set(p.locale, arr)
  }
  const home: Record<string, string> = {}
  for (const [locale, slugs] of byLocale) {
    // Try '/' first since schema now handles nullable fields, then /home by convention, else first page
    const homePage = slugs.find((s) => s === '/') ?? slugs.find((s) => s === '/home') ?? slugs[0] ?? '/'
    home[locale] = homePage
  }
  return home
}

async function scaffoldNextSite(opts: ScaffoldOptions): Promise<void> {
  const singleLocale = opts.singleLocale
  const defaultLocale = opts.defaultLocale

  // Create directory structure — single locale gets clean /{slug} routes
  const slugDir = singleLocale ? 'app/[...slug]' : 'app/[locale]/[...slug]'
  const dirs = [slugDir, 'src/lib', 'public']
  if (!singleLocale) dirs.push('app/[locale]')
  for (const d of dirs) {
    await mkdir(join(opts.outDir, d), { recursive: true })
  }

  // Write files
  await writeFile(join(opts.outDir, 'package.json'), scaffoldPackageJson(opts))
  await writeFile(join(opts.outDir, 'tsconfig.json'), scaffoldTsconfig())
  await writeFile(join(opts.outDir, 'next.config.ts'), scaffoldNextConfig(opts))
  await writeFile(join(opts.outDir, 'postcss.config.mjs'), scaffoldPostcss())
  await writeFile(join(opts.outDir, 'tailwind.config.ts'), scaffoldTailwind(opts))
  await writeFile(join(opts.outDir, 'app/globals.css'), scaffoldGlobalsCss(opts))
  await writeFile(join(opts.outDir, 'app/layout.tsx'), scaffoldLayout(opts))
  await writeFile(join(opts.outDir, 'app/page.tsx'), scaffoldHomePage(opts))
  await writeFile(join(opts.outDir, 'app/sitemap.ts'), scaffoldSitemap(opts))
  await writeFile(join(opts.outDir, 'app/robots.ts'), scaffoldRobots(opts))

  if (singleLocale) {
    await writeFile(join(opts.outDir, 'app/[...slug]/page.tsx'), scaffoldCatchAllPageSingleLocale(opts))
  } else {
    await writeFile(join(opts.outDir, 'app/[locale]/page.tsx'), scaffoldLocalePage())
    await writeFile(join(opts.outDir, 'app/[locale]/[...slug]/page.tsx'), scaffoldCatchAllPage(opts))
  }

  await writeFile(join(opts.outDir, 'src/lib/api.ts'), scaffoldApi(opts))
  await writeFile(join(opts.outDir, 'src/lib/registry.ts'), scaffoldRegistry())
  await writeFile(join(opts.outDir, '.env.local'), scaffoldEnv(opts))
}

function scaffoldPackageJson(opts: ScaffoldOptions): string {
  // Resolve SDK paths relative to the generated site dir (e.g. ../../packages/sdk/next)
  const repoRoot = join(opts.outDir, '..', '..')
  const sdkDir = join(repoRoot, 'packages', 'sdk')
  const rel = (p: string) => relative(opts.outDir, p).replace(/\\/g, '/')
  return JSON.stringify({
    name: `whoobe-site-${opts.websiteId.slice(0, 8)}`,
    version: '0.1.0',
    private: true,
    scripts: {
      dev: 'next dev -p ${PORT:-3000} -H ${HOST:-0.0.0.0}',
      build: 'next build',
      start: 'next start -p ${PORT:-3000} -H ${HOST:-0.0.0.0}',
    },
    dependencies: {
      next: '^15.0.0',
      react: '^18.3.0',
      'react-dom': '^18.3.0',
      'lucide-react': '^0.400.0',
      '@whoobe-cms/next': `file:${rel(join(sdkDir, 'next'))}`,
      '@whoobe-cms/react': `file:${rel(join(sdkDir, 'react'))}`,
      '@whoobe-cms/renderer': `file:${rel(join(sdkDir, 'renderer'))}`,
      '@whoobe-cms/schema': `file:${rel(join(sdkDir, 'schema'))}`,
    },
    devDependencies: {
      '@types/node': '^20.0.0',
      '@types/react': '^18.3.0',
      '@types/react-dom': '^18.3.0',
      tailwindcss: '^4.0.0',
      '@tailwindcss/postcss': '^4.0.0',
      typescript: '^5.4.0',
    },
  }, null, 2)
}

function scaffoldTsconfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      lib: ['dom', 'dom.iterable', 'esnext'],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: 'preserve',
      incremental: true,
      plugins: [{ name: 'next' }],
      paths: { '@/*': ['./src/*'] },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'],
    exclude: ['node_modules'],
  }, null, 2)
}

function scaffoldNextConfig(opts: ScaffoldOptions): string {
  return `/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '${new URL(opts.apiUrl).hostname}',
        pathname: '/dam-asset/**',
      },
    ],
  },
  env: {
    CMS_API_URL: '${opts.apiUrl}',
    CMS_WEBSITE_ID: '${opts.websiteId}',
    CMS_REVALIDATE: '${opts.revalidate}',
    ${opts.domain ? `NEXT_PUBLIC_SITE_URL: 'https://${opts.domain}',` : ''}
  },
}

export default nextConfig
`
}

function scaffoldPostcss(): string {
  return `export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
`
}

function scaffoldTailwind(opts: ScaffoldOptions): string {
  return `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  safelist: [
${opts.safelist.map((c) => `    '${c}',`).join('\n')}
  ],
}
`
}

function scaffoldGlobalsCss(opts: ScaffoldOptions): string {
  const themeVars = opts.themeCss || ''
  const rawStyles = opts.themeRawStyles || ''
  const themeBlock = themeVars ? `@theme {\n${themeVars}\n}` : ''

  const fontCss = opts.fontFamilies.map((f) => `"${fontFamily(f)}"`).join(', ') || 'sans-serif'
  return [
    '@import "tailwindcss";',
    '',
    themeBlock,
    '',
    rawStyles,
    '',
    'body {',
    `  font-family: ${fontCss};`,
    '}',
    '',
  ].filter(Boolean).join('\n')
}

function scaffoldLayout(opts: ScaffoldOptions): string {
  const defaultLocale = (opts.website.defaultLocale as string) ?? 'en'
  const fontLinks = opts.fontFamilies
    .map((f) => `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${f.replace(/ /g, '+')}:wght@300;400;500;600;700&display=swap" />`)
    .join('\n    ')

  return `"use client"

import { WhoobeProvider, createWhoobeApi } from '@whoobe-cms/next'
import './globals.css'

const apiUrl = process.env.NEXT_PUBLIC_CMS_API_URL || ''
const assetBaseUrl = process.env.NEXT_PUBLIC_ASSET_BASE_URL || apiUrl
const api = createWhoobeApi(apiUrl)

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="${defaultLocale}">
      <head>
        <!-- Whoobe CMS custom styles are in globals.css (@theme block + raw) -->
        ${fontLinks}
      </head>
      <body>
        <WhoobeProvider api={api} assetBaseUrl={assetBaseUrl + '/dam-asset'}>
          {children}
        </WhoobeProvider>
      </body>
    </html>
  )
}
`
}

function scaffoldHomePage(opts: ScaffoldOptions): string {
  const defaultLocale = (opts.website.defaultLocale as string) ?? 'en'
  const homeSlug = opts.homePaths[defaultLocale] ?? '/'

  if (homeSlug === '/') {
    // There IS a page at slug '/' — render it directly via the catch-all,
    // catching schema/validation errors gracefully.
    return `import { getPageData } from '@whoobe-cms/next'
import { WhoobePage } from '@whoobe-cms/next'

export default async function HomePage() {
  try {
    const { descriptor, layout } = await getPageData('${defaultLocale}', '/', {
      baseUrl: process.env.CMS_API_URL!,
      websiteId: process.env.CMS_WEBSITE_ID,
      revalidate: parseInt(process.env.CMS_REVALIDATE || '60', 10),
      assetBaseUrl: (process.env.NEXT_PUBLIC_ASSET_BASE_URL || process.env.CMS_API_URL!) + '/dam-asset',
    })
    return <WhoobePage descriptor={descriptor} layout={layout} />
  } catch {
    return <div className="p-8 text-center text-gray-400">Home page not available</div>
  }
}
`
  }

  // No page at '/' — find the actual home page slug from the API at build time
  // and redirect to it. For single locale, redirect to /{slug}; otherwise /{locale}/{slug}.
  const actualHomePath = opts.singleLocale ? homeSlug : '/' + defaultLocale + homeSlug
  return `import { redirect } from 'next/navigation'

export default function HomePage() {
  redirect('${actualHomePath}')
}
`
}

function scaffoldLocalePage(): string {
  return `import { redirect } from 'next/navigation'
import { getPageData } from '@whoobe-cms/next'
import { WhoobePage } from '@whoobe-cms/next'
import { ApiClient } from '@whoobe-cms/renderer'

export default async function LocaleRootPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const api = new ApiClient(process.env.CMS_API_URL!)
  const pages = await api.listPages(process.env.CMS_WEBSITE_ID)
  const localPages = pages.filter((p) => p.locale === locale)

  // Try rendering a page at slug '/' directly. If schema fails, fall back.
  if (localPages.find((p) => p.slug === '/')) {
    try {
      const { descriptor, layout } = await getPageData(locale, '/', {
        baseUrl: process.env.CMS_API_URL!,
        websiteId: process.env.CMS_WEBSITE_ID,
        revalidate: parseInt(process.env.CMS_REVALIDATE || '60', 10),
        assetBaseUrl: (process.env.NEXT_PUBLIC_ASSET_BASE_URL || process.env.CMS_API_URL!) + '/dam-asset',
      })
      return <WhoobePage descriptor={descriptor} layout={layout} />
    } catch {
      // root page exists but content is invalid — fall through to redirect
    }
  }

  // Redirect to the first published page of this locale.
  const homeSlug = localPages[0]?.slug ?? 'home'
  const path = homeSlug.startsWith('/') ? homeSlug.slice(1) : homeSlug
  redirect('/' + locale + '/' + path)
}
`
}

function scaffoldCatchAllPage(_opts: ScaffoldOptions): string {
  return `import { getPageData, generateMetadataFromPage } from '@whoobe-cms/next'
import { WhoobePage } from '@whoobe-cms/next'
import { ApiClient } from '@whoobe-cms/renderer'
import type { Metadata } from 'next'

export async function generateStaticParams() {
  const api = new ApiClient(process.env.CMS_API_URL!)
  const pages = await api.listPages(process.env.CMS_WEBSITE_ID)
  return pages
    .filter((p) => p.slug && p.slug !== '/')
    .map((p) => ({
      locale: p.locale || 'en',
      slug: (p.slug.startsWith('/') ? p.slug.slice(1) : p.slug).split('/').filter(Boolean),
    }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string[] }> }): Promise<Metadata> {
  const { locale, slug } = await params
  const path = '/' + slug.join('/')
  const apiUrl = process.env.CMS_API_URL!
  const websiteId = process.env.CMS_WEBSITE_ID
  const revalidate = parseInt(process.env.CMS_REVALIDATE || '60', 10)

  try {
    const { page } = await getPageData(locale, path, {
      baseUrl: apiUrl,
      websiteId,
      revalidate,
      assetBaseUrl: (process.env.NEXT_PUBLIC_ASSET_BASE_URL || apiUrl) + '/dam-asset',
    })
    return generateMetadataFromPage(page, apiUrl)
  } catch {
    return {}
  }
}

export default async function CatchAllPage({ params }: { params: Promise<{ locale: string; slug: string[] }> }) {
  const { locale, slug } = await params
  const path = '/' + slug.join('/')
  const apiUrl = process.env.CMS_API_URL!
  const websiteId = process.env.CMS_WEBSITE_ID
  const revalidate = parseInt(process.env.CMS_REVALIDATE || '60', 10)

  try {
    const { descriptor, layout } = await getPageData(locale, path, {
      baseUrl: apiUrl,
      websiteId,
      revalidate,
      assetBaseUrl: (process.env.NEXT_PUBLIC_ASSET_BASE_URL || apiUrl) + '/dam-asset',
    })
    return <WhoobePage descriptor={descriptor} layout={layout} />
  } catch {
    return <div className="p-8 text-center text-gray-400">Page not found</div>
  }
}
`
}

function scaffoldCatchAllPageSingleLocale(opts: ScaffoldOptions): string {
  const defaultLocale = opts.defaultLocale
  return `import { getPageData, generateMetadataFromPage } from '@whoobe-cms/next'
import { WhoobePage } from '@whoobe-cms/next'
import { ApiClient } from '@whoobe-cms/renderer'
import type { Metadata } from 'next'

export async function generateStaticParams() {
  const api = new ApiClient(process.env.CMS_API_URL!)
  const pages = await api.listPages(process.env.CMS_WEBSITE_ID)
  return pages
    .filter((p) => p.slug && p.slug !== '/')
    .map((p) => ({
      slug: (p.slug.startsWith('/') ? p.slug.slice(1) : p.slug).split('/').filter(Boolean),
    }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const { slug } = await params
  const path = '/' + slug.join('/')
  const apiUrl = process.env.CMS_API_URL!
  const websiteId = process.env.CMS_WEBSITE_ID
  const revalidate = parseInt(process.env.CMS_REVALIDATE || '60', 10)

  try {
    const { page } = await getPageData('${defaultLocale}', path, {
      baseUrl: apiUrl,
      websiteId,
      revalidate,
      assetBaseUrl: (process.env.NEXT_PUBLIC_ASSET_BASE_URL || apiUrl) + '/dam-asset',
    })
    return generateMetadataFromPage(page, apiUrl)
  } catch {
    return {}
  }
}

export default async function CatchAllPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  const path = '/' + slug.join('/')
  const apiUrl = process.env.CMS_API_URL!
  const websiteId = process.env.CMS_WEBSITE_ID
  const revalidate = parseInt(process.env.CMS_REVALIDATE || '60', 10)

  try {
    const { descriptor, layout } = await getPageData('${defaultLocale}', path, {
      baseUrl: apiUrl,
      websiteId,
      revalidate,
      assetBaseUrl: (process.env.NEXT_PUBLIC_ASSET_BASE_URL || apiUrl) + '/dam-asset',
    })
    return <WhoobePage descriptor={descriptor} layout={layout} />
  } catch {
    return <div className="p-8 text-center text-gray-400">Page not found</div>
  }
}
`
}

function scaffoldSitemap(opts: ScaffoldOptions): string {
  const domain = opts.domain ?? new URL(opts.apiUrl).hostname
  const urlPattern = opts.singleLocale
    ? "'https://' + '${domain}' + '/' + slug"
    : "'https://' + '${domain}' + '/' + locale + '/' + slug"
  return `import { ApiClient } from '@whoobe-cms/renderer'
import type { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const api = new ApiClient(process.env.CMS_API_URL!)
  const pages = await api.listPages(process.env.CMS_WEBSITE_ID)

  return pages
    .filter((p) => p.slug !== '')
    .flatMap((p) => {
      const locale = p.locale || 'en'
      const slug = p.slug === '/' ? '' : p.slug.startsWith('/') ? p.slug.slice(1) : p.slug
      const updatedAt = typeof p.updatedAt === 'string' ? p.updatedAt : undefined
      return {
        url: ${urlPattern},
        lastModified: updatedAt ? new Date(updatedAt) : new Date(),
        changeFrequency: 'weekly' as const,
        priority: slug === '' ? 1.0 : 0.7,
      }
    })
}
`
}

function scaffoldRobots(opts: ScaffoldOptions): string {
  const domain = opts.domain ?? new URL(opts.apiUrl).hostname
  return `import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: 'https://' + '${domain}' + '/sitemap.xml',
  }
}
`
}

function scaffoldApi(opts: ScaffoldOptions): string {
  return `import { ApiClient } from '@whoobe-cms/renderer'

export const api = new ApiClient(process.env.CMS_API_URL!)

export const siteConfig = {
  apiUrl: process.env.CMS_API_URL!,
  websiteId: process.env.CMS_WEBSITE_ID!,
  revalidate: parseInt(process.env.CMS_REVALIDATE || '60', 10),
  ${opts.domain ? `domain: '${opts.domain}',` : ''}
}
`
}

function scaffoldRegistry(): string {
  return `import { defaults, type Registry } from '@whoobe-cms/next'

// Custom component overrides can be added here.
// Example:
// import MyContainer from '@/components/MyContainer'
// const overrides: Partial<Registry> = { container: MyContainer }

export function createRegistry(): Registry {
  return { ...defaults }
}
`
}

function scaffoldEnv(opts: ScaffoldOptions): string {
  const assetBase = opts.assetBaseUrl ?? opts.apiUrl

  return `# Whoobe CMS — published site configuration
# Generated by whoobe-publish on ${new Date().toISOString()}

CMS_API_URL=${opts.apiUrl}
CMS_WEBSITE_ID=${opts.websiteId}
CMS_REVALIDATE=${opts.revalidate}
NEXT_PUBLIC_CMS_API_URL=${opts.apiUrl}
NEXT_PUBLIC_WEBSITE_ID=${opts.websiteId}
NEXT_PUBLIC_ASSET_BASE_URL=${assetBase}
${opts.domain ? `NEXT_PUBLIC_SITE_URL=https://${opts.domain}` : ''}
`
}

// --- Nuxt scaffolding ---

export async function generateNuxtSite(options: GenerateOptions): Promise<void> {
  const { apiUrl, websiteId, outDir, revalidate, domain, assetBaseUrl } = options
  const client = new ApiClient(apiUrl)

  const assetDomain = assetBaseUrl ?? (() => {
    if (domain) {
      const u = new URL(apiUrl)
      return `${u.protocol}//${domain}${u.port ? ':' + u.port : ''}`
    }
    return apiUrl
  })()

  console.log(`Fetching website ${websiteId}...`)
  try {
    const websiteData = await client.getWebsite(websiteId)
    const website = websiteData.website as Record<string, unknown>
    const themes = (websiteData.themes ?? []) as Array<{ id: string; name: string; colors: { name: string; hex: string }[]; fonts: string[]; styles?: string; tailwindClasses?: string }>
    const defaultThemeId = websiteData.defaultThemeId as string | null

    console.log('Fetching published pages...')
    const pages = await client.listPages(websiteId)

    console.log(`Found ${pages.length} pages. Extracting Tailwind classes...`)
    const classSet = new Set<string>()
    for (const page of pages) {
      collectClasses(page.content, classSet)
    }
    for (const theme of themes) {
      if (theme.tailwindClasses) {
        for (const cls of theme.tailwindClasses.split(/\s+/)) {
          if (cls) classSet.add(cls)
        }
      }
    }

    const safelist = [...classSet].sort()
    const themeCss = themes.map((t) => generateThemeCss(t, t.id === defaultThemeId)).join('\n')
    const themeRawStyles = themes.map((t) => stripThemeBlock(t.styles ?? '')).filter(Boolean).join('\n')
    const fontFamilies = collectFonts(themes, defaultThemeId)
    const homePaths = computeHomePaths(pages)
    const supportedLocales = (website.supportedLocales as string[]) ?? [website.defaultLocale ?? 'en']
    const defaultLocale = (website.defaultLocale as string) ?? 'en'
    const singleLocale = supportedLocales.length <= 1

    console.log('Scaffolding Nuxt project...')
    await scaffoldNuxtSite({
      outDir,
      apiUrl,
      websiteId,
      website,
      safelist,
      themeCss,
      themeRawStyles,
      fontFamilies,
      pages,
      homePaths,
      singleLocale,
      defaultLocale,
      revalidate,
      domain,
      assetBaseUrl: assetDomain,
    })

    console.log(`\nDone! Generated Nuxt project at: ${outDir}`)
    console.log('Next steps:')
    console.log(`  cd ${outDir}`)
    console.log('  pnpm install')
    console.log('  pnpm dev          # start dev server')
    console.log('  pnpm generate     # static export (recommended)')
    console.log('  pnpm build        # full SSR build')
  } catch (error: unknown) {
    const err = error as Error & { cause?: { code?: string } }
    let detail = err instanceof Error ? err.message : String(error)
    const cause = err.cause as { code?: string } | undefined
    if (cause?.code === 'ENOTFOUND') {
      detail = `DNS lookup failed for "${apiUrl}" — check the host resolves.`
    } else if (cause?.code === 'ECONNREFUSED') {
      detail = `Connection refused for "${apiUrl}" — is the core-api running on that host/port?`
    } else if (cause?.code === 'ERR_TLS_CERT_ALTNAME_INVALID' || cause?.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
      detail = `TLS certificate issue for "${apiUrl}".`
    }
    console.error(`Unable to contact the CMS API at "${apiUrl}". ${detail}`)
    console.error('Confirm the API URL and that it points to the core-api service.')
    throw error
  }
}

async function scaffoldNuxtSite(opts: ScaffoldOptions): Promise<void> {
  const singleLocale = opts.singleLocale

  const dirs = ['pages', 'composables', 'assets/css', 'public', 'server/routes']
  if (!singleLocale) dirs.push('pages/[locale]')
  for (const d of dirs) {
    await mkdir(join(opts.outDir, d), { recursive: true })
  }

  await writeFile(join(opts.outDir, 'package.json'), nuxtPackageJson(opts))
  await writeFile(join(opts.outDir, 'nuxt.config.ts'), nuxtConfig(opts))
  await writeFile(join(opts.outDir, 'tsconfig.json'), nuxtTsconfig())
  await writeFile(join(opts.outDir, 'app.vue'), nuxtAppVue(opts))
  await writeFile(join(opts.outDir, 'assets/css/main.css'), nuxtGlobalsCss(opts))
  await writeFile(join(opts.outDir, 'public/safelist.html'), nuxtSafelistHtml(opts))
  await writeFile(join(opts.outDir, 'composables/useWhoobeApi.ts'), nuxtComposable())
  await writeFile(join(opts.outDir, 'pages/index.vue'), nuxtHomePage(opts))
  await writeFile(join(opts.outDir, 'server/routes/sitemap.xml.ts'), nuxtSitemap(opts))
  await writeFile(join(opts.outDir, 'server/routes/robots.txt.ts'), nuxtRobots(opts))

  if (singleLocale) {
    await writeFile(join(opts.outDir, 'pages/[...slug].vue'), nuxtCatchAllPage(opts))
  } else {
    await writeFile(join(opts.outDir, 'pages/[locale]/index.vue'), nuxtLocalePage())
    await writeFile(join(opts.outDir, 'pages/[locale]/[...slug].vue'), nuxtCatchAllPageMulti())
  }

  await writeFile(join(opts.outDir, '.env'), nuxtEnv(opts))
}

function nuxtPackageJson(opts: ScaffoldOptions): string {
  const repoRoot = join(opts.outDir, '..', '..')
  const sdkDir = join(repoRoot, 'packages', 'sdk')
  const rel = (p: string) => relative(opts.outDir, p).replace(/\\/g, '/')
  return JSON.stringify({
    name: `whoobe-site-${opts.websiteId.slice(0, 8)}`,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'nuxi dev',
      build: 'nuxi build',
      generate: 'nuxi generate',
      preview: 'nuxi preview',
    },
    dependencies: {
      nuxt: '^3.15.0',
      vue: '^3.5.0',
      'vue-router': '^4.5.0',
      '@whoobe-cms/nuxt': `file:${rel(join(sdkDir, 'nuxt'))}`,
      '@whoobe-cms/vue': `file:${rel(join(sdkDir, 'vue'))}`,
      '@whoobe-cms/renderer': `file:${rel(join(sdkDir, 'renderer'))}`,
      '@whoobe-cms/schema': `file:${rel(join(sdkDir, 'schema'))}`,
    },
    devDependencies: {
      tailwindcss: '^4.0.0',
      '@tailwindcss/vite': '^4.0.0',
      typescript: '^5.4.0',
    },
  }, null, 2)
}

function nuxtConfig(opts: ScaffoldOptions): string {
  return `// https://nuxt.com/docs/api/nuxt-config
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-09-10',
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  nitro: {
    prerender: {
      crawlLinks: true,
    },
  },
  runtimeConfig: {
    public: {
      cmsApiUrl: '${opts.apiUrl}',
      cmsWebsiteId: '${opts.websiteId}',
      cmsAssetBaseUrl: '${opts.assetBaseUrl ?? opts.apiUrl}',
      cmsDefaultLocale: '${opts.defaultLocale}',
      cmsRevalidate: ${opts.revalidate},
      ${opts.domain ? `siteUrl: 'https://${opts.domain}',` : ''}
    },
  },
  app: {
    head: {
      link: ${JSON.stringify(opts.fontFamilies.map((f) => ({
        rel: 'stylesheet',
        href: `https://fonts.googleapis.com/css2?family=${f.replace(/ /g, '+')}:wght@300;400;500;600;700&display=swap`,
      })))},
      meta: [
        { name: 'whoobe-custom-styles', content: 'globals.css (@theme block + raw)' },
      ],
    },
  },
})
`
}

function nuxtTsconfig(): string {
  return JSON.stringify({
    extends: './.nuxt/tsconfig.json',
    compilerOptions: {
      strict: true,
      types: ['nuxt'],
    },
  }, null, 2)
}

function nuxtAppVue(opts: ScaffoldOptions): string {
  const defaultLocale = (opts.website.defaultLocale as string) ?? 'en'
  const fontFamilies = opts.fontFamilies
  const fontFamilyCss = fontFamilies.map((f) => `"${fontFamily(f)}"`).join(', ') || 'sans-serif'
  return `<template>
  <WhoobeProvider :api="api" :assetBaseUrl="assetBaseUrl + '/dam-asset'">
    <div>
      <NuxtPage />
    </div>
  </WhoobeProvider>
</template>

<script setup lang="ts">
import { WhoobeProvider, createWhoobeApi } from '@whoobe-cms/nuxt'

const config = useRuntimeConfig()
const apiUrl = config.public.cmsApiUrl
const assetBaseUrl = config.public.cmsAssetBaseUrl || apiUrl
const api = createWhoobeApi(apiUrl)

useHead({
  htmlAttrs: { lang: '${defaultLocale}' },
  bodyAttrs: { style: 'font-family: ${fontFamilyCss};' },
})
</script>
`
}

function nuxtGlobalsCss(opts: ScaffoldOptions): string {
  const themeVars = opts.themeCss || ''
  const rawStyles = opts.themeRawStyles || ''
  const themeBlock = themeVars ? `@theme {\n${themeVars}\n}` : ''
  const fontCss = opts.fontFamilies.map((f) => `"${fontFamily(f)}"`).join(', ') || 'sans-serif'

  return [
    '@import "tailwindcss";',
    '',
    themeBlock,
    '',
    rawStyles,
    '',
    'body {',
    `  font-family: ${fontCss};`,
    '}',
    '',
  ].filter(Boolean).join('\n')
}

/** Writes all extracted Tailwind classes into an HTML file so Tailwind v4's
 *  JIT scanner detects them (classes come from CMS data, not source code). */
function nuxtSafelistHtml(opts: ScaffoldOptions): string {
  const lines: string[] = []
  // Group into blocks of ~20 to keep lines readable
  for (let i = 0; i < opts.safelist.length; i += 20) {
    const chunk = opts.safelist.slice(i, i + 20)
    lines.push(`  <div class="${chunk.join(' ')}"></div>`)
  }
  return `<html>\n<body>\n${lines.join('\n')}\n</body>\n</html>\n`
}

function nuxtHomePage(opts: ScaffoldOptions): string {
  const defaultLocale = (opts.website.defaultLocale as string) ?? 'en'
  const homeSlug = opts.homePaths[defaultLocale] ?? '/'

  if (homeSlug === '/') {
    return `<template>
  <div class="whoobe-page">
    <WhoobePage :descriptor="data.descriptor" :layout="data.layout" />
  </div>
</template>

<script setup lang="ts">
import { getPageData, WhoobePage } from '@whoobe-cms/nuxt'

const config = useRuntimeConfig()
const { data } = await useAsyncData('home-page', () =>
  getPageData('${defaultLocale}', '/', {
    baseUrl: config.public.cmsApiUrl,
    websiteId: config.public.cmsWebsiteId,
    assetBaseUrl: (config.public.cmsAssetBaseUrl || config.public.cmsApiUrl) + '/dam-asset',
  })
)

if (data.value) {
  const seo = data.value.page.seo || {} as any
  useHead({ title: seo.metaTitle || data.value.page.title })
}
</script>
`
  }

  const actualHomePath = opts.singleLocale ? homeSlug : '/' + defaultLocale + homeSlug
  return `<template>
  <div />
</template>

<script setup lang="ts">
await navigateTo('${actualHomePath}')
</script>
`
}

function nuxtLocalePage(): string {
  return `<template>
  <div class="whoobe-page">
    <WhoobePage v-if="data" :descriptor="data.descriptor" :layout="data.layout" />
  </div>
</template>

<script setup lang="ts">
import { getPageData, WhoobePage } from '@whoobe-cms/nuxt'
import { ApiClient } from '@whoobe-cms/renderer'

const config = useRuntimeConfig()
const route = useRoute()
const locale = route.params.locale as string

const api = new ApiClient(config.public.cmsApiUrl)
const pages = await api.listPages(config.public.cmsWebsiteId)
const localPages = pages.filter((p) => p.locale === locale)

if (localPages.find((p) => p.slug === '/')) {
  const { data } = await useAsyncData(\`locale-\${locale}-home\`, () =>
    getPageData(locale, '/', {
      baseUrl: config.public.cmsApiUrl,
      websiteId: config.public.cmsWebsiteId,
      assetBaseUrl: (config.public.cmsAssetBaseUrl || config.public.cmsApiUrl) + '/dam-asset',
    })
  )
  if (data.value) {
    const seo = data.value.page.seo || {} as any
    useHead({ title: seo.metaTitle || data.value.page.title })
  }
} else {
  const homeSlug = localPages[0]?.slug ?? 'home'
  const path = homeSlug.startsWith('/') ? homeSlug.slice(1) : homeSlug
  await navigateTo('/' + locale + '/' + path)
}
</script>
`
}

function nuxtCatchAllPage(opts: ScaffoldOptions): string {
  const defaultLocale = opts.defaultLocale
  return `<template>
  <div class="whoobe-page">
    <WhoobePage :descriptor="data.descriptor" :layout="data.layout" />
  </div>
</template>

<script setup lang="ts">
import { getPageData, WhoobePage } from '@whoobe-cms/nuxt'

const config = useRuntimeConfig()
const route = useRoute()
const slug = (route.params.slug as string[]) || []
const path = '/' + slug.join('/')

const { data } = await useAsyncData(\`page-\${path}\`, () =>
  getPageData('${defaultLocale}', path, {
    baseUrl: config.public.cmsApiUrl,
    websiteId: config.public.cmsWebsiteId,
    assetBaseUrl: (config.public.cmsAssetBaseUrl || config.public.cmsApiUrl) + '/dam-asset',
  })
)

if (data.value) {
  const seo = data.value.page.seo || {} as any
  useHead({ title: seo.metaTitle || data.value.page.title })
}
</script>
`
}

function nuxtCatchAllPageMulti(): string {
  return `<template>
  <div class="whoobe-page">
    <WhoobePage :descriptor="data.descriptor" :layout="data.layout" />
  </div>
</template>

<script setup lang="ts">
import { getPageData, WhoobePage } from '@whoobe-cms/nuxt'

const config = useRuntimeConfig()
const route = useRoute()
const locale = route.params.locale as string
const slug = (route.params.slug as string[]) || []
const path = '/' + slug.join('/')

const { data } = await useAsyncData(\`page-\${locale}-\${path}\`, () =>
  getPageData(locale, path, {
    baseUrl: config.public.cmsApiUrl,
    websiteId: config.public.cmsWebsiteId,
    assetBaseUrl: (config.public.cmsAssetBaseUrl || config.public.cmsApiUrl) + '/dam-asset',
  })
)

if (data.value) {
  const seo = data.value.page.seo || {} as any
  useHead({ title: seo.metaTitle || data.value.page.title })
}
</script>
`
}

function nuxtSitemap(opts: ScaffoldOptions): string {
  const domain = opts.domain ?? new URL(opts.apiUrl).hostname
  const urlPattern = opts.singleLocale
    ? `'https://${domain}' + '/' + slug`
    : `'https://${domain}' + '/' + locale + '/' + slug`
  return `import { ApiClient } from '@whoobe-cms/renderer'

export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  const api = new ApiClient(config.public.cmsApiUrl)
  const pages = await api.listPages(config.public.cmsWebsiteId)

  const urls = pages
    .filter((p) => p.slug !== '')
    .flatMap((p) => {
      const locale = p.locale || 'en'
      const slug = p.slug === '/' ? '' : p.slug.startsWith('/') ? p.slug.slice(1) : p.slug
      return {
        url: ${urlPattern},
        lastModified: typeof p.updatedAt === 'string' ? p.updatedAt : undefined,
        changeFrequency: 'weekly',
        priority: slug === '' ? 1.0 : 0.7,
      }
    })

  const xml = \`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
\${urls.map((u) => \`  <url>
    <loc>\${u.url}</loc>
    <lastmod>\${u.lastModified || new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>\${u.changeFrequency}</changefreq>
    <priority>\${u.priority}</priority>
  </url>\`).join('\\n')}
</urlset>\`

  return xml
})
`
}

function nuxtRobots(opts: ScaffoldOptions): string {
  const domain = opts.domain ?? new URL(opts.apiUrl).hostname
  return `export default defineEventHandler(() => {
  return \`User-agent: *
Allow: /
Sitemap: https://${domain}/sitemap.xml
\`
})
`
}

function nuxtComposable(): string {
  return `import { ApiClient } from '@whoobe-cms/renderer'

export function useWhoobeApi() {
  const config = useRuntimeConfig()
  const api = new ApiClient(config.public.cmsApiUrl)

  return {
    api,
    apiUrl: config.public.cmsApiUrl,
    websiteId: config.public.cmsWebsiteId,
    revalidate: config.public.cmsRevalidate,
    assetBaseUrl: (config.public.cmsAssetBaseUrl || config.public.cmsApiUrl) + '/dam-asset',
  }
}
`
}

function nuxtEnv(opts: ScaffoldOptions): string {
  const assetBase = opts.assetBaseUrl ?? opts.apiUrl
  return `# Whoobe CMS — published site configuration (Nuxt)
# Generated by whoobe-publish on ${new Date().toISOString()}

NUXT_PUBLIC_CMS_API_URL=${opts.apiUrl}
NUXT_PUBLIC_CMS_WEBSITE_ID=${opts.websiteId}
NUXT_PUBLIC_CMS_REVALIDATE=${opts.revalidate}
NUXT_PUBLIC_CMS_ASSET_BASE_URL=${assetBase}
${opts.domain ? `NUXT_PUBLIC_SITE_URL=https://${opts.domain}` : ''}
`
}
