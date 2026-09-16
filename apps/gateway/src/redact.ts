/** Key names that commonly carry credentials or secrets in a third-party
 *  API's JSON response - "Test route" captures a live sample response and
 *  stores it (gateway_schemas.sample_payload) for the field picker/preview,
 *  so a value under one of these keys gets scrubbed before it's ever
 *  written to the DB or shown in the admin UI. */
const SENSITIVE_KEY_PATTERN = /(password|secret|token|api[_-]?key|authorization|auth|access[_-]?key|private[_-]?key|client[_-]?secret|refresh[_-]?token|session[_-]?id|cookie)/i;

const REDACTED = '[REDACTED]';

export function redactSensitiveValues(value: unknown, depth = 0): unknown {
  if (depth > 20) return value; // guard against pathological/cyclic input
  if (Array.isArray(value)) return value.map(item => redactSensitiveValues(item, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactSensitiveValues(val, depth + 1);
    }
    return out;
  }
  return value;
}

/** Response headers an admin's "Try it" panel is allowed to see. Everything
 *  else - Set-Cookie, rate-limit/trace tokens, a misconfigured upstream
 *  echoing Authorization back, etc. - is dropped rather than relayed. */
const SAFE_RESPONSE_HEADERS = new Set([
  'content-type',
  'content-length',
  'cache-control',
  'etag',
  'last-modified',
  'date',
  'x-request-id',
]);

export function pickSafeResponseHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value !== 'string') continue;
    if (SAFE_RESPONSE_HEADERS.has(key.toLowerCase())) out[key] = value;
  }
  return out;
}
