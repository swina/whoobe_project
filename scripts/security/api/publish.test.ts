// Plan 3.11: what the site generator writes when the CMS content is hostile. Real generation (Next and Nuxt)
// into a temp directory from a website whose names, fonts, colours, classes, slugs and locales are payloads; then:
// no payload may become code (TypeScript AST), markup or a shell/nginx directive, and secrets files are private.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, extname, relative } from 'node:path'
import ts from 'typescript'
import { randomBytes } from 'node:crypto'
import { clientFor } from '../lib/client'
import { TARGET, ROOT_DIR } from '../lib/config'
import { generateNextSite, generateNuxtSite, type GenerateOptions } from '../../../packages/publish/src/cli'

const MARK = '__PWNED__'
const P = `');globalThis.${MARK}();//`

let websiteId = ''
let pageId = ''
const dirs: string[] = []
const out: Record<'next' | 'vue', string> = { next: '', vue: '' }
let outNoKey = ''
let admin: Awaited<ReturnType<typeof clientFor>>

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'vendor') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else acc.push(p)
  }
  return acc
}

beforeAll(async () => {
  admin = await clientFor('admin')
  const w = await admin.post('/whoobe-one/websites', { rootPath: `/hostile-${randomBytes(3).toString('hex')}`, name: `Hostile ${P} "q" \`t\` \${x}`, defaultLocale: `en${P}`, supportedLocales: [`en${P}`] })
  expect(w.status, w.text.slice(0, 120)).toBe(201)
  websiteId = w.json.website.id
  const theme = {
    id: 't1', name: `T${P}`,
    colors: [{ name: `c${P}`, hex: '#fff;}</style><script>__PWNED__()</script>' }, { name: 'ok', hex: '#123456' }],
    fonts: [`Roboto"];globalThis.${MARK}();//`, "O'Neil", 'Open Sans'],
    styles: 'body{color:red}', tailwindClasses: `p-1'],y:globalThis.${MARK}(),z:['`,
  }
  expect((await admin.patch(`/whoobe-one/websites/${websiteId}`, { settings: { themes: [theme], defaultThemeId: 't1' } })).status).toBe(200)
  const content = { id: 'root', element: 'div', css: { css: `p-1 w-[calc(1px)] '],x:globalThis.${MARK}(),y:['`, container: `m-2 "];globalThis.${MARK}();//` }, blocks: [] }
  const page = await admin.post('/whoobe-one/pages', { slug: `/x${P}`, title: `T ${P}`, content, websiteId, locale: `en${P}` })
  expect(page.status).toBe(201)
  pageId = page.json.page.id
  expect((await admin.patch(`/whoobe-one/pages/${pageId}`, { published: true })).status).toBe(200)

  for (const fw of ['next', 'vue'] as const) {
    out[fw] = mkdtempSync(join(tmpdir(), `whoobe-gen-${fw}-`))
    dirs.push(out[fw])
    const opts: GenerateOptions = { apiUrl: TARGET, websiteId, outDir: out[fw], framework: fw, revalidate: 60, domain: 'example.com', siteApiKey: 'whb_site_testkey123', monorepoRoot: ROOT_DIR }
    await (fw === 'next' ? generateNextSite(opts) : generateNuxtSite(opts))
  }
  // the same Nuxt site without a site key: what a static export is meant to be generated with
  outNoKey = mkdtempSync(join(tmpdir(), 'whoobe-gen-vue-nokey-'))
  dirs.push(outNoKey)
  await generateNuxtSite({ apiUrl: TARGET, websiteId, outDir: outNoKey, framework: 'vue', revalidate: 60, domain: 'example.com', monorepoRoot: ROOT_DIR } as GenerateOptions)
}, 300_000)

