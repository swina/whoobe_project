// File upload in forms (docs/plans/forms/form-upload-plan.md), phase 2: the intent, the bytes, and what the submitted form does with
// them. Every refusal is checked: wrong or forged ticket, wrong content, too large, reused link, other field, over the limits.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { Client, clientFor } from '../lib/client'
import { ASSET_TARGET } from '../lib/config'

const tag = randomBytes(3).toString('hex')
const FCV = `f-cv-${tag}`
const FDOCS = `f-docs-${tag}`
let admin: Client
let anon: Client
let assets: Client
let siteId = ''
let classId = ''
let pageId = ''
const cleanup: (() => Promise<unknown>)[] = []

const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'))
const pdf = (extra = '') => new TextEncoder().encode(`%PDF-1.4\n1 0 obj<<>>endobj\n${extra}%%EOF\n`)
const settings = (extra: object = {}) => ({ enabled: true, allowedExtensions: ['pdf', 'png', 'txt'], maxFileBytes: 20000, maxFiles: 2, dailyBytes: 10_000_000, targetFolder: `private/forms-${tag}`, ...extra })

const input = (id: string, name: string, extra: object = {}) => ({
  id, tag: 'input', type: 'element', element: 'input', label: 'File', editable: false, content: null, blocks: [], css: { css: '', container: '' },
  data: { attributes: { type: 'file', name } }, ...extra,
})

/** the address on the asset service the ticket is good for (the answer names the host the page was served from) */
const putUrl = (uploadUrl: string) => ASSET_TARGET + new URL(uploadUrl).pathname

async function intent(fieldId: string, filename: string, size: number, websiteId?: string) {
  return anon.post('/public/uploads/intent', { fieldId, filename, size, ...(websiteId ? { websiteId } : {}) })
}
async function sendBytes(url: string, bytes: Uint8Array, headers: Record<string, string> = {}) {
  const r = await fetch(putUrl(url), { method: 'PUT', headers: { 'content-type': 'application/octet-stream', ...headers }, body: bytes })
  const text = await r.text()
  return { status: r.status, text, json: (() => { try { return JSON.parse(text) } catch { return null } })() }
}
/** intent + bytes: the id of a staged upload */
async function stage(fieldId: string, filename: string, bytes: Uint8Array) {
  const i = await intent(fieldId, filename, bytes.length)
  expect(i.status, i.text).toBe(201)
  const put = await sendBytes(i.json.uploadUrl, bytes)
  expect(put.status, put.text).toBe(201)
  return i.json.uploadId as string
}
const submit = (attributes: Record<string, unknown>) => anon.post(`/public/forms/${classId}/submit`, { attributes })

beforeAll(async () => {
  admin = await clientFor('admin')
  anon = await clientFor('anon')
  assets = admin.forBase(ASSET_TARGET)
  const site = await admin.post('/whoobe-one/websites', { name: `Up ${tag}`, rootPath: `/up-${tag}` })
  expect(site.status, site.text.slice(0, 150)).toBe(201)
  siteId = site.json.website.id
  cleanup.push(() => admin.delete(`/whoobe-one/websites/${siteId}`))
  expect((await admin.put(`/whoobe-one/websites/${siteId}/upload-settings`, settings())).status).toBe(200)

  const cls = await admin.post('/data-classes', {
    name: `Up${tag}`, label: 'Up',
    fields: [{ name: 'title', title: 'Title', fieldType: 'input' }, { name: 'cv', title: 'CV', fieldType: 'manyToOneRelation' }, { name: 'docs', title: 'Docs', fieldType: 'array' }],
  })
  expect(cls.status, cls.text.slice(0, 200)).toBe(201)
  classId = cls.json.class.id
  cleanup.push(() => admin.delete(`/data-classes/${classId}`))

  const form = {
    id: `form-${tag}`, tag: 'form', type: 'container', element: 'form', semantic: 'form', editable: false, content: null, css: { css: '', container: '' },
    formConfig: { enabled: true, targetClassId: classId, notify: { enabled: false } },
    blocks: [input(FCV, 'cv', { uploadConfig: { extensions: ['pdf', 'png'], maxFiles: 1 } }), input(FDOCS, 'docs')],
  }
  const page = await admin.post('/whoobe-one/pages', { slug: `up-${tag}`, title: `Up ${tag}`, websiteId: siteId, content: { id: 'root', tag: 'document', type: 'container', element: 'div', css: { css: '', container: '' }, blocks: [form] } })
  expect(page.status, page.text.slice(0, 200)).toBe(201)
  pageId = page.json.page.id
  cleanup.push(() => admin.delete(`/whoobe-one/pages/${pageId}`))
})

