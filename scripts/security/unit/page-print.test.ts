// "Export PDF" of a page: the dashboard opens the page's preview address with `print=true`, and the editor's public page
// opens the print dialog only for that flag.
import { describe, it, expect } from 'vitest'
import { withPrintFlag } from '../../../apps/admin-dashboard/src/utils/editor-urls'
import { editorPrintUrl, isPrintRequest, PRINT_CSS, stashEditorDoc, takeEditorDoc } from '../../../apps/whoobe-one-spike/src/scripts/print-page'
import { stripEditorRootClasses } from '../../../apps/whoobe-one-spike/src/scripts/editor-root-classes'

describe('withPrintFlag', () => {
  it('adds the flag to an address without a query', () => {
    expect(withPrintFlag('https://cms.example/site/about')).toBe('https://cms.example/site/about?print=true')
  })

  it('keeps the existing query (locale, rootPath, draft) and the hash', () => {
    expect(withPrintFlag('/site/about?locale=en&rootPath=%2Fsite&draft=true#team'))
      .toBe('/site/about?locale=en&rootPath=%2Fsite&draft=true&print=true#team')
  })

  it('does not add it twice', () => {
    expect(withPrintFlag('/site/about?print=true')).toBe('/site/about?print=true')
  })
})

describe('isPrintRequest', () => {
  it('is true only for print=true', () => {
    expect(isPrintRequest('?locale=en&print=true')).toBe(true)
    expect(isPrintRequest('?print=1')).toBe(false)
    expect(isPrintRequest('?locale=en')).toBe(false)
    expect(isPrintRequest('')).toBe(false)
  })
})

describe('PRINT_CSS', () => {
  it('prints the theme backgrounds, unpins the template slots and hides the draft badge', () => {
    expect(PRINT_CSS).toContain('print-color-adjust: exact')
    expect(PRINT_CSS).toContain('.whoobe-page > header')
    expect(PRINT_CSS).toContain('[data-print-hidden] { display: none !important; }')
  })
})

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k) },
    setItem: (k, v) => { m.set(k, String(v)) },
  }
}

describe('editor document handoff (Export PDF from the editor)', () => {
  it('gives back the document left for the same page, once', () => {
    const storage = memoryStorage()
    stashEditorDoc('p1', { id: 'root', css: { container: 'p-4' } }, storage)
    expect(takeEditorDoc('p2', storage)).toBeNull()
    expect(takeEditorDoc('p1', storage)).toEqual({ id: 'root', css: { container: 'p-4' } })
    expect(takeEditorDoc('p1', storage)).toBeNull()
  })

  it('ignores a document older than 10 minutes, and unreadable data', () => {
    const storage = memoryStorage()
    stashEditorDoc('p1', { id: 'root' }, storage)
    expect(takeEditorDoc('p1', storage, Date.now() + 11 * 60 * 1000)).toBeNull()
    storage.setItem('whoobe-print-doc:p1', '{not json')
    expect(takeEditorDoc('p1', storage)).toBeNull()
    expect(storage.length).toBe(0)
  })

  it('builds the page address under the editor base, with the website root path, draft and print', () => {
    const url = editorPrintUrl({ origin: 'https://cms.example', base: '/whoobe-one/', rootPath: '/site', path: '/about', locale: 'it', pageId: 'p1' })
    expect(url).toBe('https://cms.example/whoobe-one/site/about?locale=it&rootPath=%2Fsite&draft=true&print=true&editorDoc=p1')
    expect(editorPrintUrl({ origin: 'http://localhost:3006', base: '/', rootPath: '', path: 'home', locale: '', pageId: 'p2' }))
      .toBe('http://localhost:3006/home?locale=en&draft=true&print=true&editorDoc=p2')
  })

  it('removes the editor-only root classes and keeps the page ones', () => {
    expect(stripEditorRootClasses({ css: { container: 'whoobe-canvas-root flex p-6 bg-slate-900 editor-custom' } }))
      .toEqual({ css: { container: 'flex bg-slate-900' } })
  })
})
