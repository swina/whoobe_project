import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

// Needs a DISPOSABLE database (it migrates it and empties tables), see data-objects-records.integration.test.ts for the command.
const url = process.env.PORTABILITY_TEST_DATABASE_URL;

describe.skipIf(!url)('data subject: find, export, erase, retention', () => {
  let db: typeof import('./client.js');
  let sql: any;
  let ds: typeof import('./data-subject.js');
  let schema: typeof import('./data-objects-schema.js');
  let classes: typeof import('./data-classes-schema.js');
  let uploads: typeof import('./form-uploads-schema.js');
  let mail: typeof import('./mail-log-schema.js');
  let auth: typeof import('./auth-schema.js');
  let sec: typeof import('./security-settings-records.js');
  let classId = '';
  let otherClassId = '';
  const deleted: string[] = [];
  const deps = (failFor: string[] = []) => ({
    deleteAsset: async (id: string) => { if (failFor.includes(id)) throw new Error('store unavailable'); deleted.push(id); },
  });
  const day = 86_400_000;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import('./client.js');
    await (await import('./bootstrap.js')).runMigrations();
    sql = (await import('drizzle-orm')).sql;
    ds = await import('./data-subject.js');
    schema = await import('./data-objects-schema.js');
    classes = await import('./data-classes-schema.js');
    uploads = await import('./form-uploads-schema.js');
    mail = await import('./mail-log-schema.js');
    auth = await import('./auth-schema.js');
    sec = await import('./security-settings-records.js');
  });
  afterAll(async () => { await db.closeDb?.(); });

  beforeEach(async () => {
    deleted.length = 0;
    await db.getDb().execute(sql.raw('TRUNCATE TABLE form_uploads, mail_log, data_objects, data_classes, security_settings, users CASCADE'));
    const d = db.getDb();
    [{ id: classId }, { id: otherClassId }] = await d.insert(classes.dataClasses).values([
      { name: 'Contact', label: 'Contact', fields: [] },
      { name: 'Newsletter', label: 'Newsletter', fields: [] },
    ]).returning({ id: classes.dataClasses.id });
  });

  const obj = async (attributes: Record<string, unknown>, over: Record<string, unknown> = {}, cls = classId) => {
    const [row] = await db.getDb().insert(schema.dataObjects).values({ classId: cls, key: `sub-${Math.random().toString(36).slice(2)}`, attributes, ...over } as any).returning({ id: schema.dataObjects.id });
    return row.id;
  };

  it('finds the person by the whole value, any case, at any depth, and not the neighbour whose address contains it', async () => {
    const a = await obj({ name: 'Ann', email: 'Ann@X.org' });
    const b = await obj({ contact: { emails: ['other@y.org', 'ANN@x.org'] }, note: 'hello' });
    await obj({ email: 'joann@x.org' });
    await obj({ email: 'ann@x.org.uk' });
    await obj({ message: 'please write to ann@x.org' });   // a sentence, not the value of a field
    const found = await ds.findDataSubject('ann@x.org');
    expect(found.objects.map((o) => o.id).sort()).toEqual([a, b].sort());
    expect(found.objects.find((o) => o.id === a)).toMatchObject({ className: 'Contact', fields: ['email'] });
    expect(found.objects.find((o) => o.id === b)?.fields).toEqual(['contact']);
    // limited to a class
    expect((await ds.findDataSubject('ann@x.org', { classIds: [otherClassId] })).objects).toEqual([]);
  });

  it('finds the mail sent to the person, and the mail that quotes the address, and not a longer address', async () => {
    const m = db.getDb();
    await m.insert(mail.mailLog).values([
      { to: 'Ann <ann@x.org>', subject: 'Welcome', status: 'sent' },
      { to: 'staff@acme.test', subject: 'New enquiry', html: '<p>From <a href="mailto:ann@x.org">ann@x.org</a></p>', status: 'sent' },
      { to: 'staff@acme.test', subject: 'Other', text: 'from joann@x.org', status: 'sent' },
      { to: 'joann@x.org', subject: 'Not her', status: 'sent' },
    ]);
    const all = await ds.findDataSubject('ann@x.org');
    expect(all.mail.map((x) => `${x.matchedIn}:${x.subject}`).sort()).toEqual(['content:New enquiry', 'recipient:Welcome']);
    const recipientOnly = await ds.findDataSubject('ann@x.org', { includeMailBodies: false });
    expect(recipientOnly.mail.map((x) => x.subject)).toEqual(['Welcome']);
  });

  it('reports a staff account of the same address and leaves it alone when erasing', async () => {
    await db.getDb().insert(auth.users).values({ email: 'ann@x.org', passwordHash: 'x', displayName: 'Ann Staff' });
    const found = await ds.findDataSubject('ann@x.org');
    expect(found.staff).toMatchObject([{ email: 'ann@x.org', displayName: 'Ann Staff' }]);
    const r = await ds.eraseDataSubject('ann@x.org', { dryRun: false }, deps());
    expect(r.matched.staff).toBe(1);
    expect((await db.getDb().select().from(auth.users)).length).toBe(1);
  });

  it('exports the records, with the files listed and not inlined', async () => {
    const id = await obj({ email: 'ann@x.org', message: 'hi' });
    await db.getDb().insert(uploads.formUploads).values({ websiteId: '11111111-1111-4111-8111-111111111111', formRef: 'f', status: 'attached', extension: 'pdf', originalName: 'cv.pdf', declaredSize: 10, size: 10, submissionId: id, assetId: '22222222-2222-4222-8222-222222222222' });
    await db.getDb().insert(mail.mailLog).values({ to: 'ann@x.org', subject: 'Hello', text: 'Dear Ann', status: 'sent' });
    const out = await ds.exportDataSubject('ann@x.org');
    expect(out.objects).toMatchObject([{ id, class: 'Contact', attributes: { email: 'ann@x.org', message: 'hi' } }]);
    expect(out.mail).toMatchObject([{ to: 'ann@x.org', subject: 'Hello', text: 'Dear Ann' }]);
    expect(out.files).toMatchObject([{ originalName: 'cv.pdf', assetId: '22222222-2222-4222-8222-222222222222', submissionId: id }]);
    expect(JSON.stringify(out)).not.toContain('"identifier"');
  });

  it('a dry run deletes nothing and says what a real run would', async () => {
    await obj({ email: 'ann@x.org' });
    await db.getDb().insert(mail.mailLog).values({ to: 'ann@x.org', subject: 'Hello', status: 'sent' });
    const r = await ds.eraseDataSubject('ann@x.org', { dryRun: true }, deps());
    expect(r).toMatchObject({ dryRun: true, objectsDeleted: 0, mailDeleted: 0, matched: { objects: 1, mail: 1 } });
    expect((await db.getDb().select().from(schema.dataObjects)).length).toBe(1);
    expect((await db.getDb().select().from(mail.mailLog)).length).toBe(1);
  });

  it('erases the person: the object, the files first, the upload rows and the mail; the neighbour is untouched', async () => {
    const A = '22222222-2222-4222-8222-222222222222';
    const id = await obj({ email: 'ann@x.org', cv: { assetId: A } });
    const neighbour = await obj({ email: 'joann@x.org' });
    await db.getDb().insert(uploads.formUploads).values({ websiteId: '11111111-1111-4111-8111-111111111111', formRef: 'f', status: 'attached', extension: 'pdf', originalName: 'cv.pdf', declaredSize: 10, size: 10, submissionId: id, assetId: A });
    await db.getDb().insert(mail.mailLog).values([{ to: 'ann@x.org', subject: 'Hello', status: 'sent' }, { to: 'joann@x.org', subject: 'Hello Jo', status: 'sent' }]);
    const r = await ds.eraseDataSubject('ann@x.org', { dryRun: false }, deps());
    expect(r).toMatchObject({ dryRun: false, objectsDeleted: 1, filesDeleted: 1, uploadRowsDeleted: 1, mailDeleted: 1, failures: [] });
    expect(deleted).toEqual([A]);
    expect((await db.getDb().select({ id: schema.dataObjects.id }).from(schema.dataObjects)).map((x) => x.id)).toEqual([neighbour]);
    expect((await db.getDb().select().from(uploads.formUploads)).length).toBe(0);
    expect((await db.getDb().select().from(mail.mailLog)).map((m) => m.subject)).toEqual(['Hello Jo']);
    // nothing is left to find
    const again = await ds.findDataSubject('ann@x.org');
    expect([again.objects.length, again.mail.length, again.uploads.length]).toEqual([0, 0, 0]);
  });

  it('finds the visitor\'s file through the object\'s own reference, and never deletes a library picture an editor chose', async () => {
    const CV = '55555555-5555-4555-8555-555555555555';       // sent through the form: a form_uploads row, no submission id (the real flow)
    const PICTURE = '66666666-6666-4666-8666-666666666666';  // picked from the library: no form_uploads row
    const id = await obj({ email: 'ann@x.org', cv: { assetId: CV }, photo: { assetId: PICTURE }, more: [CV] });
    await db.getDb().insert(uploads.formUploads).values({ websiteId: '11111111-1111-4111-8111-111111111111', formRef: 'f', status: 'attached', extension: 'pdf', originalName: 'cv.pdf', declaredSize: 10, size: 10, assetId: CV });
    const found = await ds.findDataSubject('ann@x.org');
    expect(found.uploads).toMatchObject([{ assetId: CV, submissionId: id }]);
    const r = await ds.eraseDataSubject('ann@x.org', { dryRun: false }, deps());
    expect(r).toMatchObject({ objectsDeleted: 1, filesDeleted: 1, uploadRowsDeleted: 1 });
    expect(deleted).toEqual([CV]);
  });

  it('keeps an object whose file cannot be deleted, reports it, and a retry finishes the job', async () => {
    const A = '22222222-2222-4222-8222-222222222222';
    const id = await obj({ email: 'ann@x.org' });
    await db.getDb().insert(uploads.formUploads).values({ websiteId: '11111111-1111-4111-8111-111111111111', formRef: 'f', status: 'attached', extension: 'pdf', originalName: 'cv.pdf', declaredSize: 10, size: 10, submissionId: id, assetId: A });
    const first = await ds.eraseDataSubject('ann@x.org', { dryRun: false }, deps([A]));
    expect(first.objectsDeleted).toBe(0);
    expect(first.failures).toMatchObject([{ objectId: id, reason: expect.stringContaining('cv.pdf') }]);
    expect((await db.getDb().select().from(schema.dataObjects)).length).toBe(1);
    expect((await db.getDb().select().from(uploads.formUploads)).length).toBe(1);
    const second = await ds.eraseDataSubject('ann@x.org', { dryRun: false }, deps());
    expect(second).toMatchObject({ objectsDeleted: 1, filesDeleted: 1, failures: [] });
  });

  it('can leave the mail alone or the objects alone', async () => {
    await obj({ email: 'ann@x.org' });
    await db.getDb().insert(mail.mailLog).values({ to: 'ann@x.org', subject: 'Hello', status: 'sent' });
    const r = await ds.eraseDataSubject('ann@x.org', { dryRun: false, include: { mail: false } }, deps());
    expect(r).toMatchObject({ objectsDeleted: 1, mailDeleted: 0 });
    expect((await db.getDb().select().from(mail.mailLog)).length).toBe(1);
  });

  describe('retention', () => {
    it('deletes the objects older than the class\'s days, with their files, and nothing of a class without a number', async () => {
      await db.getDb().execute(sql.raw(`UPDATE data_classes SET retention_days = 30 WHERE name = 'Contact'`));
      const A = '33333333-3333-4333-8333-333333333333';
      const now = new Date();
      const old = await obj({ email: 'old@x.org' }, { createdAt: new Date(now.getTime() - 40 * day) });
      const young = await obj({ email: 'young@x.org' }, { createdAt: new Date(now.getTime() - 10 * day) });
      const oldPublished = await obj({ email: 'oldpub@x.org' }, { createdAt: new Date(now.getTime() - 400 * day), published: true });
      const otherOld = await obj({ email: 'keep@x.org' }, { createdAt: new Date(now.getTime() - 400 * day) }, otherClassId);
      await db.getDb().insert(uploads.formUploads).values({ websiteId: '11111111-1111-4111-8111-111111111111', formRef: 'f', status: 'attached', extension: 'pdf', originalName: 'old.pdf', declaredSize: 1, size: 1, submissionId: old, assetId: A });
      const r = await ds.purgeExpiredData(deps(), now);
      expect(r.classes).toEqual([{ classId, className: 'Contact', days: 30, deleted: 2, failed: 0 }]);
      expect(deleted).toEqual([A]);
      const left = (await db.getDb().select({ id: schema.dataObjects.id }).from(schema.dataObjects)).map((x) => x.id).sort();
      expect(left).toEqual([young, otherOld].sort());
      expect(oldPublished).toBeTruthy();
    });

    it('deletes the mail log rows older than the setting, and keeps everything when there is none', async () => {
      const now = new Date();
      await db.getDb().insert(mail.mailLog).values([
        { to: 'a@x.org', subject: 'old', status: 'sent', sentAt: new Date(now.getTime() - 100 * day) },
        { to: 'b@x.org', subject: 'new', status: 'sent', sentAt: new Date(now.getTime() - 5 * day) },
      ]);
      expect((await ds.purgeExpiredData(deps(), now)).mailDeleted).toBe(0);
      await sec.updateSecuritySettings({ mailLogRetentionDays: 30 });
      expect((await ds.purgeExpiredData(deps(), now)).mailDeleted).toBe(1);
      expect((await db.getDb().select().from(mail.mailLog)).map((m) => m.subject)).toEqual(['new']);
    });

    it('does not spin on an object it cannot delete', async () => {
      await db.getDb().execute(sql.raw(`UPDATE data_classes SET retention_days = 1 WHERE name = 'Contact'`));
      const A = '44444444-4444-4444-8444-444444444444';
      const id = await obj({ email: 'x@y.org' }, { createdAt: new Date(Date.now() - 5 * day) });
      await db.getDb().insert(uploads.formUploads).values({ websiteId: '11111111-1111-4111-8111-111111111111', formRef: 'f', status: 'attached', extension: 'pdf', originalName: 'a.pdf', declaredSize: 1, size: 1, submissionId: id, assetId: A });
      const r = await ds.purgeExpiredData(deps([A]));
      expect(r.classes).toEqual([{ classId, className: 'Contact', days: 1, deleted: 0, failed: 1 }]);
    });
  });

  it('refuses a retention number out of range, in the database', async () => {
    await expect(db.getDb().execute(sql.raw(`UPDATE data_classes SET retention_days = 0 WHERE name = 'Contact'`))).rejects.toBeTruthy();
    await expect(db.getDb().execute(sql.raw(`UPDATE data_classes SET retention_days = 99999 WHERE name = 'Contact'`))).rejects.toBeTruthy();
  });
});
