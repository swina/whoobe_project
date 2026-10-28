import type { Request } from 'express';
import { createFailedAttemptRecorder, insertAuditSafe, onPermissionRefused, type AuditActor } from '@whoobe-cms/core/server';
import { logger } from './log-error.js';

// Failed attempts in the audit log (release-0.4-plan.md 3.1), the gateway's part: an API client refused at authentication, and a
// signed-in user refused a permission on the gateway's administration routes. Never the key or the token; at most 10 rows a minute per
// address and action.
const record = createFailedAttemptRecorder({
  write: (entry) => void insertAuditSafe(entry, (err, e) => logger.error({ err, action: e.action }, 'audit: the failed attempt could not be written')),
  onThrottled: ({ ip, action }) => logger.warn({ ip, action }, 'audit: more than 10 failed attempts in a minute from this address, the rest of the minute is not written'),
});

export function auditFailure(req: Request, action: string, after: Record<string, unknown>, actor: AuditActor = { type: 'anonymous' }): void {
  const rid = req.headers['x-request-id'];
  record({ actor, ip: req.ip ?? null, action, after, requestId: typeof rid === 'string' ? rid : null });
}

/** An API client refused before it could call anything: `client` when the credential named one (the reason is then about the client). */
export function auditClientRefused(req: Request, reason: string, credential: 'key' | 'jwt' | 'none', client?: { id: string; name: string }): void {
  auditFailure(req, 'api_client.refused', { reason, presented: credential }, client ? { type: 'api-client', id: client.id, label: client.name } : undefined);
}

onPermissionRefused((req, user, keys) => auditFailure(req, 'access.permission_refused',
  { service: 'gateway', method: req.method, route: `${req.baseUrl}${req.route?.path ?? req.path}`, permission: keys[0], ...(keys.length > 1 ? { accepted: [...keys] } : {}) },
  { type: 'user', id: user.id, label: user.email }));
