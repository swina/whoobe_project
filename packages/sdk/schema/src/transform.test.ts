import { describe, it, expect } from 'vitest'
import { applyTransform, escapeHtml } from './transform.js'

describe('applyTransform', () => {
  it('none/null returns the raw string/number or empty', () => {
    expect(applyTransform('hello', null)).toEqual({ kind: 'text', text: 'hello' })
    expect(applyTransform(42, { type: 'none' })).toEqual({ kind: 'text', text: '42' })
    expect(applyTransform(null, { type: 'none' })).toEqual({ kind: 'text', text: '' })
    expect(applyTransform({}, { type: 'none' })).toEqual({ kind: 'text', text: '' })
  })

  it('date formats timestamps', () => {
    const r = applyTransform('2026-08-15T12:00:00Z', {
      type: 'date',
      options: { dateStyle: 'medium', includeTime: false },
    })
    expect(r.kind).toBe('text')
    if (r.kind === 'text') expect(r.text).toMatch(/2026/)
  })

  it('url produces a link for safe schemes and text otherwise', () => {
    const link = applyTransform('https://example.com/a', {
      type: 'url',
      options: { linkText: 'value', openInNewTab: true },
    })
    expect(link).toEqual({ kind: 'link', href: 'https://example.com/a', text: 'https://example.com/a', target: '_blank' })

    const blocked = applyTransform('javascript:alert(1)', {
      type: 'url',
      options: { linkText: 'value', openInNewTab: false },
    })
    expect(blocked).toEqual({ kind: 'text', text: 'javascript:alert(1)' })
  })

  it('number formats percent without multiplying', () => {
    const r = applyTransform(42, { type: 'number', options: { style: 'percent', useGrouping: true } })
    expect(r).toEqual({ kind: 'text', text: '42%' })
  })

  it('truncate shortens and appends ellipsis', () => {
    const r = applyTransform('abcdefghij', { type: 'truncate', options: { maxLength: 5, ellipsis: '…' } })
    expect(r).toEqual({ kind: 'text', text: 'abcde…' })
  })

  it('valueMap maps values to labels', () => {
    const r = applyTransform('a', {
      type: 'valueMap',
      options: { rules: [{ match: 'a', label: 'Yes', className: 'bg-green-500' }], fallbackLabel: '', fallbackClassName: '' },
    })
    expect(r).toEqual({ kind: 'text', text: 'Yes', className: 'bg-green-500' })
  })

  it('never throws on bad input', () => {
    expect(() => applyTransform({ weird: true }, { type: 'date', options: { dateStyle: 'full' as any, includeTime: false } })).not.toThrow()
  })
})

describe('escapeHtml', () => {
  it('escapes the five HTML metacharacters', () => {
    expect(escapeHtml(`<b>"it's" & "done"</b>`)).toBe('&lt;b&gt;&quot;it&#39;s&quot; &amp; &quot;done&quot;&lt;/b&gt;')
  })
})
