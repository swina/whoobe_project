// Pure helpers of the Audit log view (apps/admin-dashboard/src/utils/audit-log-ui.ts).
import { describe, it, expect } from 'vitest'
import { ACTION_CHOICES, actionLabel, actionTone, actorText, changeRows, dayEnd, dayStart, targetText, valueText, whenText } from '../../../apps/admin-dashboard/src/utils/audit-log-ui'

describe('action names', () => {
  it('read as "Area: what was done"', () => {
    expect(actionLabel('user.reset_password')).toBe('User: reset password')
    expect(actionLabel('object_event_subscription.create')).toBe('Object event subscription: create')
    expect(actionLabel('audit.purge')).toBe('Audit: purge')
  })
  it('removals are red, creations and imports green, the rest neutral', () => {
    for (const a of ['user.delete', 'setting.mail_remove', 'website.api_key_clear', 'audit.purge', 'website.publish_cancel']) expect(actionTone(a), a).toBe('delete')
    for (const a of ['role.create', 'website.import', 'migration_source.import_objects', 'website.theme_create']) expect(actionTone(a), a).toBe('create')
    for (const a of ['user.update', 'setting.update', 'website.publish']) expect(actionTone(a), a).toBe('change')
  })
  it('every filter choice is "all" or a prefix that ends in a dot, which the server reads as an area', () => {
    expect(ACTION_CHOICES[0].value).toBe('')
    for (const c of ACTION_CHOICES.slice(1)) expect(c.value).toMatch(/^[a-z_]+\.$/)
  })
})

describe('who and what', () => {
  it('names the actor by e-mail, falls back to the id, and says "system" without one', () => {
    expect(actorText({ actorType: 'user', actorLabel: 'a@example.com', actorId: 'u1' })).toBe('a@example.com')
    expect(actorText({ actorType: 'user', actorLabel: null, actorId: 'u1' })).toBe('u1')
    expect(actorText({ actorType: 'system', actorLabel: 'retention', actorId: null })).toBe('system (retention)')
    expect(actorText({ actorType: 'system', actorLabel: null, actorId: null })).toBe('system')
  })
  it('names the target by its label, then its id', () => {
    expect(targetText({ targetType: 'object_event_subscription', targetLabel: 'Orders', targetId: 'x' })).toBe('object event subscription: Orders')
    expect(targetText({ targetType: 'user', targetLabel: null, targetId: 'u2' })).toBe('user: u2')
    expect(targetText({ targetType: null, targetLabel: null, targetId: null })).toBe('-')
  })
})

describe('the fields of an entry', () => {
  it('lists each field with its two sides, and a side that is missing is empty', () => {
    expect(changeRows({ before: { name: 'A', roles: ['x'] }, after: { name: 'B' } })).toEqual([
      { field: 'name', before: 'A', after: 'B', secret: false },
      { field: 'roles', before: '["x"]', after: '', secret: false },
    ])
    expect(changeRows({ before: null, after: null })).toEqual([])
  })
  it('a credential that changed is flagged, and its value is only the word "changed"', () => {
    expect(changeRows({ before: {}, after: { dbPassword: 'changed', label: 'x' } })).toEqual([
      { field: 'dbPassword', before: '', after: 'changed', secret: true },
      { field: 'label', before: '', after: 'x', secret: false },
    ])
  })
  it('shows values as text: strings as they are, null as null, the rest as JSON', () => {
    expect(valueText('a')).toBe('a')
    expect(valueText(null)).toBe('null')
    expect(valueText(undefined)).toBe('')
    expect(valueText({ a: 1 })).toBe('{"a":1}')
    expect(valueText(false)).toBe('false')
  })
})

describe('dates', () => {
  it('a day typed in the filter becomes the start and the end of that day; anything else is ignored', () => {
    expect(new Date(dayStart('2026-10-18')).getHours()).toBe(0)
    const end = new Date(dayEnd('2026-10-18'))
    expect([end.getHours(), end.getMinutes(), end.getSeconds()]).toEqual([23, 59, 59])
    expect(dayStart('')).toBe('')
    expect(dayStart('18/10/2026')).toBe('')
    expect(dayEnd('2026-13-45')).toBe('')
  })
  it('prints an instant as local date and time, and leaves an unreadable one as it is', () => {
    expect(whenText('2026-10-18T10:05:09.000Z')).toMatch(/^2026-10-1[78] \d\d:\d\d:\d\d$/)
    expect(whenText('not a date')).toBe('not a date')
  })
})
