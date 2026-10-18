// The audit guard (apps/core-api/src/audit.ts) and the specs (audit-specs.ts) without a database or a server: the inserts are captured.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

const inserted: any[] = []
let failInsert = false
// the path the core-api resolves '@whoobe-cms/core/server' to, so that the guard under test gets the stand-in
vi.mock('../../../packages/core/dist/server.js', async (orig) => ({
  ...(await orig<typeof import('@whoobe-cms/core/server')>()),
  insertAuditSafe: async (entry: any, onError: (e: unknown, x: any) => void) => {
    if (failInsert) { onError(new Error('db down'), entry); return }
    inserted.push(entry)
  },
}))

const { createAudit } = await import('../../../apps/core-api/src/audit')
const { AUDIT, websiteSnapshot } = await import('../../../apps/core-api/src/audit-specs')
const errors: any[] = []
const { audited } = createAudit({ error: (o, m) => errors.push({ o, m }) })

/** Runs one request through the guard like Express would: guard, then a handler that answers, then the response finishes. */
async function run(spec: any, over: { params?: any; body?: any; status?: number; answer?: any; user?: any; handler?: () => void } = {}) {
  const req: any = { params: over.params ?? {}, body: over.body ?? {}, query: {}, headers: {}, ip: '10.1.2.3', user: over.user === undefined ? { id: 'u1', email: 'admin@example.com' } : over.user }
  const res: any = Object.assign(new EventEmitter(), { statusCode: over.status ?? 200 })
  res.json = (b: unknown) => { res.emit('finish'); return res }
  await new Promise<void>((resolve) => { audited(spec)(req, res, () => { over.handler?.(); res.json(over.answer ?? {}); resolve() }) })
  await new Promise((r) => setTimeout(r, 10)) // the row is written after the response
}

beforeEach(() => { inserted.length = 0; errors.length = 0; failInsert = false })

const user = (over: any = {}) => ({ id: 'u2', email: 'ed@example.com', displayName: 'Ed', isActive: true, roleNames: ['editor'], roleIds: ['r'], createdAt: new Date(), lastLoginAt: null, passwordHash: 'HASH', ...over })

describe('audited(): what a row holds', () => {
  const base = { kind: 'update' as const, action: 'user.update', targetType: 'user', snapshot: (u: any) => ({ displayName: u.displayName, isActive: u.isActive }), targetLabel: (u: any) => u?.email }

  it('an update records the actor, the address, the target and only the fields that changed', async () => {
    await run({ ...base, loadBefore: async () => user({ displayName: 'Old', isActive: true }), fromResponse: (b: any) => b.user }, { params: { id: 'u2' }, answer: { user: user({ displayName: 'New', isActive: true }) } })
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({ actor: { type: 'user', id: 'u1', label: 'admin@example.com' }, ip: '10.1.2.3', action: 'user.update', targetType: 'user', targetId: 'u2', targetLabel: 'ed@example.com', before: { displayName: 'Old' }, after: { displayName: 'New' } })
  })

  it('a create records the new state, a delete the old one', async () => {
    await run({ ...base, kind: 'create', action: 'user.create', fromResponse: (b: any) => b.user }, { answer: { user: user() } })
    expect(inserted[0]).toMatchObject({ action: 'user.create', targetId: 'u2', before: null, after: { displayName: 'Ed', isActive: true } })
    await run({ ...base, kind: 'delete', action: 'user.delete', loadBefore: async () => user() }, { params: { id: 'u2' } })
    expect(inserted[1]).toMatchObject({ action: 'user.delete', before: { displayName: 'Ed' }, after: null })
  })

  it('writes nothing for a refused or failed request, for a delete or update of nothing, and for a dry run', async () => {
    await run({ ...base, loadBefore: async () => user(), fromResponse: (b: any) => b.user }, { status: 403 })
    await run({ ...base, loadBefore: async () => user() }, { status: 500 })
    await run({ ...base, kind: 'delete', loadBefore: async () => null }, { params: { id: 'gone' } })
    await run({ ...base, loadBefore: async () => null }, { params: { id: 'gone' } })
    await run({ ...base, kind: 'event', skip: (r: any) => !!r.body.dryRun }, { body: { dryRun: true } })
    expect(inserted).toEqual([])
  })

  it('a secret in the request is recorded as "changed", never its value', async () => {
    await run({ kind: 'update', action: 'migration_source.update', targetType: 'migration_source', snapshot: (s: any) => ({ label: s.label }), secrets: ['dbPassword'], loadBefore: async () => ({ id: 's', label: 'A' }), fromResponse: (b: any) => b.source },
      { params: { id: 's' }, body: { dbPassword: 'hunter2-live' }, answer: { source: { id: 's', label: 'A' } } })
    expect(inserted[0].after).toEqual({ dbPassword: 'changed' })
    expect(JSON.stringify(inserted)).not.toContain('hunter2-live')
  })

  it('an event is described by the spec, not by the whole body', async () => {
    await run({ kind: 'event', action: 'website.publish', targetType: 'website', describe: (r: any, b: any) => ({ jobId: b.id, framework: r.body.options.framework }) },
      { body: { siteApiKey: 'wbs_secret_key', options: { framework: 'next' } }, answer: { id: 'job1' } })
    expect(inserted[0].after).toEqual({ jobId: 'job1', framework: 'next' })
    expect(JSON.stringify(inserted)).not.toContain('wbs_secret_key')
  })

  it('a failure to read the state or to write the row never breaks the request, and is logged', async () => {
    let handled = false
    await run({ ...base, kind: 'create', fromResponse: (b: any) => b.user, loadBefore: async () => { throw new Error('read failed') } }, { answer: { user: user() }, handler: () => { handled = true } })
    expect(handled).toBe(true)
    expect(errors.some((e) => /state before/.test(e.m))).toBe(true)
    failInsert = true
    await run({ ...base, kind: 'create', fromResponse: (b: any) => b.user }, { answer: { user: user() } })
    expect(errors.some((e) => /could not be written/.test(e.m))).toBe(true)
  })

  it('no signed-in user = the system actor', async () => {
    await run({ ...base, kind: 'create', fromResponse: (b: any) => b.user }, { user: null, answer: { user: user() } })
    expect(inserted[0].actor).toEqual({ type: 'system' })
  })
})

