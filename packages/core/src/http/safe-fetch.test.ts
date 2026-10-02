import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OutboundBlockedError, blockReason, resolveOutboundPolicy, safeFetch, unmapIPv4 } from './safe-fetch.js';

const prod = (extra: Record<string, string> = {}) => ({ NODE_ENV: 'production', ...extra }) as NodeJS.ProcessEnv;

describe('blockReason', () => {
  const strict = { allowLoopback: false, allowPrivate: false };
  const lax = { allowLoopback: true, allowPrivate: true };
  it('always blocks metadata / link-local / unspecified / multicast / reserved', () => {
    for (const ip of ['169.254.169.254', '169.254.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '240.0.0.1', 'fe80::1', '::', 'ff02::1']) {
      expect(blockReason(ip, lax), ip).not.toBeNull();
    }
  });
  it('blocks loopback unless allowed', () => {
    for (const ip of ['127.0.0.1', '127.1.2.3', '::1']) {
      expect(blockReason(ip, strict), ip).toMatch(/loopback/);
      expect(blockReason(ip, lax)).toBeNull();
    }
  });
  it('blocks private ranges only when asked', () => {
    for (const ip of ['10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.64.0.1', 'fd12:3456::1']) {
      expect(blockReason(ip, strict), ip).toMatch(/private/);
      expect(blockReason(ip, { allowLoopback: false, allowPrivate: true }), ip).toBeNull();
    }
    expect(blockReason('172.32.0.1', strict)).toBeNull();
    expect(blockReason('8.8.8.8', strict)).toBeNull();
    expect(blockReason('2606:4700:4700::1111', strict)).toBeNull();
  });
  it('sees through IPv4-mapped IPv6', () => {
    expect(unmapIPv4('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(blockReason('::ffff:127.0.0.1', strict)).toMatch(/loopback/);
    expect(blockReason('::ffff:7f00:1', strict)).toMatch(/loopback/);
    expect(blockReason('::ffff:169.254.169.254', lax)).not.toBeNull();
  });
});

describe('policy defaults', () => {
  it('loopback is allowed outside production only', () => {
    expect(resolveOutboundPolicy({ NODE_ENV: 'development' } as any).allowLoopback).toBe(true);
    expect(resolveOutboundPolicy(prod()).allowLoopback).toBe(false);
    expect(resolveOutboundPolicy(prod({ OUTBOUND_ALLOW_LOOPBACK: 'true' })).allowLoopback).toBe(true);
    expect(resolveOutboundPolicy(prod({ OUTBOUND_ALLOW_PRIVATE: 'false' })).allowPrivate).toBe(false);
    expect(resolveOutboundPolicy(prod({ OUTBOUND_ALLOW_HOSTS: 'A.lan, b.lan' })).allowHosts).toEqual(['a.lan', 'b.lan']);
  });
});

describe('safeFetch', () => {
  let server: http.Server;
  let base: string;
  let port: number;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/redirect-meta') { res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }); res.end(); return; }
      if (req.url === '/redirect-self') { res.writeHead(302, { location: '/ok' }); res.end(); return; }
      if (req.url === '/big') { res.end('x'.repeat(2000)); return; }
      if (req.url === '/echo') { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => res.end(JSON.stringify({ method: req.method, body: b, host: req.headers.host, auth: req.headers.authorization ?? null }))); return; }
      res.end('ok');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
    base = `http://127.0.0.1:${port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const open = { allowLoopback: true } as const;

  it('fetches when the policy allows the address, following same-host redirects', async () => {
    const r = await safeFetch(`${base}/redirect-self`, {}, open);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('ok');
  });

  it('refuses loopback in a strict policy, for names and literals in every spelling', async () => {
    const strict = { allowLoopback: false };
    for (const u of [`http://127.0.0.1:${port}/`, `http://localhost:${port}/`, `http://2130706433:${port}/`, `http://0x7f000001:${port}/`, `http://0177.0.0.1:${port}/`, `http://127.1:${port}/`, `http://[::1]:${port}/`, `http://[::ffff:127.0.0.1]:${port}/`]) {
      await expect(safeFetch(u, {}, strict), u).rejects.toBeInstanceOf(OutboundBlockedError);
    }
  });

  it('blocks the cloud metadata address even when everything else is allowed', async () => {
    await expect(safeFetch('http://169.254.169.254/latest/meta-data/', {}, { allowLoopback: true, allowPrivate: true })).rejects.toBeInstanceOf(OutboundBlockedError);
  });

  it('re-checks every redirect hop', async () => {
    await expect(safeFetch(`${base}/redirect-meta`, {}, open)).rejects.toThrow(/blocked/);
  });

  it('is not fooled by DNS: a name that resolves to a blocked address is refused, and the checked address is the one used', async () => {
    let calls = 0;
    const lookup = async () => [{ address: calls++ === 0 ? '127.0.0.1' : '93.184.216.34', family: 4 }];
    await expect(safeFetch(`http://rebind.example:${port}/`, {}, { allowLoopback: false, lookup })).rejects.toBeInstanceOf(OutboundBlockedError);
    // allowed resolution: connects to the validated address (127.0.0.1) although the name is fake
    const ok = await safeFetch(`http://fake.example:${port}/`, {}, { allowLoopback: true, lookup: async () => [{ address: '127.0.0.1', family: 4 }] });
    expect(await ok.text()).toBe('ok');
  });

  it('allowHosts exempts a named host', async () => {
    const r = await safeFetch(`http://internal.lan:${port}/`, {}, { allowLoopback: false, allowHosts: ['internal.lan'], lookup: async () => [{ address: '127.0.0.1', family: 4 }] });
    expect(r.status).toBe(200);
  });

  it('rejects other schemes and credentials in the URL', async () => {
    await expect(safeFetch('file:///etc/passwd', {}, open)).rejects.toBeInstanceOf(OutboundBlockedError);
    await expect(safeFetch('ftp://example.com/x', {}, open)).rejects.toBeInstanceOf(OutboundBlockedError);
    await expect(safeFetch(`http://user:pw@127.0.0.1:${port}/`, {}, open)).rejects.toBeInstanceOf(OutboundBlockedError);
  });

  it('caps the response size', async () => {
    await expect(safeFetch(`${base}/big`, {}, { ...open, maxBytes: 100 })).rejects.toThrow(/larger than/);
  });

  it('sends method, headers and body', async () => {
    const r = await safeFetch(`${base}/echo`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer t' }, body: '{"a":1}' }, open);
    expect(await r.json()).toMatchObject({ method: 'POST', body: '{"a":1}', auth: 'Bearer t' });
  });

  it('times out', async () => {
    const slow = http.createServer(() => { /* never answers */ });
    await new Promise<void>((r) => slow.listen(0, '127.0.0.1', r));
    const p = (slow.address() as AddressInfo).port;
    await expect(safeFetch(`http://127.0.0.1:${p}/`, {}, { ...open, timeoutMs: 200 })).rejects.toThrow(/timed out/);
    slow.closeAllConnections?.();
    await new Promise<void>((r) => slow.close(() => r()));
  });
});
