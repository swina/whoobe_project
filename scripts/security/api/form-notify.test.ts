// F-053: the notification mail of a public form. The `notify` block (recipient, template, subject) travels in the
// visitor's own request, so the server must honour only the block an author configured in a form - otherwise anyone
// could make it send mail to an address of their choice. Mail goes to a closed port: the attempt is what is logged
// (Settings > Mail > Log records every send, delivered or not), and that is what these tests look at.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { Client, clientFor } from '../lib/client'

const tag = randomBytes(3).toString('hex')
const owner = `owner-${tag}@sectest.local`
const from = (n: number) => ({ 'x-forwarded-for': `10.77.${Number.parseInt(tag, 16) % 200}.${n}` })   // stack runs TRUST_PROXY=1
let admin: Client
let anon: Client
let classId = ''
let tplFixed = ''
let tplDynamic = ''
const cleanup: (() => Promise<unknown>)[] = []

const notifyFixed = () => ({ enabled: true, mailTemplateId: tplFixed, templatePageId: '', recipientEmail: '', subject: '' })
const notifyDynamic = () => ({ enabled: true, mailTemplateId: tplDynamic, templatePageId: '', recipientEmail: '', subject: '' })
const submit = (notify: unknown, attributes: Record<string, unknown>, ip: number) =>
  anon.post(`/public/forms/${classId}/submit`, { attributes, formConfig: { notify } }, from(ip))
const logged = async (search: string) => {
  await new Promise((r) => setTimeout(r, 700))   // the mail is sent after the response
  return (await admin.get(`/mail-log?search=${encodeURIComponent(search)}&limit=50`)).json.records as { to: string; subject: string }[]
}

beforeAll(async () => {
  admin = await clientFor('admin')
  anon = new Client()
  const s = await admin.put('/mail-settings', { host: '127.0.0.1', port: 9, secure: false, fromAddress: 'noreply@sectest.local' })
  expect(s.status, s.text.slice(0, 120)).toBe(200)

  const cls = await admin.post('/data-classes', { name: `Notify${tag}`, label: 'Notify', fields: [{ name: 'email', title: 'Email', fieldType: 'text' }, { name: 'message', title: 'Message', fieldType: 'text' }] })
  classId = cls.json.class.id
  cleanup.push(() => admin.delete(`/data-classes/${classId}`))
  const a = await admin.post('/mail-templates', { name: `fixed-${tag}`, kind: 'text', subject: `Fixed ${tag}`, to: owner, body: 'New message: {form.message}' })
  tplFixed = a.json.template.id
  const b = await admin.post('/mail-templates', { name: `dynamic-${tag}`, kind: 'text', subject: `Dynamic ${tag}`, to: '{form.email}', body: 'Thanks: {form.message}' })
  tplDynamic = b.json.template.id

  // the page an author saved: two forms, each with its own notify block
  const form = (id: string, notify: unknown) => ({ id, element: 'form', type: 'container', tag: 'form', css: { css: '', container: '' }, blocks: [], formConfig: { enabled: true, targetClassId: classId, notify } })
  const page = await admin.post('/whoobe-one/pages', { slug: `notify-${tag}`, title: 'notify', content: { id: 'root', element: 'div', type: 'container', tag: 'document', css: { css: '', container: '' }, blocks: [form('f1', notifyFixed()), form('f2', notifyDynamic())] } })
  expect(page.status, page.text.slice(0, 150)).toBe(201)
  cleanup.push(() => admin.delete(`/whoobe-one/pages/${page.json.page.id}`))
  cleanup.push(() => admin.delete(`/mail-templates/${tplFixed}`))
  cleanup.push(() => admin.delete(`/mail-templates/${tplDynamic}`))
}, 60_000)

afterAll(async () => { for (const f of cleanup.reverse()) { try { await f() } catch { /* best effort */ } } })

describe('F-053: a notify block the visitor invents is ignored', () => {
  it('the submission is stored, and the mail the author configured is attempted', async () => {
    const r = await submit(notifyFixed(), { email: 'v@example.org', message: `hello ${tag}` }, 1)
    expect(r.status, r.text.slice(0, 120)).toBe(201)
    const rows = await logged(owner)
    expect(rows.some((m) => m.to === owner && m.subject === `Fixed ${tag}`)).toBe(true)
  })

  it('a recipient or subject of the visitor\'s choosing is not used (the block does not match any form)', async () => {
    const victim = `victim-${tag}@example.org`
    const r = await submit({ ...notifyFixed(), recipientEmail: victim, subject: `Pwned ${tag}` }, { email: 'v@example.org', message: 'x' }, 2)
    expect(r.status).toBe(201)   // the submission itself is fine
    expect((await logged(victim)).length).toBe(0)
    expect((await logged(`Pwned ${tag}`)).length).toBe(0)
  })

  it('neither is a template page or a made-up template id', async () => {
    const r1 = await submit({ enabled: true, mailTemplateId: '', templatePageId: '00000000-0000-4000-8000-000000000001', recipientEmail: `legacy-${tag}@example.org`, subject: '' }, { email: 'v@example.org', message: 'x' }, 3)
    const r2 = await submit({ enabled: true, mailTemplateId: '00000000-0000-4000-8000-000000000002', templatePageId: '', recipientEmail: `ghost-${tag}@example.org`, subject: '' }, { email: 'v@example.org', message: 'x' }, 4)
    expect([r1.status, r2.status]).toEqual([201, 201])
    expect((await logged(`legacy-${tag}`)).length + (await logged(`ghost-${tag}`)).length).toBe(0)
  })
})

describe('a template whose recipient is the visitor (a confirmation mail)', () => {
  it('mails one plain address, and refuses a list or a header injection', async () => {
    const ok = `guest-${tag}@example.org`
    expect((await submit(notifyDynamic(), { email: ok, message: 'hi' }, 5)).status).toBe(201)
    expect((await logged(ok)).some((m) => m.to === ok)).toBe(true)
    const victim = `list-${tag}@example.org`
    for (const [i, evil] of [`${ok}, ${victim}`, `${victim}\\r\\nBcc: other@example.org`, `<${victim}>`].entries()) {
      await submit(notifyDynamic(), { email: evil, message: 'hi' }, 6 + i)
    }
    expect((await logged(victim)).length).toBe(0)
  })

  it('sends at most 3 mails an hour to the same address', async () => {
    const target = `flood-${tag}@example.org`
    for (let i = 0; i < 5; i++) await submit(notifyDynamic(), { email: target, message: `n${i}` }, 20 + i)
    expect((await logged(target)).length).toBe(3)
  })
})