afterAll(async () => { for (const f of cleanup.reverse()) { try { await f() } catch { /* best effort */ } } })

describe('intent: what is approved before any byte is sent', () => {
  it('an approved file gets a ticket and an address on the asset service', async () => {
    const r = await intent(FDOCS, 'My Report.PDF', 500)
    expect(r.status, r.text).toBe(201)
    expect(r.json.uploadUrl).toMatch(/\/public\/upload-data\/[\w-]+\.[\w-]+$/)
    expect(r.json.uploadId).toMatch(/^[0-9a-f-]{36}$/)
    expect(r.json.maxBytes).toBe(20000)
  })
  it('the field the request names must be an Upload field of a page', async () => {
    expect((await intent('nope', 'a.pdf', 5)).status).toBe(404)
    expect((await intent(`form-${tag}`, 'a.pdf', 5)).status).toBe(404) // an element of the page that is not an upload field
    expect((await anon.post('/public/uploads/intent', {})).status).toBe(404)
  })
  it.each([
    ['a script', 'x.php', 100, 415],
    ['a web page', 'x.html', 100, 415],
    ['a double extension', 'invoice.pdf.exe', 100, 415],
    ['a type the website did not allow', 'x.gif', 100, 415],
    ['a file over the limit', 'x.pdf', 20001, 413],
    ['an empty file', 'x.pdf', 0, 400],
  ])('refuses %s', async (_n, name, size, status) => {
    const r = await intent(FDOCS, name, size)
    expect(r.status, r.text).toBe(status)
    expect(r.json.reason).toBeTruthy()
  })
  it('the field can narrow the website: the CV field takes pdf and png only, not txt', async () => {
    expect((await intent(FCV, 'a.txt', 5)).status).toBe(415)
    expect((await intent(FCV, 'a.pdf', 5)).status).toBe(201)
  })
})

describe('the bytes', () => {
  it('a valid file is accepted once; the same ticket cannot be used again', async () => {
    const i = await intent(FDOCS, 'a.pdf', pdf().length)
    expect((await sendBytes(i.json.uploadUrl, pdf())).status).toBe(201)
    expect((await sendBytes(i.json.uploadUrl, pdf())).status).toBe(409)
  })
  it('a forged, altered or malformed ticket is refused', async () => {
    const i = await intent(FDOCS, 'a.pdf', pdf().length)
    const url: string = i.json.uploadUrl
    expect((await sendBytes(url.slice(0, -3) + 'abc', pdf())).status).toBe(401)
    expect((await sendBytes(url.replace(/\/[^/]+$/, '/garbage'), pdf())).status).toBe(401)
    const [payload, sig] = url.split('/').pop()!.split('.')
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), m: 10_000_000 })).toString('base64url')
    expect((await sendBytes(url.replace(payload, forged), pdf())).status).toBe(401)
    expect(sig).toBeTruthy()
  })
  it('the content must be what the name says: a PNG sent as .pdf, and a script sent as .png, are refused', async () => {
    const a = await intent(FDOCS, 'fake.pdf', PNG.length)
    const r = await sendBytes(a.json.uploadUrl, PNG)
    expect(r.status, r.text).toBe(415)
    expect((await sendBytes(a.json.uploadUrl, PNG)).status).toBe(409) // a refused upload is spent
    const script = new TextEncoder().encode('<script>alert(1)</script>')
    const b = await intent(FDOCS, 'evil.png', script.length)
    expect((await sendBytes(b.json.uploadUrl, script)).status).toBe(415)
  })
  it('a body larger than declared is cut, even when the declaration was honest and small', async () => {
    const i = await intent(FDOCS, 'a.pdf', 100)
    const big = pdf('x'.repeat(5000))
    const r = await sendBytes(i.json.uploadUrl, big)
    expect(r.status).toBe(413)
  })
  it('a picture that only starts like one is refused (it is decoded and written again)', async () => {
    const lie = new Uint8Array([...PNG.slice(0, 8), ...new TextEncoder().encode('this is not a png at all')])
    const i = await intent(FDOCS, 'a.png', lie.length)
    expect((await sendBytes(i.json.uploadUrl, lie)).status).toBe(415)
  })
  it('a ticket for an empty body is refused', async () => {
    const i = await intent(FDOCS, 'a.pdf', 10)
    expect((await sendBytes(i.json.uploadUrl, new Uint8Array())).status).toBe(400)
  })
})

