import { createHash } from 'node:crypto';
import { and, eq, inArray, lt, isNotNull, or, sql } from 'drizzle-orm';
import { getDb } from './client.js';
import { dataObjects } from './data-objects-schema.js';
import { dataClasses } from './data-classes-schema.js';
import { deleteDataObject, type WriteOptions } from './data-objects-records.js';
import { formUploads } from './form-uploads-schema.js';
import { mailLog } from './mail-log-schema.js';
import { users } from './auth-schema.js';
import { getAssetsByIds } from './asset-records.js';
import { getSecuritySettings } from './security-settings-records.js';

// Everything held about one person, found, exported and erased by one identifier (docs/plans/system/data-subject-plan.md).

export interface IdentifierOk { ok: true; value: string; fingerprint: string }
export type IdentifierResult = IdentifierOk | { ok: false; error: string };

/** Trimmed and lower-cased. Matching is always the whole value, so no wildcard exists; a value too short to mean anything is refused. */
export function normalizeIdentifier(raw: unknown): IdentifierResult {
  if (typeof raw !== 'string') return { ok: false, error: 'identifier must be text' };
  const value = raw.trim().toLowerCase();
  if (value.length < 3 || value.length > 320) return { ok: false, error: 'identifier must be 3 to 320 characters' };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(value)) return { ok: false, error: 'identifier must not contain control characters' };
  return { ok: true, value, fingerprint: identifierFingerprint(value) };
}

/** What the audit log keeps instead of the identifier: enough to tell two requests apart, nothing that gives the person away. */
export const identifierFingerprint = (normalized: string): string => createHash('sha256').update(normalized).digest('hex').slice(0, 12);

const escapeRegex = (v: string): string => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The identifier as a word of its own inside a text: not the tail of a longer address (`joann@x.org` is not `ann@x.org`), and a full stop
 *  that ends a sentence does not hide it. Postgres regular expression, applied to a lower-cased text. */
export function identifierRegex(normalized: string): string {
  const id = escapeRegex(normalized);
  return `(^|[^a-z0-9._%+@-])${id}($|[^a-z0-9_%+@.-]|\\.($|[^a-z0-9]))`;
}

export interface SubjectOptions {
  /** only look in objects of these classes */
  classIds?: string[];
  /** also find the identifier inside the subject and body of mails (default true); the recipient is always looked at */
  includeMailBodies?: boolean;
  limit?: number;
}

export interface ObjectMatch { id: string; classId: string; className: string; key: string; locale: string; published: boolean; createdAt: Date; fields: string[] }
export interface MailMatch { id: string; to: string; subject: string; status: string; sentAt: Date; matchedIn: 'recipient' | 'content' }
export interface UploadMatch { id: string; submissionId: string; assetId: string | null; originalName: string; size: number | null; status: string }
export interface StaffMatch { id: string; email: string; displayName: string; isActive: boolean }
export interface SubjectMatches { objects: ObjectMatch[]; mail: MailMatch[]; uploads: UploadMatch[]; staff: StaffMatch[] }

const MAX_ROWS = 2000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every text in a JSON value that looks like an id (`{assetId}`, a list of asset ids, a nested relation). */
export function idsIn(value: unknown, out: Set<string> = new Set(), depth = 0): Set<string> {
  if (depth > 8) return out;
  if (typeof value === 'string') { if (UUID.test(value)) out.add(value.toLowerCase()); }
  else if (Array.isArray(value)) value.forEach((v) => idsIn(v, out, depth + 1));
  else if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach((v) => idsIn(v, out, depth + 1));
  return out;
}

/** The files a visitor sent through a form that belong to these objects: the upload rows whose library asset the object refers to (or that name the
 *  object as their submission). Only form uploads count: a picture an editor chose from the library is not the visitor's and is never deleted. */
