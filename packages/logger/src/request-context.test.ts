import { describe, expect, it } from 'vitest'
import { Writable } from 'node:stream'
import type { AddressInfo } from 'node:net'
import express from 'express'
import pino from 'pino'
import { currentRequestId, isValidRequestId, requestIdMiddleware, withRequestId } from './request-context.js'

/** An app like the services': the middleware first, then a body parser, then an async handler that logs and calls out. */
async function serve(handler: (req: any, res: any) => Promise<void>) {
  const app = express()
  app.use(requestIdMiddleware())
  app.use(express.json())
  app.post('/t', (req, res) => { handler(req, res).catch((e) => res.status(500).json({ e: String(e) })) })
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/t`
  return { url, close: () => new Promise((r) => server.close(r)) }
}

describe('isValidRequestId', () => {
  it('keeps the ids nginx and the services make', () => {
    expect(isValidRequestId('0123456789abcdef0123456789abcdef')).toBe(true)
    expect(isValidRequestId('6f1c2b9e-3a4d-4e5f-8a9b-0c1d2e3f4a5b')).toBe(true)
  })
  it('refuses short, long, odd characters, arrays', () => {
    expect(isValidRequestId('short')).toBe(false)
    expect(isValidRequestId('a'.repeat(101))).toBe(false)
    expect(isValidRequestId('abcdefgh\nX-Evil: 1')).toBe(false)
    expect(isValidRequestId('<script>alert(1)</script>')).toBe(false)
    expect(isValidRequestId(['0123456789abcdef'])).toBe(false)
    expect(isValidRequestId(undefined)).toBe(false)
  })
})

describe('withRequestId', () => {
  it('adds nothing outside a request', () => {
    expect(withRequestId({ Accept: 'x' })).toEqual({ Accept: 'x' })
  })
})

describe('requestIdMiddleware', () => {
  it('keeps a valid incoming id: response header, request header, context after the body parser, log line, outgoing headers', async () => {
    const lines: any[] = []
    const log = pino({ mixin: () => (currentRequestId() ? { requestId: currentRequestId() } : {}) }, new Writable({
      write(chunk, _enc, cb) { lines.push(JSON.parse(String(chunk))); cb() },
    }))
    const srv = await serve(async (req, res) => {
      await new Promise((r) => setTimeout(r, 5))
      log.info('handled')
      res.json({ header: req.headers['x-request-id'], ctx: currentRequestId(), out: withRequestId({ 'Content-Type': 'application/json' }) })
    })
    try {
      const id = '0123456789abcdef0123456789abcdef'
      const r = await fetch(srv.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Request-Id': id }, body: JSON.stringify({ a: 1 }) })
      const body = await r.json()
      expect(r.headers.get('x-request-id')).toBe(id)
      expect(body).toEqual({ header: id, ctx: id, out: { 'Content-Type': 'application/json', 'X-Request-Id': id } })
      expect(lines.find((l) => l.msg === 'handled')?.requestId).toBe(id)
    } finally { await srv.close() }
  })

  it('replaces an invalid id with a generated one, different per request', async () => {
    const srv = await serve(async (_req, res) => { res.json({ ctx: currentRequestId() }) })
    try {
      const a = await fetch(srv.url, { method: 'POST', headers: { 'X-Request-Id': 'bad id!' } })
      const b = await fetch(srv.url, { method: 'POST' })
      const ida = a.headers.get('x-request-id')!
      const idb = b.headers.get('x-request-id')!
      expect(ida).toMatch(/^[0-9a-f-]{36}$/)
      expect(idb).toMatch(/^[0-9a-f-]{36}$/)
      expect(ida).not.toBe(idb)
      expect((await a.json()).ctx).toBe(ida)
    } finally { await srv.close() }
  })

  it('does not name an id the caller set already', () => {
    expect(withRequestId({ 'x-request-id': 'given-12345' })).toEqual({ 'x-request-id': 'given-12345' })
  })
})
