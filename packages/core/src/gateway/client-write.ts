// What an API client may write into a Data Object (docs/plans/api-gateway/client-access-hub.md, section 15). Pure functions, no I/O.
// A client creates drafts and changes drafts, nothing more: it never sets `published`, the workflow state, the folder or the parent, and
// it never sees a field the Data Class does not define (an unknown field is an error, not silently dropped).

import { z } from 'zod';
import { sanitizeRichText } from '@whoobe-cms/schema';
import { compileDynamicSchema, type ClassFieldDefinition } from '../schema/dynamic.js';

export interface ClientWrite { key?: string; locale?: string; attributes: Record<string, unknown> }

const LOCALE = /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})?$/;
const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function firstIssues(error: z.ZodError): string {
  return error.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'attributes'}: ${i.message}`).join('; ');
}

/**
 * `create`: body `{ key?, locale?, attributes }`, every mandatory field present. `update`: body `{ attributes }` with only the fields to
 * change (`null` clears an optional field); `key` and `locale` cannot be changed. Rich text (wysiwyg) fields are cleaned of script.
 */
export function validateClientWrite(
  mode: 'create' | 'update', className: string, fields: readonly ClassFieldDefinition[], body: unknown,
): { ok: true; write: ClientWrite } | { ok: false; error: string } {
  if (!isPlainObject(body)) return { ok: false, error: 'Send a JSON object: { "attributes": { ... } }' };
  const allowed = mode === 'create' ? ['attributes', 'key', 'locale'] : ['attributes'];
  for (const k of Object.keys(body)) {
    if (!allowed.includes(k)) {
      return { ok: false, error: mode === 'update' && (k === 'key' || k === 'locale') ? `${k} cannot be changed` : `Unknown property: ${k.slice(0, 40)}` };
    }
  }
  if (!isPlainObject(body.attributes)) return { ok: false, error: 'attributes must be an object' };
  if (mode === 'update' && !Object.keys(body.attributes).length) return { ok: false, error: 'attributes is empty: nothing to change' };

  const base = compileDynamicSchema({ id: '', name: className, fields: [...fields] }) as unknown as z.ZodObject;
  const schema = mode === 'update' ? base.partial().strict() : base.strict();
  const parsed = schema.safeParse(body.attributes);
  if (!parsed.success) return { ok: false, error: firstIssues(parsed.error) };
  const attributes = parsed.data as Record<string, unknown>;
  for (const f of fields) {
    if (f.fieldType === 'wysiwyg' && typeof attributes[f.name] === 'string') attributes[f.name] = sanitizeRichText(attributes[f.name]);
  }

  const write: ClientWrite = { attributes };
  if (mode === 'create') {
    if (body.key !== undefined) {
      if (typeof body.key !== 'string' || !body.key.trim() || body.key.length > 120 || /[\u0000-\u001f/\\]/.test(body.key)) {
        return { ok: false, error: 'key must be text of 1 to 120 characters, without "/" or control characters' };
      }
      write.key = body.key.trim();
    }
    if (body.locale !== undefined) {
      if (typeof body.locale !== 'string' || !LOCALE.test(body.locale)) return { ok: false, error: 'Invalid locale' };
      write.locale = body.locale;
    }
  }
  return { ok: true, write };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every `assetId` anywhere in the written values (also inside lists and blocks), so none can link a file the client may not read. */
export function writtenAssetIds(value: unknown, found: Set<string> = new Set(), depth = 0): Set<string> {
  if (depth > 12) return found;
  if (Array.isArray(value)) { for (const v of value) writtenAssetIds(v, found, depth + 1); return found; }
  if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'assetId') { if (typeof v === 'string') found.add(UUID.test(v) ? v.toLowerCase() : v); }
      else writtenAssetIds(v, found, depth + 1);
    }
  }
  return found;
}
