import { describe, expect, it } from 'vitest';
import {
  ALL_EVENT_TYPES, buildAssetBulkEvent, buildAssetEvent, buildPageEvent, eventSubject, summariseAsset, validateSubscriptionInput,
} from './object-events.js';

const asset = { id: 'a1', pimcorePath: '/private/forms/x.pdf', folderPath: '/private/forms', filename: 'x.pdf', mimeType: 'application/pdf', fileType: 'document', sizeBytes: 1234, isPublic: false, version: 2 };
const fixed = { now: new Date('2026-10-19T10:00:00Z'), newId: () => 'e1' };

describe('asset and page event envelopes', () => {
  it('describe a file without its bytes or metadata, and a move says where it was', () => {
    const created = buildAssetEvent('asset.created', summariseAsset({ ...asset, metadata: { exif: { gps: 'secret' } } } as any), { ...fixed, actor: { type: 'user', id: 'u1' } });
    expect(created).toEqual({
      id: 'e1', type: 'asset.created', occurredAt: '2026-10-19T10:00:00.000Z', actor: { type: 'user', id: 'u1' },
      asset: { id: 'a1', path: '/private/forms/x.pdf', folder: '/private/forms', filename: 'x.pdf', mimeType: 'application/pdf', fileType: 'document', sizeBytes: 1234, isPublic: false, version: 2 },
    });
    expect(JSON.stringify(created)).not.toContain('secret');
    expect(buildAssetEvent('asset.moved', summariseAsset(asset as any), { ...fixed, from: '/old/x.pdf' }).from).toEqual({ path: '/old/x.pdf' });
    expect('from' in buildAssetEvent('asset.deleted', summariseAsset(asset as any), fixed)).toBe(false);
  });

  it('a folder summary lists at most ten ids and the true count; the end of a flow is carried', () => {
    const ids = Array.from({ length: 25 }, (_, i) => `a${i}`);
    const bulk = buildAssetBulkEvent(ids, { ...fixed, endOfFlow: true });
    expect(bulk).toMatchObject({ type: 'asset.bulk', bulk: { kind: 'delete', count: 25 }, endOfFlow: true });
    expect(bulk.bulk.firstIds).toHaveLength(10);
  });

  it('a page event has the ids and the flag, never the title, the content or the SEO fields', () => {
    const page = { id: 'p1', websiteId: 'w1', slug: 'about', locale: 'en', translationGroupId: 'g1', published: true, publishedAt: new Date('2026-10-19T09:00:00Z'), title: 'Secret title', content: { x: 1 }, seo: { description: 'secret' } };
    const e = buildPageEvent('page.published', page as any, fixed);
    expect(e.page).toEqual({ id: 'p1', websiteId: 'w1', slug: 'about', locale: 'en', translationGroupId: 'g1', published: true, publishedAt: '2026-10-19T09:00:00.000Z' });
    expect(JSON.stringify(e)).not.toMatch(/Secret|"content"|"seo"/);
    expect(e.actor).toEqual({ type: 'system' });
  });

  it('say what the subject is, so the loop guard and the log can use its id', () => {
    expect(eventSubject(buildAssetEvent('asset.created', summariseAsset(asset as any), fixed))).toMatchObject({ type: 'asset', id: 'a1' });
    expect(eventSubject(buildPageEvent('page.unpublished', { id: 'p1', websiteId: null, slug: 's', locale: 'en', translationGroupId: 'g', published: false, publishedAt: null } as any, fixed))).toMatchObject({ type: 'page', id: 'p1', locale: 'en' });
    expect(eventSubject(buildAssetBulkEvent(['a'], fixed))).toBeNull();
  });
});

describe('subscriptions to the new types', () => {
  const base = { name: 'n', endpointId: '11111111-1111-4111-8111-111111111111', routeId: '22222222-2222-4222-8222-222222222222' };
  it('accept asset and page types, with or without object types', () => {
    for (const events of [['asset.created'], ['asset.updated', 'asset.moved', 'asset.deleted', 'asset.bulk'], ['page.published', 'page.unpublished'], ['object.created', 'asset.created', 'page.published']]) {
      expect(validateSubscriptionInput({ ...base, events }).ok, events.join()).toBe(true);
    }
    expect(ALL_EVENT_TYPES).toHaveLength(14);
  });
  it('refuse a class together with a type that has no class, and unknown types', () => {
    const cls = '33333333-3333-4333-8333-333333333333';
    expect(validateSubscriptionInput({ ...base, classId: cls, events: ['object.created'] }).ok).toBe(true);
    for (const events of [['asset.created'], ['object.created', 'page.published']]) {
      const r = validateSubscriptionInput({ ...base, classId: cls, events });
      expect(r).toMatchObject({ ok: false });
      expect((r as { error: string }).error).toMatch(/object events only/);
    }
    expect(validateSubscriptionInput({ ...base, events: ['asset.exploded'] })).toMatchObject({ ok: false });
    expect(validateSubscriptionInput({ ...base, classId: null, events: ['asset.created'] }).ok).toBe(true);
  });
});
