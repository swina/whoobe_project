// Plan 3.9: pure gateway helpers (no stack needed, but run with the suite).
import { describe, it, expect } from 'vitest'
import { resolveFieldPath } from '../../../apps/gateway/src/resolve-field-path'
import { resolveGatewayUrl } from '../../../apps/gateway/src/resolve-gateway-url'
import { applyResultFilters } from '../../../apps/gateway/src/gateway-result-filters'
import { validateSubmittedAttributes } from '../../../apps/gateway/src/public-limits'
import { redactSensitiveValues } from '../../../apps/gateway/src/redact'

describe('resolveFieldPath', () => {
  const data = { a: { b: [{ c: 1 }, { c: 2 }] }, name: 'x' }
  it('walks plain paths and array segments', () => {
    expect(resolveFieldPath(data, 'a.b[1].c')).toBe(2)
    expect(resolveFieldPath(data, 'name')).toBe('x')
  })
  it('never walks the prototype chain', () => {
    for (const p of ['constructor', 'constructor.name', '__proto__', '__proto__.polluted', 'a.__proto__', 'a.constructor.prototype', 'toString', 'hasOwnProperty']) {
      expect(resolveFieldPath(data, p), p).toBeUndefined()
    }
  })
  it('filters cannot read inherited properties either', () => {
    const items = [{ k: 1 }, { k: 2 }]
    expect(applyResultFilters(items, [{ field: 'constructor.name', operator: 'eq', value: 'Object' }])).toEqual([])
  })
})

describe('resolveGatewayUrl', () => {
  it('encodes parameter values so they cannot add path segments, queries or hosts', () => {
    const u = resolveGatewayUrl('https://api.example.com/v1', '/users/{id}', { id: '1/../../admin?x=1#f' })
    expect(u).toBe('https://api.example.com/v1/users/1%2F..%2F..%2Fadmin%3Fx%3D1%23f')
    expect(new URL(u).host).toBe('api.example.com')
  })
  it('rejects dot-segment values that URL parsing would collapse', () => {
    expect(() => resolveGatewayUrl('https://api.example.com/v1', '/users/{id}/orders', { id: '..' })).toThrow()
    expect(() => resolveGatewayUrl('https://api.example.com/v1', '/users/{id}', { id: '.' })).toThrow()
  })
})

describe('validateSubmittedAttributes', () => {
  it('accepts ordinary form data (also non-English field names)', () => {
    expect(validateSubmittedAttributes({ email: 'a@b.c', 'città': 'Roma', 'items[0]': 'x', 'first name': 'A' })).toBeNull()
  })
  it('rejects prototype keys, odd names, too many fields and huge values', () => {
    expect(validateSubmittedAttributes(JSON.parse('{"__proto__": "x"}'))).not.toBeNull()
    expect(validateSubmittedAttributes({ constructor: 'x' })).not.toBeNull()
    expect(validateSubmittedAttributes({ 'a;b': '1' })).not.toBeNull()
    expect(validateSubmittedAttributes({ ['k'.repeat(65)]: '1' })).not.toBeNull()
    expect(validateSubmittedAttributes(Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`f${i}`, '1'])))).not.toBeNull()
    expect(validateSubmittedAttributes({ a: 'x'.repeat(20_001) })).not.toBeNull()
  })
})

describe('redactSensitiveValues', () => {
  it('scrubs credential-looking keys at any depth', () => {
    const out = redactSensitiveValues({ ok: 1, nested: { apiKey: 'k', list: [{ password: 'p', fine: 2 }] }, Authorization: 'Bearer x' }) as any
    expect(out.nested.apiKey).toBe('[REDACTED]')
    expect(out.nested.list[0].password).toBe('[REDACTED]')
    expect(out.Authorization).toBe('[REDACTED]')
    expect(out.ok).toBe(1)
    expect(out.nested.list[0].fine).toBe(2)
  })
})
