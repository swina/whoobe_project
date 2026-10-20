// Site specification, version 1 (docs/plans/ai/ai-site-spec.md): a whole website described as plain data, small and strict enough
// for a language model to write it and for a person to read it. It is NOT the stored format of a page: `expandSiteSpec` (packages/core,
// portability/site-spec.ts) turns it into a website bundle, which the existing importer reads. Everything a model must not decide
// (ids, the document root, editor defaults, permissions, secrets) is absent from the schema, and every object is strict: an
// unknown key is an error, not something that is ignored.
//
// The schema is written with Zod's v4 entry point (shipped inside zod 3.25) because it can emit the JSON Schema that is committed
// next to it (json/site-spec.schema.json). The rules that need to look across the file (a reference that must exist, a link to a
// page that is not there, a size limit) cannot be written in JSON Schema: they live in `superRefine` below and in `validateSiteSpec`.

import { z } from 'zod/v4'

export const SITE_SPEC_VERSION = 1

export const SITE_SPEC_LIMITS = {
  maxLocales: 2,
  maxPages: 30,
  maxSnippets: 30,
  maxNodesPerPage: 300,
  maxNodesPerSnippet: 150,
  maxDepth: 8,
  maxChildren: 60,
  maxTextLength: 20000,
} as const

// ---------------------------------------------------------------------------------------------------------------------------
// types (written by hand because the node is recursive)

export interface SpecContainer {
  kind: 'container'
  direction?: 'row' | 'col'
  semantic?: 'section' | 'header' | 'footer' | 'nav' | 'main' | 'aside' | 'article'
  css?: string
  anchor?: string
  children: SpecNode[]
}
export interface SpecHeading { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string; css?: string }
export interface SpecText { kind: 'text'; html: string; css?: string }
export interface SpecLink { kind: 'link'; text: string; href: string; css?: string }
export interface SpecImage { kind: 'image'; alt: string; css?: string }
/** A copy of a snippet of the file (`snippets[].key`) placed as a section of a page. Only valid directly in `pages[].sections`. */
export interface SpecSnippetRef { kind: 'snippet'; use: string }
export type SpecNode = SpecContainer | SpecHeading | SpecText | SpecLink | SpecImage | SpecSnippetRef

// ---------------------------------------------------------------------------------------------------------------------------
// primitives

/** Tailwind classes. Anything that could leave the attribute or start markup or a style rule is refused. */
const classes = z.string().max(600).regex(/^[^"'`<\\{};]*$/, 'Tailwind classes only: no quotes, angle brackets, braces, semicolons or backslashes')
/** A text without markup (headings, link text, alt text). Entities such as &amp; are fine. */
const plain = (max: number) => z.string().max(max).regex(/^[^<>]*$/, 'plain text only: no markup here (use a "text" element for formatted text)')
const key = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/, 'a key is lower-case letters, digits and hyphens, starting with a letter (at most 40 characters)')
const locale = z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'a locale such as "en" or "pt-BR"')
const slug = z.string().max(120).regex(/^\/$|^\/[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/, 'a slug starts with "/" and uses lower-case letters, digits and hyphens ("/" alone is the home page)')
/** A page of this site ("/pricing"), an anchor ("#top") or an outside address (https, mailto, tel). Never a script. */
const href = z.string().max(2000).regex(/^(\/(?!\/)[^\s"'<>\\]*|#[\w-]+|https?:\/\/[^\s"'<>\\]+|mailto:[^\s"'<>\\]+|tel:[+\d\s().-]+)$/, 'a link goes to a page of this site ("/pricing"), an anchor ("#top"), or an https, mailto or tel address')

// ---------------------------------------------------------------------------------------------------------------------------
// nodes

const containerNode: z.ZodType<SpecContainer> = z.strictObject({
  kind: z.literal('container'),
  direction: z.enum(['row', 'col']).optional().describe('row or col; the default is a plain block'),
  semantic: z.enum(['section', 'header', 'footer', 'nav', 'main', 'aside', 'article']).optional(),
  css: classes.optional().describe('Tailwind classes of the container'),
  anchor: z.string().regex(/^[\w-]{1,60}$/).optional().describe('an id that "#anchor" links can point to'),
  get children() { return z.array(specNodeSchema).max(SITE_SPEC_LIMITS.maxChildren) },
})

export const specNodeSchema: z.ZodType<SpecNode> = z.discriminatedUnion('kind', [
  containerNode as unknown as z.ZodObject<{ kind: z.ZodLiteral<'container'> }>,
  z.strictObject({ kind: z.literal('heading'), level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]), text: plain(300).min(1), css: classes.optional() }),
  z.strictObject({ kind: z.literal('text'), html: z.string().min(1).max(SITE_SPEC_LIMITS.maxTextLength).describe('a paragraph; inline formatting only (strong, em, a, code, br), cleaned on import'), css: classes.optional() }),
  z.strictObject({ kind: z.literal('link'), text: plain(200).min(1).describe('the visible text; a link without text is refused'), href, css: classes.optional() }),
  z.strictObject({ kind: z.literal('image'), alt: plain(300).min(1).describe('what the image shows; the picture itself is a placeholder until a person chooses one'), css: classes.optional() }),
  z.strictObject({ kind: z.literal('snippet'), use: key.describe('the key of an entry of "snippets"') }),
]) as unknown as z.ZodType<SpecNode>

