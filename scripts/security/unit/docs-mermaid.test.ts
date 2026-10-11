// Diagrams in documentation sites: a ```mermaid block is drawn in the browser, with the library copied next to the generated site
// and loaded only on pages that have one; the code stays when it cannot be drawn.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT_DIR } from '../lib/config'
import { DOCS_JS, pageHtml } from '../../../packages/publish/src/docs-site'

const read = (p: string) => readFileSync(join(ROOT_DIR, p), 'utf8')
const page = { title: 'T', description: null, html: '<p>x</p>', headings: [], breadcrumbs: [], prev: null, next: null, route: '/', path: 'a.md', updatedAt: null }
const render = (o: { hasCode: boolean; hasMermaid?: boolean }) => pageHtml({ site: 'S', page, html: '<p>x</p>', nav: [], base: '/', ...o })

describe('documentation site: mermaid', () => {
  it('the page says whether it needs the diagram library, separately from the code highlighter', () => {
    expect(render({ hasCode: false, hasMermaid: true })).toMatch(/data-code="0" data-mermaid="1"/)
    expect(render({ hasCode: true })).toMatch(/data-code="1" data-mermaid="0"/)
  })
  it('the script is valid and loads the library only for a page with a diagram', () => {
    expect(() => new Function(DOCS_JS)).not.toThrow()
    expect(DOCS_JS).toContain("getAttribute('data-mermaid') === '1'")
    expect(DOCS_JS).toContain('assets/mermaid/mermaid.min.js')
  })
  it('renders with the strict security level, from the library copied into the site (no CDN)', () => {
    expect(DOCS_JS).toContain("securityLevel: 'strict'")
    expect(DOCS_JS).not.toMatch(/https?:\/\/[^'"\s]*mermaid/i)
    expect(read('packages/publish/src/docs-site.ts')).toContain("join(packageRoot('mermaid'), 'dist', 'mermaid.min.js')")
  })
  it('the code highlighter and the copy button leave diagram blocks alone, and a failed diagram keeps its code', () => {
    expect(DOCS_JS).toContain(':not(.language-mermaid)')
    expect(DOCS_JS).toContain("pre.querySelector('code.language-mermaid')) return")
    expect(DOCS_JS).toContain('This diagram could not be drawn.')
  })
  it('the editor and the dashboard draw them with the same strict level and keep the code on failure', () => {
    for (const f of ['apps/whoobe-one-spike/src/docs-mermaid.ts', 'apps/admin-dashboard/src/utils/docs-mermaid.ts']) {
      const src = read(f)
      expect(src, f).toContain("securityLevel: 'strict'")
      expect(src, f).toContain('code.language-mermaid')
      expect(src, f).toContain('catch')
    }
    expect(read('apps/whoobe-one-spike/src/views/DocsView.vue')).toContain('drawMermaid(content.value)')
    expect(read('apps/admin-dashboard/src/components/websites/MasterDocsDocTab.vue')).toContain('drawMermaid(previewEl.value)')
  })
})
