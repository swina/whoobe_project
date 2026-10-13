// Identity-provider tokens for API clients (docs/plans/api-gateway/client-access-hub.md, 12 and 14): the registration, how claims become
// scopes (packages/core/src/gateway/client-jwt.ts) and the verification (apps/gateway/src/jwt-verify.ts), with generated keys and a fake
// identity provider. Nothing here talks to a network.
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { generateKeyPair, exportJWK, SignJWT, type KeyLike } from '../../../apps/gateway/node_modules/jose'
import { validateJwtConfig, claimValues, requiredClaimsMet, scopesForClaims, type JwtClientConfig } from '../../../packages/core/src/gateway/client-jwt'

vi.mock('@whoobe-cms/core/server', () => ({ safeFetch: async () => { throw new Error('no network in tests') } }))
const { createJwtVerifier, JwtRejected } = await import('../../../apps/gateway/src/jwt-verify')

const ISS = 'https://idp.example.com/realms/acme'
const AUD = 'whoobe-api'
let kp: { publicKey: KeyLike; privateKey: KeyLike }
let other: { publicKey: KeyLike; privateKey: KeyLike }
let jwks: { keys: unknown[] }
let docs: Record<string, unknown>
let fetched: string[]
let clock: number

const cfg = (over: Partial<JwtClientConfig> = {}): JwtClientConfig => ({ issuer: ISS, audience: [AUD], algorithms: ['RS256'], ...over })
const sign = async (claims: Record<string, unknown> = {}, o: { key?: KeyLike; alg?: string; kid?: string; iss?: string | null; aud?: string | null; exp?: number | null; nbf?: number } = {}) => {
  let j = new SignJWT({ sub: 'user-1', ...claims }).setProtectedHeader({ alg: o.alg ?? 'RS256', kid: o.kid ?? 'k1' })
  if (o.iss !== null) j = j.setIssuer(o.iss ?? ISS)
  if (o.aud !== null) j = j.setAudience(o.aud ?? AUD)
  if (o.exp !== null) j = j.setExpirationTime(o.exp ?? Math.floor(clock / 1000) + 300)
  if (o.nbf) j = j.setNotBefore(o.nbf)
  return j.sign(o.key ?? kp.privateKey)
}
const verifier = (extra: Record<string, unknown> = {}) => createJwtVerifier({
  now: () => clock,
  fetchJson: async (url) => { fetched.push(url); if (!(url in docs)) throw new Error('404'); return docs[url] },
  ...extra,
})
const reason = async (p: Promise<unknown>) => { try { await p; return 'accepted' } catch (e) { return e instanceof JwtRejected ? e.reason : `other:${(e as Error).message}` } }

