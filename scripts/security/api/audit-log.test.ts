// Audit log of administrative actions (docs/plans/system/audit-log-plan.md): who changed what, with before and after, never a secret;
// readable only with audit:read; no way to write or delete through the API. The route table itself is checked by route-drift.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { Client, clientFor } from '../lib/client'
import { ADMIN_EMAIL } from '../lib/config'

const tag = randomBytes(3).toString('hex')
const cleanup: (() => Promise<unknown>)[] = []
let admin: Client
let usersAdmin: Client
let writer: Client
let anon: Client

// every secret the tests send; none of them may appear anywhere in the log
const USER_PW = `AuditUserPw-${tag}-A1!`
const SMTP_PW = `AuditSmtpPw-${tag}`
const FIGMA_TOKEN = `figd_audit_${tag}_token`
const SOURCE_PW = `AuditSourcePw-${tag}`

const entries = async (q: Record<string, string> = {}) => {
  const r = await admin.get(`/audit-log?${new URLSearchParams({ limit: '500', ...q })}`)
  expect(r.status, r.text.slice(0, 200)).toBe(200)
  return r.json.entries as any[]
}
const forTarget = (targetId: string, action?: string) => entries({ targetId, ...(action ? { action } : {}) })

beforeAll(async () => {
  admin = await clientFor('admin')
  usersAdmin = await clientFor('users')
  writer = await clientFor('write')
  anon = new Client()
})
afterAll(async () => { for (const f of cleanup.reverse()) await f().catch(() => undefined) })

describe('users and roles', () => {
  let roleId = ''
  let userId = ''
  const roleName = `audrole-${tag}`
  const userEmail = `aud-${tag}@sectest.local`

  it('role create / update / delete each write a row with the actor, the target and the two sides', async () => {
    const c = await admin.post('/auth/roles', { name: roleName, description: 'audit test', permissionKeys: ['objects:read'] })
    expect(c.status, c.text.slice(0, 160)).toBe(201)
    roleId = c.json.role.id
    cleanup.push(() => admin.delete(`/auth/roles/${roleId}`))
    const u = await admin.patch(`/auth/roles/${roleId}`, { permissionKeys: ['objects:read', 'objects:write'] })
    expect(u.status).toBe(200)

    const rows = await forTarget(roleId)
    const create = rows.find((r) => r.action === 'role.create')
    const update = rows.find((r) => r.action === 'role.update')
    expect(create).toMatchObject({ targetType: 'role', targetLabel: roleName, actorType: 'user', actorLabel: ADMIN_EMAIL, before: null })
    expect(create.after).toMatchObject({ name: roleName, permissionKeys: ['objects:read'] })
    expect(update.before).toEqual({ permissionKeys: ['objects:read'] })
    expect(update.after.permissionKeys).toEqual(['objects:read', 'objects:write'])
    expect(create.actorId, 'the actor is the session user').toBeTruthy()
    expect(create.ip, 'the address is recorded').toBeTruthy()
    expect(new Date(create.at).getTime()).toBeGreaterThan(Date.now() - 120_000)
  })

  it('user create / update / reset password / delete write rows, and the password is nowhere', async () => {
    const c = await admin.post('/auth/users', { email: userEmail, password: USER_PW, displayName: 'Audit One', roleIds: [roleId] })
    expect(c.status, c.text.slice(0, 160)).toBe(201)
    userId = c.json.user.id
    expect((await admin.patch(`/auth/users/${userId}`, { displayName: 'Audit Two', isActive: false })).status).toBe(200)
    expect((await admin.post(`/auth/users/${userId}/reset-password`, {})).status).toBe(200)
    expect((await admin.delete(`/auth/users/${userId}`)).status).toBe(200)

    const rows = await forTarget(userId)
    expect(rows.map((r) => r.action).sort()).toEqual(['user.create', 'user.delete', 'user.reset_password', 'user.update'])
    const update = rows.find((r) => r.action === 'user.update')
    expect(update.before).toEqual({ displayName: 'Audit One', isActive: true })
    expect(update.after).toEqual({ displayName: 'Audit Two', isActive: false })
    expect(rows.find((r) => r.action === 'user.delete').before).toMatchObject({ email: userEmail, roleNames: [roleName] })
    expect(rows.find((r) => r.action === 'user.reset_password')).toMatchObject({ targetLabel: userEmail, before: null, after: null })
    expect(JSON.stringify(rows)).not.toContain(USER_PW)
  })

  it('a role that still has users is not deleted, and the refusal writes no row', async () => {
    const u = await admin.post('/auth/users', { email: `aud2-${tag}@sectest.local`, password: USER_PW, displayName: 'Held', roleIds: [roleId] })
    expect(u.status).toBe(201)
    cleanup.push(() => admin.delete(`/auth/users/${u.json.user.id}`))
    expect((await admin.delete(`/auth/roles/${roleId}`)).status).toBe(409)
    expect((await forTarget(roleId, 'role.delete'))).toHaveLength(0)
  })

  it('a request that is refused, or fails, leaves no row', async () => {
    const before = (await entries({ action: 'role.create' })).length
    expect((await writer.post('/auth/roles', { name: `nope-${tag}`, permissionKeys: [] })).status).toBe(403)
    expect((await anon.post('/auth/roles', { name: `nope-${tag}`, permissionKeys: [] })).status).toBe(401)
    expect((await admin.post('/auth/roles', { name: roleName, permissionKeys: [] })).status, 'duplicate name').toBe(409)
    expect((await admin.post('/auth/roles', { permissionKeys: [] })).status, 'no name').toBe(400)
    expect((await entries({ action: 'role.create' })).length).toBe(before)
  })

  it('deleting something that does not exist leaves no row', async () => {
    const ghost = '22222222-2222-4222-8222-222222222222'
    await admin.delete(`/auth/users/${ghost}`)
    expect(await forTarget(ghost)).toHaveLength(0)
  })
})

