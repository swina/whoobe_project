// File upload in forms (docs/plans/forms/form-upload-plan.md): the limits a website sets and the checks made on a file
// BEFORE it is accepted. Pure functions, no I/O: the endpoints, the dashboard and the tests all use these.
import { SNIFFABLE_EXTENSIONS } from './sniff.js';

/** Hard ceilings: a website's settings can lower these, never raise them. */
export const UPLOAD_CEILINGS = { maxFileBytes: 25 * 1024 * 1024, maxFiles: 10, dailyBytes: 1024 * 1024 * 1024 } as const;

/** Never accepted, whatever a website allows: active content, scripts and programs. */
export const NEVER_ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set([
  'html', 'htm', 'xhtml', 'shtml', 'svg', 'svgz', 'xml', 'xsl', 'xslt', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'php', 'phtml', 'phar', 'asp', 'aspx',
  'jsp', 'cgi', 'pl', 'py', 'rb', 'sh', 'bash', 'zsh', 'bat', 'cmd', 'com', 'exe', 'dll', 'scr', 'msi', 'jar', 'war', 'apk', 'app',
  'vbs', 'vbe', 'wsf', 'ps1', 'psm1', 'lnk', 'hta', 'swf', 'reg', 'htaccess', 'htpasswd',
]);

export interface UploadLimits {
  enabled: boolean;
  /** lower-case extensions without the dot; only ones the content check knows (see SNIFFABLE_EXTENSIONS) */
  allowedExtensions: string[];
  maxFileBytes: number;
  maxFiles: number;
  dailyBytes: number;
  /** a folder of the asset library; private by default */
  targetFolder: string;
  /** a public target folder is refused unless this is on */
  allowPublicFolder: boolean;
}

export const DEFAULT_UPLOAD_LIMITS: UploadLimits = {
  enabled: false,
  allowedExtensions: [],
  maxFileBytes: 5 * 1024 * 1024,
  maxFiles: 3,
  dailyBytes: 100 * 1024 * 1024,
  targetFolder: 'private/forms',
  allowPublicFolder: false,
};

export function extensionOf(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? '';
  const i = base.lastIndexOf('.');
  return i > 0 && i < base.length - 1 ? base.slice(i + 1).toLowerCase() : '';
}

/** True when the path is inside the library's private area (served only with a session). */
export function isPrivateFolder(folder: string): boolean {
  return /^\/?private(\/|$)/i.test(folder);
}

function cleanFolder(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const parts = raw.trim().replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length === 0 || parts.length > 8) return null;
  if (parts.some((p) => p === '.' || p === '..' || !/^[\w.\- ]{1,64}$/.test(p) || p.startsWith('.'))) return null;
  return parts.join('/');
}

function intIn(raw: unknown, min: number, max: number, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
}

/** Turns whatever is stored in a website's `settings.uploads` into limits that are safe to use: unknown or unsafe values fall back
 *  to the defaults, numbers are clamped to the ceilings, extensions are lower-cased and only the ones that can be verified and are
 *  not active content are kept, and a public folder needs `allowPublicFolder`. */
export function normalizeUploadLimits(raw: unknown): UploadLimits {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const exts = Array.isArray(o.allowedExtensions) ? o.allowedExtensions : [];
  const allowedExtensions = [...new Set(
    exts.map((e) => String(e).trim().toLowerCase().replace(/^\./, '')).filter((e) => SNIFFABLE_EXTENSIONS.has(e) && !NEVER_ALLOWED_EXTENSIONS.has(e)),
  )].sort();
  const allowPublicFolder = o.allowPublicFolder === true;
  let targetFolder = cleanFolder(o.targetFolder) ?? DEFAULT_UPLOAD_LIMITS.targetFolder;
  if (!allowPublicFolder && !isPrivateFolder(targetFolder)) targetFolder = DEFAULT_UPLOAD_LIMITS.targetFolder;
  return {
    enabled: o.enabled === true,
    allowedExtensions,
    maxFileBytes: intIn(o.maxFileBytes, 1, UPLOAD_CEILINGS.maxFileBytes, DEFAULT_UPLOAD_LIMITS.maxFileBytes),
    maxFiles: intIn(o.maxFiles, 1, UPLOAD_CEILINGS.maxFiles, DEFAULT_UPLOAD_LIMITS.maxFiles),
    dailyBytes: intIn(o.dailyBytes, 1, UPLOAD_CEILINGS.dailyBytes, DEFAULT_UPLOAD_LIMITS.dailyBytes),
    targetFolder,
    allowPublicFolder,
  };
}

export type IntentRefusal =
  | { ok: false; reason: 'disabled' | 'name' | 'extension-blocked' | 'extension-not-allowed' | 'empty' | 'too-large' | 'quota'; message: string }
  | { ok: true; extension: string };

/** Judges a file from what the visitor declares, before any byte is sent. The content itself is checked again as it arrives. */
export function checkUploadIntent(limits: UploadLimits, file: { filename: unknown; size: unknown }, usedTodayBytes = 0): IntentRefusal {
  if (!limits.enabled) return { ok: false, reason: 'disabled', message: 'File upload is not enabled for this website' };
  const filename = typeof file.filename === 'string' ? file.filename : '';
  if (!filename || filename.length > 255 || /[\x00-\x1f]/.test(filename)) return { ok: false, reason: 'name', message: 'Invalid file name' };
  // every dot-separated part counts: `invoice.pdf.exe` and `a.php.jpg` are as unwelcome as `a.php`
  const parts = filename.split(/[\\/]/).pop()!.toLowerCase().split('.').slice(1);
  if (parts.some((p) => NEVER_ALLOWED_EXTENSIONS.has(p))) return { ok: false, reason: 'extension-blocked', message: 'This kind of file is not accepted' };
  const extension = extensionOf(filename);
  if (!extension || !limits.allowedExtensions.includes(extension)) {
    return { ok: false, reason: 'extension-not-allowed', message: `Allowed file types: ${limits.allowedExtensions.join(', ') || 'none'}` };
  }
  const size = typeof file.size === 'number' ? file.size : NaN;
  if (!Number.isFinite(size) || size <= 0) return { ok: false, reason: 'empty', message: 'The file is empty' };
  if (size > limits.maxFileBytes) return { ok: false, reason: 'too-large', message: `The file is larger than ${Math.floor(limits.maxFileBytes / 1024 / 1024 * 10) / 10} MB` };
  if (usedTodayBytes + size > limits.dailyBytes) return { ok: false, reason: 'quota', message: 'The daily upload quota of this website is used up' };
  return { ok: true, extension };
}

/** The name a file is stored under: generated, never the visitor's. */
export function storedFileName(uploadId: string, extension: string): string {
  return `${uploadId}.${extension.replace(/[^a-z0-9]/g, '')}`;
}

/** The visitor's file name, cleaned for display and metadata only (never used as a path). */
export function displayFileName(filename: string): string {
  const base = (filename.split(/[\\/]/).pop() ?? '').replace(/[\x00-\x1f\x7f<>:"|?*]/g, '').trim();
  return base.slice(0, 120) || 'file';
}
