// The Upload fields that authors put in forms. A visitor's request names a field by id; what counts is the field as it is in a
// page of a website (the same rule as the notify blocks of form-notify.ts): the website it belongs to, the data class its form
// writes to, the name of the attribute, and the field's own (narrowing) settings.
import { normalizeUploadLimits, type UploadLimits } from './limits.js';

/** The settings of one Upload field, kept on its node as `uploadConfig`. They can only narrow what the website allows. */
export interface UploadFieldConfig {
  /** a subset of the website's allowed types */
  extensions?: string[];
  /** at most this many files in the field (never above the website's) */
  maxFiles?: number;
  /** a folder of the library to put this field's files in */
  targetFolder?: string;
}

export interface AuthoredUploadField {
  fieldId: string;
  /** attribute name in the submission (the input's `name`) */
  name: string;
  targetClassId: string;
  websiteId: string | null;
  config: UploadFieldConfig;
}

/** Every file input found inside a form (a node with `formConfig`), keyed by the id of the input. */
export function collectAuthoredUploadFields(pages: Iterable<{ content: unknown; websiteId: string | null }>): Map<string, AuthoredUploadField> {
  const found = new Map<string, AuthoredUploadField>();
  for (const page of pages) {
    const walk = (node: unknown, classId: string | null): void => {
      if (Array.isArray(node)) { node.forEach((n) => walk(n, classId)); return; }
      if (!node || typeof node !== 'object') return;
      const rec = node as Record<string, any>;
      const form = rec.formConfig as { enabled?: unknown; targetClassId?: unknown } | null | undefined;
      const here = form && form.enabled !== false && typeof form.targetClassId === 'string' && form.targetClassId ? form.targetClassId : classId;
      const attrs = rec.data?.attributes as Record<string, unknown> | undefined;
      if (here && typeof rec.id === 'string' && rec.element === 'input' && attrs?.type === 'file' && typeof attrs.name === 'string' && attrs.name && !found.has(rec.id)) {
        found.set(rec.id, { fieldId: rec.id, name: attrs.name, targetClassId: here, websiteId: page.websiteId, config: cleanFieldConfig(rec.uploadConfig) });
      }
      for (const v of Object.values(rec)) if (v && typeof v === 'object') walk(v, here);
    };
    walk(page.content, null);
  }
  return found;
}

function cleanFieldConfig(raw: unknown): UploadFieldConfig {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const out: UploadFieldConfig = {};
  if (Array.isArray(o.extensions)) out.extensions = o.extensions.map((e) => String(e).trim().toLowerCase().replace(/^\./, '')).filter(Boolean).slice(0, 40);
  if (typeof o.maxFiles === 'number' && Number.isFinite(o.maxFiles) && o.maxFiles >= 1) out.maxFiles = Math.floor(o.maxFiles);
  if (typeof o.targetFolder === 'string' && o.targetFolder.trim()) out.targetFolder = o.targetFolder.trim();
  return out;
}

/** What applies to one field: the website's limits, narrowed by the field's own. A field can ask for less (fewer types, fewer
 *  files, another folder the website's rules accept), never for more. */
export function effectiveUploadLimits(website: UploadLimits, field: UploadFieldConfig | undefined): UploadLimits {
  if (!field) return website;
  const allowedExtensions = field.extensions && field.extensions.length ? website.allowedExtensions.filter((e) => field.extensions!.includes(e)) : website.allowedExtensions;
  const maxFiles = field.maxFiles ? Math.min(website.maxFiles, field.maxFiles) : website.maxFiles;
  // the folder goes through the same rules as the website's own: private unless the website allows a public one
  const targetFolder = field.targetFolder
    ? normalizeUploadLimits({ ...website, targetFolder: field.targetFolder }).targetFolder
    : website.targetFolder;
  return { ...website, allowedExtensions, maxFiles, targetFolder };
}

/** The upload ids a submission carries for a field: `{uploadId}` or an array of them. Anything else is not a reference. */
export function readUploadRefs(value: unknown): string[] | null {
  const items = Array.isArray(value) ? value : [value];
  const ids: string[] = [];
  for (const item of items) {
    const id = item && typeof item === 'object' ? (item as Record<string, unknown>).uploadId : undefined;
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
    ids.push(id.toLowerCase());
  }
  return ids.length && new Set(ids).size === ids.length ? ids : null;
}

/** Where a file waits between the upload and the submission of its form: private, outside every folder anyone browses. */
export function formUploadStagingKey(websiteId: string, uploadId: string, extension: string): string {
  return `private/_uploads/${websiteId}/${uploadId}.${extension.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
}

/** The path the browser sends the file bytes to (on the asset service), after the ticket. */
export const FORM_UPLOAD_PUT_PATH = '/public/upload-data';
