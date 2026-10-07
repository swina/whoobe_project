// Reference handling for website bundles (export/import). Pure functions over JSON values: no database, no I/O.
//
// A page, a snippet, a template layout, a menu or a data object refers to other things by UUID (page ids in a template
// slot, `sourceSnippetId`, `dataBinding.objectId`, `{ assetId }`, relation ids ...) or, for assets, by their DAM path
// (`image.url`). The shapes are many and grow with the editor, so nothing here knows them: every string is looked at,
// and a string that is (or contains) a known id or path is followed or rewritten.

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_G = new RegExp(UUID, 'gi');
const DAM_PROXY_G = /\/dam-asset\/([^"'\s)<>\\]+)/g;

/** Calls `fn` for every string in the value, however deep (object keys are not visited). */
export function walkStrings(value: unknown, fn: (s: string) => void): void {
  if (typeof value === 'string') { fn(value); return; }
  if (Array.isArray(value)) { for (const v of value) walkStrings(v, fn); return; }
  if (value && typeof value === 'object') { for (const v of Object.values(value)) walkStrings(v, fn); }
}

/** A copy of the value with every string replaced by `fn(string)`; other values are kept as they are. */
export function mapStrings<T>(value: T, fn: (s: string) => string): T {
  if (typeof value === 'string') return fn(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = mapStrings(v, fn);
    return out as T;
  }
  return value;
}

/** Every UUID that appears in a string of the value, lower-cased, whether the string is the id or contains it. */
export function collectUuids(value: unknown): Set<string> {
  const ids = new Set<string>();
  walkStrings(value, (s) => { for (const m of s.match(UUID_G) ?? []) ids.add(m.toLowerCase()); });
  return ids;
}

/** A copy of the value in which every UUID found in `idMap` is replaced by its new value. Unknown UUIDs stay. */
export function rewriteIds<T>(value: T, idMap: ReadonlyMap<string, string>): T {
  if (idMap.size === 0) return value;
  return mapStrings(value, (s) => s.replace(UUID_G, (m) => idMap.get(m.toLowerCase()) ?? m));
}

/** `className` of every `dataBinding` in the value (an element tree, a snippet node, a layout). */
export function collectDataBindingClassNames(value: unknown): Set<string> {
  const names = new Set<string>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (!v || typeof v !== 'object') return;
    const rec = v as Record<string, unknown>;
    const b = rec.dataBinding as { className?: unknown } | null | undefined;
    if (b && typeof b.className === 'string' && b.className) names.add(b.className);
    Object.values(rec).forEach(walk);
  };
  walk(value);
  return names;
}

/** `{ id }` / `{ assetId }` style references are covered by collectUuids; this finds the path-style ones. */
export interface AssetLookup {
  /** DAM path ("/uploads/hero.jpg") -> asset id */
  byPath: ReadonlyMap<string, string>;
  /** S3 key without the leading slash ("uploads/hero.jpg") -> asset id, for `/dam-asset/<key>` URLs */
  byKey: ReadonlyMap<string, string>;
}

/** Asset ids referred to by path, either as a whole string ("/uploads/hero.jpg") or as a `/dam-asset/<key>` URL. */
export function collectAssetPathRefs(value: unknown, lookup: AssetLookup): Set<string> {
  const ids = new Set<string>();
  walkStrings(value, (s) => {
    const whole = lookup.byPath.get(s);
    if (whole) ids.add(whole);
    if (s.includes('/dam-asset/')) {
      for (const m of s.matchAll(DAM_PROXY_G)) {
        let key = m[1].split('?')[0];
        try { key = decodeURIComponent(key); } catch { /* keep as is */ }
        const id = lookup.byKey.get(key) ?? lookup.byKey.get(key.replace(/^[^/]+\//, ''));
        if (id) ids.add(id);
      }
    }
  });
  return ids;
}

const stripSlash = (p: string): string => p.replace(/^\/+/, '');

/** A copy of the value where a string equal to an old DAM path becomes the new one, and so does the key inside a
 *  `/dam-asset/<key>` URL. Used when an asset had to be stored under another path than the one it had. */
export function rewriteAssetPaths<T>(value: T, pathMap: ReadonlyMap<string, string>): T {
  if (pathMap.size === 0) return value;
  const keyMap = new Map([...pathMap].map(([from, to]) => [stripSlash(from), stripSlash(to)]));
  return mapStrings(value, (s) => {
    const whole = pathMap.get(s);
    if (whole) return whole;
    if (!s.includes('/dam-asset/')) return s;
    return s.replace(DAM_PROXY_G, (full, key: string) => {
      const [bare, query] = key.split('?');
      let decoded = bare;
      try { decoded = decodeURIComponent(bare); } catch { /* keep as is */ }
      const to = keyMap.get(decoded);
      return to ? `/dam-asset/${to.split('/').map(encodeURIComponent).join('/')}${query ? `?${query}` : ''}` : full;
    });
  });
}

/** `/a/b.png` -> `/a/b-imported.png` (and `-imported-2`, ...) until the path is not in `taken`. */
export function uniqueAssetPath(path: string, taken: ReadonlySet<string>, tag = 'imported'): string {
  const dot = path.lastIndexOf('.');
  const slash = path.lastIndexOf('/');
  const hasExt = dot > slash + 1;
  const stem = hasExt ? path.slice(0, dot) : path;
  const ext = hasExt ? path.slice(dot) : '';
  let candidate = `${stem}-${tag}${ext}`;
  for (let n = 2; taken.has(candidate); n++) candidate = `${stem}-${tag}-${n}${ext}`;
  return candidate;
}
