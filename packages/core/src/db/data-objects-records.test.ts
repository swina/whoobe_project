import { describe, it, expect } from 'vitest';
import { sortDataObjects, compareSortValues, getSortValue, planBulkImport, uniqueValuesToCheck, UniqueViolationError, type DataObjectRecord } from './data-objects-records.js';

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

describe('planBulkImport', () => {
  let n = 0;
  const makeKey = () => `gen-${++n}`;
  const existing = new Map([['a', 'id-a']]);

  it('inserts rows with a new key and makes a key for rows without one', () => {
    const plan = planBulkImport([{ key: 'b', attributes: { x: 1 } }, { attributes: { x: 2 } }], existing, 'skip', makeKey);
    expect(plan.inserts.map((i) => i.key)).toEqual(['b', 'gen-1']);
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toBe(0);
  });

  it('skips a row whose key exists when onConflict is skip', () => {
    const plan = planBulkImport([{ key: 'a', attributes: { x: 1 } }, { key: 'c', attributes: {} }], existing, 'skip', makeKey);
    expect(plan.inserts.map((i) => i.key)).toEqual(['c']);
    expect(plan.skipped).toBe(1);
  });

  it('updates the existing object when onConflict is update', () => {
    const plan = planBulkImport([{ key: 'a', attributes: { x: 9 } }], existing, 'update', makeKey);
    expect(plan.updates).toEqual([{ id: 'id-a', attributes: { x: 9 } }]);
    expect(plan.inserts).toEqual([]);
  });

  it('counts a key repeated in the chunk once, the last row winning', () => {
    const plan = planBulkImport([{ key: 'z', attributes: { v: 1 } }, { key: 'z', attributes: { v: 2 } }], existing, 'skip', makeKey);
    expect(plan.inserts).toEqual([{ key: 'z', attributes: { v: 2 } }]);
  });
});

describe('uniqueValuesToCheck', () => {
  const fields = [
    { name: 'email', title: 'Email', unique: true },
    { name: 'sku', unique: true, localized: true },
    { name: 'name' },
  ];

  it('returns only unique fields that hold a value', () => {
    expect(uniqueValuesToCheck(fields, { email: 'a@b.it', sku: 'X1', name: 'A' }).map((f) => [f.name, f.value, f.localized])).toEqual([
      ['email', 'a@b.it', false],
      ['sku', 'X1', true],
    ]);
  });

  it('never treats an empty value as a duplicate', () => {
    expect(uniqueValuesToCheck(fields, { email: '', sku: null })).toEqual([]);
    expect(uniqueValuesToCheck(fields, {})).toEqual([]);
    expect(uniqueValuesToCheck([{ name: 'tags', unique: true }], { tags: [] })).toEqual([]);
  });

  it('keeps 0 and false as real values', () => {
    expect(uniqueValuesToCheck([{ name: 'n', unique: true }, { name: 'b', unique: true }], { n: 0, b: false }).map((f) => f.name)).toEqual(['n', 'b']);
  });
});

describe('UniqueViolationError', () => {
  it('names the field title and the value, and carries a code', () => {
    const e = new UniqueViolationError('email', 'Email', 'a@b.it');
    expect(e.code).toBe('UNIQUE_VIOLATION');
    expect(e.message).toContain('"Email" must be unique');
    expect(e.message).toContain('"a@b.it"');
  });
});
