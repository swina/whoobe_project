// Workspace isolation: two stacks standing for two workspaces of one host must share nothing - no session, no
// credential, no data, no object, no network path, no secret. Run with `pnpm security:isolation`
// (scripts/security/isolation/run.sh brings both stacks up). Assumption under test: workspaces are separate
// Compose projects (docs/plans/system/workspaces-plan.md), reached on different ports/hosts of the same machine.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { S3Client, ListObjectsV2Command, GetObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3'
import { Client } from '../lib/client'
import { png } from '../lib/png'
import { A as stackA, B as stackB, type Stack } from './stacks'

const tag = randomBytes(3).toString('hex')
let a: Stack, b: Stack
let adminA: Client, adminB: Client
const assetsA: string[] = []

// Wrong-password attempts are throttled per client address (TRUST_PROXY=1 on the test stacks): play a fresh address
// each time so repeated runs never meet the lockout and every refusal is a plain 401.
const freshIp = () => ({ 'x-forwarded-for': `203.0.113.${1 + Math.floor(Math.random() * 250)}` })
const tryLogin = (base: string, email: string, password: string) => new Client(base).post('/auth/login', { email, password }, freshIp())

const docker = (...args: string[]) => spawnSync('docker', args, { encoding: 'utf8' })
const container = (s: Stack, service: string) => `${s.project}-${service}-1`

async function upload(c: Client, base: string, path: string, isPublic: string | null = null) {
  const fields: Record<string, string> = isPublic === null ? { pimcorePath: path } : { pimcorePath: path, isPublic }
  return c.forBase(base).upload('/api/v1/dam/upload', fields, { file: { name: path.split('/').pop()!, type: 'image/png', data: png(8, 8) } })
}

beforeAll(async () => {
  a = stackA(); b = stackB()
  for (const s of [a, b]) {
    const h = await fetch(`${s.core}/health`).catch(() => null)
    if (!h?.ok) throw new Error(`stack ${s.name} (${s.core}) is not up - run scripts/security/isolation/run.sh`)
  }
  adminA = await a.admin(); adminB = await b.admin()
})

afterAll(async () => {
  for (const p of assetsA) await adminA?.forBase(a.asset).post('/api/v1/dam/delete', { pimcorePath: p }).catch(() => undefined)
})

