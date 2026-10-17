import { describe, it, expect } from 'vitest'
import { formatBoundContent, resolveRecordField, resolveFieldFromRecord } from './resolve.js'

describe('formatBoundContent', () => {
  it('escapes plain bound text', () => {
    const r = formatBoundContent('<b>hi</b>', null)
    expect(r.content).toBe('&lt;b&gt;hi&lt;/b&gt;')
    expect(r.className).toBeUndefined()
  })

  it('produces a sanitized anchor for link transforms', () => {
    const r = formatBoundContent('https://example.com/x', { type: 'url', options: { linkText: 'value', openInNewTab: true } })
    expect(r.content).toBe('<a href="https://example.com/x" target="_blank" rel="noopener noreferrer">https://example.com/x</a>')
  })

  it('applies valueMap className', () => {
    const r = formatBoundContent('a', { type: 'valueMap', options: { rules: [{ match: 'a', label: 'Yes', className: 'bg-green-500' }], fallbackLabel: '', fallbackClassName: '' } })
    expect(r.content).toBe('Yes')
    expect(r.className).toBe('bg-green-500')
  })

  it('handles empty/missing values', () => {
    expect(formatBoundContent(null, null).content).toBe('')
    expect(formatBoundContent(undefined, null).content).toBe('')
    expect(formatBoundContent('', null, 'markdown').content).toBe('')
  })

  describe('by field type', () => {
    it('converts a markdown field to HTML when no transform is set', () => {
      const c = formatBoundContent('## Title\n\nSome **bold** text.\n\n- one\n- two', null, 'markdown').content
      expect(c).toContain('<h2>Title</h2>')
      expect(c).toContain('<strong>bold</strong>')
      expect(c).toContain('<li>one</li>')
      expect(formatBoundContent('**x**', { type: 'none' }, 'markdown').content).toContain('<strong>x</strong>')
    })

    it('renders GitHub tables and fenced code', () => {
      const c = formatBoundContent('| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nconst x = 1\n```', null, 'markdown').content
      expect(c).toContain('<table>')
      expect(c).toContain('<td>1</td>')
      expect(c).toContain('<pre>')
    })

    it('sanitises what a markdown field carries: scripts, handlers and javascript: links are removed', () => {
      const c = formatBoundContent('<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n<img src=x onerror=alert(1)>', null, 'markdown').content
      expect(c).not.toContain('<script')
      expect(c).not.toContain('javascript:')
      expect(c).not.toContain('onerror')
    })

    it('keeps a wysiwyg field as markup, sanitised', () => {
      const c = formatBoundContent('<p>Hello <b>you</b></p><script>alert(1)</script>', null, 'wysiwyg').content
      expect(c).toBe('<p>Hello <b>you</b></p>')
    })

    it('lets a configured transform win, and keeps other field types as escaped text', () => {
      expect(formatBoundContent('# Not converted', { type: 'truncate', options: { maxLength: 5, suffix: '' } } as never, 'markdown').content).not.toContain('<h1>')
      expect(formatBoundContent('<b>hi</b>', null, 'input').content).toBe('&lt;b&gt;hi&lt;/b&gt;')
      expect(formatBoundContent('<b>hi</b>', null, undefined).content).toBe('&lt;b&gt;hi&lt;/b&gt;')
    })
  })
})

describe('resolveRecordField', () => {
  it('reads attributes by default', () => {
    expect(resolveRecordField({ attributes: { firstname: 'A' } }, 'firstname')).toBe('A')
  })
  it('reads top-level fields', () => {
    expect(resolveRecordField({ id: 'abc', attributes: {} }, 'id')).toBe('abc')
  })
  it('returns undefined for missing record/field', () => {
    expect(resolveRecordField(null, 'x')).toBeUndefined()
    expect(resolveRecordField({ attributes: {} }, 'x')).toBeUndefined()
  })
})

describe('resolveFieldFromRecord', () => {
  it('resolves a plain top-level field', () => {
    expect(resolveFieldFromRecord({ title: 'Widget' }, 'title')).toBe('Widget')
  })

  it('resolves a full dot-path when the record actually has that shape', () => {
    expect(resolveFieldFromRecord({ nested: { title: 'Widget' } }, 'nested.title')).toBe('Widget')
  })

  it('falls back to the last path segment when the record is a repeater item stripped of the prefix', () => {
    // Regression test: a route whose response is `{ products: [...] }`
    // produces field paths like "products.title" in the picker. Once a
    // container repeats over "products", each child's context record is one
    // item - `{ title: 'Widget' }`, not `{ products: { title: 'Widget' } }` -
    // so the full path's first segment doesn't exist on it and this must
    // fall back to just "title" against the same record.
    expect(resolveFieldFromRecord({ id: 1, title: 'Widget' }, 'products.title')).toBe('Widget')
  })

  it('returns undefined when neither the full path nor the last segment resolve', () => {
    expect(resolveFieldFromRecord({ id: 1 }, 'products.title')).toBeUndefined()
  })

  it('returns undefined for missing record/fieldPath', () => {
    expect(resolveFieldFromRecord(null, 'title')).toBeUndefined()
    expect(resolveFieldFromRecord({ title: 'Widget' }, '')).toBeUndefined()
  })

  it('supports key[index] array segments in the full path', () => {
    expect(resolveFieldFromRecord({ items: [{ title: 'First' }, { title: 'Second' }] }, 'items[1].title')).toBe('Second')
  })
})
