// The publish runner (apps/publisher) and the job rules of core-api: what may reach the generator, where releases go, what the log hides.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readlinkSync, existsSync, rmSync, readdirSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mask, generatorArgs, runJob, type ClaimedJob, type Core } from '../../../apps/publisher/src/run'
import { releaseDirFor, switchCurrent, pruneReleases } from '../../../apps/publisher/src/release'
import { parsePublishJobOptions, parseSiteKey, requireRunner } from '../../../apps/core-api/src/publish-jobs'

const WEBSITE = '11111111-2222-4333-8444-555555555555'
const JOB = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'whoobe-pub-')) })
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

describe('parsePublishJobOptions', () => {
  const ok = { apiUrl: 'http://localhost:3003', framework: 'vue', slug: 'my-site', revalidate: 60 }
  it('accepts what the dashboard sends and drops empty strings', () => {
    expect(parsePublishJobOptions(WEBSITE, { ...ok, domain: '', basePath: '/blog' })).toMatchObject({ framework: 'vue', slug: 'my-site', basePath: '/blog', domain: undefined })
  })
  it('refuses a slug that could leave the publish root', () => {
    for (const slug of ['../x', 'a/b', 'A', '', '-x', 'x'.repeat(41)]) expect(() => parsePublishJobOptions(WEBSITE, { ...ok, slug })).toThrow()
  })
  it('refuses options the generator would refuse (quotes in a URL, a bad domain, a negative revalidate)', () => {
    expect(() => parsePublishJobOptions(WEBSITE, { ...ok, apiUrl: 'http://x"; rm -rf /' })).toThrow()
    expect(() => parsePublishJobOptions(WEBSITE, { ...ok, domain: 'a b;c' })).toThrow()
    expect(() => parsePublishJobOptions(WEBSITE, { ...ok, revalidate: -1 })).toThrow()
    expect(() => parsePublishJobOptions(WEBSITE, { ...ok, framework: 'svelte' })).toThrow()
  })
  it('never stores a site key among the options; it travels separately and is checked', () => {
    expect(JSON.stringify(parsePublishJobOptions(WEBSITE, { ...ok, siteApiKey: 'SECRETSECRET123' }))).not.toContain('SECRETSECRET123')
    expect(parseSiteKey(WEBSITE, 'abcdefgh12345678')).toBe('abcdefgh12345678')
    expect(parseSiteKey(WEBSITE, '')).toBeNull()
    expect(() => parseSiteKey(WEBSITE, 'bad key; rm')).toThrow()
  })
})

describe('requireRunner', () => {
  const call = (token: string, header?: string) => {
    let status = 0; let nextCalled = false
    const res = { status(c: number) { status = c; return this }, json() { return this } }
    requireRunner(token)({ headers: { authorization: header } } as never, res as never, () => { nextCalled = true })
    return { status, nextCalled }
  }
  it('is closed when no token is configured', () => { expect(call('', 'Bearer x').status).toBe(503) })
  it('refuses a missing or wrong token, accepts the right one', () => {
    expect(call('secret-token').status).toBe(401)
    expect(call('secret-token', 'Bearer wrong-token').status).toBe(401)
    expect(call('secret-token', 'Bearer secret-token').nextCalled).toBe(true)
  })
})

describe('mask', () => {
  it('hides configured secrets and key=value tokens', () => {
    expect(mask('using abcdefgh1234 now', ['abcdefgh1234'])).toBe('using *** now')
    expect(mask('SITE_API_KEY=abcdef123456', [])).toContain('***')
    expect(mask('password: "hunter2hunter2"', [])).not.toContain('hunter2')
  })
})

describe('generatorArgs', () => {
  it('is an argument array: values with shell characters stay one argument each', () => {
    const job: ClaimedJob = { id: JOB, websiteId: WEBSITE, releasePath: 's/releases/x', options: { apiUrl: 'http://a', framework: 'next', slug: 's', revalidate: 5, domain: 'x.example.com; rm -rf /' } }
    const a = generatorArgs(job, '/out')
    expect(a[a.indexOf('--domain') + 1]).toBe('x.example.com; rm -rf /')
    expect(a).not.toContain('--site-api-key')
  })
})

