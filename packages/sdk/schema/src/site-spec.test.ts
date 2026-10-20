import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { SITE_SPEC_LIMITS, describePath, siteSpecSchema, validateSiteSpec, type SiteSpec } from './site-spec.js'

const base = (): SiteSpec => ({
  version: 1,
  website: { name: 'Acme', defaultLocale: 'en', supportedLocales: ['en'] },
  theme: { name: 'Acme', colors: [{ name: 'brand', hex: '#7C3AED' }], fonts: ['Inter'] },
  snippets: [
    { key: 'header', name: 'Acme header', category: 'navigation', node: { kind: 'container', direction: 'row', semantic: 'header', css: 'px-6 py-3', children: [{ kind: 'link', text: 'Acme', href: '/' }, { kind: 'link', text: 'Pricing', href: '/pricing' }] } },
    { key: 'footer', name: 'Acme footer', category: 'footer', node: { kind: 'container', semantic: 'footer', children: [{ kind: 'text', html: 'Made by <strong>Acme</strong>' }] } },
  ],
  layout: { header: 'header', footer: 'footer' },
  pages: [
    { slug: '/', title: 'Home', description: 'Welcome', sections: [
      { kind: 'container', semantic: 'section', css: 'py-16', children: [{ kind: 'heading', level: 1, text: 'Hello' }, { kind: 'text', html: 'We make <em>things</em>.' }, { kind: 'link', text: 'See prices', href: '/pricing' }, { kind: 'image', alt: 'Our workshop' }] },
    ] },
    { slug: '/pricing', title: 'Pricing', sections: [{ kind: 'container', children: [{ kind: 'heading', level: 2, text: 'Prices' }] }] },
  ],
})

// edits a copy of the valid example
const edit = (fn: (s: any) => void): unknown => { const s = base() as any; fn(s); return s }
const messages = (input: unknown): string[] => { const r = validateSiteSpec(input); return r.ok ? [] : r.issues.map((i) => `${i.path}: ${i.message}`) }

describe('site spec: valid files', () => {
  it('accepts the example', () => {
    const r = validateSiteSpec(base())
    expect(r.ok).toBe(true)
  })

  it('accepts the smallest file', () => {
    expect(validateSiteSpec({ version: 1, website: { name: 'X', defaultLocale: 'en', supportedLocales: ['en'] }, pages: [{ slug: '/', title: 'Home', sections: [{ kind: 'text', html: 'Hi' }] }] }).ok).toBe(true)
  })

  it('accepts two languages, one page written once per language', () => {
    const s = edit((x) => {
      x.website.supportedLocales = ['en', 'it']
      x.pages.push({ slug: '/', title: 'Ciao', locale: 'it', sections: [{ kind: 'text', html: 'Ciao' }] })
    })
    expect(validateSiteSpec(s).ok).toBe(true)
  })

  it('accepts the reference to something that exists here, and a snippet placed in a page', () => {
    const s = edit((x) => {
      x.theme = { use: 'Whoobe Website' }
      x.snippets.push({ key: 'benefits', use: 'Benefits by role' })
      x.pages[0].sections.push({ kind: 'snippet', use: 'benefits' })
    })
    expect(validateSiteSpec(s).ok).toBe(true)
  })
})

