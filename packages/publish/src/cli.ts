import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { ApiClient } from '@whoobe-cms/renderer'
import { collectTreeClasses } from '@whoobe-cms/schema'

// --- Input hygiene -----------------------------------------------------------------------------------------
// Everything below ends up inside generated source files (TS, JS, CSS, HTML, shell, nginx) that are then BUILT
// and RUN on the operator's host or CI, and served to visitors. Two kinds of input reach them:
//  - options (CLI flags, or - for the admin's "generate PWA" route - request-derived values): validated, not escaped;
//  - CMS content (class names, theme fonts/colors, slugs, locales): written by editors, so never trusted and
//    always escaped or whitelisted at the point of use.

const HOSTNAME_RE = /^(?=.{1,253}(?::\d{1,5})?$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*(?::\d{1,5})?$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LOCALE_RE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/
const SITE_KEY_RE = /^[A-Za-z0-9_-]{8,128}$/
const BASE_PATH_RE = /^\/[A-Za-z0-9._~\-/]*$/

function assertSafeUrl(name: string, v: string): void {
  let ok = false
  try {
    const u = new URL(v)
    ok = (u.protocol === 'http:' || u.protocol === 'https:') && !/['"`\\<>\s]/.test(v)
  } catch { /* not a URL */ }
  if (!ok) throw new Error(`Invalid ${name}: must be an http(s) URL without quotes, backslashes, angle brackets or whitespace`)
}

/** Throws on any option that could break out of the generated files; returns the options unchanged otherwise. */
export function validateGenerateOptions<T extends GenerateOptions>(o: T): T {
  assertSafeUrl('apiUrl', o.apiUrl)
  if (o.gatewayUrl) assertSafeUrl('gatewayUrl', o.gatewayUrl)
  if (o.assetBaseUrl) assertSafeUrl('assetBaseUrl', o.assetBaseUrl)
  if (!UUID_RE.test(o.websiteId)) throw new Error('Invalid websiteId: expected a UUID')
  if (o.domain && !HOSTNAME_RE.test(o.domain)) throw new Error(`Invalid domain "${o.domain}": expected a host name (optionally with a port)`)
  if (o.basePath && !BASE_PATH_RE.test(o.basePath)) throw new Error('Invalid basePath: expected a path such as /blog (letters, digits, . _ ~ - /)')
  if (o.siteApiKey && !SITE_KEY_RE.test(o.siteApiKey)) throw new Error('Invalid siteApiKey: unexpected characters')
  if (!Number.isInteger(o.revalidate) || o.revalidate < 0) throw new Error('Invalid revalidate: expected a non-negative integer')
  return o
}

/** A locale from CMS data, or the fallback when it is not a plain BCP 47-style tag. */
export function safeLocale(v: unknown, fallback = 'en'): string {
  return typeof v === 'string' && LOCALE_RE.test(v) ? v : fallback
}

const FONT_NAME_RE = /^[\p{L}\p{N} _+.-]{1,64}$/u
const CSS_COLOR_RE = /^(?:#[0-9a-fA-F]{3,8}|(?:rgb|hsl|hwb|lab|lch|oklab|oklch)a?\([0-9a-zA-Z.,%\s/+-]{1,80}\)|[a-zA-Z]{3,24})$/

export const isSafeFontName = (f: unknown): f is string => typeof f === 'string' && FONT_NAME_RE.test(f)
export const isSafeCssColor = (c: unknown): c is string => typeof c === 'string' && CSS_COLOR_RE.test(c.trim())

/** Escapes a value for a double-quoted HTML attribute. */
export function escapeHtmlAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export interface VendoredSdkPackage {
  /** e.g. '@whoobe-cms/renderer'. */
  name: string
  /** Path to the packed .tgz, relative to outDir (e.g. 'vendor/whoobe-cms-renderer-0.1.0.tgz'). */
  relPath: string
}

/** SDK packages (relative to packages/sdk/) a generated site depends on,
 *  for each framework - includes every package in the internal dependency
 *  chain (not just the one directly imported in generated app code), since
 *  every one of them needs to be vendored + overridden for the site to
 *  install without the monorepo present (see packSdkDependencies). */
const SDK_PACKAGES_BY_FRAMEWORK: Record<'next' | 'vue', string[]> = {
  next: ['schema', 'renderer', 'react', 'next'],
  vue: ['schema', 'renderer', 'vue', 'nuxt'],
}

/** Packs the SDK packages a generated site depends on into real, portable
 *  npm tarballs (`pnpm pack`) instead of leaving `file:../../packages/sdk/
 *  ...` references into the monorepo. This is what actually makes a
 *  generated site buildable/deployable on ANY host - not even the monorepo
 *  itself is needed there, Docker included: `pnpm pack` rewrites each
 *  package's own internal `workspace:*` dependencies (e.g. @whoobe-cms/
 *  nuxt's own dependency on @whoobe-cms/renderer) to the real resolved
 *  version number inside the tarball's package.json - verified live before
 *  relying on it, not assumed. Without this, a generated site's
 *  package.json could only ever be installed from inside a real pnpm
 *  workspace containing these packages (this was this project's actual,
 *  more complicated state for a while - see CHANGES.md - until this was
 *  fixed in favor of the simpler, genuinely portable approach here).
 *  Pairs with each generated package.json's `pnpm.overrides` block (see
 *  scaffoldPackageJson/nuxtPackageJson) - without the override, a nested
 *  requirement like "@whoobe-cms/renderer@0.1.0" would still try to
 *  resolve from the public npm registry (where these packages don't
 *  exist) rather than reuse the local tarball - also verified live. */
async function packSdkDependencies(outDir: string, framework: 'next' | 'vue', monorepoRoot: string): Promise<VendoredSdkPackage[]> {
  // Absolute: `pnpm pack --pack-destination` (run with cwd set to each SDK
  // package's own directory, below) resolves a relative destination against
  // THAT cwd, not the original process's - a relative outDir here silently
  // wrote every tarball under packages/sdk/<pkg>/<outDir>/vendor instead of
  // <outDir>/vendor (found live: the site's own vendor/ came out empty).
  const vendorDir = resolve(join(outDir, 'vendor'))
  await mkdir(vendorDir, { recursive: true })
  const sdkDir = resolve(join(monorepoRoot, 'packages', 'sdk'))
  const packages = SDK_PACKAGES_BY_FRAMEWORK[framework]
  const result: VendoredSdkPackage[] = []
  for (const pkg of packages) {
    const pkgDir = join(sdkDir, pkg)
    const output = execFileSync('pnpm', ['pack', '--pack-destination', vendorDir], { cwd: pkgDir, encoding: 'utf-8' })
    const tarballPath = output.trim().split('\n').pop()!.trim()
    const pkgJson = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf-8')) as { name: string }
    result.push({ name: pkgJson.name, relPath: `vendor/${tarballPath.split('/').pop()}` })
  }
  return result
}

/** Builds the `dependencies` entries + the `pnpm.overrides` block for a
 *  generated site's package.json from its vendored SDK tarballs - every
 *  vendored package is overridden (not just the ones a quick read of the
 *  current dependency graph shows are needed) so this doesn't silently
 *  break if that graph changes later. */
function vendoredDependenciesAndOverrides(vendoredPackages: VendoredSdkPackage[]): {
  dependencies: Record<string, string>
  overrides: Record<string, string>
} {
  const dependencies: Record<string, string> = {}
  const overrides: Record<string, string> = {}
  for (const pkg of vendoredPackages) {
    const ref = `file:./${pkg.relPath}`
    dependencies[pkg.name] = ref
    overrides[pkg.name] = ref
  }
  return { dependencies, overrides }
}

/** pnpm 10+ no longer reads `pnpm.overrides` from package.json at all - even
 *  for a standalone (non-workspace) project - it must live in a
 *  pnpm-workspace.yaml `overrides:` map instead (see
 *  https://pnpm.io/settings#overrides). package.json's own `pnpm.overrides`
 *  is kept too (scaffoldPackageJson/nuxtPackageJson) since the site's
 *  Dockerfile pins pnpm 9 via corepack and older pnpm only reads it from
 *  there; this file covers a user running a newer global `pnpm install`
 *  directly on the generated site outside Docker. Found live: reproduced
 *  ERR_PNPM_FETCH_404 on @whoobe-cms/schema with pnpm 11 in a copy of the
 *  site outside the monorepo (no parent pnpm-workspace.yaml), even though
 *  package.json's pnpm.overrides was present and correct. */
function scaffoldPnpmWorkspaceYaml(overrides: Record<string, string>): string {
  const lines = ['packages: []', '', 'overrides:']
  for (const [name, ref] of Object.entries(overrides)) {
    lines.push(`  '${name}': '${ref}'`)
  }
  // pnpm 10+ also refuses to run a dependency's install/postinstall scripts
  // (e.g. esbuild's native-binary fetch) unless explicitly allowed, and
  // `pnpm build` fails outright with ERR_PNPM_IGNORED_BUILDS rather than just
  // warning - found live via the same standalone-site build. `esbuild` is
  // the one every framework here (Next/Vite/Nuxt/Nitro) pulls in transitively.
  lines.push('', 'allowBuilds:', '  esbuild: true')
  return lines.join('\n') + '\n'
}

export interface GenerateOptions {
  apiUrl: string
  websiteId: string
  outDir: string
  framework: 'next' | 'vue' | 'svelte'
  revalidate: number
  domain?: string
  assetBaseUrl?: string
  /** Base URL of the API Gateway (e.g. Brevo form submissions) reachable
   *  from the published site at runtime - without this, Gateway-backed
   *  forms/bindings fall back to a localhost-only URL and never work once
   *  deployed outside the CMS's own host. */
  gatewayUrl?: string
  /** Optional Gateway API key for this website (docs/plans/api-gateway/
   *  gateway-auth-authz.md) - written to a server-only env var, never a
   *  NEXT_PUBLIC_- or NUXT_PUBLIC_-prefixed one, so it never reaches the
   *  client bundle. Omit to rely on the mandatory gateway_bindings checks
   *  alone (this key is an optional second layer, not a replacement). */
  siteApiKey?: string
  /** Path prefix the site is mounted under behind nginx in production
   *  (e.g. '/blog'), independent from the CMS's own `websites.rootPath`
   *  (a different concept - multi-site routing within the CMS itself).
   *  Defaults to '/' (domain root) when omitted. */
  basePath?: string
  /** Monorepo root for resolving workspace SDK packages. Required when outDir
   *  is a temp directory outside the monorepo (e.g. /tmp/...). */
  monorepoRoot?: string
  /** When true, only include pages with kind === 'app' (PWA/mobile-only site). */
  appOnly?: boolean
}

export async function generateNextSite(rawOptions: GenerateOptions): Promise<void> {
  const options = validateGenerateOptions(rawOptions)
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
    // locales are CMS data: keep plain tags only, everything downstream (code, redirects, <html lang>) relies on it
    website.defaultLocale = safeLocale(website.defaultLocale)
    website.supportedLocales = ((website.supportedLocales as string[] | undefined) ?? [website.defaultLocale as string]).filter((l) => LOCALE_RE.test(l))
    const supportedLocales = website.supportedLocales as string[]
    const defaultLocale = website.defaultLocale as string
    const singleLocale = supportedLocales.length <= 1

    console.log('Packing SDK dependencies (makes the site installable anywhere, no monorepo needed)...')
    const monorepoRoot = options.monorepoRoot ?? join(outDir, '..', '..')
    const vendoredPackages = await packSdkDependencies(outDir, 'next', monorepoRoot)

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
      gatewayUrl: options.gatewayUrl,
      siteApiKey: options.siteApiKey,
      basePath: options.basePath,
      monorepoRoot: options.monorepoRoot,
      vendoredPackages,
    })

    console.log(`\nDone! Generated project at: ${outDir}`)
    console.log('Next steps:')
    console.log(`  cd ${outDir}`)
    console.log('  pnpm install')
    console.log('  pnpm build')
    console.log('  pnpm start          # or deploy to Vercel')
  } catch (error: unknown) {
    const err = error as Error & { cause?: { code?: string } }
    const cause = err.cause as { code?: string } | undefined
    // Only frame this as an API-connectivity problem when it demonstrably
    // is one (a fetch()-level cause code) - this whole try wraps the local
    // filesystem scaffold step too, and misdiagnosing e.g. an ENOENT while
    // writing a file as "can't reach the CMS API" wastes real debugging
    // time chasing the wrong cause (found live, not hypothetical).
    if (cause?.code === 'ENOTFOUND') {
      console.error(`Unable to contact the CMS API at "${apiUrl}". DNS lookup failed for "${apiUrl}" — check the host resolves. In local dev, the API runs on port 3003 (e.g. http://whoobecms.local:3003), not 3000.`)
      console.error('Confirm the API URL and that it points to the core-api service, not the admin dashboard.')
    } else if (cause?.code === 'ECONNREFUSED') {
      console.error(`Unable to contact the CMS API at "${apiUrl}". Connection refused for "${apiUrl}" — is the core-api running on that host/port? (core-api is on port 3003, e.g. http://whoobecms.local:3003)`)
      console.error('Confirm the API URL and that it points to the core-api service, not the admin dashboard.')
    } else if (cause?.code === 'ERR_TLS_CERT_ALTNAME_INVALID' || cause?.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
      console.error(`Unable to contact the CMS API at "${apiUrl}". TLS certificate issue for "${apiUrl}" — the server's certificate doesn't match.`)
      console.error('Confirm the API URL and that it points to the core-api service, not the admin dashboard.')
    } else {
      console.error(`Site generation failed: ${err instanceof Error ? err.message : String(error)}`)
    }
    throw error
  }
}

