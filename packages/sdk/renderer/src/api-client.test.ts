import { describe, it, expect, vi } from 'vitest'
import { ApiClient } from './api-client.js'

function mockFetch(handler: (url: string, init?: RequestInit) => { ok: boolean; json: () => any; status?: number }) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const result = handler(url, init)
    return { ok: result.ok, status: result.status ?? 200, json: result.json } as Response
  })
  return { fn, client: new ApiClient('http://cms:3003/', fn as unknown as typeof fetch) }
}

describe('ApiClient', () => {
  it('fetches a page with the right URL', async () => {
    const { fn, client } = mockFetch(() => ({ ok: true, json: () => ({ page: { id: 'p1' }, params: {} }) }))
    await client.getPage('it', '/news/{slug}', 'w1')
    // Only the locale is percent-encoded - the request path (which may carry
    // a literal {placeholder} pattern) is passed through verbatim.
    expect(fn.mock.calls[0][0]).toBe('http://cms:3003/public/pages/it/news/{slug}?websiteId=w1')
  })

  it('gets a published object or null', async () => {
    const { fn, client } = mockFetch(() => ({ ok: true, json: () => ({ object: { id: 'o1' } }) }))
    expect(await client.getObject('o1')).toEqual({ id: 'o1' })
    expect(fn.mock.calls[0][0]).toBe('http://cms:3003/public/data-objects/o1')
  })

  it('queries objects with the posted params', async () => {
    const { fn, client } = mockFetch(() => ({ ok: true, json: () => ({ objects: [{ id: 'a' }, { id: 'b' }] }) }))
    const out = await client.queryObjects({ class: 'Newsletter', limit: 10, locale: 'it' })
    expect(out).toHaveLength(2)
    const body = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toMatchObject({ class: 'Newsletter', limit: 10, locale: 'it' })
  })

  it('submits a form', async () => {
    const { fn, client } = mockFetch(() => ({ ok: true, json: () => ({ success: true }) }))
    const out = await client.submitForm('c1', { name: 'A' }, { notify: { enabled: false } })
    expect(out).toEqual({ success: true })
    expect(fn.mock.calls[0][0]).toBe('http://cms:3003/public/forms/c1/submit')
    const body = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string)
    expect(body.attributes).toEqual({ name: 'A' })
  })

  it('surfaces API errors', async () => {
    const { client } = mockFetch(() => ({ ok: false, status: 400, json: () => ({ error: 'bad request' }) }))
    await expect(client.getObject('x')).rejects.toThrow('bad request')
  })
})
