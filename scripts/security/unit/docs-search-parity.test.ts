// The search of a published documentation site runs the options written in the generated script (packages/publish/src/docs-site.ts,
// DOCS_JS); the index was built with the options of packages/core/src/docs/search.ts. If the two drift, the static search
// silently returns different (or no) results: this evaluates the script's own options against an index built by core.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { ROOT_DIR } from '../lib/config'
import { buildSearchIndex, loadSearchIndex, searchDocs } from '../../../packages/core/src/docs/search'
import { DOCS_JS } from '../../../packages/publish/src/docs-site'

const MiniSearch = createRequire(join(ROOT_DIR, 'packages/core/package.json'))('minisearch')

const pages = [
  { route: '/guide/install', title: 'Install', description: 'How to install Whoobe', breadcrumb: 'Guides', headings: [{ depth: 2, text: 'Requirements', id: 'requirements' }, { depth: 3, text: 'Città e porte', id: 'citta-e-porte' }], text: 'Run the installer on a Linux server with Docker containers.' },
  { route: '/guide/usage', title: 'Using Whoobe', breadcrumb: 'Guides', headings: [{ depth: 2, text: 'Troubleshooting', id: 'troubleshooting' }], text: 'If the container does not start, read the logs.' },
  { route: '/', title: 'Welcome', breadcrumb: '', headings: [], text: 'Documentation home.' },
]

describe('the generated script searches like the server that built the index', () => {
  const start = DOCS_JS.indexOf('function norm(')
  const end = DOCS_JS.indexOf('var index = null')
  const snippet = DOCS_JS.slice(start, end)
  it('the options can be extracted from the script', () => { expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start) })
  const clientOptions = new Function(`${snippet}; return OPTIONS;`)()
  const json = buildSearchIndex(pages).json
  const server = loadSearchIndex(json)
  const client = MiniSearch.loadJSON(json, clientOptions)

  it.each(['install', 'instal', 'docker', 'container', 'citta', 'Città', 'troubleshoting', 'container logs', 'container docker', 'zzzz', 'WHOOBE', 'requirements', 'usage whoobe'])('%s', (q) => {
    const a = searchDocs(server, q).map((h) => h.id)
    const b = client.search(q).slice(0, 12).map((r: { id: string }) => String(r.id))
    expect(b).toEqual(a)
  })
})
