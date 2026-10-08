// What the dashboard writes for an image in a document, read back by the real renderer: the path is right from any
// document, and the attributes are the ones the renderer accepts.
import { describe, it, expect } from 'vitest'
import { imageMarkdown, isImagePath, relativeDocPath } from '../../../apps/admin-dashboard/src/utils/docs-sites-api'
import { renderMarkdown, resolveRelative } from '../../../packages/core/src/docs/markdown'

describe('relativeDocPath', () => {
  it.each([
    ['index.md', 'images/a.png', 'images/a.png'],
    ['guide/install.md', 'images/a.png', '../images/a.png'],
    ['guide/deep/x.md', 'images/a.png', '../../images/a.png'],
    ['guide/install.md', 'guide/img/a.png', 'img/a.png'],
    ['guide/install.md', 'guide/a.png', 'a.png'],
    ['guide/install.md', 'images/a b&c.png', '../images/a%20b%26c.png'],
    ['a/b.md', 'a/b/c/d.png', 'b/c/d.png'],
  ])('%s -> %s = %s', (doc, file, expected) => {
    const rel = relativeDocPath(doc, file)
    expect(rel).toBe(expected)
    // the renderer resolves it back to the same file from that document
    expect(resolveRelative(doc, decodeURIComponent(rel))).toBe(file)
  })
})

describe('imageMarkdown', () => {
  it('writes the attributes only when chosen', () => {
    expect(imageMarkdown({ alt: 'Logo', target: 'a.png' })).toBe('![Logo](a.png)')
    expect(imageMarkdown({ alt: 'Logo', target: 'a.png', width: '50%', align: 'center' })).toBe('![Logo](a.png){width=50% align=center}')
    expect(imageMarkdown({ alt: 'Logo', target: 'a.png', width: '320', float: 'left', align: 'center' })).toBe('![Logo](a.png){width=320px float=left}')
  })
  it('keeps odd alt text and addresses valid', () => {
    expect(imageMarkdown({ alt: 'a [b]\nc\\', target: 'x.png' })).toBe('![a b c](x.png)')
    expect(imageMarkdown({ alt: 'x', target: 'my file (1).png' })).toBe('![x](<my file (1).png>)')
  })
  it('what it writes renders as chosen', () => {
    const ctx = { currentPath: 'guide/install.md', docRoute: () => null, assetUrl: (p: string) => (p === 'images/a b.png' ? '/dam-asset/x/a%20b.png' : null) }
    const md = imageMarkdown({ alt: 'Logo', target: relativeDocPath('guide/install.md', 'images/a b.png'), width: '33%', float: 'right' })
    const out = renderMarkdown(md, ctx)
    expect(out.warnings).toEqual([])
    expect(out.html).toContain('<img src="/dam-asset/x/a%20b.png" alt="Logo" loading="lazy" class="doc-img doc-img-float-right" style="width:33%" />')
    // an address with spaces and brackets written with <> also renders
    const spaced = renderMarkdown(imageMarkdown({ alt: 'x', target: 'https://example.org/a b (1).png', align: 'left' }), ctx)
    expect(spaced.html).toContain('class="doc-img doc-img-left"')
  })
  it('knows what an image file is', () => {
    expect(['a.PNG', 'b.jpeg', 'c.svg', 'd.webp', 'e.avif'].every(isImagePath)).toBe(true)
    expect(['a.md', 'b.pdf', 'c.png.txt'].some(isImagePath)).toBe(false)
  })
})
