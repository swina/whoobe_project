import { describe, expect, it } from 'vitest';
import { auditRetentionDays, changedOnly, csvCell, pickAllowed, redactForAudit, REDACTED, SECRET_CHANGED } from './audit-log.js';

describe('redactForAudit: the safety net behind the allow-lists', () => {
  it('hides a value whose key looks like a credential, at any depth, and keeps the rest', () => {
    const out = redactForAudit({
      email: 'a@example.com',
      password: 'hunter2',
      nested: { apiKey: 'k-123', siteKey: 's', token: 't', totpSecret: 'x', authorization: 'Bearer y', fine: 'ok' },
      list: [{ passwordHash: 'h', name: 'n' }],
    }) as any;
    expect(out.email).toBe('a@example.com');
    expect(out.password).toBe(REDACTED);
    expect(out.nested).toEqual({ apiKey: REDACTED, siteKey: REDACTED, token: REDACTED, totpSecret: REDACTED, authorization: REDACTED, fine: 'ok' });
    expect(out.list[0]).toEqual({ passwordHash: REDACTED, name: 'n' });
    expect(JSON.stringify(out)).not.toMatch(/hunter2|k-123|Bearer y/);
  });
  it('leaves the marker of a changed secret readable, and a null', () => {
    expect(redactForAudit({ apiKey: SECRET_CHANGED, password: null })).toEqual({ apiKey: SECRET_CHANGED, password: null });
  });
  it('does not take permission keys or similar names for secrets', () => {
    expect(redactForAudit({ permissionKeys: ['users:manage'], keyCount: 2, displayName: 'D' })).toEqual({ permissionKeys: ['users:manage'], keyCount: 2, displayName: 'D' });
  });
  it('cuts long strings, deep structures and huge objects', () => {
    const long = redactForAudit({ a: 'x'.repeat(5000) }) as any;
    expect(long.a.length).toBeLessThan(2100);
    let deep: any = { v: 1 };
    for (let i = 0; i < 12; i++) deep = { d: deep };
    expect(JSON.stringify(redactForAudit(deep))).toContain('[too deep]');
    const wide = redactForAudit(Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`k${i}`, i]))) as any;
    expect(Object.keys(wide)).toHaveLength(80);
  });
  it('turns dates into text and never throws on odd values', () => {
    expect(redactForAudit({ at: new Date('2026-10-18T10:00:00Z'), f: () => 1, u: undefined })).toEqual({ at: '2026-10-18T10:00:00.000Z', f: expect.any(String), u: null });
  });
});

describe('pickAllowed', () => {
  it('keeps only the listed fields that exist', () => {
    expect(pickAllowed({ email: 'e', passwordHash: 'h', name: 'n' }, ['email', 'name', 'missing'])).toEqual({ email: 'e', name: 'n' });
    expect(pickAllowed(null, ['a'])).toEqual({});
  });
});

describe('changedOnly', () => {
  it('keeps the fields that differ, on both sides', () => {
    expect(changedOnly({ name: 'A', active: true, roles: ['x'] }, { name: 'B', active: true, roles: ['x', 'y'] })).toEqual({
      before: { name: 'A', roles: ['x'] },
      after: { name: 'B', roles: ['x', 'y'] },
    });
  });
  it('a field that appears or disappears is shown on one side', () => {
    expect(changedOnly({ a: 1 }, { b: 2 })).toEqual({ before: { a: 1 }, after: { b: 2 } });
    expect(changedOnly({ a: 1 }, { a: 1 })).toEqual({ before: {}, after: {} });
  });
  it('a secret is "changed", never its value, and not at all when the request did not carry one', () => {
    expect(changedOnly({ apiKey: 'old' }, { apiKey: 'new-value' }, ['apiKey'])).toEqual({ before: {}, after: { apiKey: SECRET_CHANGED } });
    expect(changedOnly({ apiKey: 'old' }, { apiKey: '' }, ['apiKey'])).toEqual({ before: {}, after: {} });
    expect(changedOnly({ apiKey: 'old' }, {}, ['apiKey'])).toEqual({ before: {}, after: {} });
  });
});

describe('auditRetentionDays', () => {
  it('365 by default, 0 means forever, junk falls back to the default', () => {
    expect(auditRetentionDays({})).toBe(365);
    expect(auditRetentionDays({ AUDIT_RETENTION_DAYS: '' })).toBe(365);
    expect(auditRetentionDays({ AUDIT_RETENTION_DAYS: '90' })).toBe(90);
    expect(auditRetentionDays({ AUDIT_RETENTION_DAYS: '0' })).toBe(0);
    expect(auditRetentionDays({ AUDIT_RETENTION_DAYS: '-5' })).toBe(365);
    expect(auditRetentionDays({ AUDIT_RETENTION_DAYS: 'abc' })).toBe(365);
  });
});

describe('csvCell', () => {
  it('quotes, doubles quotes, serialises objects and neutralises a formula', () => {
    expect(csvCell('a "b"')).toBe('"a ""b"""');
    expect(csvCell({ x: 1 })).toBe('"{""x"":1}"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell('-2+3')).toBe(`"'-2+3"`);
  });
});
