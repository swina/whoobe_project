import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

// Needs a DISPOSABLE database (it migrates it and empties tables), see data-objects-records.integration.test.ts for the command.
const url = process.env.PORTABILITY_TEST_DATABASE_URL;

describe.skipIf(!url)('CDN mirror settings: per website, the default as the fallback, secrets encrypted', () => {
  let db: typeof import('./client.js');
  let sql: any;
  let rec: typeof import('./cdn-mirror-records.js');
  let sites: typeof import('./websites-records.js');
  let a = '';
  let b = '';
  const ROUTE = '11111111-1111-4111-8111-111111111111';
  const ACCOUNT = 'c'.repeat(32);

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.INTEGRATION_SECRETS_ENCRYPTION_KEY = 'integration-test-key-for-cdn';
    db = await import('./client.js');
    await (await import('./bootstrap.js')).runMigrations();
    sql = (await import('drizzle-orm')).sql;
    rec = await import('./cdn-mirror-records.js');
    sites = await import('./websites-records.js');
  });
  afterAll(async () => { await db?.closeDb(); });
  beforeEach(async () => {
    await db.getDb().execute(sql.raw('TRUNCATE TABLE cdn_mirror_settings, websites CASCADE'));
    a = (await sites.createWebsite({ name: 'A', rootPath: '/a' } as any)).id;
    b = (await sites.createWebsite({ name: 'B', rootPath: '/b' } as any)).id;
  });

  it('with nothing saved there is nothing, and the website falls back to the default when there is one', async () => {
    expect(await rec.resolveCdnMirror(a)).toMatchObject({ scope: 'none' });
    await rec.saveCdnMirror(null, { provider: 'cloudinary', config: { gatewayRouteId: ROUTE, uploadPreset: 'p' }, secrets: {} });
    expect(await rec.resolveCdnMirror(a)).toMatchObject({ scope: 'default', provider: 'cloudinary', config: { gatewayRouteId: ROUTE, uploadPreset: 'p' } });
    expect(await rec.resolveCdnMirror()).toMatchObject({ scope: 'default' });
  });

  it('a website with its own settings uses them, another website still uses the default, and removing falls back', async () => {
    await rec.saveCdnMirror(null, { provider: 'cloudinary', config: { gatewayRouteId: ROUTE }, secrets: {} });
    await rec.saveCdnMirror(a, { provider: 'cloudflare-images', config: { accountId: ACCOUNT }, secrets: { apiToken: 'tok-A' } });
    expect(await rec.resolveCdnMirror(a)).toMatchObject({ scope: 'website', websiteId: a, provider: 'cloudflare-images', secrets: { apiToken: 'tok-A' } });
    expect(await rec.resolveCdnMirror(b)).toMatchObject({ scope: 'default', provider: 'cloudinary' });
    expect(await rec.deleteCdnMirror(a)).toBe(true);
    expect(await rec.deleteCdnMirror(a)).toBe(false);
    expect(await rec.resolveCdnMirror(a)).toMatchObject({ scope: 'default' });
  });

  it('keeps one default and one row per website: a second save updates', async () => {
    await rec.saveCdnMirror(null, { provider: 'cloudinary', config: { gatewayRouteId: ROUTE }, secrets: {} });
    await rec.saveCdnMirror(null, { provider: 'cloudinary', config: { gatewayRouteId: ROUTE, uploadPreset: 'new' }, secrets: {} });
    await rec.saveCdnMirror(a, { provider: 'cloudinary', config: { gatewayRouteId: ROUTE }, secrets: {} });
    await rec.saveCdnMirror(a, { provider: 'cloudinary', config: { gatewayRouteId: ROUTE, uploadPreset: 'x' }, secrets: {} });
    expect((await db.getDb().execute(sql.raw('SELECT count(*)::int AS n FROM cdn_mirror_settings'))).rows[0]).toEqual({ n: 2 });
    expect((await rec.resolveCdnMirror(null)).config.uploadPreset).toBe('new');
    await expect(db.getDb().execute(sql.raw('INSERT INTO cdn_mirror_settings (website_id) VALUES (NULL)'))).rejects.toBeTruthy();
  });

  it('stores the token encrypted, never in the browser view, keeps it when it is not sent again, and drops it with a change of provider', async () => {
    await rec.saveCdnMirror(a, { provider: 'cloudflare-images', config: { accountId: ACCOUNT }, secrets: { apiToken: 'SECRET-TOKEN' } });
    const stored = (await db.getDb().execute(sql.raw('SELECT secrets_encrypted, config FROM cdn_mirror_settings'))).rows[0] as any;
    expect(stored.secrets_encrypted).toMatch(/^enc:v1:/);
    expect(JSON.stringify(stored)).not.toContain('SECRET-TOKEN');
    const resolved = await rec.resolveCdnMirror(a);
    const view = rec.publicCdnMirror(resolved);
    expect(JSON.stringify(view)).not.toContain('SECRET-TOKEN');
    expect(view).toMatchObject({ scope: 'website', provider: 'cloudflare-images', secretsSet: { apiToken: true }, missing: [], configured: true });

    await rec.saveCdnMirror(a, { provider: 'cloudflare-images', config: { accountId: ACCOUNT, variant: 'hero' }, secrets: {} });   // no token sent: kept
    expect((await rec.resolveCdnMirror(a)).secrets).toEqual({ apiToken: 'SECRET-TOKEN' });
    await rec.saveCdnMirror(a, { provider: 'cloudinary', config: { gatewayRouteId: ROUTE }, secrets: {} });                         // another provider: gone
    expect((await rec.resolveCdnMirror(a)).secrets).toEqual({});
    await rec.saveCdnMirror(a, { provider: 'cloudflare-images', config: { accountId: ACCOUNT }, secrets: {} });                    // back: not resurrected
    expect(rec.publicCdnMirror(await rec.resolveCdnMirror(a))).toMatchObject({ missing: ['apiToken'], configured: false });
  });

  it('is removed with its website', async () => {
    await rec.saveCdnMirror(a, { provider: 'cloudinary', config: { gatewayRouteId: ROUTE }, secrets: {} });
    await sites.deleteWebsite(a);
    expect((await db.getDb().execute(sql.raw('SELECT count(*)::int AS n FROM cdn_mirror_settings'))).rows[0]).toEqual({ n: 0 });
  });

  it('the migration copied the old setting of the first website as the default', async () => {
    // replay the backfill statement on a database that has an old-style setting
    await db.getDb().execute(sql.raw('TRUNCATE TABLE cdn_mirror_settings'));
    await db.getDb().execute(sql.raw(`UPDATE websites SET settings = jsonb_build_object('cdnMirror', jsonb_build_object('gatewayRouteId', '${ROUTE}', 'uploadPreset', 'old-preset', 'provider', 'cloudinary')) WHERE id = '${b}'`));
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const migration = readFileSync(resolve(__dirname, '../../drizzle/0066_cdn_mirror_settings.sql'), 'utf8');
    await db.getDb().execute(sql.raw(migration.slice(migration.indexOf('INSERT INTO'))));
    expect(await rec.resolveCdnMirror(a)).toMatchObject({ scope: 'default', provider: 'cloudinary', config: { gatewayRouteId: ROUTE, uploadPreset: 'old-preset' } });
  });
});
