// A small OpenID Connect provider for the tests of the staff sign-in: discovery, authorization, token and JWKS, with RS256 keys it
// generates. `tamper` makes the next ID tokens wrong in one specific way, to prove each check of core-api refuses them.
import { createServer, type Server } from 'node:http'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { generateKeyPair, exportJWK, SignJWT, type KeyLike } from 'jose'

export type Tamper = 'bad-signature' | 'wrong-audience' | 'wrong-issuer' | 'expired' | 'wrong-nonce' | 'none-alg' | 'no-id-token' | 'wrong-azp' | 'hs256'

export interface MockIdentity { sub: string; email?: string; email_verified?: boolean; name?: string; [claim: string]: unknown }

/** The address of this machine as the containers of the test stack see it (the gateway of their Docker network). */
export function hostForContainers(): string {
  if (process.env.SEC_MOCK_HOST) return process.env.SEC_MOCK_HOST
  try {
    return execFileSync('docker', ['network', 'inspect', 'whoobe-sectest_default', '--format', '{{(index .IPAM.Config 0).Gateway}}'], { encoding: 'utf8' }).trim()
  } catch { return '172.17.0.1' }
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url')

export async function startMockOidc(opts: { clientId: string; clientSecret?: string; host?: string }) {
  const host = opts.host ?? hostForContainers()
  const good = await generateKeyPair('RS256', { extractable: true })
  const evil = await generateKeyPair('RS256', { extractable: true })
  const goodJwk = { ...(await exportJWK(good.publicKey)), kid: 'good', alg: 'RS256', use: 'sig' }
  const codes = new Map<string, { identity: MockIdentity; nonce: string; challenge: string; redirectUri: string; clientId: string }>()
  const state = {
    login: { sub: 'user-1', email: 'user1@idp.test', email_verified: true } as MockIdentity,
    tamper: undefined as Tamper | undefined,
    denyAuthorize: false,
    authorizeRequests: [] as Record<string, string>[],
    tokenRequests: [] as { body: Record<string, string>; authorization?: string }[],
  }
  let issuer = ''

  const sign = async (claims: Record<string, unknown>, key: KeyLike, alg = 'RS256') =>
    new SignJWT(claims).setProtectedHeader({ alg, kid: 'good' }).sign(key)

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', issuer)
    const json = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
    if (url.pathname === '/.well-known/openid-configuration') {
      return json(200, { issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, id_token_signing_alg_values_supported: ['RS256'] })
    }
    if (url.pathname === '/jwks') return json(200, { keys: [goodJwk] })
    if (url.pathname === '/authorize') {
      const q = Object.fromEntries(url.searchParams)
      state.authorizeRequests.push(q)
      const back = new URL(q.redirect_uri)
      if (state.denyAuthorize) { back.searchParams.set('error', 'access_denied'); back.searchParams.set('state', q.state) }
      else {
        const code = b64url(createHash('sha256').update(`${Math.random()}${Date.now()}`).digest()).slice(0, 24)
        codes.set(code, { identity: { ...state.login }, nonce: q.nonce, challenge: q.code_challenge, redirectUri: q.redirect_uri, clientId: q.client_id })
        back.searchParams.set('code', code)
        back.searchParams.set('state', q.state)
      }
      res.writeHead(302, { location: back.toString() }); return res.end()
    }
    if (url.pathname === '/token' && req.method === 'POST') {
      let raw = ''
      for await (const c of req) raw += c
      const body = Object.fromEntries(new URLSearchParams(raw))
      state.tokenRequests.push({ body, authorization: req.headers.authorization })
      const grant = codes.get(body.code)
      const fail = (error: string) => json(400, { error })
      if (!grant || body.grant_type !== 'authorization_code') return fail('invalid_grant')
      codes.delete(body.code)   // a code is single use
      if (body.redirect_uri !== grant.redirectUri) return fail('invalid_grant')
      // PKCE: S256 of the verifier must be the challenge sent to /authorize
      if (!body.code_verifier || b64url(createHash('sha256').update(body.code_verifier).digest()) !== grant.challenge) return fail('invalid_grant')
      if (opts.clientSecret) {
        const basic = /^Basic (.+)$/.exec(req.headers.authorization ?? '')?.[1]
        const [id, secret] = basic ? Buffer.from(basic, 'base64').toString().split(':').map(decodeURIComponent) : []
        if (id !== opts.clientId || secret !== opts.clientSecret) return json(401, { error: 'invalid_client' })
      }
      if (state.tamper === 'no-id-token') return json(200, { access_token: 'x', token_type: 'Bearer' })
      const now = Math.floor(Date.now() / 1000)
      const claims: Record<string, unknown> = {
        ...grant.identity, iss: issuer, aud: opts.clientId, nonce: grant.nonce, iat: now, exp: now + 300,
      }
      let key: KeyLike = good.privateKey
      if (state.tamper === 'wrong-audience') claims.aud = 'another-application'
      if (state.tamper === 'wrong-issuer') claims.iss = 'https://evil.example'
      if (state.tamper === 'expired') { claims.iat = now - 7200; claims.exp = now - 3600 }
      if (state.tamper === 'wrong-nonce') claims.nonce = 'not-the-one'
      if (state.tamper === 'wrong-azp') { claims.aud = [opts.clientId, 'second']; claims.azp = 'second' }
      if (state.tamper === 'bad-signature') key = evil.privateKey
      let idToken: string
      if (state.tamper === 'none-alg') {
        idToken = `${b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}.`
      } else if (state.tamper === 'hs256') {
        // the classic: HMAC with the public key's text as the secret
        const { createHmac } = await import('node:crypto')
        const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: 'good' }))
        const payload = b64url(JSON.stringify(claims))
        idToken = `${head}.${payload}.${createHmac('sha256', JSON.stringify(goodJwk)).update(`${head}.${payload}`).digest('base64url')}`
      } else {
        idToken = await sign(claims, key)
      }
      return json(200, { access_token: 'access-not-kept', refresh_token: 'refresh-not-kept', token_type: 'Bearer', id_token: idToken })
    }
    json(404, { error: 'not found' })
  })

  await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve))
  const port = (server.address() as { port: number }).port
  issuer = `http://${host}:${port}`
  return {
    issuer,
    state,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