beforeAll(async () => {
  kp = await generateKeyPair('RS256', { extractable: true })
  other = await generateKeyPair('RS256', { extractable: true })
  const pub = { ...(await exportJWK(kp.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }
  jwks = { keys: [pub] }
})
const reset = () => {
  clock = Date.now(); fetched = []
  docs = { [`${ISS}/.well-known/openid-configuration`]: { issuer: ISS, jwks_uri: `${ISS}/certs` }, [`${ISS}/certs`]: jwks }
}

describe('registration of an identity provider', () => {
  const scopes = ['gateway:call:Shop:GET:orders.json', 'gateway:call:Shop:POST:orders.json']
  it('accepts a normal registration and fills in algorithms', () => {
    const r = validateJwtConfig({ issuer: ISS, audience: AUD }, scopes)
    expect(r).toEqual({ ok: true, config: { issuer: ISS, audience: [AUD], algorithms: ['RS256', 'ES256'] } })
  })
  it('keeps a trailing slash of the issuer (some providers have one)', () => {
    expect(validateJwtConfig({ issuer: 'https://t.auth0.com/', audience: 'a' }, scopes)).toMatchObject({ ok: true, config: { issuer: 'https://t.auth0.com/' } })
  })
  it('refuses http unless a local provider is allowed, and refuses no audience, HS256 and none', () => {
    expect(validateJwtConfig({ issuer: 'http://localhost:8080/realms/x', audience: 'a' }, scopes).ok).toBe(false)
    expect(validateJwtConfig({ issuer: 'http://localhost:8080/realms/x', audience: 'a' }, scopes, { allowInsecureHttp: true }).ok).toBe(true)
    expect(validateJwtConfig({ issuer: ISS }, scopes).ok).toBe(false)
    expect(validateJwtConfig({ issuer: ISS, audience: [] }, scopes).ok).toBe(false)
    for (const bad of ['HS256', 'none', 'HS512']) expect(validateJwtConfig({ issuer: ISS, audience: 'a', algorithms: [bad] }, scopes).ok, bad).toBe(false)
    expect(validateJwtConfig({ issuer: 'https://u:p@x.com', audience: 'a' }, scopes).ok).toBe(false)
    expect(validateJwtConfig(null, scopes).ok).toBe(false)
  })
  it('claim rules may only grant scopes the client has', () => {
    const ok = validateJwtConfig({ issuer: ISS, audience: 'a', claimScopes: [{ claim: 'groups', value: 'readers', scopes: ['gateway:call:Shop:GET:orders.json'] }] }, scopes)
    expect(ok.ok).toBe(true)
    const bad = validateJwtConfig({ issuer: ISS, audience: 'a', claimScopes: [{ claim: 'groups', value: 'x', scopes: ['gateway:call:Other:GET:y'] }] }, scopes)
    expect(bad).toMatchObject({ ok: false })
    expect(validateJwtConfig({ issuer: ISS, audience: 'a', requiredClaims: [{ claim: 'bad claim!', value: 'x' }] }, scopes).ok).toBe(false)
    expect(validateJwtConfig({ issuer: ISS, audience: 'a', subjectRateLimitRps: 0 }, scopes).ok).toBe(false)
  })
})

describe('claims become scopes', () => {
  const clientScopes = ['gateway:call:Shop:GET:orders.json', 'gateway:call:Shop:POST:orders.json']
  const config = cfg({ claimScopes: [
    { claim: 'realm_access.roles', value: 'orders-reader', scopes: [clientScopes[0]] },
    { claim: 'realm_access.roles', value: 'orders-admin', scopes: clientScopes },
    { claim: 'scope', value: 'orders:write', scopes: [clientScopes[1]] },
  ] })
  it('reads texts, lists, nested paths and space separated scope claims', () => {
    expect(claimValues({ a: 'x y' }, 'a')).toEqual(['x y', 'x', 'y'])
    expect(claimValues({ g: ['a', 'b', 3] }, 'g')).toEqual(['a', 'b'])
    expect(claimValues({ realm_access: { roles: ['r'] } }, 'realm_access.roles')).toEqual(['r'])
    expect(claimValues({ 'https://x.io/roles': ['r'] }, 'https://x.io/roles')).toEqual(['r'])
    expect(claimValues({ a: 1 }, 'b')).toEqual([])
    expect(claimValues({ a: { b: 1 } }, 'a.c.d')).toEqual([])
    expect(claimValues({ __proto__: { x: 'y' } } as never, 'x')).toEqual([])
  })
  it('a reader gets reads, an admin gets all, an unknown user gets nothing', () => {
    expect(scopesForClaims(config, clientScopes, { realm_access: { roles: ['orders-reader'] } })).toEqual([clientScopes[0]])
    expect(scopesForClaims(config, clientScopes, { realm_access: { roles: ['orders-admin'] } }).sort()).toEqual([...clientScopes].sort())
    expect(scopesForClaims(config, clientScopes, { scope: 'openid orders:write' })).toEqual([clientScopes[1]])
    expect(scopesForClaims(config, clientScopes, { realm_access: { roles: ['other'] } })).toEqual([])
  })
  it('without rules every valid token gets the client scopes, and a rule never reaches past them', () => {
    expect(scopesForClaims(cfg(), clientScopes, {})).toEqual(clientScopes)
    const narrowed = scopesForClaims(config, [clientScopes[0]], { realm_access: { roles: ['orders-admin'] } })
    expect(narrowed).toEqual([clientScopes[0]])
  })
  it('required claims must all be present', () => {
    const c = cfg({ requiredClaims: [{ claim: 'groups', value: 'staff' }, { claim: 'email_verified', value: 'true' }] })
    expect(requiredClaimsMet(c, { groups: ['staff'], email_verified: true })).toBe(true)
    expect(requiredClaimsMet(c, { groups: ['staff'] })).toBe(false)
    expect(requiredClaimsMet(cfg(), {})).toBe(true)
  })
})

describe('verification of a token', () => {
  it('accepts a good token and finds the keys through discovery', async () => {
    reset()
    const v = verifier()
    const out = await v.verify(await sign({ groups: ['a'] }), cfg())
    expect(out.subject).toBe('user-1')
    expect(fetched).toEqual([`${ISS}/.well-known/openid-configuration`, `${ISS}/certs`])
  })
  it('uses the JWKS address of the registration when there is one, and caches the keys', async () => {
    reset()
    docs['https://keys.example.com/jwks'] = jwks
    const v = verifier()
    const c = cfg({ jwksUri: 'https://keys.example.com/jwks' })
    await v.verify(await sign(), c); await v.verify(await sign(), c)
    expect(fetched).toEqual(['https://keys.example.com/jwks'])
  })
  it('refreshes the keys after the cache has expired', async () => {
    reset()
    const v = verifier(); await v.verify(await sign(), cfg())
    clock += 11 * 60_000
    await v.verify(await sign(), cfg())
    expect(fetched.filter((u) => u.endsWith('/certs')).length).toBe(2)
  })
  it('refuses an expired token, with 60 seconds of tolerance', async () => {
    reset(); const v = verifier()
    expect(await reason(v.verify(await sign({}, { exp: Math.floor(clock / 1000) - 30 }), cfg()))).toBe('accepted')
    expect(await reason(v.verify(await sign({}, { exp: Math.floor(clock / 1000) - 120 }), cfg()))).toBe('expired')
  })
  it('refuses a token that is not valid yet', async () => {
    reset(); const v = verifier()
    expect(await reason(v.verify(await sign({}, { nbf: Math.floor(clock / 1000) + 3600 }), cfg()))).toBe('not_yet_valid')
  })
  it('refuses another issuer, another audience, and no expiry', async () => {
    reset(); const v = verifier()
    expect(await reason(v.verify(await sign({}, { iss: 'https://evil.example.com' }), cfg()))).toBe('issuer')
    expect(await reason(v.verify(await sign({}, { aud: 'someone-else' }), cfg()))).toBe('audience')
    expect(await reason(v.verify(await sign({}, { aud: null }), cfg()))).toBe('audience')
    expect(await reason(v.verify(await sign({}, { exp: null }), cfg()))).toBe('claims')
  })
  it('accepts any of several audiences', async () => {
    reset(); const v = verifier()
    expect(await reason(v.verify(await sign({}, { aud: 'b' }), cfg({ audience: ['a', 'b'] })))).toBe('accepted')
  })
  it('refuses a token signed with another key, and a changed payload', async () => {
    reset(); const v = verifier()
    expect(await reason(v.verify(await sign({}, { key: other.privateKey }), cfg()))).toBe('signature')
    const t = (await sign()).split('.')
    const forged = `${t[0]}.${Buffer.from(JSON.stringify({ sub: 'admin', iss: ISS, aud: AUD, exp: Math.floor(clock / 1000) + 300 })).toString('base64url')}.${t[2]}`
    expect(await reason(v.verify(forged, cfg()))).toBe('signature')
  })
  it('refuses alg none', async () => {
    reset(); const v = verifier()
    const h = Buffer.from(JSON.stringify({ alg: 'none', kid: 'k1' })).toString('base64url')
    const p = Buffer.from(JSON.stringify({ sub: 'x', iss: ISS, aud: AUD, exp: Math.floor(clock / 1000) + 300 })).toString('base64url')
    expect(await reason(v.verify(`${h}.${p}.`, cfg()))).toBe('algorithm')
    expect(await reason(v.verify(`${h}.${p}.abc`, cfg()))).toBe('algorithm')
  })
  it('refuses algorithm confusion: HS256 signed with the public key as the secret', async () => {
    reset(); const v = verifier()
    const pem = JSON.stringify(jwks.keys[0])
    const hs = await new SignJWT({ sub: 'x' }).setProtectedHeader({ alg: 'HS256', kid: 'k1' }).setIssuer(ISS).setAudience(AUD).setExpirationTime('5m').sign(new TextEncoder().encode(pem))
    expect(await reason(v.verify(hs, cfg()))).toBe('algorithm')
    expect(await reason(v.verify(hs, cfg({ algorithms: ['RS256', 'ES256'] })))).toBe('algorithm')
  })
  it('refuses an algorithm the client did not list, even if the key could verify it', async () => {
    reset(); const v = verifier()
    expect(await reason(v.verify(await sign(), cfg({ algorithms: ['ES256'] })))).toBe('algorithm')
  })
  it('refuses a token made for another application of the same provider (azp)', async () => {
    reset(); const v = verifier()
    const c = cfg({ authorizedParty: 'mobile-app' })
    expect(await reason(v.verify(await sign({ azp: 'other-app' }), c))).toBe('authorized_party')
    expect(await reason(v.verify(await sign({}), c))).toBe('authorized_party')
    expect(await reason(v.verify(await sign({ azp: 'mobile-app' }), c))).toBe('accepted')
    expect(await reason(v.verify(await sign({ client_id: 'mobile-app' }), c))).toBe('accepted')
  })
  it('refuses a token without a subject', async () => {
    reset(); const v = verifier()
    const t = await new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(ISS).setAudience(AUD).setExpirationTime('5m').sign(kp.privateKey)
    expect(await reason(v.verify(t, cfg()))).toBe('claims')
  })
  it('an unknown key id triggers one refresh, not more often than every 30 seconds', async () => {
    reset(); const v = verifier()
    await v.verify(await sign(), cfg())
    // the provider rotates: a new key appears, the cache is old enough to look again
    const kp2 = await generateKeyPair('RS256', { extractable: true })
    jwks.keys = [...jwks.keys, { ...(await exportJWK(kp2.publicKey)), kid: 'k2', alg: 'RS256' }]
    clock += 31_000
    expect(await reason(v.verify(await sign({}, { key: kp2.privateKey, kid: 'k2' }), cfg()))).toBe('accepted')
    // a token with a kid that does not exist: refused, and a flood of them does not flood the provider
    const before = fetched.length
    for (let i = 0; i < 5; i++) expect(await reason(v.verify(await sign({}, { kid: `ghost${i}` }), cfg()))).toBe('unknown_key')
    expect(fetched.length - before).toBeLessThanOrEqual(1)
    jwks.keys = jwks.keys.slice(0, 1)
  })
  it('refuses when the provider cannot be reached or its documents are wrong', async () => {
    reset(); docs = {}
    expect(await reason(verifier().verify(await sign(), cfg()))).toBe('no_keys')
    reset(); docs[`${ISS}/.well-known/openid-configuration`] = { issuer: 'https://other.example.com', jwks_uri: `${ISS}/certs` }
    expect(await reason(verifier().verify(await sign(), cfg()))).toBe('no_keys')       // discovery of another issuer
    reset(); docs[`${ISS}/.well-known/openid-configuration`] = { issuer: ISS, jwks_uri: 'http://insecure.example.com/certs' }
    expect(await reason(verifier().verify(await sign(), cfg()))).toBe('no_keys')       // keys over plain http
    reset(); docs[`${ISS}/certs`] = { keys: [] }
    expect(await reason(verifier().verify(await sign(), cfg()))).toBe('no_keys')
  })
  it('refuses text that is not a token, and one that is too long', async () => {
    reset(); const v = verifier()
    for (const t of ['', 'abc', 'a.b', 'a.b.c.d', '....', 'x'.repeat(9000)]) expect(await reason(v.verify(t, cfg())), t.slice(0, 10)).toBe('malformed')
  })
})