describe('releases', () => {
  it('refuses a release path outside the root', () => {
    expect(() => releaseDirFor(root, '../evil', JOB)).toThrow()
    expect(() => releaseDirFor(root, 'ok', '../../x')).toThrow()
    expect(releaseDirFor(root, 'ok', JOB)).toBe(join(root, 'ok', 'releases', JOB))
  })
  it('switches current atomically and keeps the newest releases', async () => {
    const mk = (id: string, t: number) => { const d = releaseDirFor(root, 'ok', id); mkdirSync(d, { recursive: true }); utimesSync(d, t, t); return d }
    const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004']
    ids.forEach((id, i) => mk(id, 1000 + i))
    await switchCurrent(releaseDirFor(root, 'ok', ids[3]))
    expect(readlinkSync(join(root, 'ok', 'current'))).toBe(join('releases', ids[3]))
    await switchCurrent(releaseDirFor(root, 'ok', ids[2]))
    expect(readlinkSync(join(root, 'ok', 'current'))).toBe(join('releases', ids[2]))
    await pruneReleases(join(root, 'ok'), releaseDirFor(root, 'ok', ids[3]), 2)
    expect(readdirSync(join(root, 'ok', 'releases')).sort()).toEqual([ids[2], ids[3]])
  })
})

describe('runJob', () => {
  const fake = (script: string): string => { const f = join(root, 'gen.mjs'); writeFileSync(f, script); return f }
  const core = () => { const out: { log: string; finish?: unknown } = { log: '' }; const c: Core = { async log(_id, t) { out.log += t; return { cancelRequested: false } }, async finish(_id, b) { out.finish = b } }; return { c, out } }
  const job: ClaimedJob = { id: JOB, websiteId: WEBSITE, releasePath: `s/releases/${JOB}`, options: { apiUrl: 'http://a', framework: 'vue', slug: 's', revalidate: 1 } }

  it('success: log masked, current switched', async () => {
    const bin = fake(`import {writeFileSync} from 'node:fs'; const i=process.argv.indexOf('--out-dir'); writeFileSync(process.argv[i+1]+'/index.txt','x'); console.log('hello tokenvalue123')`)
    const { c, out } = core()
    await runJob(job, c, { root, timeoutMs: 20000, secrets: ['tokenvalue123'], bin })
    expect(out.finish).toMatchObject({ status: 'succeeded' })
    expect(out.log).toContain('hello ***')
    expect(existsSync(join(root, 's', 'current', 'index.txt'))).toBe(true)
  })
  it('the site key reaches the generator through the environment only, and never the log', async () => {
    const bin = fake(`console.log('argv:', process.argv.join(' ')); console.log('key:', process.env.WHOOBE_SITE_API_KEY)`)
    const { c, out } = core()
    await runJob({ ...job, siteKey: 'sitekey-abcdef123456' }, c, { root, timeoutMs: 20000, secrets: [], bin })
    expect(out.log).not.toContain('sitekey-abcdef123456')
    expect(out.log).toContain('key: ***')
  })
  it('failure: the live release is untouched and the half-written one is removed', async () => {
    const live = releaseDirFor(root, 's', '00000000-0000-4000-8000-000000000009'); mkdirSync(live, { recursive: true }); await switchCurrent(live)
    const bin = fake(`console.error('boom'); process.exit(3)`)
    const { c, out } = core()
    await runJob(job, c, { root, timeoutMs: 20000, secrets: [], bin })
    expect(out.finish).toMatchObject({ status: 'failed', error: 'boom' })
    expect(readlinkSync(join(root, 's', 'current'))).toBe(join('releases', '00000000-0000-4000-8000-000000000009'))
    expect(existsSync(releaseDirFor(root, 's', JOB))).toBe(false)
  })
  it('time-out stops the generator', async () => {
    const bin = fake(`setInterval(()=>{},1000)`)
    const { c, out } = core()
    await runJob(job, c, { root, timeoutMs: 500, secrets: [], bin })
    expect(out.finish).toMatchObject({ status: 'failed' })
  })
})