describe('the specs', () => {
  it('every action is unique and named area.verb', () => {
    const specs = Object.entries(AUDIT)
    const seen = new Map<string, string>()
    for (const [name, s] of specs) {
      expect(s.action, name).toMatch(/^[a-z_]+\.[a-z_]+$/)
      expect(['create', 'update', 'delete', 'event'], name).toContain(s.kind)
      // the six simple settings share the action "setting.update" and are told apart by the target (the setting's key)
      if (s.action !== 'setting.update') { expect(seen.get(s.action), `${name} repeats ${seen.get(s.action)}`).toBeUndefined(); seen.set(s.action, name) }
    }
  })

  const site = (settings: Record<string, unknown>) => ({
    id: 'w1', name: 'Site', rootPath: '/site', domains: ['a.example'], defaultLocale: 'en', supportedLocales: ['en'], settings, themeId: null, pwaEnabled: false,
    pwaConfig: { vapidPrivateKey: 'PRIVATE-VAPID' }, gatewayApiKeyPrefix: 'wbs_abc1', createdAt: new Date(), updatedAt: new Date(),
  }) as any

  it('a website snapshot shows plain settings, fingerprints the rest, and never the key prefix or the push configuration', () => {
    const snap = websiteSnapshot(site({ autosave: { enabled: true, interval: 30 }, themes: [{ name: 'T', styles: 'body{}' }], pushApiKey: 'SECRET-PUSH' }))
    expect(snap['settings.autosave']).toEqual({ enabled: true, interval: 30 })
    expect(snap['settings.themes']).toMatch(/^sha:[0-9a-f]{12}$/)
    expect(snap['settings.pushApiKey']).toMatch(/^sha:/)
    expect(snap.hasGatewayApiKey).toBe(true)
    expect(JSON.stringify(snap)).not.toMatch(/SECRET-PUSH|PRIVATE-VAPID|wbs_abc1/)
  })

  it('a changed theme shows as a changed fingerprint, an unchanged one does not', () => {
    const a = websiteSnapshot(site({ themes: [{ name: 'T' }] }))
    const b = websiteSnapshot(site({ themes: [{ name: 'T' }] }))
    const c = websiteSnapshot(site({ themes: [{ name: 'T2' }] }))
    expect(a['settings.themes']).toBe(b['settings.themes'])
    expect(a['settings.themes']).not.toBe(c['settings.themes'])
  })
})
