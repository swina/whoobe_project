// Object events: the pure part (no database). Builds the envelope that goes to the outbox and works out WHICH events a write produced.
// See docs/plans/datamodel/data-objects-automations.md (sections 4 and 6) and object-events-phase0.md (step 1).
// The envelope never carries attribute values: only names (`changed`) and ids; a subscription's field allow-list is a later phase.
import { createHmac } from 'node:crypto';
import type { DataObjectRecord } from './data-objects-records.js';
import type { AssetRecord } from './asset-records.js';
import type { WhoobePageRecord } from './whoobe-pages-records.js';

export type ObjectEventType =
  | 'object.created'
  | 'object.updated'
  | 'object.published'
  | 'object.unpublished'
  | 'object.deleted'
  | 'object.transitioned'
  | 'object.bulk';

/** Events of files in the library and of pages (docs/plans/system/more-events-plan.md). Same outbox, same delivery, same loop guard. */
export type AssetEventType = 'asset.created' | 'asset.updated' | 'asset.moved' | 'asset.deleted' | 'asset.bulk';
export type PageEventType = 'page.published' | 'page.unpublished';
export type SubjectType = 'object' | 'asset' | 'page';

export interface EventActor {
  type: 'user' | 'api-client' | 'system' | 'import';
  id?: string;
}

export interface ObjectEventDraft {
  type: ObjectEventType;
  changed: string[];
  transition?: { from: string | null; to: string | null };
}

export interface ObjectEvent {
  id: string;
  type: ObjectEventType;
  occurredAt: string;
  class: { id: string; name?: string };
  object: {
    id: string;
    translationGroupId: string;
    locale: string;
    key: string;
    published: boolean;
    workflowState: string | null;
    updatedAt: string;
  };
  changed: string[];
  transition?: { from: string | null; to: string | null };
  actor: EventActor;
  /** The write carried `X-Whoobe-Flow: stop`: it is the result of a flow, so it starts no subscription (docs/plans/automations/object-events-loop-guard.md). */
  endOfFlow?: true;
}

export interface BulkObjectEvent {
  id: string;
  type: 'object.bulk';
  occurredAt: string;
  class: { id: string; name?: string };
  bulk: { kind: 'import' | 'delete' | 'migration'; count: number; firstIds: string[] };
  actor: EventActor;
}

/** What an event says about a file: where it is and what it is, never its bytes or its extracted metadata. */
export interface AssetSummary {
  id: string;
  path: string;
  folder: string;
  filename: string;
  mimeType: string;
  fileType: string;
  sizeBytes: number;
  isPublic: boolean;
  version: number;
}

export interface AssetEvent {
  id: string;
  type: Exclude<AssetEventType, 'asset.bulk'>;
  occurredAt: string;
  asset: AssetSummary;
  /** Only `asset.moved`: where the file was. */
  from?: { path: string };
  actor: EventActor;
  endOfFlow?: true;
}

export interface AssetBulkEvent {
  id: string;
  type: 'asset.bulk';
  occurredAt: string;
  bulk: { kind: 'delete'; count: number; firstIds: string[] };
  actor: EventActor;
  endOfFlow?: true;
}

export interface PageEvent {
  id: string;
  type: PageEventType;
  occurredAt: string;
  page: { id: string; websiteId: string | null; slug: string; locale: string; translationGroupId: string; published: boolean; publishedAt: string | null };
  actor: EventActor;
  endOfFlow?: true;
}

/** Anything the outbox stores. An asset or a page event has no `class`. */
export type AnyEvent = ObjectEvent | BulkObjectEvent | AssetEvent | AssetBulkEvent | PageEvent;

