import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

// Needs a DISPOSABLE database (see src/db/mail-settings.integration.test.ts for how to start one).
const url = process.env.PORTABILITY_TEST_DATABASE_URL;

describe.skipIf(!url)('sessions: stored as hashes (F-056), purged when long expired', () => {
  let db: typeof import('../db/client.js');
  let sql: any;
  let s: typeof import('./session.js');
  const user = '44444444-4444-4444-8444-444444444444';
  const raw = async (q: string): Promise<any[]> => ((await db.getDb().execute(sql.raw(q))) as any).rows;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import('../db/client.js');
    await (await import('../db/bootstrap.js')).runMigrations();
    sql = (await import('drizzle-orm')).sql;
    s = await import('./session.js');
  });
  afterAll(async () => { await db?.closeDb(); });
  beforeEach(async () => {
    for (const t of ['sessions', 'users']) await db.getDb().execute(sql.raw(`TRUNCATE TABLE "${t}" CASCADE`));
    await db.getDb().execute(sql.raw(`INSERT INTO users (id, email, password_hash, display_name) VALUES ('${user}', 'sess@example.com', 'x', 'Sess')`));
  });

  it('the cookie value is never stored: the table holds its SHA-256', async () => {
    const { token } = await s.createSession(user, { ip: '10.0.0.1' });
    const rows = await raw('SELECT id FROM sessions');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(s.hashSessionToken(token));
    expect(rows[0].id).not.toBe(token);
    expect(JSON.stringify(await raw('SELECT * FROM sessions'))).not.toContain(token);
  });

  it('the token works, the stored hash does not (a copy of the table cannot be replayed as a cookie)', async () => {
    const { token } = await s.createSession(user);
    expect((await s.validateSessionToken(token))?.id).toBe(user);
    expect(await s.validateSessionToken(s.hashSessionToken(token))).toBeNull();
    expect(await s.validateSessionToken('not-a-token')).toBeNull();
    expect(await s.validateSessionToken('')).toBeNull();
  });

  it('logout revokes by token; revoking all sessions of a user works', async () => {
    const a = await s.createSession(user);
    const b = await s.createSession(user);
    await s.revokeSession(a.token);
    expect(await s.validateSessionToken(a.token)).toBeNull();
    expect(await s.validateSessionToken(b.token)).not.toBeNull();
    await s.revokeUserSessions(user);
    expect(await s.validateSessionToken(b.token)).toBeNull();
  });

  it('a session from before the change (the raw token as id) no longer validates', async () => {
    await db.getDb().execute(sql.raw(`INSERT INTO sessions (id, user_id, expires_at) VALUES ('legacy-raw-token', '${user}', now() + interval '1 day')`));
    expect(await s.validateSessionToken('legacy-raw-token')).toBeNull();
  });

  it('purge removes sessions expired or revoked long ago, and keeps the rest', async () => {
    const ins = (id: string, expires: string, revoked?: string) =>
      db.getDb().execute(sql.raw(`INSERT INTO sessions (id, user_id, expires_at, revoked_at) VALUES ('${id}', '${user}', ${expires}, ${revoked ?? 'NULL'})`));
    await ins('active', "now() + interval '1 day'");
    await ins('expired-recently', "now() - interval '1 day'");
    await ins('expired-long-ago', "now() - interval '30 days'");
    await ins('revoked-recently', "now() + interval '1 day'", "now() - interval '1 day'");
    await ins('revoked-long-ago', "now() + interval '1 day'", "now() - interval '30 days'");
    expect(await s.purgeStaleSessions()).toBe(2);
    expect((await raw('SELECT id FROM sessions ORDER BY id')).map((r) => r.id)).toEqual(['active', 'expired-recently', 'revoked-recently']);
    expect(await s.purgeStaleSessions()).toBe(0);
  });
});
