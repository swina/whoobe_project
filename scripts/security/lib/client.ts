// Minimal HTTP client with a per-instance cookie jar, so each role gets its own session.
import { TARGET, ADMIN_EMAIL, ADMIN_PASSWORD, ROLE_USER_PASSWORD } from './config'
import { roleEmail, type RoleName } from './roles'

export interface RawResponse {
  status: number
  headers: Headers
  text: string
  json: any
}

export class Client {
  private cookies = new Map<string, string>()
  constructor(public readonly base: string = TARGET, public readonly label = 'anon') {}

  private storeCookies(res: Response) {
    const list: string[] = (res.headers as any).getSetCookie?.() ?? []
    for (const c of list) {
      const [pair] = c.split(';')
      const i = pair.indexOf('=')
      if (i > 0) {
        const name = pair.slice(0, i).trim()
        const value = pair.slice(i + 1).trim()
        if (value === '' || /;\s*max-age=0/i.test(c) || /expires=Thu, 01 Jan 1970/i.test(c)) this.cookies.delete(name)
        else this.cookies.set(name, value)
      }
    }
  }

  /** Same session (cookies), another service base URL - e.g. the asset-processor validates core-api's cookie. */
  forBase(base: string, label = this.label): Client {
    const c = new Client(base, label)
    for (const [k, v] of this.cookies) c.cookies.set(k, v)
    return c
  }

  get cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
  }

  async request(method: string, path: string, opts: { body?: unknown; headers?: Record<string, string>; rawBody?: string } = {}): Promise<RawResponse> {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) }
    if (this.cookies.size) headers.cookie = this.cookieHeader
    let body: string | undefined = opts.rawBody
    if (body === undefined && opts.body !== undefined) {
      body = JSON.stringify(opts.body)
      headers['content-type'] ??= 'application/json'
    }
    const res = await fetch(this.base + path, { method, headers, body, redirect: 'manual' })
    this.storeCookies(res)
    const text = await res.text()
    let json: any = null
    try { json = JSON.parse(text) } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, text, json }
  }

  /** multipart/form-data POST (uploads). */
  async upload(path: string, fields: Record<string, string>, files: Record<string, { name: string; type: string; data: Uint8Array | string }>): Promise<RawResponse> {
    const form = new FormData()
    for (const [k, v] of Object.entries(fields)) form.append(k, v)
    for (const [k, f] of Object.entries(files)) form.append(k, new Blob([f.data as any], { type: f.type }), f.name)
    const headers: Record<string, string> = {}
    if (this.cookies.size) headers.cookie = this.cookieHeader
    const res = await fetch(this.base + path, { method: 'POST', headers, body: form, redirect: 'manual' })
    const text = await res.text()
    let json: any = null
    try { json = JSON.parse(text) } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, text, json }
  }

  get = (p: string, h?: Record<string, string>) => this.request('GET', p, { headers: h })
  post = (p: string, body?: unknown, h?: Record<string, string>) => this.request('POST', p, { body, headers: h })
  patch = (p: string, body?: unknown) => this.request('PATCH', p, { body })
  put = (p: string, body?: unknown) => this.request('PUT', p, { body })
  delete = (p: string) => this.request('DELETE', p)

  async login(email: string, password: string): Promise<RawResponse> {
    const res = await this.post('/auth/login', { email, password })
    if (res.status !== 200) throw new Error(`login as ${email} failed: ${res.status} ${res.text.slice(0, 120)}`)
    return res
  }
}

/** A client logged in as the given role (or unauthenticated for `anon`). */
export async function clientFor(role: RoleName): Promise<Client> {
  const c = new Client(TARGET, role)
  if (role === 'anon') return c
  if (role === 'admin') await c.login(ADMIN_EMAIL, ADMIN_PASSWORD)
  else await c.login(roleEmail(role), ROLE_USER_PASSWORD)
  return c
}
