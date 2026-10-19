// Data subject requests and retention (docs/plans/system/data-subject-plan.md): a person is found by one identifier across the objects, the mail
// log and the files of the objects; exported; erased with the files first; and the objects age out by class. Real form submissions, a real file in
// the library, a real mail log row, the real asset service.
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client, clientFor } from '../lib/client'
import { ASSET_TARGET, ADMIN_EMAIL } from '../lib/config'
import { createTempUser, loginAs } from '../lib/tempuser'

const tag = randomBytes(3).toString('hex')
const FCV = `f-cv-${tag}`
const ANN = `Ann.${tag}@example.org`          // typed with capitals on purpose
const ANN_LOWER = ANN.toLowerCase()
const BOB = `bob.${tag}@example.org`
const JOANN = `jo${ANN_LOWER}`                // contains Ann's address at its end
const POSTGRES = process.env.SEC_POSTGRES_CONTAINER ?? 'whoobe-sectest-postgres-1'
const DB_USER = process.env.SEC_DB_USER ?? 'sectest'
const DB_NAME = process.env.SEC_DB_NAME ?? 'whoobe_sec_test'

let admin: Client
let anon: Client
let assets: Client
let siteId = ''
let classId = ''
let pageId = ''
const cleanup: (() => Promise<unknown>)[] = []

const pdf = (extra = '') => new TextEncoder().encode(`%PDF-1.4\n1 0 obj<<>>endobj\n${extra}%%EOF\n`)
const input = (id: string, name: string, extra: object = {}) => ({
  id, tag: 'input', type: 'element', element: 'input', label: 'File', editable: false, content: null, blocks: [], css: { css: '', container: '' },
  data: { attributes: { type: 'file', name } }, ...extra,
})
const psql = (sql: string) => execFileSync('docker', ['exec', POSTGRES, 'psql', '-U', DB_USER, '-d', DB_NAME, '-tAc', sql], { encoding: 'utf8' }).trim()

async function stage(bytes: Uint8Array): Promise<string> {
  // core-api reads the pages again for an unknown field at most every 2 seconds: a page published a moment ago may need a second try
  let i = await anon.post('/public/uploads/intent', { fieldId: FCV, filename: 'cv.pdf', size: bytes.length })
  for (let n = 0; n < 3 && i.status === 404; n++) {
    await new Promise((r) => setTimeout(r, 2300))
    i = await anon.post('/public/uploads/intent', { fieldId: FCV, filename: 'cv.pdf', size: bytes.length })
  }
  expect(i.status, i.text).toBe(201)
  const put = await fetch(ASSET_TARGET + new URL(i.json.uploadUrl).pathname, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: bytes })
  expect(put.status, await put.text()).toBe(201)
  return i.json.uploadId
}
const submit = (attributes: Record<string, unknown>) => anon.post(`/public/forms/${classId}/submit`, { attributes })
const objectsOf = async () => ((await admin.get(`/data-objects?classId=${classId}`)).json?.objects ?? []) as { id: string; attributes: Record<string, any>; createdAt: string }[]
const ask = (path: string, body: Record<string, unknown>, who: Client = admin) => who.post(path, body)

