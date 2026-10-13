// The sliding-window limiter used for API clients and the per-endpoint limit (apps/gateway/src/limiter.ts). The in-process store is
// the reference of the algorithm; the Redis-protocol store is checked against a real server in the integration test when
// WB_TEST_REDIS_URL is set (scripts/security/README or the plan, section 13).
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../apps/gateway/src/log-error', () => ({ logger: { warn: () => undefined, info: () => undefined, error: () => undefined }, logGatewayError: () => undefined }))
const { createMemoryStore, createLimiter, createRedisStore } = await import('../../../apps/gateway/src/limiter')

describe('memory store', () => {
  it('allows the limit inside a window and refuses the next call with a wait time', async () => {
    const s = createMemoryStore()
    const t = 10_000_000
    for (let i = 0; i < 5; i++) expect((await s.slide('k', 5, 1000, t)).allowed).toBe(true)
    const r = await s.slide('k', 5, 1000, t + 10)
    expect(r.allowed).toBe(false)
    expect(r.retryAfterMs).toBeGreaterThan(0)
    expect(r.retryAfterMs).toBeLessThanOrEqual(1000)
  })
  it('reports what is left', async () => {
    const s = createMemoryStore()
    expect((await s.slide('k', 3, 1000, 5_000_000)).remaining).toBe(2)
    expect((await s.slide('k', 3, 1000, 5_000_001)).remaining).toBe(1)
    expect((await s.slide('k', 3, 1000, 5_000_002)).remaining).toBe(0)
  })
  it('counts keys apart', async () => {
    const s = createMemoryStore()
    await s.slide('a', 1, 1000, 1_000_000)
    expect((await s.slide('a', 1, 1000, 1_000_001)).allowed).toBe(false)
    expect((await s.slide('b', 1, 1000, 1_000_001)).allowed).toBe(true)
  })
  it('does not allow a double burst at a window boundary (the flaw of a fixed window)', async () => {
    const s = createMemoryStore()
    const edge = 7_000_000 // multiple of 1000
    let ok = 0
    for (let i = 0; i < 10; i++) if ((await s.slide('k', 10, 1000, edge - 100 + i)).allowed) ok++      // end of window N
    for (let i = 0; i < 10; i++) if ((await s.slide('k', 10, 1000, edge + 100 + i)).allowed) ok++      // start of window N+1
    expect(ok).toBeLessThan(15)
  })
  it('recovers once the window has passed', async () => {
    const s = createMemoryStore()
    for (let i = 0; i < 4; i++) await s.slide('k', 2, 1000, 3_000_000 + i)
    expect((await s.slide('k', 2, 1000, 3_000_050)).allowed).toBe(false)
    expect((await s.slide('k', 2, 1000, 3_005_000)).allowed).toBe(true)
  })
  it('a daily quota counts calls and refuses past the maximum', async () => {
    const s = createMemoryStore()
    expect((await s.quota('q', 2, 1000)).allowed).toBe(true)
    expect((await s.quota('q', 2, 1000)).allowed).toBe(true)
    const third = await s.quota('q', 2, 1000)
    expect(third).toEqual({ allowed: false, used: 3 })
  })
  it('stays bounded', async () => {
    const s = createMemoryStore({ maxKeys: 100 })
    for (let i = 0; i < 1000; i++) await s.slide(`k${i}`, 5, 1000, 1_000_000 + i)
    expect((await s.slide('fresh', 5, 1000, 1_002_000)).allowed).toBe(true)
  })
})

describe('limiter with a shared store', () => {
  it('without Redis it counts in memory and says so', async () => {
    const l = createLimiter('memory', '')
    expect(l.status()).toEqual({ backend: 'memory', degraded: false })
    expect((await l.slide('k', 1, 1000)).allowed).toBe(true)
    expect((await l.slide('k', 1, 1000)).allowed).toBe(false)
    await l.close()
  })
  it('falls back to memory when the store cannot be reached, and reports it', async () => {
    const l = createLimiter('redis', 'redis://127.0.0.1:1')
    const r = await l.slide('k', 2, 1000)
    expect(r.allowed).toBe(true)
    expect(l.status()).toEqual({ backend: 'redis', degraded: true })
    expect((await l.slide('k', 2, 1000)).allowed).toBe(true)
    expect((await l.slide('k', 2, 1000)).allowed).toBe(false)
    await l.close()
  })
})

const redisUrl = process.env.WB_TEST_REDIS_URL
describe.skipIf(!redisUrl)('Redis-protocol store (WB_TEST_REDIS_URL)', () => {
  it('agrees with the reference algorithm and is shared between clients', async () => {
    const a = createRedisStore(redisUrl!)
    const b = createRedisStore(redisUrl!)
    await Promise.all([a.ready(), b.ready()])
    const key = `test:${Date.now()}`
    const t = Math.floor(Date.now() / 1000) * 1000 + 1   // start of a window
    const results = []
    for (let i = 0; i < 4; i++) results.push((await (i % 2 ? a : b).store.slide(key, 3, 1000, t + i)).allowed)
    expect(results).toEqual([true, true, true, false])         // two connections, one count
    const refused = await a.store.slide(key, 3, 1000, t + 10)
    expect(refused.allowed).toBe(false)
    expect(refused.retryAfterMs).toBeGreaterThan(0)
    expect(await a.store.quota(`${key}:q`, 1, 5000)).toEqual({ allowed: true, used: 1 })
    expect(await b.store.quota(`${key}:q`, 1, 5000)).toEqual({ allowed: false, used: 2 })
    await a.client.quit(); await b.client.quit()
  })
  it('counts atomically under concurrency', async () => {
    const c = createRedisStore(redisUrl!)
    await c.ready()
    const key = `test:conc:${Date.now()}`
    const t = Math.floor(Date.now() / 1000) * 1000 + 1
    const out = await Promise.all(Array.from({ length: 50 }, () => c.store.slide(key, 10, 1000, t)))
    expect(out.filter((r) => r.allowed).length).toBe(10)
    await c.client.quit()
  })
})
