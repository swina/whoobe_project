import { describe, it, expect } from 'vitest';
import { sortDataObjects, compareSortValues, getSortValue, type DataObjectRecord } from './data-objects-records.js';

function makeRecord(overrides: Partial<DataObjectRecord> & { attributes?: Record<string, unknown> }): DataObjectRecord {
  return {
    id: overrides.id ?? 'id',
    classId: 'class-1',
    key: 'key',
    path: '/key',
    parentId: null,
    translationGroupId: 'group-1',
    locale: 'en',
    published: true,
    workflowState: null,
    attributes: overrides.attributes ?? {},
    pimcoreId: null,
    publishedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('getSortValue', () => {
  it('reads top-level fields (including sort-only ones like createdAt) directly off the record', () => {
    const obj = makeRecord({ id: 'a', createdAt: new Date('2026-02-01T00:00:00Z') });
    expect(getSortValue(obj, 'createdAt')).toEqual(new Date('2026-02-01T00:00:00Z'));
    expect(getSortValue(obj, 'key')).toBe('key');
  });

  it('falls back to attributes for any field not in the top-level allowlist', () => {
    const obj = makeRecord({ attributes: { price: 42 } });
    expect(getSortValue(obj, 'price')).toBe(42);
    expect(getSortValue(obj, 'missing')).toBeUndefined();
  });
});

describe('compareSortValues', () => {
  it('compares numeric values numerically', () => {
    expect(compareSortValues(2, 10)).toBeLessThan(0);
    expect(compareSortValues(10, 2)).toBeGreaterThan(0);
    expect(compareSortValues(5, 5)).toBe(0);
  });

  it('compares date-like values by time when not both numeric', () => {
    expect(compareSortValues('2026-01-01', '2026-06-01')).toBeLessThan(0);
    expect(compareSortValues('2026-06-01', '2026-01-01')).toBeGreaterThan(0);
  });

  it('falls back to string comparison otherwise', () => {
    expect(compareSortValues('banana', 'apple')).toBeGreaterThan(0);
    expect(compareSortValues('apple', 'banana')).toBeLessThan(0);
  });
});

describe('sortDataObjects', () => {
  it('sorts ascending and descending by an attribute field', () => {
    const objs = [
      makeRecord({ id: 'a', attributes: { price: 30 } }),
      makeRecord({ id: 'b', attributes: { price: 10 } }),
      makeRecord({ id: 'c', attributes: { price: 20 } }),
    ];
    expect(sortDataObjects(objs, { field: 'price', direction: 'asc' }).map((o) => o.id)).toEqual(['b', 'c', 'a']);
    expect(sortDataObjects(objs, { field: 'price', direction: 'desc' }).map((o) => o.id)).toEqual(['a', 'c', 'b']);
  });

  it('sorts by a top-level date field', () => {
    const objs = [
      makeRecord({ id: 'a', createdAt: new Date('2026-03-01T00:00:00Z') }),
      makeRecord({ id: 'b', createdAt: new Date('2026-01-01T00:00:00Z') }),
      makeRecord({ id: 'c', createdAt: new Date('2026-02-01T00:00:00Z') }),
    ];
    expect(sortDataObjects(objs, { field: 'createdAt', direction: 'asc' }).map((o) => o.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts null/undefined attribute values last, regardless of direction', () => {
    const objs = [
      makeRecord({ id: 'a', attributes: { price: 10 } }),
      makeRecord({ id: 'b', attributes: {} }), // price undefined
      makeRecord({ id: 'c', attributes: { price: 5 } }),
    ];
    expect(sortDataObjects(objs, { field: 'price', direction: 'asc' }).map((o) => o.id)).toEqual(['c', 'a', 'b']);
    expect(sortDataObjects(objs, { field: 'price', direction: 'desc' }).map((o) => o.id)).toEqual(['a', 'c', 'b']);
  });

  it('does not mutate the input array', () => {
    const objs = [makeRecord({ id: 'a', attributes: { price: 2 } }), makeRecord({ id: 'b', attributes: { price: 1 } })];
    const original = [...objs];
    sortDataObjects(objs, { field: 'price', direction: 'asc' });
    expect(objs).toEqual(original);
  });
});