beforeAll(async () => {
  admin = await clientFor('admin')
  anon = await clientFor('anon')
  assets = admin.forBase(ASSET_TARGET)
  const site = await admin.post('/whoobe-one/websites', { name: `DS ${tag}`, rootPath: `/ds-${tag}` })
  expect(site.status, site.text.slice(0, 150)).toBe(201)
  siteId = site.json.website.id
  cleanup.push(() => admin.delete(`/whoobe-one/websites/${siteId}`))
  expect((await admin.put(`/whoobe-one/websites/${siteId}/upload-settings`, { enabled: true, allowedExtensions: ['pdf'], maxFileBytes: 20000, maxFiles: 1, dailyBytes: 10_000_000, targetFolder: `private/ds-${tag}` })).status).toBe(200)
  const cls = await admin.post('/data-classes', {
    name: `Ds${tag}`, label: 'Ds',
    fields: [{ name: 'name', title: 'Name', fieldType: 'input' }, { name: 'email', title: 'Email', fieldType: 'input' }, { name: 'cv', title: 'CV', fieldType: 'manyToOneRelation' }],
  })
  expect(cls.status, cls.text.slice(0, 200)).toBe(201)
  classId = cls.json.class.id
  cleanup.push(() => admin.delete(`/data-classes/${classId}`))
  const form = {
    id: `form-${tag}`, tag: 'form', type: 'container', element: 'form', semantic: 'form', editable: false, content: null, css: { css: '', container: '' },
    formConfig: { enabled: true, targetClassId: classId, notify: { enabled: false } },
    blocks: [input(FCV, 'cv', { uploadConfig: { extensions: ['pdf'], maxFiles: 1 } })],
  }
  const page = await admin.post('/whoobe-one/pages', { slug: `ds-${tag}`, title: `DS ${tag}`, websiteId: siteId, content: { id: 'root', tag: 'document', type: 'container', element: 'div', css: { css: '', container: '' }, blocks: [form] } })
  expect(page.status, page.text.slice(0, 200)).toBe(201)
  pageId = page.json.page.id
  cleanup.push(() => admin.delete(`/whoobe-one/pages/${pageId}`))

  // Ann: a submission with a CV; Bob: a submission; JoAnn: a neighbour whose address ends like Ann's
  expect((await submit({ name: 'Ann', email: ANN, cv: { uploadId: await stage(pdf('ann-cv')) } })).status).toBe(201)
  expect((await submit({ name: 'Bob', email: BOB })).status).toBe(201)
  expect((await submit({ name: 'JoAnn', email: JOANN })).status).toBe(201)
  // mail: one to Ann, one to Bob (the test mail logs a row whether or not the server accepts it)
  expect((await admin.put('/mail-settings', { provider: 'smtp', smtp: { host: 'smtp.sectest.local', port: 2525, secure: false, user: '' }, fromAddress: 'noreply@sectest.local' })).status).toBe(200)
  await admin.post('/mail-settings/test', { to: ANN, subject: `Welcome ${tag}`, text: 'hello' })
  await admin.post('/mail-settings/test', { to: BOB, subject: `Welcome Bob ${tag}`, text: 'hello' })
  await admin.post('/mail-settings/test', { to: 'staff@acme.test', subject: `Enquiry ${tag}`, text: `A new enquiry from ${ANN_LOWER}.` })
})
afterAll(async () => { for (const f of cleanup.reverse()) { try { await f() } catch { /* best effort */ } } })

describe('who may ask', () => {
  it('administrators only: anonymous 401, roles with other permissions 403', async () => {
    for (const p of ['/data-subject/search', '/data-subject/export', '/data-subject/erase', '/data-subject/retention/run']) {
      expect((await new Client().post(p, { identifier: ANN })).status, p).toBe(401)
    }
    const editor = await createTempUser(admin, 'write')
    const s = await loginAs(editor)
    for (const p of ['/data-subject/search', '/data-subject/export', '/data-subject/erase', '/data-subject/retention/run']) {
      expect((await s.post(p, { identifier: ANN })).status, p).toBe(403)
    }
    await admin.delete(`/auth/users/${editor.id}`)
  })

  it('refuses a bad identifier or bad options', async () => {
    for (const body of [{}, { identifier: 'ab' }, { identifier: 5 }, { identifier: 'a'.repeat(400) }, { identifier: ANN, classIds: 'x' }, { identifier: ANN, classIds: ['nope'] }, { identifier: ANN, includeMailBodies: 'yes' }]) {
      expect((await ask('/data-subject/search', body)).status, JSON.stringify(body).slice(0, 60)).toBe(400)
    }
  })
})

describe('search', () => {
  it('finds the person by the whole value in any case, with the file and the mail, and not the neighbour or Bob', async () => {
    const r = await ask('/data-subject/search', { identifier: `  ${ANN.toUpperCase()} ` })
    expect(r.status, r.text.slice(0, 200)).toBe(200)
    expect(r.json.objects).toHaveLength(1)
    expect(r.json.objects[0]).toMatchObject({ className: `Ds${tag}`, fields: ['email'] })
    expect(r.json.files).toHaveLength(1)
    expect(r.json.files[0].assetId).toMatch(/^[0-9a-f-]{36}$/)
    const subjects = r.json.mail.map((m: any) => m.subject).sort()
    expect(subjects).toEqual([`Enquiry ${tag}`, `Welcome ${tag}`])
    expect(r.json.counts).toMatchObject({ objects: 1, mail: 2, files: 1 })
    // no value of the record comes back from a search, only where it is
    expect(JSON.stringify(r.json.objects)).not.toContain('ann-cv')
    expect(r.headers.get('cache-control')).toMatch(/no-store/)
  })

  it('can leave the text of mails out, and be limited to a class', async () => {
    const r = await ask('/data-subject/search', { identifier: ANN, includeMailBodies: false })
    expect(r.json.mail.map((m: any) => m.subject)).toEqual([`Welcome ${tag}`])
    const other = await ask('/data-subject/search', { identifier: ANN, classIds: ['00000000-0000-4000-8000-000000000000'] })
    expect(other.json.objects).toHaveLength(0)
  })

  it('reports a staff account of the address and does not treat it as erasable', async () => {
    const r = await ask('/data-subject/search', { identifier: ADMIN_EMAIL })
    expect(r.json.staff).toHaveLength(1)
    expect(r.json.staff[0].email).toBe(ADMIN_EMAIL.toLowerCase())
  })
})

