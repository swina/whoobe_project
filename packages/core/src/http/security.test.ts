import { describe, expect, it } from 'vitest';
import { cookieShouldBeSecure, corsPolicy, isOriginAllowed, resolveCorsAllowlist, sanitizeServerErrors, securityHeaders } from './security.js';

function run(mw: any, req: any) {
  const headers: Record<string, string> = {};
  const res: any = {
    statusCode: 200, ended: false, headers,
    setHeader(k: string, v: string) { headers[k.toLowerCase()] = v; }, append(k: string, v: string) { headers[k.toLowerCase()] = v; },
    removeHeader(k: string) { delete headers[k.toLowerCase()]; },
    status(c: number) { this.statusCode = c; return this; }, end() { this.ended = true; },
    json(b: any) { this.body = b; return this; },
  };
  let nexted = false;
  mw({ headers: {}, method: 'GET', path: '/', ...req }, res, () => { nexted = true; });
  return { res, headers, nexted };
}

const env = (e: Record<string, string>) => ({ NODE_ENV: 'production', ...e }) as NodeJS.ProcessEnv;

describe('CORS policy', () => {
  const mw = corsPolicy({ publicPathPrefixes: ['/public/'], env: env({ WHOOBE_HOSTNAME: 'cms.example.com', CORS_ALLOWED_ORIGINS: 'https://admin.example.org' }) });

  it('reflects an allowed origin with credentials', () => {
    const { headers } = run(mw, { path: '/auth/me', headers: { origin: 'https://cms.example.com:3000' } });
    expect(headers['access-control-allow-origin']).toBe('https://cms.example.com:3000');
    expect(headers['access-control-allow-credentials']).toBe('true');
  });

  it('allows an explicitly listed origin', () => {
    expect(run(mw, { headers: { origin: 'https://admin.example.org' } }).headers['access-control-allow-credentials']).toBe('true');
  });

  it('gives an unknown origin no CORS headers on protected routes (also null)', () => {
    for (const origin of ['https://evil.example', 'null', 'http://cms.example.com.evil.example']) {
      const { headers, nexted } = run(mw, { path: '/auth/me', headers: { origin } });
      expect(headers['access-control-allow-origin']).toBeUndefined();
      expect(nexted).toBe(true);
    }
  });

  it('answers a public route to any origin but never with credentials', () => {
    const { headers } = run(mw, { path: '/public/pages', headers: { origin: 'https://some-site.example' } });
    expect(headers['access-control-allow-origin']).toBe('https://some-site.example');
    expect(headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('preflight: allowed origin gets methods, unknown origin gets a bare 204', () => {
    const ok = run(mw, { method: 'OPTIONS', path: '/x', headers: { origin: 'https://cms.example.com', 'access-control-request-headers': 'content-type' } });
    expect(ok.res.ended).toBe(true);
    expect(ok.headers['access-control-allow-headers']).toBe('content-type');
    const bad = run(mw, { method: 'OPTIONS', path: '/x', headers: { origin: 'https://evil.example' } });
    expect(bad.res.ended).toBe(true);
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('localhost is only implicit outside production', () => {
    expect(isOriginAllowed('http://localhost:3000', resolveCorsAllowlist({ env: { NODE_ENV: 'development' } as any }))).toBe(true);
    expect(isOriginAllowed('http://localhost:3000', resolveCorsAllowlist({ env: env({}) }))).toBe(false);
  });

  it('ignores non-http origins and requests without Origin', () => {
    expect(isOriginAllowed('file://x', resolveCorsAllowlist({ env: env({ WHOOBE_HOSTNAME: 'x' }) }))).toBe(false);
    expect(run(mw, { headers: {} }).nexted).toBe(true);
  });
});

describe('securityHeaders', () => {
  it('sets the baseline and drops X-Powered-By', () => {
    const { headers } = run(securityHeaders(), {});
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(headers['referrer-policy']).toBe('no-referrer');
  });
});

describe('sanitizeServerErrors', () => {
  const send = (mw: any, status: number, body: any) => {
    const { res } = run(mw, {}); res.statusCode = status; res.json(body); return res.body;
  };
  it('hides database text on 5xx in any environment', () => {
    const dev = sanitizeServerErrors({ env: { NODE_ENV: 'development' } as any });
    expect(send(dev, 500, { error: 'Failed query: select "id" from "data_objects" where id = $1\nparams: x' }).error).toBe('Internal server error');
  });
  it('keeps readable non-DB messages outside production, hides everything in production', () => {
    expect(send(sanitizeServerErrors({ env: { NODE_ENV: 'development' } as any }), 500, { error: 'SMTP not configured' }).error).toBe('SMTP not configured');
    expect(send(sanitizeServerErrors({ env: env({}) }), 500, { error: 'SMTP not configured' }).error).toBe('Internal server error');
  });
  it('never touches 4xx or non-error bodies', () => {
    const mw = sanitizeServerErrors({ env: env({}) });
    expect(send(mw, 404, { error: 'Not found' }).error).toBe('Not found');
    expect(send(mw, 500, { ok: true }).ok).toBe(true);
  });
});

describe('cookieShouldBeSecure', () => {
  it('follows TLS, forwarded proto and the COOKIE_SECURE override', () => {
    expect(cookieShouldBeSecure({ headers: {}, secure: false } as any, {} as any)).toBe(false);
    expect(cookieShouldBeSecure({ headers: { 'x-forwarded-proto': 'https' }, secure: false } as any, {} as any)).toBe(true);
    expect(cookieShouldBeSecure({ headers: {}, secure: true } as any, {} as any)).toBe(true);
    expect(cookieShouldBeSecure({ headers: {}, secure: false } as any, { COOKIE_SECURE: 'true' } as any)).toBe(true);
    expect(cookieShouldBeSecure({ headers: { 'x-forwarded-proto': 'https' }, secure: true } as any, { COOKIE_SECURE: 'false' } as any)).toBe(false);
  });
});
