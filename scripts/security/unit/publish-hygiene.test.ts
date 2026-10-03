// Plan 3.11: option validation and escaping helpers of the site generator (packages/publish).
import { describe, it, expect } from 'vitest'
import { validateGenerateOptions, safeLocale, isSafeFontName, isSafeCssColor, escapeHtmlAttr, type GenerateOptions } from '../../../packages/publish/src/cli'

const base: GenerateOptions = {
  apiUrl: 'https://cms.example.com', websiteId: '2f146f7f-a44a-483f-b4c2-5dd18e40082f', outDir: '/tmp/x', framework: 'next', revalidate: 60,
}

describe('validateGenerateOptions', () => {
  it('accepts ordinary options', () => {
    expect(() => validateGenerateOptions({ ...base, domain: 'www.example.com', gatewayUrl: 'http://localhost:3001', assetBaseUrl: 'https://cdn.example.com/a', basePath: '/blog', siteApiKey: 'whb_site_AbC123-_xyz' })).not.toThrow()
    expect(() => validateGenerateOptions({ ...base, domain: 'localhost:3000' })).not.toThrow()
  })

  it('refuses values that could break out of a generated file', () => {
    const bad: Partial<GenerateOptions>[] = [
      { domain: "x'];globalThis.p();//" }, { domain: 'a b' }, { domain: 'a.com;rm -rf /' }, { domain: '$(id).com' }, { domain: 'a.com\nserver_name evil' },
      { apiUrl: "https://a.com/'+process.exit()+'" }, { apiUrl: 'javascript:alert(1)' }, { apiUrl: 'file:///etc/passwd' }, { apiUrl: 'https://a.com/"x' },
      { gatewayUrl: 'https://a.com/`x`' }, { assetBaseUrl: 'https://a.com/<x>' },
      { websiteId: "x'; touch /tmp/p; '" }, { websiteId: '../../etc' },
      { basePath: "/a'b" }, { basePath: 'blog' }, { basePath: '/a b' }, { basePath: '/..;/x"' },
      { siteApiKey: "k'; echo" }, { siteApiKey: 'short' },
      { revalidate: -1 }, { revalidate: 1.5 }, { revalidate: Number.NaN },
    ]
    for (const b of bad) expect(() => validateGenerateOptions({ ...base, ...b }), JSON.stringify(b)).toThrow()
  })
})

describe('content hygiene helpers', () => {
  it('safeLocale keeps plain tags only', () => {
    expect(safeLocale('en')).toBe('en')
    expect(safeLocale('pt-BR')).toBe('pt-BR')
    for (const bad of ["en');x();//", 'en"', 'e', '', 'en US', 'en\n', 42, null, undefined]) expect(safeLocale(bad as any), String(bad)).toBe('en')
    expect(safeLocale("x'", 'it')).toBe('it')
  })

  it('font names: plain names pass, anything that could leave CSS/URL/HTML is dropped', () => {
    for (const ok of ['Roboto', 'Open Sans', 'Alfa+Slab+One', 'Playfair-Display', 'Noto Sans JP', 'Città Sans']) expect(isSafeFontName(ok), ok).toBe(true)
    for (const bad of ['Roboto"];x();//', "O'Neil", 'a;b', 'a{b}', 'a<b>', 'a\\b', 'a\nb', '', 'x'.repeat(65), 1, null]) expect(isSafeFontName(bad as any), String(bad)).toBe(false)
  })

  it('colours: colour syntax only, nothing that can close an @theme block', () => {
    for (const ok of ['#fff', '#FFAA00', '#12345678', 'rgb(0 0 0 / 50%)', 'hsl(120, 50%, 50%)', 'oklch(60% 0.2 120)', 'red', 'rebeccapurple']) expect(isSafeCssColor(ok), ok).toBe(true)
    for (const bad of ['#fff;}</style><script>x()</script>', 'red; background:url(//e)', 'url(//e)', '} body{}', 'var(--x)', '#ggg', 'a'.repeat(30), '']) expect(isSafeCssColor(bad), bad).toBe(false)
  })

  it('escapeHtmlAttr neutralises quotes and angle brackets', () => {
    expect(escapeHtmlAttr(`" onmouseover="x()" '<b>&`)).toBe('&quot; onmouseover=&quot;x()&quot; &#39;&lt;b&gt;&amp;')
  })
})