afterAll(async () => {
  if (pageId) await admin.delete(`/whoobe-one/pages/${pageId}`)
  if (websiteId) await admin.delete(`/whoobe-one/websites/${websiteId}`)
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

describe.each(['next', 'vue'] as const)('generated %s site', (fw) => {
  it('generates something', () => {
    expect(walk(out[fw]).length).toBeGreaterThan(5)
  })

  it('no payload became code (TypeScript/JavaScript AST)', () => {
    const offenders: string[] = []
    for (const f of walk(out[fw]).filter((p) => ['.ts', '.tsx', '.js', '.mjs', '.cjs'].includes(extname(p)))) {
      const src = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true)
      const visit = (n: ts.Node): void => {
        if (ts.isIdentifier(n) && n.text === MARK) offenders.push(relative(out[fw], f))
        ts.forEachChild(n, visit)
      }
      visit(src)
      // a broken file is also a sign the content escaped its string literal
      const diags = (src as any).parseDiagnostics as unknown[]
      if (f.endsWith('.ts') || f.endsWith('.tsx')) expect(diags.length, `${relative(out[fw], f)} must still parse`).toBe(0)
    }
    expect(offenders).toEqual([])
  })

  it('HTML written by the generator keeps hostile class names inside their attribute', () => {
    for (const f of walk(out[fw]).filter((p) => p.endsWith('.html'))) {
      for (const line of readFileSync(f, 'utf8').split('\n').filter((l) => l.includes('<div class='))) {
        expect(line, relative(out[fw], f)).toMatch(/^\s*<div class="[^"]*"><\/div>$/)
      }
    }
  })

  it('CSS keeps colour values and font names plain', () => {
    for (const f of walk(out[fw]).filter((p) => p.endsWith('.css'))) {
      const css = readFileSync(f, 'utf8')
      expect(css, f).not.toMatch(/<script|<\/style>/i)
      expect(css, f).not.toContain(MARK)
      for (const m of css.matchAll(/^\s*--color-[A-Za-z0-9_-]+:\s*([^;]+);/gm)) expect(m[1], f).toMatch(/^#[0-9a-fA-F]{3,8}$/)
    }
  })

  it('shell and nginx files contain no payload', () => {
    for (const f of walk(out[fw]).filter((p) => /\.(sh|conf)$/.test(p) || /Dockerfile/.test(p))) {
      expect(readFileSync(f, 'utf8'), relative(out[fw], f)).not.toContain(MARK)
    }
  })

  it('the env file with the site key is not world-readable', () => {
    const env = join(out[fw], fw === 'next' ? '.env.local' : '.env')
    expect(statSync(env).mode & 0o077, 'group/other permissions on the env file').toBe(0)
  })

  it('the generated site carries a sane default locale, not the payload', () => {
    const text = walk(out[fw]).filter((p) => ['.ts', '.tsx', '.vue'].includes(extname(p))).map((f) => readFileSync(f, 'utf8')).join('\n')
    expect(text).toMatch(/lang[=:]\s*["']en["']/)
  })
})

describe('generator refuses hostile options', () => {
  it('a Host-header-like domain or URL cannot be generated', async () => {
    const base: GenerateOptions = { apiUrl: TARGET, websiteId: '2f146f7f-a44a-483f-b4c2-5dd18e40082f', outDir: join(tmpdir(), 'whoobe-never'), framework: 'next', revalidate: 60, monorepoRoot: ROOT_DIR }
    await expect(generateNextSite({ ...base, domain: "x'];globalThis.p();//" })).rejects.toThrow(/Invalid domain/)
    await expect(generateNuxtSite({ ...base, apiUrl: "https://a.com/'+x+'" })).rejects.toThrow(/Invalid apiUrl/)
  })
})

describe('gateway forms in a Nuxt site: the proxy only exists for a site that has a key', () => {
  const apiCall = (dir: string) => {
    const file = walk(dir).find((f) => f.endsWith('.vue') && readFileSync(f, 'utf8').includes('createWhoobeApi('))
    expect(file, 'the page template that builds the API client').toBeTruthy()
    return readFileSync(file!, 'utf8').split('\n').find((l) => l.includes('createWhoobeApi('))!
  }

  it('without a key the form posts straight to the gateway (a static export has no server route to call)', () => {
    expect(apiCall(outNoKey)).toMatch(/createWhoobeApi\(apiUrl, config\.public\.gatewayUrl, undefined, undefined\)/)
    expect(apiCall(outNoKey)).not.toContain('whoobe-gateway-submit')
  })

  it('with a key it keeps going through the site\'s own server route, which holds the key', () => {
    expect(apiCall(out.vue)).toContain("'/api/whoobe-gateway-submit'")
    expect(walk(out.vue).some((f) => f.endsWith('whoobe-gateway-submit.post.ts'))).toBe(true)
  })

  it('the static deploy script warns when the site has a key, and only then', () => {
    const script = (dir: string) => readFileSync(join(dir, 'deploy-static.sh'), 'utf8')
    expect(script(out.vue)).toContain('WARNING: this site has a site key')
    expect(script(outNoKey)).not.toContain('WARNING: this site has a site key')
  })
})
