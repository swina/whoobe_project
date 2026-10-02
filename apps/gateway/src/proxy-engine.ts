import { safeFetch } from '@whoobe-cms/core/server';
import { GATEWAY_PROXY_TIMEOUT_MS } from './config.js';

export interface ProxyResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export async function proxyFetch(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: unknown | undefined,
  timeoutMs: number = GATEWAY_PROXY_TIMEOUT_MS,
  /** `trusted`: the URL comes from this deployment's own configuration (core-api / asset-processor /
   *  our own gateway), not from an operator-defined endpoint, so it may be loopback/private. Every
   *  other upstream goes through safeFetch (SSRF policy: packages/core/src/http/safe-fetch.ts). */
  opts: { trusted?: boolean } = {}
): Promise<ProxyResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const isGetHead = method === 'GET' || method === 'HEAD';

  try {
    const init = {
      method,
      headers,
      body: isGetHead ? undefined : (body !== undefined ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    };
    const response = opts.trusted ? await fetch(url, init) : await safeFetch(url, init, { timeoutMs });

    const responseHeaders: Record<string, string | string[] | undefined> = {};
    response.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower.startsWith('x-internal-')) return;
      responseHeaders[key] = value;
    });

    let responseBody: unknown;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }

    return {
      status: response.status,
      headers: responseHeaders,
      body: responseBody,
    };
  } finally {
    clearTimeout(timer);
  }
}