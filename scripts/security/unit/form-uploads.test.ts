// The checks behind the form Upload field (docs/plans/forms/form-upload-plan.md), phase 1: the limits a website may set, what is
// refused before any byte is sent, what the content must look like, and the ticket that lets one file be sent.
import { describe, it, expect } from 'vitest'
import { checkUploadIntent, normalizeUploadLimits, DEFAULT_UPLOAD_LIMITS, UPLOAD_CEILINGS, storedFileName, displayFileName, extensionOf, isPrivateFolder } from '../../../packages/core/src/uploads/limits'
import { collectAuthoredUploadFields, effectiveUploadLimits, readUploadRefs, formUploadStagingKey } from '../../../packages/core/src/uploads/fields'
import { contentMatchesExtension, SNIFFABLE_EXTENSIONS } from '../../../packages/core/src/uploads/sniff'
import { signUploadTicket, verifyUploadTicket, uploadTokenSecret, type UploadTicket } from '../../../packages/core/src/uploads/token'

const on = (extra: object = {}) => normalizeUploadLimits({ enabled: true, allowedExtensions: ['pdf', 'png', 'jpg', 'docx', 'txt'], ...extra })
const bytes = (...v: number[]) => new Uint8Array(v)
const text = (s: string) => new TextEncoder().encode(s)

describe('normalizeUploadLimits', () => {
  it('is off, private and small by default', () => {
    const l = normalizeUploadLimits(undefined)
    expect(l).toEqual(DEFAULT_UPLOAD_LIMITS)
    expect(l.enabled).toBe(false)
    expect(isPrivateFolder(l.targetFolder)).toBe(true)
  })
  it('keeps only extensions that can be verified and are not active content', () => {
    const l = normalizeUploadLimits({ enabled: true, allowedExtensions: ['PDF', '.png', 'html', 'svg', 'exe', 'js', 'unknownext', 'pdf'] })
    expect(l.allowedExtensions).toEqual(['pdf', 'png'])
  })
  it('clamps numbers to the ceilings and ignores nonsense', () => {
    const l = normalizeUploadLimits({ maxFileBytes: 10 ** 12, maxFiles: 500, dailyBytes: 10 ** 15 })
    expect(l.maxFileBytes).toBe(UPLOAD_CEILINGS.maxFileBytes)
    expect(l.maxFiles).toBe(UPLOAD_CEILINGS.maxFiles)
    expect(l.dailyBytes).toBe(UPLOAD_CEILINGS.dailyBytes)
    const bad = normalizeUploadLimits({ maxFileBytes: 'big', maxFiles: -4, dailyBytes: null })
    expect(bad.maxFileBytes).toBe(DEFAULT_UPLOAD_LIMITS.maxFileBytes)
    expect(bad.maxFiles).toBe(1)
  })
  it('a public folder needs allowPublicFolder; a bad folder falls back to the default', () => {
    expect(normalizeUploadLimits({ targetFolder: 'public/cv' }).targetFolder).toBe('private/forms')
    expect(normalizeUploadLimits({ targetFolder: 'public/cv', allowPublicFolder: true }).targetFolder).toBe('public/cv')
    expect(normalizeUploadLimits({ targetFolder: 'private/cv' }).targetFolder).toBe('private/cv')
    for (const bad of ['../etc', 'private/../public', '/', '', 'a/./b', 'private/.hidden', 'x'.repeat(200), 7]) {
      expect(normalizeUploadLimits({ targetFolder: bad, allowPublicFolder: true }).targetFolder, String(bad)).toBe('private/forms')
    }
  })
})

