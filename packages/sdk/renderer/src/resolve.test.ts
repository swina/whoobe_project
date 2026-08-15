import { describe, it, expect } from 'vitest'
import { formatBoundContent, resolveRecordField } from './resolve.js'

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
