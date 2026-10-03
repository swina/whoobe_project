import { describe, expect, it } from 'vitest'
import { sanitizeRichText, sanitizeSvg } from './sanitize.js'

const XSS = [
  '<img src=x onerror=alert(1)>', '<svg onload=alert(1)></svg>', '<script>alert(1)</script>', '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<a href="javascript:alert(1)">x</a>', '<a href=" jAvAsCrIpT:alert(1)">x</a>', '<a href="data:text/html,<script>alert(1)</script>">x</a>',
  '<details open ontoggle=alert(1)>', '<input autofocus onfocus=alert(1)>', '<body onload=alert(1)>', '<video><source onerror=alert(1)>',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>">', '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;img src=x onerror=alert(1)&gt;">',
  '"><img src=x onerror=alert(1)>', '<form action="javascript:alert(1)"><button>x</button></form>', '<object data="javascript:alert(1)"></object>',
  '<embed src="javascript:alert(1)">', '<link rel=stylesheet href="javascript:alert(1)">', '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  '<base href="javascript:alert(1)//">', '<img src="data:image/svg+xml,<svg onload=alert(1)>">', '<a href="//evil.example">x</a>',
  '<p style="background:url(javascript:alert(1))">x</p>', '<div id=x name=y>z</div>', '<svg><script>alert(1)</script></svg>',
  '<style>@import "javascript:alert(1)"</style>', '<textarea><img src=x onerror=alert(1)></textarea>', '<template><img src=x onerror=alert(1)></template>',
]

describe('sanitizeRichText', () => {
  it('removes every executable construct of the corpus', () => {
    for (const x of XSS) {
      const out = sanitizeRichText(x)
      expect(out, x).not.toMatch(/<script|<iframe|<object|<embed|<form|<input|<style|<link|<meta|<base|<svg|<math|<template|<textarea|<body|<video/i)
      // attribute VALUES may contain the text (escaped, inert); an on* attribute NAME must not exist
      expect(out.replace(/="[^"]*"/g, '=""'), x).not.toMatch(/\son[a-z]+\s*=/i)
      expect(out, x).not.toMatch(/javascript:/i)
      expect(out, x).not.toMatch(/\sstyle\s*=/i)
      expect(out, x).not.toMatch(/\s(id|name)\s*=/i)
      expect(out, x).not.toMatch(/href="\/\//)
    }
  })

  it('keeps ordinary formatting, links and images', () => {
    const html = '<h2 class="text-xl">Title</h2><p>Hello <b>bold</b>, <i>it</i> <a href="https://example.com/a?b=1" target="_blank">link</a><br><img src="/dam-asset/x.png" alt="x" width="10"></p><ul><li>a</li></ul>'
    const out = sanitizeRichText(html)
    expect(out).toContain('<h2 class="text-xl">Title</h2>')
    expect(out).toContain('<b>bold</b>')
    expect(out).toContain('<a href="https://example.com/a?b=1" target="_blank" rel="noopener noreferrer">link</a>')
    expect(out).toContain('<img src="/dam-asset/x.png" alt="x" width="10" />')
    expect(out).toContain('<li>a</li>')
  })

  it('allows mailto/tel links and raster data images, refuses SVG data images and protocol-relative URLs', () => {
    expect(sanitizeRichText('<a href="mailto:a@b.c">m</a><a href="tel:+39123">t</a>')).toContain('href="mailto:a@b.c"')
    expect(sanitizeRichText('<img src="data:image/png;base64,iVBORw0KGgo=">')).toContain('data:image/png')
    expect(sanitizeRichText('<img src="data:image/svg+xml;base64,PHN2Zz4=">')).not.toContain('src=')
    expect(sanitizeRichText('<img src="//evil.example/x.png">')).not.toContain('evil.example')
  })

  it('plain text and empty values pass through safely', () => {
    expect(sanitizeRichText('just text')).toBe('just text')
    expect(sanitizeRichText('a < b & c')).toBe('a &lt; b &amp; c')
    expect(sanitizeRichText(null)).toBe('')
    expect(sanitizeRichText(undefined)).toBe('')
    expect(sanitizeRichText(42)).toBe('42')
  })

  it('is idempotent', () => {
    const once = sanitizeRichText('<p onclick=x>a <b>b</b> <script>x</script></p>')
    expect(sanitizeRichText(once)).toBe(once)
  })
})

describe('sanitizeSvg', () => {
  it('keeps shapes and drops script, handlers, foreignObject and external references', () => {
    const svg = '<svg viewBox="0 0 24 24" fill="none" onload="alert(1)"><script>alert(1)</script><path d="M0 0L10 10" stroke="currentColor"/><foreignObject><iframe srcdoc="x"></iframe></foreignObject><use href="https://evil.example/a.svg#x"/><a href="javascript:alert(1)"><circle r="1"/></a></svg>'
    const out = sanitizeSvg(svg)
    expect(out).toContain('<path d="M0 0L10 10" stroke="currentColor"')
    expect(out).toContain('viewBox="0 0 24 24"')
    expect(out).not.toMatch(/script|onload|foreignObject|iframe|evil\.example|javascript:/i)
  })
})