describe('checkUploadIntent', () => {
  const l = on({ maxFileBytes: 1000, dailyBytes: 2500 })
  it('accepts an allowed file', () => {
    expect(checkUploadIntent(l, { filename: 'My CV.PDF', size: 500 })).toEqual({ ok: true, extension: 'pdf' })
  })
  it('refuses everything when uploads are off', () => {
    expect(checkUploadIntent(normalizeUploadLimits({ allowedExtensions: ['pdf'] }), { filename: 'a.pdf', size: 5 })).toMatchObject({ ok: false, reason: 'disabled' })
  })
  it.each(['a.php', 'invoice.pdf.exe', 'a.php.jpg', 'x.html', 'pic.svg', 'run.sh', 'a.PDF.JS', 'photo.png.htaccess'])('%s is blocked whatever is allowed', (name) => {
    expect(checkUploadIntent(on({ allowedExtensions: ['pdf', 'png', 'jpg', 'html', 'svg'] }), { filename: name, size: 5 })).toMatchObject({ ok: false, reason: 'extension-blocked' })
  })
  it.each(['a.zip', 'a.gif', 'noext', 'a.', '.pdf'])('%s is not in the allow-list', (name) => {
    expect(checkUploadIntent(l, { filename: name, size: 5 })).toMatchObject({ ok: false, reason: 'extension-not-allowed' })
  })
  it.each([[0], [-1], [NaN], ['10'], [undefined]])('size %s is refused', (size) => {
    expect(checkUploadIntent(l, { filename: 'a.pdf', size })).toMatchObject({ ok: false, reason: 'empty' })
  })
  it('refuses a file over the limit and over the daily quota', () => {
    expect(checkUploadIntent(l, { filename: 'a.pdf', size: 1001 })).toMatchObject({ ok: false, reason: 'too-large' })
    expect(checkUploadIntent(l, { filename: 'a.pdf', size: 600 }, 2000)).toMatchObject({ ok: false, reason: 'quota' })
    expect(checkUploadIntent(l, { filename: 'a.pdf', size: 500 }, 2000)).toMatchObject({ ok: true })
  })
  it('refuses odd names', () => {
    expect(checkUploadIntent(l, { filename: 'a\u0000.pdf', size: 5 })).toMatchObject({ ok: false, reason: 'name' })
    expect(checkUploadIntent(l, { filename: 'x'.repeat(300) + '.pdf', size: 5 })).toMatchObject({ ok: false, reason: 'name' })
    expect(checkUploadIntent(l, { filename: 42, size: 5 })).toMatchObject({ ok: false, reason: 'name' })
  })
  it('a path in the name does not count: only the file part', () => {
    expect(checkUploadIntent(l, { filename: '../../etc/cv.pdf', size: 5 })).toEqual({ ok: true, extension: 'pdf' })
  })
})

describe('names', () => {
  it('the stored name is generated; the display name is cleaned', () => {
    expect(storedFileName('1b2c', 'pdf')).toBe('1b2c.pdf')
    expect(storedFileName('1b2c', '../x')).toBe('1b2c.x')
    expect(displayFileName('C:\\fakepath\\cv <b>.pdf')).toBe('cv b.pdf')
    expect(displayFileName('\u0000\u0001')).toBe('file')
    expect(extensionOf('a.tar.GZ')).toBe('gz')
  })
})