describe('websites, settings, integrations', () => {
  it('a website: create, rename, theme, delete', async () => {
    const c = await admin.post('/whoobe-one/websites', { name: `Aud Site ${tag}`, rootPath: `/aud${tag}` })
    expect(c.status, c.text.slice(0, 160)).toBe(201)
    const id = c.json.website.id
    cleanup.push(() => admin.delete(`/whoobe-one/websites/${id}`))
    expect((await admin.patch(`/whoobe-one/websites/${id}`, { name: `Aud Renamed ${tag}` })).status).toBe(200)
    expect((await admin.post(`/whoobe-one/websites/${id}/themes`, { name: 'T', colors: {}, fonts: {}, styles: 'body{color:#123}' })).status).toBe(201)
    expect((await admin.delete(`/whoobe-one/websites/${id}`)).status).toBe(200)

    const rows = await forTarget(id)
    expect(rows.map((r) => r.action).sort()).toEqual(['website.create', 'website.delete', 'website.theme_create', 'website.update'])
    expect(rows.find((r) => r.action === 'website.update')).toMatchObject({ before: { name: `Aud Site ${tag}` }, after: { name: `Aud Renamed ${tag}` } })
    const theme = rows.find((r) => r.action === 'website.theme_create')
    expect(Object.keys(theme.after).some((k) => k.startsWith('settings.themes')), 'the change of the themes is visible').toBe(true)
    expect(JSON.stringify(theme), 'the CSS itself is a fingerprint, not text').not.toContain('color:#123')
  })

  it('a setting: before and after, named by its key', async () => {
    const before = await admin.get('/whoobe-one/settings/autosave')
    expect(before.status).toBe(200)
    const put = await admin.put('/whoobe-one/settings/autosave', { enabled: true, interval: 77 })
    expect(put.status, put.text.slice(0, 160)).toBe(200)
    const row = (await entries({ action: 'setting.update', targetId: 'autosave' }))[0]
    expect(row).toMatchObject({ targetType: 'setting', targetLabel: 'autosave', actorLabel: ADMIN_EMAIL })
    expect(row.after.autosave).toMatchObject({ enabled: true, interval: 77 })
    await admin.put('/whoobe-one/settings/autosave', before.json) // put the value back
  })

  it('secrets in mail, Figma and migration-source settings are "changed", never the value', async () => {
    const mail = await admin.put('/mail-settings', { provider: 'smtp', smtp: { host: 'smtp.sectest.local', port: 2525, secure: false, user: 'u', password: SMTP_PW }, fromAddress: 'noreply@sectest.local' })
    expect(mail.status, mail.text.slice(0, 160)).toBe(200)
    const fig = await admin.put('/figma/settings', { accessToken: FIGMA_TOKEN, teamId: `team-${tag}` })
    expect(fig.status).toBe(200)
    const src = await admin.post('/migration-sources', { label: `src-${tag}`, dbHost: 'db.sectest.local', dbUser: 'root', dbPassword: SOURCE_PW, dbName: 'x', classesPath: '/tmp/classes' })
    expect(src.status, src.text.slice(0, 160)).toBe(201)
    const srcId = src.json.source.id
    cleanup.push(() => admin.delete(`/migration-sources/${srcId}`))
    expect((await admin.patch(`/migration-sources/${srcId}`, { label: `src2-${tag}`, dbPassword: `${SOURCE_PW}-new` })).status).toBe(200)

    const mailRow = (await entries({ action: 'setting.mail_update' }))[0]
    expect(mailRow.after['smtp.password']).toBe('changed')
    expect(mailRow.after.smtp?.host ?? mailRow.after.smtp).toBeTruthy() // the non-secret fields are still visible
    const figRow = (await entries({ action: 'setting.figma_update' }))[0]
    expect(figRow.after).toMatchObject({ accessToken: 'changed' })
    const srcUpdate = (await forTarget(srcId, 'migration_source.update'))[0]
    expect(srcUpdate.before).toEqual({ label: `src-${tag}` })
    expect(srcUpdate.after).toEqual({ label: `src2-${tag}`, dbPassword: 'changed' })

    const everything = (await admin.get('/audit-log?limit=5000')).text
    for (const secret of [USER_PW, SMTP_PW, FIGMA_TOKEN, SOURCE_PW, `${SOURCE_PW}-new`]) {
      expect(everything.includes(secret), `a secret appears in the audit log: ${secret.slice(0, 10)}...`).toBe(false)
    }
  })
})