describe('export', () => {
  it('hands over the records of the person only, with the file listed in the library', async () => {
    const r = await ask('/data-subject/export', { identifier: ANN })
    expect(r.status, r.text.slice(0, 200)).toBe(200)
    expect(r.headers.get('content-disposition')).toMatch(/^attachment; filename="data-subject-[0-9a-f]{12}\.json"$/)
    expect(r.headers.get('cache-control')).toMatch(/no-store/)
    expect(r.json.objects).toHaveLength(1)
    expect(r.json.objects[0].attributes).toMatchObject({ name: 'Ann', email: ANN })
    expect(r.json.mail.map((m: any) => m.to).sort()).toEqual(['staff@acme.test', ANN].sort())
    expect(r.json.files).toHaveLength(1)
    expect(r.json.files[0]).toMatchObject({ originalName: 'cv.pdf', mimeType: 'application/pdf' })
    expect(r.json.files[0].libraryPath).toMatch(new RegExp(`^/private/ds-${tag}/`))
    expect(r.text).not.toContain(BOB)
    expect(r.text).not.toContain(JOANN)
  })
})

describe('erase', () => {
  it('is a dry run unless told otherwise, and a real run needs the identifier typed again', async () => {
    const dry = await ask('/data-subject/erase', { identifier: ANN })
    expect(dry.json).toMatchObject({ dryRun: true, objectsDeleted: 0, mailDeleted: 0, matched: { objects: 1, mail: 2, files: 1 } })
    expect((await objectsOf()).length).toBe(3)
    for (const confirm of [undefined, 'someone-else@example.org', 5]) {
      const r = await ask('/data-subject/erase', { identifier: ANN, dryRun: false, ...(confirm === undefined ? {} : { confirm }) })
      expect(r.status, String(confirm)).toBe(400)
    }
    expect((await objectsOf()).length).toBe(3)
    expect((await ask('/data-subject/erase', { identifier: ANN, include: { mail: 'yes' } })).status).toBe(400)
  })

  it('removes the person: the object, the file from the library, the mail; Bob and the neighbour stay; it is in the audit log without the address', async () => {
    const found = await ask('/data-subject/search', { identifier: ANN })
    const assetId = found.json.files[0].assetId
    expect((await assets.get(`/api/v1/dam/assets/${assetId}`)).status).toBe(200)

    const r = await ask('/data-subject/erase', { identifier: ANN, dryRun: false, confirm: ANN.toUpperCase() })
    expect(r.status, r.text.slice(0, 300)).toBe(200)
    expect(r.json).toMatchObject({ dryRun: false, objectsDeleted: 1, filesDeleted: 1, uploadRowsDeleted: 1, mailDeleted: 2, failures: [] })

    const left = (await objectsOf()).map((o) => o.attributes.email).sort()
    expect(left).toEqual([BOB, JOANN].sort())
    expect((await assets.get(`/api/v1/dam/assets/${assetId}`)).status).toBe(404)
    const after = await ask('/data-subject/search', { identifier: ANN })
    expect(after.json.counts).toMatchObject({ objects: 0, mail: 0, files: 0 })
    // Bob's mail is still there
    expect((await ask('/data-subject/search', { identifier: BOB })).json.counts.mail).toBe(1)
    // again: nothing to do
    expect((await ask('/data-subject/erase', { identifier: ANN, dryRun: false, confirm: ANN })).json).toMatchObject({ objectsDeleted: 0, mailDeleted: 0 })

    // the audit log knows that it happened, who did it and how much, never the address
    const log = await admin.get('/audit-log?action=data_subject.&limit=50')
    expect(log.status).toBe(200)
    const erase = log.json.entries.find((e: any) => e.action === 'data_subject.erase' && e.after?.objectsDeleted === 1)
    expect(erase).toBeTruthy()
    expect(erase.actorLabel).toBe(ADMIN_EMAIL)
    expect(erase.targetId).toMatch(/^[0-9a-f]{12}$/)
    expect(JSON.stringify(log.json)).not.toContain(ANN_LOWER)
    expect(JSON.stringify(log.json)).not.toContain(ANN)
  })

  it('does not delete a staff account of the address', async () => {
    const r = await ask('/data-subject/erase', { identifier: ADMIN_EMAIL, dryRun: false, confirm: ADMIN_EMAIL })
    expect(r.json.matched.staff).toBe(1)
    expect((await admin.get('/auth/me')).status).toBe(200)
  })
})

