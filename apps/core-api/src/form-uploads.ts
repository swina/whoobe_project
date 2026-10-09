// File upload in forms, the core-api side (docs/plans/forms/form-upload-plan.md): which Upload fields authors put in pages (a
// visitor's request is only honoured for those), the "intent" that approves one file and returns the ticket, and the step that
// turns the uploads a submitted form refers to into library assets.
import { collectAuthoredUploadFields, type AuthoredUploadField } from '@whoobe-cms/core';

const MIN_RELOAD_MS = 2_000;

export function createAuthoredUploadFieldsCache(load: () => Promise<Iterable<{ content: unknown; websiteId: string | null }>>, ttlMs = 30_000, now: () => number = Date.now) {
  let found: AuthoredUploadField[] | null = null;
  let loadedAt = 0;
  const fresh = async () => {
    if (!found || now() - loadedAt > ttlMs) {
      found = collectAuthoredUploadFields(await load());
      loadedAt = now();
    }
    return found;
  };
  return {
    /** The field with this id. When several pages carry the same id (a duplicated page), the one of `websiteId` if given and present,
     *  else the first. */
    async lookup(fieldId: string, websiteId?: string | null): Promise<AuthoredUploadField | null> {
      const pick = (list: AuthoredUploadField[]) => {
        const all = list.filter((f) => f.fieldId === fieldId);
        const exact = websiteId ? all.find((f) => f.websiteId === websiteId) : undefined;
        return { exact, any: all[0] ?? null };
      };
      let r = pick(await fresh());
      // Not found (or not for the website asked): the page may have been published a moment ago. Read the pages again, but not more
      // often than every 2 seconds - this is reachable without a login.
      if ((websiteId ? !r.exact : !r.any) && now() - loadedAt > MIN_RELOAD_MS) {
        found = null;
        r = pick(await fresh());
      }
      return r.exact ?? r.any;
    },
    /** The fields of the forms that write to one data class, with the given attribute name (a field per website/page). */
    async forClassAndName(classId: string, name: string): Promise<AuthoredUploadField[]> {
      return (await fresh()).filter((f) => f.targetClassId === classId && f.name === name);
    },
    /** The names of the upload fields of the forms that write to one data class. */
    async namesForClass(classId: string): Promise<string[]> {
      return [...new Set((await fresh()).filter((f) => f.targetClassId === classId).map((f) => f.name))];
    },
    /** Reads the pages again unless they were read less than `ms` ago. */
    async refreshIfOlderThan(ms: number): Promise<void> { if (!found || now() - loadedAt > ms) { found = null; await fresh(); } },
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
