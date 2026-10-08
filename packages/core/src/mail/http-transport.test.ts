import { describe, expect, it } from 'vitest';
import { buildProviderRequest, fillTemplate, MailProviderError, sendViaHttpProvider, type MailMessage } from './http-transport.js';
import { loadMailProviders, type MailProviderDefinition } from './providers.js';

const onesignal = loadMailProviders().find((p) => p.id === 'onesignal')!;
const config = { appId: '11111111-2222-4333-8444-555555555555', apiKey: 'os_v2_app_supersecretkey', senderDomain: 'mail.example.com' };
const msg = (over: Partial<MailMessage> = {}): MailMessage => ({
  to: 'visitor@example.org', subject: 'Hello', html: '<p>Hi</p>', from: 'noreply@mail.example.com', fromName: 'Example', messageId: '9b2c0a54-0000-4000-8000-000000000001', ...over,
});
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('fillTemplate', () => {
  const ctx = { subject: 'S', list: ['a', 'b'], empty: '', none: [], config: { k: 'v' } };
  it('a lone placeholder keeps its type, and the key goes when there is no value', () => {
    expect(fillTemplate({ a: '{{subject}}', b: '{{list}}', c: '{{empty}}', d: '{{none}}', e: '{{missing}}' }, ctx)).toEqual({ a: 'S', b: ['a', 'b'] });
  });
  it('lists spread a list placeholder and drop empty ones', () => {
    expect(fillTemplate(['{{list}}', '{{empty}}', 'x', '{{subject}}'], ctx)).toEqual(['a', 'b', 'x', 'S']);
  });
  it('a placeholder inside text becomes text, nested paths work, literals pass through', () => {
    expect(fillTemplate({ h: 'Key {{config.k}}!', n: 3, t: true, o: { s: '{{subject}}' } }, ctx)).toEqual({ h: 'Key v!', n: 3, t: true, o: { s: 'S' } });
  });
  it('values are not expanded again: what a message contains cannot change the request', () => {
    const out = fillTemplate({ body: '{{html}}', note: 'x {{html}} y' }, { html: '"}, "injected": {{config.k}} <b>{{config.k}}</b>', config: { k: 'SECRET' } }) as Record<string, string>;
    expect(out.body).toBe('"}, "injected": {{config.k}} <b>{{config.k}}</b>');
    expect(out.note).toBe('x "}, "injected": {{config.k}} <b>{{config.k}}</b> y');
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe('OneSignal definition', () => {
  it('builds the request of the documentation from a message', () => {
    const r = buildProviderRequest(onesignal, config, msg({ replyTo: 'support@example.com', bcc: ['copy@example.com'] }));
    expect(r.method).toBe('POST');
    expect(r.url).toBe('https://api.onesignal.com/notifications?c=email');
    expect(r.headers).toEqual({ Authorization: 'Key os_v2_app_supersecretkey', 'Content-Type': 'application/json' });
    expect(JSON.parse(r.body!)).toEqual({
      app_id: config.appId, email_subject: 'Hello', email_body: '<p>Hi</p>', email_to: ['visitor@example.org'],
      email_from_name: 'Example', email_from_address: 'noreply@mail.example.com', email_sender_domain: 'mail.example.com',
      email_reply_to_address: 'support@example.com', email_bcc: ['copy@example.com'],
      include_unsubscribed: true, idempotency_key: '9b2c0a54-0000-4000-8000-000000000001',
    });
  });
  it('leaves out what is empty (no BCC, no reply-to, no sender domain, no display name)', () => {
    const body = JSON.parse(buildProviderRequest(onesignal, { ...config, senderDomain: '' }, msg({ fromName: undefined })).body!);
    for (const k of ['email_bcc', 'email_reply_to_address', 'email_sender_domain', 'email_from_name']) expect(body, k).not.toHaveProperty(k);
  });
  it('wraps a text-only message in HTML that keeps its line breaks, escaped', () => {
    const body = JSON.parse(buildProviderRequest(onesignal, config, msg({ html: '', text: 'line 1\n<b>line 2</b> & more' })).body!);
    expect(body.email_body).toBe('<div style="white-space:pre-wrap">line 1\n&lt;b&gt;line 2&lt;/b&gt; &amp; more</div>');
  });
  it('refuses what the provider cannot do, and what is not configured', () => {
    expect(() => buildProviderRequest(onesignal, config, msg({ cc: 'x@example.com' }))).toThrow(/cannot send a copy/);
    expect(() => buildProviderRequest(onesignal, config, msg({ bcc: ['1', '2', '3', '4', '5', '6'] }))).toThrow(/at most 5 blind copies/);
    expect(() => buildProviderRequest(onesignal, { ...config, apiKey: '' }, msg())).toThrow(/"App API key" is not configured/);
    expect(() => buildProviderRequest(onesignal, { ...config, apiKey: 'a\r\nX-Evil: 1' }, msg())).toThrow(/line break/);
  });
});

describe('sendViaHttpProvider', () => {
  const calls: { url: string; body: string }[] = [];
  const reply = (...responses: Response[]) => {
    calls.length = 0;
    const queue = [...responses];
    return async (url: string, init: { body?: string }) => { calls.push({ url, body: init.body ?? '' }); return queue.shift()!; };
  };

  it('returns the provider\'s id for the message', async () => {
    const r = await sendViaHttpProvider(onesignal, config, msg(), { fetchImpl: reply(json(200, { id: 'abc-123', errors: {} })) });
    expect(r).toEqual({ reference: 'abc-123' });
    expect(calls).toHaveLength(1);
  });

  it('an accepted status with no recipient delivered is a failure, with the provider\'s own words', async () => {
    const fail = sendViaHttpProvider(onesignal, config, msg(), { fetchImpl: reply(json(200, { id: '', errors: ['All included players are not subscribed'] })) });
    await expect(fail).rejects.toThrow('OneSignal: not delivered - All included players are not subscribed');
  });

  it('an error status says its code and the provider\'s reason', async () => {
    await expect(sendViaHttpProvider(onesignal, config, msg(), { fetchImpl: reply(json(403, { errors: ['Email is not available on your plan'] })) }))
      .rejects.toMatchObject({ message: 'OneSignal: HTTP 403 - Email is not available on your plan', status: 403 });
    await expect(sendViaHttpProvider(onesignal, config, msg(), { fetchImpl: reply(new Response('Bad gateway', { status: 502 })) })).rejects.toThrow('OneSignal: HTTP 502 - Bad gateway');
  });

  it('waits for Retry-After on 429 and 503, then succeeds; gives up after the limit', async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => { waits.push(ms); };
    const ok = await sendViaHttpProvider(onesignal, config, msg(), { fetchImpl: reply(json(429, {}, { 'retry-after': '3' }), json(503, {}), json(200, { id: 'z' })), sleep });
    expect(ok.reference).toBe('z');
    expect(waits).toEqual([3000, 1000]);
    expect(new Set(calls.map((c) => JSON.parse(c.body).idempotency_key)).size, 'the same idempotency key on every attempt').toBe(1);
    await expect(sendViaHttpProvider(onesignal, config, msg(), { fetchImpl: reply(json(429, {}), json(429, {}), json(429, {})), sleep })).rejects.toThrow(/HTTP 429/);
    expect(calls).toHaveLength(3);
  });

  it('caps the wait at the definition\'s maximum', async () => {
    const waits: number[] = [];
    await sendViaHttpProvider(onesignal, config, msg(), { fetchImpl: reply(json(429, {}, { 'retry-after': '3600' }), json(200, { id: 'z' })), sleep: async (ms) => { waits.push(ms); } });
    expect(waits).toEqual([10_000]);
  });

  it('never lets the API key out in an error, from the network or from the answer', async () => {
    const boom = sendViaHttpProvider(onesignal, config, msg(), { fetchImpl: async () => { throw new Error('connect failed for Key os_v2_app_supersecretkey'); } });
    await expect(boom).rejects.toThrow(MailProviderError);
    await expect(boom).rejects.not.toThrow(/supersecretkey/);
    const echoed = sendViaHttpProvider(onesignal, config, msg(), { fetchImpl: reply(json(400, { errors: ['bad key os_v2_app_supersecretkey'] })) });
    await expect(echoed).rejects.toThrow('bad key ***');
  });

  it('works for a provider that answers with a plain status and no JSON (reference stays empty)', async () => {
    const plain: MailProviderDefinition = { id: 'plain', label: 'Plain', configFields: [], request: { method: 'POST', url: 'https://mail.example.net/send', body: { to: '{{to}}' } }, success: { status: [202] } };
    expect(await sendViaHttpProvider(plain, {}, msg(), { fetchImpl: async () => new Response(null, { status: 202 }) })).toEqual({ reference: null });
  });
});

describe('parseFromHeader', async () => {
  const { parseFromHeader } = await import('./mailer.js');
  it('splits a display name from the address, and accepts a bare address', () => {
    expect(parseFromHeader('"The Site" <noreply@mail.example.com>')).toEqual({ name: 'The Site', address: 'noreply@mail.example.com' });
    expect(parseFromHeader('Plain Name <a@b.co>')).toEqual({ name: 'Plain Name', address: 'a@b.co' });
    expect(parseFromHeader('<a@b.co>')).toEqual({ name: undefined, address: 'a@b.co' });
    expect(parseFromHeader('  a@b.co ')).toEqual({ address: 'a@b.co' });
  });
});
