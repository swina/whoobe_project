import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { changedOnly, pickAllowed, type AuditActor, type AuditEntry } from '../db/audit-log.js';
import { insertAuditSafe } from '../db/audit-log-records.js';

// The audit log's guard (docs/plans/system/audit-log-plan.md, section 3), shared by core-api and the gateway. `audited(spec)` goes in the route's middleware list AFTER the
// permission guard, so the actor is known. It loads the state before the handler runs, remembers the JSON the handler answers with, and
// when the response has finished with a status below 400 it writes one row. A failed write is logged and counted (auditStats), never
// turned into an error for the request: the change has already happened.
//
// What is written is decided here and nowhere else: `snapshot` maps an entity to an allow-list of fields (never a secret), and `secrets`
// names the fields whose change is recorded as "changed" without the value.

export type AuditKind = 'create' | 'update' | 'delete' | 'event';

export interface AuditSpec<E = Record<string, unknown>> {
  action: string;
  kind: AuditKind;
  targetType: string;
  /** Pure: the allow-listed fields of an entity. */
  snapshot?: (entity: E) => Record<string, unknown>;
  /** Fields of the request that are credentials: recorded as "changed" (see changedOnly). */
  secrets?: readonly string[];
  /** Credentials found in a nested request body (a dotted name such as `smtp.password`): recorded as "changed" when the request carries one. */
  secretsFromBody?: (body: any) => string[];
  /** The entity as it is before the handler runs (update, delete, event on an existing target). null = it does not exist. */
  loadBefore?: (req: Request) => Promise<E | null | undefined>;
  /** The entity in the handler's JSON answer (create, update). */
  fromResponse?: (body: any) => E | null | undefined;
  /** The entity as it is after the handler ran, read again (for a handler that does not answer with it). Wins over `fromResponse`. */
  loadAfter?: (req: Request, body: any) => Promise<E | null | undefined>;
  /** True = this call changed nothing (a dry run): no row. */
  skip?: (req: Request, body: any) => boolean;
  /** Default: `req.params.id`, or the id of the entity found in the answer. */
  targetId?: (req: Request, entity: E | null | undefined) => string | undefined;
  targetLabel?: (entity: E | null | undefined) => string | undefined;
  /** Fields of the request body to record for an `event` (an action with no entity of its own). Allow-list. */
  eventFields?: readonly string[];
  /** For an `event`: what to record, built from the request and the answer. Only fields the author has argued are safe. */
  describe?: (req: Request, body: any, entity: E | null | undefined) => Record<string, unknown> | null;
}

export function actorOf(req: Request): AuditActor {
  const u = (req as any).user as { id?: string; email?: string } | undefined;
  return u?.id ? { type: 'user', id: String(u.id), label: u.email ?? null } : { type: 'system' };
}

export function createAudit(logger: { error: (o: object, m: string) => void }) {
  function audited<E = Record<string, unknown>>(spec: AuditSpec<E>): RequestHandler {
    const snap = (e: E | null | undefined): Record<string, unknown> | null => (e && spec.snapshot ? spec.snapshot(e) : null);
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      let beforeEntity: E | null | undefined;
      try {
        beforeEntity = spec.loadBefore ? await spec.loadBefore(req) : undefined;
      } catch (err) {
        logger.error({ err, action: spec.action }, 'audit: could not read the state before the change');
      }
      let answered: unknown;
      const json = res.json.bind(res);
      res.json = ((body: unknown) => { answered = body; return json(body); }) as typeof res.json;

      // an error inside the recording itself must not vanish as an unhandled rejection: it is a lost audit row
      res.on('finish', () => {
        record().catch((err) => logger.error({ err, action: spec.action }, 'audit: the row could not be built'));
      });

      const record = async (): Promise<void> => {
        if (res.statusCode >= 400) return;
        if (spec.skip?.(req, answered)) return;
        // a delete or an update of something that was not there changed nothing
        if ((spec.kind === 'delete' || spec.kind === 'update') && spec.loadBefore && !beforeEntity) return;
        let afterEntity: E | null | undefined;
        try {
          afterEntity = spec.loadAfter ? await spec.loadAfter(req, answered) : spec.fromResponse ? spec.fromResponse(answered) : undefined;
        } catch (err) {
          logger.error({ err, action: spec.action }, 'audit: could not read the state after the change');
          afterEntity = undefined;
        }
        const entity = afterEntity ?? beforeEntity;

        let before: Record<string, unknown> | null = null;
        let after: Record<string, unknown> | null = null;
        if (spec.kind === 'create') after = snap(afterEntity);
        else if (spec.kind === 'delete') before = snap(beforeEntity);
        else if (spec.kind === 'update') {
          const diff = changedOnly(snap(beforeEntity), snap(afterEntity), spec.secrets);
          // a secret in the request body that the answer does not echo: still a change
          for (const s of spec.secrets ?? []) {
            const v = (req.body ?? {})[s];
            if (v !== undefined && v !== null && v !== '') diff.after[s] = 'changed';
          }
          for (const name of spec.secretsFromBody?.(req.body ?? {}) ?? []) diff.after[name] = 'changed';
          before = diff.before;
          after = diff.after;
        } else if (spec.kind === 'event') {
          if (spec.describe) after = spec.describe(req, answered, entity);
          else if (spec.eventFields) after = pickAllowed(req.body ?? {}, spec.eventFields);
        }

        const rid = req.headers['x-request-id'];
        const entry: AuditEntry = {
          actor: actorOf(req),
          ip: req.ip ?? null,
          action: spec.action,
          targetType: spec.targetType,
          targetId: spec.targetId ? spec.targetId(req, entity) : (req.params?.id ?? (entity as any)?.id ?? null),
          targetLabel: spec.targetLabel ? spec.targetLabel(entity) ?? null : null,
          before,
          after,
          requestId: typeof rid === 'string' ? rid : null,
        };
        await insertAuditSafe(entry, (err, e) => logger.error({ err, action: e.action, targetType: e.targetType, targetId: e.targetId, actor: e.actor.id }, 'audit: the row could not be written'));
      };
      next();
    };
  }
  return { audited };
}