describe('two stacks that share nothing by construction', () => {
  it('are really two stacks: different projects, ports, databases, buckets and containers', () => {
    expect(a.project).not.toBe(b.project)
    for (const k of ['WS_CORE_API_PORT', 'WS_ASSET_PROCESSOR_PORT', 'WS_GATEWAY_PORT', 'WS_POSTGRES_PORT', 'WS_S3_API_PORT', 'DB_NAME', 'S3_BUCKET']) {
      expect(a.env[k], k).not.toBe(b.env[k])
    }
    expect(docker('inspect', '-f', '{{.Id}}', container(a, 'postgres')).stdout).not.toBe(docker('inspect', '-f', '{{.Id}}', container(b, 'postgres')).stdout)
  })

  it('every secret and credential differs between the workspaces', () => {
    const secrets = ['POSTGRES_PASSWORD', 'DB_PASSWORD', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'DAM_SERVICE_TOKEN', 'SITE_API_KEY_PEPPER',
      'GATEWAY_AUTH_ENCRYPTION_KEY', 'MIGRATION_SOURCE_ENCRYPTION_KEY', 'TOTP_ENCRYPTION_KEY', 'SEED_ADMIN_PASSWORD', 'SEED_ADMIN_EMAIL']
    for (const k of secrets) {
      expect(a.env[k], `${k} missing in A`).toBeTruthy()
      expect(b.env[k], `${k} missing in B`).toBeTruthy()
      // compared as a boolean so that a failure never prints the values
      expect(a.env[k] === b.env[k], `${k} is the same in both workspaces`).toBe(false)
    }
  })

  it('their Docker networks are separate and a service name resolves to its own workspace only', () => {
    const lookup = (s: Stack, name: string) => docker('exec', container(s, 'core-api'), 'node', '-e',
      `require('dns').lookup(${JSON.stringify(name)},(e,ip)=>{console.log(e?'ENOTFOUND':ip)})`).stdout.trim()
    const ip = (s: Stack, svc: string) => docker('inspect', '-f', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', container(s, svc)).stdout.trim()
    expect(lookup(a, 'postgres')).toBe(ip(a, 'postgres'))
    expect(lookup(b, 'postgres')).toBe(ip(b, 'postgres'))
    expect(ip(a, 'postgres')).not.toBe(ip(b, 'postgres'))
    // the other workspace's containers are not reachable by name from inside this one
    for (const svc of ['postgres', 'garage', 'core-api']) {
      expect(lookup(a, container(b, svc)), `A resolves B's ${svc}`).toBe('ENOTFOUND')
      expect(lookup(b, container(a, svc)), `B resolves A's ${svc}`).toBe('ENOTFOUND')
    }
  })
})

describe('sessions and accounts', () => {
  it("a session of workspace A is not accepted by workspace B (same host: the browser sends the cookie to both)", async () => {
    expect((await adminA.get('/auth/me')).status).toBe(200)
    const replay = adminA.forBase(b.core)
    expect(replay.cookieHeader).toContain('wcms_session=')
    expect((await replay.get('/auth/me')).status).toBe(401)
    expect((await replay.get('/auth/users')).status).toBe(401)
    expect((await adminA.forBase(b.asset).upload('/api/v1/process?width=4', {}, { file: { name: 't.png', type: 'image/png', data: png(8, 8) } })).status).toBe(401)
  })

  it("an administrator's credentials only work in their own workspace", async () => {
    const wrong = [
      [a.env.SEED_ADMIN_EMAIL, a.env.SEED_ADMIN_PASSWORD, b],
      [b.env.SEED_ADMIN_EMAIL, b.env.SEED_ADMIN_PASSWORD, a],
      [b.env.SEED_ADMIN_EMAIL, a.env.SEED_ADMIN_PASSWORD, b],
    ] as const
    for (const [email, password, target] of wrong) {
      const r = await tryLogin(target.core, email, password)
      expect(r.status, `${email} on ${target.name}`).toBe(401)
    }
  })

  it('a user created in A does not exist in B, and the same e-mail in both has independent passwords', async () => {
    const email = `iso-${tag}@sectest.local`
    const pwA = `A-${tag}-Aa1!x`, pwB = `B-${tag}-Bb2!y`
    const roleOf = async (c: Client) => (await c.post('/auth/roles', { name: `iso-user-role-${tag}`, description: 'isolation', permissionKeys: [] })).json.role.id as string
    const roleA = await roleOf(adminA), roleB = await roleOf(adminB)
    const mk = async (c: Client, pw: string, roleId: string) => c.post('/auth/users', { email, password: pw, displayName: 'iso', roleIds: [roleId] })
    expect((await mk(adminA, pwA, roleA)).status).toBe(201)
    expect((await tryLogin(b.core, email, pwA)).status).toBe(401)
    expect(((await adminB.get('/auth/users')).json?.users ?? []).some((u: any) => u.email === email)).toBe(false)
    expect((await mk(adminB, pwB, roleB)).status).toBe(201)
    expect((await tryLogin(a.core, email, pwB)).status).toBe(401)
    expect((await tryLogin(a.core, email, pwA)).status).toBe(200)
    expect((await tryLogin(b.core, email, pwB)).status).toBe(200)
    // deleting the account in A leaves B's account (same e-mail) alone
    const ua = (await adminA.get('/auth/users')).json.users.find((u: any) => u.email === email)
    await adminA.delete(`/auth/users/${ua.id}`)
    expect((await tryLogin(b.core, email, pwB)).status).toBe(200)
    const ub = (await adminB.get('/auth/users')).json.users.find((u: any) => u.email === email)
    await adminB.delete(`/auth/users/${ub.id}`)
    await adminA.delete(`/auth/roles/${roleA}`); await adminB.delete(`/auth/roles/${roleB}`)
  })

  it("a role created in A is invisible in B", async () => {
    const name = `iso-role-${tag}`
    const r = await adminA.post('/auth/roles', { name, description: 'isolation', permissionKeys: [] })
    expect(r.status).toBe(201)
    expect(((await adminB.get('/auth/roles')).json?.roles ?? []).some((x: any) => x.name === name)).toBe(false)
    await adminA.delete(`/auth/roles/${r.json.role.id}`)
  })
})

describe('objects and the object store', () => {
  it("an asset uploaded to A is not served by B, with or without a session, public or private", async () => {
    const pub = `/public/iso-${tag}/pub.png`, priv = `/iso-${tag}-priv.png`
    const up1 = await upload(adminA, a.asset, pub); const up2 = await upload(adminA, a.asset, priv)
    expect(up1.status, up1.text.slice(0, 120)).toBe(200); expect(up2.status).toBe(200)
    assetsA.push(pub, priv)
    const anonA = new Client(a.asset), anonB = new Client(b.asset)
    expect((await anonA.get(`/dam-asset/${up1.json.s3Key}`)).status).toBe(200)
    expect((await anonB.get(`/dam-asset/${up1.json.s3Key}`)).status).toBe(404)
    expect((await adminB.forBase(b.asset).get(`/dam-asset/${up1.json.s3Key}`)).status).toBe(404)
    expect((await adminB.forBase(b.asset).get(`/dam-asset/${up2.json.s3Key}`)).status).toBe(404)
    // A's session replayed on B's asset-processor reads nothing either
    expect((await adminA.forBase(b.asset).get(`/dam-asset/${up2.json.s3Key}`)).status).toBe(404)
  })

  it("B's asset list does not contain A's assets", async () => {
    const r = await adminB.forBase(b.asset).get('/api/v1/dam/assets')
    if (r.status === 200) expect(r.text).not.toContain(`iso-${tag}`)
    else expect(r.status).toBeLessThan(500)
  })

  it("the DAM service token of one workspace opens nothing in the other (even for an object that exists in both)", async () => {
    const path = `/private/iso-${tag}/svc.txt`
    const put = (c: Client, base: string, text: string) => c.forBase(base).upload('/api/v1/dam/upload', { pimcorePath: path, isPublic: 'false' }, { file: { name: 'svc.txt', type: 'text/plain', data: text } })
    const upA = await put(adminA, a.asset, 'secret of A'), upB = await put(adminB, b.asset, 'secret of B')
    expect(upA.status, upA.text.slice(0, 100)).toBe(200); expect(upB.status).toBe(200)
    assetsA.push(path)
    const read = (base: string, key: string, token: string) => new Client(base).get(`/dam-asset/${key}`, { authorization: `Bearer ${token}` })
    // controls: each token reads its own workspace's private object
    expect((await read(a.asset, upA.json.s3Key, a.env.DAM_SERVICE_TOKEN)).text).toBe('secret of A')
    expect((await read(b.asset, upB.json.s3Key, b.env.DAM_SERVICE_TOKEN)).text).toBe('secret of B')
    // the object exists on both sides, the token of the other side must still be refused
    expect((await read(b.asset, upB.json.s3Key, a.env.DAM_SERVICE_TOKEN)).status).toBe(404)
    expect((await read(a.asset, upA.json.s3Key, b.env.DAM_SERVICE_TOKEN)).status).toBe(404)
    await adminB.forBase(b.asset).post('/api/v1/dam/delete', { pimcorePath: path }).catch(() => undefined)
  })

  it("one workspace's S3 credentials do not open the other's store (direct S3 access)", async () => {
    const client = (s: Stack, creds: Stack) => new S3Client({
      region: 'us-east-1', endpoint: `http://localhost:${s.env.WS_S3_API_PORT}`, forcePathStyle: true,
      credentials: { accessKeyId: creds.env.S3_ACCESS_KEY_ID, secretAccessKey: creds.env.S3_SECRET_ACCESS_KEY },
      maxAttempts: 1,
    })
    // controls: each key works on its own store
    await expect(client(a, a).send(new HeadBucketCommand({ Bucket: a.env.S3_BUCKET }))).resolves.toBeDefined()
    await expect(client(b, b).send(new HeadBucketCommand({ Bucket: b.env.S3_BUCKET }))).resolves.toBeDefined()
    // crossing over: refused, whichever bucket name is asked for
    for (const [store, creds] of [[a, b], [b, a]] as const) {
      for (const bucket of [store.env.S3_BUCKET, creds.env.S3_BUCKET]) {
        await expect(client(store, creds).send(new ListObjectsV2Command({ Bucket: bucket })), `${creds.name}'s key on ${store.name}'s store, bucket ${bucket}`).rejects.toThrow()
      }
    }
    // and the object itself is not there for the other workspace's key
    await expect(client(b, b).send(new GetObjectCommand({ Bucket: b.env.S3_BUCKET, Key: `public/iso-${tag}/pub.png` }))).rejects.toThrow()
  })
})

describe('databases', () => {
  const psql = (s: Stack, password: string, db: string) => docker('exec', '-e', `PGPASSWORD=${password}`, container(s, 'postgres'),
    'psql', '-h', 'postgres', '-U', s.env.DB_USER, '-d', db, '-At', '-c', 'select 1')

  it("a workspace's database password does not open the other workspace's database", () => {
    expect(psql(a, a.env.DB_PASSWORD, a.env.DB_NAME).stdout.trim(), 'control: A on A').toBe('1')
    expect(psql(b, b.env.DB_PASSWORD, b.env.DB_NAME).stdout.trim(), 'control: B on B').toBe('1')
    const r = psql(a, b.env.DB_PASSWORD, a.env.DB_NAME)
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/password authentication failed/i)
    const r2 = psql(b, a.env.DB_PASSWORD, b.env.DB_NAME)
    expect(r2.status).not.toBe(0)
    expect(r2.stderr).toMatch(/password authentication failed/i)
  })

  it("each database only holds its own users", () => {
    const users = (s: Stack) => docker('exec', '-e', `PGPASSWORD=${s.env.DB_PASSWORD}`, container(s, 'postgres'), 'psql', '-h', 'postgres', '-U', s.env.DB_USER, '-d', s.env.DB_NAME, '-At', '-c', 'select email from users order by 1').stdout
    expect(users(a)).toContain(a.env.SEED_ADMIN_EMAIL)
    expect(users(a)).not.toContain(b.env.SEED_ADMIN_EMAIL)
    expect(users(b)).toContain(b.env.SEED_ADMIN_EMAIL)
    expect(users(b)).not.toContain(a.env.SEED_ADMIN_EMAIL)
  })
})

describe('gateway', () => {
  it("each gateway answers from its own workspace (health and public surface do not leak the other's data)", async () => {
    const [ha, hb] = await Promise.all([new Client(a.gateway).get('/health'), new Client(b.gateway).get('/health')])
    expect(ha.status).toBe(200); expect(hb.status).toBe(200)
    // a site key minted in one workspace is hashed with that workspace's pepper: it must not verify in the other
    expect(a.env.SITE_API_KEY_PEPPER).not.toBe(b.env.SITE_API_KEY_PEPPER)
    const fake = 'wk_' + randomBytes(16).toString('hex')
    expect([401, 403, 404]).toContain((await new Client(b.gateway).get('/api/anything', { 'x-api-key': fake })).status)
  })
})