describe('the submitted form', () => {
  it('attaches the uploaded file: a private asset under a generated name, referenced by the object', async () => {
    const id = await stage(FCV, 'My CV (final).pdf', pdf('cv-content'))
    const r = await submit({ title: 'Ann', cv: { uploadId: id } })
    expect(r.status, r.text).toBe(201)
    const list = await admin.post('/data-objects/query', { classId })
    const objects = (await admin.get(`/data-objects?classId=${classId}`)).json?.objects ?? list.json?.objects ?? []
    const mine = objects.find((o: any) => o.attributes?.title === 'Ann')
    expect(mine, JSON.stringify(objects).slice(0, 300)).toBeTruthy()
    const assetId = mine.attributes.cv.assetId
    expect(assetId).toMatch(/^[0-9a-f-]{36}$/)
    const asset = await assets.get(`/api/v1/dam/assets/${assetId}`)
    expect(asset.status, asset.text.slice(0, 200)).toBe(200)
    const a = asset.json.asset ?? asset.json
    expect(a.pimcorePath).toMatch(new RegExp(`^/private/forms-${tag}/[0-9a-f-]{36}\\.pdf$`))
    expect(a.pimcorePath).not.toContain('CV')
    expect(a.isPublic).toBe(false)
    // an administrator can read it ...
    const key = String(a.s3Key ?? a.key)
    const got = await assets.get(`/dam-asset/${key}`)
    expect(got.status).toBe(200)
    expect(got.text).toContain('cv-content')
    // ... and the public cannot
    expect((await new Client(ASSET_TARGET, 'anon').get(`/dam-asset/${key}`)).status).toBe(404)
  })
  it('a picture goes through the re-encoding: what was appended after the image is gone', async () => {
    const withTail = new Uint8Array([...PNG, ...new TextEncoder().encode('<script>steal()</script>')])
    const id = await stage(FDOCS, 'p.png', withTail)
    const r = await submit({ title: 'Pic', docs: [{ uploadId: id }] })
    expect(r.status, r.text).toBe(201)
    const objects = (await admin.get(`/data-objects?classId=${classId}`)).json.objects
    const assetId = objects.find((o: any) => o.attributes?.title === 'Pic').attributes.docs[0]
    const a = (await assets.get(`/api/v1/dam/assets/${assetId}`)).json
    const asset = a.asset ?? a
    const bytes = await assets.get(`/dam-asset/${asset.s3Key ?? asset.key}`)
    expect(bytes.text).not.toContain('steal()')
    expect(bytes.status).toBe(200)
  })
  it('an upload can be used once, and only by a form that has the field', async () => {
    const id = await stage(FCV, 'once.pdf', pdf('once'))
    expect((await submit({ title: 'One', cv: { uploadId: id } })).status).toBe(201)
    const again = await submit({ title: 'Two', cv: { uploadId: id } })
    expect(again.status).toBe(400)
    expect(again.json.error).toMatch(/upload/i)
  })
  it('an upload made for another field cannot be put in this one', async () => {
    const id = await stage(FDOCS, 'other.pdf', pdf('other'))
    const r = await submit({ title: 'Mix', cv: { uploadId: id } })
    expect(r.status).toBe(400)
  })
  it('an upload that was approved but never sent cannot be submitted', async () => {
    const i = await intent(FCV, 'never.pdf', 50)
    expect((await submit({ title: 'Ghost', cv: { uploadId: i.json.uploadId } })).status).toBe(400)
  })
  it('a field takes the files it was set for: not a made-up id, not a plain string, not more than allowed', async () => {
    expect((await submit({ title: 'x', cv: { uploadId: '00000000-0000-4000-8000-000000000000' } })).status).toBe(400)
    expect((await submit({ title: 'x', cv: 'private/forms/other.pdf' })).status).toBe(400)
    expect((await submit({ title: 'x', cv: { assetId: 'some-asset' } })).status).toBe(400)
    const a = await stage(FCV, 'm1.pdf', pdf('m1'))
    const b = await stage(FCV, 'm2.pdf', pdf('m2'))
    expect((await submit({ title: 'x', cv: [{ uploadId: a }, { uploadId: b }] })).status).toBe(400) // the field takes one
    const c = await stage(FDOCS, 'd1.pdf', pdf('d1'))
    const d = await stage(FDOCS, 'd2.pdf', pdf('d2'))
    const e = await stage(FDOCS, 'd3.pdf', pdf('d3'))
    expect((await submit({ title: 'x', docs: [{ uploadId: c }, { uploadId: d }, { uploadId: e }] })).status).toBe(400) // the website allows 2
    expect((await submit({ title: 'ok', docs: [{ uploadId: c }, { uploadId: d }] })).status).toBe(201)
  })
})

