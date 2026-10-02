// Plan 3.7: asset-processor - who may call the image endpoints, what an upload can do once it is served.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { deflateSync } from 'node:zlib'
import { randomBytes } from 'node:crypto'
import { Client, clientFor } from '../lib/client'
import { ASSET_TARGET, readEnvFile } from '../lib/config'

function crc32(buf: Uint8Array): number {
  let c, crc = ~0
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c }
  return ~crc >>> 0
}
function png(w: number, h: number): Uint8Array {
  const raw = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0xff)])))
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

/** 1-bit greyscale PNG: huge dimensions, a few KB on the wire, ~w*h/8 bytes to build. */
function bigPng(w: number, h: number): Uint8Array {
  const rowBytes = Math.ceil(w / 8) + 1
  const raw = Buffer.alloc(rowBytes * h, 0)   // filter 0, all-black pixels
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 1; ihdr[9] = 0
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const tag = randomBytes(3).toString('hex')
const dir = `/sec-${tag}`
let admin: Client
let adminAsset: Client
let anon: Client
const uploaded: string[] = []

async function put(name: string, type: string, data: Uint8Array | string, pimcorePath = `${dir}/${name}`, isPublic = 'true') {
  const r = await adminAsset.upload('/api/v1/dam/upload', { pimcorePath, isPublic }, { file: { name, type, data } })
  if (r.status === 200) uploaded.push(pimcorePath)
  return r
}

beforeAll(async () => {
  admin = await clientFor('admin')
  adminAsset = admin.forBase(ASSET_TARGET)
  anon = new Client(ASSET_TARGET)
})

afterAll(async () => {
  for (const p of uploaded) await adminAsset.request('DELETE', '/api/v1/dam/asset', { body: { pimcorePath: p } })
})

describe('stateless image endpoints are not public', () => {
  const small = () => ({ file: { name: 't.png', type: 'image/png', data: png(8, 8) } })

  it.each(['/api/v1/process', '/api/v1/metadata', '/api/v1/watermark', '/api/v1/dam/upload'])('%s: anonymous -> 401', async (path) => {
    const r = await anon.upload(path, { pimcorePath: '/x.png' }, small())
    expect(r.status).toBe(401)
  })

  it.each(['/api/v1/process', '/api/v1/metadata'])('%s: a user without assets:upload -> 403', async (path) => {
    const none = (await clientFor('none')).forBase(ASSET_TARGET)
    expect((await none.upload(path, {}, small())).status).toBe(403)
  })

  it('an authorised session can process an image', async () => {
    const r = await adminAsset.upload('/api/v1/process?width=4&format=png', {}, small())
    expect(r.status, r.text.slice(0, 120)).toBe(200)
  })

  it('rejects out-of-range or malformed parameters instead of allocating', async () => {
    for (const q of ['width=99999', 'height=9999999999', 'width=abc', 'width=-1', 'quality=0', 'quality=1000', 'format=exe', 'format=../x']) {
      const r = await adminAsset.upload(`/api/v1/process?${q}`, {}, small())
      expect(r.status, q).toBe(400)
    }
  })
})

describe('decompression bombs', () => {
  // 12 000 x 12 000 = 144 MP: over the 100 MP cap, yet a few tens of KB on the wire (1-bit PNG).
  it('an image with absurd dimensions is refused (413), not decoded', async () => {
    const big = bigPng(12_000, 12_000)
    const r = await adminAsset.upload('/api/v1/process?width=10', {}, { file: { name: 'bomb.png', type: 'image/png', data: big } })
    expect(r.status, r.text.slice(0, 160)).toBe(413)
  })
})

describe('what an uploaded file can do once served from /dam-asset', () => {
  it('HTML is served as a download, never as a page', async () => {
    const up = await put('x.html', 'text/html', '<html><script>alert(document.domain)</script></html>')
    expect(up.status, up.text.slice(0, 150)).toBe(200)
    const r = await anon.get(`/dam-asset/${up.json.s3Key}`)
    expect(r.headers.get('content-type')).toMatch(/octet-stream/)
    expect(r.headers.get('content-disposition')).toMatch(/attachment/)
    expect(r.headers.get('content-security-policy')).toMatch(/sandbox/)
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('SVG with script is sandboxed when opened directly', async () => {
    const up = await put('x.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script></svg>')
    const r = await anon.get(`/dam-asset/${up.json.s3Key}`)
    expect(r.headers.get('content-type')).toMatch(/image\/svg\+xml/)
    expect(r.headers.get('content-security-policy')).toMatch(/sandbox/)
    expect(r.headers.get('content-security-policy')).not.toMatch(/allow-scripts/)
  })

  it('a normal image keeps its type and long-lived caching', async () => {
    const up = await put('ok.png', 'image/png', png(8, 8), `${dir}/ok.png`, 'true')
    const r = await anon.get(`/dam-asset/${up.json.s3Key}`)
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('image/png')
    expect(r.headers.get('cache-control')).toMatch(/immutable/)
  })

  it('an asset recorded as private needs a session when visibility is enforced (DAM_ENFORCE_ASSET_VISIBILITY=true)', async () => {
    const up = await put('priv.png', 'image/png', png(8, 8), `${dir}/priv.png`, 'false')
    expect(up.status).toBe(200)
    expect((await anon.get(`/dam-asset/${up.json.s3Key}`)).status).toBe(404)
    expect((await anon.get(`/dam-asset/${up.json.thumbnails?.thumb?.split('/dam-asset/')[1]}`)).status).toBe(404)
    expect((await adminAsset.get(`/dam-asset/${up.json.s3Key}`)).status).toBe(200)
    const pub = await put('pub.png', 'image/png', png(8, 8), `${dir}/pub.png`, 'true')
    expect((await anon.get(`/dam-asset/${pub.json.s3Key}`)).status).toBe(200)
  })

  it('the system private/ area is not served anonymously, but is to a logged-in user', async () => {
    const up = await put('s.txt', 'text/plain', 'top secret', '/private/sec-' + tag + '/s.txt')
    expect(up.status).toBe(200)
    expect((await anon.get(`/dam-asset/${up.json.s3Key}`)).status).toBe(404)
    const mine = await adminAsset.get(`/dam-asset/${up.json.s3Key}`)
    expect(mine.status).toBe(200)
    expect(mine.headers.get('cache-control')).toMatch(/private|no-store/)
  })

  it('the DAM service token (used by core-api for system logs) can read private keys', async () => {
    const token = readEnvFile().DAM_SERVICE_TOKEN
    const up = await put('svc.txt', 'text/plain', 'for the service', `/private/sec-${tag}/svc.txt`)
    const ok = await new Client(ASSET_TARGET).get(`/dam-asset/${up.json.s3Key}`, { authorization: `Bearer ${token}` })
    expect(ok.status).toBe(200)
    const bad = await new Client(ASSET_TARGET).get(`/dam-asset/${up.json.s3Key}`, { authorization: 'Bearer nope' })
    expect(bad.status).toBe(404)
  })

  it('a content type claimed by the uploader cannot make an image upload active content', async () => {
    const up = await put('claims.png', 'text/html', png(8, 8))
    const r = await anon.get(`/dam-asset/${up.json.s3Key}`)
    expect(r.headers.get('content-type')).not.toMatch(/html/)
  })
})

describe('upload input handling', () => {
  it('path traversal in pimcorePath cannot escape the key space', async () => {
    const up = await put('t.txt', 'text/plain', 'x', '/../../escape-' + tag + '/t.txt')
    if (up.status === 200) expect(up.json.s3Key, 'normalised key').not.toMatch(/\.\./)
    else expect(up.status).toBeLessThan(500)
  })

  it('odd names and empty files give 4xx, never a 5xx with internals', async () => {
    const cases: [string, string, Uint8Array | string, string][] = [
      ['empty.png', 'image/png', '', `${dir}/empty.png`],
      ['nul\u0000.png', 'image/png', png(4, 4), `${dir}/nul.png`],
      ['x'.repeat(600) + '.png', 'image/png', png(4, 4), `${dir}/long.png`],
      ['..%2f..%2fx.png', 'image/png', png(4, 4), `${dir}/%2e%2e/x.png`],
    ]
    for (const [name, type, data, p] of cases) {
      const r = await put(name, type, data, p)
      expect(r.status, name.slice(0, 20)).toBeLessThan(500)
      expect(r.text).not.toMatch(/node_modules|at .*\(.*:\d+:\d+\)|Failed query/)
    }
  })
})
