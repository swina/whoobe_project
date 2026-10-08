import { safeFetch } from '../http/safe-fetch.js';
import type { MailProviderCondition, MailProviderDefinition } from './providers.js';

// Runs a mail provider definition (providers.ts): fills the {{placeholders}} of its request with one message and the
// provider's saved settings, sends it, and reads the answer by the definition's rules. Nothing here knows OneSignal.

export interface MailMessage {
  to: string;
  cc?: string;
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  /** address only, no display name */
  from?: string;
  fromName?: string;
  replyTo?: string;
  /** unique per message: providers that dedupe on a key use it */
  messageId: string;
}

export class MailProviderError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

type Value = unknown;
const EXACT = /^\{\{\s*([A-Za-z0-9_.]+)\s*\}\}$/;
const ANY = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;
const isEmpty = (v: Value): boolean => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

function lookup(ctx: Record<string, Value>, path: string): Value {
  let cur: Value = ctx;
  for (const part of path.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as object)) cur = (cur as Record<string, Value>)[part];
    else return undefined;
  }
  return cur;
}

const DROP = Symbol('drop');

/** Fills a JSON template. A value that is exactly one placeholder takes the placeholder's own type (a string, a list)
 *  and the key is left out when it has no value; a placeholder inside longer text becomes text. Values are put into
 *  the structure, never concatenated into JSON, so nothing a message contains can change the shape of the request. */
export function fillTemplate(node: Value, ctx: Record<string, Value>): Value {
  if (typeof node === 'string') {
    const exact = EXACT.exec(node);
    if (exact) { const v = lookup(ctx, exact[1]); return isEmpty(v) ? DROP : v; }
    return node.replace(ANY, (_m, p: string) => { const v = lookup(ctx, p); return v === undefined || v === null ? '' : String(v); });
  }
  if (Array.isArray(node)) {
    const out: Value[] = [];
    for (const item of node) {
      const exact = typeof item === 'string' ? EXACT.exec(item) : null;
      if (exact) {
        const v = lookup(ctx, exact[1]);
        if (Array.isArray(v)) out.push(...v);
        else if (!isEmpty(v)) out.push(v);
        continue;
      }
      const r = fillTemplate(item, ctx);
      if (r !== DROP) out.push(r);
    }
    return out;
  }
  if (node && typeof node === 'object') {
    const out: Record<string, Value> = {};
    for (const [k, v] of Object.entries(node as Record<string, Value>)) {
      const r = fillTemplate(v, ctx);
      if (r !== DROP) out[k] = r;
    }
    return out;
  }
  return node;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface BuiltRequest { method: string; url: string; headers: Record<string, string>; body?: string }

/** The request for one message. Throws MailProviderError for what the provider cannot do or what is not configured. */
export function buildProviderRequest(def: MailProviderDefinition, config: Record<string, unknown>, msg: MailMessage): BuiltRequest {
  const caps = def.capabilities ?? {};
  for (const f of def.configFields) {
    if (f.required && isEmpty(config[f.name])) throw new MailProviderError(`${def.label}: "${f.label}" is not configured`);
  }
  if (msg.cc && caps.cc === false) throw new MailProviderError(`${def.label} cannot send a copy (CC)`);
  const bcc = msg.bcc ?? [];
  if (caps.bccMax !== undefined && bcc.length > caps.bccMax) throw new MailProviderError(`${def.label} accepts at most ${caps.bccMax} blind copies, this message has ${bcc.length}`);

  // a text-only message to a provider that takes HTML only: keep the line breaks
  let html = msg.html;
  if (!html && msg.text) {
    if (caps.html === false) { /* provider takes text: html stays empty */ }
    else html = `<div style="white-space:pre-wrap">${escapeHtml(msg.text)}</div>`;
  }

  const ctx: Record<string, Value> = {
    config,
    to: msg.to, cc: msg.cc, bcc, subject: msg.subject, html, text: msg.text,
    from: msg.from, fromName: msg.fromName, replyTo: msg.replyTo, messageId: msg.messageId,
  };

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(def.request.headers ?? {})) {
    const value = String(fillTemplate(v, ctx) === DROP ? '' : fillTemplate(v, ctx)).trim();
    if (!value) continue;
    if (/[\r\n]/.test(value) || /[\r\n]/.test(k)) throw new MailProviderError(`${def.label}: a header value contains a line break`);
    headers[k] = value;
  }
  const url = String(fillTemplate(def.request.url, ctx));
  const filled = def.request.body === undefined ? undefined : fillTemplate(def.request.body, ctx);
  const body = filled === undefined || filled === DROP ? undefined : JSON.stringify(filled);
  return { method: def.request.method.toUpperCase(), url, headers, body };
}