describe('retention', () => {
  it('is set per class by an administrator only, and refuses numbers out of range', async () => {
    const editor = await createTempUser(admin, 'write')
    const s = await loginAs(editor)
    expect((await s.patch(`/data-classes/${classId}`, { retentionDays: 30 })).status).toBe(403)
    await admin.delete(`/auth/users/${editor.id}`)
    for (const retentionDays of [0, -1, 1.5, 99999, '30']) expect((await admin.patch(`/data-classes/${classId}`, { retentionDays })).status, String(retentionDays)).toBe(400)
    const ok = await admin.patch(`/data-classes/${classId}`, { retentionDays: 30 })
    expect(ok.status, ok.text.slice(0, 200)).toBe(200)
    expect(ok.json.class.retentionDays).toBe(30)
    const log = await admin.get('/audit-log?action=data_class.retention_update&limit=1')
    expect(log.json.entries[0]).toMatchObject({ targetLabel: `Ds${tag}`, after: { retentionDays: 30 } })
    expect((await admin.patch(`/data-classes/${classId}`, { retentionDays: null })).json.class.retentionDays).toBeNull()
  })

  it('removes the objects older than the class\'s days, with their files, and keeps the younger ones; the run is in the audit log', async () => {
    // an old submission with a file, and Bob's recent one
    const id = await stage(pdf('old-cv'))
    expect((await submit({ name: 'Old', email: `old.${tag}@example.org`, cv: { uploadId: id } })).status).toBe(201)
    const old = (await objectsOf()).find((o) => o.attributes.name === 'Old')!
    const assetId = old.attributes.cv.assetId
    psql(`UPDATE data_objects SET created_at = now() - interval '400 days' WHERE id = '${old.id}'`)
    expect((await admin.patch(`/data-classes/${classId}`, { retentionDays: 90 })).status).toBe(200)
    const run = await admin.post('/data-subject/retention/run', {})
    expect(run.status, run.text.slice(0, 300)).toBe(200)
    expect(run.json.classes).toEqual([{ classId, className: `Ds${tag}`, days: 90, deleted: 1, failed: 0 }])
    const names = (await objectsOf()).map((o) => o.attributes.name).sort()
    expect(names).toEqual(['Bob', 'JoAnn'])
    expect((await assets.get(`/api/v1/dam/assets/${assetId}`)).status).toBe(404)
    const log = await admin.get('/audit-log?action=retention.purge&limit=1')
    expect(log.json.entries[0].after.classes[0]).toMatchObject({ className: `Ds${tag}`, deleted: 1 })
    // a second run has nothing to do and writes nothing new
    expect((await admin.post('/data-subject/retention/run', {})).json.classes).toEqual([])
    await admin.patch(`/data-classes/${classId}`, { retentionDays: null })
  })

  it('removes mail log rows older than the number in the security settings', async () => {
    const before = (await admin.get('/mail-log?search=' + tag)).json
    expect(JSON.stringify(before)).toContain('Welcome Bob')
    psql(`UPDATE mail_log SET sent_at = now() - interval '200 days' WHERE subject = 'Welcome Bob ${tag}'`)
    expect((await admin.put('/security-settings', { mailLogRetentionDays: 0 })).status).toBe(400)
    expect((await admin.put('/security-settings', { mailLogRetentionDays: 90 })).status).toBe(200)
    const run = await admin.post('/data-subject/retention/run', {})
    expect(run.json.mailDeleted).toBeGreaterThanOrEqual(1)
    expect((await ask('/data-subject/search', { identifier: BOB })).json.counts.mail).toBe(0)
    expect((await admin.put('/security-settings', { mailLogRetentionDays: null })).status).toBe(200)
  })
})