export function eventSubject(event: AnyEvent): { type: SubjectType; id: string; translationGroupId: string | null; locale: string | null } | null {
  if ('object' in event) return { type: 'object', id: event.object.id, translationGroupId: event.object.translationGroupId, locale: event.object.locale };
  if ('asset' in event) return { type: 'asset', id: event.asset.id, translationGroupId: null, locale: null };
  if ('page' in event) return { type: 'page', id: event.page.id, translationGroupId: event.page.translationGroupId, locale: event.page.locale };
  return null;
}

export function summariseAsset(a: Pick<AssetRecord, 'id' | 'pimcorePath' | 'folderPath' | 'filename' | 'mimeType' | 'fileType' | 'sizeBytes' | 'isPublic' | 'version'>): AssetSummary {
  return { id: a.id, path: a.pimcorePath, folder: a.folderPath, filename: a.filename, mimeType: a.mimeType, fileType: a.fileType, sizeBytes: a.sizeBytes, isPublic: a.isPublic, version: a.version };
}

interface SubjectContext { actor?: EventActor; endOfFlow?: boolean; now?: Date; newId?: () => string }
const envelope = (ctx: SubjectContext) => ({
  id: (ctx.newId ?? (() => crypto.randomUUID()))(),
  occurredAt: (ctx.now ?? new Date()).toISOString(),
  actor: ctx.actor ?? ({ type: 'system' } as EventActor),
  ...(ctx.endOfFlow ? { endOfFlow: true as const } : {}),
});

export function buildAssetEvent(type: AssetEvent['type'], asset: AssetSummary, ctx: SubjectContext & { from?: string } = {}): AssetEvent {
  const { id, occurredAt, actor, endOfFlow } = envelope(ctx);
  return { id, type, occurredAt, asset, ...(ctx.from ? { from: { path: ctx.from } } : {}), actor, ...(endOfFlow ? { endOfFlow } : {}) };
}

export function buildAssetBulkEvent(ids: string[], ctx: SubjectContext = {}): AssetBulkEvent {
  const { id, occurredAt, actor, endOfFlow } = envelope(ctx);
  return { id, type: 'asset.bulk', occurredAt, bulk: { kind: 'delete', count: ids.length, firstIds: ids.slice(0, MAX_FIRST_IDS) }, actor, ...(endOfFlow ? { endOfFlow } : {}) };
}

export function buildPageEvent(type: PageEventType, page: Pick<WhoobePageRecord, 'id' | 'websiteId' | 'slug' | 'locale' | 'translationGroupId' | 'published' | 'publishedAt'>, ctx: SubjectContext = {}): PageEvent {
  const { id, occurredAt, actor, endOfFlow } = envelope(ctx);
  return {
    id, type, occurredAt,
    page: { id: page.id, websiteId: page.websiteId ?? null, slug: page.slug, locale: page.locale, translationGroupId: page.translationGroupId, published: page.published, publishedAt: page.publishedAt ? page.publishedAt.toISOString() : null },
    actor, ...(endOfFlow ? { endOfFlow } : {}),
  };
}

/** `OBJECT_EVENTS_ENABLED=0` stops emitting for the instance (the kill switch of the proposal, section 7). */
export function objectEventsEnabled(): boolean {
  return process.env.OBJECT_EVENTS_ENABLED !== '0';
}

const MAX_FIRST_IDS = 10;
const STRUCTURAL = ['key', 'parentId', 'path'] as const;

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const arr = b as unknown[];
    return a.length === arr.length && a.every((v, i) => deepEqual(v, arr[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) if (!deepEqual(ao[k], bo[k])) return false;
  return true;
}

/** Names of what differs between two versions of a row: attributes (deep compare, key order ignored) plus key, path and parentId. A missing
 * `before` (a create) lists every attribute that has a value. Published, workflow state and timestamps are NOT in the list: they have events of their own. */
export function changedFields(before: DataObjectRecord | null, after: DataObjectRecord): string[] {
  const names = new Set<string>();
  const b = before?.attributes ?? {};
  const a = after.attributes ?? {};
  for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (!before) {
      if (a[k] !== undefined) names.add(k);
    } else if (!deepEqual(b[k], a[k])) {
      names.add(k);
    }
  }
  if (before) for (const k of STRUCTURAL) if (before[k] !== after[k]) names.add(k);
  return [...names].sort();
}