async function uploadsOfObjects(objectIds: string[]): Promise<(typeof formUploads.$inferSelect & { objectId: string })[]> {
  if (!objectIds.length) return [];
  const db = getDb();
  const rows = await db.select({ id: dataObjects.id, attributes: dataObjects.attributes }).from(dataObjects).where(inArray(dataObjects.id, objectIds));
  const idsByObject = new Map(rows.map((r) => [r.id, idsIn(r.attributes)]));
  const all = new Set<string>();
  idsByObject.forEach((ids) => ids.forEach((i) => all.add(i)));
  const found = await db.select().from(formUploads).where(or(inArray(formUploads.submissionId, objectIds), all.size ? inArray(formUploads.assetId, [...all]) : undefined));
  const out: (typeof formUploads.$inferSelect & { objectId: string })[] = [];
  for (const u of found) {
    const owner = (u.submissionId && idsByObject.has(u.submissionId) ? u.submissionId : undefined)
      ?? objectIds.find((id) => u.assetId && idsByObject.get(id)?.has(u.assetId.toLowerCase()));
    if (owner) out.push({ ...u, objectId: owner });
  }
  return out;
}

/** Every string anywhere in `attributes` equal to the identifier, per top-level field: the names of the fields that hold it. */
export async function findDataSubject(identifier: string, opts: SubjectOptions = {}): Promise<SubjectMatches> {
  const db = getDb();
  const limit = Math.min(opts.limit ?? MAX_ROWS, MAX_ROWS);
  const classFilter = opts.classIds?.length ? sql`AND o.class_id IN (${sql.join(opts.classIds.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``;

  const objectRows = await db.execute(sql`
    SELECT * FROM (
      SELECT o.id, o.class_id, c.name AS class_name, o.key, o.locale, o.published, o.created_at,
        ARRAY(
          SELECT e.key FROM jsonb_each(o.attributes) AS e(key, value)
          WHERE EXISTS (SELECT 1 FROM jsonb_path_query(e.value, 'strict $.**') AS v
                        WHERE jsonb_typeof(v) = 'string' AND lower(v #>> '{}') = ${identifier})
        ) AS fields
      FROM data_objects o JOIN data_classes c ON c.id = o.class_id
      WHERE true ${classFilter}
    ) t WHERE cardinality(t.fields) > 0
    ORDER BY t.created_at DESC LIMIT ${limit}`);
  const objects: ObjectMatch[] = (objectRows.rows as any[]).map((r) => ({
    id: r.id, classId: r.class_id, className: r.class_name, key: r.key, locale: r.locale, published: r.published, createdAt: new Date(r.created_at), fields: r.fields,
  }));

  const re = identifierRegex(identifier);
  const withBodies = opts.includeMailBodies !== false;
  const mailRows = await db.execute(sql`
    SELECT id, "to", subject, status, sent_at,
      CASE WHEN lower("to") ~ ${re} OR lower(coalesce(cc, '')) ~ ${re} THEN 'recipient' ELSE 'content' END AS matched_in
    FROM mail_log
    WHERE lower("to") ~ ${re} OR lower(coalesce(cc, '')) ~ ${re}
      ${withBodies ? sql`OR lower(subject || ' ' || coalesce(html, '') || ' ' || coalesce(text, '')) ~ ${re}` : sql``}
    ORDER BY sent_at DESC LIMIT ${limit}`);
  const mail: MailMatch[] = (mailRows.rows as any[]).map((r) => ({ id: r.id, to: r.to, subject: r.subject, status: r.status, sentAt: new Date(r.sent_at), matchedIn: r.matched_in }));

  const uploads: UploadMatch[] = (await uploadsOfObjects(objects.map((o) => o.id))).map((u) => ({
    id: u.id, submissionId: u.objectId, assetId: u.assetId, originalName: u.originalName, size: u.size, status: u.status,
  }));

  const staff = (await db.select({ id: users.id, email: users.email, displayName: users.displayName, isActive: users.isActive }).from(users).where(eq(users.email, identifier)));
  return { objects, mail, uploads, staff };
}

export interface SubjectExport {
  generatedAt: string;
  /** what was searched for is NOT repeated here: the file is the person's own data, kept by whoever asked for it */
  objects: { id: string; class: string; key: string; locale: string; published: boolean; createdAt: string; attributes: Record<string, unknown> }[];
  mail: { id: string; to: string; from: string | null; cc: string | null; subject: string; text: string | null; html: string | null; status: string; sentAt: string }[];
  files: { uploadId: string; submissionId: string; originalName: string; size: number | null; assetId: string | null; libraryPath: string | null; mimeType: string | null }[];
  staffAccounts: StaffMatch[];
}

/** The records themselves, for a request of access or portability. The files are listed with where they are in the library, not inlined. */
export async function exportDataSubject(identifier: string, opts: SubjectOptions = {}): Promise<SubjectExport> {
  const db = getDb();
  const found = await findDataSubject(identifier, opts);
  const objects = found.objects.length
    ? await db.select().from(dataObjects).where(inArray(dataObjects.id, found.objects.map((o) => o.id)))
    : [];
  const classNames = new Map(found.objects.map((o) => [o.classId, o.className]));
  const mailRows = found.mail.length ? await db.select().from(mailLog).where(inArray(mailLog.id, found.mail.map((m) => m.id))) : [];
  const assets = await getAssetsByIds(found.uploads.map((u) => u.assetId).filter((v): v is string => !!v));
  const assetById = new Map(assets.map((a) => [a.id, a]));
  return {
    generatedAt: new Date().toISOString(),
    objects: objects.map((o) => ({ id: o.id, class: classNames.get(o.classId) ?? o.classId, key: o.key, locale: o.locale, published: o.published, createdAt: o.createdAt.toISOString(), attributes: o.attributes })),
    mail: mailRows.map((m) => ({ id: m.id, to: m.to, from: m.from, cc: m.cc, subject: m.subject, text: m.text, html: m.html, status: m.status, sentAt: m.sentAt.toISOString() })),
    files: found.uploads.map((u) => {
      const a = u.assetId ? assetById.get(u.assetId) : undefined;
      return { uploadId: u.id, submissionId: u.submissionId, originalName: u.originalName, size: u.size, assetId: u.assetId, libraryPath: a?.pimcorePath ?? null, mimeType: a?.mimeType ?? null };
    }),
    staffAccounts: found.staff,
  };
}

export interface EraseDeps {
  /** Deletes one file of the library (the asset service). A file that is already gone is a success; any other failure throws. */
  deleteAsset: (assetId: string) => Promise<void>;
  write?: WriteOptions;
}

export interface EraseFailure { objectId: string; reason: string }
export interface EraseResult { objectsDeleted: number; filesDeleted: number; uploadRowsDeleted: number; failures: EraseFailure[] }

/** Deletes objects with their uploaded files. Files FIRST: an object whose file cannot be deleted stays (and is reported), so a retry finishes
 *  the job and no file is left in the library without an object to explain it. */
export async function eraseObjectsWithFiles(objectIds: string[], deps: EraseDeps): Promise<EraseResult> {
  const db = getDb();
  const result: EraseResult = { objectsDeleted: 0, filesDeleted: 0, uploadRowsDeleted: 0, failures: [] };
  for (const id of objectIds) {
    const uploads = (await uploadsOfObjects([id]));
    let failed: string | null = null;
    let filesHere = 0;
    for (const u of uploads) {
      if (!u.assetId) continue;
      try { await deps.deleteAsset(u.assetId); filesHere += 1; } catch (e) { failed = `the file "${u.originalName}" could not be deleted: ${(e as Error).message}`; break; }
    }
    if (failed) { result.failures.push({ objectId: id, reason: failed }); continue; }
    if (uploads.length) result.uploadRowsDeleted += (await db.delete(formUploads).where(inArray(formUploads.id, uploads.map((u) => u.id))).returning({ id: formUploads.id })).length;
    await deleteDataObject(id, deps.write ?? {});
    result.objectsDeleted += 1;
    result.filesDeleted += filesHere;
  }
  return result;
}

export interface SubjectErasure extends EraseResult {
  dryRun: boolean;
  mailDeleted: number;
  matched: { objects: number; mail: number; files: number; staff: number };
}

/** Finds what the identifier matches and, unless `dryRun`, deletes it. The staff accounts it finds are reported, never deleted here. */
export async function eraseDataSubject(identifier: string, opts: SubjectOptions & { dryRun: boolean; include?: { objects?: boolean; mail?: boolean } }, deps: EraseDeps): Promise<SubjectErasure> {
  const found = await findDataSubject(identifier, opts);
  const includeObjects = opts.include?.objects !== false;
  const includeMail = opts.include?.mail !== false;
  const matched = { objects: found.objects.length, mail: found.mail.length, files: found.uploads.filter((u) => u.assetId).length, staff: found.staff.length };
  if (opts.dryRun) return { dryRun: true, objectsDeleted: 0, filesDeleted: 0, uploadRowsDeleted: 0, mailDeleted: 0, failures: [], matched };

  const erased = includeObjects ? await eraseObjectsWithFiles(found.objects.map((o) => o.id), deps) : { objectsDeleted: 0, filesDeleted: 0, uploadRowsDeleted: 0, failures: [] };
  const mailDeleted = includeMail && found.mail.length
    ? (await getDb().delete(mailLog).where(inArray(mailLog.id, found.mail.map((m) => m.id))).returning({ id: mailLog.id })).length
    : 0;
  return { dryRun: false, ...erased, mailDeleted, matched };
}

// ── retention ───────────────────────────────────────────────────────────────

export interface RetentionClassResult { classId: string; className: string; days: number; deleted: number; failed: number }
export interface RetentionResult { classes: RetentionClassResult[]; mailDeleted: number }

const RETENTION_BATCH = 200;
const RETENTION_MAX_BATCHES = 100;   // a backlog is worked off over several runs, never in one endless one

/** Deletes the objects older than their class's `retention_days` (by creation, whatever their status; files first) and the mail log rows older
 *  than `mail_log_retention_days`. Classes and settings without a number are left alone. */
export async function purgeExpiredData(deps: EraseDeps, now: Date = new Date()): Promise<RetentionResult> {
  const db = getDb();
  const out: RetentionResult = { classes: [], mailDeleted: 0 };
  const classes = await db.select({ id: dataClasses.id, name: dataClasses.name, days: dataClasses.retentionDays }).from(dataClasses).where(isNotNull(dataClasses.retentionDays));
  for (const c of classes) {
    const cutoff = new Date(now.getTime() - c.days! * 86_400_000);
    const r: RetentionClassResult = { classId: c.id, className: c.name, days: c.days!, deleted: 0, failed: 0 };
    for (let i = 0; i < RETENTION_MAX_BATCHES; i++) {
      const ids = (await db.select({ id: dataObjects.id }).from(dataObjects).where(and(eq(dataObjects.classId, c.id), lt(dataObjects.createdAt, cutoff))).limit(RETENTION_BATCH)).map((x) => x.id);
      if (!ids.length) break;
      const e = await eraseObjectsWithFiles(ids, deps);
      r.deleted += e.objectsDeleted;
      r.failed += e.failures.length;
      if (e.objectsDeleted === 0) break;   // nothing could be deleted: do not spin on the same rows
    }
    if (r.deleted || r.failed) out.classes.push(r);
  }

  const { mailLogRetentionDays } = await getSecuritySettings();
  if (mailLogRetentionDays) {
    const cutoff = new Date(now.getTime() - mailLogRetentionDays * 86_400_000);
    for (let i = 0; i < RETENTION_MAX_BATCHES; i++) {
      const gone = await db.execute(sql`DELETE FROM mail_log WHERE id IN (SELECT id FROM mail_log WHERE sent_at < ${cutoff.toISOString()} LIMIT ${RETENTION_BATCH}) RETURNING id`);
      out.mailDeleted += gone.rows.length;
      if (gone.rows.length < RETENTION_BATCH) break;
    }
  }
  return out;
}