describe('reading the log', () => {
  it('only audit:read reads it: an administrator yes, users:manage alone no, anonymous no', async () => {
    expect((await admin.get('/audit-log')).status).toBe(200)
    expect((await usersAdmin.get('/audit-log')).status, 'users:manage is not audit:read').toBe(403)
    expect((await writer.get('/audit-log')).status).toBe(403)
    expect((await anon.get('/audit-log')).status).toBe(401)
  })

  it('there is no way to write, change or delete a row through the API', async () => {
    for (const [m, p] of [['post', '/audit-log'], ['put', '/audit-log'], ['patch', '/audit-log'], ['delete', '/audit-log'], ['delete', '/audit-log/x'], ['patch', '/audit-log/x']] as const) {
      const r = await (admin as any)[m](p, {})
      expect(r.status, `${m.toUpperCase()} ${p}`).toBe(404)
    }
  })

  it('filters by action prefix, actor, target and time, pages, and refuses a bad date', async () => {
    const roles = await entries({ action: 'role.' })
    expect(roles.length).toBeGreaterThan(0)
    expect(roles.every((r) => r.action.startsWith('role.'))).toBe(true)
    const mine = await entries({ actor: roles[0].actorId })
    expect(mine.every((r) => r.actorId === roles[0].actorId)).toBe(true)
    expect(await entries({ from: new Date(Date.now() + 86_400_000).toISOString() })).toHaveLength(0)
    const page = await admin.get('/audit-log?limit=1&offset=1')
    expect(page.json.entries).toHaveLength(1)
    expect(page.json.total).toBeGreaterThan(1)
    expect((await admin.get('/audit-log?from=not-a-date')).status).toBe(400)
    const times = (await entries()).map((r) => new Date(r.at).getTime())
    expect(times, 'newest first').toEqual([...times].sort((a, b) => b - a))
  })

  it('exports CSV, and a value that starts like a formula is neutralised', async () => {
    const name = `=SUM(1+1)-${tag}`
    const c = await admin.post('/auth/roles', { name, permissionKeys: [] })
    expect(c.status).toBe(201)
    cleanup.push(() => admin.delete(`/auth/roles/${c.json.role.id}`))
    const csv = await admin.get('/audit-log?format=csv&action=role.create')
    expect(csv.status).toBe(200)
    expect(csv.headers.get('content-type')).toMatch(/text\/csv/)
    expect(csv.headers.get('content-disposition')).toMatch(/attachment/)
    expect(csv.text.split('\r\n')[0]).toBe('at,actor_type,actor_id,actor_label,ip,action,target_type,target_id,target_label,before,after,request_id')
    expect(csv.text).toContain(`"'=SUM(1+1)-${tag}"`)
    expect(csv.text).not.toMatch(/(^|,)"=SUM/m)
  })

  it('the service says whether it has lost audit rows', async () => {
    const h = await anon.get('/health')
    expect(h.json.audit).toBe('ok')
  })
})
