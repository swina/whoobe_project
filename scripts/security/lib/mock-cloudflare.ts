// A small Cloudflare Images for the tests of the CDN mirror: the upload (multipart, with the custom image id), the delete and the statistics, with the
// bearer token checked. It remembers what it received so a test can compare the bytes.
import { createServer, type Server } from 'node:http'
import { hostForContainers } from './mock-oidc'

export interface StoredImage { id: string; filename: string; contentType: string; bytes: Buffer }

function parseMultipart(body: Buffer, contentType: string): { fields: Record<string, string>; file?: { filename: string; contentType: string; bytes: Buffer } } {
  const boundary = /boundary=(.+)$/.exec(contentType)?.[1] ?? ''
  const delimiter = Buffer.from(`--${boundary}`)
  const fields: Record<string, string> = {}
  let file: { filename: string; contentType: string; bytes: Buffer } | undefined
  let pos = body.indexOf(delimiter)
  while (pos !== -1) {
    const next = body.indexOf(delimiter, pos + delimiter.length)
    if (next === -1) break
    const part = body.subarray(pos + delimiter.length + 2, next - 2)   // after "--b\r\n", before "\r\n--b"
    const split = part.indexOf('\r\n\r\n')
    const head = part.subarray(0, split).toString()
    const data = part.subarray(split + 4)
    const name = /name="([^"]*)"/.exec(head)?.[1] ?? ''
    const filename = /filename="([^"]*)"/.exec(head)?.[1]
    if (filename !== undefined) file = { filename, contentType: /Content-Type: (.+)/i.exec(head)?.[1]?.trim() ?? '', bytes: Buffer.from(data) }
    else fields[name] = data.toString()
    pos = next
  }
  return { fields, file }
}

export async function startMockCloudflare(opts: { token: string; account: string; host?: string }) {
  const host = opts.host ?? hostForContainers()
  const images = new Map<string, StoredImage>()
  const log: { method: string; path: string; authorization?: string }[] = []
  const state = { fail: undefined as undefined | { status: number; code: number; message: string } }
  let base = ''
  const server: Server = createServer(async (req, res) => {
    const json = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
    const path = new URL(req.url ?? '/', 'http://x').pathname
    log.push({ method: req.method ?? '', path, authorization: req.headers.authorization })
    const m = new RegExp(`^/client/v4/accounts/([^/]+)/images/v1(?:/(.+))?$`).exec(path)
    if (!m) return json(404, { success: false, errors: [{ code: 7003, message: 'No route for that URI' }] })
    if (req.headers.authorization !== `Bearer ${opts.token}`) return json(401, { success: false, errors: [{ code: 9109, message: 'Invalid access token' }] })
    if (m[1] !== opts.account) return json(403, { success: false, errors: [{ code: 7003, message: 'Unknown account' }] })
    if (state.fail) return json(state.fail.status, { success: false, errors: [{ code: state.fail.code, message: state.fail.message }] })
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const body = Buffer.concat(chunks)
    if (req.method === 'GET' && m[2] === 'stats') return json(200, { success: true, errors: [], result: { count: { current: images.size, allowed: 100000 } } })
    if (req.method === 'DELETE' && m[2]) {
      if (!images.delete(decodeURIComponent(m[2]))) return json(404, { success: false, errors: [{ code: 5404, message: 'Image not found' }] })
      return json(200, { success: true, errors: [], result: {} })
    }
    if (req.method === 'POST' && !m[2]) {
      const { fields, file } = parseMultipart(body, req.headers['content-type'] ?? '')
      if (!file) return json(400, { success: false, errors: [{ code: 5400, message: 'No file' }] })
      const id = fields.id || crypto.randomUUID()
      if (images.has(id)) return json(409, { success: false, errors: [{ code: 5409, message: 'Resource already exists' }] })
      images.set(id, { id, filename: file.filename, contentType: file.contentType, bytes: file.bytes })
      return json(200, { success: true, errors: [], messages: [], result: { id, filename: file.filename, uploaded: new Date().toISOString(), variants: [`https://imagedelivery.example/HASH/${id}/thumb`, `https://imagedelivery.example/HASH/${id}/public`] } })
    }
    json(405, { success: false, errors: [{ code: 7000, message: 'Method not allowed' }] })
  })
  await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve))
  base = `http://${host}:${(server.address() as { port: number }).port}/client/v4`
  return { base, images, log, state, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
}
