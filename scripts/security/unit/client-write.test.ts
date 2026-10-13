import { describe, it, expect } from 'vitest';
import { validateClientWrite, writtenAssetIds } from '../../../packages/core/src/server';

const fields = [
  { name: 'title', title: 'T', fieldType: 'input', mandatory: true },
  { name: 'body', title: 'B', fieldType: 'wysiwyg' },
  { name: 'views', title: 'V', fieldType: 'numeric' },
  { name: 'cover', title: 'C', fieldType: 'image' },
] as any;
const A1 = '11111111-1111-4111-8111-111111111111';

describe('client write: create', () => {
  it('takes attributes, an optional key and an optional locale', () => {
    const r = validateClientWrite('create', 'Blog', fields, { key: ' hello ', locale: 'it', attributes: { title: 'Ciao' } });
    expect(r).toEqual({ ok: true, write: { key: 'hello', locale: 'it', attributes: { title: 'Ciao' } } });
  });
  it('refuses a missing mandatory field, an unknown field and a wrong type', () => {
    expect(validateClientWrite('create', 'Blog', fields, { attributes: {} }).ok).toBe(false);
    expect(validateClientWrite('create', 'Blog', fields, { attributes: { title: 'x', nope: 1 } }).ok).toBe(false);
    expect(validateClientWrite('create', 'Blog', fields, { attributes: { title: 'x', views: 'many' } }).ok).toBe(false);
  });
  it('never takes published, workflow state, path or any other property', () => {
    for (const extra of [{ published: true }, { workflowState: 'x' }, { path: '/a' }, { classId: 'y' }]) {
      const r = validateClientWrite('create', 'Blog', fields, { attributes: { title: 'x' }, ...extra });
      expect(r.ok, JSON.stringify(extra)).toBe(false);
    }
    expect(validateClientWrite('create', 'Blog', fields, { attributes: { title: 'x', published: true } }).ok).toBe(false);
  });
  it('checks key and locale', () => {
    for (const bad of [{ key: '' }, { key: 'a/b' }, { key: 'x'.repeat(121) }, { key: 5 }, { locale: 'english-us' }, { locale: 3 }]) {
      expect(validateClientWrite('create', 'Blog', fields, { attributes: { title: 'x' }, ...bad }).ok, JSON.stringify(bad)).toBe(false);
    }
  });
  it('cleans script out of rich text', () => {
    const r: any = validateClientWrite('create', 'Blog', fields, { attributes: { title: 'x', body: '<p>hi</p><script>alert(1)</script>' } });
    expect(r.write.attributes.body).toContain('<p>hi</p>');
    expect(r.write.attributes.body).not.toContain('script');
  });
  it('refuses a body that is not an object', () => {
    for (const b of [null, [], 'x', 3]) expect(validateClientWrite('create', 'Blog', fields, b).ok).toBe(false);
  });
});

describe('client write: update', () => {
  it('takes only the fields to change, and null clears an optional one', () => {
    expect(validateClientWrite('update', 'Blog', fields, { attributes: { views: 3 } })).toEqual({ ok: true, write: { attributes: { views: 3 } } });
    expect(validateClientWrite('update', 'Blog', fields, { attributes: { cover: null } }).ok).toBe(true);
  });
  it('does not clear a mandatory field, and refuses nothing-to-change, key and locale', () => {
    expect(validateClientWrite('update', 'Blog', fields, { attributes: { title: null } }).ok).toBe(false);
    expect(validateClientWrite('update', 'Blog', fields, { attributes: {} }).ok).toBe(false);
    expect(validateClientWrite('update', 'Blog', fields, { key: 'k', attributes: { views: 1 } }).ok).toBe(false);
    expect(validateClientWrite('update', 'Blog', fields, { locale: 'it', attributes: { views: 1 } }).ok).toBe(false);
    expect(validateClientWrite('update', 'Blog', fields, { attributes: { nope: 1 } }).ok).toBe(false);
  });
});

describe('assets linked by a write', () => {
  it('finds every assetId, also inside lists and blocks', () => {
    const ids = writtenAssetIds({ cover: { assetId: A1 }, gallery: [{ assetId: A1.replace(/1/g, '2') }, { nested: { assetId: 'not-an-id' } }] });
    expect([...ids].sort()).toEqual([A1, A1.replace(/1/g, '2'), 'not-an-id'].sort());
  });
});
