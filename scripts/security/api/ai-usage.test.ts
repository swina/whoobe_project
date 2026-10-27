// Token usage of the AI functions per user (docs/plans/ai/ai-usage-plan.md): every AI answer carries `usage` for the person who asked;
// a row per request is stored only while the tracking is on, with counts and never the prompt; the report of every user needs
// ai_usage:read, opening one person's requests is audited, each user reads their own rows, and the rows age out (the monthly totals stay).
// A fake OpenAI-compatible provider on the host answers the AI calls with the tokens it "used".
import { execFileSync } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { randomBytes } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client, clientFor } from '../lib/client'
import { createTempUser, loginAs } from '../lib/tempuser'
import { hostForContainers } from '../lib/mock-oidc'

const tag = randomBytes(3).toString('hex')
const PROMPT = `usage-prompt-${tag}`
const POSTGRES = process.env.SEC_POSTGRES_CONTAINER ?? 'whoobe-sectest-postgres-1'
const DB_USER = process.env.SEC_DB_USER ?? 'sectest'
const DB_NAME = process.env.SEC_DB_NAME ?? 'whoobe_sec_test'
const psql = (sql: string) => execFileSync('docker', ['exec', POSTGRES, 'psql', '-U', DB_USER, '-d', DB_NAME, '-tAc', sql], { encoding: 'utf8' }).trim()

let admin: Client
let adminId = ''
let server: Server
let endpoint = ''
const cleanup: (() => Promise<unknown>)[] = []

const rowsOf = (userId: string) => Number(psql(`SELECT count(*) FROM ai_usage WHERE user_id = '${userId}'`))
const generateText = () => admin.post('/ai/generate', { kind: 'text', prompt: PROMPT, context: { tag: 'p' } })
const setSecurity = (body: Record<string, unknown>) => admin.put('/security-settings', body)
const today = () => new Date().toISOString().slice(0, 10)

