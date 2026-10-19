import { describe, expect, it } from 'vitest';
import {
  buildMultipart, CdnMirrorError, cloudflareDeliveryUrl, cloudflareRefusal, getCdnProvider, missingCdnFields, mirrorToCloudflareImages, testCloudflareImages, validateCdnSettings,
} from './cdn-providers.js';

const ACCOUNT = 'a'.repeat(32);
const ROUTE = '11111111-1111-4111-8111-111111111111';

describe('settings of a provider', () => {
  it('knows the two providers and which fields are secret', () => {
    expect(getCdnProvider('cloudinary')?.fields.map((f) => f.name)).toEqual(['gatewayRouteId', 'uploadPreset']);
    expect(getCdnProvider('cloudflare-images')?.fields.filter((f) => f.secret).map((f) => f.name)).toEqual(['apiToken']);
    expect(getCdnProvider('imgix')).toBeUndefined();
  });
  it('validates Cloudinary: a route id, an optional preset; the preset is not a field of the other provider', () => {
    expect(validateCdnSettings({ provider: 'cloudinary', config: { gatewayRouteId: ROUTE, uploadPreset: ' p ' } })).toEqual({ ok: true, provider: 'cloudinary', config: { gatewayRouteId: ROUTE, uploadPreset: 'p' }, secrets: {} });
    expect(validateCdnSettings({ provider: 'cloudinary', config: { gatewayRouteId: 'nope' } })).toMatchObject({ ok: false });
    const cf = validateCdnSettings({ provider: 'cloudflare-images', config: { accountId: ACCOUNT, uploadPreset: 'ignored' }, secrets: { apiToken: 'tok' } });
    expect(cf).toEqual({ ok: true, provider: 'cloudflare-images', config: { accountId: ACCOUNT }, secrets: { apiToken: 'tok' } });
  });
  it('validates Cloudflare: 32 hex account id, a plain variant name, a secret only from the secrets', () => {
    for (const config of [{ accountId: 'short' }, { accountId: ACCOUNT, variant: 'a b' }, { accountId: ACCOUNT, variant: 'x'.repeat(100) }]) {
      expect(validateCdnSettings({ provider: 'cloudflare-images', config }), JSON.stringify(config)).toMatchObject({ ok: false });
    }
    // a token sent as config is not taken: it is not a config field
    expect(validateCdnSettings({ provider: 'cloudflare-images', config: { accountId: ACCOUNT, apiToken: 'leak' } })).toMatchObject({ ok: true, config: { accountId: ACCOUNT }, secrets: {} });
    expect(validateCdnSettings({ provider: 'x' })).toMatchObject({ ok: false });
    // an API address: https only, no credentials; http only when the server allows it
    const base = (apiBase: string, env: NodeJS.ProcessEnv = {}) => validateCdnSettings({ provider: 'cloudflare-images', config: { accountId: ACCOUNT, apiBase } }, env).ok;
    expect(base('https://cf.example.com/client/v4')).toBe(true);
    for (const bad of ['http://cf.example.com', 'ftp://x', 'https://u:p@x.com', 'https://x.com/?a=1', 'nope']) expect(base(bad), bad).toBe(false);
    expect(base('http://10.0.0.5:8080/client/v4', { CDN_ALLOW_HTTP: 'true' })).toBe(true);
    expect(validateCdnSettings({ provider: 'cloudflare-images', config: { accountId: 5 } })).toMatchObject({ ok: false });
  });
  it('says what is still missing', () => {
    expect(missingCdnFields('cloudinary', {}, {})).toEqual(['gatewayRouteId']);
    expect(missingCdnFields('cloudinary', { gatewayRouteId: ROUTE }, {})).toEqual([]);
    expect(missingCdnFields('cloudflare-images', { accountId: ACCOUNT }, {})).toEqual(['apiToken']);
    expect(missingCdnFields('cloudflare-images', { accountId: ACCOUNT }, { apiToken: true })).toEqual([]);
  });
});

describe('what Cloudflare Images takes', () => {
  it('refuses a type it does not take and an image over 10 MB', () => {
    expect(cloudflareRefusal('image/png', 10)).toBeNull();
    expect(cloudflareRefusal('image/svg+xml', 10)).toBeNull();
    expect(cloudflareRefusal('application/pdf', 10)).toMatch(/not application\/pdf/);
    expect(cloudflareRefusal('image/png', 11 * 1024 * 1024)).toMatch(/up to 10 MB/);
  });
  it('picks the delivery URL of the variant, or the first one', () => {
    const v = ['https://imagedelivery.net/h/id/thumb', 'https://imagedelivery.net/h/id/public'];
    expect(cloudflareDeliveryUrl(v, 'public')).toBe(v[1]);
    expect(cloudflareDeliveryUrl(v, 'hero')).toBe(v[0]);
    expect(cloudflareDeliveryUrl([], 'public')).toBeNull();
    expect(cloudflareDeliveryUrl(undefined, 'public')).toBeNull();
  });
});