describe('contentMatchesExtension', () => {
  const pdf = text('%PDF-1.7\n...')
  const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0)
  const jpg = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10)
  const zip = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0)
  it('accepts the real thing', () => {
    expect(contentMatchesExtension('pdf', pdf)).toBe(true)
    expect(contentMatchesExtension('PNG', png)).toBe(true)
    expect(contentMatchesExtension('jpg', jpg)).toBe(true)
    expect(contentMatchesExtension('jpeg', jpg)).toBe(true)
    expect(contentMatchesExtension('docx', zip)).toBe(true)
    expect(contentMatchesExtension('zip', zip)).toBe(true)
    expect(contentMatchesExtension('gif', text('GIF89a....'))).toBe(true)
    expect(contentMatchesExtension('webp', text('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe(true)
    expect(contentMatchesExtension('mp4', bytes(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73))).toBe(true)
    expect(contentMatchesExtension('mp3', text('ID3\u0004'))).toBe(true)
    expect(contentMatchesExtension('txt', text('hello, world\nsecond line\t'))).toBe(true)
    expect(contentMatchesExtension('csv', text('a,b\n"è",2\n'))).toBe(true)
  })
  it('refuses a file that is not what its name says', () => {
    expect(contentMatchesExtension('pdf', png)).toBe(false)
    expect(contentMatchesExtension('png', pdf)).toBe(false)
    expect(contentMatchesExtension('jpg', text('<?php system($_GET[0]); ?>'))).toBe(false)
    expect(contentMatchesExtension('pdf', text('<html><script>alert(1)</script>'))).toBe(false)
    expect(contentMatchesExtension('docx', pdf)).toBe(false)
    expect(contentMatchesExtension('pdf', new Uint8Array())).toBe(false)
  })
  it('text must be text', () => {
    expect(contentMatchesExtension('txt', bytes(0x4d, 0x5a, 0x90, 0))).toBe(false) // an exe header
    expect(contentMatchesExtension('txt', bytes(0xc3, 0x28))).toBe(false) // invalid UTF-8
    expect(contentMatchesExtension('csv', new Uint8Array())).toBe(false)
    expect(contentMatchesExtension('txt', bytes(0x61, 0x07, 0x62))).toBe(false) // a control byte
  })
  it('an extension the check does not know is never accepted, and none of the active ones is known', () => {
    expect(contentMatchesExtension('exe', text('MZ'))).toBe(false)
    expect(contentMatchesExtension('html', text('<p>'))).toBe(false)
    for (const e of ['html', 'svg', 'js', 'php', 'exe', 'xml']) expect(SNIFFABLE_EXTENSIONS.has(e), e).toBe(false)
  })
})

describe('upload ticket', () => {
  const secret = 'a-test-secret-of-sufficient-length'
  const t: UploadTicket = { u: 'up-1', w: 'site-1', f: 'form-1', x: 'pdf', m: 1000, e: 2000 }
  it('round-trips while valid', () => {
    expect(verifyUploadTicket(signUploadTicket(t, secret), secret, 1999)).toEqual(t)
  })
  it('expires', () => {
    expect(verifyUploadTicket(signUploadTicket(t, secret), secret, 2001)).toBeNull()
  })
  it('refuses a different secret, a changed payload and malformed tokens', () => {
    const good = signUploadTicket(t, secret)
    expect(verifyUploadTicket(good, 'another-secret-of-sufficient-length', 1)).toBeNull()
    const [, sig] = good.split('.')
    const forged = Buffer.from(JSON.stringify({ ...t, m: 10 ** 9 })).toString('base64url')
    expect(verifyUploadTicket(`${forged}.${sig}`, secret, 1)).toBeNull()
    for (const bad of ['', 'x', 'a.b.c', '.', `${good}x`, null, undefined, 42, 'x'.repeat(5000)]) expect(verifyUploadTicket(bad, secret, 1), String(bad)).toBeNull()
  })
  it('will not sign without a real secret', () => {
    expect(() => signUploadTicket(t, '')).toThrow()
    expect(() => signUploadTicket(t, 'short')).toThrow()
  })
})

describe('the Upload fields of the pages', () => {
  const file = (id: string, name: string, extra: object = {}) => ({ id, element: 'input', data: { attributes: { type: 'file', name } }, ...extra })
  const form = (cls: string, ...children: unknown[]) => ({ id: `form-${cls}`, formConfig: { enabled: true, targetClassId: cls }, blocks: children })

  it('finds a file input inside a form, at any depth, with its class, name, website and settings', () => {
    const page = { websiteId: 'w1', content: { id: 'r', blocks: [{ id: 'box', blocks: [form('c1', { id: 'row', blocks: [file('f1', 'cv', { uploadConfig: { extensions: ['.PDF', 'png'], maxFiles: 1.9, targetFolder: ' private/cv ' } })] })] }] } }
    const found = collectAuthoredUploadFields([page])
    expect(found.find((f) => f.fieldId === 'f1')).toEqual({ fieldId: 'f1', name: 'cv', targetClassId: 'c1', websiteId: 'w1', config: { extensions: ['pdf', 'png'], maxFiles: 1, targetFolder: 'private/cv' } })
  })
  it('ignores a file input outside a form, a disabled form, and other kinds of input', () => {
    const outside = { websiteId: 'w', content: { blocks: [file('f-out', 'x')] } }
    const disabled = { websiteId: 'w', content: { blocks: [{ id: 'fm', formConfig: { enabled: false, targetClassId: 'c' }, blocks: [] }, { blocks: [file('f-d', 'x')] }] } }
    const text = { websiteId: 'w', content: { blocks: [form('c', { id: 't', element: 'input', data: { attributes: { type: 'text', name: 'a' } } }, file('f-noname', ''))] } }
    expect(collectAuthoredUploadFields([outside, disabled, text])).toHaveLength(0)
  })
  it('a hostile uploadConfig is cleaned', () => {
    const page = { websiteId: 'w', content: { blocks: [form('c', file('f', 'a', { uploadConfig: 'nope' }))] } }
    expect(collectAuthoredUploadFields([page])[0]).toMatchObject({ name: 'a', config: {} })
  })
  it('the same node id in two pages (a duplicated page) is returned for each website', () => {
    const page = (websiteId: string) => ({ websiteId, content: { blocks: [form('c', file('same-id', 'cv'))] } })
    expect(collectAuthoredUploadFields([page('w1'), page('w2')]).map((f) => f.websiteId)).toEqual(['w1', 'w2'])
  })
})

describe('effectiveUploadLimits: a field can ask for less, never for more', () => {
  const site = normalizeUploadLimits({ enabled: true, allowedExtensions: ['pdf', 'png', 'txt'], maxFiles: 4, targetFolder: 'private/forms' })
  it('narrows the types and the number of files', () => {
    expect(effectiveUploadLimits(site, { extensions: ['pdf', 'zip', 'html'], maxFiles: 2 })).toMatchObject({ allowedExtensions: ['pdf'], maxFiles: 2 })
    expect(effectiveUploadLimits(site, { maxFiles: 99 }).maxFiles).toBe(4)
    expect(effectiveUploadLimits(site, undefined)).toBe(site)
    expect(effectiveUploadLimits(site, {}).allowedExtensions).toEqual(['pdf', 'png', 'txt'])
  })
  it('a field folder follows the same rules as the website: private unless a public one is allowed', () => {
    expect(effectiveUploadLimits(site, { targetFolder: 'private/cv' }).targetFolder).toBe('private/cv')
    expect(effectiveUploadLimits(site, { targetFolder: 'public/cv' }).targetFolder).toBe('private/forms')
    expect(effectiveUploadLimits(site, { targetFolder: '../x' }).targetFolder).toBe('private/forms')
    const open = normalizeUploadLimits({ ...site, allowPublicFolder: true })
    expect(effectiveUploadLimits(open, { targetFolder: 'public/cv' }).targetFolder).toBe('public/cv')
  })
})

describe('readUploadRefs', () => {
  const id = '3f2b8c1e-5a4d-4e7b-9c1a-0d2e4f6a8b10'
  it('reads one reference or a list, normalised', () => {
    expect(readUploadRefs({ uploadId: id.toUpperCase() })).toEqual([id])
    expect(readUploadRefs([{ uploadId: id }, { uploadId: '11111111-1111-4111-8111-111111111111' }])).toHaveLength(2)
  })
  it.each([null, undefined, 'a-string', 7, {}, { uploadId: 'not-a-uuid' }, { assetId: id }, [], [{ uploadId: id }, { uploadId: id }], [{ uploadId: id }, 'x']])('%j is not a reference', (v) => {
    expect(readUploadRefs(v)).toBeNull()
  })
})

describe('staging key and secret', () => {
  it('the staging key is private and cannot be steered by the extension', () => {
    expect(formUploadStagingKey('w1', 'u1', 'pdf')).toBe('private/_uploads/w1/u1.pdf')
    expect(formUploadStagingKey('w1', 'u1', '../x')).toBe('private/_uploads/w1/u1.x')
  })
  it('the secret must be set, long enough, and not the placeholder of .env.example', () => {
    expect(uploadTokenSecret({ UPLOAD_TOKEN_SECRET: 'a'.repeat(32) } as any)).toBe('a'.repeat(32))
    for (const v of [undefined, '', '  ', 'short', 'change_me_upload_token_secret']) expect(uploadTokenSecret({ UPLOAD_TOKEN_SECRET: v } as any), String(v)).toBeNull()
  })
})
