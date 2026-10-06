// Outbound HTTP for URLs an operator/user can influence (gateway upstreams, OpenAPI spec URLs, AI image URLs,
// custom AI endpoints). A plain fetch() lets such a URL reach anything the server can: loopback services,
// the cloud metadata endpoint (169.254.169.254), other containers. safeFetch():
//  - allows http/https only;
//  - resolves the host itself and refuses blocked addresses, then connects to THAT address (no DNS
//    rebinding window between the check and the connection);
//  - follows redirects manually (max 5), re-checking every hop and dropping credentials across origins;
//  - caps the response size and the time.
// Policy (env, see .env.example):
//   OUTBOUND_ALLOW_LOOPBACK  default true outside production, false in production
//   OUTBOUND_ALLOW_PRIVATE   default true  (RFC1918/ULA/CGNAT; set false for an internet-facing multi-tenant install)
//   OUTBOUND_ALLOW_HOSTS     comma list of hostnames exempt from every address check (e.g. an internal API)
// Link-local/metadata (169.254.0.0/16, fe80::/10), unspecified, multicast and reserved ranges are always blocked.
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import zlib from 'node:zlib';
import { isSandbox, SandboxDisabledError } from '../sandbox.js';

export class OutboundBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboundBlockedError';
  }
}

export interface OutboundPolicy {
  allowLoopback: boolean;
  allowPrivate: boolean;
  allowHosts: string[];
  maxBytes: number;
  timeoutMs: number;
  maxRedirects: number;
  /** Test hook / custom resolver. Default: dns.lookup. */
  lookup?: (hostname: string) => Promise<{ address: string; family: number }[]>;
}

const flag = (v: string | undefined, dflt: boolean): boolean => (v === undefined || v === '' ? dflt : v.toLowerCase() === 'true');

