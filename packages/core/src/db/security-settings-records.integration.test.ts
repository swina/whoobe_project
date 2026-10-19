import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

// Needs a DISPOSABLE database (it migrates it and empties tables), see data-objects-records.integration.test.ts for the command.
const url = process.env.PORTABILITY_TEST_DATABASE_URL;

describe.skipIf(!url)('security settings: defaults, validation, who must use a second factor', () => {
  let db: typeof import('./client.js');
  let sql: any;
  let rec: typeof import('./security-settings-records.js');
  let schema: typeof import('./auth-schema.js');
  let roleA = '';
  let roleB = '';
  let userId = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import('./client.js');
    await (await import('./bootstrap.js')).runMigrations();
    sql = (await import('drizzle-orm')).sql;
    rec = await import('./security-settings-records.js');
    schema = await import('./auth-schema.js');
  });
  afterAll(async () => { await db.closeDb?.(); });

  beforeEach(async () => {
    await db.getDb().execute(sql.raw('TRUNCATE TABLE security_settings, user_roles, users, roles CASCADE'));
    const d = db.getDb();
    [{ id: roleA }, { id: roleB }] = await d.insert(schema.roles).values([{ name: 'a' }, { name: 'b' }]).returning({ id: schema.roles.id });
    [{ id: userId }] = await d.insert(schema.users).values({ email: 'u@example.com', passwordHash: 'x', displayName: 'U' }).returning({ id: schema.users.id });
  });

  it('answers the defaults when nothing was saved: nobody must enrol, 8 characters', async () => {
    const s = await rec.getSecuritySettings();
    expect(s.requireMfaRoleIds).toEqual([]);
    expect(s.passwordPolicy).toEqual({ minLength: 8, requireClasses: false });
    expect(await rec.userMustUseMfaNow(userId)).toBe(false);
  });

  it('saves a partial update and keeps what it did not mention', async () => {
    await rec.updateSecuritySettings({ passwordMinLength: 14 });
    await rec.updateSecuritySettings({ requireMfaRoleIds: [roleA] });
    const s = await rec.getSecuritySettings();
    expect(s.passwordPolicy.minLength).toBe(14);
    expect(s.requireMfaRoleIds).toEqual([roleA]);
    expect((await db.getDb().execute(sql.raw('SELECT count(*)::int AS n FROM security_settings'))).rows[0]).toEqual({ n: 1 });
  });

  it('requires a second factor only of users holding a listed role', async () => {
    await rec.updateSecuritySettings({ requireMfaRoleIds: [roleA] });
    expect(await rec.userMustUseMfaNow(userId)).toBe(false);
    await db.getDb().insert(schema.userRoles).values({ userId, roleId: roleB });
    expect(await rec.userMustUseMfaNow(userId)).toBe(false);
    await db.getDb().insert(schema.userRoles).values({ userId, roleId: roleA });
    expect(await rec.userMustUseMfaNow(userId)).toBe(true);
  });

  it('refuses bad input and unknown roles, and the database refuses a second row and a short minimum', async () => {
    expect(await rec.parseSecuritySettingsInput({ passwordMinLength: 7 })).toMatchObject({ ok: false });
    expect(await rec.parseSecuritySettingsInput({ passwordMinLength: 129 })).toMatchObject({ ok: false });
    expect(await rec.parseSecuritySettingsInput({ passwordMinLength: 9.5 })).toMatchObject({ ok: false });
    expect(await rec.parseSecuritySettingsInput({ passwordRequireClasses: 'yes' })).toMatchObject({ ok: false });
    expect(await rec.parseSecuritySettingsInput({ requireMfaRoleIds: 'x' })).toMatchObject({ ok: false });
    expect(await rec.parseSecuritySettingsInput({ requireMfaRoleIds: ['00000000-0000-4000-8000-000000000000'] })).toMatchObject({ ok: false });
    expect(await rec.parseSecuritySettingsInput({ requireMfaRoleIds: [roleA, roleA], passwordMinLength: 12 })).toEqual({
      ok: true, value: { requireMfaRoleIds: [roleA], passwordMinLength: 12 },
    });
    await expect(db.getDb().execute(sql.raw('INSERT INTO security_settings (id) VALUES (2)'))).rejects.toBeTruthy();
    await expect(db.getDb().execute(sql.raw('INSERT INTO security_settings (id, password_min_length) VALUES (1, 4)'))).rejects.toBeTruthy();
  });
});