// --- Class extraction ---

/** Adds every Tailwind class the content asks for to `set` (the generated site's safelist). Reads all the class-bearing fields, not only
 *  `css.css` / `css.container`: the sections and columns of a table, a binding's pagination, a slider's navigation, a search box, and the
 *  default classes of the built-in slider and table components (packages/sdk/schema/src/class-fields.ts). */
export function collectClasses(content: unknown, set: Set<string>): void {
  collectTreeClasses(content, set)
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
      const safeName = String(c.name).replace(/[^a-zA-Z0-9_-]/g, '')
      // the value is written inside the @theme { } block: anything that is not a plain colour could close it
      if (!safeName || !isSafeCssColor(c.hex)) continue
      lines.push(`  --color-${safeName}: ${String(c.hex).trim()};`)
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
  // Brace-counting to remove @theme { ... } with arbitrary nesting.
  let result = ''
  let i = 0
  while (i < s.length) {
    if (s[i] === '@' && s.slice(i, i + 6) === '@theme' && !/[a-zA-Z]/.test(s[i - 1] ?? ' ')) {
      i += 6
      // Skip past any whitespace before the block's own opening brace -
      // depth starts at 0 and is incremented when that brace is actually
      // encountered below, not before: starting it at 1 here double-counted
      // the opening brace (once via this initial value, once when the loop
      // itself saw '{'), so depth never returned to 0 after the block's real
      // close - it kept decrementing into the rest of the file, silently
      // deleting everything after @theme{} instead of just the block itself
      // (found live: a theme's custom classes/rules past its @theme block
      // never survived into a published site at all).
      while (i < s.length && s[i] !== '{') i++
      let depth = 0
      while (i < s.length) {
        if (s[i] === '{') depth++
        else if (s[i] === '}') {
          depth--
          if (depth === 0) { i++; break }
        }
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
  // font names come from theme data and are written into CSS, HTML and URLs: plain names only
  const add = (f: unknown) => { if (isSafeFontName(f)) fonts.add(f) }
  if (defaultTheme) {
    for (const f of defaultTheme.fonts ?? []) add(f)
  }
  for (const theme of themes) {
    for (const f of theme.fonts ?? []) add(f)
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
  gatewayUrl?: string
  siteApiKey?: string
  basePath?: string
  /** When only one locale is configured, routes are clean (/{slug} instead of /{locale}/{slug}). */
  singleLocale: boolean
  defaultLocale: string
  /** PWA config from website.pwaConfig — { enabled, display, orientation, icons, ... }. */
  pwaConfig?: Record<string, unknown>
  /** Monorepo root for resolving workspace SDK packages. When not provided,
   *  defaults to two directories above outDir (legacy behaviour for
   *  sites/ subdirectory). When outDir is a temp directory outside the
   *  monorepo (e.g. /tmp/...), this must be set explicitly. */
  monorepoRoot?: string
  /** When true, only page with kind === 'app' are included. */
  appOnly?: boolean
  /** SDK packages packed into outDir/vendor/*.tgz - see packSdkDependencies. */
  vendoredPackages: VendoredSdkPackage[]
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
  const dirs = [slugDir, 'app/api/whoobe-gateway-submit', 'src/lib', 'public']
  if (!singleLocale) dirs.push('app/[locale]')
  for (const d of dirs) {
    await mkdir(join(opts.outDir, d), { recursive: true })
  }

  // Write files
  await writeFile(join(opts.outDir, 'package.json'), scaffoldPackageJson(opts))
  await writeFile(
    join(opts.outDir, 'pnpm-workspace.yaml'),
    scaffoldPnpmWorkspaceYaml(vendoredDependenciesAndOverrides(opts.vendoredPackages).overrides)
  )
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

  await writeFile(join(opts.outDir, 'app/api/whoobe-gateway-submit/route.ts'), scaffoldGatewaySubmitRoute())
  await writeFile(join(opts.outDir, 'src/lib/api.ts'), scaffoldApi(opts))
  await writeFile(join(opts.outDir, 'src/lib/registry.ts'), scaffoldRegistry())
  await writeFile(join(opts.outDir, '.env.local'), scaffoldEnv(opts), { mode: 0o600 })

  // Self-contained deploy (Docker + nginx) - see each function's own comment.
  await writeFile(join(opts.outDir, 'Dockerfile'), scaffoldDockerfile('next'))
  await writeFile(join(opts.outDir, 'nginx.conf'), scaffoldNginxConf(opts))
  await writeFile(join(opts.outDir, 'deploy.sh'), scaffoldDeployScript(opts, 'next'), { mode: 0o755 })
  await writeFile(join(opts.outDir, '.dockerignore'), scaffoldSiteDockerignore())
  // Static deploy (nginx-only, no Node at runtime) - Nuxt only for now
  await writeFile(join(opts.outDir, 'Dockerfile.static'), scaffoldDockerfileStatic('next'))
  await writeFile(join(opts.outDir, 'nginx-static.conf'), scaffoldNginxStaticConf('next'))
  await writeFile(join(opts.outDir, 'deploy-static.sh'), scaffoldDeployStaticScript(opts, 'next'), { mode: 0o755 })
}

function scaffoldPackageJson(opts: ScaffoldOptions): string {
  const { dependencies: vendoredDeps, overrides } = vendoredDependenciesAndOverrides(opts.vendoredPackages)
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
      ...vendoredDeps,
    },
    devDependencies: {
      '@types/node': '^20.0.0',
      '@types/react': '^18.3.0',
      '@types/react-dom': '^18.3.0',
      tailwindcss: '^4.0.0',
      '@tailwindcss/postcss': '^4.0.0',
      typescript: '^5.4.0',
    },
    // Forces every (including nested/transitive) resolution of these
    // package names to use the local tarball, instead of trying the public
    // npm registry (where they don't exist) for a nested "workspace:*"
    // dependency that `pnpm pack` already rewrote to a real version number
    // - see packSdkDependencies's own comment. Verified live: omitting this
    // fails with ERR_PNPM_FETCH_404 on the first nested package.
    pnpm: { overrides },
  }, null, 2)
}

/** Standalone, framework-agnostic Dockerfile - no reference to the
 *  monorepo at all (relies entirely on vendor/*.tgz, see
 *  packSdkDependencies), so it builds from this directory alone on any
 *  host with Docker. Next's `NEXT_PUBLIC_*` vars are inlined at build time
 *  (Next has no runtime env story for them), so they're declared as ARGs;
 *  Nuxt's `NUXT_PUBLIC_*` runtimeConfig is read at container start instead
 *  (see nuxtEnv's own comment), so no build ARGs are needed there. */
function scaffoldDockerfile(framework: 'next' | 'vue'): string {
  const nextArgs = framework === 'next'
    ? `ARG NEXT_PUBLIC_CMS_API_URL
ARG NEXT_PUBLIC_WEBSITE_ID
ARG NEXT_PUBLIC_ASSET_BASE_URL
ARG NEXT_PUBLIC_GATEWAY_URL
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_CMS_API_URL=$NEXT_PUBLIC_CMS_API_URL \\
    NEXT_PUBLIC_WEBSITE_ID=$NEXT_PUBLIC_WEBSITE_ID \\
    NEXT_PUBLIC_ASSET_BASE_URL=$NEXT_PUBLIC_ASSET_BASE_URL \\
    NEXT_PUBLIC_GATEWAY_URL=$NEXT_PUBLIC_GATEWAY_URL \\
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
`
    : ''
  return `# syntax=docker/dockerfile:1
# Standalone image for this published site - no monorepo checkout needed
# anywhere, on this host or any other: package.json's dependencies are
# vendor/*.tgz tarballs already bundled alongside this Dockerfile (see
# CHANGES.md - "pnpm pack" rewrites their own internal workspace:*
# references to real version numbers, so a plain \`pnpm install\` here
# resolves everything from this directory alone).
FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

FROM base AS build
COPY . .
${nextArgs}RUN pnpm install
RUN pnpm build

FROM base AS run
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app ./
USER 1000:1000
EXPOSE 3000
CMD ["pnpm", "start"]
`
}

/** Location path for the nginx proxy block - a trailing slash so nginx
 *  strips the matched prefix before forwarding (needed whenever basePath
 *  isn't '/', to match the framework's own basePath/app.baseURL already
 *  having stripped it from its own asset URLs - see scaffoldNextConfig/
 *  nuxtConfig). */
function nginxLocationPath(basePath: string): string {
  const trimmed = basePath.trim() || '/'
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

/** nginx server block for this site - domain and base path are already
 *  known at publish time, so both are baked in directly; only the
 *  container's host port is left as a __PORT__ placeholder, substituted by
 *  deploy.sh at actual deploy time (a port is a deploy-time choice, chosen
 *  by whoever deploys, never auto-detected). Self-contained: doesn't
 *  depend on anything in the monorepo. */
function scaffoldNginxConf(opts: ScaffoldOptions): string {
  const domain = opts.domain || '_'
  const locationBlock = (basePath: string) => `${nginxLocationPath(basePath)} {
        proxy_pass http://127.0.0.1:__PORT__/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }`
  return `server {
    listen 80;
    server_name ${domain};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location ${locationBlock(opts.basePath ?? '/')}
}

server {
    listen 443 ssl;
    server_name ${domain};

    ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/${domain}/chain.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location ${locationBlock(opts.basePath ?? '/')}
}
`
}

/** Self-contained deploy script shipped inside the generated site itself -
 *  builds the Docker image, runs the container, and wires up nginx (host
 *  nginx's sites-enabled convention if present, otherwise prints manual
 *  instructions instead of guessing at an unfamiliar host's setup). Needs
 *  only Docker (+ optionally nginx) on the target host - never this
 *  monorepo. Run as `PORT=3100 ./deploy.sh` (or edit the PORT default
 *  below). */
function scaffoldDeployScript(opts: ScaffoldOptions, framework: 'next' | 'vue'): string {
  const slug = `whoobe-site-${opts.websiteId.slice(0, 8)}`
  const envFile = framework === 'next' ? '.env.local' : '.env'
  const buildArgsBlock = framework === 'next'
    ? `BUILD_ARGS=()
if [ -f ${envFile} ]; then
  while IFS='=' read -r key value; do
    case "$key" in
      NEXT_PUBLIC_*) BUILD_ARGS+=(--build-arg "\${key}=\${value}") ;;
    esac
  done < ${envFile}
fi
`
    : ''
  const buildCmd = framework === 'next'
    ? `docker build --network host "\${BUILD_ARGS[@]}" -t "$IMAGE_NAME" .`
    : `docker build --network host -t "$IMAGE_NAME" .`
  const runEnvFlag = framework === 'vue' ? `--env-file "${envFile}" ` : ''

  return `#!/usr/bin/env bash
# Self-contained deploy: build the image, run the container, wire up
# nginx. Only Docker (+ optionally nginx) required on this host - no
# whoobe_cms checkout needed here, not for this or anything else.
set -euo pipefail
cd "$(dirname "$0")"

PORT="\${PORT:-3100}"
IMAGE_NAME="${slug}"
CONTAINER_NAME="${slug}"

echo ">>> Building Docker image \${IMAGE_NAME} ..."
# --network host: the build-time prerender/crawl step (Nuxt) or page data
# fetches (Next) may need to reach the CMS API URL configured in ${envFile} -
# harmless when that URL is genuinely public.
${buildArgsBlock}${buildCmd}

echo ">>> Starting container \${CONTAINER_NAME} on port \${PORT} ..."
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER_NAME" --restart unless-stopped -p "\${PORT}:3000" ${runEnvFlag}"$IMAGE_NAME"

echo ">>> Configuring nginx ..."
sed "s/__PORT__/\${PORT}/g" nginx.conf > /tmp/\${IMAGE_NAME}-nginx.conf
SUDO=""
[ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && SUDO="sudo"
if [ -d /etc/nginx/sites-enabled ]; then
  $SUDO cp /tmp/\${IMAGE_NAME}-nginx.conf "/etc/nginx/sites-available/${slug}"
  $SUDO ln -sf "/etc/nginx/sites-available/${slug}" "/etc/nginx/sites-enabled/${slug}"
  $SUDO nginx -t && $SUDO systemctl reload nginx
  echo ""
  echo "Done. nginx configured and reloaded - ${opts.domain || '<domain>'} -> 127.0.0.1:\${PORT}"
else
  echo ""
  echo "nginx sites-enabled directory not found - the container is running on port \${PORT}."
  echo "Rendered nginx config is at /tmp/\${IMAGE_NAME}-nginx.conf - add it to your reverse proxy manually."
fi
`
}

/** Keeps local build artifacts (from `pnpm dev`/`pnpm build` run directly on
 *  this machine before deploying) out of the Docker build context - COPY .
 *  . in scaffoldDockerfile would otherwise ship a stale local build. */
function scaffoldSiteDockerignore(): string {
  return `node_modules
.next
.nuxt
.output
.git
`
}

/** Minimal nginx image for a pre-built static site — expects the framework's
 *  static export output to already exist locally (`.output/public/` for Nuxt,
 *  `out/` for Next). Build locally first (e.g. `pnpm generate`), then build
 *  this image — no Node.js or CMS API needed at runtime. */
function scaffoldDockerfileStatic(framework: 'next' | 'vue'): string {
  const staticDir = framework === 'next' ? 'out' : 'public'
  const warn = framework === 'next'
    ? '# Next.js static export (`output: \'export\'`) is not yet auto-configured'
    : ''
  const sourceDir = framework === 'next' ? 'out' : '.output/public'
  return `# syntax=docker/dockerfile:1
${warn}
# Minimal image for a pre-built static site — expects ${staticDir}/ to
# already exist locally.  Build locally (pnpm generate for Nuxt), then
# build this image — no Node.js or CMS API needed at runtime.
FROM docker.io/nginxinc/nginx-unprivileged:alpine
# NOTE: this directory must be named '${staticDir}' in the build context
# (deploy-static.sh rsyncs ${sourceDir} as '${staticDir}/' onto the remote)
COPY ${staticDir} /usr/share/nginx/html/static
COPY nginx-static.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
`
}

/** Static-file nginx config for the published site container. The host nginx
 *  (system service) handles SSL termination — only HTTP inside the container. */
function scaffoldNginxStaticConf(framework: 'next' | 'vue'): string {
  const buildDir = framework === 'next' ? '_next' : '_nuxt'
  const payloadFile = framework === 'next' ? '__NEXT_DATA__' : '_payload.json'
  return `# Static-file nginx config for the published site container.
# The host nginx (system service) handles SSL termination — only HTTP inside.
server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html/static;

    # SPA fallback — Nuxt/Next pre-rendered pages hydrate from here
    location / {
        try_files $uri $uri/ /200.html;
    }

    # Long-lived build artefacts
    location /${buildDir}/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Pre-rendered payload — cache aggressively
    location /${payloadFile} {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Error pages
    error_page 404 /404.html;
    location = /404.html {
        internal;
    }
}
`
}

/** Self-contained deploy script for the STATIC (pre-rendered) workflow:
 *  builds the site locally (where the CMS API is reachable), rsyncs the
 *  static files to the remote host, builds the minimal nginx image natively
 *  on the remote host's architecture (avoids cross-arch issues), runs the
 *  container, and wires up host nginx.  Run as `PORT=3100 ./deploy-static.sh`. */
function scaffoldDeployStaticScript(opts: ScaffoldOptions, framework: 'next' | 'vue'): string {
  const slug = `whoobe-site-${opts.websiteId.slice(0, 8)}`
  const buildCmd = framework === 'next'
    ? '# Next.js static export not yet auto-configured — run `next build` manually'
    : 'pnpm generate'
  const dockerBuildContext = framework === 'next' ? 'out' : '.output/public'
  return `#!/usr/bin/env bash
# Self-contained deploy for a STATIC (pre-rendered) site: build locally
# where the CMS API is reachable, rsync the static files to the remote
# host, build the image natively on the remote (avoids arch mismatch),
# run the container, wire up nginx on the host.
# Usage:  PORT=3100 ./deploy-static.sh
set -euo pipefail
cd "$(dirname "$0")"

PORT="\${PORT:-3100}"
IMAGE_NAME="${slug}"
CONTAINER_NAME="${slug}"
REMOTE_HOST="\${REMOTE_HOST:-oracle}"
REMOTE_DIR="/opt/sites/\${IMAGE_NAME}"

${opts.siteApiKey ? `# This site was generated WITH a site key (--site-api-key). The key is only used by the site's own server route, which a
# static export does not have: gateway forms will not submit. Regenerate without --site-api-key (the form then posts
# straight to the gateway, protected by its binding and limits) or deploy a server build instead.
echo "WARNING: this site has a site key and a static export has no server to hold it: gateway forms will fail." >&2
` : ''}# ── 1. Build the site locally (prerender against the local CMS API) ────────
echo ">>> Building site locally ..."
${buildCmd}

# ── 2. Rsync static files to the remote host ───────────────────────────────
echo ">>> Syncing static files to \${REMOTE_HOST}:\${REMOTE_DIR} ..."
ssh "\$REMOTE_HOST" mkdir -p "\$REMOTE_DIR"
rsync -az --delete \\
  Dockerfile.static nginx-static.conf ${dockerBuildContext} \\
  "\${REMOTE_HOST}:\${REMOTE_DIR}/"

# ── 3. Build the image natively on the remote ──────────────────────────────
echo ">>> Building image natively on \${REMOTE_HOST} (\${REMOTE_DIR}) ..."
ssh "\$REMOTE_HOST" podman build -t "\$IMAGE_NAME" -f Dockerfile.static "\$REMOTE_DIR"

# ── 4. Replace the running container on the remote host ────────────────────
echo ">>> Starting container \${CONTAINER_NAME} on port \${PORT} ..."
ssh "\$REMOTE_HOST" podman rm -f "\$CONTAINER_NAME" >/dev/null 2>&1 || true
ssh "\$REMOTE_HOST" podman run -d --name "\$CONTAINER_NAME" \\
  --restart unless-stopped -p "\${PORT}:8080" "\$IMAGE_NAME"

# ── 5. Install / update the host nginx site config ────────────────────────
echo ">>> Configuring nginx on \${REMOTE_HOST} ..."
sed "s/__PORT__/\${PORT}/g" nginx.conf > /tmp/\${IMAGE_NAME}-nginx.conf
SUDO=""
if [ "\$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi
ssh "\$REMOTE_HOST" "cat > /tmp/\${IMAGE_NAME}-nginx.conf" < /tmp/\${IMAGE_NAME}-nginx.conf
ssh "\$REMOTE_HOST" "\$SUDO cp /tmp/\${IMAGE_NAME}-nginx.conf /etc/nginx/sites-available/\${IMAGE_NAME}"
ssh "\$REMOTE_HOST" "\$SUDO ln -sf /etc/nginx/sites-available/\${IMAGE_NAME} /etc/nginx/sites-enabled/\${IMAGE_NAME}"
ssh "\$REMOTE_HOST" "\$SUDO nginx -t && \$SUDO systemctl reload nginx"

rm -f /tmp/\${IMAGE_NAME}-nginx.conf

echo ""
echo "Done. ${opts.domain || '<domain>'} -> 127.0.0.1:\${PORT} (static)"
`
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
  // Next's basePath must have no trailing slash; omitted entirely when the
  // site is mounted at the domain root ('/' or unset) - a literal '/' is
  // rejected by Next itself.
  const basePath = opts.basePath && opts.basePath !== '/' ? opts.basePath.replace(/\/+$/, '') : ''
  return `/** @type {import('next').NextConfig} */
const nextConfig = {
  ${basePath ? `basePath: '${basePath}',` : ''}
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
${opts.safelist.map((c) => `    ${JSON.stringify(c)},`).join('\n')}
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
    // the default font goes in layer base BEFORE the theme's raw styles: a later rule of the same layer wins, and an
    // unlayered rule (what this used to be) beats everything the theme writes inside @layer base
    '@layer base {',
    '  body {',
    `    font-family: ${fontCss};`,
    '  }',
    '}',
    '',
    rawStyles,
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
const api = createWhoobeApi(apiUrl, process.env.NEXT_PUBLIC_GATEWAY_URL, '/api/whoobe-gateway-submit')

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="${defaultLocale}">
      <head>
        {/* Whoobe CMS custom styles are in globals.css (@theme block + raw) */}
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
      gatewayUrl: process.env.NEXT_PUBLIC_GATEWAY_URL,
      rootPath: process.env.NEXT_PUBLIC_WEBSITE_ROOT_PATH,
      siteApiKey: process.env.CMS_SITE_API_KEY,
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
  redirect(${JSON.stringify(actualHomePath)})
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

  // A locale's home page is authored either at slug '/' or, when the editor
  // entered the locale segment itself as the path (e.g. a 'tr' page with
  // slug '/tr'), at slug '/{locale}' - render either directly instead of
  // redirecting: a redirect isn't real prerenderable content, so if nothing
  // else links to the '/{locale}/{locale}' target it never gets generated
  // during static export - found live on a real multi-locale site.
  const homePage = localPages.find((p) => p.slug === '/') ?? localPages.find((p) => p.slug === '/' + locale)
  if (homePage) {
    try {
      const { descriptor, layout } = await getPageData(locale, homePage.slug, {
        baseUrl: process.env.CMS_API_URL!,
        websiteId: process.env.CMS_WEBSITE_ID,
        revalidate: parseInt(process.env.CMS_REVALIDATE || '60', 10),
        assetBaseUrl: (process.env.NEXT_PUBLIC_ASSET_BASE_URL || process.env.CMS_API_URL!) + '/dam-asset',
        gatewayUrl: process.env.NEXT_PUBLIC_GATEWAY_URL,
        rootPath: process.env.NEXT_PUBLIC_WEBSITE_ROOT_PATH,
        siteApiKey: process.env.CMS_SITE_API_KEY,
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
      gatewayUrl: process.env.NEXT_PUBLIC_GATEWAY_URL,
      rootPath: process.env.NEXT_PUBLIC_WEBSITE_ROOT_PATH,
      siteApiKey: process.env.CMS_SITE_API_KEY,
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
      gatewayUrl: process.env.NEXT_PUBLIC_GATEWAY_URL,
      rootPath: process.env.NEXT_PUBLIC_WEBSITE_ROOT_PATH,
      siteApiKey: process.env.CMS_SITE_API_KEY,
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
      gatewayUrl: process.env.NEXT_PUBLIC_GATEWAY_URL,
      rootPath: process.env.NEXT_PUBLIC_WEBSITE_ROOT_PATH,
      siteApiKey: process.env.CMS_SITE_API_KEY,
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
      gatewayUrl: process.env.NEXT_PUBLIC_GATEWAY_URL,
      rootPath: process.env.NEXT_PUBLIC_WEBSITE_ROOT_PATH,
      siteApiKey: process.env.CMS_SITE_API_KEY,
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

/** Same-origin proxy the browser calls instead of the Gateway directly for
 *  form submissions (docs/plans/api-gateway/gateway-auth-authz.md) - the
 *  only place CMS_SITE_API_KEY (a server-only env var, never NEXT_PUBLIC_*)
 *  is read. `createWhoobeApi()`'s ApiClient posts here (see scaffoldLayout's
 *  `'/api/whoobe-gateway-submit'` argument) whenever a visitor submits a
 *  Form bound to a Gateway endpoint. */
function scaffoldGatewaySubmitRoute(): string {
  return `import { NextResponse } from 'next/server'

const GATEWAY_URL = (process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3001').replace(/\\/+$/, '')
const SITE_ID = process.env.CMS_WEBSITE_ID || ''
const SITE_KEY = process.env.CMS_SITE_API_KEY || ''

export async function POST(request: Request) {
  const body = await request.text()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (SITE_KEY) {
    headers['X-Whoobe-Site-Id'] = SITE_ID
    headers['X-Whoobe-Site-Key'] = SITE_KEY
  }
  const upstream = await fetch(\`\${GATEWAY_URL}/api/v1/gateway/submit\`, {
    method: 'POST',
    headers,
    body,
  })
  const text = await upstream.text()
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  })
}
`
}

function scaffoldApi(opts: ScaffoldOptions): string {
  return `import { ApiClient } from '@whoobe-cms/renderer'

export const api = new ApiClient(process.env.CMS_API_URL!, undefined, process.env.NEXT_PUBLIC_GATEWAY_URL)

export const siteConfig = {
  apiUrl: process.env.CMS_API_URL!,
  websiteId: process.env.CMS_WEBSITE_ID!,
  revalidate: parseInt(process.env.CMS_REVALIDATE || '60', 10),
  gatewayUrl: process.env.NEXT_PUBLIC_GATEWAY_URL,
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
${opts.siteApiKey ? `CMS_SITE_API_KEY=${opts.siteApiKey}` : '# CMS_SITE_API_KEY= (no Gateway site key configured for this website)'}
NEXT_PUBLIC_CMS_API_URL=${opts.apiUrl}
NEXT_PUBLIC_WEBSITE_ID=${opts.websiteId}
NEXT_PUBLIC_ASSET_BASE_URL=${assetBase}
NEXT_PUBLIC_GATEWAY_URL=${opts.gatewayUrl ?? ''}
NEXT_PUBLIC_WEBSITE_ROOT_PATH=${(opts.website.rootPath as string) ?? ''}
${opts.domain ? `NEXT_PUBLIC_SITE_URL=https://${opts.domain}` : ''}
`
}

// --- Nuxt scaffolding ---

export async function generateNuxtSite(rawOptions: GenerateOptions): Promise<void> {
  const options = validateGenerateOptions(rawOptions)
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
    let pages = await client.listPages(websiteId)

    const appOnly = options.appOnly ?? false
    if (appOnly) {
      pages = pages.filter((p) => (p as any).kind === 'app')
      if (pages.length === 0) {
        console.log('No app pages found — generating with standard pages as fallback.')
        pages = await client.listPages(websiteId)
      } else {
        console.log(`Found ${pages.length} app pages.`)
      }
    }

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
    website.defaultLocale = safeLocale(website.defaultLocale)
    website.supportedLocales = ((website.supportedLocales as string[] | undefined) ?? [website.defaultLocale as string]).filter((l) => LOCALE_RE.test(l))
    const supportedLocales = website.supportedLocales as string[]
    const defaultLocale = website.defaultLocale as string
    const singleLocale = supportedLocales.length <= 1
    const pwaEnabled = appOnly || ((website.pwaEnabled as boolean) ?? false)
    const pwaConfig = pwaEnabled ? (website.pwaConfig as Record<string, unknown> ?? {}) : undefined

    console.log('Packing SDK dependencies (makes the site installable anywhere, no monorepo needed)...')
    const monorepoRoot = options.monorepoRoot ?? join(outDir, '..', '..')
    const vendoredPackages = await packSdkDependencies(outDir, 'vue', monorepoRoot)

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
      gatewayUrl: options.gatewayUrl,
      siteApiKey: options.siteApiKey,
      basePath: options.basePath,
      pwaConfig,
      monorepoRoot: options.monorepoRoot,
      appOnly,
      vendoredPackages,
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
    const cause = err.cause as { code?: string } | undefined
    // See the matching comment in generateNextSite's catch above - only
    // frame this as an API-connectivity problem when it actually is one.
    if (cause?.code === 'ENOTFOUND') {
      console.error(`Unable to contact the CMS API at "${apiUrl}". DNS lookup failed for "${apiUrl}" — check the host resolves.`)
      console.error('Confirm the API URL and that it points to the core-api service.')
    } else if (cause?.code === 'ECONNREFUSED') {
      console.error(`Unable to contact the CMS API at "${apiUrl}". Connection refused for "${apiUrl}" — is the core-api running on that host/port?`)
      console.error('Confirm the API URL and that it points to the core-api service.')
    } else if (cause?.code === 'ERR_TLS_CERT_ALTNAME_INVALID' || cause?.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
      console.error(`Unable to contact the CMS API at "${apiUrl}". TLS certificate issue for "${apiUrl}".`)
      console.error('Confirm the API URL and that it points to the core-api service.')
    } else {
      console.error(`Site generation failed: ${err instanceof Error ? err.message : String(error)}`)
    }
    throw error
  }
}

async function scaffoldNuxtSite(opts: ScaffoldOptions): Promise<void> {
  const singleLocale = opts.singleLocale

  // 'components' is unconditional, not gated on pwaConfig - AppShell.vue/
  // BottomNav.vue are always written there now (see the comment above their
  // writeFile calls below).
  const dirs = ['pages', 'composables', 'assets/css', 'public', 'server/routes', 'server/api', 'components']
  if (!singleLocale) dirs.push('pages/[locale]')
  for (const d of dirs) {
    await mkdir(join(opts.outDir, d), { recursive: true })
  }

  await writeFile(join(opts.outDir, 'package.json'), nuxtPackageJson(opts))
  await writeFile(
    join(opts.outDir, 'pnpm-workspace.yaml'),
    scaffoldPnpmWorkspaceYaml(vendoredDependenciesAndOverrides(opts.vendoredPackages).overrides)
  )
  await writeFile(join(opts.outDir, 'nuxt.config.ts'), nuxtConfig(opts))
  await writeFile(join(opts.outDir, 'tsconfig.json'), nuxtTsconfig())
  await writeFile(join(opts.outDir, 'app.vue'), nuxtAppVue(opts))
  await writeFile(join(opts.outDir, 'assets/css/main.css'), nuxtGlobalsCss(opts))
  await writeFile(join(opts.outDir, 'public/safelist.html'), nuxtSafelistHtml(opts))
  await writeFile(join(opts.outDir, 'composables/useWhoobeApi.ts'), nuxtComposable())
  await writeFile(join(opts.outDir, 'pages/index.vue'), nuxtHomePage(opts))
  await writeFile(join(opts.outDir, 'server/routes/sitemap.xml.ts'), nuxtSitemap(opts))
  await writeFile(join(opts.outDir, 'server/routes/robots.txt.ts'), nuxtRobots(opts))
  await writeFile(join(opts.outDir, 'server/api/whoobe-gateway-submit.post.ts'), nuxtGatewaySubmitRoute())

  if (singleLocale) {
    await writeFile(join(opts.outDir, 'pages/[...slug].vue'), nuxtCatchAllPage(opts))
  } else {
    await writeFile(join(opts.outDir, 'pages/[locale]/index.vue'), nuxtLocalePage())
    await writeFile(join(opts.outDir, 'pages/[locale]/[...slug].vue'), nuxtCatchAllPageMulti(opts))
  }

  await writeFile(join(opts.outDir, '.env'), nuxtEnv(opts), { mode: 0o600 })

  // AppShell.vue (+ its own BottomNav.vue dependency) is written
  // unconditionally, regardless of pwaConfig: nuxtCatchAllPageMulti()
  // (multi-locale sites) and nuxtHomePage()'s slug==='/' branch both
  // reference <AppShell> in their template even when PWA isn't configured
  // (a page individually marked kind:'app' can still use it) - gating this
  // write on pwaConfig alone left those imports pointing at a file that was
  // never written, breaking `nuxi generate`/`nuxi build` with ENOENT for
  // any non-PWA multi-locale site (found live, not hypothetical). Both
  // generators already handle an absent/undefined pwaConfig gracefully
  // (an empty bottom nav).
  await writeFile(join(opts.outDir, 'components/AppShell.vue'), nuxtAppShell(opts))
  await writeFile(join(opts.outDir, 'components/BottomNav.vue'), nuxtBottomNav())

  // PWA-only files
  const pwa = opts.pwaConfig
  if (pwa) {
    await writeFile(join(opts.outDir, 'public/manifest.json'), nuxtPwaManifest(pwa, opts))
    await writeFile(join(opts.outDir, 'error.vue'), nuxtErrorVue(opts))
    await writeFile(join(opts.outDir, 'components/InstallPrompt.vue'), nuxtInstallPrompt())
    await writeFile(join(opts.outDir, 'composables/useInstallPrompt.ts'), nuxtInstallPromptComposable())
    await writeFile(join(opts.outDir, 'composables/useOfflineQueue.ts'), nuxtOfflineQueue())
    await writeFile(join(opts.outDir, 'composables/usePushNotifications.ts'), nuxtPushNotifications(pwa))
  }

  // Self-contained deploy (Docker + nginx) - see each function's own comment.
  await writeFile(join(opts.outDir, 'Dockerfile'), scaffoldDockerfile('vue'))
  await writeFile(join(opts.outDir, 'nginx.conf'), scaffoldNginxConf(opts))
  await writeFile(join(opts.outDir, 'deploy.sh'), scaffoldDeployScript(opts, 'vue'), { mode: 0o755 })
  await writeFile(join(opts.outDir, '.dockerignore'), scaffoldSiteDockerignore())
  // Static deploy (nginx-only, no Node at runtime) - Nuxt only
  await writeFile(join(opts.outDir, 'Dockerfile.static'), scaffoldDockerfileStatic('vue'))
  await writeFile(join(opts.outDir, 'nginx-static.conf'), scaffoldNginxStaticConf('vue'))
  await writeFile(join(opts.outDir, 'deploy-static.sh'), scaffoldDeployStaticScript(opts, 'vue'), { mode: 0o755 })
}

function nuxtPackageJson(opts: ScaffoldOptions): string {
  const { dependencies: vendoredDeps, overrides } = vendoredDependenciesAndOverrides(opts.vendoredPackages)
  const deps: Record<string, string> = {
    nuxt: '^3.15.0',
    vue: '^3.5.0',
    'vue-router': '^4.5.0',
    'alpinejs': '^3.16.0',
    '@lucide/vue': '^1.1.0',
    ...vendoredDeps,
  }
  const devDeps: Record<string, string> = {
    tailwindcss: '^4.0.0',
    '@tailwindcss/vite': '^4.0.0',
    typescript: '^5.4.0',
  }
  if (opts.pwaConfig) {
    deps['@vite-pwa/nuxt'] = '^0.10.0'
    deps['idb'] = '^8.0.0'
  }
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
      // Production server (node-server preset, the default for `nuxi build`)
      // - `nuxi preview` is dev-only, never for production.
      start: 'node .output/server/index.mjs',
    },
    dependencies: deps,
    devDependencies: devDeps,
    // See scaffoldPackageJson's matching comment (Next side) - same reason,
    // same fix, needed here too.
    pnpm: { overrides },
  }, null, 2)
}

function nuxtConfig(opts: ScaffoldOptions): string {
  const pwaEnabled = !!opts.pwaConfig
  const pwa = opts.pwaConfig ?? {}
  const display = (pwa.display as string) ?? 'standalone'
  const themeColor = (pwa.themeColor as string) ?? '#6366f1'
  const pwaModule = pwaEnabled ? `\n  modules: ['@vite-pwa/nuxt'],` : ''

  let pwaConfigBlock = ''
  if (pwaEnabled) {
    pwaConfigBlock = `
  pwa: {
    registerType: 'autoUpdate',
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      runtimeCaching: [
        {
          urlPattern: /\\\/public\\\/pages\\\//,
          handler: 'StaleWhileRevalidate',
          options: { cacheName: 'whoobe-pages' },
        },
        {
          urlPattern: /\\\/dam-asset\\\//,
          handler: 'CacheFirst',
          options: { cacheName: 'whoobe-assets' },
        },
        {
          urlPattern: /\\\/public\\\/objects\\\//,
          handler: 'NetworkFirst',
          options: { cacheName: 'whoobe-objects' },
        },
      ],
    },
    manifest: false,
    injectManifest: {
      swSrc: 'public/sw.ts',
      swDest: 'public/sw.js',
    },
  },`
  }

  return `// https://nuxt.com/docs/api/nuxt-config
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-09-10',
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },${pwaModule}
  nitro: {
    prerender: {
      crawlLinks: true,
    },
  },
  runtimeConfig: {
    // Server-only (docs/plans/api-gateway/gateway-auth-authz.md) - unlike
    // everything under \`public\` below, this is NOT serialized into the
    // client payload. Read it only via useRuntimeConfig(event) in a Nitro
    // server route, never through the plain useRuntimeConfig() composable
    // (that one only ever sees \`public\`).
    cmsSiteApiKey: '${opts.siteApiKey ?? ''}',
    public: {
      cmsApiUrl: '${opts.apiUrl}',
      cmsWebsiteId: '${opts.websiteId}',
      cmsAssetBaseUrl: '${opts.assetBaseUrl ?? opts.apiUrl}',
      cmsDefaultLocale: '${opts.defaultLocale}',
      cmsRevalidate: ${opts.revalidate},
      gatewayUrl: '${opts.gatewayUrl ?? ''}',
      rootPath: '${(opts.website.rootPath as string) ?? ''}',
      ${opts.domain ? `siteUrl: 'https://${opts.domain}',` : ''}
    },
  },${pwaConfigBlock ? `\n${pwaConfigBlock}` : ''}
  app: {
    ${opts.basePath && opts.basePath !== '/' ? `baseURL: '${opts.basePath.replace(/\/+$/, '')}/',` : ''}
    head: {
      link: ${JSON.stringify([
        ...opts.fontFamilies.map((f) => ({
          rel: 'stylesheet',
          href: `https://fonts.googleapis.com/css2?family=${f.replace(/ /g, '+')}:wght@300;400;500;600;700&display=swap`,
        })),
        ...(pwaEnabled ? [{ rel: 'manifest', href: '/manifest.json' }] : []),
      ])},
      meta: [
        { name: 'whoobe-custom-styles', content: 'globals.css (@theme block + raw)' },
        ${pwaEnabled ? `{ name: 'theme-color', content: '${themeColor}' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: '${display === 'standalone' ? 'black-translucent' : 'default'}' },` : ''}
      ],${pwaEnabled ? `
      style: [
        { children: \`.pb-safe { padding-bottom: env(safe-area-inset-bottom); }
.pt-safe { padding-top: env(safe-area-inset-top); }
.pl-safe { padding-left: env(safe-area-inset-left); }
.pr-safe { padding-right: env(safe-area-inset-right); }\` },
      ],` : ''}
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
  const pwaEnabled = !!opts.pwaConfig
  return `<template>
  <WhoobeProvider :api="api" :assetBaseUrl="assetBaseUrl + '/dam-asset'">
    <div>
      <NuxtPage />
      ${pwaEnabled ? '<InstallPrompt />' : ''}
    </div>
  </WhoobeProvider>
</template>

<script setup lang="ts">
import { WhoobeProvider, createWhoobeApi } from '@whoobe-cms/nuxt'
${pwaEnabled ? "import InstallPrompt from '~/components/InstallPrompt.vue'" : ''}
${pwaEnabled ? "import { useOnlineStatus } from '~/composables/useOfflineQueue'" : ''}

// Start Alpine.js for client-side interactivity (x-data, x-show, etc.) - a
// dynamic, client-only import, never a static top-level one: Alpine's own
// module touches \`MutationObserver\` (a browser-only global) as soon as it's
// evaluated, before Alpine.start() is even called, so a plain \`import
// Alpine from 'alpinejs'\` throws immediately during SSR/prerendering
// ("MutationObserver is not defined") - found live, breaking every
// \`nuxi generate\` regardless of this site's content.
if (import.meta.client) {
  const { default: Alpine } = await import('alpinejs')
  window.Alpine = Alpine as any
  Alpine.start()
}

const config = useRuntimeConfig()
const apiUrl = config.public.cmsApiUrl
const assetBaseUrl = config.public.cmsAssetBaseUrl || apiUrl
// A gateway form posts to the site's own server route (which holds the site key) only when the site HAS a key; without
// one the route would add nothing, and a static export has no server to answer it: the form posts to the gateway.
const api = createWhoobeApi(apiUrl, config.public.gatewayUrl, ${opts.siteApiKey ? "'/api/whoobe-gateway-submit'" : 'undefined'})

${pwaEnabled ? `const { online } = useOnlineStatus()
// Replay offline mutation queue when coming back online
watch(online, (isOnline) => {
  if (isOnline) {
    import('~/composables/useOfflineQueue').then(({ replayQueue }) => replayQueue(api))
  }
})` : ''}

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
    // the default font goes in layer base BEFORE the theme's raw styles: a later rule of the same layer wins, and an
    // unlayered rule (what this used to be) beats everything the theme writes inside @layer base
    '@layer base {',
    '  body {',
    `    font-family: ${fontCss};`,
    '  }',
    '}',
    '',
    rawStyles,
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
    lines.push(`  <div class="${escapeHtmlAttr(chunk.join(' '))}"></div>`)
  }
  return `<html>\n<body>\n${lines.join('\n')}\n</body>\n</html>\n`
}

function nuxtHomePage(opts: ScaffoldOptions): string {
  const defaultLocale = (opts.website.defaultLocale as string) ?? 'en'
  const homeSlug = opts.homePaths[defaultLocale] ?? '/'
  const pwaEnabled = !!opts.pwaConfig || !!opts.appOnly

  if (homeSlug === '/') {
    return `<template>
  <AppShell>
    <WhoobePage :descriptor="data.descriptor" :layout="data.layout" />
  </AppShell>
</template>

<script setup lang="ts">
import { getPageData, WhoobePage } from '@whoobe-cms/nuxt'
import { resolveAssetUuid } from '~/composables/useWhoobeApi'
${pwaEnabled ? "import AppShell from '~/components/AppShell.vue'" : ''}

const config = useRuntimeConfig()
const { data } = await useAsyncData('home-page', () =>
  getPageData('${defaultLocale}', '/', {
    baseUrl: config.public.cmsApiUrl,
    websiteId: config.public.cmsWebsiteId,
    assetBaseUrl: (config.public.cmsAssetBaseUrl || config.public.cmsApiUrl) + '/dam-asset',
    gatewayUrl: config.public.gatewayUrl,
    rootPath: config.public.rootPath,
    siteApiKey: config.cmsSiteApiKey,
    resolveAssetUuid,
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
    <WhoobePage v-if="data?.kind === 'page'" :descriptor="data.page.descriptor" :layout="data.page.layout" />
  </div>
</template>

<script setup lang="ts">
import { getPageData, WhoobePage } from '@whoobe-cms/nuxt'
import { ApiClient } from '@whoobe-cms/renderer'
import { resolveAssetUuid } from '~/composables/useWhoobeApi'

const config = useRuntimeConfig()
const route = useRoute()
const locale = route.params.locale as string

// The whole resolution (which page is this locale's home, then fetch it)
// runs inside ONE useAsyncData, not a bare top-level await - a bare await
// here would still run again, unserialized, on the client during
// hydration (Nuxt only skips re-running data fetches wrapped in
// useAsyncData/useFetch), which can diverge from the server render
// (different network reachability, timing, or just a second live query
// racing the first) and surfaces as "Hydration completed but contains
// mismatches" - found live. Wrapping it means hydration reuses the exact
// SSR-serialized result instead of re-fetching and re-branching client-side.
const { data } = await useAsyncData(\`locale-\${locale}\`, async () => {
  const api = new ApiClient(config.public.cmsApiUrl)
  const pages = await api.listPages(config.public.cmsWebsiteId)
  const localPages = pages.filter((p) => p.locale === locale)

  // A locale's home page is authored either at slug '/' or, when the editor
  // entered the locale segment itself as the path (e.g. a 'tr' page with
  // slug '/tr'), at slug '/{locale}' - render either directly instead of
  // redirecting: a redirect isn't real prerenderable content, so if nothing
  // else links to the '/{locale}/{locale}' target the static crawler never
  // discovers or generates it - found live on a real multi-locale site.
  const homePage = localPages.find((p) => p.slug === '/') ?? localPages.find((p) => p.slug === '/' + locale)
  if (homePage) {
    const page = await getPageData(locale, homePage.slug, {
      baseUrl: config.public.cmsApiUrl,
      websiteId: config.public.cmsWebsiteId,
      assetBaseUrl: (config.public.cmsAssetBaseUrl || config.public.cmsApiUrl) + '/dam-asset',
      gatewayUrl: config.public.gatewayUrl,
      rootPath: config.public.rootPath,
      siteApiKey: config.cmsSiteApiKey,
      resolveAssetUuid,
    })
    return { kind: 'page' as const, page }
  }
  const homeSlug = localPages[0]?.slug ?? 'home'
  const path = homeSlug.startsWith('/') ? homeSlug.slice(1) : homeSlug
  return { kind: 'redirect' as const, target: '/' + locale + '/' + path }
})

if (data.value?.kind === 'redirect') {
  await navigateTo(data.value.target)
} else if (data.value?.kind === 'page') {
  const seo = data.value.page.page.seo || {} as any
  useHead({ title: seo.metaTitle || data.value.page.page.title })
}
</script>
`
}

function nuxtCatchAllPage(opts: ScaffoldOptions): string {
  const defaultLocale = opts.defaultLocale
  const pwaEnabled = !!opts.pwaConfig || !!opts.appOnly
  const wrapper = pwaEnabled
    ? `<template>
  <AppShell>
    <WhoobePage :descriptor="data.descriptor" :layout="data.layout" />
  </AppShell>
</template>`
    : `<template>
  <div class="whoobe-page">
    <WhoobePage :descriptor="data.descriptor" :layout="data.layout" />
  </div>
</template>`

  return `${wrapper}

<script setup lang="ts">
import { getPageData, WhoobePage } from '@whoobe-cms/nuxt'
import { resolveAssetUuid } from '~/composables/useWhoobeApi'
${pwaEnabled ? "import AppShell from '~/components/AppShell.vue'" : ''}

const config = useRuntimeConfig()
const route = useRoute()
const slug = (route.params.slug as string[]) || []
const path = '/' + slug.join('/')

const { data } = await useAsyncData(\`page-\${path}\`, () =>
  getPageData('${defaultLocale}', path, {
    baseUrl: config.public.cmsApiUrl,
    websiteId: config.public.cmsWebsiteId,
    assetBaseUrl: (config.public.cmsAssetBaseUrl || config.public.cmsApiUrl) + '/dam-asset',
    gatewayUrl: config.public.gatewayUrl,
    rootPath: config.public.rootPath,
    siteApiKey: config.cmsSiteApiKey,
    resolveAssetUuid,
  })
)

if (data.value) {
  const seo = data.value.page.seo || {} as any
  useHead({ title: seo.metaTitle || data.value.page.title })
}
</script>
`
}

function nuxtCatchAllPageMulti(opts: ScaffoldOptions): string {
  const pwaApp = !!opts.pwaConfig || !!opts.appOnly
  const appShell = pwaApp
    ? `  <AppShell>
    <WhoobePage :descriptor="data.descriptor" :layout="data.layout" />
  </AppShell>`
    : `  <AppShell v-if="data?.page?.kind === 'app'" :pwaConfig="pwaConfig">
    <WhoobePage :descriptor="data.descriptor" :layout="data.layout" />
  </AppShell>
  <div v-else class="whoobe-page">
    <WhoobePage :descriptor="data.descriptor" :layout="data.layout" />
  </div>`

  return `<template>
${appShell}
</template>

<script setup lang="ts">
import { getPageData, WhoobePage } from '@whoobe-cms/nuxt'
import { resolveAssetUuid } from '~/composables/useWhoobeApi'
import AppShell from '~/components/AppShell.vue'

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
    gatewayUrl: config.public.gatewayUrl,
    rootPath: config.public.rootPath,
    siteApiKey: config.cmsSiteApiKey,
    resolveAssetUuid,
  })
)

if (data.value) {
  const seo = data.value.page.seo || {} as any
  useHead({ title: seo.metaTitle || data.value.page.title })
}

const pwaConfig = (config.public as Record<string, unknown>)?.pwaConfig ?? {}
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

/** Same-origin Nitro route the browser calls instead of the Gateway
 *  directly for form submissions (docs/plans/api-gateway/gateway-auth-
 *  authz.md) - the only place the private `cmsSiteApiKey` runtimeConfig key
 *  is read (via useRuntimeConfig(event), never the plain useRuntimeConfig()
 *  composable other files use - that one only ever sees `.public`).
 *  `createWhoobeApi()`'s ApiClient posts here (see nuxtAppVue's
 *  `'/api/whoobe-gateway-submit'` argument). */
function nuxtGatewaySubmitRoute(): string {
  return `export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const body = await readBody(event)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.cmsSiteApiKey) {
    headers['X-Whoobe-Site-Id'] = String(config.public.cmsWebsiteId || '')
    headers['X-Whoobe-Site-Key'] = String(config.cmsSiteApiKey)
  }
  const gatewayUrl = String(config.public.gatewayUrl || 'http://localhost:3001').replace(/\\/+$/, '')
  const upstream = await fetch(\`\${gatewayUrl}/api/v1/gateway/submit\`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  setResponseStatus(event, upstream.status)
  return upstream.json()
})
`
}

function nuxtComposable(): string {
  return `import { ApiClient } from '@whoobe-cms/renderer'

export function useWhoobeApi() {
  const config = useRuntimeConfig()
  const api = new ApiClient(config.public.cmsApiUrl, undefined, config.public.gatewayUrl)

  return {
    api,
    apiUrl: config.public.cmsApiUrl,
    websiteId: config.public.cmsWebsiteId,
    revalidate: config.public.cmsRevalidate,
    assetBaseUrl: (config.public.cmsAssetBaseUrl || config.public.cmsApiUrl) + '/dam-asset',
    gatewayUrl: config.public.gatewayUrl,
  }
}

export async function resolveAssetUuid(uuid: string): Promise<string | null> {
  const config = useRuntimeConfig()
  try {
    const res = await fetch(\`\${config.public.cmsApiUrl}/public/assets/\${uuid}\`)
    if (!res.ok) return null
    const data = await res.json()
    return data.url ?? null
  } catch { return null }
}
`
}

function nuxtEnv(opts: ScaffoldOptions): string {
  const assetBase = opts.assetBaseUrl ?? opts.apiUrl
  return `# Whoobe CMS — published site configuration (Nuxt)
# Generated by whoobe-publish on ${new Date().toISOString()}

${opts.siteApiKey ? `NUXT_CMS_SITE_API_KEY=${opts.siteApiKey}` : '# NUXT_CMS_SITE_API_KEY= (no Gateway site key configured for this website)'}
NUXT_PUBLIC_CMS_API_URL=${opts.apiUrl}
NUXT_PUBLIC_CMS_WEBSITE_ID=${opts.websiteId}
NUXT_PUBLIC_CMS_REVALIDATE=${opts.revalidate}
NUXT_PUBLIC_CMS_ASSET_BASE_URL=${assetBase}
NUXT_PUBLIC_GATEWAY_URL=${opts.gatewayUrl ?? ''}
NUXT_PUBLIC_ROOT_PATH=${(opts.website.rootPath as string) ?? ''}
${opts.domain ? `NUXT_PUBLIC_SITE_URL=https://${opts.domain}` : ''}
`
}

// ── PWA template functions ─────────────────────────────────────────────────

function nuxtPwaManifest(pwa: Record<string, unknown>, opts: ScaffoldOptions): string {
  const domain = opts.domain ?? new URL(opts.apiUrl).hostname
  const name = (pwa.name as string) ?? (opts.website.name as string) ?? 'Whoobe Site'
  const shortName = (pwa.shortName as string) ?? name.slice(0, 12)
  const display = (pwa.display as string) ?? 'standalone'
  const orientation = (pwa.orientation as string) ?? 'portrait'
  const bgColor = (pwa.backgroundColor as string) ?? '#ffffff'
  const themeColor = (pwa.themeColor as string) ?? '#6366f1'
  const icons = (pwa.icons as Array<{ src: string; sizes: string; type: string }>) ?? [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ]
  return JSON.stringify({
    name,
    short_name: shortName,
    description: (pwa.description as string) ?? '',
    start_url: '/',
    scope: '/',
    display,
    orientation,
    background_color: bgColor,
    theme_color: themeColor,
    icons,
    lang: opts.defaultLocale,
  }, null, 2)
}

function nuxtAppShell(_opts: ScaffoldOptions): string {
  return `<template>
  <div class="app-shell min-h-screen pb-safe">
    <slot />
    <BottomNav v-if="items.length" :items="items" />
  </div>
</template>

<script setup lang="ts">
import BottomNav from '~/components/BottomNav.vue'

const props = defineProps<{ pwaConfig?: Record<string, unknown> }>()
const items = (props.pwaConfig?.bottomNav as Array<{ label: string; icon: string; link?: string; active?: boolean }>) ?? []
</script>
`
}

function nuxtBottomNav(): string {
  return `<template>
  <nav class="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 pb-safe pt-1">
    <a
      v-for="item in items"
      :key="item.label"
      :href="item.link || '#'"
      class="flex flex-col items-center gap-0.5 text-[10px] font-medium transition-colors"
      :class="item.active ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'"
    >
      <span class="text-lg" v-html="lucideIcon(item.icon)"></span>
      <span>{{ item.label }}</span>
    </a>
  </nav>
</template>

<script setup lang="ts">
defineProps<{ items: Array<{ label: string; icon: string; link?: string; active?: boolean }> }>()

function lucideIcon(name: string): string {
  const icons: Record<string, string> = {
    home: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    search: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    heart: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
    user: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    settings: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    bell: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 4 9 4 9H2s4-2 4-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    plus: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
    menu: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg>',
    arrow_left: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>',
    arrow_right: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
    info: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
    check: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>',
    x: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  }
  return icons[name.toLowerCase()] ?? \`<span style="font-size:14px">\${name}</span>\`
}
</script>
`
}

function nuxtInstallPrompt(): string {
  return `<template>
  <div v-if="show" class="fixed bottom-20 left-4 right-4 z-50 p-4 rounded-xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 flex items-center gap-3 animate-slide-up">
    <div class="flex-1 text-sm text-gray-700 dark:text-gray-200">
      <p class="font-semibold">Install this app</p>
      <p class="text-xs text-gray-500 dark:text-gray-400">Add to your home screen for a better experience</p>
    </div>
    <button @click="install" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-500 shrink-0">Install</button>
    <button @click="dismiss" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0">×</button>
  </div>
</template>

<script setup lang="ts">
import { useInstallPrompt } from '~/composables/useInstallPrompt'
const { show, install, dismiss } = useInstallPrompt()
</script>

<style scoped>
@keyframes slide-up {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.animate-slide-up { animation: slide-up 0.3s ease-out; }
</style>
`
}

function nuxtInstallPromptComposable(): string {
  return `export function useInstallPrompt() {
  const show = ref(false)
  const deferredPrompt = ref<Event | null>(null)

  function handler(e: Event) {
    e.preventDefault()
    deferredPrompt.value = e
    show.value = true
  }

  if (import.meta.client) {
    window.addEventListener('beforeinstallprompt', handler)
  }

  async function install() {
    if (!deferredPrompt.value) return
    ;(deferredPrompt.value as any).prompt()
    await (deferredPrompt.value as any).userChoice
    deferredPrompt.value = null
    show.value = false
  }

  function dismiss() {
    show.value = false
    deferredPrompt.value = null
  }

  return { show, install, dismiss }
}
`
}

function nuxtOfflineQueue(): string {
  return `import { openDB } from 'idb'
import { ref } from 'vue'
import type { ApiClient } from '@whoobe-cms/renderer'

export function useOnlineStatus() {
  const online = ref(true)

  if (import.meta.client) {
    online.value = navigator.onLine
    window.addEventListener('online', () => { online.value = true })
    window.addEventListener('offline', () => { online.value = false })
  }

  return { online }
}

export async function enqueueMutation(payload: unknown) {
  const db = await openDB('whoobe-offline-queue', 1, {
    upgrade(db) { db.createObjectStore('mutations', { keyPath: 'id', autoIncrement: true }) },
  })
  await db.add('mutations', { payload, createdAt: Date.now() })
}

export async function replayQueue(api: ApiClient) {
  const db = await openDB('whoobe-offline-queue', 1)
  const all = await db.getAll('mutations')
  for (const item of all) {
    try {
      const formPayload = (item.payload as Record<string, unknown>)?.form
        ? { classId: (item.payload as Record<string, unknown>).classId as string, form: (item.payload as Record<string, unknown>).form as Record<string, unknown> }
        : item.payload
      await api.submitForm(formPayload as any)
      await db.delete('mutations', item.id)
    } catch {
      break
    }
  }
}
`
}

function nuxtPushNotifications(pwa: Record<string, unknown>): string {
  const vapidKey = ((pwa.push as Record<string, unknown> ?? {})?.vapidPublicKey as string) ?? ''
  return `export function usePushNotifications() {
  const supported = ref(false)
  const subscribed = ref(false)
  const permission = ref<NotificationPermission>('default')

  if (import.meta.client && 'Notification' in window && 'serviceWorker' in navigator) {
    supported.value = true
    permission.value = Notification.permission

    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        subscribed.value = !!sub
      })
    })
  }

  async function subscribe(apiUrl: string, websiteId: string) {
    if (!supported.value) return false

    const result = await Notification.requestPermission()
    permission.value = result
    if (result !== 'granted') return false

    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: '${vapidKey}',
    })

    await fetch(\`\${apiUrl}/public/pwa/subscriptions\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        websiteId,
        endpoint: sub.endpoint,
        keys: sub.toJSON().keys,
      }),
    })

    subscribed.value = true
    return true
  }

  async function unsubscribe(apiUrl: string, websiteId: string) {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await sub.unsubscribe()
      await fetch(\`\${apiUrl}/public/pwa/unsubscribe\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteId, endpoint: sub.endpoint }),
      })
    }
    subscribed.value = false
  }

  return { supported, subscribed, permission, subscribe, unsubscribe }
}
`
}

function nuxtErrorVue(_opts: ScaffoldOptions): string {
  return `<template>
  <div class="flex items-center justify-center min-h-screen p-8 bg-gray-50 dark:bg-gray-950">
    <div class="text-center max-w-md">
      <div class="text-6xl mb-4">📡</div>
      <h1 class="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">You're offline</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Check your connection and try again.
      </p>
      <div v-if="recentPages.length" class="mb-6 text-left">
        <p class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Recently viewed</p>
        <ul class="space-y-1">
          <li v-for="p in recentPages" :key="p.path">
            <NuxtLink :to="p.path" class="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">{{ p.title }}</NuxtLink>
          </li>
        </ul>
      </div>
      <button @click="retry" class="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500">
        Retry
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const recentPages = ref<Array<{ path: string; title: string }>>([])

// Attempt to load last visited pages from IndexedDB
if (import.meta.client) {
  try {
    import('idb').then(async ({ openDB }) => {
      const db = await openDB('whoobe-page-history', 1, {
        upgrade(db) { db.createObjectStore('pages', { keyPath: 'path' }) },
      })
      recentPages.value = await db.getAll('pages')
    })
  } catch {}
}

function retry() {
  window.location.reload()
}
</script>
`
}

export { generateDocsSite, type DocsGenerateOptions } from './docs-site.js'
