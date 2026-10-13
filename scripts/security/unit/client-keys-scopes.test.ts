// API clients (docs/plans/api-gateway/client-access-hub.md): the key format and hashing, the scope language, the matching of a
// request path to a route, and the address allow-list. Pure functions; no database.
import { describe, it, expect, beforeAll } from 'vitest'
import { generateClientKey, parseClientKey, hashClientKey, verifyClientKey } from '../../../packages/core/src/gateway/client-keys'
import { parseGatewayScope, validateClientScopes, scopeAllows, matchRoute, unsafePathReason } from '../../../packages/core/src/gateway/client-scopes'
import { ipAllowed } from '../../../apps/gateway/src/client-ip'

beforeAll(() => { process.env.SITE_API_KEY_PEPPER = 'test-pepper' })

describe('client keys', () => {
  it('has the shape wbk_<8>_<43> and the prefix is the lookup id', () => {
    const k = generateClientKey()
    expect(k.plaintext).toMatch(/^wbk_[A-Za-z0-9]{8}_[A-Za-z0-9_-]{43}$/)
    expect(parseClientKey(k.plaintext)).toEqual({ prefix: k.prefix })
  })
  it('stores a hash that verifies the key and nothing else', () => {
    const k = generateClientKey()
    expect(k.hash).not.toContain(k.plaintext)
    expect(verifyClientKey(k.plaintext, k.hash)).toBe(true)
    expect(verifyClientKey(k.plaintext + 'x', k.hash)).toBe(false)
    expect(verifyClientKey(generateClientKey().plaintext, k.hash)).toBe(false)
  })
  it('the hash depends on the pepper', () => {
    const k = generateClientKey()
    process.env.SITE_API_KEY_PEPPER = 'another'
    expect(hashClientKey(k.plaintext)).not.toBe(k.hash)
    process.env.SITE_API_KEY_PEPPER = 'test-pepper'
  })
  it('refuses text that is not a key', () => {
    for (const t of [undefined, null, '', 'wbk_', 'whb_site_abcdefghijkl', 'Bearer x', 'wbk_short_x', 'wbk_abcdefgh_' + 'x'.repeat(42)]) expect(parseClientKey(t as string)).toBeNull()
  })
  it('keys are unique', () => {
    expect(new Set(Array.from({ length: 200 }, () => generateClientKey().plaintext)).size).toBe(200)
  })
})

describe('scopes', () => {
  it('parses the five parts and keeps a ":" inside the route', () => {
    expect(parseGatewayScope('gateway:call:Shop:get:orders.json')).toEqual({ endpoint: 'Shop', method: 'GET', route: 'orders.json' })
    expect(parseGatewayScope('gateway:call:Shop:*:*')).toEqual({ endpoint: 'Shop', method: '*', route: '*' })
    expect(parseGatewayScope('gateway:call:Shop:GET:a:b')).toEqual({ endpoint: 'Shop', method: 'GET', route: 'a:b' })
  })
  it('refuses a wildcard endpoint, an unknown method, an empty route and tricky routes', () => {
    for (const bad of ['gateway:call:*:GET:x', 'gateway:call::GET:x', 'gateway:call:Shop:FETCH:x', 'gateway:call:Shop:GET:', 'gateway:call:Shop:GET:../x', 'gateway:call:Shop:GET:/x', 'gateway:call:Shop:GET:a*b', 'gateway:read:Shop:GET:x', 'data:read:x']) {
      expect('error' in parseGatewayScope(bad), bad).toBe(true)
    }
  })
  it('accepts any method for a key client (a key is held by a server)', () => {
    expect(validateClientScopes(['gateway:call:Shop:*:*', 'gateway:call:Shop:POST:orders.json']).ok).toBe(true)
    expect(validateClientScopes(['gateway:call:Shop:FETCH:x']).ok).toBe(false)
  })
  it('normalises and de-duplicates, and bounds the list', () => {
    const r = validateClientScopes(['gateway:call:Shop:get:a', 'gateway:call:Shop:GET:a'])
    expect(r).toEqual({ ok: true, scopes: ['gateway:call:Shop:GET:a'] })
    expect(validateClientScopes(Array.from({ length: 201 }, (_, i) => `gateway:call:S:GET:r${i}`)).ok).toBe(false)
    expect(validateClientScopes('x').ok).toBe(false)
  })
  it('allows exactly what a scope names', () => {
    const s = ['gateway:call:Shop:GET:orders.json', 'gateway:call:Shop:GET:customers/{id}', 'gateway:call:Crm:POST:contacts', 'gateway:call:Cat:GET:items/*', 'gateway:call:All:*:*']
    expect(scopeAllows(s, 'Shop', 'GET', 'orders.json')).toBe(true)
    expect(scopeAllows(s, 'Shop', 'get', '/orders.json')).toBe(true)
    expect(scopeAllows(s, 'Shop', 'POST', 'orders.json')).toBe(false)
    expect(scopeAllows(s, 'Shop', 'GET', 'products.json')).toBe(false)
    expect(scopeAllows(s, 'Shop', 'GET', 'customers/{id}')).toBe(true)
    expect(scopeAllows(s, 'Other', 'GET', 'orders.json')).toBe(false)
    expect(scopeAllows(s, 'Crm', 'POST', 'contacts')).toBe(true)
    expect(scopeAllows(s, 'Crm', 'GET', 'contacts')).toBe(false)
    expect(scopeAllows(s, 'Cat', 'GET', 'items/list')).toBe(true)
    expect(scopeAllows(s, 'Cat', 'GET', 'items')).toBe(false)
    expect(scopeAllows(s, 'Cat', 'GET', 'itemsx/list')).toBe(false)
    expect(scopeAllows(s, 'All', 'DELETE', 'anything/at/all')).toBe(true)
    expect(scopeAllows([], 'Shop', 'GET', 'orders.json')).toBe(false)
    expect(scopeAllows(['garbage'], 'Shop', 'GET', 'orders.json')).toBe(false)
  })
})

