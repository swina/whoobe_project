import { describe, it, expect } from 'vitest';
import { BACKOFF_MS, buildBulkEvent, buildEvent, changedFields, classifyUpdate, nextAttemptPlan, signBody, validateSubscriptionInput, type EventActor } from './object-events.js';
import type { DataObjectRecord } from './data-objects-records.js';

function rec(overrides: Partial<DataObjectRecord> = {}): DataObjectRecord {
  return {
    id: 'obj-1',
    classId: 'class-1',
    key: 'post',
    path: '/',
    parentId: null,
    translationGroupId: 'group-1',
    locale: 'en',
    published: false,
    workflowState: null,
    attributes: { title: 'One', tags: ['a', 'b'], meta: { seo: { title: 'x' } } },
    pimcoreId: null,
    publishedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}
const user: EventActor = { type: 'user', id: 'u1' };
const NOW = new Date('2026-10-16T09:00:00Z');

describe('changedFields', () => {
  it('is empty when nothing differs, whatever the order of the keys', () => {
    expect(changedFields(rec(), rec({ attributes: { meta: { seo: { title: 'x' } }, tags: ['a', 'b'], title: 'One' } }))).toEqual([]);
  });
  it('lists changed, added and removed attributes, sorted', () => {
    const after = rec({ attributes: { title: 'Two', tags: ['a', 'b'], extra: 1 } });
    expect(changedFields(rec(), after)).toEqual(['extra', 'meta', 'title']);
  });
  it('sees a change inside an array and inside a nested object', () => {
    expect(changedFields(rec(), rec({ attributes: { title: 'One', tags: ['a', 'c'], meta: { seo: { title: 'x' } } } }))).toEqual(['tags']);
    expect(changedFields(rec(), rec({ attributes: { title: 'One', tags: ['a', 'b'], meta: { seo: { title: 'y' } } } }))).toEqual(['meta']);
  });
  it('includes key, path and parentId when they change', () => {
    expect(changedFields(rec(), rec({ key: 'other', path: '/x', parentId: 'p' }))).toEqual(['key', 'parentId', 'path']);
  });
  it('does not count published, workflow state or timestamps', () => {
    expect(changedFields(rec(), rec({ published: true, workflowState: 'live', updatedAt: NOW, publishedAt: NOW }))).toEqual([]);
  });
});

describe('classifyUpdate', () => {
  it('gives nothing when nothing changed', () => {
    expect(classifyUpdate(rec(), rec({ updatedAt: NOW }))).toEqual([]);
  });
  it('gives object.updated with the changed names', () => {
    expect(classifyUpdate(rec(), rec({ attributes: { title: 'Two', tags: ['a', 'b'], meta: { seo: { title: 'x' } } } }))).toEqual([
      { type: 'object.updated', changed: ['title'] },
    ]);
  });
  it('a pure publish is object.published only, not object.updated', () => {
    expect(classifyUpdate(rec(), rec({ published: true }))).toEqual([{ type: 'object.published', changed: [] }]);
  });
  it('a pure unpublish is object.unpublished', () => {
    expect(classifyUpdate(rec({ published: true }), rec({ published: false }))).toEqual([{ type: 'object.unpublished', changed: [] }]);
  });
  it('a workflow change is object.transitioned with from and to', () => {
    expect(classifyUpdate(rec({ workflowState: 'draft' }), rec({ workflowState: 'review' }))).toEqual([
      { type: 'object.transitioned', changed: [], transition: { from: 'draft', to: 'review' } },
    ]);
    expect(classifyUpdate(rec(), rec({ workflowState: 'draft' }))[0].transition).toEqual({ from: null, to: 'draft' });
  });
  it('one write that changes attributes, state and publication gives the three events, in a fixed order', () => {
    const out = classifyUpdate(
      rec({ workflowState: 'review' }),
      rec({ workflowState: 'live', published: true, attributes: { title: 'Two', tags: ['a', 'b'], meta: { seo: { title: 'x' } } } }),
    );
    expect(out.map((e) => e.type)).toEqual(['object.updated', 'object.transitioned', 'object.published']);
    expect(out[0].changed).toEqual(['title']);
  });
});

describe('buildEvent', () => {
  const ids = () => 'evt-1';
  it('builds the envelope of an update and never carries attribute values', () => {
    const before = rec();
    const after = rec({ attributes: { title: 'Two' }, published: true, workflowState: 'live', updatedAt: NOW });
    const e = buildEvent({ type: 'object.updated', changed: ['title'] }, { after, actor: user, className: 'Blog', now: NOW, newId: ids });
    expect(e).toEqual({
      id: 'evt-1',
      type: 'object.updated',
      occurredAt: '2026-10-16T09:00:00.000Z',
      class: { id: 'class-1', name: 'Blog' },
      object: { id: 'obj-1', translationGroupId: 'group-1', locale: 'en', key: 'post', published: true, workflowState: 'live', updatedAt: '2026-10-16T09:00:00.000Z' },
      changed: ['title'],
      actor: { type: 'user', id: 'u1' },
    });
    expect(JSON.stringify(e)).not.toContain('Two');
    expect(before.attributes.title).toBe('One');
  });
  it('carries the transition', () => {
    const e = buildEvent({ type: 'object.transitioned', changed: [], transition: { from: 'draft', to: 'review' } }, { after: rec(), actor: user, now: NOW, newId: ids });
    expect(e.transition).toEqual({ from: 'draft', to: 'review' });
    expect(e.class).toEqual({ id: 'class-1' });
  });
  it('created lists every attribute that has a value', () => {
    const e = buildEvent({ type: 'object.created', changed: changedFields(null, rec({ attributes: { title: 'A', empty: undefined, none: null } })) }, { after: rec(), actor: { type: 'api-client', id: 'c1' }, now: NOW, newId: ids });
    expect(e.changed).toEqual(['none', 'title']);
    expect(e.actor).toEqual({ type: 'api-client', id: 'c1' });
  });
  it('a missing actor becomes system', () => {
    const e = buildEvent({ type: 'object.created', changed: [] }, { after: rec(), now: NOW, newId: ids });
    expect(e.actor).toEqual({ type: 'system' });
  });
  it('deleted is built from the row as it was', () => {
    const e = buildEvent({ type: 'object.deleted', changed: [] }, { after: rec({ key: 'gone' }), actor: user, now: NOW, newId: ids });
    expect(e.type).toBe('object.deleted');
    expect(e.object.key).toBe('gone');
  });
  it('generates a UUID when no id factory is given', () => {
    expect(buildEvent({ type: 'object.created', changed: [] }, { after: rec(), now: NOW }).id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('changedFields on create', () => {
  it('treats a missing "before" as all-new', () => {
    expect(changedFields(null, rec({ attributes: { b: 1, a: 2 } }))).toEqual(['a', 'b']);
  });
});

describe('buildBulkEvent', () => {
  it('is one summary with counts and at most 10 first ids', () => {
    const e = buildBulkEvent({ classId: 'class-1', kind: 'import', count: 3000, ids: Array.from({ length: 50 }, (_, i) => `id-${i}`), actor: { type: 'import' }, now: NOW, newId: () => 'evt-b' });
    expect(e).toMatchObject({ id: 'evt-b', type: 'object.bulk', class: { id: 'class-1' }, bulk: { kind: 'import', count: 3000 }, actor: { type: 'import' } });
    expect(e.bulk!.firstIds).toHaveLength(10);
    expect(e.bulk!.firstIds[0]).toBe('id-0');
  });
});

describe('nextAttemptPlan', () => {
  const now = new Date('2026-10-16T09:00:00Z');
  it('waits 1 min, 5 min, 30 min, 2 h, 12 h after the 1st to the 5th failure, then the delivery is dead', () => {
    const waits = [1, 2, 3, 4, 5].map((n) => {
      const plan = nextAttemptPlan(n, now);
      return plan.status === 'retrying' ? plan.nextAttemptAt.getTime() - now.getTime() : -1;
    });
    expect(waits).toEqual([60_000, 300_000, 1_800_000, 7_200_000, 43_200_000]);
    expect(waits).toEqual(BACKOFF_MS);
    expect(nextAttemptPlan(6, now)).toEqual({ status: 'dead' });
  });
});

describe('signBody', () => {
  it('is sha256= HMAC of "timestamp.body", stable and dependent on every part', () => {
    const sig = signBody('secret', '1760000000', '{"a":1}');
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(signBody('secret', '1760000000', '{"a":1}')).toBe(sig);
    expect(signBody('other', '1760000000', '{"a":1}')).not.toBe(sig);
    expect(signBody('secret', '1760000001', '{"a":1}')).not.toBe(sig);
    expect(signBody('secret', '1760000000', '{"a":2}')).not.toBe(sig);
  });
  it('matches an independent computation (what a consumer would do)', async () => {
    const { createHmac } = await import('node:crypto');
    expect(signBody('k', '5', 'body')).toBe('sha256=' + createHmac('sha256', 'k').update('5.body').digest('hex'));
  });
});

describe('validateSubscriptionInput', () => {
  const ok = { name: ' Orders ', events: ['object.created', 'object.created', 'object.bulk'], endpointId: '11111111-1111-4111-8111-111111111111', routeId: '22222222-2222-4222-8222-222222222222' };
  it('accepts a create, trims the name and removes duplicates', () => {
    const r = validateSubscriptionInput(ok);
    expect(r).toEqual({ ok: true, value: { name: 'Orders', events: ['object.created', 'object.bulk'], endpointId: ok.endpointId, routeId: ok.routeId } });
  });
  it('refuses what is missing or wrong on a create', () => {
    for (const bad of [null, [], 'x', { ...ok, name: '  ' }, { ...ok, name: 'x'.repeat(121) }, { ...ok, events: [] }, { ...ok, events: ['object.exploded'] },
      { ...ok, endpointId: 'nope' }, { ...ok, routeId: undefined }, { ...ok, classId: 'nope' }, { ...ok, enabled: 'yes' }, { ...ok, payloadMode: 'fields' },
      { ...ok, ignoreActors: 'engine' }, { ...ok, ignoreActors: Array(21).fill('a') }, { ...ok, ignoreActors: [''] }]) {
      expect(validateSubscriptionInput(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });
  it('a patch takes only what is given', () => {
    expect(validateSubscriptionInput({ enabled: false }, true)).toEqual({ ok: true, value: { enabled: false } });
    expect(validateSubscriptionInput({}, true)).toEqual({ ok: true, value: {} });
    expect(validateSubscriptionInput({ name: '' }, true).ok).toBe(false);
    expect(validateSubscriptionInput({ classId: null }, true)).toEqual({ ok: true, value: { classId: null } });
  });
  it('the signing secret must be an OBJECT_EVENTS_SECRET_ variable name, never another secret of the instance', () => {
    expect(validateSubscriptionInput({ ...ok, signingSecretRef: 'OBJECT_EVENTS_SECRET_ENGINE' }).ok).toBe(true);
    expect(validateSubscriptionInput({ ...ok, signingSecretRef: null }).ok).toBe(true);
    for (const bad of ['DATABASE_URL', 'POSTGRES_PASSWORD', 'object_events_secret_x', 'OBJECT_EVENTS_SECRET_', 'OBJECT_EVENTS_SECRET_a b', 5]) {
      expect(validateSubscriptionInput({ ...ok, signingSecretRef: bad }).ok, String(bad)).toBe(false);
    }
  });
});
