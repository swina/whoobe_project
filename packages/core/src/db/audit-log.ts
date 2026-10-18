// Pure helpers of the audit log (docs/plans/system/audit-log-plan.md): what may be written, and in what shape. No database here.

export interface AuditActor {
  type: 'user' | 'api-client' | 'system';
  id?: string | null;
  /** The e-mail or client name at that moment. */
  label?: string | null;
}

export interface AuditEntry {
  actor: AuditActor;
  ip?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  requestId?: string | null;
}

/** Marker written in place of a secret that changed: the fact is recorded, never the value. */
export const SECRET_CHANGED = 'changed';
/** What the safety net writes in place of a value whose key looks like a secret. */
export const REDACTED = '[redacted]';

// The snapshots are built from allow-lists, so a secret should never get here. This is the second line of defence: a key that looks like a
// credential is replaced, whatever the caller passed. Deliberately broad ("hash", "token"): a lost detail is better than a leaked secret.
const SECRET_KEY = /pass(word|phrase)?|secret|token|api[-_]?key|site[-_]?key|private[-_]?key|credential|authorization|cookie|hash|totp|otp|pepper|signing/i;
const MAX_STRING = 2000;
const MAX_DEPTH = 6;
const MAX_KEYS = 80;

export function redactForAudit(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}... (${value.length} characters)` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return '[too deep]';
  if (Array.isArray(value)) return value.slice(0, MAX_KEYS).map((v) => redactForAudit(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, MAX_KEYS)) {
      if (SECRET_KEY.test(k)) {
        // an already-marked change stays readable; anything else that looks like a secret is hidden
        out[k] = v === SECRET_CHANGED || v === null ? v : REDACTED;
      } else out[k] = redactForAudit(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

/** The fields of `source` that are on the allow-list (missing ones are left out). */
export function pickAllowed(source: Record<string, unknown> | null | undefined, allow: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!source) return out;
  for (const k of allow) if (k in source && source[k] !== undefined) out[k] = source[k];
  return out;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * For an update: only the fields whose value differs, in `before` and in `after`. `secrets` names fields that are credentials: when the
 * new request carries a value for one, the row says `changed` and never the value (neither side).
 */
export function changedOnly(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  secrets: readonly string[] = [],
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const b = before ?? {};
  const a = after ?? {};
  const outB: Record<string, unknown> = {};
  const outA: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (secrets.includes(k)) {
      if (k in a && a[k] !== undefined && a[k] !== '' && a[k] !== null) outA[k] = SECRET_CHANGED;
      continue;
    }
    if (!same(b[k], a[k])) {
      if (k in b) outB[k] = b[k];
      if (k in a) outA[k] = a[k];
    }
  }
  return { before: outB, after: outA };
}

/** Days to keep rows (`AUDIT_RETENTION_DAYS`): 365 by default, 0 = forever, anything unreadable = the default. */
export function auditRetentionDays(env: Record<string, string | undefined> = process.env): number {
  const raw = env.AUDIT_RETENTION_DAYS;
  if (raw === undefined || raw.trim() === '') return 365;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 365;
}

/** Quote a CSV cell; a leading = + - @ is neutralised so a spreadsheet does not run a value an administrator typed. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