// ---------------------------------------------------------------------------------------------------------------------------
// the file

const themeSchema = z.strictObject({
  use: z.string().min(1).max(120).optional().describe('the name of a theme that already exists here; then nothing else is given'),
  name: z.string().min(1).max(120).optional(),
  colors: z.array(z.strictObject({ name: z.string().min(1).max(60), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a colour as #RRGGBB') })).max(12).optional(),
  fonts: z.array(z.string().min(1).max(80)).max(4).optional(),
})

const snippetSchema = z.strictObject({
  key,
  use: z.string().min(1).max(120).optional().describe('the name of a snippet that already exists here; then nothing else is given'),
  name: z.string().min(1).max(120).optional(),
  category: z.string().min(1).max(60).optional().describe('for example hero, navigation, footer, content'),
  node: specNodeSchema.optional(),
})

const pageSchema = z.strictObject({
  slug,
  title: plain(160).min(1),
  locale: locale.optional().describe('one of website.supportedLocales; the default locale when absent'),
  category: z.string().max(60).optional(),
  description: plain(400).optional().describe('the page description for search engines'),
  sections: z.array(specNodeSchema).min(1).max(40),
})

export const siteSpecSchema = z.strictObject({
  version: z.literal(SITE_SPEC_VERSION),
  website: z.strictObject({
    name: plain(80).min(1),
    rootPath: z.string().regex(/^\/[a-z0-9]+(-[a-z0-9]+)*$/, 'a single segment such as "/my-site"').optional().describe('derived from the name when absent'),
    defaultLocale: locale,
    supportedLocales: z.array(locale).min(1).max(SITE_SPEC_LIMITS.maxLocales).describe('one or two locales, the default one included'),
    description: plain(400).optional(),
  }),
  theme: themeSchema.optional(),
  snippets: z.array(snippetSchema).max(SITE_SPEC_LIMITS.maxSnippets).optional(),
  layout: z.strictObject({
    header: key.optional(), footer: key.optional(), aside: key.optional(), notFound404: key.optional(),
  }).optional().describe('keys of snippets placed around every page'),
  pages: z.array(pageSchema).min(1).max(SITE_SPEC_LIMITS.maxPages),
}).superRefine((spec, ctx) => crossChecks(spec as SiteSpec, (path, message) => ctx.addIssue({ code: 'custom', path, message })))

export type SiteSpec = {
  version: 1
  website: { name: string; rootPath?: string; defaultLocale: string; supportedLocales: string[]; description?: string }
  theme?: { use?: string; name?: string; colors?: { name: string; hex: string }[]; fonts?: string[] }
  snippets?: { key: string; use?: string; name?: string; category?: string; node?: SpecNode }[]
  layout?: { header?: string; footer?: string; aside?: string; notFound404?: string }
  pages: { slug: string; title: string; locale?: string; category?: string; description?: string; sections: SpecNode[] }[]
}

// ---------------------------------------------------------------------------------------------------------------------------
// rules across the file (each one has a failing example in site-spec.test.ts)

type Path = (string | number)[]

/** The nodes of a tree with their path, depth-first; `snippet` references are leaves. */
function* walk(node: SpecNode, path: Path, depth = 1): Generator<{ node: SpecNode; path: Path; depth: number }> {
  yield { node, path, depth }
  if (node.kind === 'container') for (let i = 0; i < node.children.length; i++) yield* walk(node.children[i], [...path, 'children', i], depth + 1)
}

export function crossChecks(spec: SiteSpec, fail: (path: Path, message: string) => void): void {
  const locales = spec.website.supportedLocales
  if (new Set(locales).size !== locales.length) fail(['website', 'supportedLocales'], 'the same locale is listed twice')
  if (!locales.includes(spec.website.defaultLocale)) fail(['website', 'defaultLocale'], `the default locale "${spec.website.defaultLocale}" must be one of supportedLocales`)

  // themes and snippets: a definition or a reference to something that exists here, never both, never neither
  const t = spec.theme
  if (t) {
    if (t.use !== undefined && (t.name !== undefined || t.colors !== undefined || t.fonts !== undefined)) fail(['theme'], 'a theme is either "use" (an existing one) or a definition (name, colors, fonts), not both')
    if (t.use === undefined && t.name === undefined) fail(['theme'], 'a theme needs a "name" (a new one) or "use" (an existing one)')
  }
  const keys = new Map<string, number>()
  ;(spec.snippets ?? []).forEach((s, i) => {
    if (keys.has(s.key)) fail(['snippets', i, 'key'], `the key "${s.key}" is used twice (also by snippets[${keys.get(s.key)}])`)
    keys.set(s.key, i)
    if (s.use !== undefined) {
      if (s.name !== undefined || s.category !== undefined || s.node !== undefined) fail(['snippets', i], 'a snippet is either "use" (an existing one) or a definition (name, category, node), not both')
      return
    }
    if (s.name === undefined) fail(['snippets', i, 'name'], 'a snippet needs a "name" (a new one) or "use" (an existing one)')
    if (s.category === undefined) fail(['snippets', i, 'category'], 'a snippet needs a "category"')
    if (s.node === undefined) { fail(['snippets', i, 'node'], 'a snippet needs a "node"'); return }
    let count = 0
    for (const w of walk(s.node, ['snippets', i, 'node'])) {
      count++
      if (w.depth > SITE_SPEC_LIMITS.maxDepth) { fail(w.path, `nested deeper than ${SITE_SPEC_LIMITS.maxDepth} levels`); break }
      if (w.node.kind === 'snippet') fail(w.path, 'a snippet cannot contain another snippet')
      else checkNode(w.node, w.path, spec, fail)
    }
    if (count > SITE_SPEC_LIMITS.maxNodesPerSnippet) fail(['snippets', i, 'node'], `too large (${count} elements, the limit is ${SITE_SPEC_LIMITS.maxNodesPerSnippet})`)
  })

  const layout = spec.layout ?? {}
  for (const [place, k] of Object.entries(layout)) if (k !== undefined && !keys.has(k)) fail(['layout', place], `no snippet has the key "${k}"`)

  // pages: slugs unique per locale, locale among the supported ones
  const seen = new Map<string, number>()
  spec.pages.forEach((p, i) => {
    const loc = p.locale ?? spec.website.defaultLocale
    if (!locales.includes(loc)) fail(['pages', i, 'locale'], `the locale "${loc}" is not one of supportedLocales (${locales.join(', ')})`)
    const id = `${loc} ${p.slug}`
    if (seen.has(id)) fail(['pages', i, 'slug'], `the slug "${p.slug}" is used twice for "${loc}" (also by pages[${seen.get(id)}])`)
    seen.set(id, i)
  })

  spec.pages.forEach((p, i) => {
    let count = 0
    p.sections.forEach((section, j) => {
      for (const w of walk(section, ['pages', i, 'sections', j])) {
        count++
        if (w.depth > SITE_SPEC_LIMITS.maxDepth) { fail(w.path, `nested deeper than ${SITE_SPEC_LIMITS.maxDepth} levels`); break }
        if (w.node.kind === 'snippet') {
          if (w.path.length > 4) fail(w.path, 'a snippet can only be placed directly in "sections" of a page')
          else if (!keys.has(w.node.use)) fail([...w.path, 'use'], `no snippet has the key "${w.node.use}"`)
        } else checkNode(w.node, w.path, spec, fail)
      }
    })
    if (count > SITE_SPEC_LIMITS.maxNodesPerPage) fail(['pages', i, 'sections'], `too large (${count} elements, the limit is ${SITE_SPEC_LIMITS.maxNodesPerPage})`)
  })
}

function checkNode(node: SpecNode, path: Path, spec: SiteSpec, fail: (path: Path, message: string) => void): void {
  if (node.kind !== 'link') return
  if (!node.text.trim()) fail([...path, 'text'], 'a link needs visible text')
  if (node.href.startsWith('/') && !node.href.startsWith('//')) {
    const target = node.href.split(/[?#]/)[0] || '/'
    if (!spec.pages.some((p) => p.slug === target)) fail([...path, 'href'], `the link goes to "${target}", which is not a page of this file`)
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// validation with readable errors

export interface SiteSpecIssue {
  /** Machine path, for example `pages[1].sections[0].children[2].href`. */
  path: string
  /** The same place in words, for a person who does not read JSON: `page "Pricing", section 1, element 3`. */
  where: string
  message: string
}

export function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((out, seg) => (typeof seg === 'number' ? `${out}[${seg}]` : out ? `${out}.${String(seg)}` : String(seg)), '')
}

/** Describes a path in words, using the titles and names of the file when they are there. */
export function describePath(input: unknown, path: readonly PropertyKey[]): string {
  const words: string[] = []
  let node: any = input
  for (let i = 0; i < path.length; i++) {
    const seg = path[i]
    const next = node && typeof node === 'object' ? node[seg as any] : undefined
    if (seg === 'pages' && typeof path[i + 1] === 'number') {
      const page = node.pages?.[path[i + 1] as number]
      words.push(`page ${page?.title ? `"${page.title}"` : `#${(path[i + 1] as number) + 1}`}`)
      node = page; i++
    } else if (seg === 'snippets' && typeof path[i + 1] === 'number') {
      const s = node.snippets?.[path[i + 1] as number]
      words.push(`snippet ${s?.name ? `"${s.name}"` : s?.key ? `"${s.key}"` : `#${(path[i + 1] as number) + 1}`}`)
      node = s; i++
    } else if (seg === 'sections' && typeof path[i + 1] === 'number') {
      words.push(`section ${(path[i + 1] as number) + 1}`)
      node = node.sections?.[path[i + 1] as number]; i++
    } else if (seg === 'children' && typeof path[i + 1] === 'number') {
      words.push(`element ${(path[i + 1] as number) + 1}`)
      node = node.children?.[path[i + 1] as number]; i++
    } else if (seg === 'node') {
      node = next
    } else {
      if (typeof seg === 'string' && !(seg === 'pages' || seg === 'snippets')) words.push(`"${seg}"`)
      node = next
    }
  }
  return words.join(', ') || 'the file'
}

export type SiteSpecResult = { ok: true; spec: SiteSpec } | { ok: false; issues: SiteSpecIssue[] }

/** Checks a value against the schema and the rules across the file. Never throws; every problem is reported with its place. */
export function validateSiteSpec(input: unknown): SiteSpecResult {
  const parsed = siteSpecSchema.safeParse(input)
  if (parsed.success) return { ok: true, spec: parsed.data as SiteSpec }
  const seen = new Set<string>()
  const issues: SiteSpecIssue[] = []
  for (const issue of parsed.error.issues) {
    const path = [...issue.path]
    // an unknown key is reported at the object; name the key, which Zod keeps in `keys`
    const extra = issue.code === 'unrecognized_keys' ? (issue as { keys: string[] }).keys : null
    const message = extra ? `unknown ${extra.length > 1 ? 'keys' : 'key'} ${extra.map((k) => `"${k}"`).join(', ')}: not part of the specification` : issue.message
    const p = formatPath(path)
    const id = `${p}|${message}`
    if (seen.has(id)) continue
    seen.add(id)
    issues.push({ path: p || '(file)', where: describePath(input, path), message })
  }
  return { ok: false, issues }
}
