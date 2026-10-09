// The checks behind the form Upload field (docs/plans/forms/form-upload-plan.md), phase 1: the limits a website may set, what is
// refused before any byte is sent, what the content must look like, and the ticket that lets one file be sent.
import { describe, it, expect } from 'vitest'
import { checkUploadIntent, normalizeUploadLimits, DEFAULT_UPLOAD_LIMITS, UPLOAD_CEILINGS, storedFileName, displayFileName, extensionOf, isPrivateFolder } from '../../../packages/core/src/uploads/limits'
import { contentMatchesExtension, SNIFFABLE_EXTENSIONS } from '../../../packages/core/src/uploads/sniff'
import { signUploadTicket, verifyUploadTicket, type UploadTicket } from '../../../packages/core/src/uploads/token'

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
