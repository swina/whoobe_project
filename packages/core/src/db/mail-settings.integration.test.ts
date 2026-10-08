import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });   // a cold disposable database is slow on the first test

// Needs a DISPOSABLE database (it migrates it and empties tables). Run like the website bundle's round trip:
//   docker run -d --rm --name pt -e POSTGRES_PASSWORD=pt -p 55432:5432 postgres:16-alpine
//   PORTABILITY_TEST_DATABASE_URL=postgres://postgres:pt@127.0.0.1:55432/postgres pnpm --filter @whoobe-cms/core exec vitest run --no-file-parallelism src/db/mail-settings src/portability
// (the two integration files share the one database: run them one after the other)
const url = process.env.PORTABILITY_TEST_DATABASE_URL;

describe.skipIf(!url)('outgoing mail settings: default, per website, encrypted', () => {
  let db: typeof import('./client.js');
  let sql: any;
  let rec: typeof import('./mail-settings-records.js');
  let log: typeof import('./mail-log-records.js');
  let mailer: typeof import('../mail/mailer.js');
  let backfill: typeof import('./scripts/backfill-mail-settings-encryption.js');
  let schema: typeof import('./mail-settings-schema.js');
  const onesignal = () => mailer.mailProviders.get('onesignal')!;
  const KEY = 'integration-test-key-for-mail-settings';
  const site = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.MAIL_SETTINGS_ENCRYPTION_KEY = KEY;
    db = await import('./client.js');
    await (await import('./bootstrap.js')).runMigrations();
    sql = (await import('drizzle-orm')).sql;
    rec = await import('./mail-settings-records.js');
    log = await import('./mail-log-records.js');
    mailer = await import('../mail/mailer.js');
    backfill = await import('./scripts/backfill-mail-settings-encryption.js');
    schema = await import('./mail-settings-schema.js');
  });
  afterAll(async () => { await db?.closeDb(); });
  beforeEach(async () => {
    process.env.MAIL_SETTINGS_ENCRYPTION_KEY = KEY;
    for (const t of ['mail_settings', 'mail_log']) await db.getDb().execute(sql.raw(`TRUNCATE TABLE "${t}"`));
  });

  const rawRows = async () => (await db.getDb().execute(sql.raw('select * from mail_settings order by website_id nulls first'))).rows as any[];
  const smtp = { host: 'smtp.example.org', port: 587, secure: false, user: 'u', password: 's3cret-smtp-pw' };

  it('stores the SMTP password encrypted, readable by the server, never in the old plaintext column', async () => {
    await rec.upsertMailSettings(null, { provider: 'smtp', smtp, fromAddress: 'noreply@example.org' });
    const [row] = await rawRows();
    expect(row.password).toBeNull();
    expect(row.password_encrypted).toBeTruthy();
    expect(row.password_encrypted).not.toContain('s3cret');
    expect((await rec.getMailSettings())!.password).toBe('s3cret-smtp-pw');
  });

  it('a blank password keeps the stored one, an explicit clear removes it', async () => {
    await rec.upsertMailSettings(null, { provider: 'smtp', smtp, fromAddress: 'a@example.org' });
    await rec.upsertMailSettings(null, { provider: 'smtp', smtp: { ...smtp, password: '' }, fromAddress: 'b@example.org' });
    expect((await rec.getMailSettings())!.password).toBe('s3cret-smtp-pw');
    await rec.upsertMailSettings(null, { provider: 'smtp', smtp: { ...smtp, password: '', clearPassword: true }, fromAddress: 'b@example.org' });
    expect((await rec.getMailSettings())!.password).toBeNull();
    expect(await rawRows()).toHaveLength(1);   // always the one default row
  });

  it('without the server key a secret cannot be saved, but settings without one can', async () => {
    delete process.env.MAIL_SETTINGS_ENCRYPTION_KEY;
    await expect(rec.upsertMailSettings(null, { provider: 'smtp', smtp, fromAddress: 'a@example.org' })).rejects.toBeInstanceOf(rec.MailEncryptionKeyMissingError);
    await rec.upsertMailSettings(null, { provider: 'smtp', smtp: { ...smtp, password: null }, fromAddress: 'a@example.org' });
    expect((await rec.getMailSettings())!.host).toBe('smtp.example.org');
  });

  it('a password saved before encryption is still read, and the backfill encrypts it once', async () => {
    await db.getDb().insert(schema.mailSettings).values({ host: 'old.example.org', port: 25, fromAddress: 'old@example.org', password: 'legacy-plain' });
    expect((await rec.getMailSettings())!.password).toBe('legacy-plain');
    expect(await backfill.backfillMailSettingsEncryption()).toEqual({ encrypted: 1, skipped: false });
    const [row] = await rawRows();
    expect(row.password).toBeNull();
    expect(row.password_encrypted).not.toContain('legacy');
    expect((await rec.getMailSettings())!.password).toBe('legacy-plain');
    expect(await backfill.backfillMailSettingsEncryption()).toEqual({ encrypted: 0, skipped: false });
    delete process.env.MAIL_SETTINGS_ENCRYPTION_KEY;
    expect(await backfill.backfillMailSettingsEncryption()).toEqual({ encrypted: 0, skipped: true });
  });

  it('a provider\'s secret is encrypted, kept when left blank, and never in the browser view', async () => {
    const def = onesignal();
    await rec.upsertMailSettings(site, { provider: 'onesignal', providerDefinition: def, providerConfig: { appId: 'app-1', apiKey: 'os_secret_key_1', senderDomain: 'mail.example.org' }, fromAddress: 'noreply@mail.example.org' });
    const [row] = await rawRows();
    expect(row.provider_config_encrypted).not.toContain('os_secret');
    await rec.upsertMailSettings(site, { provider: 'onesignal', providerDefinition: def, providerConfig: { appId: 'app-2', apiKey: '', senderDomain: 'mail.example.org' }, fromAddress: 'noreply@mail.example.org' });
    const s = (await rec.getMailSettingsFor(site))!;
    expect(s.providerConfig).toEqual({ appId: 'app-2', apiKey: 'os_secret_key_1', senderDomain: 'mail.example.org' });
    const view = rec.publicMailSettings(s, 'website', def);
    expect(JSON.stringify(view)).not.toContain('os_secret');
    expect(view.providerConfig).toEqual({ appId: 'app-2', senderDomain: 'mail.example.org' });
    expect(view.secretsSet).toEqual({ apiKey: true });
  });

  it('switching to SMTP forgets the provider\'s configuration', async () => {
    const def = onesignal();
    await rec.upsertMailSettings(site, { provider: 'onesignal', providerDefinition: def, providerConfig: { appId: 'a', apiKey: 'os_secret_key_1' } });
    await rec.upsertMailSettings(site, { provider: 'smtp', smtp, fromAddress: 'a@example.org' });
    const [row] = await rawRows();
    expect(row.provider).toBe('smtp');
    expect(row.provider_config_encrypted).toBeNull();
  });

  it('a website uses its own configuration, the others the default; removing it falls back', async () => {
    await rec.upsertMailSettings(null, { provider: 'smtp', smtp, fromAddress: 'default@example.org' });
    await rec.upsertMailSettings(site, { provider: 'onesignal', providerDefinition: onesignal(), providerConfig: { appId: 'a', apiKey: 'os_secret_key_1' }, fromAddress: 'site@mail.example.org' });
    expect((await rec.resolveMailSettings(site))).toMatchObject({ scope: 'website', settings: { provider: 'onesignal', fromAddress: 'site@mail.example.org' } });
    expect((await rec.resolveMailSettings(other))).toMatchObject({ scope: 'default', settings: { provider: 'smtp' } });
    expect((await rec.resolveMailSettings(null))).toMatchObject({ scope: 'default' });
    expect(await rec.deleteMailSettings(site)).toBe(true);
    expect(await rec.deleteMailSettings(site)).toBe(false);
    expect((await rec.resolveMailSettings(site))).toMatchObject({ scope: 'default' });
    expect(await rawRows()).toHaveLength(1);
  });

  it('a website without a default configuration still has none to fall back on', async () => {
    expect(await rec.resolveMailSettings(site)).toBeNull();
  });

  it('only one row per website', async () => {
    await rec.upsertMailSettings(site, { provider: 'smtp', smtp: { ...smtp, password: null }, fromAddress: 'a@example.org' });
    await rec.upsertMailSettings(site, { provider: 'smtp', smtp: { ...smtp, password: null }, fromAddress: 'b@example.org' });
    expect(await rawRows()).toHaveLength(1);
    await expect(db.getDb().insert(schema.mailSettings).values({ websiteId: site, host: 'x', port: 1, fromAddress: 'x@example.org' })).rejects.toThrow();
  });

  describe('sending', () => {
    const answers: { url: string; body: any }[] = [];
    const deps = { fetchImpl: async (url: string, init: { body?: string }) => { answers.push({ url, body: JSON.parse(init.body ?? '{}') }); return new Response(JSON.stringify({ id: 'os-message-1', errors: {} }), { status: 200 }); } };

    it('the website sends through its provider, the others through the default; the log says how', async () => {
      answers.length = 0;
      await rec.upsertMailSettings(null, { provider: 'smtp', smtp: { host: '127.0.0.1', port: 9, secure: false, user: null, password: null }, fromAddress: 'default@example.org' });
      await rec.upsertMailSettings(site, { provider: 'onesignal', providerDefinition: onesignal(), providerConfig: { appId: 'app-9', apiKey: 'os_secret_key_1' }, fromAddress: 'site@mail.example.org', fromName: 'The Site' });

      await mailer.sendMail({ to: 'v@example.org', subject: 'Hi', html: '<p>x</p>', websiteId: site }, deps);
      expect(answers).toHaveLength(1);
      expect(answers[0].body).toMatchObject({ app_id: 'app-9', email_to: ['v@example.org'], email_from_address: 'site@mail.example.org', email_from_name: 'The Site' });

      await expect(mailer.sendMail({ to: 'v@example.org', subject: 'Hi', html: '<p>x</p>', websiteId: other }, deps)).rejects.toThrow();   // SMTP on a closed port
      expect(answers).toHaveLength(1);

      const rows = (await log.listMailLog({ order: 'oldest' })).records;
      expect(rows.map((r) => [r.provider, r.status, r.reference, r.websiteId])).toEqual([['onesignal', 'sent', 'os-message-1', site], ['smtp', 'failed', null, other]]);
    });

    it('a provider that is not installed fails and is logged as failed', async () => {
      await db.getDb().insert(schema.mailSettings).values({ provider: 'gone', fromAddress: 'a@example.org' });
      await expect(mailer.sendMail({ to: 'v@example.org', subject: 'Hi', html: '<p>x</p>' }, deps)).rejects.toThrow(/"gone" is not installed/);
      const [row] = (await log.listMailLog({})).records;
      expect([row.provider, row.status]).toEqual(['gone', 'failed']);
    });

    it('the API key does not end up in the log', async () => {
      await rec.upsertMailSettings(null, { provider: 'onesignal', providerDefinition: onesignal(), providerConfig: { appId: 'a', apiKey: 'os_secret_key_1' } });
      await mailer.sendMail({ to: 'v@example.org', subject: 'Hi', html: '<p>x</p>', from: 'x@mail.example.org' }, { fetchImpl: async () => new Response(JSON.stringify({ errors: ['rejected key os_secret_key_1'] }), { status: 400 }) }).catch(() => {});
      const [row] = (await log.listMailLog({})).records;
      expect(row.error).toContain('rejected key ***');
      expect(JSON.stringify(row)).not.toContain('os_secret_key_1');
    });
  });
});