export function resolveOutboundPolicy(env: NodeJS.ProcessEnv = process.env, overrides: Partial<OutboundPolicy> = {}): OutboundPolicy {
  const production = env.NODE_ENV === 'production';
  return {
    allowLoopback: flag(env.OUTBOUND_ALLOW_LOOPBACK, !production),
    allowPrivate: flag(env.OUTBOUND_ALLOW_PRIVATE, true),
    allowHosts: (env.OUTBOUND_ALLOW_HOSTS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    maxBytes: 25 * 1024 * 1024,
    timeoutMs: 30_000,
    maxRedirects: 5,
    ...overrides,
  };
}

const ALWAYS_BLOCKED = new net.BlockList();
for (const [net4, prefix] of [['0.0.0.0', 8], ['169.254.0.0', 16], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) ALWAYS_BLOCKED.addSubnet(net4, prefix, 'ipv4');
for (const [net6, prefix] of [['::', 128], ['fe80::', 10], ['ff00::', 8]] as const) ALWAYS_BLOCKED.addSubnet(net6, prefix, 'ipv6');

const LOOPBACK = new net.BlockList();
LOOPBACK.addSubnet('127.0.0.0', 8, 'ipv4');
LOOPBACK.addAddress('::1', 'ipv6');

const PRIVATE = new net.BlockList();
for (const [n, p] of [['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['100.64.0.0', 10], ['198.18.0.0', 15], ['192.0.0.0', 24]] as const) PRIVATE.addSubnet(n, p, 'ipv4');
PRIVATE.addSubnet('fc00::', 7, 'ipv6');

/** ::ffff:a.b.c.d (or its hex form) -> a.b.c.d; anything else unchanged. */
export function unmapIPv4(ip: string): string {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (dotted) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return ip;
}

export function blockReason(address: string, policy: Pick<OutboundPolicy, 'allowLoopback' | 'allowPrivate'>): string | null {
  const ip = unmapIPv4(address.replace(/^\[|\]$/g, ''));
  const family = net.isIP(ip);
  if (family === 0) return 'not an IP address';
  const type = family === 4 ? 'ipv4' : 'ipv6';
  if (ALWAYS_BLOCKED.check(ip, type)) return 'link-local, unspecified, multicast or reserved address';
  if (LOOPBACK.check(ip, type) && !policy.allowLoopback) return 'loopback address';
  if (PRIVATE.check(ip, type) && !policy.allowPrivate) return 'private network address';
  return null;
}

async function defaultLookup(hostname: string) {
  return dns.promises.lookup(hostname, { all: true, verbatim: true });
}

async function resolveAndCheck(hostname: string, policy: OutboundPolicy): Promise<{ address: string; family: number }> {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const exempt = policy.allowHosts.includes(host);
  const addresses = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await (policy.lookup ?? defaultLookup)(host);
  if (addresses.length === 0) throw new OutboundBlockedError(`Cannot resolve ${hostname}`);
  if (!exempt) {
    for (const a of addresses) {
      const reason = blockReason(a.address, policy);
      if (reason) throw new OutboundBlockedError(`Outbound request to ${hostname} blocked: ${reason}`);
    }
  }
  return addresses[0];
}

export interface SafeFetchInit {
  method?: string;
  headers?: Record<string, string> | Headers;
  body?: string | Uint8Array | ArrayBuffer | null;
  signal?: AbortSignal | null;
}

function toHeaderRecord(h: SafeFetchInit['headers']): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  if (typeof (h as Headers).forEach === 'function' && !(h instanceof Array)) (h as Headers).forEach((v, k) => { out[k.toLowerCase()] = v; });
  else for (const [k, v] of Object.entries(h as Record<string, string>)) out[k.toLowerCase()] = v;
  return out;
}

function toBuffer(b: SafeFetchInit['body']): Buffer | undefined {
  if (b == null) return undefined;
  if (typeof b === 'string') return Buffer.from(b);
  if (b instanceof ArrayBuffer) return Buffer.from(new Uint8Array(b));
  return Buffer.from(b);
}

const NO_BODY_STATUS = new Set([101, 204, 205, 304]);

export async function safeFetch(input: string | URL, init: SafeFetchInit = {}, policyOverrides: Partial<OutboundPolicy> = {}): Promise<Response> {
  if (isSandbox()) throw new SandboxDisabledError();
  const policy = resolveOutboundPolicy(process.env, policyOverrides);
  let url = new URL(String(input));
  let method = (init.method ?? 'GET').toUpperCase();
  let body: Buffer | undefined = toBuffer(init.body);
  let headers = toHeaderRecord(init.headers);
  const deadline = Date.now() + policy.timeoutMs;

  for (let hop = 0; ; hop++) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new OutboundBlockedError(`Unsupported protocol ${url.protocol}`);
    if (url.username || url.password) throw new OutboundBlockedError('Credentials in the URL are not allowed');
    const target = await resolveAndCheck(url.hostname, policy);

    const res = await requestOnce(url, target, method, headers, body, init.signal ?? null, Math.max(1, deadline - Date.now()), policy.maxBytes);
    const location = res.headers.get('location');
    if ([301, 302, 303, 307, 308].includes(res.status) && location) {
      if (hop >= policy.maxRedirects) throw new OutboundBlockedError('Too many redirects');
      const next = new URL(location, url);
      if (next.origin !== url.origin) { delete headers.authorization; delete headers.cookie; delete headers['proxy-authorization']; }
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) { method = 'GET'; body = undefined; delete headers['content-type']; delete headers['content-length']; }
      url = next;
      continue;
    }
    return res;
  }
}

function requestOnce(url: URL, target: { address: string; family: number }, method: string, headers: Record<string, string>, body: Buffer | undefined, signal: AbortSignal | null, timeoutMs: number, maxBytes: number): Promise<Response> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const reqHeaders: Record<string, string> = { 'accept-encoding': 'gzip, deflate, br', ...headers };
    if (body && !Object.keys(reqHeaders).some((k) => k.toLowerCase() === 'content-length')) reqHeaders['content-length'] = String(body.length);
    const req = lib.request({
      protocol: url.protocol, hostname: url.hostname.replace(/^\[|\]$/g, ''), port: url.port || undefined, path: url.pathname + url.search, method, headers: reqHeaders,
      // connect to the address we validated, whatever DNS says next
      lookup: ((_h: string, opts: any, cb: any) => (opts?.all ? cb(null, [{ address: target.address, family: target.family }]) : cb(null, target.address, target.family))) as any,
      servername: net.isIP(url.hostname.replace(/^\[|\]$/g, '')) ? undefined : url.hostname,
    }, (incoming) => {
      const chunks: Buffer[] = [];
      let size = 0;
      incoming.on('data', (c: Buffer) => {
        size += c.length;
        if (size > maxBytes) { incoming.destroy(); req.destroy(); reject(new OutboundBlockedError(`Response larger than ${maxBytes} bytes`)); return; }
        chunks.push(c);
      });
      incoming.on('error', reject);
      incoming.on('end', () => {
        try {
          let data = Buffer.concat(chunks);
          const enc = String(incoming.headers['content-encoding'] ?? '').toLowerCase();
          if (enc === 'gzip') data = zlib.gunzipSync(data, { maxOutputLength: maxBytes });
          else if (enc === 'deflate') data = zlib.inflateSync(data, { maxOutputLength: maxBytes });
          else if (enc === 'br') data = zlib.brotliDecompressSync(data, { maxOutputLength: maxBytes });
          const h = new Headers();
          for (const [k, v] of Object.entries(incoming.headers)) {
            if (k === 'content-encoding' || k === 'content-length' || k === 'transfer-encoding') continue;
            if (Array.isArray(v)) v.forEach((x) => h.append(k, x)); else if (v !== undefined) h.set(k, v);
          }
          const status = incoming.statusCode ?? 502;
          resolve(new Response(NO_BODY_STATUS.has(status) ? null : new Uint8Array(data), { status, statusText: incoming.statusMessage ?? '', headers: h }));
        } catch (e) { reject(e); }
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(new Error(`Outbound request timed out after ${timeoutMs} ms`)); });
    req.on('error', reject);
    if (signal) {
      if (signal.aborted) { req.destroy(new Error('aborted')); return; }
      signal.addEventListener('abort', () => req.destroy(new Error('aborted')), { once: true });
    }
    if (body) req.write(body);
    req.end();
  });
}

/** A `fetch`-shaped function for SDKs that take one (e.g. `new OpenAI({ fetch })`) so an operator-configured
 *  endpoint is subject to the same policy. String/ArrayBuffer bodies only (JSON APIs); responses are buffered. */
export function createSafeFetchAdapter(policyOverrides: Partial<OutboundPolicy> = {}) {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' || input instanceof URL ? input : input.url;
    const body = init?.body;
    if (body != null && typeof body !== 'string' && !(body instanceof ArrayBuffer) && !ArrayBuffer.isView(body)) {
      throw new OutboundBlockedError('Unsupported request body type for a guarded outbound request');
    }
    return safeFetch(url, {
      method: init?.method,
      headers: init?.headers as Record<string, string> | Headers | undefined,
      body: body as string | Uint8Array | ArrayBuffer | null | undefined,
      signal: init?.signal ?? null,
    }, policyOverrides);
  };
}