/** The events one update produced, in a fixed order: updated, transitioned, published / unpublished. A write that changes nothing gives none;
 * a pure publish or unpublish gives only its own event, never `object.updated`. */
export function classifyUpdate(before: DataObjectRecord, after: DataObjectRecord): ObjectEventDraft[] {
  const out: ObjectEventDraft[] = [];
  const changed = changedFields(before, after);
  if (changed.length) out.push({ type: 'object.updated', changed });
  if ((before.workflowState ?? null) !== (after.workflowState ?? null)) {
    out.push({ type: 'object.transitioned', changed: [], transition: { from: before.workflowState ?? null, to: after.workflowState ?? null } });
  }
  if (!before.published && after.published) out.push({ type: 'object.published', changed: [] });
  if (before.published && !after.published) out.push({ type: 'object.unpublished', changed: [] });
  return out;
}

export interface BuildContext {
  /** The row after the write (for `object.deleted`: the row as it was). */
  after: DataObjectRecord;
  actor?: EventActor;
  className?: string;
  now?: Date;
  newId?: () => string;
  /** The write said it ends a flow: the event is kept, no flow is started by it. */
  endOfFlow?: boolean;
}

export function buildEvent(draft: ObjectEventDraft, ctx: BuildContext): ObjectEvent {
  const { after } = ctx;
  const now = ctx.now ?? new Date();
  return {
    id: (ctx.newId ?? (() => crypto.randomUUID()))(),
    type: draft.type,
    occurredAt: now.toISOString(),
    class: ctx.className ? { id: after.classId, name: ctx.className } : { id: after.classId },
    object: {
      id: after.id,
      translationGroupId: after.translationGroupId,
      locale: after.locale,
      key: after.key,
      published: after.published,
      workflowState: after.workflowState ?? null,
      updatedAt: after.updatedAt.toISOString(),
    },
    changed: draft.changed,
    ...(draft.transition ? { transition: draft.transition } : {}),
    actor: ctx.actor ?? { type: 'system' },
    ...(ctx.endOfFlow ? { endOfFlow: true as const } : {}),
  };
}

/** One summary for an import / "Empty data" / migration run: never one event per row. */
export function buildBulkEvent(input: {
  classId: string;
  className?: string;
  kind: BulkObjectEvent['bulk']['kind'];
  count: number;
  ids: string[];
  actor?: EventActor;
  now?: Date;
  newId?: () => string;
}): BulkObjectEvent {
  return {
    id: (input.newId ?? (() => crypto.randomUUID()))(),
    type: 'object.bulk',
    occurredAt: (input.now ?? new Date()).toISOString(),
    class: input.className ? { id: input.classId, name: input.className } : { id: input.classId },
    bulk: { kind: input.kind, count: input.count, firstIds: input.ids.slice(0, MAX_FIRST_IDS) },
    actor: input.actor ?? { type: 'system' },
  };
}

// ---- delivery rules that need no database ----

/** Waits after the 1st, 2nd, ... failed attempt; a delivery that fails once more after the last wait is `dead` (6 attempts in all). */
export const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];

export function nextAttemptPlan(failedAttempts: number, now: Date): { status: 'retrying'; nextAttemptAt: Date } | { status: 'dead' } {
  const wait = BACKOFF_MS[failedAttempts - 1];
  return wait === undefined ? { status: 'dead' } : { status: 'retrying', nextAttemptAt: new Date(now.getTime() + wait) };
}

