import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// HTTP mail providers as data. A provider is a JSON file that says how to turn one message into one HTTP request
// (url, headers, body with {{placeholders}}) and how to read the answer; one generic executor (http-transport.ts) runs
// any of them. Adding a service that has an API instead of SMTP is a file, not a release - the same idea as the
// gateway's vendor presets (apps/gateway/presets).

export interface MailProviderField {
  name: string;
  label: string;
  required?: boolean;
  /** stored encrypted, never returned to the browser, blank on edit = keep the stored value */
  secret?: boolean;
  help?: string;
}

export interface MailProviderCondition {
  path: string;
  equals?: unknown;
  /** true: fails when the value is a non-empty string / array / object */
  nonEmpty?: boolean;
  exists?: boolean;
}

export interface MailProviderDefinition {
  id: string;
  label: string;
  description?: string;
  docsUrl?: string;
  configFields: MailProviderField[];
  request: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  };
  success?: {
    /** HTTP statuses that count as accepted (default: any 2xx) */
    status?: number[];
    /** conditions on the JSON answer that make an accepted status a failure after all */
    failWhen?: MailProviderCondition[];
    /** dot path of the provider's id for the message, kept in the mail log */
    reference?: string;
    /** dot path(s) read for the error message when it failed */
    errorFrom?: string[];
  };
  retry?: { on: number[]; max: number; maxWaitSeconds?: number };
  capabilities?: { html?: boolean; text?: boolean; attachments?: boolean; cc?: boolean; bccMax?: number };
}

/** Why a definition was refused (for the log and the tests); `null` = fine. */
export function validateProvider(def: unknown): string | null {
  const d = def as Partial<MailProviderDefinition> | null;
  if (!d || typeof d !== 'object') return 'not an object';
  if (typeof d.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(d.id)) return 'id must be lower-case letters, digits and hyphens';
  if (d.id === 'smtp') return '"smtp" is built in';
  if (typeof d.label !== 'string' || !d.label.trim()) return 'label is missing';
  if (!Array.isArray(d.configFields)) return 'configFields must be a list';
  for (const f of d.configFields) if (!f || typeof f.name !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/.test(f.name) || typeof f.label !== 'string') return 'every config field needs a name (letters and digits) and a label';
  const r = d.request;
  if (!r || typeof r.method !== 'string' || typeof r.url !== 'string') return 'request.method and request.url are required';
  // the host is the provider's and fixed in the file: no placeholder may decide where a message (and the key) goes
  const host = /^https:\/\/([^/?#]*)/i.exec(r.url);
  if (!host) return 'request.url must be an https URL';
  if (host[1].includes('{{')) return 'request.url must not use a placeholder in its host';
  try { new URL(r.url.replace(/\{\{[^}]*\}\}/g, 'x')); } catch { return 'request.url is not a valid URL'; }
  return null;
}

const __dirname = fileURLToPath(new URL('.', import.meta.url));
// dist/mail/ -> packages/core/mail-providers (and src/mail/ when run from source)
const BUILTIN_DIR = resolve(__dirname, '..', '..', 'mail-providers');

function listJson(dirs: string[]): { path: string; stamp: string }[] {
  const out: { path: string; stamp: string }[] = [];
  for (const dir of dirs) {
    let names: string[];
    try { names = readdirSync(dir).sort(); } catch { continue; }
    for (const n of names) {
      if (!n.endsWith('.json')) continue;
      const path = join(dir, n);
      try { const st = statSync(path); if (st.isFile()) out.push({ path, stamp: `${st.mtimeMs}:${st.size}` }); } catch { /* gone */ }
    }
  }
  return out;
}

function read(files: { path: string }[], onSkip?: (path: string, why: string) => void): MailProviderDefinition[] {
  const byId = new Map<string, MailProviderDefinition>();
  for (const { path } of files) {
    try {
      const def = JSON.parse(readFileSync(path, 'utf-8'));
      const why = validateProvider(def);
      if (why) { onSkip?.(path, why); continue; }
      // a later folder (MAIL_PROVIDERS_PATH) replaces a built-in provider with the same id
      byId.set(def.id, def as MailProviderDefinition);
    } catch (e) {
      onSkip?.(path, e instanceof Error ? e.message : String(e));
    }
  }
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function loadMailProviders(extraPath?: string, onSkip?: (path: string, why: string) => void): MailProviderDefinition[] {
  return read(listJson([BUILTIN_DIR, ...(extraPath ? [resolve(extraPath)] : [])]), onSkip);
}

/** The providers as a function to call per use: the folders are looked at every time (one stat per file) and the files
 *  are read again only when one changed, so a provider added to MAIL_PROVIDERS_PATH needs no restart. */
export function createMailProviderSource(extraPath: string | undefined = process.env.MAIL_PROVIDERS_PATH, onSkip?: (path: string, why: string) => void) {
  const dirs = [BUILTIN_DIR, ...(extraPath ? [resolve(extraPath)] : [])];
  let signature = '';
  let cached: MailProviderDefinition[] = [];
  const all = (): MailProviderDefinition[] => {
    const files = listJson(dirs);
    const next = files.map((f) => `${f.path}|${f.stamp}`).join('\n');
    if (next !== signature) { cached = read(files, onSkip); signature = next; }
    return cached;
  };
  return { all, get: (id: string) => all().find((p) => p.id === id) };
}