beforeAll(async () => {
  admin = await clientFor('admin')
  adminId = (await admin.get('/auth/me')).json.id
  server = createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ id: 'x', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: 'A short text' }, finish_reason: 'stop' }], usage: { prompt_tokens: 111, completion_tokens: 22, total_tokens: 133 } }))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve))
  endpoint = `http://${hostForContainers()}:${(server.address() as { port: number }).port}/v1`
  const put = await admin.request('PUT', '/ai/settings', { body: { provider: 'custom', model: 'mock-model', endpoint, apiKey: `k-${tag}` } })
  expect(put.status, put.text.slice(0, 200)).toBe(200)
  cleanup.push(() => setSecurity({ aiUsageTracking: false, aiUsageRetentionDays: 90, aiGeneratedRetentionDays: null }))
})
afterAll(async () => {
  for (const f of cleanup.reverse()) await f().catch(() => undefined)
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('the answer', () => {
  it('carries the tokens of the request even when the tracking is off, and nothing is stored', async () => {
    expect((await setSecurity({ aiUsageTracking: false })).status).toBe(200)
    const before = rowsOf(adminId)
    const r = await generateText()
    expect(r.status, r.text.slice(0, 200)).toBe(200)
    expect(r.json.text).toBe('A short text')
    expect(r.json.usage).toEqual({ calls: 1, inputTokens: 111, outputTokens: 22 })
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(rowsOf(adminId)).toBe(before)
  })
})

describe('recording', () => {
  it('is off until an administrator turns it on; the switch is validated and audited', async () => {
    const editor = await createTempUser(admin, 'write')
    cleanup.push(() => admin.delete(`/auth/users/${editor.id}`))
    expect((await (await loginAs(editor)).put('/security-settings', { aiUsageTracking: true })).status).toBe(403)
    expect((await setSecurity({ aiUsageTracking: 'yes' })).status).toBe(400)
    expect((await setSecurity({ aiUsageRetentionDays: 0 })).status).toBe(400)
    const on = await setSecurity({ aiUsageTracking: true, aiUsageRetentionDays: 30 })
    expect(on.status, on.text.slice(0, 200)).toBe(200)
    expect(on.json).toMatchObject({ aiUsageTracking: true, aiUsageRetentionDays: 30 })
    const audit = await admin.get('/audit-log?action=setting.security_update&limit=5')
    expect(audit.json.entries[0].after).toMatchObject({ aiUsageTracking: true, aiUsageRetentionDays: 30 })
  })

  it('stores one row per request with the counts, never the prompt', async () => {
    const before = rowsOf(adminId)
    expect((await generateText()).status).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(rowsOf(adminId)).toBe(before + 1)
    const row = psql(`SELECT kind, provider, model, calls, input_tokens, output_tokens, status FROM ai_usage WHERE user_id = '${adminId}' ORDER BY created_at DESC LIMIT 1`)
    expect(row).toBe('text|custom|mock-model|1|111|22|success')
    const columns = psql(`SELECT string_agg(column_name, ',') FROM information_schema.columns WHERE table_name IN ('ai_usage', 'ai_usage_monthly')`)
    expect(columns).not.toMatch(/prompt|response|payload|content/)
    expect(psql(`SELECT count(*) FROM ai_usage u WHERE u::text LIKE '%${PROMPT}%'`)).toBe('0')
    expect(Number(psql(`SELECT input_tokens FROM ai_usage_monthly WHERE user_id = '${adminId}' AND kind = 'text' AND model = 'mock-model'`))).toBeGreaterThanOrEqual(111)
  })
})

describe('reports', () => {
  it('every user: ai_usage:read only', async () => {
    const r = await admin.get(`/ai/usage?from=${today()}&to=${today()}`)
    expect(r.status, r.text.slice(0, 200)).toBe(200)
    expect(r.json.tracking).toBe(true)
    const mine = r.json.byUser.find((u: any) => u.userId === adminId)
    expect(mine.inputTokens).toBeGreaterThanOrEqual(111)
    expect(r.json.byKind.map((k: any) => k.key)).toContain('text')
    expect(r.json.calls, 'the requests one by one only for one person').toBeUndefined()
    expect(r.text).not.toContain(PROMPT)

    const editor = await createTempUser(admin, 'write')
    cleanup.push(() => admin.delete(`/auth/users/${editor.id}`))
    const ed = await loginAs(editor)
    expect((await ed.get('/ai/usage')).status).toBe(403)
    expect((await ed.get('/ai/usage/monthly')).status).toBe(403)
    expect((await new Client().get('/ai/usage/me')).status).toBe(401)
  })

  it('one person: the requests one by one, and the reading is written to the audit log', async () => {
    const r = await admin.get(`/ai/usage?userId=${adminId}`)
    expect(r.status).toBe(200)
    expect(r.json.calls[0]).toMatchObject({ kind: 'text', provider: 'custom', model: 'mock-model', inputTokens: 111, outputTokens: 22, status: 'success' })
    const audit = await admin.get(`/audit-log?action=ai_usage.read_user&targetId=${adminId}&limit=5`)
    expect(audit.json.entries.length).toBeGreaterThan(0)
    expect(audit.json.entries[0].after).toMatchObject({ from: expect.any(String), to: expect.any(String) })
  })

  it('each user reads their own rows and nobody else\'s', async () => {
    const editor = await createTempUser(admin, 'write')
    cleanup.push(() => admin.delete(`/auth/users/${editor.id}`))
    const own = await (await loginAs(editor)).get('/ai/usage/me')
    expect(own.status).toBe(200)
    expect(own.json.total.requests).toBe(0)
    expect(own.json.byUser).toEqual([])
    const me = await admin.get('/ai/usage/me')
    expect(me.json.calls.length).toBeGreaterThan(0)
    expect(me.json.byUser.every((u: any) => u.userId === adminId)).toBe(true)
    expect(me.json.monthly.length).toBeGreaterThan(0)
  })

  it('refuses a malformed period or user', async () => {
    expect((await admin.get('/ai/usage?from=yesterday')).status).toBe(400)
    expect((await admin.get('/ai/usage?from=2026-02-01&to=2026-01-01')).status).toBe(400)
    expect((await admin.get('/ai/usage?from=2020-01-01&to=2026-01-01')).status).toBe(400)
    expect((await admin.get('/ai/usage?userId=1%27%20or%201=1')).status).toBe(400)
    expect((await admin.get('/ai/usage/monthly?from=2026-13')).status).toBe(400)
  })
})

describe('retention', () => {
  it('deletes the rows older than the period and keeps the monthly totals', async () => {
    psql(`INSERT INTO ai_usage (user_id, kind, provider, model, calls, input_tokens, output_tokens, status, created_at) VALUES ('${adminId}', 'old-${tag}', 'custom', 'mock-model', 1, 5, 5, 'success', now() - interval '40 days')`)
    psql(`INSERT INTO ai_usage_monthly (user_id, month, kind, provider, model, requests, calls, input_tokens, output_tokens) VALUES ('${adminId}', date_trunc('month', now() - interval '40 days')::date, 'old-${tag}', 'custom', 'mock-model', 1, 1, 5, 5)`)
    const run = await admin.post('/data-subject/retention/run', {})
    expect(run.status, run.text.slice(0, 200)).toBe(200)
    expect(run.json.aiUsageDeleted).toBeGreaterThanOrEqual(1)
    expect(psql(`SELECT count(*) FROM ai_usage WHERE kind = 'old-${tag}'`)).toBe('0')
    expect(psql(`SELECT count(*) FROM ai_usage_monthly WHERE kind = 'old-${tag}'`)).toBe('1')
    psql(`DELETE FROM ai_usage_monthly WHERE kind = 'old-${tag}'`)
  })

  it('deletes the recorded AI generations (prompts and answers) older than their own period', async () => {
    psql(`INSERT INTO whoobe_ai_generated (kind, prompt, status, created_at) VALUES ('page', 'old-gen-${tag}', 'success', now() - interval '10 days')`)
    expect((await setSecurity({ aiGeneratedRetentionDays: 5 })).status).toBe(200)
    const run = await admin.post('/data-subject/retention/run', {})
    expect(run.json.aiGeneratedDeleted).toBeGreaterThanOrEqual(1)
    expect(psql(`SELECT count(*) FROM whoobe_ai_generated WHERE prompt = 'old-gen-${tag}'`)).toBe('0')
  })

  it('the rows go with the user', async () => {
    const u = await createTempUser(admin, 'write')
    psql(`INSERT INTO ai_usage (user_id, kind, calls, status) VALUES ('${u.id}', 'text', 1, 'success')`)
    psql(`INSERT INTO ai_usage_monthly (user_id, month, kind, provider, model, requests, calls, input_tokens, output_tokens) VALUES ('${u.id}', date_trunc('month', now())::date, 'text', '', '', 1, 1, 0, 0)`)
    expect((await admin.delete(`/auth/users/${u.id}`)).status).toBeLessThan(300)
    expect(psql(`SELECT (SELECT count(*) FROM ai_usage WHERE user_id = '${u.id}') + (SELECT count(*) FROM ai_usage_monthly WHERE user_id = '${u.id}')`)).toBe('0')
  })
})
