// File upload in forms, the core-api side (docs/plans/forms/form-upload-plan.md): which Upload fields authors put in pages (a
// visitor's request is only honoured for those), the "intent" that approves one file and returns the ticket, and the step that
// turns the uploads a submitted form refers to into library assets.
import { collectAuthoredUploadFields, type AuthoredUploadField } from '@whoobe-cms/core';

export function createAuthoredUploadFieldsCache(load: () => Promise<Iterable<{ content: unknown; websiteId: string | null }>>, ttlMs = 30_000, now: () => number = Date.now) {
  let found: Map<string, AuthoredUploadField> | null = null;
  let loadedAt = 0;
  const fresh = async () => {
    if (!found || now() - loadedAt > ttlMs) {
      found = collectAuthoredUploadFields(await load());
      loadedAt = now();
    }
    return found;
  };
  return {
    async lookup(fieldId: string): Promise<AuthoredUploadField | null> { return (await fresh()).get(fieldId) ?? null; },
    /** The upload fields of the forms that write to one data class, by attribute name (the first one wins). */
    async forClass(classId: string): Promise<Map<string, AuthoredUploadField>> {
      const out = new Map<string, AuthoredUploadField>();
      for (const f of (await fresh()).values()) if (f.targetClassId === classId && !out.has(f.name)) out.set(f.name, f);
      return out;
    },
    clear(): void { found = null; },
  };
}

/** Where the browser sends the bytes: the asset service. Behind the reverse proxy that is the same host as the page's API; in
 *  development the services have their own ports, so UPLOAD_PUBLIC_BASE_URL (or the usual localhost:3002) is used. */
export function uploadBaseUrl(req: { protocol: string; get(name: string): string | undefined }, env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.UPLOAD_PUBLIC_BASE_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost';
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const m = /^(localhost|127\.0\.0\.1)(:\d+)?$/.exec(host);
  return m ? `${proto}://${m[1]}:3002` : `${proto}://${host}`;
}

export class SubmitUploadError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