function pathValue(json: Value, path: string): Value {
  let cur = json;
  for (const part of path.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as object)) cur = (cur as Record<string, Value>)[part];
    else return undefined;
  }
  return cur;
}

function nonEmpty(v: Value): boolean {
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === 'object') return Object.keys(v as object).length > 0;
  return v !== undefined && v !== null && v !== false;
}

function holds(json: Value, c: MailProviderCondition): boolean {
  const v = pathValue(json, c.path);
  if (c.exists !== undefined) return (v !== undefined) === c.exists;
  if (c.nonEmpty !== undefined) return nonEmpty(v) === c.nonEmpty;
  if ('equals' in c) return v === c.equals;
  return false;
}

function describeErrors(json: Value, paths: string[] | undefined): string | null {
  for (const p of paths ?? []) {
    const v = pathValue(json, p);
    if (!nonEmpty(v)) continue;
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('; ');
    return JSON.stringify(v);
  }
  return null;
}

export interface TransportDeps {
  fetchImpl?: (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<Response>;
  sleep?: (ms: number) => Promise<void>;
}

/** Sends one message through the provider. Resolves with the provider's id for it (when the definition names one). */
export async function sendViaHttpProvider(
  def: MailProviderDefinition,
  config: Record<string, unknown>,
  msg: MailMessage,
  deps: TransportDeps = {},
): Promise<{ reference: string | null }> {
  const fetchImpl = deps.fetchImpl ?? ((url, init) => safeFetch(url, init));
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const req = buildProviderRequest(def, config, msg);
  const secrets = def.configFields.filter((f) => f.secret).map((f) => String(config[f.name] ?? '')).filter((v) => v.length >= 4);
  const scrub = (text: string) => secrets.reduce((t, s) => t.split(s).join('***'), text);

  const retry = def.retry;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(req.url, { method: req.method, headers: req.headers, body: req.body });
    } catch (e) {
      throw new MailProviderError(scrub(`${def.label}: the request failed (${e instanceof Error ? e.message : String(e)})`));
    }
    if (retry && attempt < retry.max && retry.on.includes(res.status)) {
      const header = Number(res.headers.get('retry-after'));
      const wait = Math.min(Number.isFinite(header) && header > 0 ? header : 1, retry.maxWaitSeconds ?? 10);
      await sleep(wait * 1000);
      continue;
    }
    const text = await res.text();
    let json: Value;
    try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }

    const okStatus = def.success?.status ? def.success.status.includes(res.status) : res.status >= 200 && res.status < 300;
    const failed = (def.success?.failWhen ?? []).some((c) => holds(json, c));
    if (!okStatus || failed) {
      const detail = describeErrors(json, def.success?.errorFrom) ?? (text.trim().slice(0, 200) || res.statusText);
      throw new MailProviderError(scrub(`${def.label}: ${okStatus ? 'not delivered' : `HTTP ${res.status}`} - ${detail}`), res.status);
    }
    const ref = def.success?.reference ? pathValue(json, def.success.reference) : undefined;
    return { reference: typeof ref === 'string' || typeof ref === 'number' ? String(ref) : null };
  }
}
