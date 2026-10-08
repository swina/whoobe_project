// The pieces behind F-053 (apps/core-api/src/form-notify.ts): which notify blocks count, which recipients are
// acceptable, and the hourly limit per address. Pure functions, no stack needed.
import { describe, it, expect } from 'vitest'
import { collectAuthoredNotify, collectAuthoredNotifyKeys, createAuthoredNotifyCache, createRecipientThrottle, isSingleEmail, notifyKey } from '../../../apps/core-api/src/form-notify'

describe('notifyKey / collectAuthoredNotifyKeys', () => {
  const form = (target: string, notify: object) => ({ blocks: [{ formConfig: { targetClassId: target, notify } }] })

  it('collects the enabled notify block of every form, at any depth', () => {
    const tree = { blocks: [form('c1', { enabled: true, mailTemplateId: 't1', recipientEmail: 'a@x.org' }), { blocks: [form('c2', { enabled: true, templatePageId: 'p1', recipientEmail: 'b@x.org', subject: 'S' })] }] }
    const keys = collectAuthoredNotifyKeys([tree])
    expect(keys.has(notifyKey('c1', { mailTemplateId: 't1', recipientEmail: 'a@x.org' }))).toBe(true)
    expect(keys.has(notifyKey('c2', { templatePageId: 'p1', recipientEmail: 'b@x.org', subject: 'S' }))).toBe(true)
  })
  it('ignores a disabled block', () => {
    expect(collectAuthoredNotifyKeys([form('c1', { enabled: false, mailTemplateId: 't1' })]).size).toBe(0)
  })
  it('a different recipient, subject, template or class is a different block', () => {
    const keys = collectAuthoredNotifyKeys([form('c1', { enabled: true, mailTemplateId: 't1', recipientEmail: 'a@x.org', subject: 'S' })])
    const base = { mailTemplateId: 't1', recipientEmail: 'a@x.org', subject: 'S' }
    expect(keys.has(notifyKey('c1', base))).toBe(true)
    expect(keys.has(notifyKey('c1', { ...base, recipientEmail: 'evil@x.org' }))).toBe(false)
    expect(keys.has(notifyKey('c1', { ...base, subject: 'Other' }))).toBe(false)
    expect(keys.has(notifyKey('c1', { ...base, mailTemplateId: 't2' }))).toBe(false)
    expect(keys.has(notifyKey('c2', base))).toBe(false)
  })
  it('does not care about white space or missing fields', () => {
    expect(notifyKey('c1', { mailTemplateId: ' t1 ' })).toBe(notifyKey('c1', { mailTemplateId: 't1', recipientEmail: '', subject: undefined }))
  })
})

describe('isSingleEmail', () => {
  it.each(['a@b.co', 'first.last+tag@sub.example.org'])('%s is one plain address', (v) => expect(isSingleEmail(v)).toBe(true))
  it.each(['', 'a', 'a@b', 'a@b.co, c@d.co', 'a@b.co;c@d.co', '<a@b.co>', '"A" <a@b.co>', 'a@b.co\r\nBcc: c@d.co', 'a b@c.co', `${'x'.repeat(250)}@b.co`])('%j is refused', (v) => expect(isSingleEmail(v)).toBe(false))
})

describe('createRecipientThrottle', () => {
  it('allows the limit, then refuses until the window has passed, per address (case-insensitive)', () => {
    let t = 0
    const th = createRecipientThrottle(3, 1000, () => t)
    expect([1, 2, 3, 4].map(() => th.take('A@x.org'))).toEqual([true, true, true, false])
    expect(th.take('a@x.org')).toBe(false)
    expect(th.take('other@x.org')).toBe(true)
    t = 1500
    expect(th.take('a@x.org')).toBe(true)
  })
})

describe('the website of an authored block', () => {
  const page = (websiteId: string | null, notify: object) => ({ websiteId, content: { blocks: [{ formConfig: { targetClassId: 'c', notify } }] } })
  it('is the website of the page the form is in: its mail goes out with that website\'s configuration', () => {
    const found = collectAuthoredNotify([page('site-a', { enabled: true, mailTemplateId: 't1' }), page(null, { enabled: true, mailTemplateId: 't2' })])
    expect(found.get(notifyKey('c', { mailTemplateId: 't1' }))).toEqual({ websiteId: 'site-a' })
    expect(found.get(notifyKey('c', { mailTemplateId: 't2' }))).toEqual({ websiteId: null })
  })
  it('the first page wins when two forms share a block', () => {
    const found = collectAuthoredNotify([page('site-a', { enabled: true, mailTemplateId: 't1' }), page('site-b', { enabled: true, mailTemplateId: 't1' })])
    expect(found.get(notifyKey('c', { mailTemplateId: 't1' }))).toEqual({ websiteId: 'site-a' })
  })
})

describe('createAuthoredNotifyCache', () => {
  it('reads the pages once per ttl, and says which website a block belongs to', async () => {
    let t = 0
    let loads = 0
    const cache = createAuthoredNotifyCache(async () => { loads++; return [{ websiteId: 'w1', content: { formConfig: { targetClassId: 'c', notify: { enabled: true, mailTemplateId: 't' } } } }] }, 100, () => t)
    const key = notifyKey('c', { mailTemplateId: 't' })
    expect(await cache.has(key)).toBe(true)
    expect(await cache.lookup(key)).toEqual({ websiteId: 'w1' })
    expect(await cache.lookup('nope')).toBeNull()
    expect(loads).toBe(1)
    t = 200
    await cache.has(key)
    expect(loads).toBe(2)
  })
})