/** `sha256=<hex>` over `timestamp + "." + body` (the exact string that is sent), so a consumer can refuse a call that is not from this instance. */
export function signBody(secret: string, timestamp: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

// ---- subscriptions: validation of what an administrator submits ----

export const OBJECT_EVENT_TYPES: readonly ObjectEventType[] = [
  'object.created', 'object.updated', 'object.published', 'object.unpublished', 'object.deleted', 'object.transitioned', 'object.bulk',
];
export const ASSET_EVENT_TYPES: readonly AssetEventType[] = ['asset.created', 'asset.updated', 'asset.moved', 'asset.deleted', 'asset.bulk'];
export const PAGE_EVENT_TYPES: readonly PageEventType[] = ['page.published', 'page.unpublished'];
/** Every type a subscription may list. */
export const ALL_EVENT_TYPES: readonly string[] = [...OBJECT_EVENT_TYPES, ...ASSET_EVENT_TYPES, ...PAGE_EVENT_TYPES];
/** Types that have no data class: a subscription pinned to a class would never receive them. */
export const CLASSLESS_EVENT_TYPES: readonly string[] = [...ASSET_EVENT_TYPES, ...PAGE_EVENT_TYPES];

/** The signing key lives in an environment variable of the instance; the name must carry this prefix so a subscription can never read another secret (the database password, a session key) by naming it. */
export const SIGNING_SECRET_PREFIX = 'OBJECT_EVENTS_SECRET_';

export interface SubscriptionInput {
  name: string;
  enabled: boolean;
  classId: string | null;
  events: (ObjectEventType | AssetEventType | PageEventType)[];
  endpointId: string;
  routeId: string;
  payloadMode: 'minimal';
  ignoreActors: string[];
  signingSecretRef: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Checks a create (`partial: false`, every required field present) or a patch (`partial: true`, only what is given). Unknown keys are ignored. */
export function validateSubscriptionInput(
  body: unknown,
  partial = false,
): { ok: true; value: Partial<SubscriptionInput> } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'a JSON object is required' };
  const b = body as Record<string, unknown>;
  const out: Partial<SubscriptionInput> = {};
  const has = (k: string) => b[k] !== undefined;

  if (!partial || has('name')) {
    if (typeof b.name !== 'string' || !b.name.trim() || b.name.trim().length > 120) return { ok: false, error: 'name is required (at most 120 characters)' };
    out.name = b.name.trim();
  }
  if (has('enabled')) {
    if (typeof b.enabled !== 'boolean') return { ok: false, error: 'enabled must be true or false' };
    out.enabled = b.enabled;
  }
  if (has('classId')) {
    if (b.classId !== null && (typeof b.classId !== 'string' || !UUID.test(b.classId))) return { ok: false, error: 'classId must be a class id or null (every class)' };
    out.classId = b.classId as string | null;
  }
  if (!partial || has('events')) {
    if (!Array.isArray(b.events) || !b.events.length) return { ok: false, error: 'events is required: a list of event types' };
    const bad = b.events.find((e) => typeof e !== 'string' || !ALL_EVENT_TYPES.includes(e));
    if (bad !== undefined) return { ok: false, error: `unknown event type: ${String(bad).slice(0, 40)}` };
    out.events = [...new Set(b.events as SubscriptionInput['events'])];
  }
  for (const k of ['endpointId', 'routeId'] as const) {
    if (!partial || has(k)) {
      if (typeof b[k] !== 'string' || !UUID.test(b[k] as string)) return { ok: false, error: `${k} is required (a Gateway ${k === 'endpointId' ? 'endpoint' : 'route'} id)` };
      out[k] = b[k] as string;
    }
  }
  if (has('payloadMode')) {
    if (b.payloadMode !== 'minimal') return { ok: false, error: 'payloadMode must be "minimal" (a field allow-list is not available yet)' };
    out.payloadMode = 'minimal';
  }
  if (has('ignoreActors')) {
    if (!Array.isArray(b.ignoreActors) || b.ignoreActors.length > 20 || b.ignoreActors.some((a) => typeof a !== 'string' || !a || a.length > 128)) {
      return { ok: false, error: 'ignoreActors must be a list of at most 20 actor ids' };
    }
    out.ignoreActors = [...new Set(b.ignoreActors as string[])];
  }
  if (has('signingSecretRef')) {
    const ref = b.signingSecretRef;
    if (ref !== null && (typeof ref !== 'string' || !new RegExp(`^${SIGNING_SECRET_PREFIX}[A-Z0-9_]{1,48}$`).test(ref))) {
      return { ok: false, error: `signingSecretRef must be null or the name of an environment variable like ${SIGNING_SECRET_PREFIX}ENGINE` };
    }
    out.signingSecretRef = ref as string | null;
  }
  // A class applies to data objects only: a subscription for one class that lists a file or page type would never receive it
  if (out.classId && out.events?.some((e) => CLASSLESS_EVENT_TYPES.includes(e))) {
    return { ok: false, error: 'a class applies to object events only: remove the class, or list only object events' };
  }
  return { ok: true, value: out };
}