describe('site spec: each rule has a failing example', () => {
  it('rejects an unknown key (strict objects)', () => {
    expect(messages(edit((x) => { x.pages[0].sections[0].onclick = 'alert(1)' })).join('\n')).toContain('unknown key "onclick"')
    expect(messages(edit((x) => { x.permissions = ['admin'] })).join('\n')).toContain('unknown key "permissions"')
  })

  it('rejects a wrong version', () => {
    expect(messages(edit((x) => { x.version = 2 }))[0]).toMatch(/^version:/)
  })

  it('rejects more than two locales, a repeated locale and a default that is not supported', () => {
    expect(messages(edit((x) => { x.website.supportedLocales = ['en', 'it', 'fr'] }))[0]).toMatch(/^website\.supportedLocales/)
    expect(messages(edit((x) => { x.website.supportedLocales = ['en', 'en'] })).join('\n')).toContain('twice')
    expect(messages(edit((x) => { x.website.defaultLocale = 'it' })).join('\n')).toContain('must be one of supportedLocales')
  })

  it('rejects a page in a locale the site does not support', () => {
    expect(messages(edit((x) => { x.pages[1].locale = 'fr' })).join('\n')).toContain('is not one of supportedLocales')
  })

  it('rejects the same slug twice for a locale, accepts it for two', () => {
    expect(messages(edit((x) => { x.pages[1].slug = '/' })).join('\n')).toContain('used twice')
  })

  it('rejects a slug that is not URL-safe', () => {
    expect(messages(edit((x) => { x.pages[1].slug = '/Pricing Page' }))[0]).toMatch(/^pages\[1\]\.slug/)
    expect(messages(edit((x) => { x.pages[1].slug = 'pricing' }))[0]).toMatch(/^pages\[1\]\.slug/)
  })

  it('rejects a page without sections', () => {
    expect(messages(edit((x) => { x.pages[1].sections = [] }))[0]).toMatch(/^pages\[1\]\.sections/)
  })

  it('rejects a link without text (the bug found on whoobe.dev)', () => {
    expect(messages(edit((x) => { x.pages[0].sections[0].children[2].text = '' }))[0]).toMatch(/^pages\[0\]\.sections\[0\]\.children\[2\]\.text/)
    expect(messages(edit((x) => { x.pages[0].sections[0].children[2].text = '   ' })).join('\n')).toContain('visible text')
  })

  it('rejects a link to a script or to markup', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.example', 'ftp://x', 'https://x"onmouseover="y', 'java script:1']) {
      expect(messages(edit((x) => { x.pages[0].sections[0].children[2].href = bad })).length, bad).toBeGreaterThan(0)
    }
  })

  it('rejects a link to a page that is not in the file, keeps the anchor and query of a page that is', () => {
    expect(messages(edit((x) => { x.pages[0].sections[0].children[2].href = '/contact' })).join('\n')).toContain('"/contact", which is not a page')
    expect(validateSiteSpec(edit((x) => { x.pages[0].sections[0].children[2].href = '/pricing#plans' })).ok).toBe(true)
  })

  it('rejects markup in a heading, and classes that could break out of the attribute', () => {
    expect(messages(edit((x) => { x.pages[0].sections[0].children[0].text = '<script>x</script>' }))[0]).toMatch(/plain text/)
    for (const bad of ['p-4" onmouseover="x', "p-4' x", 'p-4<script>', 'p-4; color:red', 'p-4 }body{', 'a\\b']) {
      expect(messages(edit((x) => { x.pages[0].sections[0].css = bad })).length, bad).toBeGreaterThan(0)
    }
    expect(validateSiteSpec(edit((x) => { x.pages[0].sections[0].css = 'bg-[#7C3AED] md:grid-cols-3 [&_a]:text-[#A78BFA] w-1/2' })).ok).toBe(true)
  })

  it('rejects a layout key or a snippet reference that does not exist', () => {
    expect(messages(edit((x) => { x.layout.header = 'nope' })).join('\n')).toContain('no snippet has the key "nope"')
    expect(messages(edit((x) => { x.pages[0].sections.push({ kind: 'snippet', use: 'nope' }) })).join('\n')).toContain('no snippet has the key "nope"')
  })

  it('rejects a snippet placed anywhere but directly in a page, and a snippet inside a snippet', () => {
    expect(messages(edit((x) => { x.pages[0].sections[0].children.push({ kind: 'snippet', use: 'header' }) })).join('\n')).toContain('directly in "sections"')
    expect(messages(edit((x) => { x.snippets[0].node.children.push({ kind: 'snippet', use: 'footer' }) })).join('\n')).toContain('cannot contain another snippet')
  })

  it('rejects a duplicated snippet key and a snippet that is both a reference and a definition', () => {
    expect(messages(edit((x) => { x.snippets[1].key = 'header' })).join('\n')).toContain('used twice')
    expect(messages(edit((x) => { x.snippets[0].use = 'Existing' })).join('\n')).toContain('either "use"')
    expect(messages(edit((x) => { delete x.snippets[0].node })).join('\n')).toContain('needs a "node"')
  })

  it('rejects a theme that is both a reference and a definition, or neither', () => {
    expect(messages(edit((x) => { x.theme.use = 'Other' })).join('\n')).toContain('either "use"')
    expect(messages(edit((x) => { x.theme = {} })).join('\n')).toContain('needs a "name"')
  })

  it('rejects a colour that is not #RRGGBB', () => {
    expect(messages(edit((x) => { x.theme.colors[0].hex = 'purple' }))[0]).toMatch(/^theme\.colors\[0\]\.hex/)
  })

  it('rejects a tree that is too deep or too large', () => {
    let node: any = { kind: 'text', html: 'x' }
    for (let i = 0; i < SITE_SPEC_LIMITS.maxDepth; i++) node = { kind: 'container', children: [node] }
    expect(messages(edit((x) => { x.pages[0].sections = [node] })).join('\n')).toContain('nested deeper')
    const many = Array.from({ length: SITE_SPEC_LIMITS.maxChildren }, () => ({ kind: 'text', html: 'x' }))
    const sections = Array.from({ length: 6 }, () => ({ kind: 'container', children: many }))
    expect(messages(edit((x) => { x.pages[0].sections = sections })).join('\n')).toContain('too large')
  })

  it('rejects an element of a kind that does not exist', () => {
    expect(validateSiteSpec(edit((x) => { x.pages[0].sections.push({ kind: 'script', src: 'x' }) })).ok).toBe(false)
  })

  it('never throws on rubbish', () => {
    for (const v of [null, undefined, 3, 'x', [], {}, { version: 1 }, { version: 1, pages: 'x' }]) expect(validateSiteSpec(v).ok).toBe(false)
  })
})

