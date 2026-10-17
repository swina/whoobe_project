import { describe, it, expect, afterEach } from 'vitest';
import { buildEvent, countsForLoopGuard, isEndOfFlow, loopLimits, loopVerdict } from './object-events.js';
import type { DataObjectRecord } from './data-objects-records.js';

const rec = { id: 'o1', classId: 'c1', key: 'k', translationGroupId: 'g1', locale: 'en', published: false, workflowState: null, updatedAt: new Date('2026-10-17T00:00:00Z') } as unknown as DataObjectRecord;
const limits = { perActor: 5, perSubscription: 12, windowSeconds: 60 };

describe('isEndOfFlow (header X-Whoobe-Flow)', () => {
  it('only "stop" ends a flow, any case, padded', () => {
    expect(isEndOfFlow('stop')).toBe(true);
    expect(isEndOfFlow(' STOP ')).toBe(true);
    expect(isEndOfFlow(['stop'])).toBe(true);
  });
  it('nothing else does', () => {
    for (const v of [undefined, '', 'start', 'stopp', 'true', 1, null]) expect(isEndOfFlow(v)).toBe(false);
  });
});

describe('buildEvent endOfFlow', () => {
  it('marks the envelope only when asked', () => {
    expect(buildEvent({ type: 'object.updated', changed: ['a'] }, { after: rec }).endOfFlow).toBeUndefined();
    expect(buildEvent({ type: 'object.updated', changed: ['a'] }, { after: rec, endOfFlow: true }).endOfFlow).toBe(true);
  });
});

describe('loopVerdict', () => {
  it('lets a normal burst through and stops the 6th event of one client on one record', () => {
    expect(loopVerdict({ byActor: 4, bySubscription: 4 }, limits)).toBeNull();
    expect(loopVerdict({ byActor: 5, bySubscription: 5 }, limits)).toMatch(/more than 5 events by this API client/);
  });
  it('stops two flows answering each other even when each client is under its own limit', () => {
    expect(loopVerdict({ byActor: 3, bySubscription: 11 }, limits)).toBeNull();
    expect(loopVerdict({ byActor: 3, bySubscription: 12 }, limits)).toMatch(/for this subscription/);
  });
  it('a counter set to 0 is off', () => {
    expect(loopVerdict({ byActor: 99, bySubscription: 99 }, { ...limits, perActor: 0, perSubscription: 0 })).toBeNull();
    expect(loopVerdict({ byActor: 99, bySubscription: 0 }, { ...limits, perActor: 0 })).toBeNull();
  });
});

describe('countsForLoopGuard', () => {
  it('counts API clients, never people, the system or imports', () => {
    expect(countsForLoopGuard({ type: 'api-client', id: 'x' })).toBe(true);
    expect(countsForLoopGuard({ type: 'api-client' })).toBe(false);
    for (const type of ['user', 'system', 'import'] as const) expect(countsForLoopGuard({ type, id: 'x' })).toBe(false);
  });
});

describe('loopLimits (environment)', () => {
  const keys = ['OBJECT_EVENTS_LOOP_MAX', 'OBJECT_EVENTS_LOOP_SUB_MAX', 'OBJECT_EVENTS_LOOP_WINDOW_SECONDS'];
  afterEach(() => { for (const k of keys) delete process.env[k]; });
  it('defaults, overrides, and ignores nonsense', () => {
    expect(loopLimits()).toEqual(limits);
    process.env.OBJECT_EVENTS_LOOP_MAX = '8'; process.env.OBJECT_EVENTS_LOOP_SUB_MAX = '0'; process.env.OBJECT_EVENTS_LOOP_WINDOW_SECONDS = '30';
    expect(loopLimits()).toEqual({ perActor: 8, perSubscription: 0, windowSeconds: 30 });
    process.env.OBJECT_EVENTS_LOOP_MAX = 'abc'; process.env.OBJECT_EVENTS_LOOP_WINDOW_SECONDS = '-3';
    expect(loopLimits()).toMatchObject({ perActor: 5, windowSeconds: 60 });
  });
});