describe('the website decides', () => {
  it('uploads off: the intent is refused, and nothing already staged can be submitted', async () => {
    const id = await stage(FDOCS, 'later.pdf', pdf('later'))
    expect((await admin.put(`/whoobe-one/websites/${siteId}/upload-settings`, settings({ enabled: false }))).status).toBe(200)
    try {
      expect((await intent(FDOCS, 'a.pdf', 5)).status).toBe(403)
      expect((await submit({ title: 'off', docs: [{ uploadId: id }] })).status).toBe(403)
    } finally {
      await admin.put(`/whoobe-one/websites/${siteId}/upload-settings`, settings())
    }
  })
  it('the daily quota counts what was approved', async () => {
    await admin.put(`/whoobe-one/websites/${siteId}/upload-settings`, settings({ dailyBytes: 1 }))
    try {
      expect((await intent(FDOCS, 'a.pdf', 5)).status).toBe(429)
    } finally {
      await admin.put(`/whoobe-one/websites/${siteId}/upload-settings`, settings())
    }
  })
})

describe('the same field in two websites (a duplicated page keeps its node ids)', () => {
  it('the website the page is served for decides: its limits, and the files are attached for it', async () => {
    const other = await admin.post('/whoobe-one/websites', { name: `Up2 ${tag}`, rootPath: `/up2-${tag}` })
    expect(other.status, other.text.slice(0, 120)).toBe(201)
    const siteB = other.json.website.id
    const form = {
      id: `form2-${tag}`, tag: 'form', type: 'container', element: 'form', semantic: 'form', editable: false, content: null, css: { css: '', container: '' },
      formConfig: { enabled: true, targetClassId: classId, notify: { enabled: false } }, blocks: [input(FCV, 'cv', { uploadConfig: { extensions: ['pdf', 'png'], maxFiles: 1 } }), input(FDOCS, 'docs')],
    }
    const copy = await admin.post('/whoobe-one/pages', { slug: `up2-${tag}`, title: 'copy', websiteId: siteB, content: { id: 'root2', tag: 'document', type: 'container', element: 'div', css: { css: '', container: '' }, blocks: [form] } })
    expect(copy.status, copy.text.slice(0, 160)).toBe(201)
    try {
      await new Promise((r) => setTimeout(r, 2300)) // the server re-reads the pages at most every 2 seconds when it does not know a field
      expect((await admin.put(`/whoobe-one/websites/${siteB}/upload-settings`, settings({ maxFileBytes: 100, allowedExtensions: ['pdf'], targetFolder: `private/second-${tag}` }))).status).toBe(200)
      // asking for website B: B's limit (100 bytes) applies; asking for A: A's (20000)
      expect((await intent(FDOCS, 'a.pdf', 500, siteB)).status).toBe(413)
      expect((await intent(FDOCS, 'a.pdf', 500, siteId)).status).toBe(201)
      // a small file for B is attached for B: in B's folder
      const i = await intent(FDOCS, 'b.pdf', pdf().length < 100 ? pdf().length : 90, siteB)
      expect(i.status, i.text).toBe(201)
      const small = new TextEncoder().encode('%PDF-1.4\nsmall\n%%EOF\n')
      const j = await intent(FDOCS, 'b.pdf', small.length, siteB)
      expect((await sendBytes(j.json.uploadUrl, small)).status).toBe(201)
      expect((await submit({ title: 'SecondSite', docs: [{ uploadId: j.json.uploadId }] })).status).toBe(201)
      const objects = (await admin.get(`/data-objects?classId=${classId}`)).json.objects
      const assetId = objects.find((o: any) => o.attributes?.title === 'SecondSite').attributes.docs[0]
      const a = (await assets.get(`/api/v1/dam/assets/${assetId}`)).json
      expect((a.asset ?? a).pimcorePath).toContain(`/private/second-${tag}/`)
    } finally {
      await admin.delete(`/whoobe-one/pages/${copy.json.page.id}`)
      await admin.delete(`/whoobe-one/websites/${siteB}`)
    }
  })
})

describe('the attach step is not for the public', () => {
  it('the internal attach endpoint needs the service token or a permission', async () => {
    const r = await new Client(ASSET_TARGET, 'anon').post('/api/v1/dam/form-uploads/attach', { uploadId: 'x', websiteId: 'y', formRef: 'z', targetFolder: 'private/x' })
    expect([401, 403]).toContain(r.status)
  })
  it('the ticket route answers CORS for any page origin without credentials', async () => {
    const r = await fetch(`${ASSET_TARGET}/public/upload-data/x.y`, { method: 'OPTIONS', headers: { origin: 'https://someone-elses-site.example', 'access-control-request-method': 'PUT' } })
    expect(r.status).toBe(204)
    expect(r.headers.get('access-control-allow-origin')).toBe('https://someone-elses-site.example')
    expect(r.headers.get('access-control-allow-credentials')).toBeNull()
    expect(r.headers.get('access-control-allow-methods')).toContain('PUT')
  })
})