describe('site spec: errors say where', () => {
  it('names the page, the section and the element', () => {
    const input = edit((x) => { x.pages[0].sections[0].children[2].text = '' })
    const r = validateSiteSpec(input)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.issues[0].where).toBe('page "Home", section 1, element 3, "text"')
      expect(r.issues[0].path).toBe('pages[0].sections[0].children[2].text')
    }
  })

  it('names a snippet by its name', () => {
    expect(describePath(base(), ['snippets', 0, 'node', 'children', 1, 'href'])).toBe('snippet "Acme header", element 2, "href"')
  })
})

describe('site spec: the committed JSON Schema', () => {
  const file = fileURLToPath(new URL('../json/site-spec.schema.json', import.meta.url))
  const generated = `${JSON.stringify(z.toJSONSchema(siteSpecSchema as any, { unrepresentable: 'any' }), null, 2)}\n`

  // run `UPDATE_SITE_SPEC_SCHEMA=1 pnpm test` to rewrite the file after a change of the schema
  if (process.env.UPDATE_SITE_SPEC_SCHEMA) writeFileSync(file, generated)

  it('is the one the code generates (drift test)', () => {
    expect(readFileSync(file, 'utf8')).toBe(generated)
  })

  it('names every kind of element and forbids unknown keys', () => {
    const json = JSON.parse(readFileSync(file, 'utf8'))
    expect(JSON.stringify(json)).toContain('"additionalProperties":false')
    for (const kind of ['container', 'heading', 'text', 'link', 'image', 'snippet']) expect(JSON.stringify(json)).toContain(`"${kind}"`)
  })
})