describe('multipart', () => {
  it('puts the id and the file with its name and type, and ends with the closing boundary; the bytes are intact', () => {
    const bytes = Buffer.from([0, 255, 13, 10, 45, 45, 1, 2]);
    const { body, contentType } = buildMultipart([{ name: 'id', value: 'abc' }, { name: 'file', value: bytes, filename: 'a"b.png', contentType: 'image/png' }], 'BOUND');
    expect(contentType).toBe('multipart/form-data; boundary=BOUND');
    const text = body.toString('latin1');
    expect(text.startsWith('--BOUND\r\nContent-Disposition: form-data; name="id"\r\n\r\nabc\r\n--BOUND\r\n')).toBe(true);
    expect(text).toContain('name="file"; filename="a_b.png"\r\nContent-Type: image/png\r\n\r\n');
    expect(text.endsWith('\r\n--BOUND--\r\n')).toBe(true);
    expect(body.includes(bytes)).toBe(true);
  });
});

type Call = { url: string; method: string; headers: Record<string, string>; body?: Buffer };
function fake(answers: { status: number; body: unknown }[]) {
  const calls: Call[] = [];
  const fetch = async (url: string, init: { method: string; headers: Record<string, string>; body?: Buffer }) => {
    calls.push({ url, ...init });
    const a = answers.shift() ?? { status: 500, body: null };
    return { status: a.status, json: async () => a.body };
  };
  return { calls, deps: { fetch, apiBase: 'https://cf.test/client/v4' } };
}
const input = { accountId: ACCOUNT, apiToken: 'tok', assetId: '22222222-2222-4222-8222-222222222222', filename: 'a.png', mimeType: 'image/png', bytes: Buffer.from('png-bytes') };
const ok = { success: true, errors: [], result: { id: input.assetId, variants: [`https://imagedelivery.net/h/${input.assetId}/public`] } };

describe('mirroring to Cloudflare Images', () => {
  it('uploads the bytes with the token and the asset id, and returns the delivery URL', async () => {
    const { calls, deps } = fake([{ status: 200, body: ok }]);
    const r = await mirrorToCloudflareImages(input, deps);
    expect(r).toEqual({ url: `https://imagedelivery.net/h/${input.assetId}/public`, providerAssetId: input.assetId });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: `https://cf.test/client/v4/accounts/${ACCOUNT}/images/v1`, method: 'POST' });
    expect(calls[0].headers.Authorization).toBe('Bearer tok');
    expect(calls[0].headers['Content-Type']).toMatch(/^multipart\/form-data; boundary=/);
    expect(calls[0].body!.toString('latin1')).toContain(`name="id"\r\n\r\n${input.assetId}`);
    expect(calls[0].body!.includes(Buffer.from('png-bytes'))).toBe(true);
  });
  it('an image that is already there is deleted and sent again', async () => {
    const { calls, deps } = fake([{ status: 409, body: { success: false, errors: [{ code: 5409, message: 'Resource already exists' }] } }, { status: 200, body: { success: true } }, { status: 200, body: ok }]);
    const r = await mirrorToCloudflareImages(input, deps);
    expect(r.url).toContain(input.assetId);
    expect(calls.map((c) => c.method)).toEqual(['POST', 'DELETE', 'POST']);
    expect(calls[1].url).toBe(`https://cf.test/client/v4/accounts/${ACCOUNT}/images/v1/${input.assetId}`);
  });
  it('says what Cloudflare said when it refuses, and refuses by itself what it cannot take', async () => {
    const err = await mirrorToCloudflareImages(input, fake([{ status: 403, body: { success: false, errors: [{ code: 10000, message: 'Authentication error' }] } }]).deps).catch((e) => e);
    expect(err).toBeInstanceOf(CdnMirrorError);
    expect(err.message).toBe('10000 Authentication error');
    expect(err.status).toBe(502);
    const { calls, deps } = fake([]);
    const pdf = await mirrorToCloudflareImages({ ...input, mimeType: 'application/pdf' }, deps).catch((e) => e);
    expect(pdf).toMatchObject({ status: 415 });
    expect(calls).toHaveLength(0);
    const noUrl = await mirrorToCloudflareImages(input, fake([{ status: 200, body: { success: true, result: { id: 'x' } } }]).deps).catch((e) => e);
    expect(noUrl.message).toMatch(/did not return a delivery URL/);
  });
  it('tests the account and the token with a read call', async () => {
    const good = fake([{ status: 200, body: { success: true, result: { count: {} } } }]);
    expect(await testCloudflareImages(ACCOUNT, 'tok', good.deps)).toEqual({ ok: true });
    expect(good.calls[0]).toMatchObject({ method: 'GET', url: `https://cf.test/client/v4/accounts/${ACCOUNT}/images/v1/stats` });
    expect(await testCloudflareImages(ACCOUNT, 'bad', fake([{ status: 401, body: { success: false, errors: [{ code: 9109, message: 'Invalid token' }] } }]).deps)).toEqual({ ok: false, error: '9109 Invalid token' });
    const down = { fetch: async () => { throw new Error('ECONNREFUSED'); } };
    expect(await testCloudflareImages(ACCOUNT, 'tok', down)).toMatchObject({ ok: false, error: expect.stringContaining('ECONNREFUSED') });
  });
});
