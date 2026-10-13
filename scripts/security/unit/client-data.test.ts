import { describe, it, expect } from 'vitest';
import { validateClientScopes, dataScopeAllows, parseClientDataQuery, projectClientObject } from '../../../packages/core/src/server';

const fields = [{ name: 'title', title: 'T', fieldType: 'text' }, { name: 'price', title: 'P', fieldType: 'number' }, { name: 'published', title: 'x', fieldType: 'text' }] as any;

describe('data scopes', () => {
  it('accepts data:read for a class and the wildcard, normalises duplicates', () => {
    const r = validateClientScopes(['data:read:Product', 'data:read:Product', 'data:read:*']);
    expect(r).toEqual({ ok: true, scopes: ['data:read:Product', 'data:read:*'] });
  });
  it('refuses unknown actions, separators and control characters', () => {
    for (const s of ['data:write:Product', 'data:read:A:B', 'data:read:', 'data:read: Product', 'data:read:A\u0000']) {
      expect(validateClientScopes([s]).ok, s).toBe(false);
    }
  });
  it('allows only the named class, or all with *', () => {
    expect(dataScopeAllows(['data:read:Product'], 'read', 'Product')).toBe(true);
    expect(dataScopeAllows(['data:read:Product'], 'read', 'Order')).toBe(false);
    expect(dataScopeAllows(['data:read:*'], 'read', 'Order')).toBe(true);
    expect(dataScopeAllows(['gateway:call:Shop:*:*'], 'read', 'Product')).toBe(false);
  });
});

describe('client data query', () => {
  it('defaults', () => {
    expect(parseClientDataQuery({}, fields)).toEqual({ filters: [], orderBy: undefined, limit: 50, offset: 0, locale: undefined });
  });
  it('parses filters, order, paging', () => {
    const q = parseClientDataQuery({ filter: ['title:contains:a:b', 'price:gt:5'], orderBy: 'price', dir: 'desc', limit: '10', offset: '20', locale: 'it' }, fields) as any;
    expect(q.filters).toEqual([{ field: 'title', operator: 'contains', value: 'a:b' }, { field: 'price', operator: 'gt', value: '5' }]);
    expect(q.orderBy).toEqual({ field: 'price', direction: 'desc' });
    expect([q.limit, q.offset, q.locale]).toEqual([10, 20, 'it']);
  });
  it('refuses unknown or internal fields, bad operators, limits, locale', () => {
    for (const q of [
      { filter: 'secret:eq:1' }, { filter: 'published:eq:false' }, { filter: 'id:eq:1' }, { filter: 'title:regex:x' }, { filter: 7 },
      { filter: Array(6).fill('title:eq:a') }, { orderBy: 'createdAt' }, { orderBy: 'price', dir: 'up' }, { limit: '101' }, { limit: '0' },
      { offset: '-1' }, { locale: '../x' }, { filter: 'title:eq:' + 'x'.repeat(201) },
    ]) expect('error' in (parseClientDataQuery(q as any, fields) as any), JSON.stringify(q).slice(0, 50)).toBe(true);
  });
});

describe('projection', () => {
  it('keeps only the content and the class fields', () => {
    const out = projectClientObject({
      id: 'i', key: 'k', locale: 'en', translationGroupId: 'g', publishedAt: null, updatedAt: '2026-01-01',
      attributes: { title: 'A', price: 3, leaked: 'no' },
      ...({ classId: 'c', path: '/x', workflowState: 'w', pimcoreId: 'p', createdAt: 'z' } as any),
    }, fields);
    expect(Object.keys(out).sort()).toEqual(['attributes', 'id', 'key', 'locale', 'publishedAt', 'translationGroupId', 'updatedAt']);
    expect(out.attributes).toEqual({ title: 'A', price: 3 });
  });
});
