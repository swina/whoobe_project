// The inferred response schema feeds the field / column pickers: a field must be offered even when the first record lacks it.
import { describe, it, expect } from 'vitest'
import { inferSchema } from '../../../apps/gateway/src/schema-inferrer'

const keys = (fields?: { key: string }[]) => (fields ?? []).map((f) => f.key)

describe('gateway schema inferrer: arrays are described by all their items', () => {
  it('offers a field that the first record does not have', () => {
    const s = inferSchema([{ id: 1, name: 'a' }, { id: 2, name: 'b', email: 'b@x.io' }])
    expect(keys(s.items?.fields)).toEqual(['id', 'name', 'email'])
    expect(s.items?.fields?.find((f) => f.key === 'email')).toMatchObject({ type: 'string', nullable: true, sample: 'b@x.io' })
  })
  it('takes the type from the first record that has a value when the first one has null', () => {
    const s = inferSchema([{ id: 1, email: null }, { id: 2, email: 'b@x.io' }])
    expect(s.items?.fields?.find((f) => f.key === 'email')).toMatchObject({ type: 'string', nullable: true })
  })
  it('keeps a field that is always there non-nullable', () => {
    const s = inferSchema([{ id: 1 }, { id: 2 }])
    expect(s.items?.fields?.[0]).toMatchObject({ key: 'id', type: 'number', nullable: false })
  })
  it('merges nested objects and arrays inside the items', () => {
    const s = inferSchema([{ id: 1, owner: { name: 'a' }, tags: [] }, { id: 2, owner: { name: 'b', mail: 'm' }, tags: [{ label: 'x' }, { label: 'y', color: 'red' }] }])
    const owner = s.items?.fields?.find((f) => f.key === 'owner')
    const tags = s.items?.fields?.find((f) => f.key === 'tags')
    expect(keys(owner?.fields)).toEqual(['name', 'mail'])
    expect(tags?.type).toBe('array')
    expect(keys(tags?.items?.fields)).toEqual(['label', 'color'])
  })
  it('handles an object response with an array field, an empty array, null items and non-JSON bodies', () => {
    const s = inferSchema({ products: [{ a: 1 }, null, { a: 2, b: 3 }], none: [] })
    const products = s.fields?.find((f) => f.key === 'products')
    expect(keys(products?.items?.fields)).toEqual(['a', 'b'])
    expect(s.fields?.find((f) => f.key === 'none')?.items?.type).toBe('any')
    expect(inferSchema([])).toEqual({ type: 'array', items: { type: 'any', nullable: true, sample: undefined } })
    expect(inferSchema('text')).toEqual({ type: 'object', fields: [] })
    expect(inferSchema(null)).toEqual({ type: 'object', fields: [] })
  })
  it('stays fast on a large response', () => {
    const body = Array.from({ length: 5000 }, (_, i) => ({ id: i, ...(i === 4000 ? { late: true } : {}) }))
    const t = Date.now()
    const s = inferSchema(body)
    expect(Date.now() - t).toBeLessThan(500)
    // beyond the cap a field is not seen: documented limit
    expect(keys(s.items?.fields)).toEqual(['id'])
  })
})
