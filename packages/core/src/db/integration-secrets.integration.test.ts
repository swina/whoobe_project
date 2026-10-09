import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

// Needs a DISPOSABLE database (see mail-settings.integration.test.ts for how to start one).
//   PORTABILITY_TEST_DATABASE_URL=postgres://postgres:pt@127.0.0.1:55432/postgres pnpm --filter @whoobe-cms/core exec vitest run --no-file-parallelism src/db/integration-secrets
const url = process.env.PORTABILITY_TEST_DATABASE_URL;

describe.skipIf(!url)('credentials of third-party services: encrypted at rest (F-055), push key never in a record (F-059)', () => {
  let db: typeof import('./client.js');
  let sql: any;
  let ai: typeof import('./ai-settings-records.js');
  let aiImage: typeof import('./ai-image-settings-records.js');
  let aiTranslate: typeof import('./ai-translate-settings-records.js');
  let figma: typeof import('./figma-settings-records.js');
  let sites: typeof import('./websites-records.js');
  let backfill: typeof import('./scripts/backfill-integration-secrets-encryption.js');
  const KEY = 'integration-test-key-for-third-party-secrets';
  const user = '33333333-3333-4333-8333-333333333333';
  const raw = async (q: string): Promise<any[]> => ((await db.getDb().execute(sql.raw(q))) as any).rows;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.INTEGRATION_SECRETS_ENCRYPTION_KEY = KEY;
    db = await import('./client.js');
    await (await import('./bootstrap.js')).runMigrations();
    sql = (await import('drizzle-orm')).sql;
    ai = await import('./ai-settings-records.js');
    aiImage = await import('./ai-image-settings-records.js');
    aiTranslate = await import('./ai-translate-settings-records.js');
    figma = await import('./figma-settings-records.js');
    sites = await import('./websites-records.js');
    backfill = await import('./scripts/backfill-integration-secrets-encryption.js');
  });
  afterAll(async () => { await db?.closeDb(); });
  beforeEach(async () => {
    process.env.INTEGRATION_SECRETS_ENCRYPTION_KEY = KEY;
    for (const t of ['ai_settings', 'ai_image_settings', 'ai_translate_settings', 'figma_settings', 'websites', 'sessions', 'users']) await db.getDb().execute(sql.raw(`TRUNCATE TABLE "${t}" CASCADE`));
    await db.getDb().execute(sql.raw(`INSERT INTO users (id, email, password_hash, display_name) VALUES ('${user}', 'secrets-test@example.com', 'x', 'Secrets Test')`));
  });

  it('AI keys and the Figma token are stored encrypted and read back in clear for the code that uses them', async () => {
    await ai.upsertAiSettings(user, { provider: 'openai', model: 'm', apiKey: 'sk-text-123' });
    await aiImage.upsertAiImageSettings(user, { provider: 'openai', model: 'm', apiKey: 'sk-image-123' });
    await aiTranslate.upsertAiTranslateSettings(user, { provider: 'openai', model: 'm', apiKey: 'sk-translate-123' });
    await figma.upsertFigmaSettings({ accessToken: 'figd_token_123', teamId: 't' });
    for (const [table, col] of [['ai_settings', 'api_key'], ['ai_image_settings', 'api_key'], ['ai_translate_settings', 'api_key'], ['figma_settings', 'access_token']]) {
      const [row] = await raw(`SELECT ${col} AS v FROM ${table}`);
      expect(row.v, table).toMatch(/^enc:v1:/);
      expect(row.v, table).not.toContain('123');
    }
    expect((await ai.getAiSettings(user))?.apiKey).toBe('sk-text-123');
    expect((await aiImage.getAiImageSettings(user))?.apiKey).toBe('sk-image-123');
    expect((await aiTranslate.getAiTranslateSettings(user))?.apiKey).toBe('sk-translate-123');
    expect((await figma.getFigmaSettings())?.accessToken).toBe('figd_token_123');
    // saving again with no key clears it
    await ai.upsertAiSettings(user, { provider: 'openai', model: 'm', apiKey: null });
    expect((await ai.getAiSettings(user))?.apiKey).toBeNull();
  });

  it('a clear-text value from before the key existed still works, and the backfill encrypts it once', async () => {
    delete process.env.INTEGRATION_SECRETS_ENCRYPTION_KEY;
    await ai.upsertAiSettings(user, { provider: 'openai', model: 'm', apiKey: 'sk-legacy' });
    await figma.upsertFigmaSettings({ accessToken: 'figd_legacy' });
    expect((await raw('SELECT api_key AS v FROM ai_settings'))[0].v).toBe('sk-legacy');
    expect((await ai.getAiSettings(user))?.apiKey).toBe('sk-legacy');
    expect((await backfill.backfillIntegrationSecretsEncryption()).skipped).toBe(true); // no key: untouched
    process.env.INTEGRATION_SECRETS_ENCRYPTION_KEY = KEY;
    const first = await backfill.backfillIntegrationSecretsEncryption();
    expect(first).toMatchObject({ encrypted: 2, skipped: false });
    expect((await raw('SELECT api_key AS v FROM ai_settings'))[0].v).toMatch(/^enc:v1:/);
    expect((await ai.getAiSettings(user))?.apiKey).toBe('sk-legacy');
    expect(await backfill.backfillIntegrationSecretsEncryption()).toMatchObject({ encrypted: 0, alreadyEncrypted: 2 });
  });

  it('an encrypted value cannot be read without the key (fails closed)', async () => {
    await ai.upsertAiSettings(user, { provider: 'openai', model: 'm', apiKey: 'sk-secret' });
    delete process.env.INTEGRATION_SECRETS_ENCRYPTION_KEY;
    await expect(ai.getAiSettings(user)).rejects.toThrow(/INTEGRATION_SECRETS_ENCRYPTION_KEY/);
  });

  describe('the push provider key of a website', () => {
    const push = (extra: Record<string, unknown> = {}) => ({ shortName: 'App', push: { provider: 'onesignal', onesignalAppId: 'app-1', ...extra } });

    it('is encrypted in the database, absent from every record, and flagged as set', async () => {
      const w = await sites.createWebsite({ name: 'S', pwaConfig: push({ onesignalApiKey: 'REST-KEY-1' }) });
      expect(JSON.stringify(w)).not.toContain('REST-KEY-1');
      expect((w.pwaConfig as any).push).toEqual({ provider: 'onesignal', onesignalAppId: 'app-1', onesignalApiKeySet: true });
      const [row] = await raw(`SELECT pwa_config AS c FROM websites WHERE id = '${w.id}'`);
      expect(row.c.push.onesignalApiKey).toMatch(/^enc:v1:/);
      expect(JSON.stringify((await sites.getWebsite(w.id))!)).not.toContain('REST-KEY-1');
      expect(JSON.stringify(await sites.listWebsites())).not.toContain('REST-KEY-1');
      expect(await sites.getWebsitePushApiKey(w.id)).toBe('REST-KEY-1');
    });

    it('a save without the key (what the dashboard sends) keeps it; a new key replaces it; clear removes it', async () => {
      const w = await sites.createWebsite({ name: 'S', pwaConfig: push({ onesignalApiKey: 'REST-KEY-1' }) });
      const roundTrip = (await sites.getWebsite(w.id))!.pwaConfig as Record<string, unknown>;
      await sites.updateWebsite(w.id, { pwaConfig: { ...roundTrip, shortName: 'Renamed' } });
      expect(await sites.getWebsitePushApiKey(w.id)).toBe('REST-KEY-1');
      expect(((await sites.getWebsite(w.id))!.pwaConfig as any).shortName).toBe('Renamed');
      await sites.updateWebsite(w.id, { pwaConfig: push({ onesignalApiKey: '   ' }) });
      expect(await sites.getWebsitePushApiKey(w.id)).toBe('REST-KEY-1'); // blank = keep
      await sites.updateWebsite(w.id, { pwaConfig: push({ onesignalApiKey: 'REST-KEY-2' }) });
      expect(await sites.getWebsitePushApiKey(w.id)).toBe('REST-KEY-2');
      await sites.updateWebsite(w.id, { pwaConfig: push({ clearOnesignalApiKey: true }) });
      expect(await sites.getWebsitePushApiKey(w.id)).toBeNull();
      expect(((await sites.getWebsite(w.id))!.pwaConfig as any).push.onesignalApiKeySet).toBeUndefined();
    });

    it('the flag sent back by a client is never stored, and the backfill encrypts a legacy clear key', async () => {
      const w = await sites.createWebsite({ name: 'S', pwaConfig: push({ onesignalApiKeySet: true }) });
      const [row] = await raw(`SELECT pwa_config AS c FROM websites WHERE id = '${w.id}'`);
      expect(row.c.push.onesignalApiKeySet).toBeUndefined();
      await db.getDb().execute(sql.raw(`UPDATE websites SET pwa_config = '{"push":{"provider":"onesignal","onesignalApiKey":"LEGACY-CLEAR"}}'::jsonb WHERE id = '${w.id}'`));
      expect(await sites.getWebsitePushApiKey(w.id)).toBe('LEGACY-CLEAR');
      expect(await backfill.backfillIntegrationSecretsEncryption()).toMatchObject({ encrypted: 1 });
      const [after] = await raw(`SELECT pwa_config AS c FROM websites WHERE id = '${w.id}'`);
      expect(after.c.push.onesignalApiKey).toMatch(/^enc:v1:/);
      expect(await sites.getWebsitePushApiKey(w.id)).toBe('LEGACY-CLEAR');
    });
  });
});
