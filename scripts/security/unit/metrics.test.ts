import { describe, expect, it } from 'vitest'
import { createHttpMetrics, memoAsync, metricsTokenOk } from '../../../apps/core-api/src/metrics'

describe('http metrics', () => {
  it('counts by method, route and status class, and renders a histogram per route', () => {
    const m = createHttpMetrics()
    m.observe('GET', '/auth/users/:id', 200, 0.02)
    m.observe('GET', '/auth/users/:id', 404, 0.3)
    m.observe('POST', '/auth/login', 401, 0.001)
    const text = m.render([])
    expect(text).toContain('whoobe_http_requests_total{method="GET",route="/auth/users/:id",status="2xx"} 1')
    expect(text).toContain('whoobe_http_requests_total{method="GET",route="/auth/users/:id",status="4xx"} 1')
    expect(text).toContain('whoobe_http_requests_total{method="POST",route="/auth/login",status="4xx"} 1')
    expect(text).toContain('whoobe_http_request_duration_seconds_bucket{route="/auth/users/:id",le="0.025"} 1')
    expect(text).toContain('whoobe_http_request_duration_seconds_bucket{route="/auth/users/:id",le="+Inf"} 2')
    expect(text).toContain('whoobe_http_request_duration_seconds_count{route="/auth/users/:id"} 2')
  })
  it('bounds the number of route series', () => {
    const m = createHttpMetrics()
    for (let i = 0; i < 700; i++) m.observe('GET', `/r${i}`, 200, 0.01)
    const text = m.render([])
    expect(text).toContain('route="other"')
    expect((text.match(/whoobe_http_requests_total\{/g) ?? []).length).toBe(501)
  })
  it('renders gauges with escaped labels', () => {
    const text = createHttpMetrics().render([{ name: 'g', help: 'h', samples: [{ labels: { status: 'a"b\nc' }, value: 3 }, { value: 1 }] }])
    expect(text).toContain('g{status="a\\"b\\nc"} 3')
    expect(text).toContain('\ng 1\n')
  })
})

describe('metricsTokenOk', () => {
  it('accepts only the exact bearer token, and nothing when none is configured', () => {
    expect(metricsTokenOk('Bearer s3cret', 's3cret')).toBe(true)
    expect(metricsTokenOk('Bearer s3cret ', 's3cret')).toBe(false)
    expect(metricsTokenOk('Bearer nope', 's3cret')).toBe(false)
    expect(metricsTokenOk('s3cret', 's3cret')).toBe(false)
    expect(metricsTokenOk(undefined, 's3cret')).toBe(false)
    expect(metricsTokenOk('Bearer ', '')).toBe(false)
    expect(metricsTokenOk('Bearer x', undefined)).toBe(false)
  })
})

describe('memoAsync', () => {
  it('shares one call between concurrent callers and keeps the answer for the ttl', async () => {
    let calls = 0
    const f = memoAsync(async () => { calls++; await new Promise((r) => setTimeout(r, 10)); return calls }, 50)
    expect(await Promise.all([f(), f(), f()])).toEqual([1, 1, 1])
    expect(await f()).toBe(1)
    await new Promise((r) => setTimeout(r, 70))
    expect(await f()).toBe(2)
  })
})
