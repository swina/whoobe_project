// Readiness and metrics (docs/plans/system/release-0.2-plan.md, A2): /health answers 503 while the database is down, /health/live does
// not care, and /metrics is off without a token, shows request counts and queue depth with one.
import { execFileSync } from 'node:child_process'
import { describe, it, expect, afterAll } from 'vitest'
import { Client, clientFor } from '../lib/client'
import { METRICS_TOKEN } from '../lib/config'

const POSTGRES = process.env.SEC_POSTGRES_CONTAINER ?? 'whoobe-sectest-postgres-1'
const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8' })
const bearer = (t: string) => ({ authorization: `Bearer ${t}` })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitFor(check: () => Promise<boolean>, what: string, ms = 60_000) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (await check()) return; await sleep(1000) }
  throw new Error(`timed out waiting for ${what}`)
}

afterAll(() => { try { docker('start', POSTGRES) } catch { /* already running */ } })

describe('/metrics', () => {
  it('is configured for this run', () => { expect(METRICS_TOKEN.length).toBeGreaterThan(10) })

  it('needs the bearer token, and refuses a wrong or missing one', async () => {
    const anon = new Client()
    const none = await anon.get('/metrics')
    expect(none.status).toBe(401)
    expect(none.headers.get('www-authenticate')).toBe('Bearer')
    expect((await anon.get('/metrics', bearer('wrong'))).status).toBe(401)
    expect((await anon.get('/metrics', { authorization: METRICS_TOKEN })).status).toBe(401)
    // a session is not a token: the administrator's cookie does not open it
    expect((await (await clientFor('admin')).get('/metrics')).status).toBe(401)
  })

  it('shows request counts by matched route, queue depth, build and database state', async () => {
    const admin = await clientFor('admin')
    await admin.get('/auth/me')
    await new Client().get('/this-route-does-not-exist-123')
    const r = await new Client().get('/metrics', bearer(METRICS_TOKEN))
    expect(r.status, r.text.slice(0, 120)).toBe(200)
    expect(r.headers.get('content-type')).toMatch(/^text\/plain/)
    expect(r.text).toMatch(/whoobe_http_requests_total\{method="GET",route="\/auth\/me",status="2xx"\} \d+/)
    expect(r.text).toMatch(/whoobe_http_requests_total\{method="GET",route="unmatched",status="4xx"\} \d+/)
    expect(r.text).toContain('whoobe_http_request_duration_seconds_count{route="/auth/me"}')
    expect(r.text).toMatch(/whoobe_build_info\{service="core-api",version="[^"]+"\} 1/)
    expect(r.text).toContain('whoobe_database_up 1')
    expect(r.text).toContain('# TYPE whoobe_publish_jobs gauge')
    expect(r.text).toContain('# TYPE whoobe_object_event_deliveries gauge')
    // no URL, no id, no e-mail becomes a label
    expect(r.text).not.toContain('this-route-does-not-exist')
    expect(r.text).not.toMatch(/route="[^"]*[0-9a-f]{8}-[0-9a-f]{4}-/)
  })
})

describe('/health and /health/live while the database is down', () => {
  it('answers ok with the database up', async () => {
    const r = await new Client().get('/health')
    expect(r.status).toBe(200)
    expect(r.json).toMatchObject({ status: 'ok', database: 'ok', service: 'core-api' })
    const live = await new Client().get('/health/live')
    expect(live.status).toBe(200)
    expect(live.json.database).toBeUndefined()
  })

  it('answers 503 on /health, keeps /health/live up, shows database_up 0, and recovers', async () => {
    docker('stop', POSTGRES)
    try {
      const anon = new Client()
      await waitFor(async () => (await anon.get('/health')).status === 503, 'a 503 from /health')
      const down = await anon.get('/health')
      expect(down.json).toMatchObject({ status: 'unavailable', database: 'down' })
      // the process did not die: the cheap probe still answers
      expect((await anon.get('/health/live')).status).toBe(200)
      const m = await anon.get('/metrics', bearer(METRICS_TOKEN))
      expect(m.status).toBe(200)
      expect(m.text).toContain('whoobe_database_up 0')
    } finally {
      docker('start', POSTGRES)
    }
    await waitFor(async () => (await new Client().get('/health')).status === 200, '/health to recover', 90_000)
    expect((await new Client().get('/health')).json.database).toBe('ok')
  })
})
