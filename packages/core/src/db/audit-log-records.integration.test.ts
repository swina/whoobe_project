import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

// Needs a DISPOSABLE database (it migrates it and empties tables), see data-objects-records.integration.test.ts for the command.
const url = process.env.PORTABILITY_TEST_DATABASE_URL;

describe.skipIf(!url)('audit log: append only, redacted, listed and purged', () => {
  let db: typeof import('./client.js');
  let sql: any;
  let rec: typeof import('./audit-log-records.js');
  let schema: typeof import('./audit-log-schema.js');

  const reset = async () => {
    // the guard refuses TRUNCATE on purpose: the test switches it off for its own clean-up
    await db.getDb().execute(sql.raw('ALTER TABLE audit_log DISABLE TRIGGER audit_log_guard_truncate'));
    await db.getDb().execute(sql.raw('TRUNCATE TABLE audit_log'));
    await db.getDb().execute(sql.raw('ALTER TABLE audit_log ENABLE TRIGGER audit_log_guard_truncate'));
  };
  const entry = (over: Record<string, unknown> = {}) => ({
    actor: { type: 'user' as const, id: 'u1', label: 'admin@example.com' },
    ip: '10.0.0.1',
    action: 'user.update',
    targetType: 'user',
    targetId: 'u2',
    targetLabel: 'editor@example.com',
    before: { displayName: 'Old' },
    after: { displayName: 'New' },
    ...over,
  });
  const fails = async (p: Promise<unknown>) => {
    try { await p; } catch (e: any) { return `${e?.message ?? ''} ${e?.cause?.message ?? ''}`; }
    return null;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import('./client.js');
    await (await import('./bootstrap.js')).runMigrations();
    sql = (await import('drizzle-orm')).sql;
    rec = await import('./audit-log-records.js');
    schema = await import('./audit-log-schema.js');
  });
  afterAll(async () => { await db?.closeDb(); });
  beforeEach(reset);

  it('writes a row with the actor, the target and the two sides', async () => {
    const id = await rec.insertAudit(entry({ requestId: 'req-1' }));
    const { rows, total } = await rec.listAudit();
    expect(total).toBe(1);
    expect(rows[0]).toMatchObject({ id, actorType: 'user', actorId: 'u1', actorLabel: 'admin@example.com', ip: '10.0.0.1', action: 'user.update', targetType: 'user', targetId: 'u2', targetLabel: 'editor@example.com', before: { displayName: 'Old' }, after: { displayName: 'New' }, requestId: 'req-1' });
    expect(rows[0].at).toBeInstanceOf(Date);
  });

  it('never stores what looks like a secret, whatever the caller passed', async () => {
    await rec.insertAudit(entry({ before: { password: 'hunter2' }, after: { providerConfig: { apiKey: 'k-live-123' }, note: 'ok' } }));
    const dump = JSON.stringify((await db.getDb().execute(sql.raw('SELECT * FROM audit_log'))) as unknown);
    expect(dump).not.toContain('hunter2');
    expect(dump).not.toContain('k-live-123');
    expect(dump).toContain('"note":"ok"');
  });

  it('the database refuses an UPDATE, a plain DELETE and a TRUNCATE', async () => {
    await rec.insertAudit(entry());
    expect(await fails(db.getDb().execute(sql.raw("UPDATE audit_log SET action = 'x'")))).toMatch(/append only/);
    expect(await fails(db.getDb().execute(sql.raw('DELETE FROM audit_log')))).toMatch(/append only/);
    expect(await fails(db.getDb().execute(sql.raw('TRUNCATE TABLE audit_log')))).toMatch(/append only/);
    expect((await rec.listAudit()).total).toBe(1);
  });

  it('the unlock of the retention job lasts one transaction and does not leak to the next statement', async () => {
    await rec.insertAudit(entry());
    await db.getDb().transaction(async (tx: any) => {
      await tx.execute(sql`SELECT set_config('whoobe.audit_purge', 'on', true)`);
    });
    expect(await fails(db.getDb().execute(sql.raw('DELETE FROM audit_log')))).toMatch(/append only/);
  });

  it('lists newest first, filters by action, prefix, actor, target and time, and counts the total', async () => {
    await rec.insertAudit(entry({ action: 'user.create', targetId: 'a' }));
    await rec.insertAudit(entry({ action: 'role.update', targetType: 'role', targetId: 'r1', actor: { type: 'user', id: 'u9', label: 'other' } }));
    await rec.insertAudit(entry({ action: 'user.delete', targetId: 'b' }));
    const all = await rec.listAudit();
    expect(all.total).toBe(3);
    expect(all.rows.map((r) => r.action)).toEqual(['user.delete', 'role.update', 'user.create']);
    expect((await rec.listAudit({ action: 'role.update' })).rows).toHaveLength(1);
    expect((await rec.listAudit({ action: 'user.' })).rows.map((r) => r.action).sort()).toEqual(['user.create', 'user.delete']);
    expect((await rec.listAudit({ actor: 'u9' })).total).toBe(1);
    expect((await rec.listAudit({ targetType: 'role', targetId: 'r1' })).total).toBe(1);
    expect((await rec.listAudit({ from: new Date(Date.now() + 60_000) })).total).toBe(0);
    const page = await rec.listAudit({ limit: 1, offset: 1 });
    expect(page.rows).toHaveLength(1);
    expect(page.total).toBe(3);
  });

  it('a "%" or "_" in a prefix filter matches itself, not everything', async () => {
    await rec.insertAudit(entry({ action: 'user.create' }));
    expect((await rec.listAudit({ action: '%.' })).total).toBe(0);
  });

  it('purge removes only rows older than the retention, in batches, and leaves a row saying so', async () => {
    const old = new Date(Date.now() - 400 * 86_400_000);
    for (let i = 0; i < 5; i++) await db.getDb().insert(schema.auditLog).values({ at: old, actorType: 'user', action: 'user.update', targetId: `old-${i}` });
    await rec.insertAudit(entry({ targetId: 'recent' }));
    expect(await rec.purgeAudit(365, 2)).toBe(5);
    const { rows } = await rec.listAudit();
    expect(rows.map((r) => r.action).sort()).toEqual(['audit.purge', 'user.update']);
    expect(rows.find((r) => r.action === 'audit.purge')!.after).toMatchObject({ removed: 5, olderThanDays: 365 });
    expect(rows.find((r) => r.action === 'user.update')!.targetId).toBe('recent');
  });

  it('retention 0 keeps everything', async () => {
    await db.getDb().insert(schema.auditLog).values({ at: new Date('2000-01-01T00:00:00Z'), actorType: 'system', action: 'old.thing' });
    expect(await rec.purgeAudit(0)).toBe(0);
    expect((await rec.listAudit()).total).toBe(1);
  });

  it('insertAuditSafe counts a failed write and reports it, without throwing', async () => {
    const before = rec.auditStats.lost;
    const seen: unknown[] = [];
    await rec.insertAuditSafe({ ...entry(), action: undefined as any }, (e) => seen.push(e));
    expect(rec.auditStats.lost).toBe(before + 1);
    expect(seen).toHaveLength(1);
  });
});