describe('matching a request path to a route', () => {
  const routes = [
    { path: 'customers/{id}', method: 'GET' },
    { path: 'customers/me', method: 'GET' },
    { path: 'customers/{id}/orders', method: 'GET' },
    { path: 'orders.json', method: 'GET' },
    { path: '/contacts', method: 'POST' },
    { path: 'x/{a}', method: 'GET' },
    { path: '{b}/y', method: 'GET' },
  ]
  it('takes parameters from the path and prefers the more specific route', () => {
    expect(matchRoute(routes, 'GET', 'customers/42')).toMatchObject({ route: { path: 'customers/{id}' }, params: { id: '42' } })
    expect(matchRoute(routes, 'GET', 'customers/me')).toMatchObject({ route: { path: 'customers/me' }, params: {} })
    expect(matchRoute(routes, 'GET', 'customers/42/orders')).toMatchObject({ params: { id: '42' } })
  })
  it('does not match another method, another length, or a different literal', () => {
    expect(matchRoute(routes, 'POST', 'orders.json')).toBe('none')
    expect(matchRoute(routes, 'GET', 'customers')).toBe('none')
    expect(matchRoute(routes, 'GET', 'customers/1/2/3')).toBe('none')
    expect(matchRoute(routes, 'GET', 'order.json')).toBe('none')
    expect(matchRoute(routes, 'POST', 'contacts')).toMatchObject({ route: { path: '/contacts' } })
  })
  it('refuses an ambiguous match instead of guessing', () => {
    expect(matchRoute(routes, 'GET', 'x/y')).toBe('ambiguous')
  })
  it('a tie can be resolved by taking the first one listed', () => {
    expect(matchRoute(routes, 'GET', 'x/y', 'first')).toMatchObject({ route: { path: 'x/{a}' } })
  })
  it('a parameter never takes a slash, and relative or empty segments are refused before matching', () => {
    expect(matchRoute(routes, 'GET', 'customers/a/b')).toBe('none')
    for (const p of ['', '..', 'a/../b', './a', 'a//b', 'a/', '/a', 'a\\b', 'a?b=1', 'a#b', 'a\u0000b']) expect(unsafePathReason(p), JSON.stringify(p)).not.toBeNull()
    expect(unsafePathReason('customers/42')).toBeNull()
    expect(unsafePathReason('a/' + 'b'.repeat(600))).not.toBeNull()
  })
  it('the scope follows the matched route, not the path asked for', () => {
    const m = matchRoute(routes, 'GET', 'customers/42') as { route: { path: string } }
    expect(scopeAllows(['gateway:call:Shop:GET:customers/{id}'], 'Shop', 'GET', m.route.path)).toBe(true)
    expect(scopeAllows(['gateway:call:Shop:GET:customers/42'], 'Shop', 'GET', m.route.path)).toBe(false)
  })
})

describe('address allow-list', () => {
  it('is open when empty and exact or CIDR otherwise', () => {
    expect(ipAllowed('1.2.3.4', null)).toBe(true)
    expect(ipAllowed('1.2.3.4', [])).toBe(true)
    expect(ipAllowed('1.2.3.4', ['1.2.3.4'])).toBe(true)
    expect(ipAllowed('::ffff:1.2.3.4', ['1.2.3.4'])).toBe(true)
    expect(ipAllowed('10.1.2.3', ['10.0.0.0/8'])).toBe(true)
    expect(ipAllowed('11.1.2.3', ['10.0.0.0/8'])).toBe(false)
    expect(ipAllowed('192.168.1.77', ['192.168.1.64/26'])).toBe(true)
    expect(ipAllowed('192.168.1.130', ['192.168.1.64/26'])).toBe(false)
    expect(ipAllowed('2001:db8::1', ['2001:db8::1'])).toBe(true)
    expect(ipAllowed('2001:db8::2', ['10.0.0.0/8'])).toBe(false)
  })
})
