// The Alpine presets catalog (GET/PUT /whoobe-one/settings/alpine-presets): named sets of Alpine directives that an
// administrator defines once and applies from the editor. The catalog is installation-wide data that ends up, copied,
// in pages that run on the public site, so what matters here is who may write it, that nothing but well-formed
// directives gets in, and that a refused write leaves the stored catalog untouched. (Who may call the two routes at
// all is also swept, for every identity, by authz-matrix.test.ts from routes.expected.json.)
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client, clientFor } from '../lib/client'

const PATH = '/whoobe-one/settings/alpine-presets'
const fade = {
  name: 'fade-scale',
  description: 'Fade and scale in and out',
  directives: {
    'x-transition:enter': 'transition ease-out duration-300',
    'x-transition:enter-start': 'opacity-0 scale-90',
    'x-transition:enter-end': 'opacity-100 scale-100',
    'x-transition:leave': 'transition ease-in duration-300',
    'x-transition:leave-start': 'opacity-100 scale-100',
    'x-transition:leave-end': 'opacity-0 scale-90',
  },
}

let admin: Client
let write: Client
let read: Client
let anon: Client
let original: unknown[] = []

beforeAll(async () => {
  admin = await clientFor('admin')
  write = await clientFor('write')
  read = await clientFor('read')
  anon = await clientFor('anon')
  original = (await admin.get(PATH)).json?.presets ?? []
})
afterAll(async () => { await admin.put(PATH, { presets: original }) })

const stored = async () => (await admin.get(PATH)).json.presets

describe('who may read and write the catalog', () => {
  it('an editor with objects:write can save and read it back, unchanged', async () => {
    const put = await write.put(PATH, { presets: [fade] })
    expect(put.status, put.text.slice(0, 160)).toBe(200)
    expect(put.json.presets).toEqual([fade])
    expect(await stored()).toEqual([fade])
  })

  it('a read-only identity can read it but not write it, and the catalog is not touched', async () => {
    expect((await read.get(PATH)).status).toBe(200)
    expect((await read.put(PATH, { presets: [] })).status).toBe(403)
    expect(await stored()).toEqual([fade])
  })

  it('an anonymous visitor can neither read nor write it', async () => {
    expect((await anon.get(PATH)).status).toBe(401)
    expect((await anon.put(PATH, { presets: [] })).status).toBe(401)
  })

  it('the catalog is not served on the public surface (the public website routes expose only selected settings)', async () => {
    const list = await anon.get('/public/websites')
    const id = list.json?.websites?.[0]?.id
    expect(id, 'the harness stack has a website').toBeTruthy()
    const res = await anon.get(`/public/websites/${id}`)
    expect(res.status).toBe(200)
    expect(res.text).not.toContain('alpinePresets')
    expect(res.text).not.toContain('fade-scale')
  })
})

describe('what is refused, and that a refused write changes nothing', () => {
  const bad: [string, unknown][] = [
    ['presets missing', {}],
    ['presets that is not an array', { presets: { fade } }],
    ['a preset with no name', { presets: [{ directives: { 'x-show': 'a' } }] }],
    ['a name with markup', { presets: [{ name: '<img src=x onerror=alert(1)>', directives: { 'x-show': 'a' } }] }],
    ['a directive that is not an Alpine one (onclick)', { presets: [{ name: 'a', directives: { onclick: 'alert(1)' } }] }],
    ['a style attribute', { presets: [{ name: 'a', directives: { style: 'background:url(javascript:alert(1))' } }] }],
    ['__proto__ as a directive', '{"presets":[{"name":"a","directives":{"__proto__":"x"}}]}'],
    ['__proto__ as a preset name', { presets: [{ name: '__proto__', directives: { 'x-show': 'a' } }] }],
    ['a non-string value', { presets: [{ name: 'a', directives: { 'x-show': { evil: true } } }] }],
    ['a preset with no directives', { presets: [{ name: 'a', directives: {} }] }],
    ['an oversized value', { presets: [{ name: 'a', directives: { 'x-data': 'a'.repeat(4001) } }] }],
    ['a duplicate name in another case', { presets: [fade, { ...fade, name: 'FADE-SCALE' }] }],
    ['more than 100 presets', { presets: Array.from({ length: 101 }, (_v, i) => ({ name: `p${i}`, directives: { 'x-show': 'a' } })) }],
  ]

  it.each(bad)('%s -> 400', async (_label, body) => {
    const res = typeof body === 'string'
      ? await admin.request('PUT', PATH, { rawBody: body, headers: { 'content-type': 'application/json' } })
      : await admin.put(PATH, body)
    expect(res.status, res.text.slice(0, 200)).toBe(400)
    expect(await stored()).toEqual([fade])
  })

  it('unknown properties are dropped, the stored shape is exactly name/description/directives', async () => {
    const res = await admin.put(PATH, { presets: [{ ...fade, evil: '<script>1</script>', note: 'x' }] })
    expect(res.status).toBe(200)
    expect(Object.keys((await stored())[0]).sort()).toEqual(['description', 'directives', 'name'])
  })

  it('stores values as data: markup and scripts in a value come back verbatim and are not interpreted', async () => {
    const value = `'<script>alert(1)</script>' + "x"`
    const res = await admin.put(PATH, { presets: [{ name: 'verbatim', directives: { 'x-text': value } }] })
    expect(res.status).toBe(200)
    expect((await stored())[0].directives['x-text']).toBe(value)
  })

  it('clearing the catalog with an empty array works', async () => {
    expect((await admin.put(PATH, { presets: [] })).status).toBe(200)
    expect(await stored()).toEqual([])
  })
})
