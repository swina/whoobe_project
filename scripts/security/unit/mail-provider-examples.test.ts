// The mail provider recipes in examples/mail-providers (not part of the distribution): each must be accepted by the
// loader and produce the request its service documents. Nothing is sent.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateProvider, type MailProviderDefinition } from '../../../packages/core/src/mail/providers'
import { buildProviderRequest, sendViaHttpProvider, MailProviderError, type MailMessage } from '../../../packages/core/src/mail/http-transport'

const dir = join(__dirname, '..', '..', '..', 'examples', 'mail-providers')
const load = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as MailProviderDefinition
const msg = (over: Partial<MailMessage> = {}): MailMessage => ({
  to: 'visitor@example.org', subject: 'Hello', html: '<p>Hi</p>', from: 'noreply@mail.example.com', fromName: 'Example', messageId: '9b2c0a54-0000-4000-8000-000000000001', ...over,
})
const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('examples/mail-providers/resend.json', () => {
  const def = load('resend.json')
  const config = { apiKey: 're_test_supersecretkey' }

  it('is a valid provider definition', () => {
    expect(validateProvider(def)).toBeNull()
  })

  it('sends one POST to the documented endpoint with a bearer key and the message id as the idempotency key', () => {
    const r = buildProviderRequest(def, config, msg())
    expect(r.method).toBe('POST')
    expect(r.url).toBe('https://api.resend.com/emails')
    expect(r.headers.Authorization).toBe('Bearer re_test_supersecretkey')
    expect(r.headers['Idempotency-Key']).toBe('9b2c0a54-0000-4000-8000-000000000001')
    expect(JSON.parse(r.body!)).toEqual({ from: 'noreply@mail.example.com', to: ['visitor@example.org'], subject: 'Hello', html: '<p>Hi</p>' })
  })

  it('sends the address only, so a message without a display name is never refused for its sender', () => {
    for (const fromName of ['', undefined, 'Example']) {
      expect(JSON.parse(buildProviderRequest(def, config, msg({ fromName })).body!).from).toBe('noreply@mail.example.com')
    }
  })

  it('carries copies, blind copies, reply-to and a text part when the message has them', () => {
    const body = JSON.parse(buildProviderRequest(def, config, msg({ cc: ['a@example.org'], bcc: ['b@example.org', 'c@example.org'], replyTo: 'help@example.com', text: 'Hi' })).body!)
    expect(body.cc).toEqual(['a@example.org'])
    expect(body.bcc).toEqual(['b@example.org', 'c@example.org'])
    expect(body.reply_to).toBe('help@example.com')
    expect(body.text).toBe('Hi')
  })

  it('refuses a message without the key, and never puts the key in an error', async () => {
    expect(() => buildProviderRequest(def, {}, msg())).toThrow(MailProviderError)
    const fetchImpl = async () => answer(403, { statusCode: 403, name: 'validation_error', message: 'The mail.example.com domain is not verified.' })
    const err = await sendViaHttpProvider(def, config, msg(), { fetchImpl }).catch((e) => e)
    expect(String(err.message)).toContain('not verified')
    expect(String(err.message)).not.toContain('re_test_supersecretkey')
  })

  it('reads the message id from the answer', async () => {
    const fetchImpl = async () => answer(200, { id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794' })
    const r = await sendViaHttpProvider(def, config, msg(), { fetchImpl })
    expect(r.reference).toBe('49a3999c-0ce1-4ea6-ab68-afcd6dc2e794')
  })
})