// ---- loop guard (docs/plans/automations/object-events-loop-guard.md, layers A and B) ----

/** The header an API client sends on a write to say "this is the result of a flow, start nothing because of it". */
export const END_OF_FLOW_HEADER = 'x-whoobe-flow';

/** True when the value of the `X-Whoobe-Flow` header means "stop" (any other value, or none, is an ordinary write). */
export function isEndOfFlow(headerValue: unknown): boolean {
  const v = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return typeof v === 'string' && v.trim().toLowerCase() === 'stop';
}

export interface LoopLimits {
  /** Events by one API client on one record within the window before the next one is stopped (0 = guard off). */
  perActor: number;
  /** Events by API clients on one record, delivered to one subscription, within the window (0 = off): catches two flows answering each other. */
  perSubscription: number;
  windowSeconds: number;
}

const DEFAULT_LIMITS: LoopLimits = { perActor: 5, perSubscription: 12, windowSeconds: 60 };

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

/** `OBJECT_EVENTS_LOOP_MAX`, `OBJECT_EVENTS_LOOP_SUB_MAX`, `OBJECT_EVENTS_LOOP_WINDOW_SECONDS`; `OBJECT_EVENTS_LOOP_MAX=0` and `..._SUB_MAX=0` switch a counter off. */
export function loopLimits(): LoopLimits {
  const windowSeconds = envInt('OBJECT_EVENTS_LOOP_WINDOW_SECONDS', DEFAULT_LIMITS.windowSeconds);
  return {
    perActor: envInt('OBJECT_EVENTS_LOOP_MAX', DEFAULT_LIMITS.perActor),
    perSubscription: envInt('OBJECT_EVENTS_LOOP_SUB_MAX', DEFAULT_LIMITS.perSubscription),
    windowSeconds: windowSeconds > 0 ? windowSeconds : DEFAULT_LIMITS.windowSeconds,
  };
}

/** Only an API client can loop: people editing together, the system and imports are never counted. */
export function countsForLoopGuard(actor: EventActor): boolean {
  return actor.type === 'api-client' && !!actor.id;
}

/** Why a delivery must not be sent, or null. `byActor` / `bySubscription`: events already stored in the window (not counting this one). */
export function loopVerdict(counts: { byActor: number; bySubscription: number }, limits: LoopLimits): string | null {
  if (limits.perActor > 0 && counts.byActor >= limits.perActor) {
    return `loop guard: more than ${limits.perActor} events by this API client on this record within ${limits.windowSeconds} s`;
  }
  if (limits.perSubscription > 0 && counts.bySubscription >= limits.perSubscription) {
    return `loop guard: more than ${limits.perSubscription} events by API clients on this record for this subscription within ${limits.windowSeconds} s`;
  }
  return null;
}

export const END_OF_FLOW_REASON = 'end of flow: the write carried X-Whoobe-Flow: stop';
