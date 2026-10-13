import { describe, it, expect } from 'vitest';
import {
  validateClientScopes, assetScopeAllows, projectClientAsset, collectAssetRefs, expandAssetRefs,
} from '../../../packages/core/src/server';

const A1 = '11111111-1111-4111-8111-111111111111';
const A2 = '22222222-2222-4222-8222-222222222222';
const fields = [
  { name: 'title', title: 'T', fieldType: 'text' },
  { name: 'photo', title: 'P', fieldType: 'image' },
  { name: 'sheet', title: 'S', fieldType: 'manyToOneRelation' },
  { name: 'maker', title: 'M', fieldType: 'manyToOneRelation', relationTarget: 'Maker' },
] as any;
const record = (over: any = {}) => ({
  id: A1, filename: 'a.jpg', folderPath: '/products', mimeType: 'image/jpeg', fileType: 'image', sizeBytes: 10, version: 1, isPublic: false,
  pimcorePath: '/products/a.jpg', s3Key: 'products/a.jpg', updatedAt: '2026-01-01', metadata: { technical: { width: 800, height: 600 } }, cdnMirrors: {}, ...over,
});

describe('asset scopes', () => {
  it('accepts a folder (normalised) and *, drops duplicates', () => {
    expect(validateClientScopes(['assets:read:/products', 'assets:read:products/', 'assets:read:*'])).toEqual({ ok: true, scopes: ['assets:read:/products', 'assets:read:*'] });
  });
  it('refuses write, the root, relative segments and odd characters', () => {
    for (const s of ['assets:write:/a', 'assets:read:', 'assets:read:/', 'assets:read:/a/../b', 'assets:read:/a:b', 'assets:read:/a*', 'assets:read:/a\u0000']) {
      expect(validateClientScopes([s]).ok, s).toBe(false);
    }
  });
  it('a folder allows itself and what is below it, not a sibling with the same start', () => {
    const s = ['assets:read:/products'];
    expect(assetScopeAllows(s, 'read', '/products')).toBe(true);
    expect(assetScopeAllows(s, 'read', '/products/summer')).toBe(true);
    expect(assetScopeAllows(s, 'read', '/products-old')).toBe(false);
    expect(assetScopeAllows(s, 'read', '/other')).toBe(false);
    expect(assetScopeAllows(['assets:read:*'], 'read', '/anything/at/all')).toBe(true);
    expect(assetScopeAllows(['data:read:*'], 'read', '/products')).toBe(false);
  });
});

describe('client asset projection', () => {
  const none = () => null;
  it('shows facts and addresses, not the storage key', () => {
    const out = projectClientAsset(record(), none) as any;
    expect(out).toMatchObject({ id: A1, filename: 'a.jpg', folder: '/products', width: 800, height: 600, url: null, contentPath: `/client/v1/assets/${A1}/content` });
    expect(JSON.stringify(out)).not.toContain('products/a.jpg');
  });
  it('url: the CDN mirror first, then the public address of a public asset, never for a private one', () => {
    const pub = () => 'https://files.example/products/a.jpg';
    expect(projectClientAsset(record(), pub).url).toBeNull();
    expect(projectClientAsset(record({ isPublic: true }), pub).url).toBe('https://files.example/products/a.jpg');
    expect(projectClientAsset(record({ cdnMirrors: { c: { url: 'https://cdn.example/x.jpg' } } }), pub).url).toBe('https://cdn.example/x.jpg');
    expect(projectClientAsset(record({ cdnMirrors: { c: { url: 'http://cdn.example/x.jpg' } } }), none).url).toBeNull();
  });
});

describe('asset references in data objects', () => {
  const attrs = { title: 'x', photo: { assetId: A1 }, sheet: { assetId: A2 }, maker: { id: 'zzz' }, other: { assetId: A1 } };
  it('collects the ids of image and asset fields only (a relation to a class is not an asset)', () => {
    expect(collectAssetRefs(attrs, fields)).toEqual([A1, A2]);
    expect(collectAssetRefs({ photo: { assetId: 'not-a-uuid' } }, fields)).toEqual([]);
  });
  it('expands only the assets the scopes allow; the others keep the bare id', () => {
    const map = new Map([[A1, projectClientAsset(record(), () => null)], [A2, projectClientAsset(record({ id: A2, folderPath: '/private' }), () => null)]]);
    const out = expandAssetRefs(attrs, fields, ['assets:read:/products'], map) as any;
    expect(out.photo.asset.filename).toBe('a.jpg');
    expect(out.sheet).toEqual({ assetId: A2 });
    expect(out.other).toEqual({ assetId: A1 });
    expect(out.maker).toEqual({ id: 'zzz' });
  });
  it('expands lists of references too', () => {
    const map = new Map([[A1, projectClientAsset(record(), () => null)]]);
    const out = expandAssetRefs({ photo: [{ assetId: A1 }, { assetId: A2 }] }, fields, ['assets:read:*'], map) as any;
    expect(out.photo[0].asset.id).toBe(A1);
    expect(out.photo[1]).toEqual({ assetId: A2 });
  });
});
